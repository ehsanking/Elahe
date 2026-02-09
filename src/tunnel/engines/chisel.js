/**
 * Elahe Panel - Chisel Tunnel Engine
 * HTTP-based tunnel with TLS encryption
 * Supports: TCP/UDP forwarding, reverse tunnels, SOCKS5 proxy
 * Uses HTTP/WebSocket as transport (firewall-friendly)
 * Developer: EHSANKiNG
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createLogger } = require('../../utils/logger');
const config = require('../../config/default');

const log = createLogger('ChiselTunnel');

class ChiselTunnelEngine {
  constructor() {
    this.tunnels = new Map();
    this.configDir = path.join(config.paths.data, 'chisel');
    this.certDir = path.join(config.paths.certs, 'chisel');
    this.ensureDirs();
  }

  ensureDirs() {
    [this.configDir, this.certDir].forEach(dir => {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    });
  }

  /**
   * Generate authentication credentials
   */
  generateAuth(tunnelId) {
    const username = `elahe_${tunnelId}`;
    const password = crypto.randomBytes(24).toString('base64url');
    const fingerprint = crypto.randomBytes(32).toString('hex');

    return {
      username,
      password,
      authString: `${username}:${password}`,
      fingerprint,
    };
  }

  /**
   * Build Chisel server command - runs on FOREIGN server
   * chisel server [options]
   */
  buildServerCommand(options) {
    const {
      tunnelId,
      listenAddr = '0.0.0.0',
      listenPort = 8443,
      auth,                  // 'user:password'
      tlsEnabled = true,
      tlsCert,
      tlsKey,
      tlsDomain,
      reverse = true,        // Allow reverse tunneling
      socks5 = true,         // Allow SOCKS5 proxy
      keepalive = 25,
      maxHeaderBytes,
      backend,               // Fake website backend URL
    } = options;

    const args = ['server'];

    // Listen address
    args.push('--host', listenAddr);
    args.push('--port', String(listenPort));

    // Auth
    if (auth) {
      args.push('--auth', auth);
    }

    // TLS
    if (tlsEnabled) {
      args.push('--tls-key', tlsKey || path.join(this.certDir, `${tunnelId}.key`));
      args.push('--tls-cert', tlsCert || path.join(this.certDir, `${tunnelId}.crt`));
      if (tlsDomain) {
        args.push('--tls-domain', tlsDomain);
      }
    }

    // Reverse tunneling
    if (reverse) {
      args.push('--reverse');
    }

    // SOCKS5
    if (socks5) {
      args.push('--socks5');
    }

    // Keepalive
    args.push('--keepalive', `${keepalive}s`);

    // Backend (fake website for camouflage)
    if (backend) {
      args.push('--backend', backend);
    }

    return args;
  }

  /**
   * Build Chisel client command - runs on IRAN server
   * chisel client [options] server remotes...
   */
  buildClientCommand(options) {
    const {
      tunnelId,
      serverUrl,             // https://foreign-ip:port
      auth,                  // 'user:password'
      fingerprint,           // Server fingerprint for verification
      keepalive = 25,
      maxRetryCount = 0,     // 0 = unlimited
      maxRetryInterval = 30,
      proxy,                 // HTTP proxy for initial connection
      hostname,              // Override hostname in TLS handshake
      sni,                   // Custom SNI for TLS
      remotes = [],          // Port forwarding rules
    } = options;

    const args = ['client'];

    // Auth
    if (auth) {
      args.push('--auth', auth);
    }

    // Fingerprint verification
    if (fingerprint) {
      args.push('--fingerprint', fingerprint);
    }

    // Keepalive
    args.push('--keepalive', `${keepalive}s`);

    // Retry settings
    args.push('--max-retry-count', String(maxRetryCount));
    args.push('--max-retry-interval', `${maxRetryInterval}s`);

    // Proxy
    if (proxy) {
      args.push('--proxy', proxy);
    }

    // Hostname override (useful for camouflage)
    if (hostname) {
      args.push('--hostname', hostname);
    }

    // SNI override
    if (sni) {
      args.push('--tls-skip-verify'); // Required when using custom SNI
    }

    // Server URL
    args.push(serverUrl);

    // Remote port forwarding rules
    // Format: [local-host:]local-port:remote-host:remote-port
    // Or R: prefix for reverse tunnels
    for (const remote of remotes) {
      if (remote.reverse) {
        args.push(`R:${remote.remotePort}:${remote.localHost || '127.0.0.1'}:${remote.localPort}`);
      } else {
        args.push(`${remote.localHost || '0.0.0.0'}:${remote.localPort}:${remote.remoteHost || '127.0.0.1'}:${remote.remotePort}`);
      }
    }

    return args;
  }

  /**
   * Start Chisel tunnel (client or server)
   */
  async start(tunnelId, options) {
    if (this.tunnels.has(tunnelId)) {
      return { success: false, error: 'Chisel tunnel already running' };
    }

    const {
      mode = 'client',      // 'client' (Iran) or 'server' (Foreign)
      serverUrl,
      foreignServerIp,
      foreignServerPort = 8443,
      auth,
      tlsEnabled = true,
      remotes = [],
      backend,               // Fake website backend
      chiselBinaryPath,
    } = options;

    let args;
    if (mode === 'server') {
      args = this.buildServerCommand({ tunnelId, listenPort: foreignServerPort, auth, tlsEnabled, backend, ...options });
    } else {
      const url = serverUrl || `${tlsEnabled ? 'https' : 'http'}://${foreignServerIp}:${foreignServerPort}`;
      args = this.buildClientCommand({ tunnelId, serverUrl: url, auth, remotes, ...options });
    }

    const binary = chiselBinaryPath || '/usr/local/bin/chisel';

    log.info('Starting Chisel tunnel', { tunnelId, mode, args: args.join(' ') });

    try {
      const proc = spawn(binary, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: false,
      });

      const tunnelInfo = {
        id: tunnelId,
        mode,
        process: proc,
        pid: proc.pid,
        status: 'connecting',
        startedAt: new Date().toISOString(),
        retries: 0,
        lastError: null,
        tlsEnabled,
        remotes: remotes.map(r => ({
          localPort: r.localPort,
          remotePort: r.remotePort,
          reverse: !!r.reverse,
        })),
        stats: {
          bytesIn: 0,
          bytesOut: 0,
          activeConnections: 0,
        },
      };

      proc.stdout.on('data', (data) => {
        const msg = data.toString().trim();
        log.debug('Chisel stdout', { tunnelId, message: msg });
        if (msg.includes('Connected') || msg.includes('Listening') || msg.includes('server is running')) {
          tunnelInfo.status = 'connected';
        }
      });

      proc.stderr.on('data', (data) => {
        const msg = data.toString().trim();
        log.debug('Chisel stderr', { tunnelId, message: msg });
        if (msg.includes('Connected') || msg.includes('Listening')) {
          tunnelInfo.status = 'connected';
        }
        if (msg.includes('failed') || msg.includes('error') || msg.includes('denied')) {
          tunnelInfo.lastError = msg;
        }
      });

      proc.on('error', (err) => {
        log.error('Chisel process error', { tunnelId, error: err.message });
        tunnelInfo.status = 'error';
        tunnelInfo.lastError = err.message;
        this._handleReconnect(tunnelId, options);
      });

      proc.on('exit', (code, signal) => {
        log.info('Chisel process exited', { tunnelId, code, signal });
        tunnelInfo.status = 'disconnected';
        if (code !== 0 && !tunnelInfo._stopping) {
          this._handleReconnect(tunnelId, options);
        }
      });

      setTimeout(() => {
        if (tunnelInfo.status === 'connecting') {
          tunnelInfo.status = 'connected';
        }
      }, 5000);

      this.tunnels.set(tunnelId, tunnelInfo);

      return {
        success: true,
        tunnelId,
        mode,
        pid: proc.pid,
        tlsEnabled,
        remotes: tunnelInfo.remotes,
      };
    } catch (err) {
      log.error('Failed to start Chisel tunnel', { tunnelId, error: err.message });
      return { success: false, error: err.message };
    }
  }

  /**
   * Handle reconnection
   */
  _handleReconnect(tunnelId, options) {
    const tunnel = this.tunnels.get(tunnelId);
    if (!tunnel || tunnel._stopping) return;

    if (tunnel.retries >= 10) {
      tunnel.status = 'failed';
      log.error('Chisel tunnel max retries reached', { tunnelId });
      return;
    }

    tunnel.retries++;
    tunnel.status = 'reconnecting';
    log.info('Chisel tunnel reconnecting', { tunnelId, attempt: tunnel.retries });

    setTimeout(() => {
      this.tunnels.delete(tunnelId);
      this.start(tunnelId, options);
    }, 30000);
  }

  /**
   * Stop tunnel
   */
  async stop(tunnelId) {
    const tunnel = this.tunnels.get(tunnelId);
    if (!tunnel) return { success: false, error: 'Tunnel not found' };

    tunnel._stopping = true;
    tunnel.status = 'stopping';

    try {
      if (tunnel.process && !tunnel.process.killed) {
        tunnel.process.kill('SIGTERM');
        setTimeout(() => {
          if (tunnel.process && !tunnel.process.killed) tunnel.process.kill('SIGKILL');
        }, 5000);
      }
      this.tunnels.delete(tunnelId);
      log.info('Chisel tunnel stopped', { tunnelId });
      return { success: true, tunnelId };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Get status
   */
  getStatus(tunnelId) {
    const tunnel = this.tunnels.get(tunnelId);
    if (!tunnel) return null;

    return {
      id: tunnel.id,
      mode: tunnel.mode,
      pid: tunnel.pid,
      status: tunnel.status,
      tlsEnabled: tunnel.tlsEnabled,
      remotes: tunnel.remotes,
      startedAt: tunnel.startedAt,
      retries: tunnel.retries,
      lastError: tunnel.lastError,
      stats: tunnel.stats,
      uptime: tunnel.startedAt ? Math.floor((Date.now() - new Date(tunnel.startedAt).getTime()) / 1000) : 0,
    };
  }

  getAllStatus() {
    return Array.from(this.tunnels.keys()).map(id => this.getStatus(id));
  }

  async healthCheck(tunnelId) {
    const tunnel = this.tunnels.get(tunnelId);
    if (!tunnel) return { healthy: false, error: 'Tunnel not found' };
    return {
      healthy: tunnel.status === 'connected',
      tunnelId,
      status: tunnel.status,
      mode: tunnel.mode,
      uptime: tunnel.startedAt ? Math.floor((Date.now() - new Date(tunnel.startedAt).getTime()) / 1000) : 0,
    };
  }

  /**
   * Generate deployment configuration
   */
  generateDeployConfig(options) {
    const {
      tunnelId,
      mode = 'client',
      foreignServerIp,
      foreignServerPort = 8443,
      auth,
      tlsEnabled = true,
      remotes = [],
      backend,
      chiselVersion = '1.9.1',
    } = options;

    let args;
    if (mode === 'server') {
      args = this.buildServerCommand({ tunnelId, listenPort: foreignServerPort, auth, tlsEnabled, backend, ...options });
    } else {
      const url = `${tlsEnabled ? 'https' : 'http'}://${foreignServerIp}:${foreignServerPort}`;
      args = this.buildClientCommand({ tunnelId, serverUrl: url, auth, remotes, ...options });
    }

    return {
      tunnelId,
      mode,
      command: `chisel ${args.join(' ')}`,
      systemdService: `[Unit]
Description=Elahe Chisel ${mode === 'client' ? 'Client' : 'Server'} (TLS) - ${tunnelId}
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/chisel ${args.join(' ')}
Restart=always
RestartSec=10
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target`,
      setupScript: `#!/bin/bash
# Elahe Chisel ${mode === 'client' ? 'Client' : 'Server'} Setup - ${tunnelId}
# Generated: ${new Date().toISOString()}

set -e

CHISEL_VERSION="${chiselVersion}"
ARCH=$(uname -m)
case $ARCH in
  x86_64) ARCH="amd64" ;;
  aarch64) ARCH="arm64" ;;
esac

# Download Chisel
echo "Downloading Chisel v$CHISEL_VERSION..."
wget -q "https://github.com/jpillora/chisel/releases/download/v\${CHISEL_VERSION}/chisel_\${CHISEL_VERSION}_linux_\${ARCH}.gz" -O /tmp/chisel.gz
gzip -d /tmp/chisel.gz
mv /tmp/chisel /usr/local/bin/chisel
chmod +x /usr/local/bin/chisel

# Create directories
mkdir -p /var/log/elahe

${tlsEnabled && mode === 'server' ? `
# Generate self-signed TLS certs (replace with real certs in production)
mkdir -p ${this.certDir}
openssl req -new -newkey rsa:2048 -days 365 -nodes -x509 \\
  -subj "/CN=${foreignServerIp}" \\
  -keyout ${path.join(this.certDir, tunnelId + '.key')} \\
  -out ${path.join(this.certDir, tunnelId + '.crt')}
` : ''}

# Create systemd service
cat > /etc/systemd/system/elahe-chisel-${tunnelId}.service << 'EOFSERVICE'
[Unit]
Description=Elahe Chisel ${mode === 'client' ? 'Client' : 'Server'} (TLS) - ${tunnelId}
After=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/chisel ${args.join(' ')}
Restart=always
RestartSec=10
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOFSERVICE

systemctl daemon-reload
systemctl enable elahe-chisel-${tunnelId}
systemctl start elahe-chisel-${tunnelId}

echo "Chisel ${mode} ${tunnelId} installed and started"`,
    };
  }

  async cleanup() {
    log.info('Cleaning up all Chisel tunnels');
    for (const [id] of this.tunnels) {
      await this.stop(id);
    }
  }
}

const chiselTunnelEngine = new ChiselTunnelEngine();
module.exports = chiselTunnelEngine;
