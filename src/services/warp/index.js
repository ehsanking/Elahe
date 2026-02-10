/**
 * Elahe Panel - Cloudflare WARP Service
 * Manage WARP for bypassing specific sites
 * Developer: EHSANKiNG
 * Version: 0.0.5
 */

const { getDb } = require('../../database');
const { createLogger } = require('../../utils/logger');
const { execSync } = require('child_process');
const config = require('../../config/default');

const log = createLogger('WARP');

class WarpService {
  /**
   * Get WARP configurations
   */
  static listConfigs() {
    const db = getDb();
    return db.prepare('SELECT * FROM warp_config ORDER BY id ASC').all();
  }

  /**
   * Get active WARP config
   */
  static getActiveConfig() {
    const db = getDb();
    return db.prepare("SELECT * FROM warp_config WHERE status = 'active'").get();
  }

  /**
   * Add WARP configuration
   */
  static addConfig(data) {
    const db = getDb();
    const { name, warp_id, private_key, public_key, ipv4, ipv6, endpoint, domains } = data;

    if (!name) return { success: false, error: 'Name is required' };

    const result = db.prepare(`
      INSERT INTO warp_config (name, warp_id, private_key, public_key, ipv4, ipv6, endpoint, domains)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name,
      warp_id || null,
      private_key || null,
      public_key || null,
      ipv4 || null,
      ipv6 || null,
      endpoint || 'engage.cloudflareclient.com:2408',
      JSON.stringify(domains || [])
    );

    return { success: true, id: result.lastInsertRowid };
  }

  /**
   * Update WARP config
   */
  static updateConfig(id, data) {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM warp_config WHERE id = ?').get(id);
    if (!existing) return { success: false, error: 'Config not found' };

    db.prepare(`
      UPDATE warp_config SET name=?, warp_id=?, private_key=?, public_key=?, ipv4=?, ipv6=?, endpoint=?, domains=?, status=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(
      data.name || existing.name,
      data.warp_id !== undefined ? data.warp_id : existing.warp_id,
      data.private_key !== undefined ? data.private_key : existing.private_key,
      data.public_key !== undefined ? data.public_key : existing.public_key,
      data.ipv4 !== undefined ? data.ipv4 : existing.ipv4,
      data.ipv6 !== undefined ? data.ipv6 : existing.ipv6,
      data.endpoint || existing.endpoint,
      data.domains ? JSON.stringify(data.domains) : existing.domains,
      data.status || existing.status,
      id
    );

    return { success: true };
  }

  /**
   * Delete WARP config
   */
  static deleteConfig(id) {
    const db = getDb();
    db.prepare('DELETE FROM warp_config WHERE id = ?').run(id);
    return { success: true };
  }

  /**
   * Activate a WARP config
   */
  static activateConfig(id) {
    const db = getDb();
    // Deactivate all first
    db.prepare("UPDATE warp_config SET status = 'inactive'").run();
    // Activate selected
    db.prepare("UPDATE warp_config SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
    return { success: true };
  }

  /**
   * Generate Xray WARP outbound config
   */
  static generateXrayOutbound() {
    const active = this.getActiveConfig();
    if (!active) return null;

    return {
      tag: 'warp',
      protocol: 'wireguard',
      settings: {
        secretKey: active.private_key,
        address: [
          active.ipv4 ? `${active.ipv4}/32` : '172.16.0.2/32',
          active.ipv6 ? `${active.ipv6}/128` : '2606:4700:110:8a36:df92:102a:9602:fa18/128',
        ],
        peers: [{
          publicKey: active.public_key || 'bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=',
          allowedIPs: ['0.0.0.0/0', '::/0'],
          endpoint: active.endpoint || 'engage.cloudflareclient.com:2408',
        }],
        reserved: [0, 0, 0],
        mtu: 1280,
      },
    };
  }

  /**
   * Generate Sing-box WARP outbound config
   */
  static generateSingboxOutbound() {
    const active = this.getActiveConfig();
    if (!active) return null;

    return {
      tag: 'warp',
      type: 'wireguard',
      server: (active.endpoint || 'engage.cloudflareclient.com:2408').split(':')[0],
      server_port: parseInt((active.endpoint || 'engage.cloudflareclient.com:2408').split(':')[1]) || 2408,
      local_address: [
        active.ipv4 ? `${active.ipv4}/32` : '172.16.0.2/32',
        active.ipv6 ? `${active.ipv6}/128` : '2606:4700:110:8a36:df92:102a:9602:fa18/128',
      ],
      private_key: active.private_key || '',
      peer_public_key: active.public_key || 'bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=',
      mtu: 1280,
    };
  }

  /**
   * Get WARP domains list (sites that should go through WARP)
   */
  static getWarpDomains() {
    const active = this.getActiveConfig();
    if (!active) return [];
    try {
      return JSON.parse(active.domains || '[]');
    } catch (_) {
      return [];
    }
  }

  /**
   * Update WARP domains list
   */
  static updateWarpDomains(id, domains) {
    const db = getDb();
    db.prepare('UPDATE warp_config SET domains = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(JSON.stringify(domains), id);
    return { success: true };
  }

  /**
   * Check WARP connectivity
   */
  static async checkConnectivity() {
    try {
      const result = execSync('curl -s --max-time 5 https://www.cloudflare.com/cdn-cgi/trace 2>/dev/null || echo "failed"', { timeout: 10000 }).toString();
      const warpMatch = result.match(/warp=(\w+)/);
      return {
        success: true,
        warpStatus: warpMatch ? warpMatch[1] : 'off',
        raw: result.substring(0, 500),
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Get status for dashboard
   */
  static getStatus() {
    const db = getDb();
    const configs = db.prepare('SELECT * FROM warp_config').all();
    const active = configs.find(c => c.status === 'active');
    
    return {
      configured: configs.length > 0,
      active: !!active,
      configCount: configs.length,
      activeName: active?.name || null,
      domains: active ? (() => { try { return JSON.parse(active.domains || '[]'); } catch(_) { return []; } })() : [],
    };
  }
}

module.exports = WarpService;
