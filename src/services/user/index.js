/**
 * Elahe Panel - User Management Service
 */

const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const { getDb } = require('../../database');
const config = require('../../config/default');
const { generatePassword, generateSubToken } = require('../../utils/crypto');
const { createLogger } = require('../../utils/logger');
const ConfigGenerator = require('../subscription/configGenerator');

const log = createLogger('UserService');

class UserService {
  /**
   * Create a new user (manual)
   */
  static async createUser(data, adminId) {
    const db = getDb();
    const uuid = uuidv4();
    const subToken = generateSubToken();
    const password = data.password || generatePassword();
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + (data.expiryDays || config.userDefaults.expiryDays));

    try {
      const result = db.prepare(`
        INSERT INTO users (uuid, username, password, email, phone, plan, status, data_limit, expire_at, max_connections, subscription_token, protocols_enabled, note, created_by)
        VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?)
      `).run(
        uuid,
        data.username,
        hashedPassword,
        data.email || null,
        data.phone || null,
        data.plan || config.userDefaults.plan,
        data.dataLimit || config.userDefaults.trafficLimit,
        expiryDate.toISOString(),
        data.maxConnections || config.userDefaults.maxConnections,
        subToken,
        JSON.stringify(data.protocols || ['vless-reality', 'vmess', 'trojan', 'shadowsocks', 'hysteria2', 'wireguard', 'openvpn', 'trusttunnel', 'frp', 'gost', 'chisel', 'psiphon']),
        data.note || null,
        adminId
      );

      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
      
      log.info('User created', { username: data.username, uuid, plan: data.plan });
      
      return {
        success: true,
        user: { ...user, plainPassword: password },
      };
    } catch (err) {
      if (err.message.includes('UNIQUE')) {
        return { success: false, error: 'Username already exists' };
      }
      log.error('Failed to create user', { error: err.message });
      return { success: false, error: err.message };
    }
  }

  /**
   * Auto-create users in batch
   */
  static async autoCreateUsers(count, options, adminId) {
    const results = [];
    for (let i = 0; i < count; i++) {
      const username = `user_${Date.now().toString(36)}_${i}`;
      const result = await this.createUser({ username, ...options }, adminId);
      results.push(result);
    }
    return results;
  }

  /**
   * Get user by ID
   */
  static getById(id) {
    const db = getDb();
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  }

  /**
   * Get user by UUID
   */
  static getByUuid(uuid) {
    const db = getDb();
    return db.prepare('SELECT * FROM users WHERE uuid = ?').get(uuid);
  }

  /**
   * Get user by subscription token
   */
  static getBySubToken(token) {
    const db = getDb();
    return db.prepare('SELECT * FROM users WHERE subscription_token = ?').get(token);
  }

  /**
   * List users with pagination and filters
   */
  static listUsers(options = {}) {
    const db = getDb();
    const { page = 1, limit = 20, status, plan, search } = options;
    const offset = (page - 1) * limit;
    
    let where = [];
    let params = [];

    if (status) {
      where.push('status = ?');
      params.push(status);
    }
    if (plan) {
      where.push('plan = ?');
      params.push(plan);
    }
    if (search) {
      where.push('(username LIKE ? OR email LIKE ? OR uuid LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
    
    const total = db.prepare(`SELECT COUNT(*) as count FROM users ${whereClause}`).get(...params).count;
    const users = db.prepare(`SELECT * FROM users ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
    
    return {
      users,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Update user
   */
  static updateUser(id, data) {
    const db = getDb();
    const updates = [];
    const params = [];

    const allowedFields = ['username', 'email', 'phone', 'plan', 'status', 'data_limit', 'expire_at', 'max_connections', 'protocols_enabled', 'note'];
    
    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        updates.push(`${field} = ?`);
        params.push(field === 'protocols_enabled' ? JSON.stringify(data[field]) : data[field]);
      }
    }

    if (data.password) {
      updates.push('password = ?');
      params.push(bcrypt.hashSync(data.password, 10));
    }

    if (updates.length === 0) return { success: false, error: 'No fields to update' };

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    
    log.info('User updated', { id, fields: Object.keys(data) });
    return { success: true, user: this.getById(id) };
  }

  /**
   * Delete user
   */
  static deleteUser(id) {
    const db = getDb();
    db.prepare('DELETE FROM user_configs WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM active_connections WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    log.info('User deleted', { id });
    return { success: true };
  }

  /**
   * Reset user traffic
   */
  static resetTraffic(id) {
    const db = getDb();
    db.prepare('UPDATE users SET data_used = 0 WHERE id = ?').run(id);
    return { success: true };
  }

  /**
   * Revoke user subscription (regenerate token)
   */
  static revokeSubscription(id) {
    const db = getDb();
    const newToken = generateSubToken();
    db.prepare('UPDATE users SET subscription_token = ? WHERE id = ?').run(newToken, id);
    return { success: true, newToken };
  }

  /**
   * Get user stats
   */
  static getUserStats() {
    const db = getDb();
    return {
      total: db.prepare('SELECT COUNT(*) as c FROM users').get().c,
      active: db.prepare("SELECT COUNT(*) as c FROM users WHERE status = 'active'").get().c,
      expired: db.prepare("SELECT COUNT(*) as c FROM users WHERE status = 'expired'").get().c,
      limited: db.prepare("SELECT COUNT(*) as c FROM users WHERE status = 'limited'").get().c,
      disabled: db.prepare("SELECT COUNT(*) as c FROM users WHERE status = 'disabled'").get().c,
      online: db.prepare('SELECT COUNT(DISTINCT user_id) as c FROM active_connections').get().c,
    };
  }
}

module.exports = UserService;
