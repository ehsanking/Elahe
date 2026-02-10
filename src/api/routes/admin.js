/**
 * Elahe Panel - Admin API Routes
 * Full-featured admin API with Iran/Foreign mode separation
 * Includes Autopilot, GeoRouting, WARP, Core Management, Content Blocking
 * Developer: EHSANKiNG
 * Version: 0.0.5
 */

const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../../middleware/auth');
const UserService = require('../../services/user');
const ServerService = require('../../services/server');
const TunnelService = require('../../services/tunnel');
const DomainService = require('../../services/domain');
const ImportExportService = require('../../services/importexport');
const autopilotService = require('../../services/autopilot');
const { tunnelManager } = require('../../tunnel/engines');
const SystemMonitor = require('../../services/monitor');
const GeoRoutingService = require('../../services/georouting');
const CoreManager = require('../../services/coremanager');
const WarpService = require('../../services/warp');
const ContentBlockService = require('../../services/contentblock');
const { getDb } = require('../../database');
const { createLogger } = require('../../utils/logger');
const config = require('../../config/default');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');

const log = createLogger('AdminAPI');
const adminAuth = authMiddleware('admin');

// ============ MODE-AWARE MIDDLEWARE ============
const iranOnly = (req, res, next) => {
  if (config.mode === 'foreign') {
    return res.status(403).json({ error: '\u0627\u06CC\u0646 \u0642\u0627\u0628\u0644\u06CC\u062A \u0641\u0642\u0637 \u062F\u0631 \u067E\u0646\u0644 \u0627\u06CC\u0631\u0627\u0646 \u0645\u0648\u062C\u0648\u062F \u0627\u0633\u062A', mode: config.mode });
  }
  next();
};

const foreignOnly = (req, res, next) => {
  if (config.mode === 'iran') {
    return res.status(403).json({ error: '\u0627\u06CC\u0646 \u0642\u0627\u0628\u0644\u06CC\u062A \u0641\u0642\u0637 \u062F\u0631 \u067E\u0646\u0644 \u062E\u0627\u0631\u062C \u0645\u0648\u062C\u0648\u062F \u0627\u0633\u062A', mode: config.mode });
  }
  next();
};

// ============ DASHBOARD ============
router.get('/dashboard', adminAuth, (req, res) => {
  const dashboard = {
    users: UserService.getUserStats(),
    servers: ServerService.getStats(),
    tunnels: TunnelService.getStats(),
    tunnelEngines: tunnelManager.getStats(),
    mode: config.mode,
    version: '0.0.5',
  };

  // Add domain/SSL stats
  try { dashboard.domains = DomainService.getStats(); } catch (e) { dashboard.domains = { total: 0 }; }
  // Add SSL auto-renew status
  try { dashboard.sslAutoRenew = config.ssl.autoRenew; } catch (e) { dashboard.sslAutoRenew = false; }
  // Add autopilot status
  try { dashboard.autopilot = autopilotService.getStatus(); } catch (e) { dashboard.autopilot = { initialized: false }; }
  // Add geo routing stats
  try { dashboard.geoRouting = GeoRoutingService.getStats(); } catch (e) { dashboard.geoRouting = { total: 0 }; }
  // Add WARP status
  try { dashboard.warp = WarpService.getStatus(); } catch (e) { dashboard.warp = { configured: false }; }
  // Add content blocking stats
  try { dashboard.contentBlock = ContentBlockService.getStats(); } catch (e) { dashboard.contentBlock = { total: 0 }; }
  // Add core status
  try { dashboard.coreStatus = CoreManager.getCoreStatus(); } catch (e) { dashboard.coreStatus = {}; }

  // Add system resources
  try {
    dashboard.system = {
      cpu: SystemMonitor.getCPU(),
      memory: SystemMonitor.getMemory(),
      disk: SystemMonitor.getDisk(),
      uptime: SystemMonitor.getUptime(),
      os: SystemMonitor.getOSInfo(),
      process: SystemMonitor.getProcessInfo(),
    };
    dashboard.bandwidth = SystemMonitor.getBandwidthSummary();
    dashboard.connections = SystemMonitor.getActiveConnections();
  } catch (e) { dashboard.system = null; }

  // Add online users count
  try {
    const db = getDb();
    const online = db.prepare("SELECT COUNT(*) as c FROM users WHERE is_online = 1").get();
    dashboard.onlineUsers = online.c;
  } catch (e) { dashboard.onlineUsers = 0; }

  res.json(dashboard);
});

