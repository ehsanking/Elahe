/**
 * Elahe Panel - Multi-Protocol Config Generator
 * Generates ALL config models including hybrid/combo:
 *   - VLESS+Reality (XTLS-Vision)
 *   - VLESS+WS+TLS
 *   - VLESS+gRPC+TLS
 *   - VLESS+TCP+TLS
 *   - VMess+WS+TLS
 *   - VMess+gRPC+TLS
 *   - VMess+TCP
 *   - Trojan+WS+TLS
 *   - Trojan+gRPC+TLS
 *   - Trojan+TCP+TLS
 *   - Shadowsocks (2022 / AEAD)
 *   - Hysteria2 (full coverage)
 *   - WireGuard
 *   - OpenVPN
 *   - TrustTunnel (HTTP/3)
 *
 * Developer: EHSANKiNG
 * Version: 0.0.5
 */

const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { getDb } = require('../../database');
const config = require('../../config/default');
const { generateX25519KeyPair, generateShortId, generatePassword } = require('../../utils/crypto');
const { createLogger } = require('../../utils/logger');
const { getRandomRealityTarget } = require('./reality_targets');

const log = createLogger('ConfigGenerator');

class ConfigGenerator {
  /**
   * Generate all configs for a user across all servers
   */
  static generateAllConfigs(user, servers) {
    const configs = [];
    const iranServers = servers.filter(s => s.type === 'iran' && s.status === 'active');
    const foreignServers = servers.filter(s => s.type === 'foreign' && s.status === 'active');

    const enabledProtocols = JSON.parse(user.protocols_enabled || '[]');

    for (const iranServer of iranServers) {
      for (const foreignServer of foreignServers) {
        // ===== VLESS Variants =====
        if (enabledProtocols.includes('vless-reality')) {
          configs.push(this.generateVlessReality(user, iranServer, foreignServer));
        }
        if (enabledProtocols.includes('vless-reality') || enabledProtocols.includes('vless-ws')) {
          configs.push(this.generateVlessWS(user, iranServer, foreignServer));
        }
        if (enabledProtocols.includes('vless-reality') || enabledProtocols.includes('vless-grpc')) {
          configs.push(this.generateVlessGRPC(user, iranServer, foreignServer));
        }

        // ===== VMess Variants =====
        if (enabledProtocols.includes('vmess')) {
          configs.push(this.generateVmess(user, iranServer, foreignServer));
          configs.push(this.generateVmessGRPC(user, iranServer, foreignServer));
          configs.push(this.generateVmessTCP(user, iranServer, foreignServer));
        }

        // ===== Trojan Variants =====
        if (enabledProtocols.includes('trojan')) {
          configs.push(this.generateTrojan(user, iranServer, foreignServer));
          configs.push(this.generateTrojanWS(user, iranServer, foreignServer));
          configs.push(this.generateTrojanGRPC(user, iranServer, foreignServer));
        }

        // ===== Shadowsocks =====
        if (enabledProtocols.includes('shadowsocks')) {
          configs.push(this.generateShadowsocks(user, iranServer, foreignServer));
          configs.push(this.generateShadowsocks2022(user, iranServer, foreignServer));
        }

        // ===== Hysteria2 =====
        if (enabledProtocols.includes('hysteria2')) {
          configs.push(this.generateHysteria2(user, iranServer, foreignServer));
          configs.push(this.generateHysteria2Obfs(user, iranServer, foreignServer));
        }

        // ===== WireGuard =====
        if (enabledProtocols.includes('wireguard')) {
          configs.push(...this.generateWireGuard(user, iranServer, foreignServer));
        }

        // ===== OpenVPN =====
        if (enabledProtocols.includes('openvpn')) {
          configs.push(...this.generateOpenVPN(user, iranServer, foreignServer));
        }

        // ===== TrustTunnel =====
        if (enabledProtocols.includes('trusttunnel')) {
          configs.push(this.generateTrustTunnel(user, iranServer, foreignServer));
        }
      }
    }

    return configs;
  }

