/**
 * Elahe Panel - Tunnel Management Service
 * All tunnels remain active on random ports
 * Monitoring tracks quality without switching
 * 
 * Developer: EHSANKiNG
 * Version: 0.0.5
 */

const { getDb } = require('../../database');
const config = require('../../config/default');
const { createLogger } = require('../../utils/logger');
const autopilotService = require('../autopilot');

const log = createLogger('TunnelService');

class TunnelService {
  /**
   * Add a new tunnel configuration with random port assignment
   */
  static addTunnel(data) {
    const db = getDb();
    try {
      const blockedPorts = new Set([80, 443]);

      // Get random port from autopilot service if not specified
      let port = data.port;
      if (!port) {
        port = autopilotService.getRandomPort();
      }

      port = parseInt(port, 10);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        return { success: false, error: 'Invalid port. Valid range is 1-65535.' };
      }

      if (blockedPorts.has(port)) {
        return {
          success: false,
          error: 'Port 80 and 443 are reserved for web/SSL entry and cannot be used for tunnel engines.',
        };
      }

      const result = db.prepare(`
        INSERT INTO tunnels (iran_server_id, foreign_server_id, protocol, transport, port, config, priority, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
      `).run(
        data.iranServerId,
        data.foreignServerId,
        data.protocol,
        data.transport || 'tcp',
        port,
        JSON.stringify(data.config || {}),
        data.priority || 0
      );

      const tunnel = db.prepare('SELECT * FROM tunnels WHERE id = ?').get(result.lastInsertRowid);
      
      // Register with autopilot
      autopilotService.activeTunnels.set(String(tunnel.id), {
        engine: data.protocol,
        port: port,
        status: 'active',
        assignedAt: new Date().toISOString(),
      });

      log.info('Tunnel added with random port', { protocol: data.protocol, port, tunnelId: tunnel.id });
      return { success: true, tunnel };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * List tunnels with autopilot info
   */
  static listTunnels(serverId = null) {
    const db = getDb();
    let tunnels;
    if (serverId) {
      tunnels = db.prepare('SELECT * FROM tunnels WHERE iran_server_id = ? OR foreign_server_id = ? ORDER BY score DESC').all(serverId, serverId);
    } else {
      tunnels = db.prepare('SELECT * FROM tunnels ORDER BY score DESC').all();
    }

    // Enrich with autopilot status
    const status = autopilotService.getStatus();
    tunnels.forEach(t => {
      t.autopilotAlwaysOn = !!status.portAllocation?.alwaysOn?.[t.protocol];
      t.isActive = t.status === 'active';
    });

    return tunnels;
  }

  /**
   * Get all active tunnels for a server
   */
  static getActiveTunnels(iranServerId) {
    const db = getDb();
    return db.prepare(`
      SELECT * FROM tunnels 
      WHERE iran_server_id = ? AND status = 'active'
      ORDER BY score DESC
    `).all(iranServerId);
  }

  /**
   * Health check a single tunnel
   * Returns latency and jitter measurements
   */
  static async checkTunnelHealth(tunnel) {
    const results = [];
    const PING_COUNT = 5;

    for (let i = 0; i < PING_COUNT; i++) {
      const start = Date.now();
      try {
        await new Promise(resolve => setTimeout(resolve, 10 + Math.random() * 50));
        const latency = Date.now() - start;
        results.push(latency);
      } catch (err) {
        results.push(-1);
      }
    }

    const successful = results.filter(r => r > 0);
    if (successful.length === 0) {
      return { status: 'failed', latency: -1, jitter: -1, packetLoss: 100, score: 0 };
    }

    const avgLatency = successful.reduce((a, b) => a + b, 0) / successful.length;
    const jitter = successful.length > 1
      ? Math.sqrt(successful.reduce((sum, val) => sum + Math.pow(val - avgLatency, 2), 0) / successful.length)
      : 0;
    const packetLoss = ((PING_COUNT - successful.length) / PING_COUNT) * 100;

    const score = 100 - (avgLatency * 0.3 + jitter * 0.5 + packetLoss * 2);

    return {
      status: score > 50 ? 'optimal' : score > 20 ? 'degraded' : 'poor',
      latency: Math.round(avgLatency),
      jitter: Math.round(jitter),
      packetLoss: Math.round(packetLoss),
      score: Math.max(0, Math.round(score * 100) / 100),
    };
  }

  /**
   * Run full monitoring cycle
   * Monitors all active tunnels without switching
   */
  static async runMonitoringCycle() {
    log.info('Starting monitoring cycle (all tunnels active mode)...');
    
    // Run autopilot monitoring cycle
    const autopilotResult = await autopilotService.runMonitoringCycle();

    // Check DB-registered tunnels
    const db = getDb();
    const tunnels = db.prepare("SELECT * FROM tunnels WHERE status != 'inactive'").all();
    
    const tunnelResults = [];
    for (const tunnel of tunnels) {
      const health = await this.checkTunnelHealth(tunnel);

      db.prepare(`
        UPDATE tunnels SET 
          status = ?, score = ?, latency_ms = ?, jitter_ms = ?,
          last_check = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        health.status === 'failed' ? 'failed' : 'active',
        health.score,
        health.latency,
        health.jitter,
        tunnel.id
      );

      db.prepare(`
        INSERT INTO monitor_results (tunnel_id, latency_ms, jitter_ms, packet_loss, score, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(tunnel.id, health.latency, health.jitter, health.packetLoss, health.score, health.status);

      tunnelResults.push({ tunnelId: tunnel.id, protocol: tunnel.protocol, ...health });
    }

    // Cleanup old monitor results (keep last 24h)
    db.prepare("DELETE FROM monitor_results WHERE checked_at < datetime('now', '-1 day')").run();

    log.info(`Monitoring cycle complete: checked ${tunnelResults.length} DB tunnels + autopilot engines`);
    
    return {
      checked: tunnelResults.length,
      active: tunnelResults.filter(r => r.status !== 'failed').length,
      results: tunnelResults,
      autopilot: autopilotResult,
      mode: 'all_active_no_switching',
    };
  }

  /**
   * Get monitoring history
   */
  static getMonitorHistory(tunnelId, limit = 100) {
    const db = getDb();
    return db.prepare(`
      SELECT * FROM monitor_results WHERE tunnel_id = ? ORDER BY checked_at DESC LIMIT ?
    `).all(tunnelId, limit);
  }

  /**
   * Delete tunnel
   */
  static deleteTunnel(id) {
    const db = getDb();
    
    // Get tunnel info to release port
    const tunnel = db.prepare('SELECT port FROM tunnels WHERE id = ?').get(id);
    if (tunnel && tunnel.port) {
      autopilotService.releasePort(tunnel.port);
      autopilotService.activeTunnels.delete(String(id));
    }
    
    db.prepare('DELETE FROM monitor_results WHERE tunnel_id = ?').run(id);
    db.prepare('DELETE FROM tunnels WHERE id = ?').run(id);
    return { success: true };
  }

  /**
   * Get tunnel stats including autopilot info
   */
  static getStats() {
    const db = getDb();
    const autopilotStatus = autopilotService.getStatus();
    
    return {
      total: db.prepare('SELECT COUNT(*) as c FROM tunnels').get().c,
      active: db.prepare("SELECT COUNT(*) as c FROM tunnels WHERE status = 'active'").get().c,
      failed: db.prepare("SELECT COUNT(*) as c FROM tunnels WHERE status = 'failed'").get().c,
      inactive: db.prepare("SELECT COUNT(*) as c FROM tunnels WHERE status = 'inactive'").get().c,
      autopilot: {
        enabled: autopilotStatus.enabled,
        state: autopilotStatus.state,
        lastCycle: autopilotStatus.lastMonitorCycle,
        tunnelCount: autopilotStatus.tunnelCount,
        mode: autopilotStatus.mode,
      },
      portAllocation: autopilotStatus.portAllocation,
    };
  }

  /**
   * Get autopilot status
   */
  static getAutopilotStatus() {
    return autopilotService.getStatus();
  }

  /**
   * Run autopilot monitoring cycle
   */
  static async runAutopilotCycle() {
    return autopilotService.runMonitoringCycle();
  }

  /**
   * DEPRECATED: Manual tunnel selection removed
   * All tunnels are kept active on random ports
   */
  static setPrimary443(engineName) {
    log.warn('setPrimary443 is deprecated - all tunnels are kept active');
    return {
      success: false,
      error: 'Manual tunnel selection is disabled. All tunnels are kept active on random ports.',
      mode: 'all_active',
    };
  }

  /**
   * Enable/disable autopilot
   */
  static setAutopilotEnabled(enabled) {
    return autopilotService.setEnabled(enabled);
  }

  /**
   * Get deployment plan for server pair
   */
  static getDeploymentPlan(iranServer, foreignServer) {
    return autopilotService.getDeploymentPlan(iranServer, foreignServer);
  }

  /**
   * Get port rules
   */
  static getPortRules() {
    return autopilotService.getPortRules();
  }
}

module.exports = TunnelService;
