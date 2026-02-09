/**
 * Elahe Panel - SSH Tunnel Engine
 * Creates encrypted SSH tunnels between Iran and Foreign servers
 * Supports: Local/Remote port forwarding, Dynamic SOCKS proxy, Reverse tunnels
 * Developer: EHSANKiNG
 */

const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createLogger } = require('../../utils/logger');
const config = require('../../config/default');

const log = createLogger('SSHTunnel');

class SSHTunnelEngine {
  constructor() {
    this.tunnels = new Map(); // tunnelId -> process info
    this.keyDir = path.join(config.paths.certs, 'ssh');
    this.ensureKeyDir();
  }

  ensureKeyDir() {
    if (!fs.existsSync(this.keyDir)) {
      fs.mkdirSync(this.keyDir, { recursive: true });
    }
  }

  /**
   * Generate SSH key pair for tunnel authentication
   */
  generateKeyPair(tunnelId) {
    const keyPath = path.join(this.keyDir, `tunnel_${tunnelId}`);
    const pubKeyPath = `${keyPath}.pub`;

    // Generate Ed25519 key pair using Node.js crypto
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    // Save keys
    fs.writeFileSync(keyPath, privateKey, { mode: 0o600 });
    fs.writeFileSync(pubKeyPath, publicKey, { mode: 0o644 });

    log.info('SSH key pair generated', { tunnelId, keyPath });

    return {
      privateKeyPath: keyPath,
      publicKeyPath: pubKeyPath,
      publicKey,
      privateKey,
      fingerprint: crypto.createHash('sha256').update(publicKey).digest('hex').substring(0, 16),
    };
  }

  /**
   * Build SSH tunnel configuration
   */
  buildConfig(options) {
    const {
      tunnelId,
      type = 'local',        // local, remote, dynamic
      iranServerIp,
      foreignServerIp,
      foreignServerPort = 22,
      localPort,
      remotePort,
      username = 'elahe',
      keyPath,
      keepAlive = true,
      compression = true,
      strictHostKey = false,
      reconnectInterval = 30,
      maxRetries = 10,
    } = options;

    const sshArgs = [
      '-N',                    // No remote command
      '-o', 'ExitOnForwardFailure=yes',
      '-o', `ServerAliveInterval=${keepAlive ? 30 : 0}`,
      '-o', 'ServerAliveCountMax=3',
      '-o', `StrictHostKeyChecking=${strictHostKey ? 'yes' : 'no'}`,
      '-o', 'UserKnownHostsFile=/dev/null',
      '-o', 'LogLevel=ERROR',
    ];

    if (compression) {
      sshArgs.push('-C'); // Enable compression
    }

    if (keyPath) {
      sshArgs.push('-i', keyPath);
    }

    // Port forwarding type
    switch (type) {
      case 'local':
        // -L localPort:foreignServerIp:remotePort user@iranServerIp
        sshArgs.push('-L', `0.0.0.0:${localPort}:${foreignServerIp}:${remotePort}`);
        break;
      case 'remote':
        // -R remotePort:localhost:localPort user@foreignServerIp
        sshArgs.push('-R', `0.0.0.0:${remotePort}:127.0.0.1:${localPort}`);
        break;
      case 'dynamic':
        // SOCKS5 proxy
        sshArgs.push('-D', `0.0.0.0:${localPort}`);
        break;
    }

    // Port
    sshArgs.push('-p', String(foreignServerPort));

    // User@Host
    const targetHost = type === 'remote' ? foreignServerIp : iranServerIp;
    sshArgs.push(`${username}@${targetHost}`);

    return {
      command: 'ssh',
      args: sshArgs,
      tunnelId,
      type,
      localPort,
      remotePort,
      targetHost,
      reconnectInterval,
      maxRetries,
    };
  }

