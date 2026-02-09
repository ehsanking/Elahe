/**
 * Elahe Panel - GeoIP/Routing Rules Service
 * Integrates with https://github.com/chocolate4u/Iran-v2ray-rules
 * Developer: EHSANKiNG
 * Version: 0.0.4
 */

const { getDb } = require('../../database');
const { createLogger } = require('../../utils/logger');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const config = require('../../config/default');

const log = createLogger('GeoRouting');

const RULES_REPO = 'https://github.com/chocolate4u/Iran-v2ray-rules';
const RULES_RELEASE_API = 'https://api.github.com/repos/chocolate4u/Iran-v2ray-rules/releases/latest';
const GEOIP_URL = 'https://github.com/chocolate4u/Iran-v2ray-rules/releases/latest/download/geoip.dat';
const GEOSITE_URL = 'https://github.com/chocolate4u/Iran-v2ray-rules/releases/latest/download/geosite.dat';
const GEOIP_DB_URL = 'https://github.com/chocolate4u/Iran-v2ray-rules/releases/latest/download/geoip.db';
const GEOSITE_DB_URL = 'https://github.com/chocolate4u/Iran-v2ray-rules/releases/latest/download/geosite.db';

class GeoRoutingService {
  /**
   * Get all routing rules
   */
  static listRules(type = null) {
    const db = getDb();
    if (type) {
      return db.prepare('SELECT * FROM routing_rules WHERE type = ? ORDER BY priority DESC, id ASC').all(type);
    }
    return db.prepare('SELECT * FROM routing_rules ORDER BY priority DESC, id ASC').all();
  }

