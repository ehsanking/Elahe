/**
 * Elahe Panel - Main Server
 * Advanced Multi-Protocol Tunnel Management System
 * Developer: EHSANKiNG
 * Version: 0.0.3
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const path = require('path');
const cron = require('node-cron');

const config = require('../config/default');
const { getDb } = require('../database');
const { createLogger } = require('../utils/logger');

// Routes
const authRoutes = require('../api/routes/auth');
const adminRoutes = require('../api/routes/admin');
const subscriptionRoutes = require('../api/routes/subscription');
const tunnelRoutes = require('../api/routes/tunnels');

// Services
const autopilotService = require('../services/autopilot');

const log = createLogger('Server');

const app = express();

// ============ MIDDLEWARE ============
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(cors({ origin: true, credentials: true }));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Too many requests' },
});
app.use('/api/', limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Please try again later.' },
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// ============ SETTINGS MIDDLEWARE ============
app.use((req, res, next) => {
  try {
    const db = getDb();
    const settings = db.prepare('SELECT * FROM settings').all();
    req.siteSettings = {};
    settings.forEach(s => { req.siteSettings[s.key] = s.value; });
  } catch (e) {
    req.siteSettings = {};
  }
  next();
});

// ============ API ROUTES ============
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/tunnels', tunnelRoutes);
app.use('/sub', subscriptionRoutes);

// Serve terms file
app.get('/api/files/terms', (req, res) => {
  const termsPath = path.join(config.paths.public, 'shared', 'terms.txt');
  const fs = require('fs');
  if (fs.existsSync(termsPath)) {
    res.type('text/plain; charset=utf-8').sendFile(termsPath);
  } else {
    res.status(404).send('Terms file not found');
  }
});

// ============ SITE SETTINGS API (public) ============
app.get('/api/settings/site', (req, res) => {
  const mode = config.mode;
  const prefix = mode === 'iran' ? 'site.ir' : 'site.en';

  const siteConfig = {};
  for (const [key, value] of Object.entries(req.siteSettings)) {
    if (key.startsWith(prefix)) {
      siteConfig[key.replace(prefix + '.', '')] = value;
    }
  }

  res.json({
    mode,
    ...siteConfig,
    version: req.siteSettings.version || '0.0.3',
  });
});

// ============ STATIC FILES ============
const mode = config.mode;
app.use('/shared', express.static(path.join(config.paths.public, 'shared')));
app.use('/admin', express.static(path.join(config.paths.public, 'admin')));

if (mode === 'iran') {
  app.use(express.static(path.join(config.paths.public, 'ir')));
} else {
  app.use(express.static(path.join(config.paths.public, 'en')));
}

// ============ SPA FALLBACK ============
app.get('/admin/*', (req, res) => {
  res.sendFile(path.join(config.paths.public, 'admin', 'index.html'));
});

app.get('/sub/info/:token', (req, res) => {
  res.sendFile(path.join(config.paths.public, 'admin', 'subscription.html'));
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/sub/')) return res.status(404).json({ error: 'Not found' });

  if (mode === 'iran') {
    res.sendFile(path.join(config.paths.public, 'ir', 'index.html'));
  } else {
    res.sendFile(path.join(config.paths.public, 'en', 'index.html'));
  }
});

// ============ ERROR HANDLER ============
app.use((err, req, res, next) => {
  log.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// ============ CRON JOBS ============
// Monitor tunnels every 10 minutes (with Autopilot)
const TunnelService = require('../services/tunnel');
cron.schedule('*/10 * * * *', async () => {
  try {
    await TunnelService.runMonitoringCycle();
  } catch (err) {
    log.error('Monitoring cycle failed', { error: err.message });
  }
});

// Cleanup expired sessions hourly
cron.schedule('0 * * * *', () => {
  try {
    const db = getDb();
    db.prepare("DELETE FROM captcha_sessions WHERE expires_at < datetime('now')").run();
    db.prepare("DELETE FROM active_connections WHERE last_heartbeat < datetime('now', '-5 minutes')").run();

    db.prepare(`
      UPDATE users SET status = 'expired' 
      WHERE status = 'active' AND expire_at IS NOT NULL AND expire_at < datetime('now')
    `).run();

    db.prepare(`
      UPDATE users SET status = 'limited' 
      WHERE status = 'active' AND data_limit > 0 AND data_used >= data_limit
    `).run();

    log.info('Cleanup job completed');
  } catch (err) {
    log.error('Cleanup job failed', { error: err.message });
  }
});

// ============ START SERVER ============
const PORT = config.server.port;
const HOST = config.server.host;

app.listen(PORT, HOST, async () => {
  log.info(`Elahe Panel v0.0.3 started`, {
    mode: config.mode,
    address: `http://${HOST}:${PORT}`,
    admin: `http://${HOST}:${PORT}/admin`,
  });
  log.info(`Developer: EHSANKiNG`);
  log.info(`Mode: ${config.mode === 'iran' ? 'Iran (Camouflage)' : 'Foreign (DNS Provider)'}`);

  // Initialize Autopilot Tunnel Management
  try {
    const autopilotStatus = await autopilotService.initialize();
    log.info('Autopilot initialized', {
      primary443: autopilotStatus.primary443,
      alwaysOn: Object.keys(autopilotStatus.portAllocation?.alwaysOn || {}),
    });
  } catch (err) {
    log.error('Autopilot initialization failed', { error: err.message });
  }
});

module.exports = app;
