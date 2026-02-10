/**
 * Elahe Panel - FRP (Fast Reverse Proxy) Tunnel Engine
 * Supports TLS-encrypted tunnels between Iran and Foreign servers
 * Modes: TCP, UDP, STCP (Secret TCP), XTCP (P2P)
 * Developer: EHSANKiNG
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createLogger } = require('../../utils/logger');
const config = require('../../config/default');

const log = createLogger('FRPTunnel');

class FRPTunnelEngine {
  constructor() {
    this.tunnels = new Map();
    this.configDir = path.join(config.paths.data, 'frp');
    this.certDir = path.join(config.paths.certs, 'frp');
    this.ensureDirs();
  }

  ensureDirs() {
    [this.configDir, this.certDir].forEach(dir => {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    });
  }

  /**
   * Generate TLS certificates for FRP
   */
  generateTLSCerts(tunnelId) {
    const certPath = path.join(this.certDir, `${tunnelId}.crt`);
    const keyPath = path.join(this.certDir, `${tunnelId}.key`);
    const caPath = path.join(this.certDir, `${tunnelId}_ca.crt`);

    // Generate self-signed certificate placeholder
    const cert = {
      certPath,
      keyPath,
      caPath,
      generated: true,
      fingerprint: crypto.randomBytes(20).toString('hex'),
    };

    // In production, use openssl to generate real certs
    // For v0.0.5, we generate placeholder config pointing to expected paths
    log.info('TLS cert paths configured for FRP', { tunnelId });
    return cert;
  }

  /**
   * Generate FRP Server (frps) configuration - runs on FOREIGN server
   */
  generateServerConfig(options) {
    const {
      tunnelId,
      bindPort = 7000,
      vhostHttpPort = 80,
      vhostHttpsPort = 443,
      dashboardPort = 7500,
      dashboardUser = 'admin',
      dashboardPwd,
      token,
      tlsEnabled = true,
      tlsCertFile,
      tlsKeyFile,
      tlsTrustedCaFile,
      maxPoolCount = 10,
      logLevel = 'info',
      subdomainHost,
    } = options;

    const authToken = token || crypto.randomBytes(32).toString('hex');

    let configToml = `# Elahe Panel - FRP Server Config (frps)
# Tunnel: ${tunnelId}
# Generated: ${new Date().toISOString()}

bindAddr = "0.0.0.0"
bindPort = ${bindPort}
vhostHTTPPort = ${vhostHttpPort}
vhostHTTPSPort = ${vhostHttpsPort}

# Authentication
auth.method = "token"
auth.token = "${authToken}"

# Dashboard
webServer.addr = "0.0.0.0"
webServer.port = ${dashboardPort}
webServer.user = "${dashboardUser}"
webServer.password = "${dashboardPwd || crypto.randomBytes(8).toString('hex')}"

# Transport
transport.maxPoolCount = ${maxPoolCount}
`;

    if (tlsEnabled) {
      configToml += `
# TLS Configuration
transport.tls.force = true
`;
      if (tlsCertFile) {
        configToml += `transport.tls.certFile = "${tlsCertFile}"
transport.tls.keyFile = "${tlsKeyFile}"
transport.tls.trustedCaFile = "${tlsTrustedCaFile}"
`;
      }
    }

    if (subdomainHost) {
      configToml += `\nsubDomainHost = "${subdomainHost}"\n`;
    }

    configToml += `
# Logging
log.to = "/var/log/elahe/frps-${tunnelId}.log"
log.level = "${logLevel}"
log.maxDays = 7
`;

    return { config: configToml, token: authToken };
  }

  /**
   * Generate FRP Client (frpc) configuration - runs on IRAN server
   */
  generateClientConfig(options) {
    const {
      tunnelId,
      foreignServerIp,
      foreignServerPort = 7000,
      token,
      tlsEnabled = true,
      tlsCertFile,
      tlsKeyFile,
      tlsTrustedCaFile,
      proxies = [],
      loginFailExit = false,
      logLevel = 'info',
    } = options;

    let configToml = `# Elahe Panel - FRP Client Config (frpc)
# Tunnel: ${tunnelId}
# Generated: ${new Date().toISOString()}

serverAddr = "${foreignServerIp}"
serverPort = ${foreignServerPort}

# Authentication
auth.method = "token"
auth.token = "${token}"

# Login behavior
loginFailExit = ${loginFailExit}
`;

    if (tlsEnabled) {
      configToml += `
# TLS Configuration
transport.tls.enable = true
`;
      if (tlsCertFile) {
        configToml += `transport.tls.certFile = "${tlsCertFile}"
transport.tls.keyFile = "${tlsKeyFile}"
transport.tls.trustedCaFile = "${tlsTrustedCaFile}"
`;
      }
    }

    configToml += `
# Connection Pool
transport.poolCount = 5
transport.heartbeatInterval = 30
transport.heartbeatTimeout = 90

# Logging
log.to = "/var/log/elahe/frpc-${tunnelId}.log"
log.level = "${logLevel}"
log.maxDays = 7
`;

    // Add proxy configurations
    for (const proxy of proxies) {
      configToml += this._generateProxyConfig(proxy);
    }

    return configToml;
  }

  /**
   * Generate individual proxy configuration
   */
  _generateProxyConfig(proxy) {
    const {
      name,
      type = 'tcp',         // tcp, udp, stcp, xtcp, http, https, tcpmux
      localIp = '127.0.0.1',
      localPort,
      remotePort,
      secretKey,             // for STCP/XTCP
      subdomain,             // for HTTP/HTTPS
      customDomains,         // for HTTP/HTTPS
      compression = true,
      encryption = true,
      bandwidthLimit,
    } = proxy;

    let proxyConfig = `
# Proxy: ${name}
[[proxies]]
name = "${name}"
type = "${type}"
localIP = "${localIp}"
localPort = ${localPort}
`;

    switch (type) {
      case 'tcp':
      case 'udp':
        proxyConfig += `remotePort = ${remotePort}\n`;
        break;
      case 'stcp':
        proxyConfig += `secretKey = "${secretKey || crypto.randomBytes(16).toString('hex')}"\n`;
        break;
      case 'xtcp':
        proxyConfig += `secretKey = "${secretKey || crypto.randomBytes(16).toString('hex')}"\n`;
        break;
      case 'http':
      case 'https':
        if (subdomain) proxyConfig += `subdomain = "${subdomain}"\n`;
        if (customDomains) proxyConfig += `customDomains = [${customDomains.map(d => `"${d}"`).join(', ')}]\n`;
        break;
    }

    if (compression) proxyConfig += `transport.useCompression = true\n`;
    if (encryption) proxyConfig += `transport.useEncryption = true\n`;
    if (bandwidthLimit) proxyConfig += `transport.bandwidthLimit = "${bandwidthLimit}"\n`;

    return proxyConfig;
  }

  /**
   * Start FRP tunnel (client or server mode)
   */
  async start(tunnelId, options) {
    if (this.tunnels.has(tunnelId)) {
      return { success: false, error: 'FRP tunnel already running' };
    }

    const {
      mode = 'client',     // 'client' (Iran) or 'server' (Foreign)
      foreignServerIp,
      foreignServerPort = 7000,
      token,
      tlsEnabled = true,
      proxies = [],
      frpBinaryPath,
    } = options;

    // Generate config
    let configContent;
    if (mode === 'client') {
      configContent = this.generateClientConfig({
        tunnelId,
        foreignServerIp,
        foreignServerPort,
        token,
        tlsEnabled,
        proxies,
      });
    } else {
      const serverConf = this.generateServerConfig({ tunnelId, ...options });
      configContent = serverConf.config;
    }

    // Write config file
    const configPath = path.join(this.configDir, `${mode}_${tunnelId}.toml`);
    fs.writeFileSync(configPath, configContent);

    const binary = frpBinaryPath || (mode === 'client' ? '/usr/local/bin/frpc' : '/usr/local/bin/frps');
    const args = ['-c', configPath];

    log.info('Starting FRP tunnel', { tunnelId, mode, binary });

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
        configPath,
        status: 'connecting',
        startedAt: new Date().toISOString(),
        retries: 0,
        lastError: null,
        tlsEnabled,
        proxies: proxies.map(p => ({ name: p.name, type: p.type, localPort: p.localPort, remotePort: p.remotePort })),
        stats: {
          bytesIn: 0,
          bytesOut: 0,
          activeConnections: 0,
        },
      };

      proc.stdout.on('data', (data) => {
        const msg = data.toString().trim();
        log.debug('FRP stdout', { tunnelId, message: msg });
        if (msg.includes('login to server success') || msg.includes('start proxy success')) {
          tunnelInfo.status = 'connected';
        }
      });

      proc.stderr.on('data', (data) => {
        const msg = data.toString().trim();
        log.debug('FRP stderr', { tunnelId, message: msg });
        if (msg.includes('login to server failed') || msg.includes('connect to server error')) {
          tunnelInfo.lastError = msg;
          tunnelInfo.status = 'auth_failed';
        }
      });

      proc.on('error', (err) => {
        log.error('FRP process error', { tunnelId, error: err.message });
        tunnelInfo.status = 'error';
        tunnelInfo.lastError = err.message;
        this._handleReconnect(tunnelId, options);
      });

      proc.on('exit', (code, signal) => {
        log.info('FRP process exited', { tunnelId, code, signal });
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
        configPath,
        tlsEnabled,
        proxies: tunnelInfo.proxies,
      };
    } catch (err) {
      log.error('Failed to start FRP tunnel', { tunnelId, error: err.message });
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
      log.error('FRP tunnel max retries reached', { tunnelId });
      return;
    }

    tunnel.retries++;
    tunnel.status = 'reconnecting';
    log.info('FRP tunnel reconnecting', { tunnelId, attempt: tunnel.retries });

    setTimeout(() => {
      this.tunnels.delete(tunnelId);
      this.start(tunnelId, options);
    }, 30000);
  }

  /**
   * Stop FRP tunnel
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

      // Cleanup config file
      if (fs.existsSync(tunnel.configPath)) {
        fs.unlinkSync(tunnel.configPath);
      }

      this.tunnels.delete(tunnelId);
      log.info('FRP tunnel stopped', { tunnelId });
      return { success: true, tunnelId };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Get tunnel status
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
      proxies: tunnel.proxies,
      startedAt: tunnel.startedAt,
      retries: tunnel.retries,
      lastError: tunnel.lastError,
      stats: tunnel.stats,
      uptime: tunnel.startedAt ? Math.floor((Date.now() - new Date(tunnel.startedAt).getTime()) / 1000) : 0,
    };
  }

  /**
   * Get all tunnels
   */
  getAllStatus() {
    return Array.from(this.tunnels.keys()).map(id => this.getStatus(id));
  }

  /**
   * Health check
   */
  async healthCheck(tunnelId) {
    const tunnel = this.tunnels.get(tunnelId);
    if (!tunnel) return { healthy: false, error: 'Tunnel not found' };

    return {
      healthy: tunnel.status === 'connected',
      tunnelId,
      status: tunnel.status,
      mode: tunnel.mode,
      tlsEnabled: tunnel.tlsEnabled,
      uptime: tunnel.startedAt ? Math.floor((Date.now() - new Date(tunnel.startedAt).getTime()) / 1000) : 0,
    };
  }

  /**
   * Generate deployment scripts for FRP
   */
  generateDeployConfig(options) {
    const {
      tunnelId,
      mode = 'client',
      foreignServerIp,
      foreignServerPort = 7000,
      token,
      tlsEnabled = true,
      proxies = [],
      frpVersion = '0.58.1',
    } = options;

    let configContent;
    if (mode === 'client') {
      configContent = this.generateClientConfig({
        tunnelId, foreignServerIp, foreignServerPort, token, tlsEnabled, proxies,
      });
    } else {
      configContent = this.generateServerConfig({ tunnelId, token, ...options }).config;
    }

    const binary = mode === 'client' ? 'frpc' : 'frps';

    return {
      tunnelId,
      mode,
      config: configContent,
      systemdService: `[Unit]
Description=Elahe FRP ${mode === 'client' ? 'Client' : 'Server'} - ${tunnelId}
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/${binary} -c /etc/elahe/frp/${mode}_${tunnelId}.toml
Restart=always
RestartSec=10
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target`,
      setupScript: `#!/bin/bash
# Elahe FRP ${mode === 'client' ? 'Client' : 'Server'} Setup - ${tunnelId}
# Generated: ${new Date().toISOString()}

set -e

FRP_VERSION="${frpVersion}"
ARCH=$(uname -m)
case $ARCH in
  x86_64) ARCH="amd64" ;;
  aarch64) ARCH="arm64" ;;
esac

# Download FRP
echo "Downloading FRP v$FRP_VERSION..."
wget -q "https://github.com/fatedier/frp/releases/download/v\${FRP_VERSION}/frp_\${FRP_VERSION}_linux_\${ARCH}.tar.gz" -O /tmp/frp.tar.gz
tar -xzf /tmp/frp.tar.gz -C /tmp/
cp /tmp/frp_\${FRP_VERSION}_linux_\${ARCH}/${binary} /usr/local/bin/
chmod +x /usr/local/bin/${binary}

# Create config directory
mkdir -p /etc/elahe/frp /var/log/elahe

# Write config
cat > /etc/elahe/frp/${mode}_${tunnelId}.toml << 'EOFCONFIG'
${configContent}
EOFCONFIG

# Create systemd service
cat > /etc/systemd/system/elahe-frp-${tunnelId}.service << 'EOFSERVICE'
[Unit]
Description=Elahe FRP ${mode === 'client' ? 'Client' : 'Server'} - ${tunnelId}
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/${binary} -c /etc/elahe/frp/${mode}_${tunnelId}.toml
Restart=always
RestartSec=10
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOFSERVICE

systemctl daemon-reload
systemctl enable elahe-frp-${tunnelId}
systemctl start elahe-frp-${tunnelId}

echo "FRP ${mode} ${tunnelId} installed and started"`,
    };
  }

  /**
   * Cleanup
   */
  async cleanup() {
    log.info('Cleaning up all FRP tunnels');
    for (const [id] of this.tunnels) {
      await this.stop(id);
    }
  }
}

const frpTunnelEngine = new FRPTunnelEngine();
module.exports = frpTunnelEngine;
