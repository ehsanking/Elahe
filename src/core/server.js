/**
 * Elahe Panel - Main Server
 * Advanced Multi-Protocol Tunnel Management System
 * Developer: EHSANKiNG
 * Version: 0.0.5
 */

const express = require('express');
const http = require('http');
const https = require('https');
const net = require('net');
const fs = require('fs');
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
const { errorHandler, notFoundHandler } = require('../utils/errors');
const { setupSwagger } = require('../utils/swagger');

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
const SETTINGS_CACHE_TTL_MS = parseInt(process.env.SETTINGS_CACHE_TTL_MS || '30000');
let settingsCache = {
  data: {},
  expiresAt: 0,
};

const loadSiteSettings = () => {
  const now = Date.now();
  if (settingsCache.expiresAt > now) {
    return settingsCache.data;
  }

  const db = getDb();
  const settings = db.prepare('SELECT * FROM settings').all();
  const mapped = {};
  settings.forEach(s => { mapped[s.key] = s.value; });

  settingsCache = {
    data: mapped,
    expiresAt: now + SETTINGS_CACHE_TTL_MS,
  };

  return mapped;
};

app.use((req, res, next) => {
  try {
    req.siteSettings = loadSiteSettings();
  } catch (e) {
    req.siteSettings = {};
  }
  next();
});

// ============ API DOCUMENTATION ============
setupSwagger(app);

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
    version: req.siteSettings.version || '0.0.5',
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

