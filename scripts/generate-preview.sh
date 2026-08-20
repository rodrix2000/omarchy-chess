#!/usr/bin/env bash
set -euo pipefail

# Render the deterministic native QML scene in a disposable Quickshell
# configuration. The host's Commons/Ui modules are copied only into the
# temporary staging tree because qs resolves its `qs.*` modules relative to a
# configuration root while scanning a standalone plugin.

repo_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
stage_dir=$(mktemp -d "${TMPDIR:-/tmp}/omarchy-chess-preview.XXXXXX")
trap 'rm -rf "$stage_dir"' EXIT

mkdir -p "$stage_dir/repo" "$stage_dir/config" "$stage_dir/state" \
  "$stage_dir/cache" "$stage_dir/runtime" "$stage_dir/home"
chmod 700 "$stage_dir/runtime"
cp -a "$repo_dir/." "$stage_dir/repo/"

if [[ -z "${OMARCHY_PATH:-}" || ! -d "${OMARCHY_PATH:-}/shell/Commons" ]]; then
  echo "generate-preview: OMARCHY_PATH/shell/Commons is required" >&2
  exit 2
fi
cp -a "$OMARCHY_PATH/shell/Commons" "$stage_dir/repo/Commons"
cp -a "$OMARCHY_PATH/shell/Ui" "$stage_dir/repo/Ui"

# Running from the staged root makes the same scene a standalone shell.qml;
# only these relative resource roots need rebasing in the disposable copy.
cp "$stage_dir/repo/tests/qml/PreviewScene.qml" "$stage_dir/repo/shell.qml"
sed -i \
  -e 's#../../components#components#g' \
  -e 's#../../assets#assets#g' \
  -e 's#../../preview.png#preview.png#g' \
  "$stage_dir/repo/shell.qml"

env -u GDK_BACKEND -u WAYLAND_DISPLAY -u QT_QPA_PLATFORMTHEME \
  QT_QPA_PLATFORM=offscreen \
  QT_QUICK_BACKEND=software \
  XDG_CONFIG_HOME="$stage_dir/config" \
  XDG_STATE_HOME="$stage_dir/state" \
  XDG_CACHE_HOME="$stage_dir/cache" \
  XDG_RUNTIME_DIR="$stage_dir/runtime" \
  HOME="$stage_dir/home" \
  timeout 30s qs --no-color -p "$stage_dir/repo/shell.qml"

generated="$stage_dir/repo/preview.png"
if [[ ! -f "$generated" ]]; then
  echo "generate-preview: Quickshell did not create preview.png" >&2
  exit 1
fi

python3 - "$generated" <<'PY'
from pathlib import Path
import struct
import sys

path = Path(sys.argv[1])
data = path.read_bytes()
if data[:8] != b"\x89PNG\r\n\x1a\n" or len(data) < 24:
    raise SystemExit("generate-preview: output is not a PNG")
width, height = struct.unpack(">II", data[16:24])
if (width, height) != (1280, 800):
    raise SystemExit(f"generate-preview: expected 1280x800, got {width}x{height}")
print(f"generate-preview: verified {width}x{height} PNG")
PY

cp "$generated" "$repo_dir/preview.png"
echo "generate-preview: wrote $repo_dir/preview.png"
