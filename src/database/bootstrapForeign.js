const { getDb } = require('./index');
const config = require('../config/default');

const RESERVED_PORTS = new Set([80, 443]);

function randomPort(usedPorts) {
  let attempts = 0;
  while (attempts < 1000) {
    const candidate = Math.floor(Math.random() * (65000 - 2000 + 1)) + 2000;
    if (!RESERVED_PORTS.has(candidate) && !usedPorts.has(candidate)) {
      return candidate;
    }
    attempts += 1;
  }
  throw new Error('Unable to allocate a free random port for foreign tunnel bootstrap.');
}

function normalizeProtocolName(name) {
  const normalized = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (normalized === 'cphil') return 'chisel';
  return normalized;
}

function bootstrapForeignMultiTunnel() {
  if (config.mode !== 'foreign') {
    return { success: false, skipped: true, reason: 'bootstrap only applies to foreign mode' };
  }

  const db = getDb();
  const protocols = Array.from(new Set((config.tunnel?.protocols || []).map(normalizeProtocolName))).filter(Boolean);

  const foreignServer = db.prepare("SELECT id FROM servers WHERE type = 'foreign' ORDER BY id LIMIT 1").get();
  const foreignServerId = foreignServer
    ? foreignServer.id
    : db.prepare(`
        INSERT INTO servers (name, type, ip, port, status, config)
        VALUES (?, 'foreign', ?, ?, 'active', ?)
      `).run('Foreign Main', process.env.DOMAIN || '127.0.0.1', parseInt(process.env.PORT || '3000', 10), '{}').lastInsertRowid;

  db.prepare("UPDATE tunnels SET status = 'inactive', is_primary = 0, updated_at = CURRENT_TIMESTAMP").run();

  const usedPorts = new Set();
  const existing = db.prepare('SELECT port FROM tunnels WHERE port IS NOT NULL').all();
  existing.forEach((row) => usedPorts.add(row.port));

  const upsertTunnel = db.prepare(`
    INSERT INTO tunnels (foreign_server_id, protocol, transport, port, status, priority, is_primary, config, updated_at)
    VALUES (?, ?, 'tcp', ?, 'active', ?, ?, '{}', CURRENT_TIMESTAMP)
  `);

  const activated = [];
  protocols.forEach((protocol, idx) => {
    const port = randomPort(usedPorts);
    usedPorts.add(port);
    upsertTunnel.run(foreignServerId, protocol, port, idx + 1, idx === 0 ? 1 : 0);
    activated.push({ protocol, port });
  });

  return {
    success: true,
    foreignServerId,
    activatedCount: activated.length,
    activated,
  };
}

module.exports = { bootstrapForeignMultiTunnel };
