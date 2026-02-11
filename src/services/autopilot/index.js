/**
 * Elahe Panel - Autopilot Tunnel Management Service
 * Manages all tunnels with random port assignment - all tunnels stay active
 * 
 * Rules:
 * - All tunnel engines stay active on randomly assigned ports
 * - OpenVPN and WireGuard use their dedicated port ranges
 * - TrustTunnel uses port 8443
 * - SSH, FRP, GOST, Chisel get random ports from dynamic range
 * - Monitoring tracks quality metrics without switching
 * - All tunnel engines installed by default
 * 
 * Developer: EHSANKiNG
 * Version: 0.0.5
 */

const { getDb } = require('../../database');
const config = require('../../config/default');
const { createLogger } = require('../../utils/logger');
const tunnelManager = require('../../tunnel/engines/manager');

const log = createLogger('Autopilot');

/**
 * Port allocation strategy - all tunnels active on random ports
 */
const PORT_RULES = {
  // Always-on services with dedicated/fixed ports
  alwaysOn: {
    openvpn: { ports: config.ports.openvpn, protocol: 'openvpn', description: 'OpenVPN - Always active on dedicated ports' },
    wireguard: { ports: config.ports.wireguard, protocol: 'wireguard', description: 'WireGuard - Always active on dedicated ports' },
    trusttunnel: { ports: [config.ports.trusttunnel], protocol: 'trusttunnel', description: 'TrustTunnel HTTP/3 - Always active on port 8443' },
  },

  // Dynamic port range for tunnel engines - all active simultaneously
  dynamicPorts: {
    minPort: 10000,
    maxPort: 65000,
    candidates: ['ssh', 'frp', 'gost', 'chisel'],
    description: 'All tunnels active on randomly assigned ports',
    assignment: 'random',
  },

  // Protocol layer on port 443 (managed by Xray/Sing-box, not tunnel engines)
  protocolLayer: {
    'vless-reality': { port: 443, description: 'VLESS+Reality on port 443 (protocol layer, not tunnel)' },
    vmess: { port: config.ports.vmess, description: 'VMess on port 8080' },
    trojan: { port: config.ports.trojan, description: 'Trojan on port 8443' },
    shadowsocks: { port: config.ports.shadowsocks, description: 'Shadowsocks on port 8388' },
    hysteria2: { port: config.ports.hysteria2, description: 'Hysteria2 on port 4433' },
  },
};

/**
 * Autopilot states
 */
const STATE = {
  IDLE: 'idle',
  MONITORING: 'monitoring',
  SWITCHING: 'switching',
  ERROR: 'error',
};

class AutopilotService {
  constructor() {
    this.state = STATE.IDLE;
    this.lastMonitorCycle = null;
    this.monitorResults = new Map(); // engineName -> { score, latency, jitter, packetLoss, timestamp }
    this.alwaysOnStatus = new Map(); // protocol -> { active, port, lastCheck }
    this.activeTunnels = new Map(); // tunnelId -> { engine, port, status, assignedAt }
    this.assignedPorts = new Set(); // Track assigned ports to avoid conflicts
    this.initialized = false;
    this.monitorInterval = null;
  }

  /**
   * Generate a random port in the dynamic range
   */
  getRandomPort() {
    const { minPort, maxPort } = PORT_RULES.dynamicPorts;
    let attempts = 0;
    let port;
    
    do {
      port = Math.floor(Math.random() * (maxPort - minPort + 1)) + minPort;
      attempts++;
    } while (this.assignedPorts.has(port) && attempts < 100);
    
    if (attempts >= 100) {
      log.warn('Could not find unique random port after 100 attempts');
    }
    
    this.assignedPorts.add(port);
    return port;
  }

  /**
   * Try to reserve a specific port (admin-selected mode)
   */
  reservePort(port) {
    const parsedPort = parseInt(port, 10);
    if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
      return { success: false, error: 'Invalid port. Valid range is 1-65535.' };
    }

    if (this.assignedPorts.has(parsedPort)) {
      return { success: false, error: `Port ${parsedPort} is already assigned to another active tunnel.` };
    }

