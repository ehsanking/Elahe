#!/bin/bash
# ══════════════════════════════════════════════════════════════
# Elahe Panel - Unified Installer & Management CLI
# Developer: EHSANKiNG
# Version: 0.0.3
# ══════════════════════════════════════════════════════════════

set -euo pipefail

VERSION="0.0.3"
INSTALL_DIR="/opt/elahe"
DATA_DIR="$INSTALL_DIR/data"
CERTS_DIR="$INSTALL_DIR/certs"
LOGS_DIR="$INSTALL_DIR/logs"
ENV_FILE="$INSTALL_DIR/.env"
SERVICE_NAME="elahe"
GIT_REPO="https://github.com/ehsanking/Elahe.git"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
WHITE='\033[1;37m'
NC='\033[0m'
BOLD='\033[1m'

# ══════════════════ UTILITY FUNCTIONS ══════════════════

log_info()  { echo -e "${BLUE}[INFO]${NC} $1"; }
log_ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_err()   { echo -e "${RED}[ERROR]${NC} $1"; }

banner() {
  echo -e "${CYAN}"
  echo '  ______ _       _            _____                 _ '
  echo ' |  ____| |     | |          |  __ \               | |'
  echo ' | |__  | | __ _| |__   ___  | |__) |_ _ _ __   ___| |'
  echo ' |  __| | |/ _` |  _ \ / _ \ |  ___/ _` |  _ \ / _ \ |'
  echo ' | |____| | (_| | | | |  __/ | |  | (_| | | | |  __/ |'
  echo ' |______|_|\__,_|_| |_|\___| |_|   \__,_|_| |_|\___|_|'
  echo ""
  echo -e " ${WHITE}Version: ${VERSION}  |  Developer: EHSANKiNG${NC}"
  echo -e "${CYAN} ══════════════════════════════════════════════════${NC}"
  echo ""
}

ask() {
  local prompt="$1"
  local default="$2"
  local var_name="$3"
  local answer
  if [ -n "$default" ]; then
    read -rp "$(echo -e "${MAGENTA}$prompt ${YELLOW}[$default]${NC}: ")" answer
    eval "$var_name='${answer:-$default}'"
  else
    read -rp "$(echo -e "${MAGENTA}$prompt${NC}: ")" answer
    eval "$var_name='$answer'"
  fi
}

ask_yn() {
  local prompt="$1"
  local default="${2:-y}"
  local answer
  read -rp "$(echo -e "${MAGENTA}$prompt ${YELLOW}[${default}]${NC}: ")" answer
  answer="${answer:-$default}"
  [[ "$answer" =~ ^[Yy]$ ]]
}

check_root() {
  if [ "$EUID" -ne 0 ]; then
    log_err "This script must be run as root. Use: sudo bash elahe.sh"
    exit 1
  fi
}

# ══════════════════ SYSTEM DETECTION ══════════════════

detect_os() {
  if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS_NAME="$ID"
    OS_VERSION="$VERSION_ID"
    OS_PRETTY="$PRETTY_NAME"
  elif [ -f /etc/redhat-release ]; then
    OS_NAME="centos"
    OS_VERSION=$(cat /etc/redhat-release | grep -oP '[0-9]+' | head -1)
    OS_PRETTY=$(cat /etc/redhat-release)
  else
    OS_NAME="unknown"
    OS_VERSION="unknown"
    OS_PRETTY="Unknown Linux"
  fi
  
  ARCH=$(uname -m)
  case "$ARCH" in
    x86_64|amd64) ARCH_TYPE="amd64" ;;
    aarch64|arm64) ARCH_TYPE="arm64" ;;
    armv7l|armhf)  ARCH_TYPE="armv7" ;;
    *)             ARCH_TYPE="$ARCH" ;;
  esac

  KERNEL=$(uname -r)
  TOTAL_RAM=$(free -m 2>/dev/null | awk '/^Mem:/{print $2}' || echo "N/A")
  CPU_CORES=$(nproc 2>/dev/null || echo "N/A")
  
  echo -e "${WHITE}System Information:${NC}"
  echo -e "  OS:           ${GREEN}$OS_PRETTY${NC}"
  echo -e "  Architecture: ${GREEN}$ARCH ($ARCH_TYPE)${NC}"
  echo -e "  Kernel:       ${GREEN}$KERNEL${NC}"
  echo -e "  RAM:          ${GREEN}${TOTAL_RAM}MB${NC}"
  echo -e "  CPU Cores:    ${GREEN}$CPU_CORES${NC}"
  echo ""
}

get_pkg_manager() {
  if command -v apt-get &>/dev/null; then
    PKG_MGR="apt"
    PKG_INSTALL="apt-get install -y"
    PKG_UPDATE="apt-get update -y"
    PKG_UPGRADE="apt-get upgrade -y"
  elif command -v dnf &>/dev/null; then
    PKG_MGR="dnf"
    PKG_INSTALL="dnf install -y"
    PKG_UPDATE="dnf check-update || true"
    PKG_UPGRADE="dnf upgrade -y"
  elif command -v yum &>/dev/null; then
    PKG_MGR="yum"
    PKG_INSTALL="yum install -y"
    PKG_UPDATE="yum check-update || true"
    PKG_UPGRADE="yum upgrade -y"
  elif command -v pacman &>/dev/null; then
    PKG_MGR="pacman"
    PKG_INSTALL="pacman -S --noconfirm"
    PKG_UPDATE="pacman -Sy"
    PKG_UPGRADE="pacman -Syu --noconfirm"
  elif command -v apk &>/dev/null; then
    PKG_MGR="apk"
    PKG_INSTALL="apk add"
    PKG_UPDATE="apk update"
    PKG_UPGRADE="apk upgrade"
  else
    log_err "No supported package manager found"
    exit 1
  fi
  log_info "Package manager: $PKG_MGR"
}

