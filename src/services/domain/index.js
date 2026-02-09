/**
 * Elahe Panel - Domain Management Service
 * Auto-subdomain generation, SSL integration, check-host API
 * Developer: EHSANKiNG
 */

const { getDb } = require('../../database');
const { createLogger } = require('../../utils/logger');
const config = require('../../config/default');
const https = require('https');
const http = require('http');

const log = createLogger('DomainService');

// Non-suspicious subdomain names by mode
const SUBDOMAIN_TEMPLATES = {
  iran: [
    { prefix: 'cdn', desc: 'Content Delivery Network' },
    { prefix: 'api', desc: 'API Endpoint' },
    { prefix: 'mail', desc: 'Mail Server' },
    { prefix: 'cloud', desc: 'Cloud Services' },
    { prefix: 'portal', desc: 'Web Portal' },
    { prefix: 'app', desc: 'Application' },
    { prefix: 'data', desc: 'Data Services' },
    { prefix: 'auth', desc: 'Authentication' },
    { prefix: 'static', desc: 'Static Content' },
    { prefix: 'media', desc: 'Media Hosting' },
  ],
  foreign: [
    { prefix: 'ns1', desc: 'Primary Nameserver' },
    { prefix: 'ns2', desc: 'Secondary Nameserver' },
    { prefix: 'api', desc: 'API Endpoint' },
    { prefix: 'dashboard', desc: 'Dashboard' },
    { prefix: 'docs', desc: 'Documentation' },
    { prefix: 'status', desc: 'Status Page' },
    { prefix: 'cdn', desc: 'CDN Endpoint' },
    { prefix: 'resolver', desc: 'DNS Resolver' },
    { prefix: 'analytics', desc: 'Analytics' },
    { prefix: 'support', desc: 'Support Portal' },
  ],
};

class DomainService {
  /**
   * Initialize domain tables
   */
  static initTables() {
    const db = getDb();
    db.exec(`
      CREATE TABLE IF NOT EXISTS domains (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain TEXT UNIQUE NOT NULL,
        type TEXT DEFAULT 'main' CHECK(type IN ('main', 'subdomain')),
        parent_domain TEXT,
        purpose TEXT,
        server_id INTEGER REFERENCES servers(id),
        ssl_status TEXT DEFAULT 'none' CHECK(ssl_status IN ('none', 'self-signed', 'letsencrypt', 'custom')),
        ssl_cert_path TEXT,
        ssl_key_path TEXT,
        ssl_expires_at DATETIME,
        is_accessible_iran INTEGER DEFAULT -1,
        last_check DATETIME,
        status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'blocked')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS domain_checks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain_id INTEGER REFERENCES domains(id),
        check_type TEXT DEFAULT 'http',
        node_location TEXT,
        result TEXT,
        response_time_ms INTEGER,
        checked_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  /**
   * Set main domain for a server
   */
  static setMainDomain(domain, serverId) {
    this.initTables();
    const db = getDb();
    
    try {
      db.prepare(`
        INSERT OR REPLACE INTO domains (domain, type, server_id, purpose)
        VALUES (?, 'main', ?, 'main')
      `).run(domain, serverId);
      
      // Update server config with domain
      db.prepare(`
        UPDATE servers SET config = json_set(COALESCE(config, '{}'), '$.domain', ?) WHERE id = ?
      `).run(domain, serverId);
      
      log.info('Main domain set', { domain, serverId });
      return { success: true, domain };
    } catch (err) {
      log.error('Failed to set domain', { error: err.message });
      return { success: false, error: err.message };
    }
  }

  /**
   * Auto-generate 10 meaningful subdomains
   */
  static generateSubdomains(mainDomain, mode = 'iran', serverId = null) {
    this.initTables();
    const db = getDb();
    const templates = SUBDOMAIN_TEMPLATES[mode] || SUBDOMAIN_TEMPLATES.iran;
    const subdomains = [];
    
    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO domains (domain, type, parent_domain, purpose, server_id)
      VALUES (?, 'subdomain', ?, ?, ?)
    `);
    
    const transaction = db.transaction(() => {
      for (const tmpl of templates) {
        const fullDomain = `${tmpl.prefix}.${mainDomain}`;
        insertStmt.run(fullDomain, mainDomain, tmpl.desc, serverId);
        subdomains.push({
          domain: fullDomain,
          prefix: tmpl.prefix,
          purpose: tmpl.desc,
        });
      }
    });
    
    transaction();
    log.info('Subdomains generated', { count: subdomains.length, mainDomain });
    
    return subdomains;
  }

  /**
   * List all domains
   */
  static listDomains(serverId = null) {
    this.initTables();
    const db = getDb();
    if (serverId) {
      return db.prepare('SELECT * FROM domains WHERE server_id = ? ORDER BY type, domain').all(serverId);
    }
    return db.prepare('SELECT * FROM domains ORDER BY type, domain').all();
  }

  /**
   * Get domain by name
   */
  static getDomain(domain) {
    this.initTables();
    const db = getDb();
    return db.prepare('SELECT * FROM domains WHERE domain = ?').get(domain);
  }

