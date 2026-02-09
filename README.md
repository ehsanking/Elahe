<div align="center">

# Elahe Panel

**Advanced Multi-Protocol Tunnel Management System**

[![Version](https://img.shields.io/badge/version-0.0.3-blue.svg)]()
[![License](https://img.shields.io/badge/license-MIT-green.svg)]()
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)]()
[![Developer](https://img.shields.io/badge/developer-EHSANKiNG-purple.svg)]()

```
  ______ _       _            _____                 _
 |  ____| |     | |          |  __ \               | |
 | |__  | | __ _| |__   ___  | |__) |_ _ _ __   ___| |
 |  __| | |/ _` | '_ \ / _ \ |  ___/ _` | '_ \ / _ \ |
 | |____| | (_| | | | |  __/ | |  | (_| | | | |  __/ |
 |______|_|\__,_|_| |_|\___| |_|   \__,_|_| |_|\___|_|
```

</div>

---

## Features

- **Multi-Protocol Support**: VLESS+Reality, VMess, Trojan, Shadowsocks, Hysteria2, WireGuard, OpenVPN
- **Hybrid Config Models**: All combinations (WS, gRPC, TCP, QUIC) for each protocol
- **Autopilot Tunnel Management**: Automatic best-tunnel selection every 10 minutes
- **5 Tunnel Engines**: SSH, FRP, GOST, Chisel, TrustTunnel (HTTP/3)
- **System Resource Monitoring**: CPU, RAM, Disk, Network, Bandwidth in admin panel
- **Iran/Foreign Mode**: Separate deployment for edge and upstream servers
- **Camouflage Website**: Fake DNS service site for Iran mode
- **Domain Management**: Auto-subdomain generation, SSL, check-host.net integration
- **Import/Export**: Marzban and 3x-ui compatible
- **External Panel Support**: Connect to Marzban/3x-ui instances
- **Subscription System**: Base64 links for V2rayNG, Hiddify, Streisand, etc.

---

## Quick Install (One-Liner)

### Iran Server (Edge)

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/ehsanking/Elahe/main/scripts/elahe.sh) install
```

### Foreign Server (Upstream)

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/ehsanking/Elahe/main/scripts/elahe.sh) install
```

> Select **option 2** (Foreign Server) when prompted.

### Interactive Management Menu

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/ehsanking/Elahe/main/scripts/elahe.sh)
```

### Update to Latest Version

```bash
elahe update
```

> The updater automatically detects the latest release from GitHub Releases and downloads it.
> Existing data, configuration, certificates, and logs are preserved during updates.

---

## Manual Installation

### Prerequisites

- **OS**: Ubuntu 20.04+ / Debian 11+ / CentOS 8+ / AlmaLinux 8+
- **CPU**: 1 core minimum (2+ recommended)
- **RAM**: 512MB minimum (1GB+ recommended)
- **Node.js**: 18.x or 20.x
- **Disk**: 1GB free space

### Step 1: Install Dependencies

```bash
# Update system
apt-get update -y && apt-get upgrade -y

# Install required packages
apt-get install -y curl wget git unzip build-essential python3 jq openssl ca-certificates

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Verify
node -v && npm -v
```

### Step 2: Download / Clone

**Option A: Download latest release (recommended)**
```bash
# Get latest release tag
LATEST=$(curl -s https://api.github.com/repos/ehsanking/Elahe/releases/latest | grep tag_name | cut -d'"' -f4)
curl -sL "https://api.github.com/repos/ehsanking/Elahe/tarball/${LATEST}" -o /tmp/elahe.tar.gz
mkdir -p /opt/elahe && tar -xzf /tmp/elahe.tar.gz -C /opt/elahe --strip-components=1
cd /opt/elahe
```

**Option B: Clone from Git**
```bash
git clone https://github.com/ehsanking/Elahe.git /opt/elahe
cd /opt/elahe
```

> **Note**: If `/opt/elahe` already exists from a previous installation, back up your data first:
> ```bash
> cp -a /opt/elahe/data /tmp/elahe-data-backup
> cp -a /opt/elahe/.env /tmp/elahe-env-backup
> rm -rf /opt/elahe
> ```

### Step 3: Install Node.js Dependencies

```bash
npm install --production
```

> **Self-hosted packages**: If you cannot access npm registry, extract the bundled `packages/node_modules.tar.gz`:
> ```bash
> tar -xzf packages/node_modules.tar.gz -C /opt/elahe/
> ```

### Step 4: Configure

```bash
# Create .env file
cat > /opt/elahe/.env << 'EOF'
# Mode: iran or foreign
ELAHE_MODE=iran

# Server
PORT=3000
HOST=0.0.0.0

# Admin Credentials
ADMIN_USER=admin
ADMIN_PASS=CHANGE_ME_TO_STRONG_PASSWORD

# Core Engine: xray or singbox
CORE_ENGINE=xray

# Security (auto-generated if empty)
SESSION_SECRET=
JWT_SECRET=

# Database
DB_PATH=/opt/elahe/data/elahe.db

# Logging
LOG_LEVEL=info
EOF

# Set permissions
chmod 600 /opt/elahe/.env
```

### Step 5: Initialize Database

```bash
cd /opt/elahe
node -e "require('./src/database/migrate').migrate()"
```

### Step 6: Create Systemd Service

```bash
cat > /etc/systemd/system/elahe.service << 'EOF'
[Unit]
Description=Elahe Panel
After=network.target
Documentation=https://github.com/ehsanking/Elahe

[Service]
Type=simple
User=root
WorkingDirectory=/opt/elahe
ExecStart=/usr/bin/node src/core/server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable elahe
systemctl start elahe
```

### Step 7: Open Firewall Ports

```bash
# Panel
ufw allow 3000/tcp

# VLESS/Reality (Port 443)
ufw allow 443/tcp

# TrustTunnel / Trojan (Port 8443)
ufw allow 8443/tcp

# VMess (Port 8080)
ufw allow 8080/tcp

# OpenVPN (Ports 110, 510)
ufw allow 110/tcp
ufw allow 510/tcp

# WireGuard (Ports 1414, 53133)
ufw allow 1414/udp
ufw allow 53133/udp

# Shadowsocks (Port 8388)
ufw allow 8388/tcp

# Hysteria2 (Port 4433)
ufw allow 4433/udp
```

### Step 8: Access Panel

```
Panel:  http://YOUR_IP:3000
Admin:  http://YOUR_IP:3000/admin
```

---

## CLI Management

After installation, use the `elahe` command:

```bash
elahe                  # Interactive menu
elahe status           # Check panel status
elahe restart          # Restart panel
elahe logs             # View live logs
elahe set-domain       # Configure domain & SSL
elahe change-user      # Change admin credentials
elahe update           # Update to latest version
elahe uninstall        # Remove panel
```

---

## Supported Protocols & Config Models

| Protocol | Transport | Port | Status |
|----------|-----------|------|--------|
| VLESS + Reality | TCP (XTLS-Vision) | 443 | Primary |
| VLESS + WS + TLS | WebSocket | 443 | Active |
| VLESS + gRPC + TLS | gRPC | 443 | Active |
| VMess + WS + TLS | WebSocket | 8080 | Active |
| VMess + gRPC + TLS | gRPC | 8080 | Active |
| VMess + TCP | TCP | 8080 | Active |
| Trojan + TCP + TLS | TCP | 8443 | Active |
| Trojan + WS + TLS | WebSocket | 8443 | Active |
| Trojan + gRPC + TLS | gRPC | 8443 | Active |
| Shadowsocks AEAD | TCP | 8388 | Active |
| Shadowsocks 2022 | TCP | 8388 | Active |
| **Hysteria2** | **QUIC** | **4433** | **Active** |
| **Hysteria2 + Obfs** | **QUIC + Salamander** | **4433** | **Active** |
| WireGuard | UDP | 1414, 53133 | Always On |
| OpenVPN | TCP | 110, 510 | Always On |
| TrustTunnel (HTTP/3) | QUIC/HTTP3 | 8443 | Always On |

---

## Tunnel Engines (Autopilot)

| Engine | Transport | Role | Description |
|--------|-----------|------|-------------|
| SSH | TCP | Backup | Encrypted port forwarding |
| FRP | TCP+TLS | Backup | Fast Reverse Proxy |
| GOST | TLS/QUIC | Primary (443) | GO Simple Tunnel |
| Chisel | HTTPS/WS | Backup | HTTP tunnel with TLS |
| TrustTunnel | HTTP/3/QUIC | Secondary (8443) | Camouflage & traffic shaping |

**Autopilot** tests all engines every 10 minutes and automatically selects the best one for port 443.

---

## Port Allocation

```
Port 443   -> VLESS+Reality / Auto-selected tunnel (SSH/FRP/GOST/Chisel)
Port 4433  -> Hysteria2 (UDP/QUIC)
Port 8080  -> VMess
Port 8388  -> Shadowsocks
Port 8443  -> TrustTunnel (HTTP/3) / Trojan
Port 110   -> OpenVPN (always active)
Port 510   -> OpenVPN (always active)
Port 1414  -> WireGuard (always active)
Port 53133 -> WireGuard (always active)
```

---

## System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| CPU | 1 core | 2+ cores |
| RAM | 512 MB | 1 GB+ |
| Disk | 1 GB | 5 GB+ |
| OS | Ubuntu 20.04 | Ubuntu 22.04+ |
| Node.js | 18.x | 20.x |

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/login` | POST | Admin login |
| `/api/auth/captcha` | GET | Get captcha |
| `/api/admin/dashboard` | GET | Dashboard data |
| `/api/admin/system/resources` | GET | System resource monitoring |
| `/api/admin/users` | GET/POST | User management |
| `/api/admin/servers` | GET/POST | Server management |
| `/api/admin/tunnels` | GET/POST | Tunnel management |
| `/api/admin/autopilot/status` | GET | Autopilot status |
| `/api/admin/domains` | GET/POST | Domain management |
| `/api/admin/settings` | GET/PUT | Panel settings |
| `/sub/:token` | GET | Subscription (base64) |
| `/sub/info/:token` | GET | Subscription info page |

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ELAHE_MODE` | `iran` | Server mode: `iran` or `foreign` |
| `PORT` | `3000` | Panel port |
| `ADMIN_USER` | `admin` | Admin username |
| `ADMIN_PASS` | `admin` | Admin password |
| `CORE_ENGINE` | `xray` | Core: `xray` or `singbox` |
| `DB_PATH` | `data/elahe.db` | Database path |
| `SESSION_SECRET` | auto | Session encryption key |
| `JWT_SECRET` | auto | JWT signing key |

---

## Compatible Client Apps

| Platform | Apps |
|----------|------|
| Android | V2rayNG, NekoBox, Hiddify, Streisand |
| iOS | Streisand, V2Box, Shadowrocket |
| Windows | V2rayN, NekoRay, Hiddify |
| macOS | V2rayU, Hiddify |
| Linux | NekoRay, Hiddify |

---

## Developer

**EHSANKiNG**

---

## License

MIT License - See [LICENSE](LICENSE) for details.