  // ╔══════════════════════════════════════════════════╗
  // ║                 VLESS VARIANTS                   ║
  // ╚══════════════════════════════════════════════════╝

  /**
   * VLESS + Reality (XTLS-Vision) - Most advanced protocol
   */
  static generateVlessReality(user, iranServer, foreignServer) {
    const keys = generateX25519KeyPair();
    const shortId = generateShortId();
    const realityTarget = getRandomRealityTarget('cdn', 'low');
    const sni = realityTarget.sni;
    const fingerprint = 'chrome';

    const link = `vless://${user.uuid}@${iranServer.ip}:443?encryption=none&flow=xtls-rprx-vision&security=reality&sni=${sni}&fp=${fingerprint}&pbk=${keys.publicKey}&sid=${shortId}&type=tcp&headerType=none#Elahe-VLESS-Reality-${iranServer.name}`;

    return {
      protocol: 'vless-reality',
      name: `VLESS+Reality (${iranServer.name})`,
      link,
      serverIp: iranServer.ip,
      port: 443,
      config: {
        uuid: user.uuid, flow: 'xtls-rprx-vision', security: 'reality',
        sni, fingerprint, publicKey: keys.publicKey, privateKey: keys.privateKey, shortId,
      },
    };
  }

  /**
   * VLESS + WebSocket + TLS
   */
  static generateVlessWS(user, iranServer, foreignServer) {
    const link = `vless://${user.uuid}@${iranServer.ip}:443?encryption=none&security=tls&sni=${iranServer.ip}&type=ws&host=${iranServer.ip}&path=%2Fvless-ws#Elahe-VLESS-WS-${iranServer.name}`;
    return {
      protocol: 'vless-ws',
      name: `VLESS+WS+TLS (${iranServer.name})`,
      link,
      serverIp: iranServer.ip,
      port: 443,
      config: { uuid: user.uuid, security: 'tls', network: 'ws', wsPath: '/vless-ws' },
    };
  }

  /**
   * VLESS + gRPC + TLS
   */
  static generateVlessGRPC(user, iranServer, foreignServer) {
    const serviceName = 'vless-grpc';
    const link = `vless://${user.uuid}@${iranServer.ip}:443?encryption=none&security=tls&sni=${iranServer.ip}&type=grpc&serviceName=${serviceName}&mode=gun#Elahe-VLESS-gRPC-${iranServer.name}`;
    return {
      protocol: 'vless-grpc',
      name: `VLESS+gRPC+TLS (${iranServer.name})`,
      link,
      serverIp: iranServer.ip,
      port: 443,
      config: { uuid: user.uuid, security: 'tls', network: 'grpc', serviceName },
    };
  }

  // ╔══════════════════════════════════════════════════╗
  // ║                 VMESS VARIANTS                   ║
  // ╚══════════════════════════════════════════════════╝

  /**
   * VMess + WebSocket + TLS (standard)
   */
  static generateVmess(user, iranServer, foreignServer) {
    const vmessConfig = {
      v: '2', ps: `Elahe-VMess-WS-${iranServer.name}`,
      add: iranServer.ip, port: '8080', id: user.uuid, aid: '0',
      scy: 'auto', net: 'ws', type: 'none', host: iranServer.ip,
      path: '/vmess', tls: 'tls', sni: '', alpn: '',
    };
    const link = `vmess://${Buffer.from(JSON.stringify(vmessConfig)).toString('base64')}`;
    return {
      protocol: 'vmess',
      name: `VMess+WS+TLS (${iranServer.name})`,
      link, serverIp: iranServer.ip, port: 8080, config: vmessConfig,
    };
  }