  /**
   * Update domain SSL status
   */
  static updateSSL(domainName, sslStatus, certPath, keyPath, expiresAt) {
    this.initTables();
    const db = getDb();
    db.prepare(`
      UPDATE domains SET ssl_status = ?, ssl_cert_path = ?, ssl_key_path = ?, ssl_expires_at = ?
      WHERE domain = ?
    `).run(sslStatus, certPath, keyPath, expiresAt, domainName);
    
    // Also update settings for auto TLS on user configs
    db.prepare(`
      INSERT OR REPLACE INTO settings (key, value, updated_at)
      VALUES ('ssl.certPath', ?, CURRENT_TIMESTAMP)
    `).run(certPath);
    db.prepare(`
      INSERT OR REPLACE INTO settings (key, value, updated_at)
      VALUES ('ssl.keyPath', ?, CURRENT_TIMESTAMP)
    `).run(keyPath);
    
    return { success: true };
  }

  /**
   * Check domain accessibility using check-host.net API
   */
  static async checkAccessibility(domain) {
    this.initTables();
    
    return new Promise((resolve) => {
      const url = `https://check-host.net/check-http?host=https://${domain}&max_nodes=10`;
      
      const req = https.get(url, {
        headers: { 'Accept': 'application/json' },
        timeout: 10000,
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            const requestId = result.request_id;
            
            if (!requestId) {
              resolve({ success: false, error: 'No request ID received' });
              return;
            }
            
            // Wait and fetch results
            setTimeout(() => {
              this._fetchCheckResults(requestId, domain).then(resolve).catch(err => {
                resolve({ success: false, error: err.message });
              });
            }, 8000);
          } catch (e) {
            resolve({ success: false, error: 'Invalid response from check-host' });
          }
        });
      });
      
      req.on('error', (err) => {
        resolve({ success: false, error: err.message });
      });
      
      req.on('timeout', () => {
        req.destroy();
        resolve({ success: false, error: 'Timeout' });
      });
    });
  }

  /**
   * Fetch check results from check-host.net
   */
  static async _fetchCheckResults(requestId, domain) {
    return new Promise((resolve) => {
      const url = `https://check-host.net/check-result/${requestId}`;
      
      https.get(url, {
        headers: { 'Accept': 'application/json' },
        timeout: 10000,
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const results = JSON.parse(data);
            const db = getDb();
            const domainRow = db.prepare('SELECT id FROM domains WHERE domain = ?').get(domain);
            
            const nodes = {};
            let iranAccessible = true;
            
            for (const [node, result] of Object.entries(results)) {
              if (!result || !result[0]) continue;
              
              const isOk = result[0][0] === 1;
              const responseTime = result[0][1] || null;
              
              nodes[node] = {
                accessible: isOk,
                responseTime,
                status: result[0][3] || null,
              };
              
              // Check if Iran node
              if (node.includes('ir') && !isOk) {
                iranAccessible = false;
              }
              
              // Save to DB
              if (domainRow) {
                db.prepare(`
                  INSERT INTO domain_checks (domain_id, check_type, node_location, result, response_time_ms)
                  VALUES (?, 'http', ?, ?, ?)
                `).run(domainRow.id, node, isOk ? 'accessible' : 'blocked', responseTime ? Math.round(responseTime * 1000) : null);
              }
            }
            
            // Update domain record
            if (domainRow) {
              db.prepare(`
                UPDATE domains SET is_accessible_iran = ?, last_check = CURRENT_TIMESTAMP WHERE id = ?
              `).run(iranAccessible ? 1 : 0, domainRow.id);
            }
            
            resolve({
              success: true,
              domain,
              requestId,
              nodes,
              iranAccessible,
              totalNodes: Object.keys(nodes).length,
            });
          } catch (e) {
            resolve({ success: false, error: 'Failed to parse results' });
          }
        });
      }).on('error', (err) => {
        resolve({ success: false, error: err.message });
      });
    });
  }

  /**
   * Get domains that are connection endpoints between Iran and Foreign servers
   */
  static getConnectionDomains() {
    this.initTables();
    const db = getDb();
    return db.prepare(`
      SELECT d.*, s.name as server_name, s.type as server_type, s.ip as server_ip
      FROM domains d
      LEFT JOIN servers s ON d.server_id = s.id
      WHERE d.status = 'active'
      ORDER BY d.type, d.domain
    `).all();
  }

  /**
   * Delete a domain
   */
  static deleteDomain(domainName) {
    this.initTables();
    const db = getDb();
    const domain = db.prepare('SELECT id FROM domains WHERE domain = ?').get(domainName);
    if (domain) {
      db.prepare('DELETE FROM domain_checks WHERE domain_id = ?').run(domain.id);
      db.prepare('DELETE FROM domains WHERE id = ?').run(domain.id);
    }
    return { success: true };
  }

  /**
   * Get domain stats
   */
  static getStats() {
    this.initTables();
    const db = getDb();
    return {
      total: db.prepare('SELECT COUNT(*) as c FROM domains').get().c,
      main: db.prepare("SELECT COUNT(*) as c FROM domains WHERE type = 'main'").get().c,
      subdomains: db.prepare("SELECT COUNT(*) as c FROM domains WHERE type = 'subdomain'").get().c,
      withSSL: db.prepare("SELECT COUNT(*) as c FROM domains WHERE ssl_status != 'none'").get().c,
      accessible: db.prepare("SELECT COUNT(*) as c FROM domains WHERE is_accessible_iran = 1").get().c,
      blocked: db.prepare("SELECT COUNT(*) as c FROM domains WHERE is_accessible_iran = 0").get().c,
    };
  }
}

module.exports = DomainService;
