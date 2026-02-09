#!/bin/bash
# ══════════════════════════════════════════════════════════
# Elahe Panel - Core Binary Downloader
# Downloads Xray, Sing-box, and Hysteria2 binaries
# Self-hosts them in packages/ for offline installation
# Developer: EHSANKiNG
# ══════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ARCH=$(uname -m)

case "$ARCH" in
  x86_64|amd64)  ARCH_XRAY="64"; ARCH_SB="amd64"; ARCH_HY="amd64" ;;
  aarch64|arm64)  ARCH_XRAY="arm64-v8a"; ARCH_SB="arm64"; ARCH_HY="arm64" ;;
  *)              echo "Unsupported architecture: $ARCH"; exit 1 ;;
esac

mkdir -p "$SCRIPT_DIR/cores"

echo "=== Elahe Panel - Core Binary Downloader ==="
echo "Architecture: $ARCH"
echo ""

# ===== Xray Core =====
XRAY_VER="1.8.24"
XRAY_URL="https://github.com/XTLS/Xray-core/releases/download/v${XRAY_VER}/Xray-linux-${ARCH_XRAY}.zip"
echo "[1/3] Downloading Xray Core v${XRAY_VER}..."
curl -fsSL "$XRAY_URL" -o "$SCRIPT_DIR/cores/xray.zip" && {
  echo "  Xray downloaded: cores/xray.zip"
} || echo "  WARNING: Xray download failed"

# ===== Sing-box =====
SB_VER="1.10.6"
SB_URL="https://github.com/SagerNet/sing-box/releases/download/v${SB_VER}/sing-box-${SB_VER}-linux-${ARCH_SB}.tar.gz"
echo "[2/3] Downloading Sing-box v${SB_VER}..."
curl -fsSL "$SB_URL" -o "$SCRIPT_DIR/cores/singbox.tar.gz" && {
  echo "  Sing-box downloaded: cores/singbox.tar.gz"
} || echo "  WARNING: Sing-box download failed"

# ===== Hysteria2 =====
HY_VER="2.6.1"
HY_URL="https://github.com/apernet/hysteria/releases/download/app%2Fv${HY_VER}/hysteria-linux-${ARCH_HY}"
echo "[3/3] Downloading Hysteria2 v${HY_VER}..."
curl -fsSL "$HY_URL" -o "$SCRIPT_DIR/cores/hysteria2" && {
  chmod +x "$SCRIPT_DIR/cores/hysteria2"
  echo "  Hysteria2 downloaded: cores/hysteria2"
} || echo "  WARNING: Hysteria2 download failed"

echo ""
echo "=== Downloads Complete ==="
echo "Cores saved to: $SCRIPT_DIR/cores/"
ls -lh "$SCRIPT_DIR/cores/" 2>/dev/null || true
echo ""
echo "To install on target server:"
echo "  # Xray"
echo "  unzip packages/cores/xray.zip -d /usr/local/bin/ && chmod +x /usr/local/bin/xray"
echo "  # Sing-box"
echo "  tar -xzf packages/cores/singbox.tar.gz -C /tmp/ && cp /tmp/sing-box-*/sing-box /usr/local/bin/ && chmod +x /usr/local/bin/sing-box"
echo "  # Hysteria2"
echo "  cp packages/cores/hysteria2 /usr/local/bin/ && chmod +x /usr/local/bin/hysteria2"