# ══════════════════ PACKAGE INSTALLATION WITH MIRROR FALLBACK ══════════════════

install_pkg() {
  local pkg="$1"
  local attempt=0
  local max_attempts=3
  
  while [ $attempt -lt $max_attempts ]; do
    attempt=$((attempt + 1))
    log_info "Installing $pkg (attempt $attempt/$max_attempts)..."
    
    if $PKG_INSTALL "$pkg" 2>/dev/null; then
      log_ok "$pkg installed successfully"
      return 0
    fi
    
    if [ $attempt -lt $max_attempts ]; then
      log_warn "Failed to install $pkg. This might be due to sanctions/restrictions."
      echo -e "${YELLOW}Options:${NC}"
      echo "  1) Retry with current repository"
      echo "  2) Enter a custom mirror URL"
      echo "  3) Skip this package"
      local choice
      read -rp "Choice [1]: " choice
      choice="${choice:-1}"
      
      case "$choice" in
        2)
          setup_custom_mirror
          $PKG_UPDATE 2>/dev/null || true
          ;;
        3)
          log_warn "Skipping $pkg"
          return 1
          ;;
        *)
          ;;
      esac
    fi
  done
  
  log_err "Failed to install $pkg after $max_attempts attempts"
  return 1
}

setup_custom_mirror() {
  local mirror_url
  ask "Enter mirror URL (e.g., http://mirror.example.com/ubuntu)" "" mirror_url
  
  if [ -z "$mirror_url" ]; then
    log_warn "No mirror URL provided, skipping"
    return
  fi

  case "$PKG_MGR" in
    apt)
      log_info "Backing up /etc/apt/sources.list..."
      cp /etc/apt/sources.list /etc/apt/sources.list.bak.elahe 2>/dev/null || true
      
      # Detect Ubuntu/Debian codename
      local codename
      codename=$(lsb_release -cs 2>/dev/null || echo "jammy")
      
      cat > /etc/apt/sources.list << MIRROR_EOF
deb $mirror_url $codename main restricted universe multiverse
deb $mirror_url $codename-updates main restricted universe multiverse
deb $mirror_url $codename-security main restricted universe multiverse
MIRROR_EOF
      log_ok "Mirror configured: $mirror_url"
      ;;
    dnf|yum)
      log_info "Adding custom mirror for DNF/YUM..."
      cat > /etc/yum.repos.d/elahe-custom.repo << MIRROR_EOF
[elahe-custom]
name=Elahe Custom Mirror
baseurl=$mirror_url
enabled=1
gpgcheck=0
MIRROR_EOF
      log_ok "Custom YUM/DNF mirror configured"
      ;;
    *)
      log_warn "Custom mirror not supported for $PKG_MGR automatically."
      log_info "Please configure the mirror manually and retry."
      ;;
  esac
}

install_all_packages() {
  local server_mode="$1"
  
  log_info "Updating package lists..."
  $PKG_UPDATE 2>/dev/null || {
    log_warn "Package update failed. Trying to continue..."
  }
  
  if ask_yn "Upgrade all system packages first?" "y"; then
    log_info "Upgrading system..."
    $PKG_UPGRADE 2>/dev/null || log_warn "Some packages failed to upgrade"
    log_ok "System upgraded"
  fi
  
  # Common packages for all modes
  local COMMON_PKGS="curl wget git unzip jq openssl ca-certificates gnupg lsb-release"
  
  # Iran-specific packages (extra tools for tunneling)
  local IRAN_PKGS="$COMMON_PKGS build-essential python3 socat cron iptables net-tools dnsutils"
  
  # Foreign-specific packages (core + tunnel endpoints)
  local FOREIGN_PKGS="$COMMON_PKGS build-essential python3 socat cron iptables net-tools dnsutils certbot"
  
  local PKGS
  if [ "$server_mode" = "iran" ]; then
    PKGS="$IRAN_PKGS"
  else
    PKGS="$FOREIGN_PKGS"
  fi
  
  for pkg in $PKGS; do
    if command -v "$pkg" &>/dev/null 2>&1 || dpkg -s "$pkg" &>/dev/null 2>&1 || rpm -q "$pkg" &>/dev/null 2>&1; then
      log_ok "$pkg already installed"
    else
      install_pkg "$pkg" || log_warn "Could not install $pkg, continuing..."
    fi
  done
  
  # Install Node.js
  install_nodejs
  
  log_ok "All required packages installed"
}