// ============ PANEL CAPABILITIES ============
router.get('/capabilities', adminAuth, (req, res) => {
  const mode = config.mode;
  res.json({
    mode,
    capabilities: {
      createUsers: mode === 'iran',
      manageUsers: mode === 'iran',
      viewUsers: true,
      manageServers: true,
      manageTunnels: true,
      manageSettings: true,
      manageDomains: mode === 'foreign',
      importExport: mode === 'iran',
      viewSubscriptions: mode === 'iran',
      generateConfigs: mode === 'iran',
      autopilot: true,
      tunnelEngines: true,
      tunnelEndpoint: mode === 'foreign',
      coreManagement: true,
      geoRouting: true,
      warp: true,
      contentBlocking: true,
      sslManagement: true,
      apiKeys: true,
      onlineUsers: true,
      customPorts: mode === 'iran',
      twoFactor: true,
      mobileGameCamouflage: true,
    },
  });
});

// ============ USERS ============
router.get('/users', adminAuth, (req, res) => {
  const { page, limit, status, plan, search } = req.query;
  const result = UserService.listUsers({ page: parseInt(page) || 1, limit: parseInt(limit) || 20, status, plan, search });
  res.json(result);
});

router.post('/users', adminAuth, iranOnly, async (req, res) => {
  const result = await UserService.createUser(req.body, req.user.id);
  if (result.success) return res.status(201).json(result);
  res.status(400).json(result);
});

router.post('/users/auto-create', adminAuth, iranOnly, async (req, res) => {
  const { count, ...options } = req.body;
  const results = await UserService.autoCreateUsers(count || 1, options, req.user.id);
  res.json({ success: true, results });
});

router.get('/users/:id', adminAuth, (req, res) => {
  const user = UserService.getById(req.params.id);
  if (!user) return res.status(404).json({ error: '\u06A9\u0627\u0631\u0628\u0631 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F' });
  res.json(user);
});

router.put('/users/:id', adminAuth, iranOnly, (req, res) => {
  const result = UserService.updateUser(req.params.id, req.body);
  if (result.success) return res.json(result);
  res.status(400).json(result);
});

router.delete('/users/:id', adminAuth, iranOnly, (req, res) => {
  UserService.deleteUser(req.params.id);
  res.json({ success: true });
});

router.post('/users/:id/reset-traffic', adminAuth, iranOnly, (req, res) => {
  res.json(UserService.resetTraffic(req.params.id));
});

router.post('/users/:id/revoke-subscription', adminAuth, iranOnly, (req, res) => {
  res.json(UserService.revokeSubscription(req.params.id));
});

// ============ ONLINE USERS ============
router.get('/users/online/list', adminAuth, (req, res) => {
  try {
    const db = getDb();
    const onlineUsers = db.prepare(`
      SELECT u.id, u.username, u.uuid, u.plan, u.status, u.is_online, u.last_seen, u.client_info,
             (SELECT COUNT(*) FROM active_connections ac WHERE ac.user_id = u.id) as active_connections
      FROM users u WHERE u.is_online = 1
      ORDER BY u.last_seen DESC
    `).all();
    res.json({ success: true, users: onlineUsers, count: onlineUsers.length });
  } catch (err) {
    res.json({ success: true, users: [], count: 0 });
  }
});

// ============ SERVERS ============
router.get('/servers', adminAuth, (req, res) => {
  const { type } = req.query;
  res.json(ServerService.listServers(type));
});

router.post('/servers', adminAuth, (req, res) => {
  const result = ServerService.addServer(req.body);
  if (result.success) return res.status(201).json(result);
  res.status(400).json(result);
});

router.get('/servers/:id', adminAuth, (req, res) => {
  const server = ServerService.getById(req.params.id);
  if (!server) return res.status(404).json({ error: '\u0633\u0631\u0648\u0631 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F' });
  res.json(server);
});