  /**
   * Start an SSH tunnel
   */
  async start(tunnelId, options) {
    if (this.tunnels.has(tunnelId)) {
      log.warn('Tunnel already running', { tunnelId });
      return { success: false, error: 'Tunnel already running' };
    }

    const tunnelConfig = this.buildConfig({ tunnelId, ...options });
    
    log.info('Starting SSH tunnel', {
      tunnelId,
      type: tunnelConfig.type,
      target: tunnelConfig.targetHost,
      localPort: tunnelConfig.localPort,
      remotePort: tunnelConfig.remotePort,
    });

    try {
      const process = spawn(tunnelConfig.command, tunnelConfig.args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: false,
      });

      const tunnelInfo = {
        id: tunnelId,
        process,
        pid: process.pid,
        config: tunnelConfig,
        status: 'connecting',
        startedAt: new Date().toISOString(),
        retries: 0,
        lastError: null,
        stats: {
          bytesIn: 0,
          bytesOut: 0,
          connectionsHandled: 0,
        },
      };

      // Handle process events
      process.on('error', (err) => {
        log.error('SSH tunnel process error', { tunnelId, error: err.message });
        tunnelInfo.status = 'error';
        tunnelInfo.lastError = err.message;
        this._handleReconnect(tunnelId, options);
      });

      process.stderr.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg) {
          log.debug('SSH tunnel stderr', { tunnelId, message: msg });
          if (msg.includes('Permission denied') || msg.includes('Connection refused')) {
            tunnelInfo.lastError = msg;
            tunnelInfo.status = 'auth_failed';
          }
        }
      });

      process.stdout.on('data', (data) => {
        log.debug('SSH tunnel stdout', { tunnelId, message: data.toString().trim() });
      });

      process.on('exit', (code, signal) => {
        log.info('SSH tunnel process exited', { tunnelId, code, signal });
        tunnelInfo.status = 'disconnected';
        if (code !== 0 && !tunnelInfo._stopping) {
          this._handleReconnect(tunnelId, options);
        }
      });

      // Mark as connected after brief delay (SSH connects fast)
      setTimeout(() => {
        if (tunnelInfo.status === 'connecting') {
          tunnelInfo.status = 'connected';
          log.info('SSH tunnel connected', { tunnelId });
        }
      }, 3000);

      this.tunnels.set(tunnelId, tunnelInfo);

      return {
        success: true,
        tunnelId,
        pid: process.pid,
        type: tunnelConfig.type,
        localPort: tunnelConfig.localPort,
        remotePort: tunnelConfig.remotePort,
      };
    } catch (err) {
      log.error('Failed to start SSH tunnel', { tunnelId, error: err.message });
      return { success: false, error: err.message };
    }
  }

  /**
   * Handle automatic reconnection
   */
  _handleReconnect(tunnelId, options) {
    const tunnel = this.tunnels.get(tunnelId);
    if (!tunnel || tunnel._stopping) return;

    const maxRetries = tunnel.config.maxRetries || 10;
    const interval = tunnel.config.reconnectInterval || 30;

    if (tunnel.retries >= maxRetries) {
      log.error('SSH tunnel max retries reached', { tunnelId, retries: tunnel.retries });
      tunnel.status = 'failed';
      return;
    }

    tunnel.retries++;
    tunnel.status = 'reconnecting';
    log.info('SSH tunnel reconnecting', { tunnelId, attempt: tunnel.retries, maxRetries });

    setTimeout(() => {
      this.tunnels.delete(tunnelId);
      this.start(tunnelId, options);
    }, interval * 1000);
  }

  /**
   * Stop an SSH tunnel
   */
  async stop(tunnelId) {
    const tunnel = this.tunnels.get(tunnelId);
    if (!tunnel) {
      return { success: false, error: 'Tunnel not found' };
    }

    tunnel._stopping = true;
    tunnel.status = 'stopping';

    try {
      if (tunnel.process && !tunnel.process.killed) {
        tunnel.process.kill('SIGTERM');
        
        // Force kill after 5 seconds
        setTimeout(() => {
          if (tunnel.process && !tunnel.process.killed) {
            tunnel.process.kill('SIGKILL');
          }
        }, 5000);
      }

      this.tunnels.delete(tunnelId);
      log.info('SSH tunnel stopped', { tunnelId });
      return { success: true, tunnelId };
    } catch (err) {
      log.error('Error stopping SSH tunnel', { tunnelId, error: err.message });
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
      pid: tunnel.pid,
      status: tunnel.status,
      type: tunnel.config.type,
      localPort: tunnel.config.localPort,
      remotePort: tunnel.config.remotePort,
      targetHost: tunnel.config.targetHost,
      startedAt: tunnel.startedAt,
      retries: tunnel.retries,
      lastError: tunnel.lastError,
      stats: tunnel.stats,
      uptime: tunnel.startedAt ? Math.floor((Date.now() - new Date(tunnel.startedAt).getTime()) / 1000) : 0,
    };
  }

  /**
   * Get all tunnels status
   */
  getAllStatus() {
    const statuses = [];
    for (const [id] of this.tunnels) {
      statuses.push(this.getStatus(id));
    }
    return statuses;
  }

  /**
   * Health check for SSH tunnel
   */
  async healthCheck(tunnelId) {
    const tunnel = this.tunnels.get(tunnelId);
    if (!tunnel) return { healthy: false, error: 'Tunnel not found' };

    const isAlive = tunnel.process && !tunnel.process.killed && tunnel.status === 'connected';

    return {
      healthy: isAlive,
      tunnelId,
      status: tunnel.status,
      uptime: tunnel.startedAt ? Math.floor((Date.now() - new Date(tunnel.startedAt).getTime()) / 1000) : 0,
      retries: tunnel.retries,
      pid: tunnel.pid,
    };
  }

  /**
   * Generate SSH tunnel configuration for deployment
   * Returns shell commands to set up the tunnel on the server
   */
  generateDeployConfig(options) {
    const {
      tunnelId,
      type = 'local',
      iranServerIp,
      foreignServerIp,
      foreignServerPort = 22,
      localPort,
      remotePort,
      username = 'elahe',
    } = options;

    const sshCommand = [
      'ssh', '-N', '-f',
      '-o', 'ExitOnForwardFailure=yes',
      '-o', 'ServerAliveInterval=30',
      '-o', 'ServerAliveCountMax=3',
      '-o', 'StrictHostKeyChecking=no',
      '-C',
    ];

    switch (type) {
      case 'local':
        sshCommand.push('-L', `0.0.0.0:${localPort}:${foreignServerIp}:${remotePort}`);
        break;
      case 'remote':
        sshCommand.push('-R', `0.0.0.0:${remotePort}:127.0.0.1:${localPort}`);
        break;
      case 'dynamic':
        sshCommand.push('-D', `0.0.0.0:${localPort}`);
        break;
    }

    sshCommand.push('-p', String(foreignServerPort));
    const target = type === 'remote' ? foreignServerIp : iranServerIp;
    sshCommand.push(`${username}@${target}`);

    // systemd service for auto-restart
    const systemdService = `[Unit]
Description=Elahe SSH Tunnel ${tunnelId}
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${sshCommand.join(' ')}
Restart=always
RestartSec=30
User=root

[Install]
WantedBy=multi-user.target`;

    return {
      tunnelId,
      command: sshCommand.join(' '),
      systemdService,
      setupScript: `#!/bin/bash
# Elahe SSH Tunnel Setup - ${tunnelId}
# Generated: ${new Date().toISOString()}

# Create SSH key
ssh-keygen -t ed25519 -f /root/.ssh/elahe_tunnel_${tunnelId} -N "" -q

# Copy key to remote server
ssh-copy-id -i /root/.ssh/elahe_tunnel_${tunnelId}.pub -p ${foreignServerPort} ${username}@${target}

# Create systemd service
cat > /etc/systemd/system/elahe-ssh-${tunnelId}.service << 'EOFSERVICE'
${systemdService}
EOFSERVICE

# Enable and start
systemctl daemon-reload
systemctl enable elahe-ssh-${tunnelId}
systemctl start elahe-ssh-${tunnelId}

echo "SSH tunnel ${tunnelId} configured and started"`,
    };
  }

  /**
   * Cleanup all tunnels
   */
  async cleanup() {
    log.info('Cleaning up all SSH tunnels');
    const promises = [];
    for (const [id] of this.tunnels) {
      promises.push(this.stop(id));
    }
    await Promise.all(promises);
    log.info('All SSH tunnels cleaned up');
  }
}

// Singleton instance
const sshTunnelEngine = new SSHTunnelEngine();

module.exports = sshTunnelEngine;
