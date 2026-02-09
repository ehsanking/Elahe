/**
 * Elahe Panel - Server Management Service
 */

const { getDb } = require('../../database');
const { generateAuthKey, generateConnectionToken } = require('../../utils/crypto');
const { createLogger } = require('../../utils/logger');

const log = createLogger('ServerService');

class ServerService {
  /**
   * Add a new server
   */
  static addServer(data) {
    const db = getDb();
    const authKey = generateAuthKey();
    const connectionToken = generateConnectionToken(data.ip, authKey);

    try {
      const result = db.prepare(`
        INSERT INTO servers (name, type, ip, port, connection_token, auth_key, core_engine, config, location, isp, max_users, bandwidth_limit)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        data.name,
        data.type,
        data.ip,
        data.port || 3000,
        connectionToken,
        authKey,
        data.coreEngine || 'xray',
        JSON.stringify(data.config || {}),
        data.location || '',
        data.isp || '',
        data.maxUsers || 100,
        data.bandwidthLimit || 0
      );

      const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(result.lastInsertRowid);
      
      log.info('Server added', { name: data.name, type: data.type, ip: data.ip });

      return {
        success: true,
        server,
        connectionToken,
        authKey,
      };
    } catch (err) {
      log.error('Failed to add server', { error: err.message });
      return { success: false, error: err.message };
    }
  }

  /**
   * Get server by ID
   */
  static getById(id) {
    const db = getDb();
    return db.prepare('SELECT * FROM servers WHERE id = ?').get(id);
  }

  /**
   * List all servers
   */
  static listServers(type = null) {
    const db = getDb();
    if (type) {
      return db.prepare('SELECT * FROM servers WHERE type = ? ORDER BY created_at DESC').all(type);
    }
    return db.prepare('SELECT * FROM servers ORDER BY type, created_at DESC').all();
  }

  /**
   * Update server
   */
  static updateServer(id, data) {
    const db = getDb();
    const updates = [];
    const params = [];

    const fields = ['name', 'ip', 'port', 'status', 'core_engine', 'config', 'location', 'isp', 'max_users', 'bandwidth_limit'];
    
    for (const field of fields) {
      if (data[field] !== undefined) {
        updates.push(`${field} = ?`);
        params.push(field === 'config' ? JSON.stringify(data[field]) : data[field]);
      }
    }

    if (updates.length === 0) return { success: false, error: 'No fields to update' };

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    db.prepare(`UPDATE servers SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    
    log.info('Server updated', { id });
    return { success: true, server: this.getById(id) };
  }

  /**
   * Remove server
   */
  static removeServer(id) {
    const db = getDb();
    db.prepare('DELETE FROM tunnels WHERE iran_server_id = ? OR foreign_server_id = ?').run(id, id);
    db.prepare('DELETE FROM servers WHERE id = ?').run(id);
    log.info('Server removed', { id });
    return { success: true };
  }

  /**
   * Update server ping data
   */
  static updatePing(id, latency, jitter) {
    const db = getDb();
    db.prepare(`
      UPDATE servers SET last_ping = CURRENT_TIMESTAMP, latency_ms = ?, jitter_ms = ? WHERE id = ?
    `).run(latency, jitter, id);
  }

  /**
   * Regenerate connection token
   */
  static regenerateToken(id) {
    const db = getDb();
    const server = this.getById(id);
    if (!server) return { success: false, error: 'Server not found' };

    const newAuthKey = generateAuthKey();
    const newToken = generateConnectionToken(server.ip, newAuthKey);

    db.prepare(`
      UPDATE servers SET connection_token = ?, auth_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(newToken, newAuthKey, id);

    return { success: true, connectionToken: newToken, authKey: newAuthKey };
  }

  /**
   * Get server stats
   */
  static getStats() {
    const db = getDb();
    return {
      total: db.prepare('SELECT COUNT(*) as c FROM servers').get().c,
      iran: db.prepare("SELECT COUNT(*) as c FROM servers WHERE type = 'iran'").get().c,
      foreign: db.prepare("SELECT COUNT(*) as c FROM servers WHERE type = 'foreign'").get().c,
      active: db.prepare("SELECT COUNT(*) as c FROM servers WHERE status = 'active'").get().c,
      inactive: db.prepare("SELECT COUNT(*) as c FROM servers WHERE status != 'active'").get().c,
    };
  }
}

module.exports = ServerService;
