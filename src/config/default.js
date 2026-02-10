/**
 * Elahe Panel - Default Configuration
 * Developer: EHSANKiNG
 * Version: 0.0.5
 */

const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../../.env') });

module.exports = {
  // Server mode: 'iran' or 'foreign'
  mode: process.env.ELAHE_MODE || 'iran',
  
  // Server settings
  server: {
    host: process.env.HOST || '0.0.0.0',
    port: parseInt(process.env.PORT) || 3000,
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    jwtSecret: process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex'),
    jwtExpiry: '24h',
  },

  // Database
  database: {
    path: process.env.DB_PATH || path.join(__dirname, '../../data/elahe.db'),
  },

  // Admin defaults
  admin: {
    username: process.env.ADMIN_USER || 'admin',
    password: process.env.ADMIN_PASS || 'admin',
  },

  // Iran site configuration (camouflage)
  iranSite: {
    title: process.env.IR_TITLE || '\u06AF\u0630\u0631 \u062A\u062D\u0631\u06CC\u0645',
    subtitle: process.env.IR_SUBTITLE || '\u0633\u0631\u0648\u06CC\u0633 \u062A\u063A\u06CC\u06CC\u0631 \u062F\u06CC\u200C\u0627\u0646\u200C\u0627\u0633 \u0628\u0631\u0627\u06CC \u062F\u0633\u062A\u0631\u0633\u06CC \u0622\u0632\u0627\u062F',
    primaryColor: process.env.IR_PRIMARY || '#1a73e8',
    secondaryColor: process.env.IR_SECONDARY || '#34a853',
    accentColor: process.env.IR_ACCENT || '#fbbc04',
    domain: process.env.IR_DOMAIN || 'localhost',
  },

  // Foreign site configuration
  foreignSite: {
    title: process.env.EN_TITLE || 'Linux Academy',
    subtitle: process.env.EN_SUBTITLE || 'Hands-on Linux training, labs, and certification prep',
    primaryColor: process.env.EN_PRIMARY || '#0f172a',
    secondaryColor: process.env.EN_SECONDARY || '#3b82f6',
    accentColor: process.env.EN_ACCENT || '#10b981',
    domain: process.env.EN_DOMAIN || 'localhost',
  },

  // Tunnel settings
  tunnel: {
    monitorInterval: 30 * 60 * 1000, // 30 minutes
    healthCheckTimeout: 5000, // 5 seconds
    maxRetries: 3,
    protocols: ['vless-reality', 'trusttunnel', 'wireguard', 'openvpn', 'vmess', 'trojan', 'shadowsocks', 'hysteria2'],
  },

  // Protocol ports
  ports: {
    vless: 443,
    trusttunnel: 8443,
    wireguard: [1414, 53133],
    openvpn: [110, 510],
    vmess: 8080,
    trojan: 8443,
    shadowsocks: 8388,
    hysteria2: 4433,
  },

  // Xray/Sing-box core selection
  core: {
    engine: process.env.CORE_ENGINE || 'xray', // 'xray' or 'singbox'
    xrayPath: process.env.XRAY_PATH || '/usr/local/bin/xray',
    singboxPath: process.env.SINGBOX_PATH || '/usr/local/bin/sing-box',
  },

  // Traffic camouflage
  camouflage: {
    enabled: true,
    profiles: ['cod-mobile', 'pubg-mobile', 'clash-royale', 'ai-training', 'db-sync', 'video-streaming'],
    fakeWebsite: 'ai-research', // 'ai-research' or 'cloud-company'
  },

  // User defaults
  userDefaults: {
    trafficLimit: 50 * 1024 * 1024 * 1024, // 50 GB
    expiryDays: 30,
    maxConnections: 2,
    plan: 'bronze',
  },

  // Captcha settings
  captcha: {
    size: 6,
    noise: 3,
    color: true,
    background: '#f0f0f0',
  },

  // SSL / HTTPS
  ssl: {
    enabled: (process.env.SSL_ENABLED || 'auto'), // 'auto', 'true', 'false'
    cert: process.env.SSL_CERT || path.join(__dirname, '../../certs/fullchain.pem'),
    key: process.env.SSL_KEY || path.join(__dirname, '../../certs/privkey.pem'),
    httpsPort: parseInt(process.env.HTTPS_PORT) || parseInt(process.env.PORT) || 443,
    httpPort: parseInt(process.env.HTTP_PORT) || 80,
    redirectHttp: process.env.SSL_REDIRECT_HTTP !== 'false', // redirect HTTP->HTTPS by default
    autoRenew: process.env.SSL_AUTO_RENEW !== 'false', // auto-renew Let's Encrypt by default
    renewDaysBefore: parseInt(process.env.SSL_RENEW_DAYS) || 7, // days before expiry to renew
  },

  // Paths
  paths: {
    public: path.join(__dirname, '../../public'),
    logs: path.join(__dirname, '../../logs'),
    data: path.join(__dirname, '../../data'),
    certs: path.join(__dirname, '../../certs'),
    templates: path.join(__dirname, '../../templates'),
  },
};
