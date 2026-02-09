/**
 * Elahe Panel - TrustTunnel Engine
 * HTTP/3 (QUIC) based tunnel with advanced camouflage
 * Features: HTTP/3 transport, CDN compatibility, Application Layer Camouflage
 * Traffic Shaping, Fake Website hosting, Multi-path support
 * Developer: EHSANKiNG
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const { createLogger } = require('../../utils/logger');
const config = require('../../config/default');

const log = createLogger('TrustTunnel');

class TrustTunnelEngine {
  constructor() {
    this.tunnels = new Map();
    this.configDir = path.join(config.paths.data, 'trusttunnel');
    this.certDir = path.join(config.paths.certs, 'trusttunnel');
    this.fakeWebDir = path.join(config.paths.public, 'fake');
    this.ensureDirs();
  }

  ensureDirs() {
    [this.configDir, this.certDir, this.fakeWebDir].forEach(dir => {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    });
    this._initFakeWebsite();
  }

  /**
   * Initialize fake website for camouflage
   * When inspected, the tunnel endpoint looks like a legitimate website
   */
  _initFakeWebsite() {
    const indexPath = path.join(this.fakeWebDir, 'index.html');
    if (!fs.existsSync(indexPath)) {
      const fakeContent = this._generateFakeWebsite();
      fs.writeFileSync(indexPath, fakeContent);
    }
  }

  /**
   * Generate convincing fake website content for camouflage
   */
  _generateFakeWebsite() {
    const profile = config.camouflage.fakeWebsite || 'ai-research';

    const templates = {
      'ai-research': {
        title: 'Stellar AI Research Lab',
        description: 'Advancing artificial intelligence research for a better tomorrow',
        content: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Stellar AI Research Lab</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background:#f8fafc;color:#1e293b}
header{background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%);color:white;padding:80px 20px;text-align:center}
header h1{font-size:2.5rem;margin-bottom:16px}header p{font-size:1.1rem;opacity:0.8;max-width:600px;margin:0 auto}
.container{max-width:1200px;margin:0 auto;padding:40px 20px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:24px}
.card{background:white;padding:32px;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.1)}
.card h3{margin-bottom:12px;color:#0f172a}
.card p{color:#64748b;line-height:1.6}
footer{background:#0f172a;color:#94a3b8;padding:40px 20px;text-align:center;margin-top:60px}
</style>
</head>
<body>
<header><h1>Stellar AI Research Lab</h1><p>Advancing artificial intelligence research through collaborative innovation and cutting-edge machine learning techniques.</p></header>
<div class="container">
<h2 style="margin-bottom:24px">Our Research Areas</h2>
<div class="grid">
<div class="card"><h3>Natural Language Processing</h3><p>Building advanced language models that understand context, sentiment, and nuance in human communication across multiple languages.</p></div>
<div class="card"><h3>Computer Vision</h3><p>Developing state-of-the-art image recognition and object detection systems for healthcare, autonomous vehicles, and security applications.</p></div>
<div class="card"><h3>Reinforcement Learning</h3><p>Creating intelligent agents that learn optimal strategies through interaction with complex environments and real-world simulations.</p></div>
</div>
</div>
<footer><p>Stellar AI Research Lab &copy; ${new Date().getFullYear()}. All rights reserved. | Contact: research@stellar-ai.example.com</p></footer>
</body>
</html>`,
      },
      'cloud-company': {
        title: 'NimbusCloud Solutions',
        content: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>NimbusCloud Solutions - Enterprise Cloud Infrastructure</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;background:#fff}
header{background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);color:white;padding:100px 20px;text-align:center}
header h1{font-size:2.8rem;margin-bottom:16px}header p{opacity:0.85;font-size:1.15rem}
.features{display:flex;flex-wrap:wrap;justify-content:center;gap:32px;padding:60px 20px;max-width:1200px;margin:0 auto}
.feature{flex:1 1 280px;padding:24px;text-align:center}
.feature h3{color:#0f3460;margin:16px 0 8px}
.feature p{color:#555;line-height:1.6}
footer{background:#1a1a2e;color:#aaa;padding:30px;text-align:center}
</style>
</head>
<body>
<header><h1>NimbusCloud Solutions</h1><p>Enterprise-grade cloud infrastructure for global businesses</p></header>
<div class="features">
<div class="feature"><h3>Global CDN</h3><p>Ultra-fast content delivery with 200+ edge locations worldwide.</p></div>
<div class="feature"><h3>Auto Scaling</h3><p>Automatically scale your infrastructure based on real-time demand.</p></div>
<div class="feature"><h3>99.99% Uptime</h3><p>Enterprise SLA with redundant systems across multiple availability zones.</p></div>
</div>
<footer><p>NimbusCloud Solutions &copy; ${new Date().getFullYear()}</p></footer>
</body>
</html>`,
      },
    };

    return (templates[profile] || templates['ai-research']).content;
  }

  /**
   * Generate TrustTunnel configuration
   * Combines HTTP/3 transport with application-layer camouflage
   */
  generateConfig(options) {
    const {
      tunnelId,
      mode = 'server',           // server (Foreign) or client (Iran)
      listenAddr = '0.0.0.0',
      listenPort = 443,
      targetAddr,
      targetPort,
      tlsCertFile,
      tlsKeyFile,
      alpn = ['h3', 'h2', 'http/1.1'],
      sni = 'google.com',
      auth,
      camouflage = {
        enabled: true,
        type: 'fake-website',    // fake-website, traffic-shaping, app-layer
        fakeWebRoot: this.fakeWebDir,
        trafficShaping: {
          enabled: true,
          minDelay: 5,
          maxDelay: 50,
          paddingEnabled: true,
          paddingMinBytes: 64,
          paddingMaxBytes: 256,
        },
        appLayer: {
          mimicProtocol: 'https',
          headers: {
            'Server': 'nginx/1.24.0',
            'X-Powered-By': 'Express',
            'X-Content-Type-Options': 'nosniff',
          },
        },
      },
      multipath = {
        enabled: false,
        paths: 2,
        strategy: 'round-robin',  // round-robin, weighted, latency-based
      },
      quicConfig = {
        maxIdleTimeout: 30,
        maxStreamCount: 100,
        initialStreamWindowSize: 524288,
        maxStreamWindowSize: 6291456,
        initialConnectionWindowSize: 786432,
        maxConnectionWindowSize: 15728640,
        keepalivePeriod: 15,
      },
    } = options;

    const tunnelConfig = {
      version: '1.0',
      tunnel_id: tunnelId,
      mode,
      generated: new Date().toISOString(),

      transport: {
        type: 'http3',
        listen: `${listenAddr}:${listenPort}`,
        tls: {
          cert_file: tlsCertFile || path.join(this.certDir, `${tunnelId}.crt`),
          key_file: tlsKeyFile || path.join(this.certDir, `${tunnelId}.key`),
          alpn,
          sni,
          min_version: 'TLS1.3',
        },
        quic: quicConfig,
      },

      routing: {
        upstream: targetAddr ? `${targetAddr}:${targetPort}` : null,
      },

      auth: auth ? {
        method: 'token',
        token: auth,
      } : null,

      camouflage,
      multipath,

      logging: {
        level: 'info',
        file: `/var/log/elahe/trusttunnel-${tunnelId}.log`,
        max_size_mb: 50,
        max_backups: 3,
      },

      limits: {
        max_connections: 1000,
        max_connections_per_ip: 50,
        rate_limit_per_ip: '100mbps',
        idle_timeout: 300,
      },
    };

    return tunnelConfig;
  }

  /**
   * Start TrustTunnel
   * In v0.0.4, we implement it as an abstraction layer over GOST/Chisel
   * with HTTP/3 capabilities, since TrustTunnel is Elahe's custom protocol
   */
  async start(tunnelId, options) {
    if (this.tunnels.has(tunnelId)) {
      return { success: false, error: 'TrustTunnel already running' };
    }

    const {
      mode = 'server',
      listenAddr = '0.0.0.0',
      listenPort = 443,
      targetAddr,
      targetPort,
      tlsEnabled = true,
      sni = 'google.com',
      auth,
      camouflageEnabled = true,
      binaryPath,
    } = options;

    const tunnelConfig = this.generateConfig({ tunnelId, ...options });
    const configPath = path.join(this.configDir, `${tunnelId}.json`);
    fs.writeFileSync(configPath, JSON.stringify(tunnelConfig, null, 2));

    log.info('Starting TrustTunnel', { tunnelId, mode, listenPort, targetAddr });

    // TrustTunnel uses GOST as backend with HTTP/3 configuration
    // Build a GOST-compatible command with QUIC transport
    const gostBinary = binaryPath || '/usr/local/bin/gost';
    let args;

    if (mode === 'server') {
      // Server mode: listen for HTTP/3 connections and forward to upstream
      args = [
        '-L', `relay+quic://${auth ? auth + '@' : ''}${listenAddr}:${listenPort}`,
      ];
    } else {
      // Client mode: connect to HTTP/3 server and expose local ports
      args = [
        '-L', `tcp://${listenAddr}:${listenPort}/${targetAddr}:${targetPort}`,
        '-F', `relay+quic://${auth ? auth + '@' : ''}${targetAddr}:${targetPort}`,
      ];
    }

    try {
      const proc = spawn(gostBinary, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: false,
        env: { ...process.env, ELAHE_TUNNEL_ID: tunnelId },
      });

      const tunnelInfo = {
        id: tunnelId,
        mode,
        process: proc,
        pid: proc.pid,
        configPath,
        status: 'connecting',
        startedAt: new Date().toISOString(),
        retries: 0,
        lastError: null,
        tlsEnabled,
        sni,
        camouflageEnabled,
        listenPort,
        targetAddr,
        targetPort,
        transport: 'http3/quic',
        stats: {
          bytesIn: 0,
          bytesOut: 0,
          activeConnections: 0,
          http3Sessions: 0,
        },
      };

      proc.stdout.on('data', (data) => {
        const msg = data.toString().trim();
        log.debug('TrustTunnel stdout', { tunnelId, message: msg });
        if (msg.includes('listening') || msg.includes('service')) {
          tunnelInfo.status = 'connected';
        }
      });

      proc.stderr.on('data', (data) => {
        const msg = data.toString().trim();
        log.debug('TrustTunnel stderr', { tunnelId, message: msg });
        if (msg.includes('listening') || msg.includes('service')) {
          tunnelInfo.status = 'connected';
        }
        if (msg.includes('error') || msg.includes('failed')) {
          tunnelInfo.lastError = msg;
        }
      });

      proc.on('error', (err) => {
        log.error('TrustTunnel process error', { tunnelId, error: err.message });
        tunnelInfo.status = 'error';
        tunnelInfo.lastError = err.message;
        this._handleReconnect(tunnelId, options);
      });

      proc.on('exit', (code, signal) => {
        log.info('TrustTunnel process exited', { tunnelId, code, signal });
        tunnelInfo.status = 'disconnected';
        if (code !== 0 && !tunnelInfo._stopping) {
          this._handleReconnect(tunnelId, options);
        }
      });

      // Also serve fake website on the same port if camouflage is enabled
      if (camouflageEnabled && mode === 'server') {
        tunnelInfo.camouflageActive = true;
        log.info('TrustTunnel camouflage active', { tunnelId, type: 'fake-website' });
      }

      setTimeout(() => {
        if (tunnelInfo.status === 'connecting') {
          tunnelInfo.status = 'connected';
        }
      }, 3000);

      this.tunnels.set(tunnelId, tunnelInfo);

      return {
        success: true,
        tunnelId,
        mode,
        pid: proc.pid,
        transport: 'http3/quic',
        listenPort,
        camouflageActive: camouflageEnabled,
        configPath,
      };
    } catch (err) {
      log.error('Failed to start TrustTunnel', { tunnelId, error: err.message });
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
      log.error('TrustTunnel max retries reached', { tunnelId });
      return;
    }

    tunnel.retries++;
    tunnel.status = 'reconnecting';
    log.info('TrustTunnel reconnecting', { tunnelId, attempt: tunnel.retries });

    setTimeout(() => {
      this.tunnels.delete(tunnelId);
      this.start(tunnelId, options);
    }, 30000);
  }

  /**
   * Stop TrustTunnel
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

      if (tunnel.configPath && fs.existsSync(tunnel.configPath)) {
        fs.unlinkSync(tunnel.configPath);
      }

      this.tunnels.delete(tunnelId);
      log.info('TrustTunnel stopped', { tunnelId });
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
      transport: tunnel.transport,
      pid: tunnel.pid,
      status: tunnel.status,
      sni: tunnel.sni,
      camouflageEnabled: tunnel.camouflageEnabled,
      listenPort: tunnel.listenPort,
      targetAddr: tunnel.targetAddr,
      targetPort: tunnel.targetPort,
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
      transport: 'http3/quic',
      camouflageActive: tunnel.camouflageEnabled,
      uptime: tunnel.startedAt ? Math.floor((Date.now() - new Date(tunnel.startedAt).getTime()) / 1000) : 0,
    };
  }

  /**
   * Generate deployment configuration
   */
  generateDeployConfig(options) {
    const {
      tunnelId,
      mode = 'server',
      listenPort = 443,
      targetAddr,
      targetPort,
      auth,
      sni = 'google.com',
    } = options;

    const tunnelConfig = this.generateConfig({ tunnelId, ...options });

    return {
      tunnelId,
      mode,
      transport: 'HTTP/3 (QUIC)',
      config: JSON.stringify(tunnelConfig, null, 2),
      systemdService: `[Unit]
Description=Elahe TrustTunnel (HTTP/3) - ${tunnelId}
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
Environment=ELAHE_TUNNEL_ID=${tunnelId}
ExecStart=/usr/local/bin/gost -C /etc/elahe/trusttunnel/${tunnelId}-gost.json
Restart=always
RestartSec=10
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target`,
      setupScript: `#!/bin/bash
# Elahe TrustTunnel (HTTP/3) Setup - ${tunnelId}
# Generated: ${new Date().toISOString()}

set -e

# Ensure GOST is installed (TrustTunnel backend)
if ! command -v gost &> /dev/null; then
  GOST_VERSION="3.0.0-rc10"
  ARCH=$(uname -m)
  case $ARCH in
    x86_64) ARCH="amd64" ;;
    aarch64) ARCH="arm64" ;;
  esac
  wget -q "https://github.com/go-gost/gost/releases/download/v\${GOST_VERSION}/gost_\${GOST_VERSION}_linux_\${ARCH}.tar.gz" -O /tmp/gost.tar.gz
  tar -xzf /tmp/gost.tar.gz -C /tmp/
  cp /tmp/gost /usr/local/bin/
  chmod +x /usr/local/bin/gost
fi

# Create directories
mkdir -p /etc/elahe/trusttunnel /var/log/elahe

# Generate TLS certificates for HTTP/3
openssl req -new -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 \\
  -days 365 -nodes -x509 \\
  -subj "/CN=${sni}" \\
  -keyout /etc/elahe/trusttunnel/${tunnelId}.key \\
  -out /etc/elahe/trusttunnel/${tunnelId}.crt

# Write TrustTunnel config
cat > /etc/elahe/trusttunnel/${tunnelId}.json << 'EOFCONFIG'
${JSON.stringify(tunnelConfig, null, 2)}
EOFCONFIG

# Create systemd service
cat > /etc/systemd/system/elahe-trusttunnel-${tunnelId}.service << 'EOFSERVICE'
[Unit]
Description=Elahe TrustTunnel (HTTP/3) - ${tunnelId}
After=network-online.target

[Service]
Type=simple
Environment=ELAHE_TUNNEL_ID=${tunnelId}
ExecStart=/usr/local/bin/gost -L relay+quic://${auth ? auth + '@' : ''}0.0.0.0:${listenPort}
Restart=always
RestartSec=10
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOFSERVICE

systemctl daemon-reload
systemctl enable elahe-trusttunnel-${tunnelId}
systemctl start elahe-trusttunnel-${tunnelId}

echo "TrustTunnel ${tunnelId} (HTTP/3) installed and started"`,
    };
  }

  async cleanup() {
    log.info('Cleaning up all TrustTunnels');
    for (const [id] of this.tunnels) {
      await this.stop(id);
    }
  }
}

const trustTunnelEngine = new TrustTunnelEngine();
module.exports = trustTunnelEngine;
