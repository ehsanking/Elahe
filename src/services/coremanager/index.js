/**
 * Elahe Panel - Core Engine Management Service
 * Manage Xray/Sing-box versions, start/stop/restart
 * Developer: EHSANKiNG
 * Version: 0.0.5
 */

const { getDb } = require('../../database');
const { createLogger } = require('../../utils/logger');
const { execSync, spawn } = require('child_process');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const config = require('../../config/default');

const log = createLogger('CoreManager');

const XRAY_API = 'https://api.github.com/repos/XTLS/Xray-core/releases';
const SINGBOX_API = 'https://api.github.com/repos/SagerNet/sing-box/releases';

class CoreManager {
  static coreProcesses = {};

  /**
   * Get installed core versions
   */
  static getInstalledVersions() {
    const db = getDb();
    return db.prepare('SELECT * FROM core_versions ORDER BY downloaded_at DESC').all();
  }

  /**
   * Get active core version info
   */
  static getActiveCore(engine = null) {
    const db = getDb();
    if (engine) {
      return db.prepare('SELECT * FROM core_versions WHERE engine = ? AND is_active = 1').get(engine);
    }
    return db.prepare('SELECT * FROM core_versions WHERE is_active = 1').all();
  }

  /**
   * Get latest versions from GitHub
   */
  static async fetchLatestVersions() {
    const results = {};

    try {
      const xrayRes = await axios.get(`${XRAY_API}?per_page=3`, { timeout: 15000 });
      results.xray = xrayRes.data.map(r => ({
        version: r.tag_name,
        name: r.name,
        published: r.published_at,
        prerelease: r.prerelease,
        url: r.html_url,
        assets: (r.assets || []).filter(a => a.name.includes('linux')).map(a => ({
          name: a.name,
          size: a.size,
          url: a.browser_download_url,
        })),
      }));
    } catch (err) {
      results.xray = [];
      log.warn('Failed to fetch Xray releases', { error: err.message });
    }

    try {
      const sbRes = await axios.get(`${SINGBOX_API}?per_page=3`, { timeout: 15000 });
      results.singbox = sbRes.data.map(r => ({
        version: r.tag_name,
        name: r.name,
        published: r.published_at,
        prerelease: r.prerelease,
        url: r.html_url,
        assets: (r.assets || []).filter(a => a.name.includes('linux')).map(a => ({
          name: a.name,
          size: a.size,
          url: a.browser_download_url,
        })),
      }));
    } catch (err) {
      results.singbox = [];
      log.warn('Failed to fetch Sing-box releases', { error: err.message });
    }

    return results;
  }

  /**
   * Detect currently installed versions on the system
   */
  static detectInstalledBinaries() {
    const results = {};

    // Detect Xray
    try {
      const xrayPath = config.core.xrayPath;
      if (fs.existsSync(xrayPath)) {
        const version = execSync(`${xrayPath} version 2>/dev/null || echo "unknown"`, { timeout: 5000 }).toString().trim();
        const match = version.match(/Xray\s+([\d.]+)/i);
        results.xray = {
          installed: true,
          path: xrayPath,
          version: match ? match[1] : version.split('\n')[0],
          raw: version,
        };
      } else {
        results.xray = { installed: false, path: xrayPath };
      }
    } catch (err) {
      results.xray = { installed: false, error: err.message };
    }

    // Detect Sing-box
    try {
      const sbPath = config.core.singboxPath;
      if (fs.existsSync(sbPath)) {
        const version = execSync(`${sbPath} version 2>/dev/null || echo "unknown"`, { timeout: 5000 }).toString().trim();
        const match = version.match(/sing-box version\s+([\d.]+)/i) || version.match(/([\d.]+)/);
        results.singbox = {
          installed: true,
          path: sbPath,
          version: match ? match[1] : version.split('\n')[0],
          raw: version,
        };
      } else {
        results.singbox = { installed: false, path: sbPath };
      }
    } catch (err) {
      results.singbox = { installed: false, error: err.message };
    }

    return results;
  }

  /**
   * Get core status (running/stopped)
   */
  static getCoreStatus() {
    const status = {};

    // Check xray process
    try {
      const xrayPid = execSync('pgrep -x xray 2>/dev/null || echo ""', { timeout: 3000 }).toString().trim();
      status.xray = {
        running: !!xrayPid,
        pid: xrayPid || null,
      };
    } catch (_) {
      status.xray = { running: false };
    }

    // Check sing-box process
    try {
      const sbPid = execSync('pgrep -x sing-box 2>/dev/null || echo ""', { timeout: 3000 }).toString().trim();
      status.singbox = {
        running: !!sbPid,
        pid: sbPid || null,
      };
    } catch (_) {
      status.singbox = { running: false };
    }

    // Check via systemd
    try {
      const xrayActive = execSync('systemctl is-active xray 2>/dev/null || echo "inactive"', { timeout: 3000 }).toString().trim();
      status.xray.systemd = xrayActive;
    } catch (_) {}
    try {
      const sbActive = execSync('systemctl is-active sing-box 2>/dev/null || echo "inactive"', { timeout: 3000 }).toString().trim();
      status.singbox.systemd = sbActive;
    } catch (_) {}

    return status;
  }

