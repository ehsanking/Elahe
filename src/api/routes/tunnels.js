/**
 * Elahe Panel - Tunnel Engine API Routes
 * Provides REST API for managing tunnel engines
 * Developer: EHSANKiNG
 */

const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../../middleware/auth');
const { tunnelManager } = require('../../tunnel/engines');
const { createLogger } = require('../../utils/logger');

const log = createLogger('TunnelAPI');
const adminAuth = authMiddleware('admin');

// ============ ENGINE INFO ============

/**
 * GET /api/tunnels/engines
 * List all available tunnel engines
 */
router.get('/engines', adminAuth, (req, res) => {
  res.json({
    success: true,
    engines: tunnelManager.getEngines(),
  });
});

// ============ TUNNEL MANAGEMENT ============

/**
 * POST /api/tunnels/create
 * Create and start a new tunnel
 * Body: { engine, iranServerId, foreignServerId, port, transport, tunnelConfig }
 */
router.post('/create', adminAuth, async (req, res) => {
  try {
    const result = await tunnelManager.createTunnel(req.body);
    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (err) {
    log.error('Create tunnel error', { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/tunnels/auto-setup
 * Auto-setup all recommended tunnels for a server pair
 * Body: { iranServerId, foreignServerId }
 */
router.post('/auto-setup', adminAuth, async (req, res) => {
  try {
    const { iranServerId, foreignServerId } = req.body;
    if (!iranServerId || !foreignServerId) {
      return res.status(400).json({ success: false, error: 'iranServerId and foreignServerId required' });
    }
    const result = await tunnelManager.autoSetup(iranServerId, foreignServerId);
    res.json(result);
  } catch (err) {
    log.error('Auto-setup error', { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/tunnels/:tunnelId
 * Stop and remove a tunnel
 */
router.delete('/:tunnelId', adminAuth, async (req, res) => {
  try {
    const result = await tunnelManager.stopTunnel(req.params.tunnelId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/tunnels/status
 * Get status of all active tunnels
 */
router.get('/status', adminAuth, (req, res) => {
  res.json({
    success: true,
    tunnels: tunnelManager.getAllStatus(),
  });
});

/**
 * GET /api/tunnels/status/:tunnelId
 * Get status of a specific tunnel
 */
router.get('/status/:tunnelId', adminAuth, (req, res) => {
  const status = tunnelManager.getTunnelStatus(req.params.tunnelId);
  if (!status) return res.status(404).json({ success: false, error: 'Tunnel not found' });
  res.json({ success: true, ...status });
});

/**
 * GET /api/tunnels/health
 * Health check all tunnels
 */
router.get('/health', adminAuth, async (req, res) => {
  try {
    const results = await tunnelManager.healthCheckAll();
    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/tunnels/stats
 * Get tunnel statistics
 */
router.get('/stats', adminAuth, (req, res) => {
  res.json({
    success: true,
    stats: tunnelManager.getStats(),
  });
});

/**
 * GET /api/tunnels/recommend/:iranServerId/:foreignServerId
 * Get recommended tunnel setup for a server pair
 */
router.get('/recommend/:iranServerId/:foreignServerId', adminAuth, (req, res) => {
  const { getDb } = require('../../database');
  const db = getDb();
  const iranServer = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.iranServerId);
  const foreignServer = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.foreignServerId);

  if (!iranServer || !foreignServer) {
    return res.status(404).json({ success: false, error: 'Server(s) not found' });
  }

  res.json({
    success: true,
    ...tunnelManager.getRecommendedSetup(iranServer, foreignServer),
  });
});

/**
 * POST /api/tunnels/deploy-config
 * Generate deployment configuration for a tunnel engine
 * Body: { engine, tunnelId, mode, ... }
 */
router.post('/deploy-config', adminAuth, (req, res) => {
  const { engine, ...options } = req.body;
  const config = tunnelManager.generateDeployConfig(engine, options);
  if (config.error) return res.status(400).json({ success: false, error: config.error });
  res.json({ success: true, ...config });
});

module.exports = router;
