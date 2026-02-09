#!/bin/bash
# Elahe Panel - Iran Server Installation Script
# Developer: EHSANKiNG
# Version: 0.0.3

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}"
echo "╔══════════════════════════════════════════╗"
echo "║     Elahe Panel - Iran Server Setup      ║"
echo "║     Version: 0.0.3                       ║"
echo "║     Developer: EHSANKiNG                  ║"
echo "╚══════════════════════════════════════════╝"
echo -e "${NC}"

# Check root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Please run as root${NC}"
  exit 1
fi

# Update system
echo -e "${YELLOW}[1/7] Updating system...${NC}"
apt-get update -y && apt-get upgrade -y

# Install Node.js
echo -e "${YELLOW}[2/7] Installing Node.js...${NC}"
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
echo -e "${GREEN}Node.js $(node -v) installed${NC}"

# Install build tools
echo -e "${YELLOW}[3/7] Installing build tools...${NC}"
apt-get install -y build-essential python3 git curl wget unzip

# Clone/download project
echo -e "${YELLOW}[4/7] Setting up project...${NC}"
INSTALL_DIR="/opt/elahe"
mkdir -p "$INSTALL_DIR"
# Clone from GitHub or copy local
if [ -d "/home/user/webapp" ] && [ -f "/home/user/webapp/package.json" ]; then
  cp -r /home/user/webapp/* "$INSTALL_DIR/" 2>/dev/null || true
else
  git clone https://github.com/ehsanking/Elahe.git "$INSTALL_DIR" 2>/dev/null || {
    echo -e "${RED}Failed to clone repository. Please check your network.${NC}"
    exit 1
  }
fi

cd "$INSTALL_DIR"

# Install dependencies
echo -e "${YELLOW}[5/7] Installing dependencies...${NC}"
npm install --production

# Configure
echo -e "${YELLOW}[6/7] Configuring...${NC}"
cat > "$INSTALL_DIR/.env" << EOF
ELAHE_MODE=iran
PORT=3000
HOST=0.0.0.0
ADMIN_USER=admin
ADMIN_PASS=$(openssl rand -hex 8)
CORE_ENGINE=xray
SESSION_SECRET=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 64)
DB_PATH=$INSTALL_DIR/data/elahe.db
LOG_LEVEL=info
EOF

# Initialize database
node -e "require('./src/database/migrate').migrate()"

# Setup systemd service
echo -e "${YELLOW}[7/7] Creating systemd service...${NC}"
cat > /etc/systemd/system/elahe.service << EOF
[Unit]
Description=Elahe Panel
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

# Open firewall ports
echo -e "${YELLOW}Opening firewall ports...${NC}"
if command -v ufw &> /dev/null; then
  ufw allow 3000/tcp
  ufw allow 443/tcp
  ufw allow 8443/tcp
  ufw allow 8080/tcp
  ufw allow 110/tcp
  ufw allow 510/tcp
  ufw allow 1414/udp
  ufw allow 53133/udp
  ufw allow 8388/tcp
  ufw allow 4433/udp
fi

# Get admin password
ADMIN_PASS=$(grep ADMIN_PASS "$INSTALL_DIR/.env" | cut -d'=' -f2)

echo -e "${GREEN}"
echo "╔══════════════════════════════════════════╗"
echo "║     Installation Complete!               ║"
echo "╠══════════════════════════════════════════╣"
echo "║  Panel: http://$(hostname -I | awk '{print $1}'):3000"
echo "║  Admin: http://$(hostname -I | awk '{print $1}'):3000/admin"
echo "║  User:  admin"
echo "║  Pass:  $ADMIN_PASS"
echo "╠══════════════════════════════════════════╣"
echo "║  Service: systemctl status elahe         ║"
echo "║  Logs:    journalctl -u elahe -f         ║"
echo "╚══════════════════════════════════════════╝"
echo -e "${NC}"
