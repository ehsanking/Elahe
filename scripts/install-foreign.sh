#!/bin/bash
# Elahe Panel - Foreign Server Installation Script
# Developer: EHSANKiNG
# Version: 0.0.3

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}"
echo "╔══════════════════════════════════════════════╗"
echo "║     Elahe Panel - Foreign Server Setup       ║"
echo "║     Version: 0.0.3                           ║"
echo "║     Developer: EHSANKiNG                      ║"
echo "╚══════════════════════════════════════════════╝"
echo -e "${NC}"

if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Please run as root${NC}"
  exit 1
fi

echo -e "${YELLOW}[1/7] Updating system...${NC}"
apt-get update -y && apt-get upgrade -y

echo -e "${YELLOW}[2/7] Installing Node.js...${NC}"
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

echo -e "${YELLOW}[3/7] Installing build tools...${NC}"
apt-get install -y build-essential python3 git curl wget unzip

echo -e "${YELLOW}[4/7] Setting up project...${NC}"
INSTALL_DIR="/opt/elahe"
mkdir -p "$INSTALL_DIR"
if [ -d "/home/user/webapp" ] && [ -f "/home/user/webapp/package.json" ]; then
  cp -r /home/user/webapp/* "$INSTALL_DIR/" 2>/dev/null || true
else
  git clone https://github.com/ehsanking/Elahe.git "$INSTALL_DIR" 2>/dev/null || {
    echo -e "${RED}Failed to clone repository.${NC}"
    exit 1
  }
fi
cd "$INSTALL_DIR"

echo -e "${YELLOW}[5/7] Installing dependencies...${NC}"
npm install --production

echo -e "${YELLOW}[6/7] Configuring for foreign mode...${NC}"
cat > "$INSTALL_DIR/.env" << EOF
ELAHE_MODE=foreign
PORT=3000
HOST=0.0.0.0
ADMIN_USER=admin
ADMIN_PASS=$(openssl rand -hex 8)
CORE_ENGINE=xray
SESSION_SECRET=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 64)
DB_PATH=$INSTALL_DIR/data/elahe.db
LOG_LEVEL=info

EN_TITLE=CloudShield DNS
EN_PRIMARY=#0f172a
EN_SECONDARY=#3b82f6
EN_ACCENT=#10b981
EOF

node -e "require('./src/database/migrate').migrate()"

echo -e "${YELLOW}[7/7] Creating systemd service...${NC}"
cat > /etc/systemd/system/elahe.service << EOF
[Unit]
Description=Elahe Panel (Foreign)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/node src/core/server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable elahe
systemctl start elahe

if command -v ufw &> /dev/null; then
  ufw allow 3000/tcp
  ufw allow 443/tcp
  ufw allow 8443/tcp
  ufw allow 8080/tcp
  ufw allow 1414/udp
  ufw allow 53133/udp
fi

ADMIN_PASS=$(grep ADMIN_PASS "$INSTALL_DIR/.env" | cut -d'=' -f2)

echo -e "${GREEN}"
echo "╔══════════════════════════════════════════════╗"
echo "║     Foreign Server Installation Complete!     ║"
echo "╠══════════════════════════════════════════════╣"
echo "║  Panel: http://$(hostname -I | awk '{print $1}'):3000"
echo "║  Admin: http://$(hostname -I | awk '{print $1}'):3000/admin"
echo "║  User:  admin"
echo "║  Pass:  $ADMIN_PASS"
echo "╠══════════════════════════════════════════════╣"
echo "║  Service: systemctl status elahe              ║"
echo "║  Logs:    journalctl -u elahe -f              ║"
echo "╚══════════════════════════════════════════════╝"
echo -e "${NC}"
