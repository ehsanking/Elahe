#!/bin/bash
# ══════════════════════════════════════════════════════════
# Elahe Panel - Package Bundler
# Creates a self-contained node_modules archive for offline install
# Developer: EHSANKiNG
# ══════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== Elahe Panel - Package Bundler ==="
echo "Project dir: $PROJECT_DIR"

cd "$PROJECT_DIR"

# Clean install
echo "[1/3] Installing fresh dependencies..."
rm -rf node_modules package-lock.json
npm install --production

# Create archive
echo "[2/3] Creating node_modules archive..."
tar -czf "$SCRIPT_DIR/node_modules.tar.gz" node_modules/

# Get size
SIZE=$(du -sh "$SCRIPT_DIR/node_modules.tar.gz" | cut -f1)
echo "[3/3] Archive created: packages/node_modules.tar.gz ($SIZE)"

# Create checksum
sha256sum "$SCRIPT_DIR/node_modules.tar.gz" > "$SCRIPT_DIR/node_modules.tar.gz.sha256"

echo ""
echo "Done! Upload packages/node_modules.tar.gz to your GitHub releases."
echo "Users can install offline with:"
echo "  tar -xzf packages/node_modules.tar.gz -C /opt/elahe/"
