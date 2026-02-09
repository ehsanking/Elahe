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

INSTALL_DIR="/opt/elahe"
GIT_REPO="https://github.com/ehsanking/Elahe.git"
GITHUB_API="https://api.github.com/repos/ehsanking/Elahe"

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
apt-get install -y build-essential python3 git curl wget unzip jq

# Setup project with smart directory handling
echo -e "${YELLOW}[4/7] Setting up project...${NC}"

# Stop existing service if running
systemctl stop elahe 2>/dev/null || true

setup_project() {
  # Backup existing data if present
  local backup_dir=""
  if [ -d "$INSTALL_DIR" ] && [ "$(ls -A "$INSTALL_DIR" 2>/dev/null)" ]; then
    echo -e "${YELLOW}[INFO] Existing installation found at $INSTALL_DIR${NC}"
    backup_dir="/tmp/elahe-backup-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$backup_dir"
    # Backup data, config, certs, logs
    [ -d "$INSTALL_DIR/data" ] && cp -a "$INSTALL_DIR/data" "$backup_dir/data" 2>/dev/null || true
    [ -f "$INSTALL_DIR/.env" ] && cp -a "$INSTALL_DIR/.env" "$backup_dir/.env" 2>/dev/null || true
    [ -d "$INSTALL_DIR/certs" ] && cp -a "$INSTALL_DIR/certs" "$backup_dir/certs" 2>/dev/null || true
    [ -d "$INSTALL_DIR/logs" ] && cp -a "$INSTALL_DIR/logs" "$backup_dir/logs" 2>/dev/null || true
    echo -e "${GREEN}[OK] Data backed up to $backup_dir${NC}"
  fi

  # --- Try local dev copy first ---
  if [ -d "/home/user/webapp" ] && [ -f "/home/user/webapp/package.json" ]; then
    echo -e "${BLUE}[INFO] Copying from local development directory...${NC}"
    # Clean code files, preserve structure
    if [ -d "$INSTALL_DIR" ]; then
      find "$INSTALL_DIR" -maxdepth 1 -mindepth 1 \
        ! -name 'data' ! -name 'certs' ! -name 'logs' ! -name '.env' ! -name 'node_modules' \
        -exec rm -rf {} + 2>/dev/null || true
    fi
    mkdir -p "$INSTALL_DIR"
    cp -a /home/user/webapp/* "$INSTALL_DIR/" 2>/dev/null || true
    cp -a /home/user/webapp/.gitignore "$INSTALL_DIR/" 2>/dev/null || true
    _restore_backup "$backup_dir"
    return 0
  fi

  # --- Try latest GitHub release ---
  echo -e "${BLUE}[INFO] Checking for latest release on GitHub...${NC}"
  local release_info
  release_info=$(curl -s --connect-timeout 10 "${GITHUB_API}/releases/latest" 2>/dev/null || echo "")
  local tarball_url=""

  if [ -n "$release_info" ] && echo "$release_info" | jq -e '.tag_name' &>/dev/null; then
    local tag
    tag=$(echo "$release_info" | jq -r '.tag_name')
    tarball_url=$(echo "$release_info" | jq -r '.tarball_url // empty')
    echo -e "${GREEN}[OK] Found release: $tag${NC}"
  fi

  if [ -n "$tarball_url" ]; then
    echo -e "${BLUE}[INFO] Downloading release archive...${NC}"
    local tmp_dir
    tmp_dir=$(mktemp -d)
    if curl -sL --connect-timeout 30 -o "${tmp_dir}/release.tar.gz" "$tarball_url" 2>/dev/null; then
      tar -xzf "${tmp_dir}/release.tar.gz" -C "$tmp_dir" 2>/dev/null
      local extracted
      extracted=$(find "$tmp_dir" -maxdepth 1 -mindepth 1 -type d | head -1)
      if [ -n "$extracted" ] && [ -f "${extracted}/package.json" ]; then
        # Clean existing code
        if [ -d "$INSTALL_DIR" ]; then
          find "$INSTALL_DIR" -maxdepth 1 -mindepth 1 \
            ! -name 'data' ! -name 'certs' ! -name 'logs' ! -name '.env' ! -name 'node_modules' \
            -exec rm -rf {} + 2>/dev/null || true
        fi
        mkdir -p "$INSTALL_DIR"
        cp -a "${extracted}"/* "$INSTALL_DIR/" 2>/dev/null || true
        cp -a "${extracted}"/.* "$INSTALL_DIR/" 2>/dev/null || true
        rm -rf "$tmp_dir"
        _restore_backup "$backup_dir"
        echo -e "${GREEN}[OK] Installed from release${NC}"
        return 0
      fi
    fi
    rm -rf "$tmp_dir"
  fi

  # --- Fallback: git clone ---
  echo -e "${BLUE}[INFO] Falling back to git clone...${NC}"

  # If it's already a git repo, pull instead
  if [ -d "$INSTALL_DIR/.git" ]; then
    echo -e "${BLUE}[INFO] Pulling latest changes...${NC}"
    cd "$INSTALL_DIR"
    git fetch origin 2>/dev/null || true
    git reset --hard origin/main 2>/dev/null || git pull 2>/dev/null || true
    _restore_backup "$backup_dir"
    return 0
  fi

  # Clean directory completely for fresh clone
  if [ -d "$INSTALL_DIR" ]; then
    rm -rf "${INSTALL_DIR:?}"/*
    rm -rf "$INSTALL_DIR"/.* 2>/dev/null || true
    rmdir "$INSTALL_DIR" 2>/dev/null || true
  fi

  git clone "$GIT_REPO" "$INSTALL_DIR" 2>/dev/null || {
    echo -e "${RED}[ERROR] Git clone failed. Please check network and try again.${NC}"
    # Restore data if we have backup
    mkdir -p "$INSTALL_DIR"
    _restore_backup "$backup_dir"
    exit 1
  }

  _restore_backup "$backup_dir"
  return 0
}

_restore_backup() {
  local bdir="$1"
  if [ -n "$bdir" ] && [ -d "$bdir" ]; then
    echo -e "${BLUE}[INFO] Restoring backed up data...${NC}"
    [ -d "${bdir}/data" ] && cp -a "${bdir}/data" "$INSTALL_DIR/" 2>/dev/null || true
    [ -f "${bdir}/.env" ] && cp -a "${bdir}/.env" "$INSTALL_DIR/.env" 2>/dev/null || true
    [ -d "${bdir}/certs" ] && cp -a "${bdir}/certs" "$INSTALL_DIR/" 2>/dev/null || true
    [ -d "${bdir}/logs" ] && cp -a "${bdir}/logs" "$INSTALL_DIR/" 2>/dev/null || true
    rm -rf "$bdir"
    echo -e "${GREEN}[OK] Data restored${NC}"
  fi
}

setup_project

cd "$INSTALL_DIR"

# Install dependencies
echo -e "${YELLOW}[5/7] Installing dependencies...${NC}"
npm install --production

# Configure (only if .env doesn't exist)
echo -e "${YELLOW}[6/7] Configuring...${NC}"
if [ ! -f "$INSTALL_DIR/.env" ]; then
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
SSL_ENABLED=auto
SSL_CERT=$INSTALL_DIR/certs/fullchain.pem
SSL_KEY=$INSTALL_DIR/certs/privkey.pem
LOG_LEVEL=info
EOF
  echo -e "${GREEN}[OK] New configuration created${NC}"
else
  echo -e "${GREEN}[OK] Using existing configuration${NC}"
fi

# Initialize database
mkdir -p "$INSTALL_DIR/data" "$INSTALL_DIR/certs" "$INSTALL_DIR/logs"
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
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable elahe
systemctl start elahe

# Install CLI command
cat > /usr/local/bin/elahe << 'CLIEOF'
#!/bin/bash
exec bash /opt/elahe/scripts/elahe.sh "$@"
CLIEOF
chmod +x /usr/local/bin/elahe

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
echo "║  CLI:     elahe                           ║"
echo "║  Service: systemctl status elahe         ║"
echo "║  Logs:    journalctl -u elahe -f         ║"
echo "╚══════════════════════════════════════════╝"
echo -e "${NC}"
echo -e "${YELLOW}To enable HTTPS: run 'elahe set-domain' to configure SSL${NC}"
