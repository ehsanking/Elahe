/**
 * Elahe Panel - System Resource Monitor Service
 * Shows CPU, RAM, Disk, Network, Uptime to admin
 * Developer: EHSANKiNG
 * Version: 0.0.5
 */

const os = require('os');
const fs = require('fs');
const { execSync } = require('child_process');
const { createLogger } = require('../../utils/logger');

const log = createLogger('Monitor');

class SystemMonitor {
  /**
   * Get full system resource snapshot
   */
  static getSnapshot() {
    return {
      cpu: this.getCPU(),
      memory: this.getMemory(),
      disk: this.getDisk(),
      network: this.getNetwork(),
      uptime: this.getUptime(),
      os: this.getOSInfo(),
      process: this.getProcessInfo(),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * CPU info and load
   */
  static getCPU() {
    const cpus = os.cpus();
    const loadAvg = os.loadavg();

    // Calculate average usage across all cores
    let totalIdle = 0;
    let totalTick = 0;
    for (const cpu of cpus) {
      for (const type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    }
    const usagePercent = Math.round(((totalTick - totalIdle) / totalTick) * 100);

    return {
      model: cpus[0]?.model || 'Unknown',
      cores: cpus.length,
      speed: cpus[0]?.speed || 0,
      usagePercent,
      loadAvg: {
        '1m': loadAvg[0]?.toFixed(2),
        '5m': loadAvg[1]?.toFixed(2),
        '15m': loadAvg[2]?.toFixed(2),
      },
    };
  }

  /**
   * Memory / RAM usage
   */
  static getMemory() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    // Try to get swap info on Linux
    let swap = { total: 0, used: 0, free: 0 };
    try {
      const meminfo = fs.readFileSync('/proc/meminfo', 'utf8');
      const swapTotal = parseInt(meminfo.match(/SwapTotal:\s+(\d+)/)?.[1] || '0') * 1024;
      const swapFree = parseInt(meminfo.match(/SwapFree:\s+(\d+)/)?.[1] || '0') * 1024;
      swap = { total: swapTotal, used: swapTotal - swapFree, free: swapFree };
    } catch (e) {}

    return {
      total: totalMem,
      used: usedMem,
      free: freeMem,
      usagePercent: Math.round((usedMem / totalMem) * 100),
      totalFormatted: this._formatBytes(totalMem),
      usedFormatted: this._formatBytes(usedMem),
      freeFormatted: this._formatBytes(freeMem),
      swap: {
        total: swap.total,
        used: swap.used,
        free: swap.free,
        totalFormatted: this._formatBytes(swap.total),
        usedFormatted: this._formatBytes(swap.used),
      },
    };
  }

  /**
   * Disk usage
   */
  static getDisk() {
    try {
      const output = execSync("df -B1 / 2>/dev/null | tail -1", { encoding: 'utf8', timeout: 5000 });
      const parts = output.trim().split(/\s+/);
      if (parts.length >= 5) {
        const total = parseInt(parts[1]);
        const used = parseInt(parts[2]);
        const free = parseInt(parts[3]);
        const usagePercent = parseInt(parts[4]);
        return {
          total,
          used,
          free,
          usagePercent,
          totalFormatted: this._formatBytes(total),
          usedFormatted: this._formatBytes(used),
          freeFormatted: this._formatBytes(free),
        };
      }
    } catch (e) {}

    return {
      total: 0, used: 0, free: 0, usagePercent: 0,
      totalFormatted: 'N/A', usedFormatted: 'N/A', freeFormatted: 'N/A',
    };
  }

  /**
   * Network interfaces and bandwidth
   */
  static getNetwork() {
    const interfaces = os.networkInterfaces();
    const result = [];

    for (const [name, addrs] of Object.entries(interfaces)) {
      if (name === 'lo') continue;
      const ipv4 = addrs.find(a => a.family === 'IPv4' && !a.internal);
      const ipv6 = addrs.find(a => a.family === 'IPv6' && !a.internal);
      if (ipv4 || ipv6) {
        const iface = {
          name,
          ipv4: ipv4?.address || null,
          ipv6: ipv6?.address || null,
          mac: ipv4?.mac || ipv6?.mac || null,
        };

        // Try to get bandwidth stats from /proc/net/dev
        try {
          const netDev = fs.readFileSync('/proc/net/dev', 'utf8');
          const line = netDev.split('\n').find(l => l.trim().startsWith(name + ':'));
          if (line) {
            const parts = line.trim().split(/\s+/);
            iface.rx_bytes = parseInt(parts[1]);
            iface.tx_bytes = parseInt(parts[9]);
            iface.rx_formatted = this._formatBytes(iface.rx_bytes);
            iface.tx_formatted = this._formatBytes(iface.tx_bytes);
          }
        } catch (e) {}

        result.push(iface);
      }
    }

    return result;
  }

  /**
   * Uptime info
   */
  static getUptime() {
    const sysUptime = os.uptime();
    const processUptime = process.uptime();
    return {
      system: sysUptime,
      systemFormatted: this._formatDuration(sysUptime),
      process: Math.round(processUptime),
      processFormatted: this._formatDuration(Math.round(processUptime)),
    };
  }

  /**
   * OS info
   */
  static getOSInfo() {
    let distro = 'Unknown';
    try {
      const release = fs.readFileSync('/etc/os-release', 'utf8');
      const pretty = release.match(/PRETTY_NAME="([^"]+)"/);
      if (pretty) distro = pretty[1];
    } catch (e) {
      distro = `${os.type()} ${os.release()}`;
    }

    return {
      platform: os.platform(),
      arch: os.arch(),
      hostname: os.hostname(),
      distro,
      kernel: os.release(),
      nodeVersion: process.version,
    };
  }

  /**
   * Node.js process info
   */
  static getProcessInfo() {
    const mem = process.memoryUsage();
    return {
      pid: process.pid,
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      rss: mem.rss,
      external: mem.external,
      heapUsedFormatted: this._formatBytes(mem.heapUsed),
      rssFormatted: this._formatBytes(mem.rss),
    };
  }

  /**
   * Get active connections count per protocol (from Xray/Sing-box API)
   */
  static getActiveConnections() {
    const { getDb } = require('../../database');
    try {
      const db = getDb();
      const total = db.prepare('SELECT COUNT(*) as c FROM active_connections').get().c;
      const byProtocol = db.prepare(`
        SELECT protocol, COUNT(*) as count FROM active_connections GROUP BY protocol
      `).all();
      return { total, byProtocol };
    } catch (e) {
      return { total: 0, byProtocol: [] };
    }
  }

  /**
   * Get bandwidth usage summary
   */
  static getBandwidthSummary() {
    const { getDb } = require('../../database');
    try {
      const db = getDb();
      const today = db.prepare(`
        SELECT COALESCE(SUM(bytes_sent), 0) as sent, COALESCE(SUM(bytes_received), 0) as received
        FROM connection_logs WHERE date(connected_at) = date('now')
      `).get();
      const total = db.prepare(`
        SELECT COALESCE(SUM(bytes_sent), 0) as sent, COALESCE(SUM(bytes_received), 0) as received
        FROM connection_logs
      `).get();
      const userTotal = db.prepare(`
        SELECT COALESCE(SUM(data_used), 0) as totalUsed FROM users
      `).get();
      return {
        today: { sent: today.sent, received: today.received, total: today.sent + today.received, formatted: this._formatBytes(today.sent + today.received) },
        allTime: { sent: total.sent, received: total.received, total: total.sent + total.received, formatted: this._formatBytes(total.sent + total.received) },
        usersTotal: { used: userTotal.totalUsed, formatted: this._formatBytes(userTotal.totalUsed) },
      };
    } catch (e) {
      return {
        today: { sent: 0, received: 0, total: 0, formatted: '0 B' },
        allTime: { sent: 0, received: 0, total: 0, formatted: '0 B' },
        usersTotal: { used: 0, formatted: '0 B' },
      };
    }
  }

  // ========== Helpers ==========
  static _formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  static _formatDuration(seconds) {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    parts.push(`${m}m`);
    return parts.join(' ');
  }
}

module.exports = SystemMonitor;
