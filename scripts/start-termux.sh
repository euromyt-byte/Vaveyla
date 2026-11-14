#!/usr/bin/env bash
set -euo pipefail
VAVEYLA_NODE_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$VAVEYLA_NODE_DIR"
if ! command -v node >/dev/null 2>&1; then
    printf '%s\n' 'Önce: pkg install nodejs-lts'
    exit 1
fi
node -e 'if (+process.versions.node.split(".")[0]<24) { console.error("Node.js24+ gerekli: pkg upgrade nodejs-lts"); process.exit(1) }'
if [ ! -d node_modules/ws ] || [ ! -d node_modules/fflate ]; then
    npm ci --omit=dev --ignore-scripts --no-audit --no-fund
fi
VAVEYLA_NODE_CLIENT="${VAVEYLA_CLIENT_DIR:-$HOME/vaveyla-v0.8/vaveyla-client-local-v0.8}"
VAVEYLA_NODE_DATABASE="${VAVEYLA_NODE_DATABASE:-$VAVEYLA_NODE_DIR/data/vaveyla.sqlite3}"
VAVEYLA_PYTHON_DATABASE="${VAVEYLA_DATABASE:-$HOME/vaveyla-v07-kurulum/vaveyla/data/vaveyla.sqlite3}"
if [ -z "${VAVEYLA_DATABASE:-}" ] && [ ! -f "$VAVEYLA_NODE_DATABASE" ] && [ -f "$HOME/vaveyla-node-v1.0.0/vaveyla-node/data/vaveyla.sqlite3" ]; then
    VAVEYLA_PYTHON_DATABASE="$HOME/vaveyla-node-v1.0.0/vaveyla-node/data/vaveyla.sqlite3"
fi
node scripts/stop-node.js
printf '%s\n' 'Başlangıç istemci dosyaları kontrol ediliyor…'
printf 'İstemci: %s\n' "$VAVEYLA_NODE_CLIENT"
VAVEYLA_SCENE_OPTIONS=()
if [ "${VAVEYLA_AUDIT_SCENES:-0}" = "1" ]; then
    VAVEYLA_SCENE_OPTIONS=(--all-scenes)
fi
node scripts/check-client.js --client "$VAVEYLA_NODE_CLIENT" "${VAVEYLA_SCENE_OPTIONS[@]}" --report "$VAVEYLA_NODE_DIR/data/client-audit.json"
printf '%s\n' 'İstemci kontrolü tamamlandı. SQLite hazırlanıyor…' 
if [ ! -f "$VAVEYLA_NODE_DATABASE" ]; then
    node scripts/import-database.js --source "$VAVEYLA_PYTHON_DATABASE" --destination "$VAVEYLA_NODE_DATABASE"
fi
# The prepared web client may omit large icon/equip_show resources.
# Use the original game folder supplied for this Termux installation as fallback.
VAVEYLA_NODE_ASSET_ROOT="${VAVEYLA_ASSET_DIR:-/storage/emulated/0/DCIM/webroot_web}"
VAVEYLA_ASSET_OPTIONS=()
if [ -d "$VAVEYLA_NODE_ASSET_ROOT" ]; then
    VAVEYLA_ASSET_OPTIONS=(--asset-root "$VAVEYLA_NODE_ASSET_ROOT")
    printf 'Özgün resim kaynakları: %s\n' "$VAVEYLA_NODE_ASSET_ROOT"
fi
exec node "$VAVEYLA_NODE_DIR/src/main.js" --database "$VAVEYLA_NODE_DATABASE" --client-root "$VAVEYLA_NODE_CLIENT" "${VAVEYLA_ASSET_OPTIONS[@]}" "$@"