install_nodejs() {
  if command -v node &>/dev/null; then
    local node_ver
    node_ver=$(node -v 2>/dev/null || echo "")
    log_ok "Node.js $node_ver already installed"
    return 0
  fi
  
  log_info "Installing Node.js 20.x..."
  
  case "$PKG_MGR" in
    apt)
      if ! curl -fsSL https://deb.nodesource.com/setup_20.x 2>/dev/null | bash - 2>/dev/null; then
        log_warn "NodeSource setup failed. Trying alternative method..."
        # Fallback: snap or direct binary
        if command -v snap &>/dev/null; then
          snap install node --classic --channel=20 2>/dev/null || true
        fi
        
        if ! command -v node &>/dev/null; then
          log_warn "Alternative install also failed."
          ask "Enter Node.js mirror URL (or press Enter to download directly)" "" node_mirror
          if [ -n "$node_mirror" ]; then
            curl -fsSL "${node_mirror}/setup_20.x" | bash - 2>/dev/null || true
          else
            # Direct binary download
            local node_url="https://nodejs.org/dist/v20.11.0/node-v20.11.0-linux-${ARCH_TYPE}.tar.xz"
            log_info "Downloading Node.js from $node_url..."
            wget -q "$node_url" -O /tmp/node.tar.xz 2>/dev/null || {
              log_err "Cannot download Node.js. Please install Node.js 20+ manually and rerun."
              exit 1
            }
            tar -xf /tmp/node.tar.xz -C /usr/local --strip-components=1
            rm -f /tmp/node.tar.xz
          fi
        fi
      fi
      $PKG_INSTALL nodejs 2>/dev/null || true
      ;;
    dnf|yum)
      curl -fsSL https://rpm.nodesource.com/setup_20.x | bash - 2>/dev/null || true
      $PKG_INSTALL nodejs 2>/dev/null || true
      ;;
    *)
      log_warn "Please install Node.js 20+ manually for $PKG_MGR"
      ;;
  esac
  
  if command -v node &>/dev/null; then
    log_ok "Node.js $(node -v) installed"
  else
    log_err "Node.js installation failed. Please install manually."
    exit 1
  fi
}

# ══════════════════ DOMAIN & SSL ══════════════════

setup_domain() {
  local mode="$1"
  
  echo ""
  echo -e "${WHITE}════════════ Domain Configuration ════════════${NC}"
  echo ""
  
  ask "Enter your main domain (e.g., example.com)" "" MAIN_DOMAIN
  
  if [ -z "$MAIN_DOMAIN" ]; then
    log_warn "No domain provided. Using IP-only mode."
    MAIN_DOMAIN=""
    return
  fi
  
  # Verify domain resolution
  log_info "Checking domain DNS resolution..."
  local server_ip
  server_ip=$(curl -s4 ifconfig.me 2>/dev/null || curl -s4 icanhazip.com 2>/dev/null || hostname -I | awk '{print $1}')
  local domain_ip
  domain_ip=$(dig +short "$MAIN_DOMAIN" A 2>/dev/null | head -1 || nslookup "$MAIN_DOMAIN" 2>/dev/null | awk '/Address:/{a=$2}END{print a}' || echo "")
  
  if [ -n "$domain_ip" ] && [ "$domain_ip" = "$server_ip" ]; then
    log_ok "Domain $MAIN_DOMAIN resolves to this server ($server_ip)"
  else
    log_warn "Domain $MAIN_DOMAIN resolves to $domain_ip but this server is $server_ip"
    log_warn "Make sure DNS A record points to $server_ip before getting SSL"
  fi
  
  # Generate 10 meaningful, non-suspicious subdomains
  generate_subdomains "$MAIN_DOMAIN" "$mode"
  
  # Get SSL certificate
  if ask_yn "Get SSL certificate for domain and subdomains?" "y"; then
    setup_ssl "$MAIN_DOMAIN"
  fi
  
  # Save domain config
  if [ -f "$ENV_FILE" ]; then
    sed -i "/^DOMAIN=/d" "$ENV_FILE"
    sed -i "/^IR_DOMAIN=/d" "$ENV_FILE"
    sed -i "/^EN_DOMAIN=/d" "$ENV_FILE"
    sed -i "/^SSL_CERT=/d" "$ENV_FILE"
    sed -i "/^SSL_KEY=/d" "$ENV_FILE"
    sed -i "/^SUBDOMAINS=/d" "$ENV_FILE"
    
    echo "DOMAIN=$MAIN_DOMAIN" >> "$ENV_FILE"
    if [ "$mode" = "iran" ]; then
      echo "IR_DOMAIN=$MAIN_DOMAIN" >> "$ENV_FILE"
    else
      echo "EN_DOMAIN=$MAIN_DOMAIN" >> "$ENV_FILE"
    fi
    echo "SSL_CERT=$CERTS_DIR/fullchain.pem" >> "$ENV_FILE"
    echo "SSL_KEY=$CERTS_DIR/privkey.pem" >> "$ENV_FILE"
    echo "SUBDOMAINS=${SUBDOMAINS_LIST:-}" >> "$ENV_FILE"
  fi
}

generate_subdomains() {
  local domain="$1"
  local mode="$2"
  
  echo ""
  log_info "Generating 10 meaningful subdomains for $domain..."
  
  # Non-suspicious subdomain names that look like legitimate services
  local -a SUBDOMAIN_NAMES
  if [ "$mode" = "iran" ]; then
    SUBDOMAIN_NAMES=(
      "cdn"           # Content Delivery Network - very common
      "api"           # API endpoint - standard
      "mail"          # Mail server - expected
      "cloud"         # Cloud services - normal
      "portal"        # Web portal - common
      "app"           # Application endpoint - standard
      "data"          # Data services - normal
      "auth"          # Authentication service - common
      "static"        # Static content server - standard
      "media"         # Media hosting - normal
    )
  else
    SUBDOMAIN_NAMES=(
      "ns1"           # Nameserver - expected for DNS company
      "ns2"           # Secondary nameserver
      "api"           # API endpoint
      "dashboard"     # Dashboard
      "docs"          # Documentation
      "status"        # Status page
      "cdn"           # CDN endpoint
      "resolver"      # DNS resolver
      "analytics"     # Analytics service
      "support"       # Support portal
    )
  fi
  
  SUBDOMAINS_LIST=""
  local -a FULL_SUBDOMAINS=()
  
  for sub in "${SUBDOMAIN_NAMES[@]}"; do
    local full_sub="${sub}.${domain}"
    FULL_SUBDOMAINS+=("$full_sub")
    if [ -n "$SUBDOMAINS_LIST" ]; then
      SUBDOMAINS_LIST="${SUBDOMAINS_LIST},${full_sub}"
    else
      SUBDOMAINS_LIST="$full_sub"
    fi
    echo -e "  ${GREEN}+${NC} $full_sub"
  done
  
  echo ""
  log_ok "Generated ${#FULL_SUBDOMAINS[@]} subdomains"
  
  # Save subdomains to config
  mkdir -p "$DATA_DIR"
  printf '%s\n' "${FULL_SUBDOMAINS[@]}" > "$DATA_DIR/subdomains.txt"
  
  log_info "Note: Please create DNS A records for all subdomains pointing to your server IP"
  echo -e "  ${YELLOW}Server IP: $(curl -s4 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')${NC}"
}

