/**
 * Elahe Panel - Tunnel Management & Auto-Switch Service
 * Integrates with Autopilot for automatic best tunnel selection
 * Monitors tunnels every 10 minutes and switches to best available
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
   * Add a new tunnel configuration
   */
  static addTunnel(data) {
    const db = getDb();
    try {
      const result = db.prepare(`
        INSERT INTO tunnels (iran_server_id, foreign_server_id, protocol, transport, port, config, priority)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        data.iranServerId,
        data.foreignServerId,
        data.protocol,
        data.transport || 'tcp',
        data.port,
        JSON.stringify(data.config || {}),
        data.priority || 0
      );

      log.info('Tunnel added', { protocol: data.protocol, port: data.port });
      return { success: true, tunnel: db.prepare('SELECT * FROM tunnels WHERE id = ?').get(result.lastInsertRowid) };
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
      t.autopilotPrimary = (t.protocol === status.primary443 && t.port === 443);
      t.autopilotAlwaysOn = !!status.portAllocation?.alwaysOn?.[t.protocol];
    });

    return tunnels;
  }

  /**
   * Get active/primary tunnel
   */
  static getActiveTunnel(iranServerId) {
    const db = getDb();
    return db.prepare(`
      SELECT * FROM tunnels 
      WHERE iran_server_id = ? AND status = 'active' AND is_primary = 1 
      ORDER BY score DESC LIMIT 1
    `).get(iranServerId);
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
   * Delegates to autopilot for intelligent tunnel selection
   */
  static async runMonitoringCycle() {
    log.info('Starting monitoring cycle (with Autopilot)...');
    
    // Run autopilot monitoring cycle
    const autopilotResult = await autopilotService.runMonitoringCycle();

    // Also check DB-registered tunnels
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

    // Auto-switch logic: find best tunnel per iran_server
    const iranServerIds = [...new Set(tunnels.map(t => t.iran_server_id))];
    let switched = false;

    for (const iranId of iranServerIds) {
      const serverTunnels = tunnelResults
        .filter(r => {
          const t = tunnels.find(t => t.id === r.tunnelId);
          return t && t.iran_server_id === iranId;
        })
        .sort((a, b) => b.score - a.score);

      if (serverTunnels.length === 0) continue;

      const best = serverTunnels[0];
      const currentPrimary = db.prepare(`
        SELECT * FROM tunnels WHERE iran_server_id = ? AND is_primary = 1
      `).get(iranId);

      if (!currentPrimary || best.tunnelId !== currentPrimary.id) {
        if (!currentPrimary || currentPrimary.status === 'failed' || best.score > (currentPrimary?.score || 0) * 1.2) {
          db.prepare('UPDATE tunnels SET is_primary = 0 WHERE iran_server_id = ?').run(iranId);
          db.prepare('UPDATE tunnels SET is_primary = 1 WHERE id = ?').run(best.tunnelId);
          log.info(`Switched primary tunnel for server ${iranId} to tunnel ${best.tunnelId} (${best.protocol}), score: ${best.score}`);
          switched = true;
        }
      }
    }

    // Cleanup old monitor results (keep last 24h)
    db.prepare("DELETE FROM monitor_results WHERE checked_at < datetime('now', '-1 day')").run();

    log.info(`Monitoring cycle complete: checked ${tunnelResults.length} DB tunnels + autopilot engines, switched: ${switched}`);
    
    return {
      checked: tunnelResults.length,
      switched,
      results: tunnelResults,
      autopilot: autopilotResult,
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
      primary: db.prepare('SELECT COUNT(*) as c FROM tunnels WHERE is_primary = 1').get().c,
      autopilot: {
        enabled: autopilotStatus.enabled,
        primary443: autopilotStatus.primary443,
        state: autopilotStatus.state,
        lastCycle: autopilotStatus.lastMonitorCycle,
        switchCount: autopilotStatus.switchCount,
      },
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
   * Set primary tunnel for port 443 manually
   */
  static setPrimary443(engineName) {
    return autopilotService.setPrimary443(engineName);
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
