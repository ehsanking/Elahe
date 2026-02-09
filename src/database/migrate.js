/**
 * Elahe Panel - Database Migration
 * SQLite with standard schema compatible with Marzban/X-UI migration
 * Developer: EHSANKiNG
 */

const Database = require('better-sqlite3');
const path = require('path');
const config = require('../config/default');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

function migrate(dbPath) {
  const db = new Database(dbPath || config.database.path);
  
  // Enable WAL mode for better performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // ============ ADMIN TABLE ============
  db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      is_sudo INTEGER DEFAULT 0,
      telegram_id TEXT,
      discord_webhook TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'disabled'))
    )
  `);

  // ============ USERS TABLE (Marzban/X-UI compatible) ============
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT UNIQUE NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password TEXT,
      email TEXT,
      phone TEXT,
      
      -- Subscription
      plan TEXT DEFAULT 'bronze' CHECK(plan IN ('free', 'bronze', 'silver', 'gold')),
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'disabled', 'limited', 'expired', 'on_hold')),
      
      -- Limits
      data_limit BIGINT DEFAULT 0,
      data_used BIGINT DEFAULT 0,
      expire_at DATETIME,
      max_connections INTEGER DEFAULT 2,
      
      -- Subscription link
      subscription_token TEXT UNIQUE,
      subscription_url TEXT,
      
      -- Protocols enabled
      protocols_enabled TEXT DEFAULT '["vless-reality","vmess","trojan","shadowsocks","hysteria2","wireguard","openvpn","trusttunnel"]',
      
      -- Metadata (JSON)
      note TEXT,
      metadata TEXT DEFAULT '{}',
      
      -- Timestamps
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_connected DATETIME,
      created_by INTEGER REFERENCES admins(id)
    )
  `);

  // ============ SERVERS TABLE ============
  db.exec(`
    CREATE TABLE IF NOT EXISTS servers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('iran', 'foreign')),
      ip TEXT NOT NULL,
      port INTEGER DEFAULT 3000,
      
      -- Connection
      connection_token TEXT UNIQUE,
      auth_key TEXT,
      
      -- Status
      status TEXT DEFAULT 'pending' CHECK(status IN ('active', 'inactive', 'pending', 'error')),
      last_ping DATETIME,
      latency_ms INTEGER,
      jitter_ms INTEGER,
      
      -- Configuration
      core_engine TEXT DEFAULT 'xray' CHECK(core_engine IN ('xray', 'singbox')),
      config TEXT DEFAULT '{}',
      
      -- Metadata
      location TEXT,
      isp TEXT,
      max_users INTEGER DEFAULT 100,
      current_users INTEGER DEFAULT 0,
      bandwidth_limit BIGINT DEFAULT 0,
      bandwidth_used BIGINT DEFAULT 0,
      
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ============ TUNNELS TABLE ============
  db.exec(`
    CREATE TABLE IF NOT EXISTS tunnels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      iran_server_id INTEGER REFERENCES servers(id),
      foreign_server_id INTEGER REFERENCES servers(id),
      
      protocol TEXT NOT NULL,
      transport TEXT DEFAULT 'tcp',
      port INTEGER,
      
      status TEXT DEFAULT 'inactive' CHECK(status IN ('active', 'inactive', 'testing', 'failed')),
      score REAL DEFAULT 0,
      latency_ms INTEGER,
      jitter_ms INTEGER,
      
      -- Config
      config TEXT DEFAULT '{}',
      
      -- Priority
      priority INTEGER DEFAULT 0,
      is_primary INTEGER DEFAULT 0,
      
      last_check DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ============ USER CONFIGS TABLE ============
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      server_id INTEGER REFERENCES servers(id),
      
      protocol TEXT NOT NULL,
      config_link TEXT NOT NULL,
      config_data TEXT,
      
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'disabled')),
      
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ============ CONNECTIONS LOG ============
  db.exec(`
    CREATE TABLE IF NOT EXISTS connection_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      server_id INTEGER REFERENCES servers(id),
      
      protocol TEXT,
      ip_address TEXT,
      device_info TEXT,
      
      bytes_sent BIGINT DEFAULT 0,
      bytes_received BIGINT DEFAULT 0,
      
      connected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      disconnected_at DATETIME,
      duration_seconds INTEGER DEFAULT 0
    )
  `);

  // ============ ACTIVE CONNECTIONS (for concurrent limit) ============
  db.exec(`
    CREATE TABLE IF NOT EXISTS active_connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      server_id INTEGER REFERENCES servers(id),
      
      ip_address TEXT,
      device_info TEXT,
      protocol TEXT,
      
      connected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_heartbeat DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ============ MONITOR RESULTS ============
  db.exec(`
    CREATE TABLE IF NOT EXISTS monitor_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tunnel_id INTEGER REFERENCES tunnels(id),
      
      latency_ms INTEGER,
      jitter_ms INTEGER,
      packet_loss REAL DEFAULT 0,
      score REAL DEFAULT 0,
      status TEXT,
      
      checked_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ============ SETTINGS TABLE ============
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ============ CAPTCHA SESSIONS ============
  db.exec(`
    CREATE TABLE IF NOT EXISTS captcha_sessions (
      id TEXT PRIMARY KEY,
      answer TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL
    )
  `);

  // ============ ROUTING RULES TABLE (GeoIP/GeoData) ============
  db.exec(`
    CREATE TABLE IF NOT EXISTS routing_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('geoip', 'geosite', 'domain', 'ip', 'custom')),
      action TEXT NOT NULL CHECK(action IN ('direct', 'proxy', 'block', 'warp')),
      value TEXT NOT NULL,
      priority INTEGER DEFAULT 0,
      enabled INTEGER DEFAULT 1,
      category TEXT,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ============ SUBDOMAINS TABLE ============
  db.exec(`
    CREATE TABLE IF NOT EXISTS subdomains (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subdomain TEXT UNIQUE NOT NULL,
      parent_domain TEXT NOT NULL,
      ssl_status TEXT DEFAULT 'none' CHECK(ssl_status IN ('none', 'pending', 'active', 'expired', 'self-signed')),
      ssl_cert_path TEXT,
      ssl_key_path TEXT,
      ssl_expires_at DATETIME,
      purpose TEXT DEFAULT 'general',
      server_id INTEGER REFERENCES servers(id),
      enabled INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ============ WARP CONFIG TABLE ============
  db.exec(`
    CREATE TABLE IF NOT EXISTS warp_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      warp_id TEXT,
      private_key TEXT,
      public_key TEXT,
      ipv4 TEXT,
      ipv6 TEXT,
      endpoint TEXT DEFAULT 'engage.cloudflareclient.com:2408',
      status TEXT DEFAULT 'inactive' CHECK(status IN ('active', 'inactive', 'error')),
      domains TEXT DEFAULT '[]',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ============ CORE VERSIONS TABLE ============
  db.exec(`
    CREATE TABLE IF NOT EXISTS core_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      engine TEXT NOT NULL CHECK(engine IN ('xray', 'singbox')),
      version TEXT NOT NULL,
      binary_path TEXT,
      is_active INTEGER DEFAULT 0,
      downloaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      config TEXT DEFAULT '{}',
      status TEXT DEFAULT 'available' CHECK(status IN ('available', 'active', 'error'))
    )
  `);

  // ============ BLOCKED CATEGORIES TABLE ============
  db.exec(`
    CREATE TABLE IF NOT EXISTS blocked_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT UNIQUE NOT NULL CHECK(category IN ('torrent', 'porn', 'gambling', 'ads', 'malware', 'custom')),
      enabled INTEGER DEFAULT 0,
      description TEXT,
      rule_count INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ============ API KEYS TABLE ============
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      key_hash TEXT UNIQUE NOT NULL,
      permissions TEXT DEFAULT '["read"]',
      admin_id INTEGER REFERENCES admins(id),
      last_used DATETIME,
      expires_at DATETIME,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'revoked')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ============ USER ONLINE STATUS TABLE ============
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_online_status (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      is_online INTEGER DEFAULT 0,
      last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
      ip_address TEXT,
      client_app TEXT,
      protocol TEXT
    )
  `);

  // ============ INDEXES ============
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_uuid ON users(uuid);
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_users_subscription_token ON users(subscription_token);
    CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
    CREATE INDEX IF NOT EXISTS idx_servers_type ON servers(type);
    CREATE INDEX IF NOT EXISTS idx_servers_status ON servers(status);
    CREATE INDEX IF NOT EXISTS idx_tunnels_status ON tunnels(status);
    CREATE INDEX IF NOT EXISTS idx_connection_logs_user ON connection_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_active_connections_user ON active_connections(user_id);
    CREATE INDEX IF NOT EXISTS idx_captcha_expires ON captcha_sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_routing_rules_type ON routing_rules(type);
    CREATE INDEX IF NOT EXISTS idx_subdomains_parent ON subdomains(parent_domain);
    CREATE INDEX IF NOT EXISTS idx_core_versions_engine ON core_versions(engine);
    CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
  `);

  // Add online status column to users if not exists
  try {
    db.exec(`ALTER TABLE users ADD COLUMN is_online INTEGER DEFAULT 0`);
  } catch (_) { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE users ADD COLUMN last_seen DATETIME`);
  } catch (_) { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE users ADD COLUMN client_info TEXT DEFAULT '{}'`);
  } catch (_) { /* column already exists */ }

  // Create default admin if not exists
  const adminExists = db.prepare('SELECT COUNT(*) as count FROM admins').get();
  if (adminExists.count === 0) {
    const hashedPass = bcrypt.hashSync(config.admin.password, 10);
    db.prepare(`
      INSERT INTO admins (username, password, is_sudo) VALUES (?, ?, 1)
    `).run(config.admin.username, hashedPass);
    console.log(`[DB] Default admin created: ${config.admin.username}`);
  }

  // Insert default settings
  const settingsInsert = db.prepare(`
    INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)
  `);
  
  const defaultSettings = {
    'site.ir.title': config.iranSite.title,
    'site.ir.subtitle': config.iranSite.subtitle,
    'site.ir.primaryColor': config.iranSite.primaryColor,
    'site.ir.secondaryColor': config.iranSite.secondaryColor,
    'site.ir.accentColor': config.iranSite.accentColor,
    'site.en.title': config.foreignSite.title,
    'site.en.subtitle': config.foreignSite.subtitle,
    'site.en.primaryColor': config.foreignSite.primaryColor,
    'site.en.secondaryColor': config.foreignSite.secondaryColor,
    'site.en.accentColor': config.foreignSite.accentColor,
    'core.engine': config.core.engine,
    'tunnel.monitorInterval': String(config.tunnel.monitorInterval),
    'user.defaultPlan': config.userDefaults.plan,
    'user.defaultTrafficLimit': String(config.userDefaults.trafficLimit),
    'user.defaultExpiryDays': String(config.userDefaults.expiryDays),
    'user.defaultMaxConnections': String(config.userDefaults.maxConnections),
    'version': '0.0.4',
  };

  const insertMany = db.transaction(() => {
    for (const [key, value] of Object.entries(defaultSettings)) {
      settingsInsert.run(key, value);
    }
  });
  insertMany();

  console.log('[DB] Migration completed successfully');
  return db;
}

// Run directly
if (require.main === module) {
  migrate();
}

module.exports = { migrate };
