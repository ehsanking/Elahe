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
GITHUB_API="https://api.github.com/repos/ehsanking/Elahe"
GITHUB_RAW="https://raw.githubusercontent.com/ehsanking/Elahe"

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

# ══════════════════ RELEASE DETECTION ══════════════════

fetch_latest_release() {
  # Try to get latest release from GitHub Releases API
  local release_info
  release_info=$(curl -s --connect-timeout 10 "${GITHUB_API}/releases/latest" 2>/dev/null || echo "")

  if [ -n "$release_info" ] && echo "$release_info" | jq -e '.tag_name' &>/dev/null; then
    LATEST_TAG=$(echo "$release_info" | jq -r '.tag_name')
    LATEST_VERSION=$(echo "$LATEST_TAG" | sed 's/^v//')
    RELEASE_TARBALL=$(echo "$release_info" | jq -r '.tarball_url // empty')
    RELEASE_ZIPBALL=$(echo "$release_info" | jq -r '.zipball_url // empty')
    RELEASE_NOTES=$(echo "$release_info" | jq -r '.body // "No release notes"' | head -5)
    log_ok "Latest release detected: ${LATEST_TAG} (${LATEST_VERSION})"
    return 0
  fi

  # Fallback: try tags API
  local tags_info
  tags_info=$(curl -s --connect-timeout 10 "${GITHUB_API}/tags?per_page=1" 2>/dev/null || echo "")
  if [ -n "$tags_info" ] && echo "$tags_info" | jq -e '.[0].name' &>/dev/null; then
    LATEST_TAG=$(echo "$tags_info" | jq -r '.[0].name')
    LATEST_VERSION=$(echo "$LATEST_TAG" | sed 's/^v//')
    RELEASE_TARBALL="${GITHUB_API}/tarball/${LATEST_TAG}"
    RELEASE_ZIPBALL="${GITHUB_API}/zipball/${LATEST_TAG}"
    RELEASE_NOTES=""
    log_ok "Latest tag detected: ${LATEST_TAG}"
    return 0
  fi

  # No release or tag found - use main branch
  LATEST_TAG=""
  LATEST_VERSION="$VERSION"
  RELEASE_TARBALL=""
  RELEASE_ZIPBALL=""
  RELEASE_NOTES=""
  log_warn "No GitHub release found. Will install from main branch."
  return 1
}