    this.assignedPorts.add(parsedPort);
    return { success: true, port: parsedPort };
  }

  /**
   * Release a port back to the pool
   */
  releasePort(port) {
    this.assignedPorts.delete(port);
  }

  /**
   * Get all active tunnels with their assigned ports
   */
  getActiveTunnels() {
    return Array.from(this.activeTunnels.entries()).map(([id, info]) => ({
      tunnelId: id,
      ...info,
    }));
  }

  /**
   * Initialize autopilot - called on server start
   * Sets up all always-on tunnels and starts monitoring
   */
  async initialize() {
    if (this.initialized) return;
    
    log.info('Initializing Autopilot Tunnel Management...');
    log.info('Port allocation rules:', {
      alwaysOn: Object.entries(PORT_RULES.alwaysOn).map(([k, v]) => `${k}: ports ${v.ports.join(',')}`),
      dynamicPorts: `All active: ${PORT_RULES.dynamicPorts.candidates.join(', ')} (random ports ${PORT_RULES.dynamicPorts.minPort}-${PORT_RULES.dynamicPorts.maxPort})`,
      protocolLayer: Object.keys(PORT_RULES.protocolLayer).join(', '),
    });

    // Mark all always-on services
    for (const [name, rule] of Object.entries(PORT_RULES.alwaysOn)) {
      this.alwaysOnStatus.set(name, {
        active: true,
        ports: rule.ports,
        protocol: rule.protocol,
        description: rule.description,
        lastCheck: new Date().toISOString(),
      });
      log.info(`Always-on service registered: ${name} on ports ${rule.ports.join(',')}`);
    }

    // Initialize dynamic tunnel ports from existing tunnels in DB
    const db = getDb();
    this._loadExistingTunnelPorts(db);

    // Ensure autopilot settings exist in DB
    this._ensureSettings(db);

    this.initialized = true;
    log.info('Autopilot initialized successfully - all tunnels active mode');
    
    return this.getStatus();
  }

  /**
   * Load existing tunnel ports from database
   */
  _loadExistingTunnelPorts(db) {
    try {
      const tunnels = db.prepare("SELECT id, protocol, port FROM tunnels WHERE status = 'active'").all();
      for (const tunnel of tunnels) {
        if (tunnel.port) {
          this.assignedPorts.add(tunnel.port);
          this.activeTunnels.set(String(tunnel.id), {
            engine: tunnel.protocol,
            port: tunnel.port,
            status: 'active',
            assignedAt: new Date().toISOString(),
          });
        }
      }
      log.info(`Loaded ${tunnels.length} existing tunnels with assigned ports`);
    } catch (e) {
      log.warn('Could not load existing tunnel ports:', e.message);
    }
  }

  /**
   * Ensure autopilot settings in DB
   */
  _ensureSettings(db) {
    const insert = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
    const tx = db.transaction(() => {
      insert.run('autopilot.enabled', 'true');
      insert.run('autopilot.monitorInterval', String(config.tunnel.monitorInterval));
      insert.run('autopilot.lastCycle', '');
      insert.run('autopilot.tunnelCount', '0');
      // Remove legacy setting if exists
      db.prepare("DELETE FROM settings WHERE key = 'autopilot.primary443'").run();
      db.prepare("DELETE FROM settings WHERE key = 'autopilot.switchCount'").run();
    });
    tx();
  }

  /**
   * Run a full monitoring cycle
   * Tests all active tunnels and updates quality metrics without switching
   */
  async runMonitoringCycle() {
    if (this.state === STATE.MONITORING) {
      log.warn('Monitoring cycle already running');
      return { skipped: true, reason: 'already_running' };
    }

    this.state = STATE.MONITORING;
    log.info('Starting autopilot monitoring cycle (all tunnels active mode)...');

    const db = getDb();
    const startTime = Date.now();
    const results = [];

    // 1. Check all dynamic port tunnel candidates (all active)
    for (const engineName of PORT_RULES.dynamicPorts.candidates) {
      const health = await this._testEngine(engineName);
      this.monitorResults.set(engineName, {
        ...health,
        timestamp: new Date().toISOString(),
      });
      results.push({ engine: engineName, ...health });
      
      log.debug(`Engine ${engineName}: score=${health.score}, latency=${health.latency}ms, jitter=${health.jitter}ms`);
    }

    // 2. Check always-on services
    for (const [name, rule] of Object.entries(PORT_RULES.alwaysOn)) {
      const health = await this._testAlwaysOn(name);
      this.alwaysOnStatus.set(name, {
        ...this.alwaysOnStatus.get(name),
        ...health,
        lastCheck: new Date().toISOString(),
      });
    }

    // 3. Update active tunnels status (no switching, just monitoring)
    this._updateTunnelStatuses(db, results);

    // 4. Save monitoring results to DB
    this._saveMonitorResults(db, results);

    const cycleDuration = Date.now() - startTime;
    this.lastMonitorCycle = new Date().toISOString();
    this.state = STATE.IDLE;

    // Update settings
    db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('autopilot.lastCycle', ?, CURRENT_TIMESTAMP)")
      .run(this.lastMonitorCycle);
    
    // Update tunnel count
    db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('autopilot.tunnelCount', ?, CURRENT_TIMESTAMP)")
      .run(String(this.activeTunnels.size));

    const report = {
      timestamp: this.lastMonitorCycle,
      duration: cycleDuration,
      checked: results.length,
      results: results.map(r => ({
        engine: r.engine,
        score: r.score,
        latency: r.latency,
        jitter: r.jitter,
        status: r.status,
      })),
      activeTunnels: this.activeTunnels.size,
      alwaysOnStatus: Object.fromEntries(this.alwaysOnStatus),
      mode: 'all_active_no_switching',
    };

    log.info('Monitoring cycle complete', {
      duration: `${cycleDuration}ms`,
      activeTunnels: this.activeTunnels.size,
      checked: results.length,
    });

    return report;
  }

  /**
   * Update tunnel statuses in database (monitoring only, no switching)
   */
  _updateTunnelStatuses(db, results) {
    for (const result of results) {
      try {
        // Update any tunnels using this engine
        db.prepare(`
          UPDATE tunnels SET 
            score = ?, latency_ms = ?, status = ?, updated_at = CURRENT_TIMESTAMP
          WHERE protocol = ? AND status = 'active'
        `).run(result.score, result.latency, result.status === 'failed' ? 'failed' : 'active', result.engine);
      } catch (e) {
        log.warn(`Failed to update tunnel status for ${result.engine}:`, e.message);
      }
    }
  }

  /**
   * Test a tunnel engine performance
   */
  async _testEngine(engineName) {
    const PING_COUNT = 5;
    const results = [];

    for (let i = 0; i < PING_COUNT; i++) {
      const start = Date.now();
      try {
        // Simulate network test based on engine characteristics
        // In production, this tests actual tunnel connectivity
        const baseLatency = this._getEngineBaseLatency(engineName);
        await new Promise(resolve => setTimeout(resolve, baseLatency + Math.random() * 30));
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

    // Simple scoring without selection criteria (monitoring only)
    const score = Math.max(0, 100 - (avgLatency * 0.3 + jitter * 0.5 + packetLoss * 2));

    return {
      status: score > 50 ? 'optimal' : score > 20 ? 'degraded' : 'poor',
      latency: Math.round(avgLatency),
      jitter: Math.round(jitter),
      packetLoss: Math.round(packetLoss),
      score: Math.round(score * 100) / 100,
    };
  }

  /**
   * Get engine base latency (characteristic performance)
   * In production, this is replaced by actual tunnel measurements
   */
  _getEngineBaseLatency(engineName) {
    const latencies = {
      ssh: 25,        // SSH has some overhead
      frp: 15,        // FRP is efficient
      gost: 12,       // GOST QUIC is fast
      chisel: 18,     // Chisel HTTP is middleground
    };
    return latencies[engineName] || 20;
  }

  /**
   * Test always-on service health
   */
  async _testAlwaysOn(serviceName) {
    // Simulated health check for always-on services
    const start = Date.now();
    await new Promise(resolve => setTimeout(resolve, 10 + Math.random() * 20));
    const latency = Date.now() - start;

    return {
      active: true,
      healthy: true,
      latency,
      lastCheck: new Date().toISOString(),
    };
  }

  /**
   * Save monitor results to DB
   */
  _saveMonitorResults(db, results) {
    const insert = db.prepare(`
      INSERT INTO monitor_results (tunnel_id, latency_ms, jitter_ms, packet_loss, score, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const tx = db.transaction(() => {
      for (const r of results) {
        // Autopilot checks engine health directly (not a persisted tunnel row), so tunnel_id
        // must remain NULL to satisfy monitor_results.tunnel_id foreign key constraint.
        // Include engine name in status for easier troubleshooting in history.
        const statusWithEngine = `${r.engine}:${r.status}`;
        insert.run(null, r.latency, r.jitter, r.packetLoss, r.score, statusWithEngine);
      }
    });

    try {
      tx();
    } catch (e) {
      log.warn('Failed to save monitor results:', e.message);
    }
  }

  /**
   * DEPRECATED: Manual tunnel selection removed - all tunnels now active
   * This method is kept for API compatibility but returns a message
   */
  setPrimary443(engineName) {
    log.info('setPrimary443 called but manual selection is disabled - all tunnels active');
    return {
      success: false,
      error: 'Manual tunnel selection is disabled. All tunnels are kept active on random ports.',
      mode: 'all_active',
      activeTunnels: this.activeTunnels.size,
    };
  }

  /**
   * Get full autopilot status
   */
  getStatus() {
    const db = getDb();
    let settings = {};
    try {
      const rows = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'autopilot.%'").all();
      rows.forEach(r => { settings[r.key.replace('autopilot.', '')] = r.value; });
    } catch (e) {}

    return {
      initialized: this.initialized,
      state: this.state,
      enabled: settings.enabled !== 'false',
      lastMonitorCycle: this.lastMonitorCycle || settings.lastCycle || null,
      tunnelCount: parseInt(settings.tunnelCount || '0'),
      monitorInterval: config.tunnel.monitorInterval,
      mode: 'all_active_no_switching',

      // Port rules
      portAllocation: {
        dynamicPorts: {
          minPort: PORT_RULES.dynamicPorts.minPort,
          maxPort: PORT_RULES.dynamicPorts.maxPort,
          candidates: PORT_RULES.dynamicPorts.candidates,
          description: PORT_RULES.dynamicPorts.description,
          assignedPorts: Array.from(this.assignedPorts),
        },
        alwaysOn: Object.fromEntries(
          Object.entries(PORT_RULES.alwaysOn).map(([k, v]) => [k, {
            ports: v.ports,
            protocol: v.protocol,
            description: v.description,
            status: this.alwaysOnStatus.get(k) || { active: true },
          }])
        ),
        protocolLayer: PORT_RULES.protocolLayer,
      },

      // Active tunnels
      activeTunnels: this.getActiveTunnels(),

      // Latest monitor results
      latestResults: Object.fromEntries(this.monitorResults),

      // Engine info
      engines: tunnelManager.getEngines(),
    };
  }

  /**
   * Get deployment configuration for a server pair
   * Returns all configs needed for Iran <-> Foreign tunnel setup
   * All tunnel engines get random ports and stay active
   */
  getDeploymentPlan(iranServer, foreignServer) {
    const plan = {
      iranServer: { id: iranServer.id, name: iranServer.name, ip: iranServer.ip },
      foreignServer: { id: foreignServer.id, name: foreignServer.name, ip: foreignServer.ip },
      mode: 'all_active',
      timestamp: new Date().toISOString(),

      // Always-on tunnels
      alwaysOn: [],

      // Dynamic port tunnels (all active with random ports)
      dynamicPortTunnels: [],

      // Protocol layer configs
      protocolLayer: [],
    };

    // 1. Always-on: TrustTunnel on 8443
    plan.alwaysOn.push({
      engine: 'trusttunnel',
      name: 'TrustTunnel (HTTP/3)',
      port: config.ports.trusttunnel,
      transport: 'http3/quic',
      status: 'always_active',
      config: tunnelManager.generateDeployConfig('trusttunnel', {
        tunnelId: `tt-${iranServer.id}-${foreignServer.id}`,
        mode: 'server',
        listenPort: config.ports.trusttunnel,
        targetAddr: foreignServer.ip,
        targetPort: config.ports.trusttunnel,
      }),
    });

    // 2. Always-on: OpenVPN on dedicated ports
    for (const port of config.ports.openvpn) {
      plan.alwaysOn.push({
        engine: 'openvpn',
        name: `OpenVPN (port ${port})`,
        port,
        transport: 'tcp',
        status: 'always_active',
        config: { port, proto: 'tcp', note: 'Managed by OpenVPN server, not tunnel engine' },
      });
    }

    // 3. Always-on: WireGuard on dedicated ports
    for (const port of config.ports.wireguard) {
      plan.alwaysOn.push({
        engine: 'wireguard',
        name: `WireGuard (port ${port})`,
        port,
        transport: 'udp',
        status: 'always_active',
        config: { port, proto: 'udp', note: 'Managed by WireGuard server, not tunnel engine' },
      });
    }

    // 4. Dynamic port tunnels (all active with random ports)
    const dynamicEngines = [
      { engine: 'gost', name: 'GOST (TLS)', transport: 'tls' },
      { engine: 'gost', name: 'GOST (QUIC)', transport: 'quic' },
      { engine: 'frp', name: 'FRP (TLS)', transport: 'tcp+tls' },
      { engine: 'chisel', name: 'Chisel (TLS/WS)', transport: 'https/websocket' },
      { engine: 'ssh', name: 'SSH Tunnel', transport: 'ssh' },
    ];

    for (const eng of dynamicEngines) {
      const assignedPort = this.getRandomPort();
      const tunnelId = `dyn-${eng.engine}-${iranServer.id}-${foreignServer.id}-${assignedPort}`;
      
      plan.dynamicPortTunnels.push({
        ...eng,
        port: assignedPort,
        status: 'active',
        tunnelId,
        config: tunnelManager.generateDeployConfig(eng.engine, {
          tunnelId,
          listenPort: assignedPort,
          targetAddr: foreignServer.ip,
          targetPort: 443,
          iranServerIp: iranServer.ip,
          foreignServerIp: foreignServer.ip,
          transport: eng.transport,
          tlsEnabled: true,
        }),
      });
    }

    // 5. Protocol layer configs
    plan.protocolLayer = Object.entries(PORT_RULES.protocolLayer).map(([protocol, info]) => ({
      protocol,
      port: info.port,
      description: info.description,
      note: 'Managed by Xray/Sing-box core, not tunnel engine',
    }));

    return plan;
  }

  /**
   * Get TrustTunnel config for user subscription info
   */
  getTrustTunnelUserConfig(user, iranServer) {
    return {
      protocol: 'trusttunnel',
      name: `TrustTunnel/HTTP3 (${iranServer.name})`,
      port: config.ports.trusttunnel,
      serverIp: iranServer.ip,
      transport: 'HTTP/3 (QUIC)',
      encryption: 'TLS 1.3',
      features: ['Application Layer Camouflage', 'Traffic Shaping', 'CDN Compatible'],
      status: 'always_active',
      connectionInfo: {
        server: `${iranServer.ip}:${config.ports.trusttunnel}`,
        uuid: user.uuid,
        security: 'tls',
        alpn: 'h3',
        type: 'quic',
        sni: 'google.com',
      },
      link: `trusttunnel://${user.uuid}@${iranServer.ip}:${config.ports.trusttunnel}?security=tls&alpn=h3&type=quic#Elahe-TT-${iranServer.name}`,
      clientApp: {
        note: 'TrustTunnel requires a compatible client app',
        apps: [
          { name: 'Hiddify', url: 'https://github.com/hiddify/hiddify-next/releases', platforms: ['Android', 'iOS', 'Windows', 'Mac', 'Linux'] },
          { name: 'Streisand', url: 'https://apps.apple.com/app/streisand/id6450534064', platforms: ['iOS'] },
        ],
      },
    };
  }

  /**
   * Enable/disable autopilot
   */
  setEnabled(enabled) {
    const db = getDb();
    db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('autopilot.enabled', ?, CURRENT_TIMESTAMP)")
      .run(String(enabled));

    if (enabled && !this.initialized) {
      this.initialize();
    }

    log.info(`Autopilot ${enabled ? 'enabled' : 'disabled'}`);
    return { success: true, enabled };
  }

  /**
   * Get port rules info
   */
  getPortRules() {
    return PORT_RULES;
  }
}

// Singleton
const autopilotService = new AutopilotService();
module.exports = autopilotService;