  /**
   * VMess + gRPC + TLS
   */
  static generateVmessGRPC(user, iranServer, foreignServer) {
    const vmessConfig = {
      v: '2', ps: `Elahe-VMess-gRPC-${iranServer.name}`,
      add: iranServer.ip, port: '8080', id: user.uuid, aid: '0',
      scy: 'auto', net: 'grpc', type: 'gun', host: iranServer.ip,
      path: 'vmess-grpc', tls: 'tls', sni: '', alpn: '',
    };
    const link = `vmess://${Buffer.from(JSON.stringify(vmessConfig)).toString('base64')}`;
    return {
      protocol: 'vmess-grpc',
      name: `VMess+gRPC+TLS (${iranServer.name})`,
      link, serverIp: iranServer.ip, port: 8080, config: vmessConfig,
    };
  }

  /**
   * VMess + TCP (no TLS, for internal tunnels)
   */
  static generateVmessTCP(user, iranServer, foreignServer) {
    const vmessConfig = {
      v: '2', ps: `Elahe-VMess-TCP-${iranServer.name}`,
      add: iranServer.ip, port: '8080', id: user.uuid, aid: '0',
      scy: 'auto', net: 'tcp', type: 'http', host: iranServer.ip,
      path: '/', tls: '', sni: '', alpn: '',
    };
    const link = `vmess://${Buffer.from(JSON.stringify(vmessConfig)).toString('base64')}`;
    return {
      protocol: 'vmess-tcp',
      name: `VMess+TCP (${iranServer.name})`,
      link, serverIp: iranServer.ip, port: 8080, config: vmessConfig,
    };
  }

  // ╔══════════════════════════════════════════════════╗
  // ║                TROJAN VARIANTS                   ║
  // ╚══════════════════════════════════════════════════╝

  /**
   * Trojan + TCP + TLS (standard)
   */
  static generateTrojan(user, iranServer, foreignServer) {
    const password = crypto.createHash('sha256').update(user.uuid).digest('hex').substring(0, 32);
    const link = `trojan://${password}@${iranServer.ip}:8443?security=tls&type=tcp&headerType=none&sni=${iranServer.ip}#Elahe-Trojan-TCP-${iranServer.name}`;
    return {
      protocol: 'trojan',
      name: `Trojan+TCP+TLS (${iranServer.name})`,
      link, serverIp: iranServer.ip, port: 8443,
      config: { password, sni: iranServer.ip, network: 'tcp' },
    };
  }

  /**
   * Trojan + WebSocket + TLS
   */
  static generateTrojanWS(user, iranServer, foreignServer) {
    const password = crypto.createHash('sha256').update(user.uuid).digest('hex').substring(0, 32);
    const link = `trojan://${password}@${iranServer.ip}:8443?security=tls&type=ws&host=${iranServer.ip}&path=%2Ftrojan-ws&sni=${iranServer.ip}#Elahe-Trojan-WS-${iranServer.name}`;
    return {
      protocol: 'trojan-ws',
      name: `Trojan+WS+TLS (${iranServer.name})`,
      link, serverIp: iranServer.ip, port: 8443,
      config: { password, sni: iranServer.ip, network: 'ws', wsPath: '/trojan-ws' },
    };
  }

  /**
   * Trojan + gRPC + TLS
   */
  static generateTrojanGRPC(user, iranServer, foreignServer) {
    const password = crypto.createHash('sha256').update(user.uuid).digest('hex').substring(0, 32);
    const link = `trojan://${password}@${iranServer.ip}:8443?security=tls&type=grpc&serviceName=trojan-grpc&sni=${iranServer.ip}&mode=gun#Elahe-Trojan-gRPC-${iranServer.name}`;
    return {
      protocol: 'trojan-grpc',
      name: `Trojan+gRPC+TLS (${iranServer.name})`,
      link, serverIp: iranServer.ip, port: 8443,
      config: { password, sni: iranServer.ip, network: 'grpc', serviceName: 'trojan-grpc' },
    };
  }

