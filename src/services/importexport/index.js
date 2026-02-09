/**
 * Elahe Panel - Import/Export Service
 * Import/Export users, settings, and configs
 * Compatible with Marzban and 3x-ui formats
 * Developer: EHSANKiNG
 */

const { getDb } = require('../../database');
const { createLogger } = require('../../utils/logger');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

const log = createLogger('ImportExportService');

class ImportExportService {
  /**
   * Export all users to JSON
   */
  static exportUsers(format = 'elahe') {
    const db = getDb();
    const users = db.prepare('SELECT * FROM users').all();
    
    if (format === 'marzban') {
      return this._exportMarzbanFormat(users);
    }
    if (format === '3xui') {
      return this._exportXUIFormat(users);
    }
    
    // Elahe native format
    return {
      format: 'elahe',
      version: '0.0.3',
      exportedAt: new Date().toISOString(),
      count: users.length,
      users: users.map(u => ({
        uuid: u.uuid,
        username: u.username,
        email: u.email,
        phone: u.phone,
        plan: u.plan,
        status: u.status,
        data_limit: u.data_limit,
        data_used: u.data_used,
        expire_at: u.expire_at,
        max_connections: u.max_connections,
        subscription_token: u.subscription_token,
        protocols_enabled: u.protocols_enabled,
        note: u.note,
        metadata: u.metadata,
        created_at: u.created_at,
      })),
    };
  }

  /**
   * Export in Marzban-compatible format
   */
  static _exportMarzbanFormat(users) {
    return {
      format: 'marzban',
      version: '0.4',
      exportedAt: new Date().toISOString(),
      count: users.length,
      users: users.map(u => {
        const protocols = JSON.parse(u.protocols_enabled || '[]');
        const proxies = {};
        if (protocols.includes('vless-reality')) {
          proxies.vless = { id: u.uuid, flow: 'xtls-rprx-vision' };
        }
        if (protocols.includes('vmess')) {
          proxies.vmess = { id: u.uuid };
        }
        if (protocols.includes('trojan')) {
          proxies.trojan = { password: crypto.createHash('sha256').update(u.uuid).digest('hex').substring(0, 32) };
        }
        if (protocols.includes('shadowsocks')) {
          proxies.shadowsocks = { password: crypto.createHash('md5').update(u.uuid).digest('hex'), method: '2022-blake3-aes-256-gcm' };
        }
        
        return {
          username: u.username,
          proxies,
          expire: u.expire_at ? Math.floor(new Date(u.expire_at).getTime() / 1000) : 0,
          data_limit: u.data_limit,
          data_limit_reset_strategy: 'no_reset',
          status: u.status === 'active' ? 'active' : u.status === 'expired' ? 'expired' : u.status === 'limited' ? 'limited' : 'disabled',
          used_traffic: u.data_used,
          lifetime_used_traffic: u.data_used,
          note: u.note || '',
          sub_updated_at: u.updated_at,
          sub_last_user_agent: '',
          online_at: u.last_connected,
          on_hold_expire_duration: 0,
          on_hold_timeout: null,
        };
      }),
    };
  }

  /**
   * Export in 3x-ui compatible format
   */
  static _exportXUIFormat(users) {
    return {
      format: '3xui',
      version: '2.3',
      exportedAt: new Date().toISOString(),
      count: users.length,
      users: users.map(u => ({
        id: u.id,
        email: u.username, // 3x-ui uses email field as identifier
        uuid: u.uuid,
        enable: u.status === 'active',
        expiryTime: u.expire_at ? new Date(u.expire_at).getTime() : 0,
        total: u.data_limit,
        up: 0,
        down: u.data_used,
        remark: u.note || u.username,
        limitIp: u.max_connections,
        subId: u.subscription_token,
        tgId: '',
      })),
    };
  }

  /**
   * Import users from JSON
   */
  static importUsers(data, adminId) {
    const format = data.format || this._detectFormat(data);
    
    switch (format) {
      case 'marzban':
        return this._importMarzban(data, adminId);
      case '3xui':
        return this._importXUI(data, adminId);
      case 'elahe':
      default:
        return this._importElahe(data, adminId);
    }
  }

