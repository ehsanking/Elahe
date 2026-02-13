/**
 * Elahe Panel - Tunnel Manager
 * Orchestrates all tunnel engines (SSH, FRP, GOST, Chisel, TrustTunnel)
 * Manages lifecycle, health checks, auto-switching, and deployment
 * Developer: EHSANKiNG
 */

const { getDb } = require('../../database');
const { createLogger } = require('../../utils/logger');
const config = require('../../config/default');
const autopilotService = require('../../services/autopilot');

// Import all tunnel engines
const sshEngine = require('./ssh');
const frpEngine = require('./frp');
const gostEngine = require('./gost');
const chiselEngine = require('./chisel');
const trustTunnelEngine = require('./trusttunnel');

const log = createLogger('TunnelManager');

/**
 * Engine registry
 */
const ENGINES = {
  ssh: {
    instance: sshEngine,
    name: 'SSH Tunnel',
    description: 'Encrypted SSH port forwarding',
    transport: ['tcp'],
    encryption: 'SSH (Ed25519/RSA)',
    priority: 3,        // Fallback priority (higher = more fallback)
    role: 'backup',
  },
  frp: {
    instance: frpEngine,
    name: 'FRP (TLS)',
    description: 'Fast Reverse Proxy with TLS encryption',
    transport: ['tcp', 'udp', 'stcp', 'xtcp', 'http', 'https'],
    encryption: 'TLS 1.3',
    priority: 2,
    role: 'backup',
  },
  gost: {
    instance: gostEngine,
    name: 'GOST (TLS/QUIC)',
    description: 'GO Simple Tunnel with TLS and QUIC transport',
    transport: ['tls', 'quic', 'wss', 'h2', 'grpc', 'mtls', 'mquic'],
    encryption: 'TLS 1.3 / QUIC',
    priority: 2,
    role: 'backup',
  },
  chisel: {
    instance: chiselEngine,
    name: 'Chisel (TLS)',
    description: 'HTTP-based tunnel with TLS, firewall-friendly',
    transport: ['http', 'https', 'websocket'],
    encryption: 'TLS 1.3',
    priority: 2,
    role: 'backup',
  },

  psiphon: {
    instance: chiselEngine,
    name: 'Psiphon Bridge',
    description: 'Psiphon-compatible HTTPS bridge profile powered by Chisel transport',
    transport: ['https', 'websocket'],
    encryption: 'TLS 1.3',
    priority: 2,
    role: 'backup',
  },
  trusttunnel: {
    instance: trustTunnelEngine,
    name: 'TrustTunnel (HTTP/3)',
    description: 'HTTP/3 based tunnel with camouflage and traffic shaping',
    transport: ['http3', 'quic'],
    encryption: 'TLS 1.3 / QUIC / HTTP/3',
    priority: 1,        // Secondary channel
    role: 'secondary',
    features: ['camouflage', 'traffic-shaping', 'fake-website', 'cdn-compatible'],
  },
};

class TunnelManager {
  constructor() {
    this.activeTunnels = new Map(); // tunnelId -> { engine, dbRecord, ... }
  }

  /**
   * Get all available engines info
   */
  getEngines() {
    const engines = {};
    for (const [key, eng] of Object.entries(ENGINES)) {
      engines[key] = {
        name: eng.name,
        description: eng.description,
        transport: eng.transport,
        encryption: eng.encryption,
        priority: eng.priority,
        role: eng.role,
        features: eng.features || [],
      };
    }
    return engines;
  }