  /**
   * Add a routing rule
   */
  static addRule(data) {
    const db = getDb();
    const { name, type, action, value, priority, category, description } = data;
    
    if (!name || !type || !action || !value) {
      return { success: false, error: 'name, type, action, and value are required' };
    }

    const result = db.prepare(`
      INSERT INTO routing_rules (name, type, action, value, priority, category, description)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(name, type, action, value, priority || 0, category || null, description || null);

    log.info('Routing rule added', { name, type, action });
    return { success: true, id: result.lastInsertRowid };
  }

  /**
   * Update a routing rule
   */
  static updateRule(id, data) {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM routing_rules WHERE id = ?').get(id);
    if (!existing) return { success: false, error: 'Rule not found' };

    db.prepare(`
      UPDATE routing_rules SET name=?, type=?, action=?, value=?, priority=?, enabled=?, category=?, description=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(
      data.name || existing.name,
      data.type || existing.type,
      data.action || existing.action,
      data.value || existing.value,
      data.priority !== undefined ? data.priority : existing.priority,
      data.enabled !== undefined ? (data.enabled ? 1 : 0) : existing.enabled,
      data.category || existing.category,
      data.description || existing.description,
      id
    );
    return { success: true };
  }

  /**
   * Delete a routing rule
   */
  static deleteRule(id) {
    const db = getDb();
    db.prepare('DELETE FROM routing_rules WHERE id = ?').run(id);
    return { success: true };
  }

  /**
   * Toggle rule enabled/disabled
   */
  static toggleRule(id) {
    const db = getDb();
    db.prepare('UPDATE routing_rules SET enabled = CASE WHEN enabled = 1 THEN 0 ELSE 1 END, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
    return { success: true };
  }

  /**
   * Initialize default Iran routing rules
   */
  static initDefaultRules() {
    const db = getDb();
    const existing = db.prepare('SELECT COUNT(*) as count FROM routing_rules').get();
    if (existing.count > 0) return { success: true, message: 'Rules already initialized' };

    const defaultRules = [
      // GeoIP Iran - Direct
      { name: 'Iran IPs - Direct', type: 'geoip', action: 'direct', value: 'ir', priority: 100, category: 'iran', description: 'Route Iran IP ranges directly (bypass proxy)' },
      { name: 'Private IPs - Direct', type: 'geoip', action: 'direct', value: 'private', priority: 99, category: 'network', description: 'Route private/local IPs directly' },
      
      // GeoSite Iran - Direct
      { name: 'Iran Sites - Direct', type: 'geosite', action: 'direct', value: 'ir', priority: 95, category: 'iran', description: 'Route Iranian websites directly' },
      { name: 'Iran Categories - Direct', type: 'geosite', action: 'direct', value: 'category-ir', priority: 94, category: 'iran', description: 'Route Iran category sites directly' },
      
      // Ads - Block
      { name: 'Ads - Block', type: 'geosite', action: 'block', value: 'category-ads-all', priority: 90, category: 'ads', description: 'Block advertisement domains' },
      
      // Malware - Block
      { name: 'Malware - Block', type: 'geosite', action: 'block', value: 'malware', priority: 89, category: 'malware', description: 'Block known malware domains' },
      { name: 'Phishing - Block', type: 'geosite', action: 'block', value: 'phishing', priority: 88, category: 'malware', description: 'Block phishing domains' },
      { name: 'Cryptominer - Block', type: 'geosite', action: 'block', value: 'cryptominers', priority: 87, category: 'malware', description: 'Block crypto miners' },
    ];

    const insert = db.prepare(`
      INSERT OR IGNORE INTO routing_rules (name, type, action, value, priority, category, description)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = db.transaction(() => {
      for (const rule of defaultRules) {
        insert.run(rule.name, rule.type, rule.action, rule.value, rule.priority, rule.category, rule.description);
      }
    });
    transaction();

    log.info('Default routing rules initialized');
    return { success: true, count: defaultRules.length };
  }

  /**
   * Get latest release info from chocolate4u/Iran-v2ray-rules
   */
  static async getLatestRelease() {
    try {
      const response = await axios.get(RULES_RELEASE_API, { timeout: 15000 });
      return {
        success: true,
        tag: response.data.tag_name,
        published: response.data.published_at,
        name: response.data.name,
        body: (response.data.body || '').substring(0, 500),
        url: response.data.html_url,
        assets: (response.data.assets || []).map(a => ({
          name: a.name,
          size: a.size,
          downloadUrl: a.browser_download_url,
        })),
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Download/update GeoIP and GeoSite data files
   */
  static async updateGeoData(engine = 'xray') {
    const dataDir = path.join(config.paths.data, 'geodata');
    
    try {
      fs.mkdirSync(dataDir, { recursive: true });
    } catch (_) {}

    const results = [];

    // Download files based on core engine
    const downloads = engine === 'singbox' ? [
      { url: GEOIP_DB_URL, dest: path.join(dataDir, 'geoip.db'), name: 'geoip.db' },
      { url: GEOSITE_DB_URL, dest: path.join(dataDir, 'geosite.db'), name: 'geosite.db' },
    ] : [
      { url: GEOIP_URL, dest: path.join(dataDir, 'geoip.dat'), name: 'geoip.dat' },
      { url: GEOSITE_URL, dest: path.join(dataDir, 'geosite.dat'), name: 'geosite.dat' },
    ];

    for (const dl of downloads) {
      try {
        log.info(`Downloading ${dl.name}...`);
        const response = await axios.get(dl.url, {
          responseType: 'arraybuffer',
          timeout: 120000,
          maxRedirects: 5,
        });
        fs.writeFileSync(dl.dest, response.data);
        results.push({ name: dl.name, success: true, size: response.data.length });
        log.info(`${dl.name} downloaded (${(response.data.length / 1024 / 1024).toFixed(2)} MB)`);
      } catch (err) {
        results.push({ name: dl.name, success: false, error: err.message });
        log.error(`Failed to download ${dl.name}`, { error: err.message });
      }
    }

    // Save update timestamp
    const db = getDb();
    db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)')
      .run('geodata.lastUpdate', new Date().toISOString());
    db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)')
      .run('geodata.engine', engine);

    return { success: true, results, dataDir };
  }

  /**
   * Get GeoData status
   */
  static getStatus() {
    const db = getDb();
    const dataDir = path.join(config.paths.data, 'geodata');
    
    const lastUpdate = db.prepare("SELECT value FROM settings WHERE key = 'geodata.lastUpdate'").get();
    const engine = db.prepare("SELECT value FROM settings WHERE key = 'geodata.engine'").get();
    const ruleCount = db.prepare('SELECT COUNT(*) as count FROM routing_rules').get();
    const enabledCount = db.prepare('SELECT COUNT(*) as count FROM routing_rules WHERE enabled = 1').get();

    // Check file existence
    const files = {};
    const possibleFiles = ['geoip.dat', 'geosite.dat', 'geoip.db', 'geosite.db'];
    for (const f of possibleFiles) {
      const fp = path.join(dataDir, f);
      if (fs.existsSync(fp)) {
        const stat = fs.statSync(fp);
        files[f] = { exists: true, size: stat.size, modified: stat.mtime };
      }
    }

    return {
      lastUpdate: lastUpdate?.value || null,
      engine: engine?.value || 'xray',
      totalRules: ruleCount.count,
      enabledRules: enabledCount.count,
      files,
      repoUrl: RULES_REPO,
    };
  }

  /**
   * Generate Xray routing config from rules
   */
  static generateXrayRouting() {
    const rules = this.listRules().filter(r => r.enabled);
    const routing = {
      domainStrategy: 'IPIfNonMatch',
      rules: [],
    };

    for (const rule of rules) {
      const xrayRule = { outboundTag: rule.action === 'block' ? 'block' : rule.action };
      
      switch (rule.type) {
        case 'geoip':
          xrayRule.ip = [`geoip:${rule.value}`];
          break;
        case 'geosite':
          xrayRule.domain = [`geosite:${rule.value}`];
          break;
        case 'domain':
          xrayRule.domain = rule.value.split(',').map(d => d.trim());
          break;
        case 'ip':
          xrayRule.ip = rule.value.split(',').map(ip => ip.trim());
          break;
      }
      
      routing.rules.push(xrayRule);
    }

    return routing;
  }

  /**
   * Generate Sing-box routing config from rules
   */
  static generateSingboxRouting() {
    const rules = this.listRules().filter(r => r.enabled);
    const route = {
      rules: [],
      rule_set: [],
    };

    for (const rule of rules) {
      const sbRule = { outbound: rule.action === 'block' ? 'block' : rule.action };

      switch (rule.type) {
        case 'geoip':
          sbRule.geoip = [rule.value];
          break;
        case 'geosite':
          sbRule.geosite = [rule.value];
          break;
        case 'domain':
          sbRule.domain = rule.value.split(',').map(d => d.trim());
          break;
        case 'ip':
          sbRule.ip_cidr = rule.value.split(',').map(ip => ip.trim());
          break;
      }

      route.rules.push(sbRule);
    }

    return route;
  }

  /**
   * Get stats for dashboard
   */
  static getStats() {
    const db = getDb();
    const total = db.prepare('SELECT COUNT(*) as c FROM routing_rules').get().c;
    const enabled = db.prepare('SELECT COUNT(*) as c FROM routing_rules WHERE enabled = 1').get().c;
    const byType = db.prepare('SELECT type, COUNT(*) as c FROM routing_rules GROUP BY type').all();
    const byAction = db.prepare('SELECT action, COUNT(*) as c FROM routing_rules GROUP BY action').all();
    
    return { total, enabled, byType, byAction };
  }
}

module.exports = GeoRoutingService;
