/**
 * Elahe Panel - Admin API Routes
 * Full-featured admin API with Iran/Foreign mode separation
 * Includes Autopilot tunnel management and engine controls
 * Developer: EHSANKiNG
 * Version: 0.0.3
 */

const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../../middleware/auth');
const UserService = require('../../services/user');
const ServerService = require('../../services/server');
const TunnelService = require('../../services/tunnel');
const DomainService = require('../../services/domain');
const ImportExportService = require('../../services/importexport');
const ExternalPanelService = require('../../services/externalpanel');
const autopilotService = require('../../services/autopilot');
const { tunnelManager } = require('../../tunnel/engines');
const SystemMonitor = require('../../services/monitor');
const { getDb } = require('../../database');
const { createLogger } = require('../../utils/logger');
const config = require('../../config/default');

const log = createLogger('AdminAPI');
const adminAuth = authMiddleware('admin');

// ============ MODE-AWARE MIDDLEWARE ============
const iranOnly = (req, res, next) => {
  if (config.mode === 'foreign') {
    return res.status(403).json({ error: 'This feature is only available on Iran panel', mode: config.mode });
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
    version: '0.0.3',
  };

  // Add domain stats
  try {
    dashboard.domains = DomainService.getStats();
  } catch (e) {
    dashboard.domains = { total: 0 };
  }

  // Add external panels count
  try {
    dashboard.externalPanels = ExternalPanelService.listPanels().length;
  } catch (e) {
    dashboard.externalPanels = 0;
  }

  // Add autopilot status
  try {
    dashboard.autopilot = autopilotService.getStatus();
  } catch (e) {
    dashboard.autopilot = { initialized: false };
  }

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
  } catch (e) {
    dashboard.system = null;
  }

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
      manageDomains: true,
      importExport: mode === 'iran',
      externalPanels: true,
      viewSubscriptions: mode === 'iran',
      generateConfigs: mode === 'iran',
      autopilot: true,
      tunnelEngines: true,
      tunnelEndpoint: mode === 'foreign',
      coreManagement: mode === 'foreign',
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
  if (!user) return res.status(404).json({ error: 'User not found' });
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
  if (!server) return res.status(404).json({ error: 'Server not found' });
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

router.post('/autopilot/set-primary', adminAuth, (req, res) => {
  const { engine } = req.body;
  if (!engine) return res.status(400).json({ error: 'Engine name required' });
  const result = TunnelService.setPrimary443(engine);
  res.json(result);
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

  if (!iranServer || !foreignServer) {
    return res.status(404).json({ error: 'Server not found' });
  }

  const plan = TunnelService.getDeploymentPlan(iranServer, foreignServer);
  res.json({ success: true, plan });
});

// ============ TUNNEL ENGINES ============
router.get('/tunnel-engines', adminAuth, (req, res) => {
  res.json({
    success: true,
    engines: tunnelManager.getEngines(),
    stats: tunnelManager.getStats(),
  });
});

