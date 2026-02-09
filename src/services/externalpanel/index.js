/**
 * Elahe Panel - External Panel Integration
 * Access Marzban and 3x-ui panels from Elahe
 * Developer: EHSANKiNG
 */

const { getDb } = require('../../database');
const { createLogger } = require('../../utils/logger');
const http = require('http');
const https = require('https');

const log = createLogger('ExternalPanelService');

class ExternalPanelService {
  /**
   * Initialize external panels table
   */
  static initTables() {
    const db = getDb();
    db.exec(`
      CREATE TABLE IF NOT EXISTS external_panels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('marzban', '3xui', 'other')),
        url TEXT NOT NULL,
        username TEXT,
        password TEXT,
        token TEXT,
        server_id INTEGER REFERENCES servers(id),
        status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'error')),
        last_sync DATETIME,
        config TEXT DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  /**
   * Add external panel
   */
  static addPanel(data) {
    this.initTables();
    const db = getDb();
    
    try {
      const result = db.prepare(`
        INSERT INTO external_panels (name, type, url, username, password, server_id, config)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        data.name,
        data.type,
        data.url.replace(/\/$/, ''),
        data.username || '',
        data.password || '',
        data.serverId || null,
        JSON.stringify(data.config || {})
      );
      
      log.info('External panel added', { name: data.name, type: data.type });
      return { success: true, id: result.lastInsertRowid };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * List all external panels
   */
  static listPanels() {
    this.initTables();
    const db = getDb();
    return db.prepare(`
      SELECT ep.*, s.name as server_name, s.ip as server_ip
      FROM external_panels ep
      LEFT JOIN servers s ON ep.server_id = s.id
      ORDER BY ep.created_at DESC
    `).all();
  }

  /**
   * Get panel by ID
   */
  static getPanel(id) {
    this.initTables();
    const db = getDb();
    return db.prepare('SELECT * FROM external_panels WHERE id = ?').get(id);
  }

  /**
   * Login to Marzban panel and get token
   */
  static async loginMarzban(panelId) {
    const panel = this.getPanel(panelId);
    if (!panel) return { success: false, error: 'Panel not found' };
    
    try {
      const result = await this._httpRequest(`${panel.url}/api/admin/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `username=${encodeURIComponent(panel.username)}&password=${encodeURIComponent(panel.password)}`,
      });
      
      if (result.access_token) {
        const db = getDb();
        db.prepare('UPDATE external_panels SET token = ?, status = ? WHERE id = ?')
          .run(result.access_token, 'active', panelId);
        return { success: true, token: result.access_token };
      }
      
      return { success: false, error: 'Login failed' };
    } catch (err) {
      const db = getDb();
      db.prepare("UPDATE external_panels SET status = 'error' WHERE id = ?").run(panelId);
      return { success: false, error: err.message };
    }
  }

  /**
   * Login to 3x-ui panel
   */
  static async loginXUI(panelId) {
    const panel = this.getPanel(panelId);
    if (!panel) return { success: false, error: 'Panel not found' };
    
    try {
      const result = await this._httpRequest(`${panel.url}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: panel.username, password: panel.password }),
      });
      
      if (result.success) {
        const db = getDb();
        db.prepare('UPDATE external_panels SET token = ?, status = ? WHERE id = ?')
          .run(result.token || 'session', 'active', panelId);
        return { success: true };
      }
      