  // ╔══════════════════════════════════════════════════╗
  // ║             SHADOWSOCKS VARIANTS                 ║
  // ╚══════════════════════════════════════════════════╝

  /**
   * Shadowsocks AEAD (chacha20-ietf-poly1305)
   */
  static generateShadowsocks(user, iranServer, foreignServer) {
    const password = crypto.createHash('md5').update(user.uuid).digest('hex');
    const method = 'chacha20-ietf-poly1305';
    const userInfo = Buffer.from(`${method}:${password}`).toString('base64');
    const link = `ss://${userInfo}@${iranServer.ip}:${config.ports.shadowsocks}#Elahe-SS-AEAD-${iranServer.name}`;
    return {
      protocol: 'shadowsocks',
      name: `Shadowsocks AEAD (${iranServer.name})`,
      link, serverIp: iranServer.ip, port: config.ports.shadowsocks,
      config: { method, password },
    };
  }

  /**
   * Shadowsocks 2022 (2022-blake3-aes-256-gcm)
   */
  static generateShadowsocks2022(user, iranServer, foreignServer) {
    // SS 2022 requires base64-encoded 32-byte key
    const key = crypto.createHash('sha256').update(user.uuid + '-ss2022').digest('base64');
    const method = '2022-blake3-aes-256-gcm';
    const userInfo = Buffer.from(`${method}:${key}`).toString('base64');
    const link = `ss://${userInfo}@${iranServer.ip}:${config.ports.shadowsocks}#Elahe-SS2022-${iranServer.name}`;
    return {
      protocol: 'shadowsocks-2022',
      name: `Shadowsocks 2022 (${iranServer.name})`,
      link, serverIp: iranServer.ip, port: config.ports.shadowsocks,
      config: { method, password: key },
    };
  }

  // ╔══════════════════════════════════════════════════╗
  // ║           HYSTERIA2 (Full Coverage)              ║
  // ╚══════════════════════════════════════════════════╝

  /**
   * Hysteria2 - Standard (QUIC-based)
   */
  static generateHysteria2(user, iranServer, foreignServer) {
    const password = crypto.createHash('sha256').update(user.uuid + 'hysteria2').digest('hex').substring(0, 32);
    const port = config.ports.hysteria2;

    const link = `hysteria2://${password}@${iranServer.ip}:${port}?insecure=1&sni=bing.com&obfs=none#Elahe-Hy2-${iranServer.name}`;

    return {
      protocol: 'hysteria2',
      name: `Hysteria2 (${iranServer.name})`,
      link,
      serverIp: iranServer.ip,
      port,
      config: {
        password,
        sni: 'bing.com',
        insecure: true,
        upMbps: 100,
        downMbps: 100,
      },
      // Full Hysteria2 client JSON config for sing-box/hysteria2 client
      fullConfig: {
        server: `${iranServer.ip}:${port}`,
        auth: password,
        tls: {
          sni: 'bing.com',
          insecure: true,
        },
        bandwidth: {
          up: '100 mbps',
          down: '100 mbps',
        },
        fastOpen: true,
        lazy: true,
        socks5: {
          listen: '127.0.0.1:1080',
        },
        http: {
          listen: '127.0.0.1:8080',
        },
      },
      // Sing-box outbound config
      singboxOutbound: {
        type: 'hysteria2',
        tag: `hy2-${iranServer.name}`,
        server: iranServer.ip,
        server_port: port,
        password,
        tls: {
          enabled: true,
          server_name: 'bing.com',
          insecure: true,
        },
        up_mbps: 100,
        down_mbps: 100,
      },
      // Xray outbound config
      xrayOutbound: {
        protocol: 'hysteria2',
        settings: {
          servers: [{
            address: iranServer.ip,
            port,
            password,
          }],
        },
        streamSettings: {
          network: 'hysteria2',
          security: 'tls',
          tlsSettings: {
            serverName: 'bing.com',
            allowInsecure: true,
          },
        },
        tag: `hy2-${iranServer.name}`,
      },
    };
  }