  /**
   * Start a core engine
   */
  static startCore(engine) {
    try {
      if (engine === 'xray') {
        execSync('systemctl start xray 2>/dev/null || true', { timeout: 10000 });
      } else if (engine === 'singbox') {
        execSync('systemctl start sing-box 2>/dev/null || true', { timeout: 10000 });
      }
      log.info(`Core ${engine} started`);
      return { success: true, message: `${engine} started` };
    } catch (err) {
      log.error(`Failed to start ${engine}`, { error: err.message });
      return { success: false, error: err.message };
    }
  }

  /**
   * Stop a core engine
   */
  static stopCore(engine) {
    try {
      if (engine === 'xray') {
        execSync('systemctl stop xray 2>/dev/null || pkill -x xray 2>/dev/null || true', { timeout: 10000 });
      } else if (engine === 'singbox') {
        execSync('systemctl stop sing-box 2>/dev/null || pkill -x sing-box 2>/dev/null || true', { timeout: 10000 });
      }
      log.info(`Core ${engine} stopped`);
      return { success: true, message: `${engine} stopped` };
    } catch (err) {
      log.error(`Failed to stop ${engine}`, { error: err.message });
      return { success: false, error: err.message };
    }
  }

  /**
   * Restart a core engine
   */
  static restartCore(engine) {
    try {
      if (engine === 'xray') {
        execSync('systemctl restart xray 2>/dev/null || (pkill -x xray 2>/dev/null; sleep 1; systemctl start xray 2>/dev/null) || true', { timeout: 15000 });
      } else if (engine === 'singbox') {
        execSync('systemctl restart sing-box 2>/dev/null || (pkill -x sing-box 2>/dev/null; sleep 1; systemctl start sing-box 2>/dev/null) || true', { timeout: 15000 });
      }
      log.info(`Core ${engine} restarted`);
      return { success: true, message: `${engine} restarted` };
    } catch (err) {
      log.error(`Failed to restart ${engine}`, { error: err.message });
      return { success: false, error: err.message };
    }
  }

  /**
   * Check port conflicts
   */
  static checkPortConflicts() {
    const conflicts = [];
    const configPorts = config.ports;
    
    try {
      const listeningPorts = execSync("ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null || echo ''", { timeout: 5000 }).toString();
      
      const checkPort = (port, protocol) => {
        const regex = new RegExp(`:${port}\\s`, 'g');
        if (regex.test(listeningPorts)) {
          // Extract process info
          const processMatch = listeningPorts.match(new RegExp(`:${port}\\s.*?(?:users:\\(\\("([^"]+)")|(?:"([^"]+)")`));
          const processName = processMatch ? (processMatch[1] || processMatch[2] || 'unknown') : 'unknown';
          conflicts.push({ port, protocol, process: processName, status: 'in_use' });
        }
      };

      // Check all configured ports
      for (const [proto, ports] of Object.entries(configPorts)) {
        const portList = Array.isArray(ports) ? ports : [ports];
        for (const p of portList) {
          checkPort(p, proto);
        }
      }
      
      // Also check panel port and SSL ports
      checkPort(config.server.port, 'panel');
      checkPort(80, 'http-redirect');
      
    } catch (err) {
      log.warn('Port conflict check failed', { error: err.message });
    }

    return conflicts;
  }

  /**
   * Get core logs
   */
  static getCoreLogs(engine, lines = 50) {
    try {
      const serviceName = engine === 'xray' ? 'xray' : 'sing-box';
      const output = execSync(`journalctl -u ${serviceName} -n ${lines} --no-pager 2>/dev/null || echo "No logs available"`, { timeout: 5000 }).toString();
      return { success: true, logs: output };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Get comprehensive status for dashboard
   */
  static getFullStatus() {
    const binaries = this.detectInstalledBinaries();
    const processStatus = this.getCoreStatus();
    const portConflicts = this.checkPortConflicts();
    const db = getDb();
    const versions = db.prepare('SELECT * FROM core_versions ORDER BY downloaded_at DESC LIMIT 6').all();
    
    return {
      binaries,
      processStatus,
      portConflicts,
      storedVersions: versions,
      activeEngine: config.core.engine,
      protocols: {
        supported: ['vless-reality', 'vless', 'vmess', 'trojan', 'shadowsocks', 'hysteria2', 'wireguard', 'tuic'],
        xtls: ['RPRX-Direct', 'Vision', 'REALITY'],
      },
    };
  }
}

module.exports = CoreManager;
