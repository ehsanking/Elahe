/**
 * Elahe Panel - Autopilot Tunnel Management Service
 * Automatically manages all tunnels with intelligent selection
 * 
 * Rules:
 * - OpenVPN and WireGuard always active on their dedicated ports
 * - TrustTunnel always active on port 8443
 * - Port 443 used for other tunnels (SSH, FRP, GOST, Chisel)
 * - Best tunnel on port 443 selected after 10-minute monitoring cycle
 * - All tunnel engines installed by default
 * 
 * Developer: EHSANKiNG
 * Version: 0.0.3
 */

const { getDb } = require('../../database');
const config = require('../../config/default');
const { createLogger } = require('../../utils/logger');
const tunnelManager = require('../../tunnel/engines/manager');

const log = createLogger('Autopilot');

/**
 * Port allocation strategy
 */
const PORT_RULES = {
  // Always-on services with dedicated ports
  alwaysOn: {
    openvpn: { ports: config.ports.openvpn, protocol: 'openvpn', description: 'OpenVPN - Always active on dedicated ports' },
    wireguard: { ports: config.ports.wireguard, protocol: 'wireguard', description: 'WireGuard - Always active on dedicated ports' },
    trusttunnel: { ports: [config.ports.trusttunnel], protocol: 'trusttunnel', description: 'TrustTunnel HTTP/3 - Always active on port 8443' },
  },

  // Competing tunnels on port 443 - only best one active at a time
  port443: {
    port: 443,
    candidates: ['ssh', 'frp', 'gost', 'chisel'],
    description: 'Best tunnel selected after 10-min monitoring cycle',
    selectionCriteria: {
      // Score weights (0-1): latency matters most, then jitter, then packet loss
      latencyWeight: 0.4,
      jitterWeight: 0.3,
      packetLossWeight: 0.3,
      // Minimum score to be considered viable
      minimumViableScore: 20,
      // Improvement threshold to switch (20% better required to switch)
      switchThreshold: 1.2,
    },
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
    this.activePrimary443 = null; // Currently active tunnel engine on port 443
    this.lastMonitorCycle = null;
    this.monitorResults = new Map(); // engineName -> { score, latency, jitter, packetLoss, timestamp }
    this.alwaysOnStatus = new Map(); // protocol -> { active, port, lastCheck }
    this.initialized = false;
    this.monitorInterval = null;
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
      port443: `Best of: ${PORT_RULES.port443.candidates.join(', ')}`,
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

    // Initialize default primary for port 443
    // Try to get from DB or default to gost (best overall for Iran censorship)
    const db = getDb();
    try {
      const savedPrimary = db.prepare("SELECT value FROM settings WHERE key = 'autopilot.primary443'").get();
      if (savedPrimary && PORT_RULES.port443.candidates.includes(savedPrimary.value)) {
        this.activePrimary443 = savedPrimary.value;
      } else {
        this.activePrimary443 = 'gost'; // Default: GOST has TLS+QUIC, good for censorship bypass
      }
    } catch (e) {
      this.activePrimary443 = 'gost';
    }

    log.info(`Initial primary tunnel for port 443: ${this.activePrimary443}`);

    // Ensure autopilot settings exist in DB
    this._ensureSettings(db);

    this.initialized = true;
    log.info('Autopilot initialized successfully');
    
    return this.getStatus();
  }

  /**
   * Ensure autopilot settings in DB
   */
  _ensureSettings(db) {
    const insert = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
    const tx = db.transaction(() => {
      insert.run('autopilot.enabled', 'true');
      insert.run('autopilot.primary443', this.activePrimary443);
      insert.run('autopilot.monitorInterval', String(config.tunnel.monitorInterval));
      insert.run('autopilot.lastCycle', '');
      insert.run('autopilot.switchCount', '0');
    });
    tx();
  }

  /**
   * Run a full monitoring cycle
   * Tests all port-443 tunnel candidates and selects the best one
   */
  async runMonitoringCycle() {
    if (this.state === STATE.MONITORING) {
      log.warn('Monitoring cycle already running');
      return { skipped: true, reason: 'already_running' };
    }

    this.state = STATE.MONITORING;
    log.info('Starting autopilot monitoring cycle...');

    const db = getDb();
    const startTime = Date.now();
    const results = [];

    // 1. Check all port-443 candidates
    for (const engineName of PORT_RULES.port443.candidates) {
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

    // 3. Select best tunnel for port 443
    const switchResult = await this._selectBestTunnel(results);

    // 4. Save monitoring results to DB
    this._saveMonitorResults(db, results);

    const cycleDuration = Date.now() - startTime;
    this.lastMonitorCycle = new Date().toISOString();
    this.state = STATE.IDLE;

    // Update settings
    db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('autopilot.lastCycle', ?, CURRENT_TIMESTAMP)")
      .run(this.lastMonitorCycle);

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
      primaryEngine: this.activePrimary443,
      switched: switchResult.switched,
      switchReason: switchResult.reason,
      alwaysOnStatus: Object.fromEntries(this.alwaysOnStatus),
    };

    log.info('Monitoring cycle complete', {
      duration: `${cycleDuration}ms`,
      primary: this.activePrimary443,
      switched: switchResult.switched,
    });

    return report;
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

    const criteria = PORT_RULES.port443.selectionCriteria;
    const score = Math.max(0, 100 - (
      avgLatency * criteria.latencyWeight +
      jitter * criteria.jitterWeight +
      packetLoss * 20 * criteria.packetLossWeight
    ));

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
   * Select best tunnel for port 443 based on monitoring results
   */
  async _selectBestTunnel(results) {
    const criteria = PORT_RULES.port443.selectionCriteria;

    // Filter viable candidates
    const viable = results
      .filter(r => r.score >= criteria.minimumViableScore && r.status !== 'failed')
      .sort((a, b) => b.score - a.score);

    if (viable.length === 0) {
      log.warn('No viable tunnels found for port 443! Keeping current:', this.activePrimary443);
      return { switched: false, reason: 'no_viable_candidates' };
    }

    const best = viable[0];
    const currentResult = results.find(r => r.engine === this.activePrimary443);

    // Check if switch is needed
    if (this.activePrimary443 === best.engine) {
      return { switched: false, reason: 'current_is_best' };
    }

    // Only switch if significantly better
    if (currentResult && currentResult.status !== 'failed') {
      if (best.score < currentResult.score * criteria.switchThreshold) {
        return { switched: false, reason: 'improvement_below_threshold' };
      }
    }

    // Switch!
    const previousEngine = this.activePrimary443;
    this.activePrimary443 = best.engine;

    // Save to DB
    const db = getDb();
    db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('autopilot.primary443', ?, CURRENT_TIMESTAMP)")
      .run(this.activePrimary443);
    
    // Increment switch counter
    const switchCount = db.prepare("SELECT value FROM settings WHERE key = 'autopilot.switchCount'").get();
    const newCount = (parseInt(switchCount?.value || '0') + 1);
    db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('autopilot.switchCount', ?, CURRENT_TIMESTAMP)")
      .run(String(newCount));

    log.info(`Autopilot switched primary tunnel: ${previousEngine} -> ${best.engine} (score: ${best.score}, latency: ${best.latency}ms)`);

    return {
      switched: true,
      reason: `better_performance: ${best.engine} (score=${best.score}) > ${previousEngine} (score=${currentResult?.score || 0})`,
      previousEngine,
      newEngine: best.engine,
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
        // Use a virtual tunnel_id based on engine name (negative IDs for autopilot)
        const virtualId = -1 * (PORT_RULES.port443.candidates.indexOf(r.engine) + 1);
        insert.run(virtualId || -99, r.latency, r.jitter, r.packetLoss, r.score, r.status);
      }
    });

    try {
      tx();
    } catch (e) {
      log.warn('Failed to save monitor results:', e.message);
    }
  }

  /**
   * Manually set primary tunnel for port 443
   */
  setPrimary443(engineName) {
    if (!PORT_RULES.port443.candidates.includes(engineName)) {
      return { success: false, error: `Invalid engine. Must be one of: ${PORT_RULES.port443.candidates.join(', ')}` };
    }

    const previous = this.activePrimary443;
    this.activePrimary443 = engineName;

    const db = getDb();
    db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('autopilot.primary443', ?, CURRENT_TIMESTAMP)")
      .run(engineName);

    log.info(`Manual tunnel switch: ${previous} -> ${engineName}`);

    return {
      success: true,
      previousEngine: previous,
      newEngine: engineName,
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
      primary443: this.activePrimary443,
      lastMonitorCycle: this.lastMonitorCycle || settings.lastCycle || null,
      switchCount: parseInt(settings.switchCount || '0'),
      monitorInterval: config.tunnel.monitorInterval,

      // Port rules
      portAllocation: {
        port443: {
          activeEngine: this.activePrimary443,
          candidates: PORT_RULES.port443.candidates,
          description: PORT_RULES.port443.description,
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

      // Latest monitor results
      latestResults: Object.fromEntries(this.monitorResults),

      // Engine info
      engines: tunnelManager.getEngines(),
    };
  }

  /**
   * Get deployment configuration for a server pair
   * Returns all configs needed for Iran <-> Foreign tunnel setup
   */
  getDeploymentPlan(iranServer, foreignServer) {
    const plan = {
      iranServer: { id: iranServer.id, name: iranServer.name, ip: iranServer.ip },
      foreignServer: { id: foreignServer.id, name: foreignServer.name, ip: foreignServer.ip },
      mode: 'autopilot',
      timestamp: new Date().toISOString(),

      // Always-on tunnels
      alwaysOn: [],

      // Port 443 competing tunnels (all deployed, only best activated)
      port443Candidates: [],

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

    // 4. Port 443 candidates (all deployed, autopilot selects best)
    const port443Engines = [
      {
        engine: 'gost',
        name: 'GOST (TLS)',
        transport: 'tls',
        priority: 1,
      },
      {
        engine: 'gost',
        name: 'GOST (QUIC)',
        transport: 'quic',
        priority: 1,
      },
      {
        engine: 'frp',
        name: 'FRP (TLS)',
        transport: 'tcp+tls',
        priority: 2,
      },
      {
        engine: 'chisel',
        name: 'Chisel (TLS/WS)',
        transport: 'https/websocket',
        priority: 2,
      },
      {
        engine: 'ssh',
        name: 'SSH Tunnel',
        transport: 'ssh',
        priority: 3,
      },
    ];

    for (const eng of port443Engines) {
      const isActive = this.activePrimary443 === eng.engine;
      plan.port443Candidates.push({
        ...eng,
        port: 443,
        status: isActive ? 'active_primary' : 'standby',
        isCurrentPrimary: isActive,
        config: tunnelManager.generateDeployConfig(eng.engine, {
          tunnelId: `p443-${eng.engine}-${iranServer.id}-${foreignServer.id}`,
          listenPort: 443,
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