setup_ssl() {
  local domain="$1"
  
  echo ""
  log_info "Setting up SSL certificates..."
  mkdir -p "$CERTS_DIR"
  
  # Install certbot if not available
  if ! command -v certbot &>/dev/null; then
    log_info "Installing certbot..."
    install_pkg certbot || {
      # Try snap
      if command -v snap &>/dev/null; then
        snap install certbot --classic 2>/dev/null || true
      fi
      # Try pip
      if ! command -v certbot &>/dev/null; then
        pip3 install certbot 2>/dev/null || true
      fi
    }
  fi
  
  if ! command -v certbot &>/dev/null; then
    log_warn "Certbot not available. Generating self-signed certificate..."
    generate_self_signed "$domain"
    return
  fi
  
  # Stop any web servers on port 80
  fuser -k 80/tcp 2>/dev/null || true
  sleep 1
  
  # Build domain list for certbot
  local certbot_domains="-d $domain"
  if [ -f "$DATA_DIR/subdomains.txt" ]; then
    while IFS= read -r subdomain; do
      certbot_domains="$certbot_domains -d $subdomain"
    done < "$DATA_DIR/subdomains.txt"
  fi
  
  # Try getting certificate
  log_info "Requesting SSL certificate from Let's Encrypt..."
  if certbot certonly --standalone $certbot_domains --agree-tos --non-interactive --email "admin@${domain}" 2>/dev/null; then
    # Copy certs to our directory
    local cert_dir="/etc/letsencrypt/live/$domain"
    cp "$cert_dir/fullchain.pem" "$CERTS_DIR/fullchain.pem"
    cp "$cert_dir/privkey.pem" "$CERTS_DIR/privkey.pem"
    
    # Setup auto-renewal cron
    (crontab -l 2>/dev/null; echo "0 0 1 * * certbot renew --quiet && cp /etc/letsencrypt/live/$domain/fullchain.pem $CERTS_DIR/ && cp /etc/letsencrypt/live/$domain/privkey.pem $CERTS_DIR/ && systemctl restart $SERVICE_NAME") | crontab -
    
    log_ok "SSL certificate obtained and auto-renewal configured"
  else
    log_warn "Let's Encrypt failed (port 80 might be blocked or domain not resolving)"
    log_info "Generating self-signed certificate as fallback..."
    generate_self_signed "$domain"
  fi
}

generate_self_signed() {
  local domain="$1"
  
  # Build SAN entries
  local san="DNS:${domain}"
  if [ -f "$DATA_DIR/subdomains.txt" ]; then
    while IFS= read -r subdomain; do
      san="${san},DNS:${subdomain}"
    done < "$DATA_DIR/subdomains.txt"
  fi
  
  openssl req -x509 -newkey rsa:4096 -keyout "$CERTS_DIR/privkey.pem" -out "$CERTS_DIR/fullchain.pem" \
    -sha256 -days 365 -nodes \
    -subj "/C=DE/ST=Hessen/L=Frankfurt/O=CloudShield/CN=$domain" \
    -addext "subjectAltName=$san" 2>/dev/null
  
  log_ok "Self-signed certificate generated (valid 365 days)"
}

# ══════════════════ CHECK-HOST API INTEGRATION ══════════════════

check_domain_accessibility() {
  local domain="$1"
  
  echo ""
  log_info "Checking domain accessibility from Iran using check-host.net API..."
  
  local check_url="https://check-host.net/check-http?host=https://${domain}&max_nodes=10"
  
  local result
  result=$(curl -s -H "Accept: application/json" "$check_url" 2>/dev/null || echo "")
  
  if [ -z "$result" ]; then
    log_warn "Could not reach check-host.net API. Skipping accessibility check."
    return
  fi
  
  local request_id
  request_id=$(echo "$result" | jq -r '.request_id // empty' 2>/dev/null || echo "")
  
  if [ -z "$request_id" ]; then
    log_warn "Invalid check-host response. Skipping."
    return
  fi
  
  log_info "Check initiated (ID: $request_id). Waiting for results..."
  sleep 8
  
  local check_result
  check_result=$(curl -s "https://check-host.net/check-result/$request_id" -H "Accept: application/json" 2>/dev/null || echo "")
  
  if [ -z "$check_result" ]; then
    log_warn "Could not get check results."
    return
  fi
  
  echo ""
  echo -e "${WHITE}Domain Accessibility Results:${NC}"
  echo "$check_result" | jq -r 'to_entries[] | select(.value != null) | "\(.key): \(if .value[0][0] == 1 then "ACCESSIBLE" elif .value[0][0] == 0 then "BLOCKED/ERROR" else "UNKNOWN" end)"' 2>/dev/null || {
    echo "$check_result" | head -20
  }
  echo ""
  
  # Check if any Iran node reports blocked
  local iran_blocked
  iran_blocked=$(echo "$check_result" | jq -r 'to_entries[] | select(.key | test("ir[0-9]")) | select(.value[0][0] != 1) | .key' 2>/dev/null || echo "")
  
  if [ -n "$iran_blocked" ]; then
    log_warn "Domain may be BLOCKED in Iran from some nodes: $iran_blocked"
    log_info "Consider using alternative subdomains or CDN."
  else
    log_ok "Domain appears accessible from available check nodes"
  fi
}