download_release() {
  local dest_dir="$1"
  local tmp_dir
  tmp_dir=$(mktemp -d)

  # Try tarball first (smaller)
  if [ -n "${RELEASE_TARBALL:-}" ]; then
    log_info "Downloading release ${LATEST_TAG} tarball..."
    if curl -sL --connect-timeout 30 -o "${tmp_dir}/release.tar.gz" "$RELEASE_TARBALL" 2>/dev/null; then
      log_info "Extracting release archive..."
      tar -xzf "${tmp_dir}/release.tar.gz" -C "$tmp_dir" 2>/dev/null
      # GitHub tarballs extract to a subfolder like owner-repo-hash/
      local extracted_dir
      extracted_dir=$(find "$tmp_dir" -maxdepth 1 -mindepth 1 -type d | head -1)
      if [ -n "$extracted_dir" ] && [ -f "${extracted_dir}/package.json" ]; then
        cp -a "${extracted_dir}"/* "${dest_dir}/" 2>/dev/null || true
        cp -a "${extracted_dir}"/.* "${dest_dir}/" 2>/dev/null || true
        rm -rf "$tmp_dir"
        log_ok "Release ${LATEST_TAG} extracted successfully"
        return 0
      fi
    fi
  fi

  # Try zipball
  if [ -n "${RELEASE_ZIPBALL:-}" ]; then
    log_info "Downloading release ${LATEST_TAG} zipball..."
    if curl -sL --connect-timeout 30 -o "${tmp_dir}/release.zip" "$RELEASE_ZIPBALL" 2>/dev/null; then
      unzip -q "${tmp_dir}/release.zip" -d "$tmp_dir" 2>/dev/null
      local extracted_dir
      extracted_dir=$(find "$tmp_dir" -maxdepth 1 -mindepth 1 -type d | head -1)
      if [ -n "$extracted_dir" ] && [ -f "${extracted_dir}/package.json" ]; then
        cp -a "${extracted_dir}"/* "${dest_dir}/" 2>/dev/null || true
        cp -a "${extracted_dir}"/.* "${dest_dir}/" 2>/dev/null || true
        rm -rf "$tmp_dir"
        log_ok "Release ${LATEST_TAG} extracted successfully"
        return 0
      fi
    fi
  fi

  rm -rf "$tmp_dir"
  return 1
}

# ══════════════════ PROJECT SETUP (HANDLES EXISTING DIR) ══════════════════

setup_project_files() {
  # This function handles:
  # 1. Fresh install to empty dir
  # 2. Existing /opt/elahe with data (backup & update)
  # 3. Failed previous clone
  # 4. Download from latest release

  mkdir -p "$INSTALL_DIR" "$DATA_DIR" "$CERTS_DIR" "$LOGS_DIR"

  # --- If copying from local dev directory ---
  if [ -d "/home/user/webapp" ] && [ -f "/home/user/webapp/package.json" ]; then
    log_info "Copying from local development directory..."
    # Backup existing data/config
    _backup_existing_data
    # Clean code files but preserve data
    _clean_code_files
    cp -a /home/user/webapp/* "$INSTALL_DIR/" 2>/dev/null || true
    cp -a /home/user/webapp/.gitignore "$INSTALL_DIR/" 2>/dev/null || true
    # Restore data
    _restore_existing_data
    log_ok "Project files copied from local directory"
    return 0
  fi

  # --- Try latest GitHub Release ---
  log_info "Checking for latest release on GitHub..."
  if fetch_latest_release; then
    log_info "Found release: ${LATEST_TAG}"
    # Backup existing data
    _backup_existing_data
    _clean_code_files

    if download_release "$INSTALL_DIR"; then
      _restore_existing_data
      log_ok "Installed from release ${LATEST_TAG}"
      return 0
    else
      log_warn "Release download failed. Falling back to git clone..."
    fi
  fi

  # --- Try git clone / pull ---
  if [ -d "$INSTALL_DIR/.git" ]; then
    # Already a git repo - just pull
    log_info "Existing git repository found. Pulling latest changes..."
    cd "$INSTALL_DIR"
    git fetch origin 2>/dev/null || true
    git reset --hard origin/main 2>/dev/null || git pull origin main 2>/dev/null || {
      log_warn "Git pull failed. Trying fresh clone..."
      _backup_existing_data
      _clean_all_files
      git clone "$GIT_REPO" "$INSTALL_DIR" 2>/dev/null || {
        _try_alternative_source
        return $?
      }
      _restore_existing_data
    }
    log_ok "Project updated from git"
    return 0
  fi

  # Fresh clone - but directory might exist and not be empty
  if [ -d "$INSTALL_DIR" ] && [ "$(ls -A "$INSTALL_DIR" 2>/dev/null)" ]; then
    log_warn "Directory $INSTALL_DIR exists and is not empty."
    _backup_existing_data
    _clean_all_files
    mkdir -p "$INSTALL_DIR"
  fi

  log_info "Cloning from repository..."
  git clone "$GIT_REPO" "$INSTALL_DIR" 2>/dev/null || {
    log_warn "Git clone failed."
    _try_alternative_source
    local ret=$?
    _restore_existing_data
    return $ret
  }

  _restore_existing_data
  log_ok "Project cloned successfully"
  return 0
}

_backup_existing_data() {
  # Backup data, certs, env, and logs if they exist
  local backup_ts
  backup_ts=$(date +%Y%m%d-%H%M%S)
  local backup_tmp="/tmp/elahe-backup-${backup_ts}"

  if [ -f "$DATA_DIR/elahe.db" ] || [ -f "$ENV_FILE" ] || [ -d "$CERTS_DIR" ]; then
    log_info "Backing up existing data..."
    mkdir -p "$backup_tmp"
    [ -d "$DATA_DIR" ] && cp -a "$DATA_DIR" "$backup_tmp/data" 2>/dev/null || true
    [ -f "$ENV_FILE" ] && cp -a "$ENV_FILE" "$backup_tmp/.env" 2>/dev/null || true
    [ -d "$CERTS_DIR" ] && cp -a "$CERTS_DIR" "$backup_tmp/certs" 2>/dev/null || true
    [ -d "$LOGS_DIR" ] && cp -a "$LOGS_DIR" "$backup_tmp/logs" 2>/dev/null || true
    ELAHE_BACKUP_DIR="$backup_tmp"
    log_ok "Data backed up to $backup_tmp"
  else
    ELAHE_BACKUP_DIR=""
  fi
}

_restore_existing_data() {
  if [ -n "${ELAHE_BACKUP_DIR:-}" ] && [ -d "${ELAHE_BACKUP_DIR}" ]; then
    log_info "Restoring backed up data..."
    [ -d "${ELAHE_BACKUP_DIR}/data" ] && cp -a "${ELAHE_BACKUP_DIR}/data" "$INSTALL_DIR/" 2>/dev/null || true
    [ -f "${ELAHE_BACKUP_DIR}/.env" ] && cp -a "${ELAHE_BACKUP_DIR}/.env" "$ENV_FILE" 2>/dev/null || true
    [ -d "${ELAHE_BACKUP_DIR}/certs" ] && cp -a "${ELAHE_BACKUP_DIR}/certs" "$INSTALL_DIR/" 2>/dev/null || true
    [ -d "${ELAHE_BACKUP_DIR}/logs" ] && cp -a "${ELAHE_BACKUP_DIR}/logs" "$INSTALL_DIR/" 2>/dev/null || true
    log_ok "Data restored successfully"
    # Clean up temp backup
    rm -rf "${ELAHE_BACKUP_DIR}"
  fi
}

_clean_code_files() {
  # Remove code files but keep data, certs, logs, .env
  if [ -d "$INSTALL_DIR" ]; then
    find "$INSTALL_DIR" -maxdepth 1 -mindepth 1 \
      ! -name 'data' ! -name 'certs' ! -name 'logs' ! -name '.env' \
      ! -name 'node_modules' \
      -exec rm -rf {} + 2>/dev/null || true
  fi
}

_clean_all_files() {
  # Remove everything in install dir
  if [ -d "$INSTALL_DIR" ]; then
    rm -rf "${INSTALL_DIR:?}"/*
    rm -rf "${INSTALL_DIR}"/.* 2>/dev/null || true
  fi
}

_try_alternative_source() {
  log_warn "Could not download from primary source."
  echo -e "${YELLOW}Options:${NC}"
  echo "  1) Enter an alternative git URL"
  echo "  2) Enter a local path to copy from"
  echo "  3) Retry primary source"
  echo "  4) Abort installation"
  local choice
  read -rp "$(echo -e "${MAGENTA}Choice [1]: ${NC}")" choice
  choice="${choice:-1}"

  case "$choice" in
    1)
      local alt_url
      ask "Enter alternative git URL" "" alt_url
      if [ -n "$alt_url" ]; then
        _clean_all_files
        mkdir -p "$INSTALL_DIR"
        git clone "$alt_url" "$INSTALL_DIR" || { log_err "Clone failed"; return 1; }
        return 0
      fi
      ;;
    2)
      local alt_path
      ask "Enter local path" "" alt_path
      if [ -n "$alt_path" ] && [ -d "$alt_path" ]; then
        _clean_all_files
        mkdir -p "$INSTALL_DIR"
        cp -a "$alt_path"/* "$INSTALL_DIR/" 2>/dev/null || true
        return 0
      fi
      ;;
    3)
      _clean_all_files
      mkdir -p "$INSTALL_DIR"
      git clone "$GIT_REPO" "$INSTALL_DIR" || { log_err "Clone failed again"; return 1; }
      return 0
      ;;
    4|*)
      log_err "Installation aborted."
      return 1
      ;;
  esac
  return 1
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
  
  # Detect server IP
  SERVER_IP=$(curl -s4 ifconfig.me 2>/dev/null || curl -s4 icanhazip.com 2>/dev/null || hostname -I | awk '{print $1}')
  
  # Verify main domain resolution
  log_info "Checking main domain DNS resolution..."
  local domain_ip
  domain_ip=$(dig +short "$MAIN_DOMAIN" A 2>/dev/null | head -1 || nslookup "$MAIN_DOMAIN" 2>/dev/null | awk '/Address:/{a=$2}END{print a}' || echo "")
  
  if [ -n "$domain_ip" ] && [ "$domain_ip" = "$SERVER_IP" ]; then
    log_ok "Domain $MAIN_DOMAIN resolves to this server ($SERVER_IP)"
  else
    log_warn "Domain $MAIN_DOMAIN resolves to '$domain_ip' but this server is $SERVER_IP"
    log_warn "Make sure DNS A record points to $SERVER_IP before getting SSL"
    if ! ask_yn "Continue anyway?" "y"; then
      return
    fi
  fi
  
  # ── Step 1: SSL for main domain ONLY ──
  if ask_yn "Get SSL certificate for main domain ($MAIN_DOMAIN)?" "y"; then
    setup_ssl_main "$MAIN_DOMAIN"
  fi
  
  # ── Step 2: Generate subdomains ──
  generate_subdomains "$MAIN_DOMAIN" "$mode"
  
  # ── Step 3: Ask user to set DNS, then optionally verify & get SSL for subdomains ──
  echo ""
  echo -e "${WHITE}══════════════════════════════════════════════════════════${NC}"
  echo -e "${YELLOW}  IMPORTANT: Before getting SSL for subdomains, you must"
  echo -e "  first create DNS A records in your DNS panel.${NC}"
  echo ""
  echo -e "  ${WHITE}For each subdomain above, create an A record pointing to:${NC}"
  echo -e "  ${GREEN}${SERVER_IP}${NC}"
  echo ""
  echo -e "  ${WHITE}Example DNS records:${NC}"
  if [ -f "$DATA_DIR/subdomains.txt" ]; then
    head -3 "$DATA_DIR/subdomains.txt" | while IFS= read -r sub; do
      echo -e "    ${CYAN}${sub}${NC}  ->  A  ->  ${GREEN}${SERVER_IP}${NC}"
    done
    echo -e "    ${CYAN}...${NC}"
  fi
  echo -e "${WHITE}══════════════════════════════════════════════════════════${NC}"
  echo ""
  
  if ask_yn "Have you already set DNS records for the subdomains?" "n"; then
    # User says they set DNS - verify and get SSL
    verify_and_ssl_subdomains "$MAIN_DOMAIN"
  else
    echo ""
    log_info "No problem! You can get SSL for subdomains later by running:"
    echo -e "  ${CYAN}elahe set-domain${NC}"
    echo ""
    log_info "Or manually request SSL after setting DNS records:"
    echo -e "  ${CYAN}certbot certonly --standalone -d sub1.${MAIN_DOMAIN} -d sub2.${MAIN_DOMAIN} ...${NC}"
    echo ""
  fi
  
  # Save domain config
  if [ -f "$ENV_FILE" ]; then
    sed -i "/^DOMAIN=/d" "$ENV_FILE"
    sed -i "/^IR_DOMAIN=/d" "$ENV_FILE"
    sed -i "/^EN_DOMAIN=/d" "$ENV_FILE"
    sed -i "/^SSL_ENABLED=/d" "$ENV_FILE"
    sed -i "/^SSL_CERT=/d" "$ENV_FILE"
    sed -i "/^SSL_KEY=/d" "$ENV_FILE"
    sed -i "/^SUBDOMAINS=/d" "$ENV_FILE"
    
    echo "DOMAIN=$MAIN_DOMAIN" >> "$ENV_FILE"
    if [ "$mode" = "iran" ]; then
      echo "IR_DOMAIN=$MAIN_DOMAIN" >> "$ENV_FILE"
    else
      echo "EN_DOMAIN=$MAIN_DOMAIN" >> "$ENV_FILE"
    fi
    echo "SSL_ENABLED=auto" >> "$ENV_FILE"
    echo "SSL_CERT=$CERTS_DIR/fullchain.pem" >> "$ENV_FILE"
    echo "SSL_KEY=$CERTS_DIR/privkey.pem" >> "$ENV_FILE"
    echo "SUBDOMAINS=${SUBDOMAINS_LIST:-}" >> "$ENV_FILE"
  fi
  
  # Restart service to pick up SSL
  if systemctl is-active --quiet elahe 2>/dev/null; then
    log_info "Restarting service to apply SSL configuration..."
    systemctl restart elahe 2>/dev/null || true
    log_ok "Service restarted with HTTPS"
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
}

# ── Verify DNS for each subdomain, then request SSL only for verified ones ──
verify_and_ssl_subdomains() {
  local main_domain="$1"
  
  if [ ! -f "$DATA_DIR/subdomains.txt" ]; then
    log_warn "No subdomains file found."
    return
  fi
  
  local server_ip="${SERVER_IP:-$(curl -s4 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')}"
  
  echo ""
  log_info "Verifying DNS records for subdomains..."
  echo ""
  
  local -a verified_subs=()
  local -a failed_subs=()
  
  while IFS= read -r subdomain; do
    [ -z "$subdomain" ] && continue
    local sub_ip
    sub_ip=$(dig +short "$subdomain" A 2>/dev/null | head -1 || echo "")
    
    if [ "$sub_ip" = "$server_ip" ]; then
      echo -e "  ${GREEN}[OK]${NC}   $subdomain -> $sub_ip"
      verified_subs+=("$subdomain")
    elif [ -n "$sub_ip" ]; then
      echo -e "  ${YELLOW}[WARN]${NC} $subdomain -> $sub_ip (expected $server_ip)"
      failed_subs+=("$subdomain")
    else
      echo -e "  ${RED}[FAIL]${NC} $subdomain -> DNS not found (NXDOMAIN)"
      failed_subs+=("$subdomain")
    fi
  done < "$DATA_DIR/subdomains.txt"
  
  echo ""
  log_ok "Verified: ${#verified_subs[@]} subdomains"
  if [ ${#failed_subs[@]} -gt 0 ]; then
    log_warn "Failed: ${#failed_subs[@]} subdomains (DNS not set or pointing elsewhere)"
    echo -e "  ${YELLOW}Failed subdomains will be skipped for SSL.${NC}"
    echo -e "  ${YELLOW}You can set their DNS later and run 'elahe set-domain' again.${NC}"
  fi
  
  # Request SSL only for verified subdomains
  if [ ${#verified_subs[@]} -gt 0 ]; then
    if ask_yn "Get SSL certificate for ${#verified_subs[@]} verified subdomains?" "y"; then
      setup_ssl_subdomains "$main_domain" "${verified_subs[@]}"
    fi
  else
    log_warn "No subdomains with valid DNS found. Skipping SSL for subdomains."
    log_info "Set DNS records and run 'elahe set-domain' later to get SSL."
  fi
}

# ── SSL for main domain only ──
setup_ssl_main() {
  local domain="$1"
  
  echo ""
  log_info "Setting up SSL certificate for main domain: $domain"
  mkdir -p "$CERTS_DIR"
  
  _ensure_certbot_installed
  
  if ! command -v certbot &>/dev/null; then
    log_warn "Certbot not available. Generating self-signed certificate..."
    generate_self_signed "$domain"
    return
  fi
  
  # Stop any web servers on port 80
  fuser -k 80/tcp 2>/dev/null || true
  sleep 1
  
  log_info "Requesting SSL certificate from Let's Encrypt for $domain..."
  if certbot certonly --standalone -d "$domain" --agree-tos --non-interactive --email "admin@${domain}" 2>&1; then
    local cert_dir="/etc/letsencrypt/live/$domain"
    if [ -f "$cert_dir/fullchain.pem" ]; then
      cp "$cert_dir/fullchain.pem" "$CERTS_DIR/fullchain.pem"
      cp "$cert_dir/privkey.pem" "$CERTS_DIR/privkey.pem"
      
      # Setup auto-renewal cron
      (crontab -l 2>/dev/null; echo "0 0 1 * * certbot renew --quiet && cp /etc/letsencrypt/live/$domain/fullchain.pem $CERTS_DIR/ && cp /etc/letsencrypt/live/$domain/privkey.pem $CERTS_DIR/ && systemctl restart $SERVICE_NAME") | crontab -
      
      log_ok "SSL certificate obtained for $domain and auto-renewal configured"
      return 0
    fi
  fi
  
  log_warn "Let's Encrypt failed for main domain."
  log_info "Generating self-signed certificate as fallback..."
  generate_self_signed "$domain"
}

# ── SSL for verified subdomains (expand existing cert) ──
setup_ssl_subdomains() {
  local main_domain="$1"
  shift
  local -a subs=("$@")
  
  if [ ${#subs[@]} -eq 0 ]; then
    return
  fi
  
  _ensure_certbot_installed
  
  if ! command -v certbot &>/dev/null; then
    log_warn "Certbot not available. Cannot get SSL for subdomains."
    return
  fi
  
  # Stop any web servers on port 80
  fuser -k 80/tcp 2>/dev/null || true
  sleep 1
  
  # Build certbot domain arguments: main domain + all verified subdomains
  local certbot_domains="-d $main_domain"
  for sub in "${subs[@]}"; do
    certbot_domains="$certbot_domains -d $sub"
  done
  
  log_info "Requesting expanded SSL certificate for $main_domain + ${#subs[@]} subdomains..."
  if certbot certonly --standalone $certbot_domains --agree-tos --non-interactive --email "admin@${main_domain}" --expand 2>&1; then
    local cert_dir="/etc/letsencrypt/live/$main_domain"
    if [ -f "$cert_dir/fullchain.pem" ]; then
      cp "$cert_dir/fullchain.pem" "$CERTS_DIR/fullchain.pem"
      cp "$cert_dir/privkey.pem" "$CERTS_DIR/privkey.pem"
      log_ok "SSL certificate expanded to include ${#subs[@]} subdomains"
      return 0
    fi
    # Sometimes certbot creates a numbered directory
    local alt_dir
    alt_dir=$(ls -d /etc/letsencrypt/live/${main_domain}* 2>/dev/null | tail -1)
    if [ -n "$alt_dir" ] && [ -f "$alt_dir/fullchain.pem" ]; then
      cp "$alt_dir/fullchain.pem" "$CERTS_DIR/fullchain.pem"
      cp "$alt_dir/privkey.pem" "$CERTS_DIR/privkey.pem"
      log_ok "SSL certificate expanded to include ${#subs[@]} subdomains"
      return 0
    fi
  fi
  
  log_warn "Failed to get SSL for subdomains. Main domain certificate is still valid."
  log_info "You can retry later with: elahe set-domain"
}

_ensure_certbot_installed() {
  if command -v certbot &>/dev/null; then
    return 0
  fi
  
  log_info "Installing certbot..."
  install_pkg certbot 2>/dev/null || true
  
  # Try snap
  if ! command -v certbot &>/dev/null && command -v snap &>/dev/null; then
    snap install certbot --classic 2>/dev/null || true
  fi
  
  # Try pip
  if ! command -v certbot &>/dev/null; then
    pip3 install certbot 2>/dev/null || true
  fi
}

generate_self_signed() {
  local domain="$1"
  
  mkdir -p "$CERTS_DIR"
  
  # Build SAN entries
  local san="DNS:${domain}"
  if [ -f "$DATA_DIR/subdomains.txt" ]; then
    while IFS= read -r subdomain; do
      [ -n "$subdomain" ] && san="${san},DNS:${subdomain}"
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
  
  # Stop existing service if running (to avoid file locks)
  systemctl stop elahe 2>/dev/null || true
  
  setup_project_files || {
    log_err "Failed to set up project files. Installation aborted."
    exit 1
  }
  
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
  
  # Ensure directories exist after project setup
  mkdir -p "$DATA_DIR" "$CERTS_DIR" "$LOGS_DIR"

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
  
  # Write .env (only if not restoring from backup)
  if [ -f "$ENV_FILE" ] && ask_yn "Existing configuration found. Keep it?" "y"; then
    log_ok "Keeping existing configuration"
    # Update mode if changed
    sed -i "s/^ELAHE_MODE=.*/ELAHE_MODE=${SERVER_MODE}/" "$ENV_FILE" 2>/dev/null || true
  else
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

# SSL / HTTPS (auto-detected from certs directory)
SSL_ENABLED=auto
SSL_CERT=${CERTS_DIR}/fullchain.pem
SSL_KEY=${CERTS_DIR}/privkey.pem

# Logging
LOG_LEVEL=info
ENVEOF

  chmod 600 "$ENV_FILE"
  log_ok "Configuration saved"
  fi  # end of .env write block
  
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
  
  # Determine protocol based on whether SSL certs exist
  local PANEL_PROTO="http"
  if [ -f "${CERTS_DIR}/fullchain.pem" ] && [ -f "${CERTS_DIR}/privkey.pem" ]; then
    PANEL_PROTO="https"
  fi
  
  echo ""
  echo -e "${GREEN}"
  echo "╔══════════════════════════════════════════════════════╗"
  echo "║           Installation Complete!                     ║"
  echo "╠══════════════════════════════════════════════════════╣"
  if [ -n "${MAIN_DOMAIN:-}" ]; then
    echo "║  Panel:   ${PANEL_PROTO}://${MAIN_DOMAIN}:${SERVER_PORT}"
    echo "║  Admin:   ${PANEL_PROTO}://${MAIN_DOMAIN}:${SERVER_PORT}/admin"
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
  
  if [ "$PANEL_PROTO" = "http" ]; then
    echo -e "${YELLOW}NOTE: Panel is running in HTTP mode.${NC}"
    echo -e "${YELLOW}To enable HTTPS: run 'elahe set-domain' to configure SSL.${NC}"
    echo -e "${YELLOW}After SSL setup, access via https://${MAIN_DOMAIN:-$SERVER_IP}:${SERVER_PORT}${NC}"
  fi
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
  
  log_info "Checking for updates..."
  
  # Check current installed version
  local current_ver="unknown"
  if [ -f "$INSTALL_DIR/package.json" ] && command -v jq &>/dev/null; then
    current_ver=$(jq -r '.version // "unknown"' "$INSTALL_DIR/package.json")
  elif [ -f "$INSTALL_DIR/package.json" ]; then
    current_ver=$(grep -o '"version": *"[^"]*"' "$INSTALL_DIR/package.json" | head -1 | cut -d'"' -f4)
  fi
  log_info "Current version: ${current_ver}"
  
  # Fetch latest release
  if fetch_latest_release; then
    log_info "Latest available: ${LATEST_VERSION}"
    if [ "$current_ver" = "$LATEST_VERSION" ]; then
      log_ok "Already running the latest version (${current_ver})"
      if ! ask_yn "Reinstall anyway?" "n"; then
        return
      fi
    else
      echo -e "  ${GREEN}Update available: ${current_ver} -> ${LATEST_VERSION}${NC}"
      if [ -n "${RELEASE_NOTES:-}" ]; then
        echo ""
        echo -e "  ${WHITE}Release Notes:${NC}"
        echo "$RELEASE_NOTES" | sed 's/^/    /'
        echo ""
      fi
    fi
  fi
  
  log_info "Updating Elahe Panel..."
  
  # Stop service during update
  systemctl stop elahe 2>/dev/null || true
  
  # Use setup_project_files which handles backup/restore
  cd "$INSTALL_DIR"
  setup_project_files || {
    log_err "Update failed. Restarting with existing version..."
    systemctl start elahe 2>/dev/null || true
    return 1
  }
  
  # Reinstall deps
  cd "$INSTALL_DIR"
  npm install --production 2>/dev/null || npm install 2>/dev/null
  
  # Run migrations
  node -e "require('./src/database/migrate').migrate()" 2>/dev/null || true
  
  # Restart service
  systemctl start elahe 2>/dev/null || true
  
  # Show new version
  local new_ver="unknown"
  if [ -f "$INSTALL_DIR/package.json" ]; then
    new_ver=$(grep -o '"version": *"[^"]*"' "$INSTALL_DIR/package.json" | head -1 | cut -d'"' -f4)
  fi
  
  log_ok "Update complete! Version: ${new_ver}. Panel restarted."
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