router.put('/servers/:id', adminAuth, (req, res) => {
  const result = ServerService.updateServer(req.params.id, req.body);
  if (result.success) return res.json(result);
  res.status(400).json(result);
});

router.delete('/servers/:id', adminAuth, (req, res) => {
  ServerService.removeServer(req.params.id);
  res.json({ success: true });
});

router.post('/servers/:id/regenerate-token', adminAuth, (req, res) => {
  res.json(ServerService.regenerateToken(req.params.id));
});

// ============ TUNNELS ============
router.get('/tunnels', adminAuth, (req, res) => {
  const { serverId } = req.query;
  res.json(TunnelService.listTunnels(serverId));
});

router.post('/tunnels', adminAuth, (req, res) => {
  const result = TunnelService.addTunnel(req.body);
  if (result.success) return res.status(201).json(result);
  res.status(400).json(result);
});

router.delete('/tunnels/:id', adminAuth, (req, res) => {
  TunnelService.deleteTunnel(req.params.id);
  res.json({ success: true });
});

router.post('/tunnels/monitor', adminAuth, async (req, res) => {
  const result = await TunnelService.runMonitoringCycle();
  res.json(result);
});

router.get('/tunnels/:id/history', adminAuth, (req, res) => {
  res.json(TunnelService.getMonitorHistory(req.params.id));
});

// ============ AUTOPILOT ============
router.get('/autopilot/status', adminAuth, (req, res) => {
  res.json({ success: true, ...TunnelService.getAutopilotStatus() });
});

router.post('/autopilot/monitor', adminAuth, async (req, res) => {
  const result = await TunnelService.runAutopilotCycle();
  res.json({ success: true, ...result });
});

// DEPRECATED: Manual tunnel selection removed - all tunnels stay active on random ports
router.post('/autopilot/set-primary', adminAuth, (req, res) => {
  res.status(410).json({ 
    success: false, 
    error: 'Manual tunnel selection has been removed. All tunnels are now kept active on random ports.',
    mode: 'all_active',
  });
});

router.post('/autopilot/toggle', adminAuth, (req, res) => {
  const { enabled } = req.body;
  const result = TunnelService.setAutopilotEnabled(enabled !== false);
  res.json(result);
});

router.get('/autopilot/port-rules', adminAuth, (req, res) => {
  res.json({ success: true, rules: TunnelService.getPortRules() });
});

router.get('/autopilot/deployment-plan/:iranServerId/:foreignServerId', adminAuth, (req, res) => {
  const db = getDb();
  const iranServer = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.iranServerId);
  const foreignServer = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.foreignServerId);
  if (!iranServer || !foreignServer) return res.status(404).json({ error: '\u0633\u0631\u0648\u0631 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F' });
  const plan = TunnelService.getDeploymentPlan(iranServer, foreignServer);
  res.json({ success: true, plan });
});

// ============ TUNNEL ENGINES ============
router.get('/tunnel-engines', adminAuth, (req, res) => {
  res.json({ success: true, engines: tunnelManager.getEngines(), stats: tunnelManager.getStats() });
});

