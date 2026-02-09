/**
 * Elahe Panel - GOST (GO Simple Tunnel) Engine
 * Supports TLS and QUIC transport for encrypted tunneling
 * Multiple modes: relay, forward, reverse, SOCKS5, HTTP proxy
 * Developer: EHSANKiNG
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createLogger } = require('../../utils/logger');
const config = require('../../config/default');

const log = createLogger('GOSTTunnel');

class GOSTTunnelEngine {
  constructor() {
    this.tunnels = new Map();
    this.configDir = path.join(config.paths.data, 'gost');
    this.certDir = path.join(config.paths.certs, 'gost');
    this.ensureDirs();
  }

  ensureDirs() {
    [this.configDir, this.certDir].forEach(dir => {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    });
  }

  /**
   * Build GOST command-line arguments for different tunnel types
   * GOST v3 uses a node-chain model:
   *   -L (listener/service node) -F (forwarder/chain node)
   */
  buildCommand(options) {
    const {
      tunnelId,
      mode = 'relay',           // relay, forward, reverse, socks5, http
      transport = 'tls',        // tls, quic, wss, mwss, h2, grpc, mtls, mquic
      listenAddr = '0.0.0.0',
      listenPort,
      targetAddr,
      targetPort,
      username,
      password,
      tlsCertFile,
      tlsKeyFile,
      tlsSecure = false,        // verify TLS certificate
      quicKeepalive = true,
      multipath = false,         // enable multipath for QUIC
      obfuscation,              // traffic obfuscation plugin
    } = options;

    const authPart = username && password ? `${username}:${password}@` : '';

    // Build listener (-L) and forwarder (-F) based on mode
    const args = [];

    switch (mode) {
      case 'relay': {
        // Relay: forward traffic from listen to target through transport
        // -L transport://listenAddr:listenPort -F transport://targetAddr:targetPort
        const listenScheme = this._getScheme('relay', transport, 'listen');
        const forwardScheme = this._getScheme('relay', transport, 'forward');
        args.push('-L', `${listenScheme}://${authPart}${listenAddr}:${listenPort}`);
        args.push('-F', `${forwardScheme}://${targetAddr}:${targetPort}`);
        break;
      }

      case 'forward': {
        // Port forwarding: listen locally and forward to remote
        // -L tcp://listenAddr:listenPort/targetAddr:targetPort -F transport://relay
        args.push('-L', `tcp://${listenAddr}:${listenPort}/${targetAddr}:${targetPort}`);
        if (transport === 'tls') {
          args.push('-F', `relay+tls://${targetAddr}:${targetPort}`);
        } else if (transport === 'quic') {
          args.push('-F', `relay+quic://${targetAddr}:${targetPort}`);
        }
        break;
      }

      case 'reverse': {
        // Reverse tunnel: remote server connects back
        args.push('-L', `rtcp://${listenAddr}:${listenPort}/${targetAddr}:${targetPort}`);
        args.push('-F', `${transport === 'quic' ? 'relay+quic' : 'relay+tls'}://${targetAddr}:${targetPort}`);
        break;
      }

      case 'socks5': {
        // SOCKS5 proxy over transport
        args.push('-L', `socks5+${transport}://${authPart}${listenAddr}:${listenPort}`);
        break;
      }

      case 'http': {
        // HTTP proxy over transport
        args.push('-L', `http+${transport}://${authPart}${listenAddr}:${listenPort}`);
        break;
      }
    }

    return args;
  }

  /**
   * Get protocol scheme based on mode, transport, and role
   */
  _getScheme(mode, transport, role) {
    const schemes = {
      tls: { listen: 'relay+tls', forward: 'relay+tls' },
      quic: { listen: 'relay+quic', forward: 'relay+quic' },
      wss: { listen: 'relay+wss', forward: 'relay+wss' },
      mwss: { listen: 'relay+mwss', forward: 'relay+mwss' },
      h2: { listen: 'relay+h2', forward: 'relay+h2' },
      grpc: { listen: 'relay+grpc', forward: 'relay+grpc' },
      mtls: { listen: 'relay+mtls', forward: 'relay+mtls' },
      mquic: { listen: 'relay+mquic', forward: 'relay+mquic' },
    };
    return (schemes[transport] && schemes[transport][role]) || `relay+${transport}`;
  }

  /**
   * Generate GOST JSON configuration (v3 format)
   */
  generateJsonConfig(options) {
    const {
      tunnelId,
      mode = 'relay',
      transport = 'tls',
      listenAddr = '0.0.0.0',
      listenPort,
      targetAddr,
      targetPort,
      username,
      password,
      tlsCertFile,
      tlsKeyFile,
      quicKeepalive = true,
    } = options;

    const gostConfig = {
      log: {
        output: `/var/log/elahe/gost-${tunnelId}.log`,
        level: 'info',
        format: 'json',
      },
      services: [],
      chains: [],
    };

    // Build TLS/QUIC metadata
    const tlsMetadata = {};
    if (transport === 'tls' || transport === 'mtls') {
      tlsMetadata.secure = false;
      if (tlsCertFile) {
        tlsMetadata.certFile = tlsCertFile;
        tlsMetadata.keyFile = tlsKeyFile;
      }
    }
    if (transport === 'quic' || transport === 'mquic') {
      tlsMetadata.secure = false;
      tlsMetadata.keepalive = quicKeepalive;
      tlsMetadata['keepalive-period'] = '30s';
    }

    // Auth metadata
    const authConfig = (username && password) ? {
      auths: [{
        username,
        password,
      }],
    } : {};

    // Chain for forwarding
    const chainId = `chain-${tunnelId}`;
    gostConfig.chains.push({
      name: chainId,
      hops: [{
        name: `hop-${tunnelId}`,
        nodes: [{
          name: `node-${tunnelId}`,
          addr: `${targetAddr}:${targetPort}`,
          connector: {
            type: 'relay',
            ...authConfig,
          },
          dialer: {
            type: transport,
            tls: Object.keys(tlsMetadata).length > 0 ? tlsMetadata : undefined,
          },
        }],
      }],
    });

    // Service definition
    switch (mode) {
      case 'relay':
        gostConfig.services.push({
          name: `svc-${tunnelId}`,
          addr: `${listenAddr}:${listenPort}`,
          handler: {
            type: 'relay',
            chain: chainId,
            ...authConfig,
          },
          listener: {
            type: transport,
            tls: Object.keys(tlsMetadata).length > 0 ? tlsMetadata : undefined,
          },
        });
        break;

      case 'forward':
        gostConfig.services.push({
          name: `svc-${tunnelId}`,
          addr: `${listenAddr}:${listenPort}`,
          handler: {
            type: 'tcp',
            chain: chainId,
          },
          listener: {
            type: 'tcp',
          },
          forwarder: {
            nodes: [{
              name: `target-${tunnelId}`,
              addr: `${targetAddr}:${targetPort}`,
            }],
          },
        });
        break;

      case 'socks5':
        gostConfig.services.push({
          name: `svc-${tunnelId}`,
          addr: `${listenAddr}:${listenPort}`,
          handler: {
            type: 'socks5',
            chain: chainId,
            ...authConfig,
          },
          listener: {
            type: transport,
            tls: Object.keys(tlsMetadata).length > 0 ? tlsMetadata : undefined,
          },
        });
        break;

      case 'http':
        gostConfig.services.push({
          name: `svc-${tunnelId}`,
          addr: `${listenAddr}:${listenPort}`,
          handler: {
            type: 'http',
            chain: chainId,
            ...authConfig,
          },
          listener: {
            type: transport,
            tls: Object.keys(tlsMetadata).length > 0 ? tlsMetadata : undefined,
          },
        });
        break;
    }

    return gostConfig;
  }

  /**
   * Start a GOST tunnel
   */
  async start(tunnelId, options) {
    if (this.tunnels.has(tunnelId)) {
      return { success: false, error: 'GOST tunnel already running' };
    }

    const {
      mode = 'relay',
      transport = 'tls',
      listenPort,
      targetAddr,
      targetPort,
      useJsonConfig = true,
      gostBinaryPath,
    } = options;

    log.info('Starting GOST tunnel', { tunnelId, mode, transport, listenPort, targetAddr, targetPort });

    let configPath = null;
    let args;

    if (useJsonConfig) {
      // Use JSON config file
      const jsonConfig = this.generateJsonConfig({ tunnelId, ...options });
      configPath = path.join(this.configDir, `${tunnelId}.json`);
      fs.writeFileSync(configPath, JSON.stringify(jsonConfig, null, 2));
      args = ['-C', configPath];
    } else {
      // Use command-line arguments
      args = this.buildCommand({ tunnelId, ...options });
    }

    const binary = gostBinaryPath || '/usr/local/bin/gost';

    try {
      const proc = spawn(binary, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: false,
      });

      const tunnelInfo = {
        id: tunnelId,
        mode,
        transport,
        process: proc,
        pid: proc.pid,
        configPath,
        status: 'connecting',
        startedAt: new Date().toISOString(),
        retries: 0,
        lastError: null,
        listenPort,
        targetAddr,
        targetPort,
        stats: {
          bytesIn: 0,
          bytesOut: 0,
          activeConnections: 0,
        },
      };

      proc.stdout.on('data', (data) => {
        const msg = data.toString().trim();
        log.debug('GOST stdout', { tunnelId, message: msg });
        if (msg.includes('listening') || msg.includes('service is running')) {
          tunnelInfo.status = 'connected';
        }
      });

      proc.stderr.on('data', (data) => {
        const msg = data.toString().trim();
        log.debug('GOST stderr', { tunnelId, message: msg });
        // GOST logs to stderr by default
        if (msg.includes('listening') || msg.includes('service')) {
          tunnelInfo.status = 'connected';
        }
        if (msg.includes('failed') || msg.includes('error')) {
          tunnelInfo.lastError = msg;
        }
      });

      proc.on('error', (err) => {
        log.error('GOST process error', { tunnelId, error: err.message });
        tunnelInfo.status = 'error';
        tunnelInfo.lastError = err.message;
        this._handleReconnect(tunnelId, options);
      });

      proc.on('exit', (code, signal) => {
        log.info('GOST process exited', { tunnelId, code, signal });
        tunnelInfo.status = 'disconnected';
        if (code !== 0 && !tunnelInfo._stopping) {
          this._handleReconnect(tunnelId, options);
        }
      });

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
        transport,
        pid: proc.pid,
        listenPort,
        configPath,
      };
    } catch (err) {
      log.error('Failed to start GOST tunnel', { tunnelId, error: err.message });
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
      log.error('GOST tunnel max retries reached', { tunnelId });
      return;
    }

    tunnel.retries++;
    tunnel.status = 'reconnecting';
    log.info('GOST tunnel reconnecting', { tunnelId, attempt: tunnel.retries });

    setTimeout(() => {
      this.tunnels.delete(tunnelId);
      this.start(tunnelId, options);
    }, 30000);
  }

  /**
   * Stop a GOST tunnel
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
      log.info('GOST tunnel stopped', { tunnelId });
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
      mode: tunnel.mode,
      transport: tunnel.transport,
      uptime: tunnel.startedAt ? Math.floor((Date.now() - new Date(tunnel.startedAt).getTime()) / 1000) : 0,
    };
  }

  /**
   * Generate deployment configuration for GOST
   */
  generateDeployConfig(options) {
    const {
      tunnelId,
      mode = 'relay',
      transport = 'tls',
      listenPort,
      targetAddr,
      targetPort,
      gostVersion = '3.0.0-rc10',
    } = options;

    const jsonConfig = this.generateJsonConfig({ tunnelId, ...options });
    const cmdArgs = this.buildCommand({ tunnelId, ...options });

    return {
      tunnelId,
      mode,
      transport,
      jsonConfig: JSON.stringify(jsonConfig, null, 2),
      commandLine: `gost ${cmdArgs.join(' ')}`,
      systemdService: `[Unit]
Description=Elahe GOST Tunnel (${transport.toUpperCase()}) - ${tunnelId}
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/gost -C /etc/elahe/gost/${tunnelId}.json
Restart=always
RestartSec=10
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target`,
      setupScript: `#!/bin/bash
# Elahe GOST Tunnel Setup - ${tunnelId}
# Transport: ${transport.toUpperCase()}
# Generated: ${new Date().toISOString()}

set -e

GOST_VERSION="${gostVersion}"
ARCH=$(uname -m)
case $ARCH in
  x86_64) ARCH="amd64" ;;
  aarch64) ARCH="arm64" ;;
esac

# Download GOST v3
echo "Downloading GOST v$GOST_VERSION..."
wget -q "https://github.com/go-gost/gost/releases/download/v\${GOST_VERSION}/gost_\${GOST_VERSION}_linux_\${ARCH}.tar.gz" -O /tmp/gost.tar.gz
tar -xzf /tmp/gost.tar.gz -C /tmp/
cp /tmp/gost /usr/local/bin/
chmod +x /usr/local/bin/gost

# Create directories
mkdir -p /etc/elahe/gost /var/log/elahe

# Write config
cat > /etc/elahe/gost/${tunnelId}.json << 'EOFCONFIG'
${JSON.stringify(jsonConfig, null, 2)}
EOFCONFIG

# Create systemd service
cat > /etc/systemd/system/elahe-gost-${tunnelId}.service << 'EOFSERVICE'
[Unit]
Description=Elahe GOST Tunnel (${transport.toUpperCase()}) - ${tunnelId}
After=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/gost -C /etc/elahe/gost/${tunnelId}.json
Restart=always
RestartSec=10
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOFSERVICE

systemctl daemon-reload
systemctl enable elahe-gost-${tunnelId}
systemctl start elahe-gost-${tunnelId}

echo "GOST tunnel ${tunnelId} (${transport}) installed and started"`,
    };
  }

  async cleanup() {
    log.info('Cleaning up all GOST tunnels');
    for (const [id] of this.tunnels) {
      await this.stop(id);
    }
  }
}

const gostTunnelEngine = new GOSTTunnelEngine();
module.exports = gostTunnelEngine;