# ══════════════════ INSTALLATION ══════════════════

do_install() {
  banner
  check_root
  detect_os
  get_pkg_manager
  
  # Ask server mode
  echo -e "${WHITE}════════════ Server Configuration ════════════${NC}"
  echo ""
  echo -e "  ${CYAN}1)${NC} Iran Server (Edge/Camouflage)"
  echo -e "  ${CYAN}2)${NC} Foreign Server (Upstream/DNS)"
  echo ""
  local mode_choice
  ask "Select server type" "1" mode_choice
  
  local SERVER_MODE
  case "$mode_choice" in
    2) SERVER_MODE="foreign" ;;
    *) SERVER_MODE="iran" ;;
  esac
  
  log_info "Selected mode: ${GREEN}$SERVER_MODE${NC}"
  echo ""
  
  # Install packages
  echo -e "${WHITE}════════════ Package Installation ════════════${NC}"
  install_all_packages "$SERVER_MODE"
  
  # Setup project
  echo ""
  echo -e "${WHITE}════════════ Project Setup ════════════${NC}"
  mkdir -p "$INSTALL_DIR" "$DATA_DIR" "$CERTS_DIR" "$LOGS_DIR"
  
  if [ -d "/home/user/webapp" ] && [ -f "/home/user/webapp/package.json" ]; then
    log_info "Copying from development directory..."
    cp -r /home/user/webapp/* "$INSTALL_DIR/" 2>/dev/null || true
    cp -r /home/user/webapp/.* "$INSTALL_DIR/" 2>/dev/null || true
  else
    log_info "Cloning from repository..."
    git clone "$GIT_REPO" "$INSTALL_DIR" 2>/dev/null || {
      log_err "Could not clone repository."
      ask "Enter alternative git URL or local path" "" alt_source
      if [ -n "$alt_source" ]; then
        if [ -d "$alt_source" ]; then
          cp -r "$alt_source"/* "$INSTALL_DIR/"
        else
          git clone "$alt_source" "$INSTALL_DIR" || { log_err "Clone failed"; exit 1; }
        fi
      fi
    }
  fi
  
  cd "$INSTALL_DIR"
  
  log_info "Installing Node.js dependencies..."
  npm install --production 2>/dev/null || npm install 2>/dev/null || {
    log_warn "npm install failed. Trying with registry mirror..."
    ask "Enter npm registry mirror URL (e.g., https://registry.npmmirror.com)" "" npm_mirror
    if [ -n "$npm_mirror" ]; then
      npm config set registry "$npm_mirror"
    fi
    npm install --production
  }
  log_ok "Dependencies installed"
  
  # Configuration
  echo ""
  echo -e "${WHITE}════════════ Configuration ════════════${NC}"
  
  local ADMIN_USER ADMIN_PASS SERVER_PORT CORE_ENGINE
  ask "Admin username" "admin" ADMIN_USER
  ask "Admin password (leave empty for auto-generate)" "" ADMIN_PASS
  if [ -z "$ADMIN_PASS" ]; then
    ADMIN_PASS=$(openssl rand -hex 8 2>/dev/null || head -c 16 /dev/urandom | xxd -p | head -c 16)
    log_info "Auto-generated admin password: ${GREEN}$ADMIN_PASS${NC}"
  fi
  
  ask "Server port" "3000" SERVER_PORT
  ask "Core engine (xray/singbox)" "xray" CORE_ENGINE
  
  # Mode-specific config
  local IR_TITLE="" IR_PRIMARY="#1a73e8" IR_SECONDARY="#34a853" IR_ACCENT="#fbbc04"
  local EN_TITLE="CloudShield DNS" EN_PRIMARY="#0f172a" EN_SECONDARY="#3b82f6" EN_ACCENT="#10b981"
  
  if [ "$SERVER_MODE" = "iran" ]; then
    echo ""
    echo -e "${WHITE}--- Iran Site Configuration (Camouflage) ---${NC}"
    ask "Site title (Persian)" "گذر تحریم" IR_TITLE
    ask "Primary color" "#1a73e8" IR_PRIMARY
    ask "Secondary color" "#34a853" IR_SECONDARY
    ask "Accent color" "#fbbc04" IR_ACCENT
  else
    echo ""
    echo -e "${WHITE}--- Foreign Site Configuration ---${NC}"
    ask "Site title" "CloudShield DNS" EN_TITLE
    ask "Primary color" "#0f172a" EN_PRIMARY
    ask "Secondary color" "#3b82f6" EN_SECONDARY
    ask "Accent color" "#10b981" EN_ACCENT
  fi
  
  # Generate secrets
  local SESSION_SECRET JWT_SECRET
  SESSION_SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p)
  JWT_SECRET=$(openssl rand -hex 64 2>/dev/null || head -c 64 /dev/urandom | xxd -p)
  
  # Write .env
  cat > "$ENV_FILE" << ENVEOF
# Elahe Panel Configuration
# Generated by Elahe CLI v${VERSION}
# Date: $(date -Iseconds)

ELAHE_MODE=${SERVER_MODE}
PORT=${SERVER_PORT}
HOST=0.0.0.0

# Security
SESSION_SECRET=${SESSION_SECRET}
JWT_SECRET=${JWT_SECRET}

# Admin
ADMIN_USER=${ADMIN_USER}
ADMIN_PASS=${ADMIN_PASS}

# Core Engine
CORE_ENGINE=${CORE_ENGINE}

# Iran Site
IR_TITLE=${IR_TITLE}
IR_PRIMARY=${IR_PRIMARY}
IR_SECONDARY=${IR_SECONDARY}
IR_ACCENT=${IR_ACCENT}

# Foreign Site
EN_TITLE=${EN_TITLE}
EN_PRIMARY=${EN_PRIMARY}
EN_SECONDARY=${EN_SECONDARY}
EN_ACCENT=${EN_ACCENT}

# Database
DB_PATH=${DATA_DIR}/elahe.db

# Logging
LOG_LEVEL=info
ENVEOF

  chmod 600 "$ENV_FILE"
  log_ok "Configuration saved"
  
  # Domain setup
  setup_domain "$SERVER_MODE"
  
  # Check domain accessibility (for Iran servers)
  if [ "$SERVER_MODE" = "iran" ] && [ -n "${MAIN_DOMAIN:-}" ]; then
    if ask_yn "Check domain accessibility from Iran?" "y"; then
      check_domain_accessibility "$MAIN_DOMAIN"
    fi
  fi
  
  # Initialize database
  log_info "Initializing database..."
  cd "$INSTALL_DIR"
  node -e "require('./src/database/migrate').migrate()" 2>/dev/null || {
    log_warn "Database migration had issues. Trying again..."
    node -e "require('./src/database/migrate').migrate()"
  }
  log_ok "Database initialized"
  
  # Create systemd service
  setup_systemd "$SERVER_MODE"
  
  # Open firewall ports
  setup_firewall "$SERVER_MODE"
  
  # Install elahe CLI command
  install_cli_command
  
  # Final output
  local SERVER_IP
  SERVER_IP=$(curl -s4 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
  
  echo ""
  echo -e "${GREEN}"
  echo "╔══════════════════════════════════════════════════════╗"
  echo "║           Installation Complete!                     ║"
  echo "╠══════════════════════════════════════════════════════╣"
  if [ -n "${MAIN_DOMAIN:-}" ]; then
    echo "║  Panel:   https://${MAIN_DOMAIN}:${SERVER_PORT}"
    echo "║  Admin:   https://${MAIN_DOMAIN}:${SERVER_PORT}/admin"
  else
    echo "║  Panel:   http://${SERVER_IP}:${SERVER_PORT}"
    echo "║  Admin:   http://${SERVER_IP}:${SERVER_PORT}/admin"
  fi
  echo "║  User:    ${ADMIN_USER}"
  echo "║  Pass:    ${ADMIN_PASS}"
  echo "║  Mode:    ${SERVER_MODE}"
  echo "╠══════════════════════════════════════════════════════╣"
  echo "║  CLI:     elahe                                      ║"
  echo "║  Service: systemctl status elahe                     ║"
  echo "║  Logs:    journalctl -u elahe -f                     ║"
  echo "╚══════════════════════════════════════════════════════╝"
  echo -e "${NC}"
}

setup_systemd() {
  local mode="$1"
  local desc="Elahe Panel"
  [ "$mode" = "foreign" ] && desc="Elahe Panel (Foreign)"
  
  log_info "Creating systemd service..."
  cat > /etc/systemd/system/elahe.service << SVCEOF
[Unit]
Description=$desc
After=network.target
Documentation=https://github.com/EHSANKiNG/elahe-panel

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
SVCEOF

  systemctl daemon-reload
  systemctl enable elahe 2>/dev/null
  systemctl start elahe
  log_ok "Service created and started"
}

setup_firewall() {
  local mode="$1"
  local port
  port=$(grep "^PORT=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2 || echo "3000")
  
  log_info "Configuring firewall..."
  
  if command -v ufw &>/dev/null; then
    ufw allow "$port/tcp" 2>/dev/null
    ufw allow 443/tcp 2>/dev/null
    ufw allow 80/tcp 2>/dev/null
    ufw allow 8443/tcp 2>/dev/null
    ufw allow 8080/tcp 2>/dev/null
    
    if [ "$mode" = "iran" ]; then
      ufw allow 110/tcp 2>/dev/null
      ufw allow 510/tcp 2>/dev/null
      ufw allow 8388/tcp 2>/dev/null
    fi
    
    ufw allow 1414/udp 2>/dev/null
    ufw allow 53133/udp 2>/dev/null
    ufw allow 4433/udp 2>/dev/null
    
    log_ok "UFW firewall rules added"
  elif command -v firewall-cmd &>/dev/null; then
    firewall-cmd --permanent --add-port="$port/tcp" 2>/dev/null
    firewall-cmd --permanent --add-port=443/tcp 2>/dev/null
    firewall-cmd --permanent --add-port=80/tcp 2>/dev/null
    firewall-cmd --permanent --add-port=8443/tcp 2>/dev/null
    firewall-cmd --permanent --add-port=1414/udp 2>/dev/null
    firewall-cmd --permanent --add-port=53133/udp 2>/dev/null
    firewall-cmd --reload 2>/dev/null
    log_ok "Firewalld rules added"
  else
    log_warn "No supported firewall detected. Please open required ports manually."
  fi
}

install_cli_command() {
  log_info "Installing 'elahe' CLI command..."
  cat > /usr/local/bin/elahe << 'CLIEOF'
#!/bin/bash
exec bash /opt/elahe/scripts/elahe.sh "$@"
CLIEOF
  chmod +x /usr/local/bin/elahe
  log_ok "'elahe' command installed. Run 'elahe' from anywhere."
}

# ══════════════════ UPDATE ══════════════════

do_update() {
  banner
  check_root
  
  if [ ! -d "$INSTALL_DIR" ]; then
    log_err "Elahe Panel not found at $INSTALL_DIR. Run install first."
    exit 1
  fi
  
  log_info "Updating Elahe Panel..."
  cd "$INSTALL_DIR"
  
  # Backup
  log_info "Backing up data..."
  cp -r "$DATA_DIR" "${DATA_DIR}.bak.$(date +%Y%m%d)" 2>/dev/null || true
  cp "$ENV_FILE" "${ENV_FILE}.bak" 2>/dev/null || true
  
  # Pull latest
  if [ -d "$INSTALL_DIR/.git" ]; then
    git pull origin main 2>/dev/null || git pull 2>/dev/null || {
      log_warn "Git pull failed. Trying to download latest release..."
    }
  fi
  
  # Reinstall deps
  npm install --production 2>/dev/null
  
  # Run migrations
  node -e "require('./src/database/migrate').migrate()" 2>/dev/null || true
  
  # Restart service
  systemctl restart elahe 2>/dev/null || true
  
  log_ok "Update complete! Panel restarted."
}

# ══════════════════ UNINSTALL ══════════════════

do_uninstall() {
  banner
  check_root
  
  echo -e "${RED}${BOLD}WARNING: This will remove Elahe Panel and all data!${NC}"
  if ! ask_yn "Are you sure you want to uninstall?" "n"; then
    log_info "Cancelled."
    return
  fi
  
  if ask_yn "Backup data before uninstall?" "y"; then
    local backup_file="/root/elahe-backup-$(date +%Y%m%d-%H%M%S).tar.gz"
    tar czf "$backup_file" "$DATA_DIR" "$ENV_FILE" "$CERTS_DIR" 2>/dev/null || true
    log_ok "Backup saved to $backup_file"
  fi
  
  log_info "Stopping service..."
  systemctl stop elahe 2>/dev/null || true
  systemctl disable elahe 2>/dev/null || true
  rm -f /etc/systemd/system/elahe.service
  systemctl daemon-reload 2>/dev/null
  
  log_info "Removing files..."
  rm -rf "$INSTALL_DIR"
  rm -f /usr/local/bin/elahe
  
  log_ok "Elahe Panel uninstalled."
}

# ══════════════════ DOMAIN MANAGEMENT ══════════════════

do_set_domain() {
  banner
  check_root
  
  if [ ! -f "$ENV_FILE" ]; then
    log_err "Elahe Panel not installed. Run install first."
    exit 1
  fi
  
  local mode
  mode=$(grep "^ELAHE_MODE=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2 || echo "iran")
  
  setup_domain "$mode"
  
  log_info "Restarting service to apply changes..."
  systemctl restart elahe 2>/dev/null || true
  log_ok "Domain configured!"
}

# ══════════════════ CHANGE USER/PASS ══════════════════

do_change_credentials() {
  banner
  check_root
  
  if [ ! -f "$ENV_FILE" ]; then
    log_err "Elahe Panel not installed."
    exit 1
  fi
  
  echo -e "${WHITE}════════════ Change Admin Credentials ════════════${NC}"
  echo ""
  
  local current_user
  current_user=$(grep "^ADMIN_USER=" "$ENV_FILE" | cut -d'=' -f2)
  echo -e "Current admin user: ${CYAN}${current_user}${NC}"
  echo ""
  
  local new_user new_pass
  ask "New admin username (or Enter to keep current)" "$current_user" new_user
  ask "New admin password" "" new_pass
  
  if [ -z "$new_pass" ]; then
    log_err "Password cannot be empty"
    return
  fi
  
  # Update .env
  sed -i "s/^ADMIN_USER=.*/ADMIN_USER=${new_user}/" "$ENV_FILE"
  sed -i "s/^ADMIN_PASS=.*/ADMIN_PASS=${new_pass}/" "$ENV_FILE"
  
  # Update database
  cd "$INSTALL_DIR"
  node -e "
    const bcrypt = require('bcryptjs');
    const Database = require('better-sqlite3');
    const db = new Database('${DATA_DIR}/elahe.db');
    const hash = bcrypt.hashSync('${new_pass}', 10);
    db.prepare('UPDATE admins SET username = ?, password = ? WHERE is_sudo = 1').run('${new_user}', hash);
    console.log('Admin credentials updated in database');
    db.close();
  " 2>/dev/null || log_warn "DB update failed, credentials may only be updated on next restart."
  
  # Restart service
  systemctl restart elahe 2>/dev/null || true
  
  echo ""
  log_ok "Admin credentials updated!"
  echo -e "  Username: ${GREEN}$new_user${NC}"
  echo -e "  Password: ${GREEN}$new_pass${NC}"
}