router.post('/tunnel-engines/create', adminAuth, async (req, res) => {
  try { const result = await tunnelManager.createTunnel(req.body); res.json(result); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/tunnel-engines/auto-setup', adminAuth, async (req, res) => {
  const { iranServerId, foreignServerId } = req.body;
  if (!iranServerId || !foreignServerId) return res.status(400).json({ error: 'iranServerId and foreignServerId required' });
  try { const result = await tunnelManager.autoSetup(iranServerId, foreignServerId); res.json(result); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.delete('/tunnel-engines/:tunnelId', adminAuth, async (req, res) => {
  try { const result = await tunnelManager.stopTunnel(req.params.tunnelId); res.json(result); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/tunnel-engines/status', adminAuth, (req, res) => {
  res.json({ success: true, tunnels: tunnelManager.getAllStatus() });
});

router.get('/tunnel-engines/health', adminAuth, async (req, res) => {
  try { const results = await tunnelManager.healthCheckAll(); res.json({ success: true, results }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/tunnel-engines/deploy-config', adminAuth, (req, res) => {
  const { engine, ...options } = req.body;
  const conf = tunnelManager.generateDeployConfig(engine, options);
  if (conf.error) return res.status(400).json(conf);
  res.json({ success: true, config: conf });
});

// ============ GEO ROUTING (Iran-v2ray-rules) ============
router.get('/geo-routing/rules', adminAuth, (req, res) => {
  const { type } = req.query;
  res.json({ success: true, rules: GeoRoutingService.listRules(type || null) });
});

router.post('/geo-routing/rules', adminAuth, (req, res) => {
  const result = GeoRoutingService.addRule(req.body);
  res.json(result);
});

router.put('/geo-routing/rules/:id', adminAuth, (req, res) => {
  const result = GeoRoutingService.updateRule(req.params.id, req.body);
  res.json(result);
});

router.delete('/geo-routing/rules/:id', adminAuth, (req, res) => {
  res.json(GeoRoutingService.deleteRule(req.params.id));
});

router.post('/geo-routing/rules/:id/toggle', adminAuth, (req, res) => {
  res.json(GeoRoutingService.toggleRule(req.params.id));
});

router.post('/geo-routing/init-defaults', adminAuth, (req, res) => {
  res.json(GeoRoutingService.initDefaultRules());
});

router.get('/geo-routing/status', adminAuth, (req, res) => {
  res.json({ success: true, ...GeoRoutingService.getStatus() });
});

router.get('/geo-routing/latest-release', adminAuth, async (req, res) => {
  const result = await GeoRoutingService.getLatestRelease();
  res.json(result);
});

router.post('/geo-routing/update-geodata', adminAuth, async (req, res) => {
  const { engine } = req.body;
  const result = await GeoRoutingService.updateGeoData(engine || config.core.engine);
  res.json(result);
});

router.get('/geo-routing/xray-config', adminAuth, (req, res) => {
  res.json({ success: true, routing: GeoRoutingService.generateXrayRouting() });
});

router.get('/geo-routing/singbox-config', adminAuth, (req, res) => {
  res.json({ success: true, route: GeoRoutingService.generateSingboxRouting() });
});

// ============ CORE MANAGEMENT (Xray/Sing-box) ============
router.get('/core/status', adminAuth, (req, res) => {
  res.json({ success: true, ...CoreManager.getFullStatus() });
});

router.get('/core/versions', adminAuth, async (req, res) => {
  const latest = await CoreManager.fetchLatestVersions();
  const installed = CoreManager.getInstalledVersions();
  res.json({ success: true, latest, installed });
});

router.post('/core/start', adminAuth, (req, res) => {
  const { engine } = req.body;
  if (!engine) return res.status(400).json({ error: '\u0646\u0627\u0645 \u0627\u0646\u062C\u06CC\u0646 \u0627\u0644\u0632\u0627\u0645\u06CC \u0627\u0633\u062A' });
  res.json(CoreManager.startCore(engine));
});

router.post('/core/stop', adminAuth, (req, res) => {
  const { engine } = req.body;
  if (!engine) return res.status(400).json({ error: '\u0646\u0627\u0645 \u0627\u0646\u062C\u06CC\u0646 \u0627\u0644\u0632\u0627\u0645\u06CC \u0627\u0633\u062A' });
  res.json(CoreManager.stopCore(engine));
});

router.post('/core/restart', adminAuth, (req, res) => {
  const { engine } = req.body;
  if (!engine) return res.status(400).json({ error: '\u0646\u0627\u0645 \u0627\u0646\u062C\u06CC\u0646 \u0627\u0644\u0632\u0627\u0645\u06CC \u0627\u0633\u062A' });
  res.json(CoreManager.restartCore(engine));
});

router.get('/core/port-conflicts', adminAuth, (req, res) => {
  res.json({ success: true, conflicts: CoreManager.checkPortConflicts() });
});

router.get('/core/logs/:engine', adminAuth, (req, res) => {
  const lines = parseInt(req.query.lines) || 50;
  res.json(CoreManager.getCoreLogs(req.params.engine, lines));
});

// Core Engine Version Selection
router.post('/core/set-version', adminAuth, (req, res) => {
  const { engine, version } = req.body;
  if (!engine || !version) return res.status(400).json({ error: 'Engine and version are required' });
  
  const db = getDb();
  // Deactivate all versions of this engine
  db.prepare('UPDATE core_versions SET is_active = 0 WHERE engine = ?').run(engine);
  // Activate selected version
  const result = db.prepare(`
    UPDATE core_versions SET is_active = 1, updated_at = CURRENT_TIMESTAMP 
    WHERE engine = ? AND version = ?
  `).run(engine, version);
  
  if (result.changes === 0) {
    return res.status(404).json({ success: false, error: 'Version not found' });
  }
  
  // Update config
  db.prepare(`
    INSERT OR REPLACE INTO settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
  `).run('core.engine', engine);
  
  db.prepare(`
    INSERT OR REPLACE INTO settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
  `).run(`core.${engine}.version`, version);
  
  log.info(`Core engine version set: ${engine} ${version}`);
  res.json({ success: true, engine, version });
});

router.post('/core/switch-engine', adminAuth, (req, res) => {
  const { engine } = req.body;
  if (!engine || !['xray', 'singbox'].includes(engine)) {
    return res.status(400).json({ error: 'Valid engine (xray or singbox) is required' });
  }
  
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
  `).run('core.engine', engine);
  
  log.info(`Core engine switched to: ${engine}`);
  res.json({ success: true, engine });
});

// ============ WARP ============
router.get('/warp/configs', adminAuth, (req, res) => {
  res.json({ success: true, configs: WarpService.listConfigs() });
});

router.post('/warp/configs', adminAuth, (req, res) => {
  res.json(WarpService.addConfig(req.body));
});

router.put('/warp/configs/:id', adminAuth, (req, res) => {
  res.json(WarpService.updateConfig(req.params.id, req.body));
});

router.delete('/warp/configs/:id', adminAuth, (req, res) => {
  res.json(WarpService.deleteConfig(req.params.id));
});

router.post('/warp/configs/:id/activate', adminAuth, (req, res) => {
  res.json(WarpService.activateConfig(req.params.id));
});

router.put('/warp/configs/:id/domains', adminAuth, (req, res) => {
  const { domains } = req.body;
  res.json(WarpService.updateWarpDomains(req.params.id, domains || []));
});

router.get('/warp/status', adminAuth, (req, res) => {
  res.json({ success: true, ...WarpService.getStatus() });
});

router.get('/warp/check', adminAuth, async (req, res) => {
  const result = await WarpService.checkConnectivity();
  res.json(result);
});

router.get('/warp/xray-outbound', adminAuth, (req, res) => {
  const outbound = WarpService.generateXrayOutbound();
  res.json({ success: !!outbound, outbound });
});

// ============ CONTENT BLOCKING (Torrent/Porn/Gambling) ============
router.get('/content-block/categories', adminAuth, (req, res) => {
  res.json({ success: true, categories: ContentBlockService.listCategories() });
});

router.post('/content-block/toggle', adminAuth, (req, res) => {
  const { category, enabled } = req.body;
  if (!category) return res.status(400).json({ error: 'category required' });
  res.json(ContentBlockService.toggleCategory(category, enabled));
});

router.get('/content-block/xray-rules', adminAuth, (req, res) => {
  res.json({ success: true, rules: ContentBlockService.generateXrayBlockRules() });
});

// ============ SSL MANAGEMENT ============
router.get('/ssl/status', adminAuth, (req, res) => {
  try {
    const DomainService = require('../../services/domain');
    res.json({ 
      success: true, 
      domains: DomainService.listDomains(),
      stats: DomainService.getStats(),
      autoRenewEnabled: config.ssl.autoRenew,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/ssl/request', adminAuth, foreignOnly, async (req, res) => {
  const { domain, email, standalone } = req.body;
  if (!domain) return res.status(400).json({ error: 'Domain is required' });

  try {
    const DomainService = require('../../services/domain');
    const result = DomainService.requestCertificate(domain, email, standalone !== false);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/ssl/renew', adminAuth, async (req, res) => {
  const { domain } = req.body;
  
  try {
    const DomainService = require('../../services/domain');
    if (domain) {
      // Renew specific domain
      const result = DomainService.renewCertificate(domain);
      res.json(result);
    } else {
      // Renew all expiring certificates
      const result = await DomainService.checkAndRenewSSL();
      res.json(result);
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/ssl/auto-renew/:domain', adminAuth, (req, res) => {
  const { enabled } = req.body;
  const { domain } = req.params;
  
  try {
    const DomainService = require('../../services/domain');
    const result = DomainService.toggleAutoRenew(domain, enabled !== false);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============ API KEYS ============
router.get('/api-keys', adminAuth, (req, res) => {
  const db = getDb();
  const keys = db.prepare('SELECT id, name, permissions, admin_id, last_used, expires_at, status, created_at FROM api_keys ORDER BY id DESC').all();
  res.json({ success: true, keys });
});

router.post('/api-keys', adminAuth, (req, res) => {
  const { name, permissions, expiresIn } = req.body;
  if (!name) return res.status(400).json({ error: '\u0646\u0627\u0645 \u06A9\u0644\u06CC\u062F \u0627\u0644\u0632\u0627\u0645\u06CC \u0627\u0633\u062A' });

  const rawKey = `elahe_${crypto.randomBytes(32).toString('hex')}`;
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 86400000).toISOString() : null;

  const db = getDb();
  const result = db.prepare(`
    INSERT INTO api_keys (name, key_hash, permissions, admin_id, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(name, keyHash, JSON.stringify(permissions || ['read']), req.user.id, expiresAt);

  res.json({ success: true, id: result.lastInsertRowid, key: rawKey, message: '\u0627\u06CC\u0646 \u06A9\u0644\u06CC\u062F \u0641\u0642\u0637 \u06CC\u06A9\u200C\u0628\u0627\u0631 \u0646\u0645\u0627\u06CC\u0634 \u062F\u0627\u062F\u0647 \u0645\u06CC\u200C\u0634\u0648\u062F' });
});

router.delete('/api-keys/:id', adminAuth, (req, res) => {
  const db = getDb();
  db.prepare("UPDATE api_keys SET status = 'revoked' WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// ============ DOMAINS ============
router.get('/domains', adminAuth, foreignOnly, (req, res) => {
  const { serverId } = req.query;
  res.json({
    success: true,
    domains: DomainService.listDomains(serverId ? parseInt(serverId) : null),
    stats: DomainService.getStats(),
  });
});

router.post('/domains', adminAuth, foreignOnly, (req, res) => {
  const { domain, serverId } = req.body;
  if (!domain) return res.status(400).json({ error: '\u062F\u0627\u0645\u06CC\u0646 \u0627\u0644\u0632\u0627\u0645\u06CC \u0627\u0633\u062A' });
  const result = DomainService.setMainDomain(domain, serverId || null);
  if (result.success) return res.status(201).json(result);
  res.status(400).json(result);
});

router.delete('/domains/:domain', adminAuth, foreignOnly, (req, res) => {
  DomainService.deleteDomain(req.params.domain);
  res.json({ success: true });
});

// ============ IMPORT / EXPORT (Iran-only) ============
router.get('/export/users', adminAuth, iranOnly, (req, res) => {
  const format = req.query.format || 'elahe';
  const data = ImportExportService.exportUsers(format);
  res.set({ 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="elahe-users-${format}-${new Date().toISOString().split('T')[0]}.json"` });
  res.json(data);
});

router.post('/import/users', adminAuth, iranOnly, (req, res) => {
  try { const result = ImportExportService.importUsers(req.body, req.user.id); res.json({ success: true, ...result }); }
  catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

router.get('/export/settings', adminAuth, (req, res) => {
  const data = ImportExportService.exportSettings();
  res.set({ 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="elahe-settings-${new Date().toISOString().split('T')[0]}.json"` });
  res.json(data);
});

router.post('/import/settings', adminAuth, (req, res) => {
  try { const result = ImportExportService.importSettings(req.body); res.json({ success: true, ...result }); }
  catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

router.get('/export/full', adminAuth, iranOnly, (req, res) => {
  const data = ImportExportService.fullBackup();
  res.set({ 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="elahe-full-backup-${new Date().toISOString().split('T')[0]}.json"` });
  res.json(data);
});

router.post('/import/full', adminAuth, iranOnly, (req, res) => {
  try { const result = ImportExportService.fullRestore(req.body, req.user.id); res.json({ success: true, ...result }); }
  catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

// ============ MOBILE GAME TRAFFIC CAMOUFLAGE ============
router.get('/camouflage/profiles', adminAuth, (req, res) => {
  const profiles = [
    {
      id: 'cod-mobile',
      name: 'Call of Duty Mobile',
      description: 'Mimics CoD Mobile traffic patterns',
      ports: [80, 443, 5000, 5060],
      protocols: ['tcp', 'udp'],
      packetSize: { min: 100, max: 1400 },
      interval: { min: 20, max: 100 },
    },
    {
      id: 'pubg-mobile',
      name: 'PUBG Mobile',
      description: 'Mimics PUBG Mobile traffic patterns',
      ports: [80, 443, 10012, 17500],
      protocols: ['tcp', 'udp'],
      packetSize: { min: 80, max: 1200 },
      interval: { min: 16, max: 64 },
    },
    {
      id: 'clash-royale',
      name: 'Clash Royale',
      description: 'Mimics Clash Royale traffic patterns',
      ports: [80, 443, 9339],
      protocols: ['tcp'],
      packetSize: { min: 50, max: 800 },
      interval: { min: 100, max: 500 },
    },
    {
      id: 'mobile-legends',
      name: 'Mobile Legends',
      description: 'Mimics Mobile Legends traffic patterns',
      ports: [80, 443, 5000, 5500, 5600],
      protocols: ['tcp', 'udp'],
      packetSize: { min: 60, max: 1000 },
      interval: { min: 30, max: 150 },
    },
  ];
  res.json({ success: true, profiles });
});

router.get('/camouflage/status', adminAuth, (req, res) => {
  const db = getDb();
  const settings = db.prepare("SELECT * FROM settings WHERE key LIKE 'camouflage.%'").all();
  const result = {};
  settings.forEach(s => { result[s.key.replace('camouflage.', '')] = s.value; });
  res.json({ 
    success: true, 
    enabled: result.enabled === 'true',
    profile: result.profile || 'none',
    settings: result,
  });
});

router.post('/camouflage/toggle', adminAuth, (req, res) => {
  const { enabled, profile } = req.body;
  const db = getDb();
  
  db.prepare(`
    INSERT OR REPLACE INTO settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
  `).run('camouflage.enabled', enabled === true ? 'true' : 'false');
  
  if (profile) {
    db.prepare(`
      INSERT OR REPLACE INTO settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `).run('camouflage.profile', profile);
  }
  
  log.info(`Traffic camouflage ${enabled ? 'enabled' : 'disabled'}`, { profile });
  res.json({ success: true, enabled, profile });
});

// ============ REALITY TARGETS ============
router.get('/reality-targets', adminAuth, (req, res) => {
  try {
    const { REALITY_TARGETS, getTargetsByCategory, getSafeTargets } = require('../../services/subscription/reality_targets');
    res.json({ success: true, total: REALITY_TARGETS.length, byCategory: getTargetsByCategory(), safeTargets: getSafeTargets() });
  } catch (err) { res.json({ success: false, error: err.message }); }
});

// ============ SYSTEM MONITOR ============
router.get('/system/resources', adminAuth, (req, res) => {
  try {
    const snapshot = SystemMonitor.getSnapshot();
    const connections = SystemMonitor.getActiveConnections();
    const bandwidth = SystemMonitor.getBandwidthSummary();
    res.json({ success: true, ...snapshot, connections, bandwidth });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/system/bandwidth', adminAuth, (req, res) => {
  res.json({ success: true, ...SystemMonitor.getBandwidthSummary() });
});

// ============ SETTINGS ============
router.get('/settings', adminAuth, (req, res) => {
  const db = getDb();
  const settings = db.prepare('SELECT * FROM settings').all();
  const result = {};
  settings.forEach(s => { result[s.key] = s.value; });
  result._mode = config.mode;
  res.json(result);
});

router.put('/settings', adminAuth, (req, res) => {
  const db = getDb();
  const update = db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)');
  const transaction = db.transaction(() => {
    for (const [key, value] of Object.entries(req.body)) {
      if (key.startsWith('_')) continue;
      update.run(key, String(value));
    }
  });
  transaction();
  res.json({ success: true });
});

// ============ TWO-FACTOR AUTHENTICATION ============
router.get('/security/2fa', adminAuth, (req, res) => {
  const db = getDb();
  const admin = db.prepare('SELECT totp_enabled FROM admins WHERE id = ?').get(req.user.id);
  res.json({ success: true, enabled: admin?.totp_enabled === 1 });
});

router.post('/security/2fa/setup', adminAuth, async (req, res) => {
  const db = getDb();
  const admin = db.prepare('SELECT username FROM admins WHERE id = ?').get(req.user.id);
  if (!admin) return res.status(404).json({ success: false, error: 'Admin not found' });

  const secret = speakeasy.generateSecret({ name: `Elahe Panel (${admin.username})` });
  const qr = await qrcode.toDataURL(secret.otpauth_url);
  db.prepare('UPDATE admins SET totp_secret = ?, totp_enabled = 0 WHERE id = ?')
    .run(secret.base32, req.user.id);
  res.json({ success: true, secret: secret.base32, qr });
});

router.post('/security/2fa/enable', adminAuth, (req, res) => {
  const { otp } = req.body;
  const db = getDb();
  const admin = db.prepare('SELECT totp_secret FROM admins WHERE id = ?').get(req.user.id);
  if (!admin?.totp_secret) return res.status(400).json({ success: false, error: '2FA not initialized' });

  const valid = speakeasy.totp.verify({ secret: admin.totp_secret, encoding: 'base32', token: otp, window: 1 });
  if (!valid) return res.status(400).json({ success: false, error: 'Invalid authentication code' });

  db.prepare('UPDATE admins SET totp_enabled = 1, totp_verified_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(req.user.id);
  res.json({ success: true });
});

router.post('/security/2fa/disable', adminAuth, (req, res) => {
  const { otp } = req.body;
  const db = getDb();
  const admin = db.prepare('SELECT totp_secret, totp_enabled FROM admins WHERE id = ?').get(req.user.id);
  if (!admin?.totp_enabled) return res.status(400).json({ success: false, error: '2FA already disabled' });

  const valid = speakeasy.totp.verify({ secret: admin.totp_secret, encoding: 'base32', token: otp, window: 1 });
  if (!valid) return res.status(400).json({ success: false, error: 'Invalid authentication code' });

  db.prepare('UPDATE admins SET totp_enabled = 0 WHERE id = ?').run(req.user.id);
  res.json({ success: true });
});

// ============ CUSTOM PORT MANAGEMENT (Iran) ============
router.post('/custom-port', adminAuth, iranOnly, (req, res) => {
  const { port, protocol, description } = req.body;
  if (!port || !protocol) return res.status(400).json({ error: '\u067E\u0648\u0631\u062A \u0648 \u067E\u0631\u0648\u062A\u06A9\u0644 \u0627\u0644\u0632\u0627\u0645\u06CC \u0627\u0633\u062A' });

  // Check port conflicts
  const conflicts = CoreManager.checkPortConflicts();
  const conflict = conflicts.find(c => c.port === parseInt(port));
  if (conflict) {
    return res.status(400).json({
      error: `\u067E\u0648\u0631\u062A ${port} \u062F\u0631 \u062D\u0627\u0644 \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u062A\u0648\u0633\u0637 ${conflict.process}`,
      conflict,
    });
  }

  // Log the custom port request
  log.info('Custom port requested', { port, protocol, description });
  
  res.json({
    success: true,
    port: parseInt(port),
    protocol,
    firewall_command: `ufw allow ${port}/tcp`,
    message: `\u067E\u0648\u0631\u062A ${port} \u0622\u0645\u0627\u062F\u0647 \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u0627\u0633\u062A`,
  });
});

module.exports = router;
