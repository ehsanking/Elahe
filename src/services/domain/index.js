/**
 * Elahe Panel - Domain/SSL Management Service (Simplified)
 * SSL certificate management and auto-renewal only
 * Developer: EHSANKiNG
 */

const { getDb } = require('../../database');
const { createLogger } = require('../../utils/logger');
const config = require('../../config/default');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const log = createLogger('DomainService');

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
        ssl_auto_renew INTEGER DEFAULT 1,
        is_accessible_iran INTEGER DEFAULT -1,
        last_check DATETIME,
        status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'blocked')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
   * Check SSL certificate expiry and auto-renew if needed
   */
  static async checkAndRenewSSL() {
    this.initTables();
    const db = getDb();
    const results = { renewed: [], failed: [], skipped: [] };
    
    // Get domains with SSL that need renewal (expires within 7 days or already expired)
    const domains = db.prepare(`
      SELECT * FROM domains 
      WHERE ssl_status = 'letsencrypt' 
      AND ssl_auto_renew = 1
      AND (ssl_expires_at IS NULL OR ssl_expires_at < datetime('now', '+7 days'))
    `).all();
    
    for (const domain of domains) {
      try {
        log.info(`Checking SSL for ${domain.domain}`);
        
        // Verify certificate exists
        if (!domain.ssl_cert_path || !fs.existsSync(domain.ssl_cert_path)) {
          results.failed.push({ domain: domain.domain, error: 'Certificate file not found' });
          continue;
        }
        
        // Try to renew with certbot
        const renewResult = this.renewCertificate(domain.domain);
        
        if (renewResult.success) {
          results.renewed.push({ domain: domain.domain, expiresAt: renewResult.expiresAt });
          
          // Update database
          db.prepare(`
            UPDATE domains SET ssl_expires_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
          `).run(renewResult.expiresAt, domain.id);
        } else {
          results.failed.push({ domain: domain.domain, error: renewResult.error });
        }
      } catch (err) {
        log.error(`SSL renewal failed for ${domain.domain}`, { error: err.message });
        results.failed.push({ domain: domain.domain, error: err.message });
      }
    }
    
    return { success: true, ...results };
  }

  /**
   * Renew a Let's Encrypt certificate
   */
  static renewCertificate(domain) {
    try {
      // Check if certbot is available
      try {
        execSync('which certbot', { timeout: 5000 });
      } catch {
        return { success: false, error: 'certbot not installed' };
      }
      
      // Try to renew the certificate
      const output = execSync(`certbot renew --cert-name ${domain} --quiet --no-random-sleep-on-renew`, { 
        timeout: 120000,
        encoding: 'utf8'
      });
      
      // Get new expiry date
      const certPath = `/etc/letsencrypt/live/${domain}/fullchain.pem`;
      let expiresAt = null;
      
      if (fs.existsSync(certPath)) {
        const expiryOutput = execSync(`openssl x509 -in ${certPath} -noout -dates`, { timeout: 5000 }).toString();
        const match = expiryOutput.match(/notAfter=(.+)/);
        if (match) {
          expiresAt = new Date(match[1]).toISOString();
        }
      }
      
      log.info(`SSL certificate renewed for ${domain}`, { expiresAt });
      return { success: true, expiresAt };
    } catch (err) {
      log.error(`Failed to renew certificate for ${domain}`, { error: err.message });
      return { success: false, error: err.message };
    }
  }

  /**
   * Request new Let's Encrypt certificate
   */
  static requestCertificate(domain, email = null, standalone = true) {
    try {
      // Check if certbot is available
      try {
        execSync('which certbot', { timeout: 5000 });
      } catch {
        return { success: false, error: 'certbot not installed' };
      }
      
      const emailFlag = email ? `--email ${email}` : '--register-unsafely-without-email';
      const standaloneFlag = standalone ? '--standalone' : '--webroot -w /var/www/html';
      
      const cmd = `certbot certonly ${standaloneFlag} -d ${domain} ${emailFlag} --agree-tos --non-interactive --quiet`;
      
      const output = execSync(cmd, { timeout: 300000, encoding: 'utf8' });
      
      // Get certificate info
      const certPath = `/etc/letsencrypt/live/${domain}/fullchain.pem`;
      const keyPath = `/etc/letsencrypt/live/${domain}/privkey.pem`;
      
      if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
        const expiryOutput = execSync(`openssl x509 -in ${certPath} -noout -dates`, { timeout: 5000 }).toString();
        const match = expiryOutput.match(/notAfter=(.+)/);
        const expiresAt = match ? new Date(match[1]).toISOString() : null;
        
        // Update database
        this.initTables();
        const db = getDb();
        db.prepare(`
          INSERT OR REPLACE INTO domains (domain, type, ssl_status, ssl_cert_path, ssl_key_path, ssl_expires_at, ssl_auto_renew)
          VALUES (?, 'main', 'letsencrypt', ?, ?, ?, 1)
        `).run(domain, certPath, keyPath, expiresAt);
        
        log.info(`New SSL certificate issued for ${domain}`, { expiresAt });
        return { success: true, certPath, keyPath, expiresAt };
      }
      
      return { success: false, error: 'Certificate files not created' };
    } catch (err) {
      log.error(`Failed to request certificate for ${domain}`, { error: err.message });
      return { success: false, error: err.message };
    }
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
      withLetsEncrypt: db.prepare("SELECT COUNT(*) as c FROM domains WHERE ssl_status = 'letsencrypt'").get().c,
      autoRenewEnabled: db.prepare("SELECT COUNT(*) as c FROM domains WHERE ssl_auto_renew = 1").get().c,
    };
  }

  /**
   * Toggle auto-renew for a domain
   */
  static toggleAutoRenew(domain, enabled) {
    this.initTables();
    const db = getDb();
    db.prepare(`
      UPDATE domains SET ssl_auto_renew = ?, updated_at = CURRENT_TIMESTAMP WHERE domain = ?
    `).run(enabled ? 1 : 0, domain);
    return { success: true };
  }
}

module.exports = DomainService;
