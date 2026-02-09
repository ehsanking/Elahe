/**
 * Elahe Panel - Subscription Service
 * Includes TrustTunnel config in user info page
 * Version: 0.0.3
 */

const { getDb } = require('../../database');
const ConfigGenerator = require('./configGenerator');
const ServerService = require('../server');
const UserService = require('../user');
const autopilotService = require('../autopilot');
const { createLogger } = require('../../utils/logger');
const config = require('../../config/default');

const log = createLogger('SubscriptionService');

class SubscriptionService {
  /**
   * Get subscription data for a user by token
   */
  static getSubscriptionByToken(token) {
    const user = UserService.getBySubToken(token);
    if (!user) return null;

    // Check expiry
    if (user.expire_at && new Date(user.expire_at) < new Date()) {
      const db = getDb();
      db.prepare("UPDATE users SET status = 'expired' WHERE id = ?").run(user.id);
      user.status = 'expired';
    }

    // Check data limit
    if (user.data_limit > 0 && user.data_used >= user.data_limit) {
      const db = getDb();
      db.prepare("UPDATE users SET status = 'limited' WHERE id = ?").run(user.id);
      user.status = 'limited';
    }

    if (user.status !== 'active') {
      return { user, configs: [], active: false, reason: user.status };
    }

    const servers = ServerService.listServers();
    const configs = ConfigGenerator.generateAllConfigs(user, servers);

    return {
      user: {
        username: user.username,
        uuid: user.uuid,
        plan: user.plan,
        status: user.status,
        dataLimit: user.data_limit,
        dataUsed: user.data_used,
        expireAt: user.expire_at,
        maxConnections: user.max_connections,
      },
      configs,
      active: true,
      subscriptionContent: ConfigGenerator.generateSubscription(user, servers),
    };
  }

  /**
   * Get raw subscription (base64 links) for apps like V2rayNG
   */
  static getRawSubscription(token) {
    const user = UserService.getBySubToken(token);
    if (!user || user.status !== 'active') return null;

    const servers = ServerService.listServers();
    return ConfigGenerator.generateSubscription(user, servers);
  }

  /**
   * Get subscription info page data
   * Includes TrustTunnel config, autopilot status, and tunnel architecture info
   */
  static getSubscriptionInfo(token) {
    const data = this.getSubscriptionByToken(token);
    if (!data) return null;

    // Client app download links
    const apps = {
      android: [
        { name: 'V2rayNG', url: 'https://github.com/2dust/v2rayNG/releases', icon: 'android' },
        { name: 'NekoBox', url: 'https://github.com/MatsuriDayo/NekoBoxForAndroid/releases', icon: 'android' },
        { name: 'Hiddify', url: 'https://github.com/hiddify/hiddify-next/releases', icon: 'android' },
        { name: 'Streisand', url: 'https://github.com/nickkjolsing/Streisand', icon: 'android' },
      ],
      ios: [
        { name: 'Streisand', url: 'https://apps.apple.com/app/streisand/id6450534064', icon: 'ios' },
        { name: 'V2Box', url: 'https://apps.apple.com/app/v2box-v2ray-client/id6446814690', icon: 'ios' },
        { name: 'Shadowrocket', url: 'https://apps.apple.com/app/shadowrocket/id932747118', icon: 'ios' },
      ],
      windows: [
        { name: 'V2rayN', url: 'https://github.com/2dust/v2rayN/releases', icon: 'windows' },
        { name: 'NekoRay', url: 'https://github.com/MatsuriDayo/nekoray/releases', icon: 'windows' },
        { name: 'Hiddify', url: 'https://github.com/hiddify/hiddify-next/releases', icon: 'windows' },
      ],
      mac: [
        { name: 'V2rayU', url: 'https://github.com/yanue/V2rayU/releases', icon: 'mac' },
        { name: 'Hiddify', url: 'https://github.com/hiddify/hiddify-next/releases', icon: 'mac' },
      ],
      linux: [
        { name: 'NekoRay', url: 'https://github.com/MatsuriDayo/nekoray/releases', icon: 'linux' },
        { name: 'Hiddify', url: 'https://github.com/hiddify/hiddify-next/releases', icon: 'linux' },
      ],
    };

    // Build TrustTunnel config for each Iran server
    const servers = ServerService.listServers();
    const iranServers = servers.filter(s => s.type === 'iran' && s.status === 'active');
    const trustTunnelConfigs = [];

    if (data.active && data.user) {
      for (const iranServer of iranServers) {
        trustTunnelConfigs.push(autopilotService.getTrustTunnelUserConfig(
          { uuid: data.user.uuid },
          iranServer
        ));
      }
    }

    // Get autopilot status for tunnel architecture display
    let autopilotStatus = {};
    try {
      autopilotStatus = autopilotService.getStatus();
    } catch (e) {}

    return {
      ...data,
      apps,
      wireguardConfigs: data.configs.filter(c => c.protocol === 'wireguard').map(c => ({
        name: c.name,
        downloadableConfig: c.downloadableConfig,
      })),
      openvpnConfigs: data.configs.filter(c => c.protocol === 'openvpn').map(c => ({
        name: c.name,
        downloadableConfig: c.downloadableConfig,
      })),
      // TrustTunnel dedicated configs
      trustTunnelConfigs,
      // Tunnel architecture info for user page
      tunnelArchitecture: {
        primary: {
          name: 'Stealth Channel',
          protocol: 'VLESS + Reality (XTLS-Vision)',
          port: 443,
          status: 'active',
          description: 'Primary channel with undetectable traffic',
        },
        secondary: {
          name: 'Web Channel (TrustTunnel)',
          protocol: 'HTTP/3 (QUIC)',
          port: config.ports.trusttunnel,
          status: 'always_active',
          description: 'Application layer camouflage with HTTP/3',
        },
        backup: {
          name: 'Auto-Switch Backup',
          engine: autopilotStatus.primary443 || 'gost',
          candidates: ['FRP (TLS)', 'GOST (TLS/QUIC)', 'Chisel (TLS)', 'SSH'],
          port: 443,
          description: 'Best tunnel auto-selected every 10 minutes',
        },
        alwaysOn: [
          {
            name: 'OpenVPN',
            ports: config.ports.openvpn,
            status: 'always_active',
            description: 'Always active on dedicated ports',
          },
          {
            name: 'WireGuard',
            ports: config.ports.wireguard,
            status: 'always_active',
            description: 'Always active on dedicated ports',
          },
          {
            name: 'TrustTunnel',
            ports: [config.ports.trusttunnel],
            status: 'always_active',
            description: 'Always active on port 8443',
          },
        ],
      },
    };
  }
}

module.exports = SubscriptionService;