// ============ ERROR HANDLERS ============
// 404 handler for API routes
app.use('/api/*', notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

// ============ CRON JOBS ============
// Monitor tunnels every 30 minutes (with Autopilot)
const TunnelService = require('../services/tunnel');
cron.schedule('*/30 * * * *', async () => {
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

// SSL certificate auto-renewal (daily at 3 AM)
const DomainService = require('../services/domain');
cron.schedule('0 3 * * *', async () => {
  if (!config.ssl.autoRenew) {
    log.debug('SSL auto-renewal disabled, skipping');
    return;
  }
  
  try {
    log.info('Starting SSL certificate auto-renewal check');
    const result = await DomainService.checkAndRenewSSL();
    
    if (result.renewed.length > 0) {
      log.info('SSL certificates renewed', { 
        renewed: result.renewed.map(r => r.domain),
        count: result.renewed.length 
      });
      
      // Reload server SSL if certificates changed
      if (sslInfo.available && httpsServer) {
        try {
          const newCert = fs.readFileSync(sslInfo.certPath, 'utf8');
          const newKey = fs.readFileSync(sslInfo.keyPath, 'utf8');
          if (newCert && newKey && newCert.length > 100 && newKey.length > 100) {
            httpsServer.setSecureContext({ cert: newCert, key: newKey });
            log.info('Server SSL context reloaded after certificate renewal');
          }
        } catch (e) {
          log.warn('Failed to reload SSL certificates after renewal', { error: e.message });
        }
      }
    }
    
    if (result.failed.length > 0) {
      log.warn('SSL certificate renewals failed', { 
        failed: result.failed.map(f => ({ domain: f.domain, error: f.error }))
      });
    }
    
    log.info('SSL renewal check completed', { 
      renewed: result.renewed.length, 
      failed: result.failed.length,
      skipped: result.skipped.length 
    });
  } catch (err) {
    log.error('SSL auto-renewal failed', { error: err.message });
  }
});

// ============ SSL DETECTION ============

function detectSSL() {
  const sslConfig = config.ssl || {};
  const sslMode = (sslConfig.enabled || 'auto').toString().toLowerCase();

  if (sslMode === 'false') {
    return { available: false, reason: 'SSL explicitly disabled via SSL_ENABLED=false' };
  }

  // Try multiple certificate locations in priority order
  const certLocations = [
    // 1. From .env / config
    { cert: sslConfig.cert, key: sslConfig.key },
    // 2. Standard certs directory  
    { cert: path.join(config.paths.certs, 'fullchain.pem'), key: path.join(config.paths.certs, 'privkey.pem') },
    // 3. Let's Encrypt default locations (common domain patterns)
    { cert: '/etc/letsencrypt/live/fullchain.pem', key: '/etc/letsencrypt/live/privkey.pem' },
  ];

  // Also check for domain-specific Let's Encrypt certs
  const domain = process.env.DOMAIN || process.env.IR_DOMAIN || process.env.EN_DOMAIN;
  if (domain && domain !== 'localhost') {
    certLocations.push({
      cert: `/etc/letsencrypt/live/${domain}/fullchain.pem`,
      key: `/etc/letsencrypt/live/${domain}/privkey.pem`,
    });
  }

  for (const loc of certLocations) {
    if (!loc.cert || !loc.key) continue;
    if (!fs.existsSync(loc.cert) || !fs.existsSync(loc.key)) continue;
    try {
      const certContent = fs.readFileSync(loc.cert, 'utf8');
      const keyContent = fs.readFileSync(loc.key, 'utf8');
      if (certContent && keyContent && certContent.length > 100 && keyContent.length > 100) {
        log.info(`SSL certificates found at ${loc.cert}`);
        return { available: true, cert: certContent, key: keyContent, certPath: loc.cert, keyPath: loc.key };
      }
    } catch (_) { /* try next location */ }
  }

  return { available: false, reason: 'No valid SSL certificate files found in any known location' };
}

// ============ START SERVER ============
//
// Architecture:
//   - If SSL certs exist:  HTTPS on PORT, optional HTTP→HTTPS redirect on port 80
//   - If no SSL certs:     HTTP on PORT
//
// When SSL is enabled on port 443, we also accept plain HTTP on the same
// port and redirect it to HTTPS to avoid "plain HTTP request sent to HTTPS port" errors.

const HOST = config.server.host;
const PREFERRED_PORT = config.server.port;
const sslInfo = detectSSL();
const redirectHttp = (config.ssl || {}).redirectHttp !== false;

const parseFallbackPorts = () => {
  const raw = (process.env.PORT_FALLBACKS || '8443,3000')
    .split(',')
    .map(v => parseInt(v.trim(), 10))
    .filter(v => Number.isInteger(v) && v > 0 && v <= 65535);

  return Array.from(new Set(raw.filter(p => p !== PREFERRED_PORT)));
};

const checkPortAvailable = (port) => new Promise((resolve) => {
  const tester = net.createServer();
  tester.once('error', (err) => {
    resolve({ available: false, code: err.code || 'UNKNOWN' });
  });
  tester.once('listening', () => {
    tester.close(() => resolve({ available: true }));
  });
  tester.listen(port, HOST);
});

const resolveRuntimePort = async () => {
  const candidates = [PREFERRED_PORT, ...parseFallbackPorts()];
  for (const candidate of candidates) {
    const result = await checkPortAvailable(candidate);
    if (result.available) {
      if (candidate !== PREFERRED_PORT) {
        log.warn(`Preferred port ${PREFERRED_PORT} unavailable. Falling back to ${candidate}`);
      }
      return candidate;
    }
    log.warn(`Port ${candidate} is not available`, { code: result.code });
  }

  throw new Error(`No available port found. Tried: ${candidates.join(', ')}`);
};

const buildRedirectApp = () => {
  const redirectApp = express();
  redirectApp.use((req, res) => {
    const host = (req.headers.host || '').replace(/:\d+$/, '');
    const portSuffix = (runtimePort === 443) ? '' : `:${runtimePort}`;
    res.redirect(301, `https://${host}${portSuffix}${req.url}`);
  });
  return redirectApp;
};

const buildUpgradeRequiredApp = () => {
  const upgradeApp = express();
  upgradeApp.use((req, res) => {
    res.status(426).send('HTTPS required');
  });
  return upgradeApp;
};

let mainServer;
let httpsServer;
let runtimePort = PREFERRED_PORT;

if (sslInfo.available) {
  // ── HTTPS MODE ──
  const sslOptions = {
    cert: sslInfo.cert,
    key: sslInfo.key,
    minVersion: 'TLSv1.2',
    ciphers: [
      'TLS_AES_256_GCM_SHA384',
      'TLS_CHACHA20_POLY1305_SHA256',
      'TLS_AES_128_GCM_SHA256',
      'ECDHE-RSA-AES256-GCM-SHA384',
      'ECDHE-RSA-AES128-GCM-SHA256',
      'ECDHE-RSA-CHACHA20-POLY1305',
    ].join(':'),
  };

  httpsServer = https.createServer(sslOptions, app);

  // Auto-reload certificates when they change (e.g. certbot renewal)
  let certReloadTimer = null;
  const watchCertFile = (filePath) => {
    try {
      fs.watch(filePath, () => {
        if (certReloadTimer) clearTimeout(certReloadTimer);
        certReloadTimer = setTimeout(() => {
          try {
            const newCert = fs.readFileSync(sslInfo.certPath, 'utf8');
            const newKey = fs.readFileSync(sslInfo.keyPath, 'utf8');
            if (newCert && newKey && newCert.length > 100 && newKey.length > 100) {
              httpsServer.setSecureContext({ cert: newCert, key: newKey });
              log.info('SSL certificates reloaded successfully');
            }
          } catch (e) {
            log.warn('Failed to reload SSL certificates', { error: e.message });
          }
        }, 3000);
      });
    } catch (_) { /* fs.watch not available on all platforms */ }
  };
  watchCertFile(sslInfo.certPath);
  watchCertFile(sslInfo.keyPath);

  const httpFallbackApp = redirectHttp ? buildRedirectApp() : buildUpgradeRequiredApp();
  const httpFallbackServer = http.createServer(httpFallbackApp);

  const allowHttpOnHttpsPort = runtimePort === 443 || (config.ssl || {}).allowHttpOnHttpsPort === true;
  if (allowHttpOnHttpsPort) {
    mainServer = net.createServer((socket) => {
      socket.once('data', (buffer) => {
        if (!buffer || buffer.length === 0) {
          socket.destroy();
          return;
        }
        const isTls = buffer[0] === 22;
        const targetServer = isTls ? httpsServer : httpFallbackServer;
        socket.unshift(buffer);
        targetServer.emit('connection', socket);
      });
    });
  } else {
    mainServer = httpsServer;
  }

  if (redirectHttp) {
    // Start HTTP→HTTPS redirect on port 80 (non-fatal if can't bind)
    const httpRedirectPort = (config.ssl || {}).httpPort || 80;
    const redirectServer = http.createServer(buildRedirectApp());
    redirectServer.listen(httpRedirectPort, HOST, () => {
      log.info(`HTTP→HTTPS redirect active on port ${httpRedirectPort}`);
    }).on('error', (err) => {
      if (err.code === 'EACCES') {
        log.info(`Cannot bind port ${httpRedirectPort} (not root). Use: http://domain:${runtimePort} → auto-redirects not available`);
      } else if (err.code === 'EADDRINUSE') {
        log.info(`Port ${httpRedirectPort} already in use, HTTP redirect skipped`);
      }
    });
  }
} else {
  // ── HTTP MODE ──
  // No SSL certs: serve plain HTTP
  mainServer = http.createServer(app);
}

// Start the main server
(async () => {
  try {
    runtimePort = await resolveRuntimePort();

    mainServer.listen(runtimePort, HOST, async () => {
      const protocol = sslInfo.available ? 'https' : 'http';

      log.info(`Elahe Panel v0.0.5 started`, {
        mode: config.mode,
        protocol,
        address: `${protocol}://${HOST}:${runtimePort}`,
        admin: `${protocol}://${HOST}:${runtimePort}/admin`,
      });
      log.info(`Developer: EHSANKiNG`);
      log.info(`Mode: ${config.mode === 'iran' ? 'Iran (Camouflage)' : 'Foreign (DNS Provider)'}`);

      if (sslInfo.available) {
        log.info(`HTTPS enabled on port ${runtimePort} (cert: ${sslInfo.certPath})`);
        log.info(`Access: https://YOUR_DOMAIN:${runtimePort}`);
      } else {
        log.info(`HTTP mode: ${sslInfo.reason}`);
        log.info(`Access: http://YOUR_IP:${runtimePort}`);
        log.info(`To enable HTTPS: install SSL certs and restart (elahe set-domain)`);
      }

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
  } catch (err) {
    log.error('Server startup failed due to port conflict', { error: err.message, preferredPort: PREFERRED_PORT });
    process.exit(1);
  }
})();

module.exports = app;