router.post('/tunnel-engines/create', adminAuth, async (req, res) => {
  try {
    const result = await tunnelManager.createTunnel(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/tunnel-engines/auto-setup', adminAuth, async (req, res) => {
  const { iranServerId, foreignServerId } = req.body;
  if (!iranServerId || !foreignServerId) {
    return res.status(400).json({ error: 'iranServerId and foreignServerId required' });
  }
  try {
    const result = await tunnelManager.autoSetup(iranServerId, foreignServerId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/tunnel-engines/:tunnelId', adminAuth, async (req, res) => {
  try {
    const result = await tunnelManager.stopTunnel(req.params.tunnelId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/tunnel-engines/status', adminAuth, (req, res) => {
  res.json({ success: true, tunnels: tunnelManager.getAllStatus() });
});

router.get('/tunnel-engines/health', adminAuth, async (req, res) => {
  try {
    const results = await tunnelManager.healthCheckAll();
    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/tunnel-engines/deploy-config', adminAuth, (req, res) => {
  const { engine, ...options } = req.body;
  const config = tunnelManager.generateDeployConfig(engine, options);
  if (config.error) return res.status(400).json(config);
  res.json({ success: true, config });
});

// ============ DOMAINS ============
router.get('/domains', adminAuth, (req, res) => {
  const { serverId } = req.query;
  res.json({
    success: true,
    domains: DomainService.listDomains(serverId ? parseInt(serverId) : null),
    stats: DomainService.getStats(),
  });
});

router.post('/domains', adminAuth, (req, res) => {
  const { domain, serverId } = req.body;
  if (!domain) return res.status(400).json({ error: 'Domain is required' });
  const result = DomainService.setMainDomain(domain, serverId || null);
  if (result.success) return res.status(201).json(result);
  res.status(400).json(result);
});

router.post('/domains/generate-subdomains', adminAuth, (req, res) => {
  const { domain, mode, serverId } = req.body;
  if (!domain) return res.status(400).json({ error: 'Domain is required' });
  const subdomains = DomainService.generateSubdomains(domain, mode || config.mode, serverId || null);
  res.json({ success: true, subdomains });
});

router.post('/domains/check-accessibility', adminAuth, async (req, res) => {
  const { domain } = req.body;
  if (!domain) return res.status(400).json({ error: 'Domain is required' });
  const result = await DomainService.checkAccessibility(domain);
  res.json(result);
});

router.delete('/domains/:domain', adminAuth, (req, res) => {
  DomainService.deleteDomain(req.params.domain);
  res.json({ success: true });
});

// ============ IMPORT / EXPORT (Iran-only) ============
router.get('/export/users', adminAuth, iranOnly, (req, res) => {
  const format = req.query.format || 'elahe';
  const data = ImportExportService.exportUsers(format);
  res.set({
    'Content-Type': 'application/json',
    'Content-Disposition': `attachment; filename="elahe-users-${format}-${new Date().toISOString().split('T')[0]}.json"`,
  });
  res.json(data);
});

router.post('/import/users', adminAuth, iranOnly, (req, res) => {
  try {
    const result = ImportExportService.importUsers(req.body, req.user.id);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.get('/export/settings', adminAuth, (req, res) => {
  const data = ImportExportService.exportSettings();
  res.set({
    'Content-Type': 'application/json',
    'Content-Disposition': `attachment; filename="elahe-settings-${new Date().toISOString().split('T')[0]}.json"`,
  });
  res.json(data);
});

router.post('/import/settings', adminAuth, (req, res) => {
  try {
    const result = ImportExportService.importSettings(req.body);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.get('/export/full', adminAuth, iranOnly, (req, res) => {
  const data = ImportExportService.fullBackup();
  res.set({
    'Content-Type': 'application/json',
    'Content-Disposition': `attachment; filename="elahe-full-backup-${new Date().toISOString().split('T')[0]}.json"`,
  });
  res.json(data);
});

router.post('/import/full', adminAuth, iranOnly, (req, res) => {
  try {
    const result = ImportExportService.fullRestore(req.body, req.user.id);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ============ EXTERNAL PANELS (Marzban / 3x-ui) ============
router.get('/external-panels', adminAuth, (req, res) => {
  res.json({ success: true, panels: ExternalPanelService.listPanels() });
});

router.post('/external-panels', adminAuth, (req, res) => {
  const result = ExternalPanelService.addPanel(req.body);
  res.json(result);
});

router.delete('/external-panels/:id', adminAuth, (req, res) => {
  ExternalPanelService.deletePanel(req.params.id);
  res.json({ success: true });
});

router.post('/external-panels/:id/health', adminAuth, async (req, res) => {
  const result = await ExternalPanelService.checkPanelHealth(req.params.id);
  res.json(result);
});

router.post('/external-panels/:id/sync', adminAuth, iranOnly, async (req, res) => {
  const panel = ExternalPanelService.getPanel(req.params.id);
  if (!panel) return res.status(404).json({ error: 'Panel not found' });

  let result;
  if (panel.type === 'marzban') {
    result = await ExternalPanelService.syncFromMarzban(req.params.id, req.user.id);
  } else if (panel.type === '3xui') {
    result = await ExternalPanelService.syncFromXUI(req.params.id, req.user.id);
  } else {
    return res.status(400).json({ error: 'Unsupported panel type' });
  }
  res.json(result);
});

router.get('/external-panels/:id/proxy-url', adminAuth, (req, res) => {
  const info = ExternalPanelService.getPanelProxyUrl(req.params.id);
  if (!info) return res.status(404).json({ error: 'Panel not found' });
  res.json({ success: true, ...info });
});

// ============ REALITY TARGETS ============
router.get('/reality-targets', adminAuth, (req, res) => {
  try {
    const { REALITY_TARGETS, getTargetsByCategory, getSafeTargets } = require('../../services/subscription/reality_targets');
    res.json({
      success: true,
      total: REALITY_TARGETS.length,
      byCategory: getTargetsByCategory(),
      safeTargets: getSafeTargets(),
    });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ============ SYSTEM MONITOR (Resources) ============
router.get('/system/resources', adminAuth, (req, res) => {
  try {
    const snapshot = SystemMonitor.getSnapshot();
    const connections = SystemMonitor.getActiveConnections();
    const bandwidth = SystemMonitor.getBandwidthSummary();
    res.json({
      success: true,
      ...snapshot,
      connections,
      bandwidth,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
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

module.exports = router;