  /**
   * Hysteria2 with Salamander obfuscation
   */
  static generateHysteria2Obfs(user, iranServer, foreignServer) {
    const password = crypto.createHash('sha256').update(user.uuid + 'hysteria2-obfs').digest('hex').substring(0, 32);
    const obfsPassword = crypto.createHash('md5').update(user.uuid + 'hy2-obfs-key').digest('hex');
    const port = config.ports.hysteria2;

    const link = `hysteria2://${password}@${iranServer.ip}:${port}?insecure=1&sni=bing.com&obfs=salamander&obfs-password=${obfsPassword}#Elahe-Hy2-Obfs-${iranServer.name}`;

    return {
      protocol: 'hysteria2-obfs',
      name: `Hysteria2+Obfs (${iranServer.name})`,
      link,
      serverIp: iranServer.ip,
      port,
      config: {
        password,
        sni: 'bing.com',
        insecure: true,
        obfs: 'salamander',
        obfsPassword,
        upMbps: 100,
        downMbps: 100,
      },
      fullConfig: {
        server: `${iranServer.ip}:${port}`,
        auth: password,
        tls: { sni: 'bing.com', insecure: true },
        obfs: { type: 'salamander', salamander: { password: obfsPassword } },
        bandwidth: { up: '100 mbps', down: '100 mbps' },
        fastOpen: true,
        lazy: true,
        socks5: { listen: '127.0.0.1:1080' },
        http: { listen: '127.0.0.1:8080' },
      },
      singboxOutbound: {
        type: 'hysteria2',
        tag: `hy2-obfs-${iranServer.name}`,
        server: iranServer.ip,
        server_port: port,
        password,
        obfs: { type: 'salamander', password: obfsPassword },
        tls: { enabled: true, server_name: 'bing.com', insecure: true },
        up_mbps: 100,
        down_mbps: 100,
      },
    };
  }

  // ╔══════════════════════════════════════════════════╗
  // ║           WIREGUARD / OPENVPN / TT              ║
  // ╚══════════════════════════════════════════════════╝

  /**
   * WireGuard configs (two ports)
   */
  static generateWireGuard(user, iranServer, foreignServer) {
    const ports = config.ports.wireguard;
    const configs = [];
    for (const port of ports) {
      const privateKey = crypto.randomBytes(32).toString('base64');
      const publicKey = crypto.randomBytes(32).toString('base64');
      const presharedKey = crypto.randomBytes(32).toString('base64');
      const clientIp = `10.0.${Math.floor(Math.random() * 254) + 1}.${Math.floor(Math.random() * 254) + 1}`;
      const wgConfig = `[Interface]
PrivateKey = ${privateKey}
Address = ${clientIp}/32
DNS = 1.1.1.1, 8.8.8.8
MTU = 1280

[Peer]
PublicKey = ${publicKey}
PresharedKey = ${presharedKey}
AllowedIPs = 0.0.0.0/0, ::/0
Endpoint = ${iranServer.ip}:${port}
PersistentKeepalive = 25`;
      configs.push({
        protocol: 'wireguard',
        name: `WireGuard (${iranServer.name}:${port})`,
        link: `wireguard://${Buffer.from(wgConfig).toString('base64')}#Elahe-WG-${iranServer.name}-${port}`,
        serverIp: iranServer.ip, port, downloadableConfig: wgConfig,
        config: { privateKey, publicKey, presharedKey, clientIp, endpoint: `${iranServer.ip}:${port}` },
      });
    }
    return configs;
  }

