/**
 * Elahe Panel - Cloudflare WARP Service (Enhanced)
 * Manage WARP for bypassing specific sites with free tier support
 * Developer: EHSANKiNG
 * Version: 0.0.5
 */

const { getDb } = require('../../database');
const { createLogger } = require('../../utils/logger');
const { execSync } = require('child_process');
const config = require('../../config/default');

const log = createLogger('WARP');

// Default WARP configuration for free tier
const WARP_FREE_TIER = {
  endpoint: 'engage.cloudflareclient.com:2408',
  publicKey: 'bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=',
  defaultIPv4: '172.16.0.2',
  defaultIPv6: '2606:4700:110:8a36:df92:102a:9602:fa18',
  reserved: [0, 0, 0],
};

// Common WARP endpoints for redundancy
const WARP_ENDPOINTS = [
  'engage.cloudflareclient.com:2408',
  'engage.cloudflareclient.com:500',
  'engage.cloudflareclient.com:1701',
  'engage.cloudflareclient.com:4500',
];

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
   * Supports both free tier (no license) and Warp+ (with license)
   */
  static addConfig(data) {
    const db = getDb();
    const { 
      name, 
      warp_id, 
      license_key,
      private_key, 
      public_key, 
      ipv4, 
      ipv6, 
      endpoint, 
      domains,
      is_free_tier,
      mtu 
    } = data;

    if (!name) return { success: false, error: 'Name is required' };

    // For free tier, generate keys if not provided
    const isFreeTier = is_free_tier === true || (!license_key && !warp_id);
    
    const result = db.prepare(`
      INSERT INTO warp_config (
        name, warp_id, license_key, private_key, public_key, ipv4, ipv6, 
        endpoint, domains, is_free_tier, mtu, status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name,
      warp_id || null,
      license_key || null,
      private_key || null,
      public_key || (isFreeTier ? WARP_FREE_TIER.publicKey : null),
      ipv4 || (isFreeTier ? WARP_FREE_TIER.defaultIPv4 : null),
      ipv6 || (isFreeTier ? WARP_FREE_TIER.defaultIPv6 : null),
      endpoint || WARP_FREE_TIER.endpoint,
      JSON.stringify(domains || this.getDefaultWarpDomains()),
      isFreeTier ? 1 : 0,
      mtu || 1280,
      'inactive'
    );

    log.info(`WARP config added: ${name}`, { isFreeTier });
    return { success: true, id: result.lastInsertRowid, isFreeTier };
  }

  /**
   * Update WARP config
   */
  static updateConfig(id, data) {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM warp_config WHERE id = ?').get(id);
    if (!existing) return { success: false, error: 'Config not found' };

    const isFreeTier = data.is_free_tier !== undefined ? data.is_free_tier : existing.is_free_tier;

    db.prepare(`
      UPDATE warp_config SET 
        name=?, warp_id=?, license_key=?, private_key=?, public_key=?, 
        ipv4=?, ipv6=?, endpoint=?, domains=?, is_free_tier=?, mtu=?,
        status=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(
      data.name || existing.name,
      data.warp_id !== undefined ? data.warp_id : existing.warp_id,
      data.license_key !== undefined ? data.license_key : existing.license_key,
      data.private_key !== undefined ? data.private_key : existing.private_key,
      data.public_key !== undefined ? data.public_key : (isFreeTier ? WARP_FREE_TIER.publicKey : existing.public_key),
      data.ipv4 !== undefined ? data.ipv4 : existing.ipv4,
      data.ipv6 !== undefined ? data.ipv6 : existing.ipv6,
      data.endpoint || existing.endpoint,
      data.domains ? JSON.stringify(data.domains) : existing.domains,
      isFreeTier,
      data.mtu || existing.mtu || 1280,
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
    log.info(`WARP config activated: ${id}`);
    return { success: true };
  }

  /**
   * Generate Xray WARP outbound config
   * Enhanced with free tier support and endpoint fallback
   */
  static generateXrayOutbound() {
    const active = this.getActiveConfig();
    if (!active) return null;

    const isFreeTier = active.is_free_tier === 1;
    const endpoint = active.endpoint || WARP_FREE_TIER.endpoint;
    
    return {
      tag: 'warp',
      protocol: 'wireguard',
      settings: {
        secretKey: active.private_key || '',
        address: [
          active.ipv4 ? `${active.ipv4}/32` : `${WARP_FREE_TIER.defaultIPv4}/32`,
          active.ipv6 ? `${active.ipv6}/128` : `${WARP_FREE_TIER.defaultIPv6}/128`,
        ],
        peers: [{
          publicKey: active.public_key || WARP_FREE_TIER.publicKey,
          allowedIPs: ['0.0.0.0/0', '::/0'],
          endpoint: endpoint,
        }],
        reserved: isFreeTier ? WARP_FREE_TIER.reserved : this.parseReserved(active.reserved),
        mtu: active.mtu || 1280,
      },
    };
  }

  /**
   * Generate Sing-box WARP outbound config
   */
  static generateSingboxOutbound() {
    const active = this.getActiveConfig();
    if (!active) return null;

    const isFreeTier = active.is_free_tier === 1;
    const endpoint = active.endpoint || WARP_FREE_TIER.endpoint;
    const [server, port] = endpoint.split(':');

    return {
      tag: 'warp',
      type: 'wireguard',
      server: server,
      server_port: parseInt(port) || 2408,
      local_address: [
        active.ipv4 ? `${active.ipv4}/32` : `${WARP_FREE_TIER.defaultIPv4}/32`,
        active.ipv6 ? `${active.ipv6}/128` : `${WARP_FREE_TIER.defaultIPv6}/128`,
      ],
      private_key: active.private_key || '',
      peer_public_key: active.public_key || WARP_FREE_TIER.publicKey,
      reserved: isFreeTier ? WARP_FREE_TIER.reserved : this.parseReserved(active.reserved),
      mtu: active.mtu || 1280,
    };
  }

  /**
   * Get WARP domains list (sites that should go through WARP)
   */
  static getWarpDomains() {
    const active = this.getActiveConfig();
    if (!active) return this.getDefaultWarpDomains();
    try {
      return JSON.parse(active.domains || '[]');
    } catch (_) {
      return this.getDefaultWarpDomains();
    }
  }

  /**
   * Get default WARP domains for common blocked/restricted sites
   */
  static getDefaultWarpDomains() {
    return [
      'openai.com',
      'chatgpt.com',
      'ai.com',
      'chat.openai.com',
      'platform.openai.com',
      'claude.ai',
      'anthropic.com',
      'bard.google.com',
      'gemini.google.com',
      'bing.com',
      'copilot.microsoft.com',
      'github.com',
      'gist.github.com',
      'raw.githubusercontent.com',
      'docker.com',
      'hub.docker.com',
      'spotify.com',
      'netflix.com',
      'medium.com',
      'reddit.com',
      'twitter.com',
      'x.com',
      'instagram.com',
      'facebook.com',
      'youtube.com',
      'googlevideo.com',
      'ytimg.com',
    ];
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
   * Check WARP connectivity with endpoint fallback testing
   */
  static async checkConnectivity() {
    const results = [];
    
    for (const endpoint of WARP_ENDPOINTS.slice(0, 3)) {
      try {
        const cmd = `curl -s --max-time 5 --connect-to ::${endpoint} https://www.cloudflare.com/cdn-cgi/trace 2>/dev/null || echo "failed"`;
        const result = execSync(cmd, { timeout: 10000 }).toString();
        const warpMatch = result.match(/warp=(\w+)/);
        const coloMatch = result.match(/colo=(\w+)/);
        
        results.push({
          endpoint,
          warpStatus: warpMatch ? warpMatch[1] : 'off',
          colo: coloMatch ? coloMatch[1] : 'unknown',
          success: !result.includes('failed'),
        });
      } catch (err) {
        results.push({ endpoint, success: false, error: err.message });
      }
    }
    
    const successful = results.filter(r => r.success);
    
    return {
      success: successful.length > 0,
      warpStatus: successful[0]?.warpStatus || 'unknown',
      colo: successful[0]?.colo || 'unknown',
      bestEndpoint: successful[0]?.endpoint || WARP_ENDPOINTS[0],
      results,
    };
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
      isFreeTier: active ? active.is_free_tier === 1 : null,
      domains: active ? (() => { try { return JSON.parse(active.domains || '[]'); } catch(_) { return []; } })() : [],
    };
  }

  /**
   * Parse reserved bytes from string or array
   */
  static parseReserved(reserved) {
    if (!reserved) return WARP_FREE_TIER.reserved;
    if (Array.isArray(reserved)) return reserved;
    try {
      return JSON.parse(reserved);
    } catch {
      return WARP_FREE_TIER.reserved;
    }
  }

  /**
   * Switch to alternative endpoint if current one fails
   */
  static switchEndpoint(configId) {
    const db = getDb();
    const config = db.prepare('SELECT * FROM warp_config WHERE id = ?').get(configId);
    if (!config) return { success: false, error: 'Config not found' };

    const currentEndpoint = config.endpoint || WARP_ENDPOINTS[0];
    const currentIndex = WARP_ENDPOINTS.indexOf(currentEndpoint);
    const nextIndex = (currentIndex + 1) % WARP_ENDPOINTS.length;
    const newEndpoint = WARP_ENDPOINTS[nextIndex];

    db.prepare('UPDATE warp_config SET endpoint = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(newEndpoint, configId);

    log.info(`WARP endpoint switched for config ${configId}: ${currentEndpoint} -> ${newEndpoint}`);
    return { success: true, newEndpoint };
  }
}

module.exports = WarpService;