# ══════════════════ STATUS ══════════════════

do_status() {
  banner
  
  echo -e "${WHITE}════════════ Elahe Panel Status ════════════${NC}"
  echo ""
  
  if [ ! -d "$INSTALL_DIR" ]; then
    log_err "Elahe Panel not installed."
    return
  fi
  
  # Service status
  if systemctl is-active --quiet elahe 2>/dev/null; then
    echo -e "  Service:     ${GREEN}Running${NC}"
  else
    echo -e "  Service:     ${RED}Stopped${NC}"
  fi
  
  # Mode
  local mode domain port
  mode=$(grep "^ELAHE_MODE=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2 || echo "unknown")
  domain=$(grep "^DOMAIN=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2 || echo "none")
  port=$(grep "^PORT=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2 || echo "3000")
  
  echo -e "  Mode:        ${CYAN}$mode${NC}"
  echo -e "  Port:        ${CYAN}$port${NC}"
  echo -e "  Domain:      ${CYAN}$domain${NC}"
  echo -e "  Install Dir: ${CYAN}$INSTALL_DIR${NC}"
  echo -e "  Database:    ${CYAN}$DATA_DIR/elahe.db${NC}"
  
  # DB stats
  if [ -f "$DATA_DIR/elahe.db" ] && command -v node &>/dev/null; then
    local stats
    stats=$(cd "$INSTALL_DIR" && node -e "
      try {
        const Database = require('better-sqlite3');
        const db = new Database('$DATA_DIR/elahe.db', { readonly: true });
        const users = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
        const servers = db.prepare('SELECT COUNT(*) as c FROM servers').get().c;
        const tunnels = db.prepare('SELECT COUNT(*) as c FROM tunnels').get().c;
        console.log(JSON.stringify({users, servers, tunnels}));
        db.close();
      } catch(e) { console.log('{}'); }
    " 2>/dev/null || echo "{}")
    
    local users servers tunnels
    users=$(echo "$stats" | jq -r '.users // 0' 2>/dev/null || echo "?")
    servers=$(echo "$stats" | jq -r '.servers // 0' 2>/dev/null || echo "?")
    tunnels=$(echo "$stats" | jq -r '.tunnels // 0' 2>/dev/null || echo "?")
    
    echo ""
    echo -e "  Users:       ${CYAN}$users${NC}"
    echo -e "  Servers:     ${CYAN}$servers${NC}"
    echo -e "  Tunnels:     ${CYAN}$tunnels${NC}"
  fi
  
  echo ""
}

# ══════════════════ MAIN MENU ══════════════════

show_menu() {
  banner
  
  echo -e "${WHITE}════════════ Management Menu ════════════${NC}"
  echo ""
  echo -e "  ${CYAN}1)${NC} Install          - Install Elahe Panel"
  echo -e "  ${CYAN}2)${NC} Update           - Update to latest version"
  echo -e "  ${CYAN}3)${NC} Uninstall        - Remove Elahe Panel"
  echo -e "  ${CYAN}4)${NC} Set Domain       - Configure domain & SSL"
  echo -e "  ${CYAN}5)${NC} Change User/Pass - Update admin credentials"
  echo -e "  ${CYAN}6)${NC} Status           - View panel status"
  echo -e "  ${CYAN}7)${NC} Restart          - Restart panel service"
  echo -e "  ${CYAN}8)${NC} Logs             - View panel logs"
  echo -e "  ${CYAN}0)${NC} Exit"
  echo ""
  
  local choice
  ask "Select option" "" choice
  
  case "$choice" in
    1) do_install ;;
    2) do_update ;;
    3) do_uninstall ;;
    4) do_set_domain ;;
    5) do_change_credentials ;;
    6) do_status ;;
    7) check_root; systemctl restart elahe 2>/dev/null && log_ok "Restarted" || log_err "Failed to restart" ;;
    8) journalctl -u elahe -f --no-pager -n 50 2>/dev/null || { cd "$INSTALL_DIR" && tail -f logs/*.log 2>/dev/null; } ;;
    0|exit|quit) echo -e "${GREEN}Goodbye!${NC}"; exit 0 ;;
    *) log_err "Invalid option"; show_menu ;;
  esac
}

# ══════════════════ CLI ARGUMENT PARSING ══════════════════

case "${1:-}" in
  install)     do_install ;;
  update)      do_update ;;
  uninstall)   do_uninstall ;;
  set-domain)  do_set_domain ;;
  change-user|change-pass) do_change_credentials ;;
  status)      do_status ;;
  restart)     check_root; systemctl restart elahe 2>/dev/null && log_ok "Restarted" || log_err "Failed" ;;
  logs)        journalctl -u elahe -f --no-pager -n 50 2>/dev/null || tail -f "$LOGS_DIR"/*.log 2>/dev/null ;;
  help|-h|--help)
    echo "Usage: elahe [command]"
    echo ""
    echo "Commands:"
    echo "  install       Install Elahe Panel"
    echo "  update        Update to latest version"
    echo "  uninstall     Remove Elahe Panel"
    echo "  set-domain    Configure domain & SSL"
    echo "  change-user   Change admin credentials"
    echo "  change-pass   Change admin credentials"
    echo "  status        View panel status"
    echo "  restart       Restart panel service"
    echo "  logs          View panel logs"
    echo "  help          Show this help"
    echo ""
    echo "Run without arguments for interactive menu."
    ;;
  "")
    show_menu
    ;;
  *)
    log_err "Unknown command: $1"
    echo "Run 'elahe help' for usage."
    exit 1
    ;;
esac
