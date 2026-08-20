#!/usr/bin/env bash
set -euo pipefail

PLUGIN_ID="io.github.rodrix2000.chess"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="$HOME/.config/omarchy/plugins/$PLUGIN_ID"

mkdir -p "$TARGET"
rsync -a --delete \
  --exclude ".git" \
  --exclude "node_modules" \
  --exclude "coverage" \
  --exclude "/dist" \
  "$ROOT/" "$TARGET/"

omarchy plugin validate "$TARGET"
omarchy-shell shell rescanPlugins
omarchy plugin enable "$PLUGIN_ID" --section right

echo "Installed at $TARGET"
echo "Open: omarchy-shell shell toggle $PLUGIN_ID '{}'"