  /**
   * OpenVPN configs (two ports)
   */
  static generateOpenVPN(user, iranServer, foreignServer) {
    const ports = config.ports.openvpn;
    const configs = [];
    for (const port of ports) {
      const ovpnConfig = `client
dev tun
proto tcp
remote ${iranServer.ip} ${port}
resolv-retry infinite
nobind
persist-key
persist-tun
remote-cert-tls server
auth SHA256
cipher AES-256-GCM
verb 3
auth-user-pass
<ca>
-----BEGIN CERTIFICATE-----
# CA Certificate will be generated during server setup
-----END CERTIFICATE-----
</ca>`;
      configs.push({
        protocol: 'openvpn',
        name: `OpenVPN (${iranServer.name}:${port})`,
        link: `openvpn://${Buffer.from(ovpnConfig).toString('base64')}`,
        serverIp: iranServer.ip, port, downloadableConfig: ovpnConfig,
        config: { remote: `${iranServer.ip}:${port}`, proto: 'tcp', username: user.username, password: user.uuid },
      });
    }
    return configs;
  }

  /**
   * TrustTunnel (HTTP/3 based)
   */
  static generateTrustTunnel(user, iranServer, foreignServer) {
    const link = `trusttunnel://${user.uuid}@${iranServer.ip}:${config.ports.trusttunnel}?security=tls&alpn=h3&type=quic#Elahe-TT-${iranServer.name}`;
    return {
      protocol: 'trusttunnel',
      name: `TrustTunnel/HTTP3 (${iranServer.name})`,
      link, serverIp: iranServer.ip, port: config.ports.trusttunnel,
      config: { uuid: user.uuid, transport: 'quic', alpn: 'h3' },
    };
  }

  // ╔══════════════════════════════════════════════════╗
  // ║            SUBSCRIPTION GENERATORS               ║
  // ╚══════════════════════════════════════════════════╝

  /**
   * Generate subscription content (base64 encoded links)
   */
  static generateSubscription(user, servers) {
    const allConfigs = this.generateAllConfigs(user, servers);
    const links = allConfigs.map(c => c.link).join('\n');
    return Buffer.from(links).toString('base64');
  }

  /**
   * Generate full Xray JSON config for a user
   */
  static generateXrayConfig(user, servers) {
    const allConfigs = this.generateAllConfigs(user, servers);
    const outbounds = allConfigs
      .filter(c => c.xrayOutbound)
      .map(c => c.xrayOutbound);

    return {
      log: { loglevel: 'warning' },
      inbounds: [
        { port: 1080, listen: '127.0.0.1', protocol: 'socks', settings: { auth: 'noauth', udp: true } },
        { port: 8080, listen: '127.0.0.1', protocol: 'http' },
      ],
      outbounds: outbounds.length > 0 ? outbounds : [{ protocol: 'freedom', tag: 'direct' }],
    };
  }

  /**
   * Generate full Sing-box JSON config for a user
   */
  static generateSingboxConfig(user, servers) {
    const allConfigs = this.generateAllConfigs(user, servers);
    const outbounds = allConfigs
      .filter(c => c.singboxOutbound)
      .map(c => c.singboxOutbound);

    return {
      log: { level: 'warn' },
      inbounds: [
        { type: 'mixed', tag: 'mixed-in', listen: '::', listen_port: 1080 },
      ],
      outbounds: [
        ...outbounds,
        { type: 'direct', tag: 'direct' },
        { type: 'dns', tag: 'dns-out' },
      ],
      route: {
        rules: [
          { protocol: 'dns', outbound: 'dns-out' },
        ],
        final: outbounds[0]?.tag || 'direct',
      },
    };
  }

  /**
   * Generate Hysteria2 standalone client config
   */
  static generateHysteria2ClientConfig(user, servers) {
    const allConfigs = this.generateAllConfigs(user, servers);
    const hy2Configs = allConfigs.filter(c => c.protocol === 'hysteria2' || c.protocol === 'hysteria2-obfs');
    if (hy2Configs.length === 0) return null;
    return hy2Configs[0].fullConfig;
  }
}

module.exports = ConfigGenerator;