      return { success: false, error: 'Login failed' };
    } catch (err) {
      const db = getDb();
      db.prepare("UPDATE external_panels SET status = 'error' WHERE id = ?").run(panelId);
      return { success: false, error: err.message };
    }
  }

  /**
   * Get Marzban users
   */
  static async getMarzbanUsers(panelId) {
    const panel = this.getPanel(panelId);
    if (!panel || !panel.token) {
      const loginResult = await this.loginMarzban(panelId);
      if (!loginResult.success) return { success: false, error: 'Cannot authenticate' };
    }
    
    const freshPanel = this.getPanel(panelId);
    try {
      const result = await this._httpRequest(`${freshPanel.url}/api/users`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${freshPanel.token}` },
      });
      return { success: true, users: result.users || [] };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Get 3x-ui inbounds (which contain client/user info)
   */
  static async getXUIInbounds(panelId) {
    const panel = this.getPanel(panelId);
    if (!panel) return { success: false, error: 'Panel not found' };
    
    try {
      // Login first if needed
      if (!panel.token || panel.token === '') {
        await this.loginXUI(panelId);
      }
      
      const result = await this._httpRequest(`${panel.url}/panel/api/inbounds/list`, {
        method: 'GET',
        headers: { 'Cookie': `session=${panel.token || ''}` },
      });
      
      if (result.success) {
        return { success: true, inbounds: result.obj || [] };
      }
      return { success: false, error: 'Failed to get inbounds' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Sync users from Marzban to Elahe
   */
  static async syncFromMarzban(panelId, adminId) {
    const usersResult = await this.getMarzbanUsers(panelId);
    if (!usersResult.success) return usersResult;
    
    const ImportExportService = require('../importexport');
    const result = ImportExportService.importUsers({
      format: 'marzban',
      users: usersResult.users,
    }, adminId);
    
    // Update last sync time
    const db = getDb();
    db.prepare('UPDATE external_panels SET last_sync = CURRENT_TIMESTAMP WHERE id = ?').run(panelId);
    
    return { success: true, ...result };
  }

  /**
   * Sync users from 3x-ui to Elahe
   */
  static async syncFromXUI(panelId, adminId) {
    const inboundsResult = await this.getXUIInbounds(panelId);
    if (!inboundsResult.success) return inboundsResult;
    
    // Extract clients from inbounds
    const users = [];
    for (const inbound of (inboundsResult.inbounds || [])) {
      try {
        const settings = JSON.parse(inbound.settings || '{}');
        const clients = settings.clients || [];
        for (const client of clients) {
          users.push({
            uuid: client.id || client.uuid,
            email: client.email || client.remark,
            enable: !client.enable || client.enable === true,
            total: inbound.total || 0,
            up: inbound.up || 0,
            down: inbound.down || 0,
            expiryTime: client.expiryTime || inbound.expiryTime || 0,
            limitIp: client.limitIp || 0,
            subId: client.subId || '',
            remark: client.email || `xui_${Date.now()}`,
          });
        }
      } catch (e) { /* skip malformed */ }
    }
    
    const ImportExportService = require('../importexport');
    const result = ImportExportService.importUsers({
      format: '3xui',
      users,
    }, adminId);
    
    const db = getDb();
    db.prepare('UPDATE external_panels SET last_sync = CURRENT_TIMESTAMP WHERE id = ?').run(panelId);
    
    return { success: true, ...result };
  }

  /**
   * Check panel status/health
   */
  static async checkPanelHealth(panelId) {
    const panel = this.getPanel(panelId);
    if (!panel) return { success: false, error: 'Panel not found' };
    
    const startTime = Date.now();
    try {
      await this._httpRequest(panel.url, { method: 'GET', timeout: 5000 });
      const latency = Date.now() - startTime;
      
      const db = getDb();
      db.prepare("UPDATE external_panels SET status = 'active' WHERE id = ?").run(panelId);
      
      return { success: true, latency, status: 'online' };
    } catch (err) {
      const db = getDb();
      db.prepare("UPDATE external_panels SET status = 'error' WHERE id = ?").run(panelId);
      return { success: false, latency: Date.now() - startTime, status: 'offline', error: err.message };
    }
  }

  /**
   * Delete external panel
   */
  static deletePanel(id) {
    this.initTables();
    const db = getDb();
    db.prepare('DELETE FROM external_panels WHERE id = ?').run(id);
    return { success: true };
  }

  /**
   * Get panel proxy URL for frontend iframe/embed
   */
  static getPanelProxyUrl(panelId) {
    const panel = this.getPanel(panelId);
    if (!panel) return null;
    return {
      url: panel.url,
      type: panel.type,
      name: panel.name,
    };
  }

  /**
   * HTTP request helper
   */
  static _httpRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const client = urlObj.protocol === 'https:' ? https : http;
      
      const reqOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: options.method || 'GET',
        headers: options.headers || {},
        timeout: options.timeout || 10000,
        rejectUnauthorized: false,
      };
      
      const req = client.request(reqOptions, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve({ raw: data, statusCode: res.statusCode });
          }
        });
      });
      
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
      
      if (options.body) {
        req.write(options.body);
      }
      req.end();
    });
  }
}

module.exports = ExternalPanelService;