  /**
   * Detect import format
   */
  static _detectFormat(data) {
    if (data.users && data.users[0]) {
      const first = data.users[0];
      if (first.proxies) return 'marzban';
      if (first.email && first.total !== undefined) return '3xui';
    }
    return 'elahe';
  }

  /**
   * Import Elahe native format
   */
  static _importElahe(data, adminId) {
    const db = getDb();
    const results = { imported: 0, skipped: 0, errors: [] };
    
    const insert = db.prepare(`
      INSERT OR IGNORE INTO users (uuid, username, email, phone, plan, status, data_limit, data_used, expire_at, max_connections, subscription_token, protocols_enabled, note, metadata, created_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const transaction = db.transaction(() => {
      for (const user of (data.users || [])) {
        try {
          const res = insert.run(
            user.uuid || uuidv4(),
            user.username,
            user.email || null,
            user.phone || null,
            user.plan || 'bronze',
            user.status || 'active',
            user.data_limit || 0,
            user.data_used || 0,
            user.expire_at || null,
            user.max_connections || 2,
            user.subscription_token || crypto.randomBytes(24).toString('base64url'),
            typeof user.protocols_enabled === 'string' ? user.protocols_enabled : JSON.stringify(user.protocols_enabled || ['vless-reality', 'vmess', 'trojan']),
            user.note || null,
            typeof user.metadata === 'string' ? user.metadata : JSON.stringify(user.metadata || {}),
            user.created_at || new Date().toISOString(),
            adminId
          );
          
          if (res.changes > 0) results.imported++;
          else results.skipped++;
        } catch (err) {
          results.errors.push({ username: user.username, error: err.message });
          results.skipped++;
        }
      }
    });
    
    transaction();
    log.info('Import complete (elahe)', results);
    return results;
  }

  /**
   * Import Marzban format
   */
  static _importMarzban(data, adminId) {
    const db = getDb();
    const results = { imported: 0, skipped: 0, errors: [] };
    
    const insert = db.prepare(`
      INSERT OR IGNORE INTO users (uuid, username, password, plan, status, data_limit, data_used, expire_at, max_connections, subscription_token, protocols_enabled, note, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const transaction = db.transaction(() => {
      for (const user of (data.users || [])) {
        try {
          // Extract UUID from proxies
          let uuid = uuidv4();
          const protocols = [];
          
          if (user.proxies) {
            if (user.proxies.vless) {
              uuid = user.proxies.vless.id || uuid;
              protocols.push('vless-reality');
            }
            if (user.proxies.vmess) {
              uuid = user.proxies.vmess.id || uuid;
              protocols.push('vmess');
            }
            if (user.proxies.trojan) protocols.push('trojan');
            if (user.proxies.shadowsocks) protocols.push('shadowsocks');
          }
          
          if (protocols.length === 0) {
            protocols.push('vless-reality', 'vmess', 'trojan');
          }
          
          const status = user.status === 'active' ? 'active' : user.status === 'expired' ? 'expired' : user.status === 'limited' ? 'limited' : 'disabled';
          const expireAt = user.expire ? new Date(user.expire * 1000).toISOString() : null;
          
          const res = insert.run(
            uuid,
            user.username,
            bcrypt.hashSync(crypto.randomBytes(8).toString('hex'), 10),
            'bronze',
            status,
            user.data_limit || 0,
            user.used_traffic || 0,
            expireAt,
            2,
            crypto.randomBytes(24).toString('base64url'),
            JSON.stringify(protocols),
            user.note || null,
            adminId
          );
          
          if (res.changes > 0) results.imported++;
          else results.skipped++;
        } catch (err) {
          results.errors.push({ username: user.username, error: err.message });
          results.skipped++;
        }
      }
    });
    
    transaction();
    log.info('Import complete (marzban)', results);
    return results;
  }

  /**
   * Import 3x-ui format
   */
  static _importXUI(data, adminId) {
    const db = getDb();
    const results = { imported: 0, skipped: 0, errors: [] };
    
    const insert = db.prepare(`
      INSERT OR IGNORE INTO users (uuid, username, password, plan, status, data_limit, data_used, expire_at, max_connections, subscription_token, protocols_enabled, note, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const transaction = db.transaction(() => {
      for (const user of (data.users || [])) {
        try {
          const uuid = user.uuid || uuidv4();
          const username = user.email || user.remark || `user_${Date.now()}`;
          const status = user.enable ? 'active' : 'disabled';
          const expireAt = user.expiryTime ? new Date(user.expiryTime).toISOString() : null;
          
          const res = insert.run(
            uuid,
            username,
            bcrypt.hashSync(crypto.randomBytes(8).toString('hex'), 10),
            'bronze',
            status,
            user.total || 0,
            (user.up || 0) + (user.down || 0),
            expireAt,
            user.limitIp || 2,
            user.subId || crypto.randomBytes(24).toString('base64url'),
            JSON.stringify(['vless-reality', 'vmess', 'trojan']),
            user.remark || null,
            adminId
          );
          
          if (res.changes > 0) results.imported++;
          else results.skipped++;
        } catch (err) {
          results.errors.push({ username: user.email || 'unknown', error: err.message });
          results.skipped++;
        }
      }
    });
    
    transaction();
    log.info('Import complete (3xui)', results);
    return results;
  }

  /**
   * Export all settings
   */
  static exportSettings() {
    const db = getDb();
    const settings = db.prepare('SELECT * FROM settings').all();
    const servers = db.prepare('SELECT * FROM servers').all();
    const tunnels = db.prepare('SELECT * FROM tunnels').all();
    
    return {
      format: 'elahe',
      version: '0.0.3',
      exportedAt: new Date().toISOString(),
      settings: settings.reduce((obj, s) => { obj[s.key] = s.value; return obj; }, {}),
      servers: servers.map(s => ({
        name: s.name,
        type: s.type,
        ip: s.ip,
        port: s.port,
        core_engine: s.core_engine,
        config: s.config,
        location: s.location,
        isp: s.isp,
        max_users: s.max_users,
      })),
      tunnels: tunnels.map(t => ({
        protocol: t.protocol,
        transport: t.transport,
        port: t.port,
        config: t.config,
        priority: t.priority,
      })),
    };
  }

  /**
   * Import settings
   */
  static importSettings(data) {
    const db = getDb();
    const results = { settings: 0, servers: 0, tunnels: 0 };
    
    const transaction = db.transaction(() => {
      // Import settings
      if (data.settings) {
        const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)');
        for (const [key, value] of Object.entries(data.settings)) {
          stmt.run(key, String(value));
          results.settings++;
        }
      }
      
      // Import servers
      if (data.servers) {
        const stmt = db.prepare(`
          INSERT OR IGNORE INTO servers (name, type, ip, port, core_engine, config, location, isp, max_users, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        `);
        for (const server of data.servers) {
          const res = stmt.run(
            server.name, server.type, server.ip, server.port || 3000,
            server.core_engine || 'xray', server.config || '{}',
            server.location || '', server.isp || '', server.max_users || 100
          );
          if (res.changes > 0) results.servers++;
        }
      }
    });
    
    transaction();
    log.info('Settings import complete', results);
    return results;
  }

  /**
   * Full backup (all data)
   */
  static fullBackup() {
    return {
      format: 'elahe-full',
      version: '0.0.3',
      exportedAt: new Date().toISOString(),
      checksum: crypto.randomBytes(16).toString('hex'),
      users: this.exportUsers().users,
      settings: this.exportSettings(),
    };
  }

  /**
   * Full restore
   */
  static fullRestore(data, adminId) {
    const results = { users: null, settings: null };
    
    if (data.users) {
      results.users = this.importUsers({
        format: 'elahe',
        users: data.users,
      }, adminId);
    }
    
    if (data.settings) {
      results.settings = this.importSettings(data.settings);
    }
    
    return results;
  }
}

module.exports = ImportExportService;