  /**
   * Create and start a tunnel with random port assignment
   */
  async createTunnel(options) {
    const {
      engine: rawEngineName,
      iranServerId,
      foreignServerId,
      port,
      transport = 'tcp',
      tunnelConfig = {},
    } = options;

    const engineName = rawEngineName === 'cphil' ? 'chisel' : rawEngineName;
    const engineDef = ENGINES[engineName];
    if (!engineDef) {
      return { success: false, error: `Unknown engine: ${engineName}. Available: ${Object.keys(ENGINES).join(', ')}` };
    }

    const db = getDb();

    // Get server details
    const iranServer = db.prepare('SELECT * FROM servers WHERE id = ?').get(iranServerId);
    const foreignServer = db.prepare('SELECT * FROM servers WHERE id = ?').get(foreignServerId);

    if (!iranServer || !foreignServer) {
      return { success: false, error: 'Iran or Foreign server not found' };
    }

    // Port policy: random (default) OR admin-selected
    let assignedPort;
    if (port === undefined || port === null || port === '') {
      assignedPort = autopilotService.getRandomPort();
    } else {
      const reserveResult = autopilotService.reservePort(port);
      if (!reserveResult.success) {
        return reserveResult;
      }
      assignedPort = reserveResult.port;
    }

    if ([80, 443].includes(assignedPort)) {
      autopilotService.releasePort(assignedPort);
      return {
        success: false,
        error: 'Port 80 and 443 are reserved for web/SSL entry and cannot be used for tunnel engines.',
      };
    }

    const existing = db.prepare("SELECT id FROM tunnels WHERE port = ? AND status = 'active' LIMIT 1").get(assignedPort);
    if (existing) {
      autopilotService.releasePort(assignedPort);
      return { success: false, error: `Port ${assignedPort} is already in use by tunnel #${existing.id}.` };
    }

    // Create DB record
    const tunnelId = `${engineName}-${iranServer.id}-${foreignServer.id}-${assignedPort}`;
    const result = db.prepare(`
      INSERT INTO tunnels (iran_server_id, foreign_server_id, protocol, transport, port, config, priority, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(
      iranServerId,
      foreignServerId,
      engineName,
      transport,
      assignedPort,
      JSON.stringify({ ...tunnelConfig, engine: engineName }),
      engineDef.priority
    );

    const dbTunnel = db.prepare('SELECT * FROM tunnels WHERE id = ?').get(result.lastInsertRowid);

    // Register with autopilot
    autopilotService.activeTunnels.set(String(dbTunnel.id), {
      engine: engineName,
      port: assignedPort,
      status: 'active',
      assignedAt: new Date().toISOString(),
    });

    // Start the engine
    const startOpts = {
      iranServerIp: iranServer.ip,
      foreignServerIp: foreignServer.ip,
      foreignServerPort: foreignServer.port || 22,
      listenPort: assignedPort,
      localPort: assignedPort,
      remotePort: tunnelConfig.remotePort || assignedPort,
      targetAddr: foreignServer.ip,
      targetPort: tunnelConfig.targetPort || 443,
      tlsEnabled: tunnelConfig.tlsEnabled !== false,
      ...tunnelConfig,
    };

    const startResult = await engineDef.instance.start(tunnelId, startOpts);

    if (startResult.success) {
      this.activeTunnels.set(tunnelId, {
        engine: engineName,
        dbId: dbTunnel.id,
        dbRecord: dbTunnel,
        startOpts,
      });

      log.info('Tunnel created and started', { tunnelId, engine: engineName, port: assignedPort });
    } else {
      // Mark as failed in DB and release port
      db.prepare("UPDATE tunnels SET status = 'failed' WHERE id = ?").run(dbTunnel.id);
      autopilotService.releasePort(assignedPort);
    }

    return {
      success: startResult.success,
      tunnelId,
      dbId: dbTunnel.id,
      engine: engineName,
      port: assignedPort,
      ...startResult,
    };
  }

  /**
   * Stop a tunnel
   */
  async stopTunnel(tunnelId) {
    const info = this.activeTunnels.get(tunnelId);
    if (!info) {
      // Try to find by DB id
      const db = getDb();
      const dbTunnel = db.prepare('SELECT * FROM tunnels WHERE id = ?').get(tunnelId);
      if (dbTunnel) {
        // Release port and remove from autopilot
        if (dbTunnel.port) {
          autopilotService.releasePort(dbTunnel.port);
          autopilotService.activeTunnels.delete(String(tunnelId));
        }
        db.prepare("UPDATE tunnels SET status = 'inactive' WHERE id = ?").run(tunnelId);
        return { success: true, note: 'DB record updated, no active process found' };
      }
      return { success: false, error: 'Tunnel not found' };
    }

    const engineDef = ENGINES[info.engine];
    const result = await engineDef.instance.stop(tunnelId);

    if (result.success) {
      const db = getDb();
      db.prepare("UPDATE tunnels SET status = 'inactive', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(info.dbId);
      
      // Release port and remove from autopilot
      if (info.dbRecord && info.dbRecord.port) {
        autopilotService.releasePort(info.dbRecord.port);
      }
      autopilotService.activeTunnels.delete(String(info.dbId));
      
      this.activeTunnels.delete(tunnelId);
    }

    return result;
  }

  /**
   * Get tunnel status
   */
  getTunnelStatus(tunnelId) {
    const info = this.activeTunnels.get(tunnelId);
    if (!info) return null;

    const engineDef = ENGINES[info.engine];
    const status = engineDef.instance.getStatus(tunnelId);

    return {
      ...status,
      engine: info.engine,
      engineName: engineDef.name,
      dbId: info.dbId,
    };
  }

  /**
   * Get all active tunnels status
   */
  getAllStatus() {
    const statuses = [];
    for (const [tunnelId, info] of this.activeTunnels) {
      const status = this.getTunnelStatus(tunnelId);
      if (status) statuses.push(status);
    }
    return statuses;
  }

  /**
   * Health check all tunnels
   */
  async healthCheckAll() {
    const results = [];
    for (const [tunnelId, info] of this.activeTunnels) {
      const engineDef = ENGINES[info.engine];
      const health = await engineDef.instance.healthCheck(tunnelId);
      results.push({ tunnelId, engine: info.engine, ...health });
    }
    return results;
  }

  /**
   * Generate deployment configuration for a tunnel
   */
  generateDeployConfig(engineName, options) {
    const normalizedEngine = engineName === 'cphil' ? 'chisel' : engineName;
    const engineDef = ENGINES[normalizedEngine];
    if (!engineDef) return { error: `Unknown engine: ${engineName}` };

    return engineDef.instance.generateDeployConfig(options);
  }

  /**
   * Get recommended tunnel setup for a server pair
   * Returns optimal tunnel configuration with random port assignment
   */
  getRecommendedSetup(iranServer, foreignServer) {
    const recommendations = [
      {
        priority: 0,
        engine: 'vless-reality',
        name: 'Stealth Channel (Primary)',
        description: 'VLESS + Reality with XTLS-Vision - Primary channel',
        config: {
          port: 443,
          transport: 'tcp+xtls-vision',
          sni: 'google.com',
          fingerprint: 'chrome',
        },
      },
      {
        priority: 1,
        engine: 'trusttunnel',
        name: 'Web Channel (Secondary)',
        description: 'TrustTunnel HTTP/3 with camouflage',
        config: {
          port: 8443,
          transport: 'http3/quic',
          camouflageEnabled: true,
          sni: 'google.com',
        },
      },
      {
        priority: 2,
        engine: 'frp',
        name: 'FRP Tunnel',
        description: 'FRP with TLS encryption - random port assigned on creation',
        config: {
          port: 'random', // Will be assigned on creation
          transport: 'tcp+tls',
          tlsEnabled: true,
        },
      },
      {
        priority: 2,
        engine: 'gost',
        name: 'GOST TLS',
        description: 'GOST with TLS transport - random port assigned on creation',
        config: {
          port: 'random', // Will be assigned on creation
          transport: 'tls',
          mode: 'relay',
        },
      },
      {
        priority: 2,
        engine: 'gost',
        name: 'GOST QUIC',
        description: 'GOST with QUIC transport - random port assigned on creation',
        config: {
          port: 'random', // Will be assigned on creation
          transport: 'quic',
          mode: 'relay',
        },
      },
      {
        priority: 2,
        engine: 'chisel',
        name: 'Chisel Tunnel',
        description: 'Chisel HTTP tunnel with TLS - random port assigned on creation',
        config: {
          port: 'random', // Will be assigned on creation
          transport: 'https/websocket',
          tlsEnabled: true,
        },
      },

      {
        priority: 2,
        engine: 'psiphon',
        name: 'Psiphon Bridge',
        description: 'Psiphon-compatible HTTPS bridge with random port assignment',
        config: {
          port: 'random',
          transport: 'https/websocket',
          tlsEnabled: true,
        },
      },
      {
        priority: 3,
        engine: 'ssh',
        name: 'SSH Tunnel',
        description: 'SSH tunnel - random port assigned on creation',
        config: {
          port: 'random', // Will be assigned on creation
          transport: 'ssh',
          type: 'local',
        },
      },
    ];

    return {
      iranServer: { id: iranServer.id, name: iranServer.name, ip: iranServer.ip },
      foreignServer: { id: foreignServer.id, name: foreignServer.name, ip: foreignServer.ip },
      recommendations,
      totalChannels: recommendations.length,
      mode: 'all_active_random_ports',
      note: 'All tunnels remain active on randomly assigned ports (10000-65000). No manual selection needed.',
    };
  }

  /**
   * Auto-setup all recommended tunnels for a server pair
   * All tunnels get random port assignments and stay active
   */
  async autoSetup(iranServerId, foreignServerId) {
    const db = getDb();
    const iranServer = db.prepare('SELECT * FROM servers WHERE id = ?').get(iranServerId);
    const foreignServer = db.prepare('SELECT * FROM servers WHERE id = ?').get(foreignServerId);

    if (!iranServer || !foreignServer) {
      return { success: false, error: 'Servers not found' };
    }

    const setup = this.getRecommendedSetup(iranServer, foreignServer);
    const results = [];

    for (const rec of setup.recommendations) {
      if (rec.engine === 'vless-reality') {
        // VLESS-Reality is handled by the protocol layer, not tunnel engine
        results.push({
          engine: rec.engine,
          name: rec.name,
          status: 'configured_at_protocol_layer',
        });
        continue;
      }

      // Skip fixed-port services (TrustTunnel, OpenVPN, WireGuard) 
      // as they're managed separately
      if (['trusttunnel', 'openvpn', 'wireguard'].includes(rec.engine)) {
        results.push({
          engine: rec.engine,
          name: rec.name,
          status: 'skipped_fixed_port_service',
          note: `${rec.engine} uses fixed ports and is managed separately`,
        });
        continue;
      }

      try {
        // Create tunnel with random port (don't specify port)
        const result = await this.createTunnel({
          engine: rec.engine,
          iranServerId,
          foreignServerId,
          // port is omitted - will be randomly assigned
          transport: rec.config.transport,
          tunnelConfig: rec.config,
        });
        results.push({
          engine: rec.engine,
          name: rec.name,
          assignedPort: result.port,
          ...result,
        });
      } catch (err) {
        results.push({
          engine: rec.engine,
          name: rec.name,
          success: false,
          error: err.message,
        });
      }
    }

    return {
      success: true,
      mode: 'all_active_random_ports',
      iranServer: iranServer.name,
      foreignServer: foreignServer.name,
      tunnelsCreated: results.filter(r => r.success).length,
      total: results.length,
      results,
    };
  }

  /**
   * Cleanup all tunnels
   */
  async cleanup() {
    log.info('Cleaning up all tunnel engines...');
    await Promise.all([
      sshEngine.cleanup(),
      frpEngine.cleanup(),
      gostEngine.cleanup(),
      chiselEngine.cleanup(),
      trustTunnelEngine.cleanup(),
    ]);
    this.activeTunnels.clear();
    log.info('All tunnel engines cleaned up');
  }

  /**
   * Get summary stats
   */
  getStats() {
    const stats = {
      engines: {},
      total: 0,
      active: 0,
      byEngine: {},
    };

    for (const [key, eng] of Object.entries(ENGINES)) {
      const engineStatus = eng.instance.getAllStatus();
      stats.engines[key] = {
        name: eng.name,
        total: engineStatus.length,
        connected: engineStatus.filter(s => s.status === 'connected').length,
        failed: engineStatus.filter(s => s.status === 'failed' || s.status === 'error').length,
      };
      stats.total += engineStatus.length;
      stats.active += engineStatus.filter(s => s.status === 'connected').length;
    }

    stats.activeMap = this.activeTunnels.size;
    return stats;
  }
}

// Singleton
const tunnelManager = new TunnelManager();
module.exports = tunnelManager;
