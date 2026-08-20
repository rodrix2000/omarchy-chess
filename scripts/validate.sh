#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

service_tmp=""
panel_tmp=""
computer_tmp=""
history_tmp=""
abandon_tmp=""
cleanup() {
  local path
  for path in "$service_tmp" "$panel_tmp" "$computer_tmp" "$history_tmp" "$abandon_tmp"; do
    [[ -z "$path" ]] || rm -rf -- "$path"
  done
}
trap cleanup EXIT

omarchy plugin validate "$ROOT"

omarchy_root="${OMARCHY_PATH:-/usr/share/omarchy}"
qml_lint="${QMLLINT:-}"
if [[ -z "$qml_lint" ]]; then
  qml_lint="$(command -v qmllint || true)"
fi
if [[ -z "$qml_lint" && -x /usr/lib/qt6/bin/qmllint ]]; then
  qml_lint="/usr/lib/qt6/bin/qmllint"
fi
if [[ -z "$qml_lint" ]]; then
  echo "error: qmllint was not found" >&2
  exit 1
fi

qml_files=(Service.qml BarWidget.qml Panel.qml)
while IFS= read -r -d '' file; do
  qml_files+=("$file")
done < <(find components -type f -name '*.qml' -print0 2>/dev/null || true)

qml_imports=(-I "$omarchy_root/shell")
if [[ -f "$omarchy_root/shell/Ui/qmldir" && -f "$omarchy_root/shell/Commons/qmldir" ]]; then
  qml_imports=(
    -i "$omarchy_root/shell/Ui/qmldir"
    -i "$omarchy_root/shell/Commons/qmldir"
  )
fi

"$qml_lint" -W 0 "${qml_imports[@]}" "${qml_files[@]}"

"$ROOT/scripts/build-chess-vendor.sh" --check

qml_scene="$(command -v qmlscene || true)"
if [[ -z "$qml_scene" && -x /usr/lib/qt6/bin/qmlscene ]]; then
  qml_scene="/usr/lib/qt6/bin/qmlscene"
fi
if [[ -n "$qml_scene" && -f tests/qml/RulesSmoke.qml ]]; then
  timeout 15s env -u DISPLAY -u WAYLAND_DISPLAY \
    QT_QPA_PLATFORM=minimal QT_QPA_PLATFORMTHEME= \
    "$qml_scene" tests/qml/RulesSmoke.qml
fi

quickshell_bin="$(command -v qs || command -v quickshell || true)"
if [[ -n "$quickshell_bin" && -f tests/qml/ServiceSmoke.qml ]]; then
  service_tmp="$(mktemp -d)"
  mkdir -p "$service_tmp/config" "$service_tmp/runtime" "$service_tmp/state"
  chmod 700 "$service_tmp/runtime"
  cp -a "$ROOT/." "$service_tmp/config/"
  cp -a "$omarchy_root/shell/Commons" "$service_tmp/config/Commons"
  cp -a "$omarchy_root/shell/Ui" "$service_tmp/config/Ui"
  cp "$ROOT/tests/qml/ServiceSmoke.qml" "$service_tmp/config/shell.qml"
  timeout 20s env -u DISPLAY -u WAYLAND_DISPLAY \
    XDG_RUNTIME_DIR="$service_tmp/runtime" \
    XDG_STATE_HOME="$service_tmp/state" \
    OMARCHY_CHESS_DISABLE_AUDIO=1 \
    QT_QPA_PLATFORM=minimal QT_QPA_PLATFORMTHEME= \
    "$quickshell_bin" --no-color -p "$service_tmp/config"
  python3 - "$service_tmp/state/omarchy-chess/active-game.json" <<'PY'
import json
import sys
from pathlib import Path

document = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
assert document["status"] == "paused"
assert [move["uci"] for move in document["moves"]] == ["e2e4"]
print("valid: QML service persistence smoke")
PY
fi

if [[ -n "$quickshell_bin" && -f tests/qml/PanelSmoke.qml ]]; then
  panel_tmp="$(mktemp -d)"
  mkdir -p "$panel_tmp/config" "$panel_tmp/runtime" "$panel_tmp/state"
  chmod 700 "$panel_tmp/runtime"
  cp -a "$ROOT/." "$panel_tmp/config/"
  cp -a "$omarchy_root/shell/Commons" "$panel_tmp/config/Commons"
  cp -a "$omarchy_root/shell/Ui" "$panel_tmp/config/Ui"
  cp "$ROOT/tests/qml/PanelSmoke.qml" "$panel_tmp/config/shell.qml"
  timeout 20s env -u DISPLAY -u WAYLAND_DISPLAY \
    XDG_RUNTIME_DIR="$panel_tmp/runtime" \
    XDG_STATE_HOME="$panel_tmp/state" \
    OMARCHY_CHESS_DISABLE_AUDIO=1 \
    QT_QPA_PLATFORM=minimal QT_QPA_PLATFORMTHEME= \
    "$quickshell_bin" --no-color -p "$panel_tmp/config"
  python3 - "$panel_tmp/state/omarchy-chess/active-game.json" <<'PY'
import json
import sys
from pathlib import Path

document = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
assert document["status"] == "paused"
assert [move["uci"] for move in document["moves"]] == ["e2e4"]
print("valid: QML panel local-game close/resume smoke")
PY
fi

if [[ -n "$quickshell_bin" && -f tests/qml/ComputerServiceSmoke.qml ]]; then
  computer_tmp="$(mktemp -d)"
  mkdir -p "$computer_tmp/config" "$computer_tmp/runtime" "$computer_tmp/state"
  chmod 700 "$computer_tmp/runtime"
  cp -a "$ROOT/." "$computer_tmp/config/"
  cp -a "$omarchy_root/shell/Commons" "$computer_tmp/config/Commons"
  cp -a "$omarchy_root/shell/Ui" "$computer_tmp/config/Ui"
  cp "$ROOT/tests/qml/ComputerServiceSmoke.qml" "$computer_tmp/config/shell.qml"
  timeout 25s env -u DISPLAY -u WAYLAND_DISPLAY \
    XDG_RUNTIME_DIR="$computer_tmp/runtime" \
    XDG_STATE_HOME="$computer_tmp/state" \
    OMARCHY_CHESS_DISABLE_AUDIO=1 \
    QT_QPA_PLATFORM=minimal QT_QPA_PLATFORMTHEME= \
    "$quickshell_bin" --no-color -p "$computer_tmp/config"
  python3 - "$computer_tmp/state/omarchy-chess/active-game.json" <<'PY'
import json
import re
import sys
from pathlib import Path

document = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
assert document["status"] == "paused"
assert len(document["moves"]) == 2
assert all(re.fullmatch(r"[a-h][1-8][a-h][1-8][qrbn]?", move["uci"])
           for move in document["moves"])
print("valid: QML off-thread computer full-move smoke")
PY
fi

if [[ -n "$quickshell_bin" && -f tests/qml/HistoryServiceSmoke.qml ]]; then
  history_tmp="$(mktemp -d)"
  mkdir -p "$history_tmp/config" "$history_tmp/runtime" "$history_tmp/state"
  chmod 700 "$history_tmp/runtime"
  cp -a "$ROOT/." "$history_tmp/config/"
  cp -a "$omarchy_root/shell/Commons" "$history_tmp/config/Commons"
  cp -a "$omarchy_root/shell/Ui" "$history_tmp/config/Ui"
  cp "$ROOT/tests/qml/HistoryServiceSmoke.qml" "$history_tmp/config/shell.qml"
  timeout 25s env -u DISPLAY -u WAYLAND_DISPLAY \
    XDG_RUNTIME_DIR="$history_tmp/runtime" \
    XDG_STATE_HOME="$history_tmp/state" \
    OMARCHY_CHESS_DISABLE_AUDIO=1 \
    QT_QPA_PLATFORM=minimal QT_QPA_PLATFORMTHEME= \
    "$quickshell_bin" --no-color -p "$history_tmp/config"
  python3 - "$history_tmp/state/omarchy-chess" <<'PY'
import json
import sys
from pathlib import Path

state = Path(sys.argv[1])
history = json.loads((state / "history.json").read_text(encoding="utf-8"))
settings = json.loads((state / "settings.json").read_text(encoding="utf-8"))
exports = list((state / "exports").glob("*.pgn"))
assert history["games"] == []
assert settings["appearance"]["coordinates"] is False
assert settings["audio"]["enabled"] is False
assert len(exports) == 1
pgn = exports[0].read_text(encoding="utf-8")
assert "[Result \"0-1\"]" in pgn
assert pgn.rstrip().endswith("0-1")
assert not list((state / "games").glob("*.json"))
assert not list((state / "games").glob("*.pgn"))
print("valid: QML history replay/export/settings/removal smoke")
PY
fi

if [[ -n "$quickshell_bin" && -f tests/qml/AbandonArchiveSmoke.qml ]]; then
  abandon_tmp="$(mktemp -d)"
  mkdir -p "$abandon_tmp/config" "$abandon_tmp/runtime" \
    "$abandon_tmp/state/omarchy-chess/games"
  chmod 700 "$abandon_tmp/runtime"
  cp -a "$ROOT/." "$abandon_tmp/config/"
  cp -a "$omarchy_root/shell/Commons" "$abandon_tmp/config/Commons"
  cp -a "$omarchy_root/shell/Ui" "$abandon_tmp/config/Ui"
  cp "$ROOT/tests/qml/AbandonArchiveSmoke.qml" "$abandon_tmp/config/shell.qml"
  cp "$ROOT/tests/fixtures/empty-history.json" \
    "$abandon_tmp/state/omarchy-chess/history.json"
  cp "$ROOT/tests/fixtures/abandoned-active-game.json" \
    "$abandon_tmp/state/omarchy-chess/active-game.json"
  cp "$ROOT/tests/fixtures/abandoned-completed-game.json" \
    "$abandon_tmp/state/omarchy-chess/games/fixture-abandoned-restore.json"
  cp "$ROOT/tests/fixtures/abandoned-completed-game.pgn" \
    "$abandon_tmp/state/omarchy-chess/games/fixture-abandoned-restore.pgn"
  timeout 20s env -u DISPLAY -u WAYLAND_DISPLAY \
    XDG_RUNTIME_DIR="$abandon_tmp/runtime" \
    XDG_STATE_HOME="$abandon_tmp/state" \
    OMARCHY_CHESS_DISABLE_AUDIO=1 \
    QT_QPA_PLATFORM=minimal QT_QPA_PLATFORMTHEME= \
    "$quickshell_bin" --no-color -p "$abandon_tmp/config"
  python3 - "$abandon_tmp/state/omarchy-chess" <<'PY'
import json
import sys
from pathlib import Path

state = Path(sys.argv[1])
active = json.loads((state / "active-game.json").read_text(encoding="utf-8"))
history = json.loads((state / "history.json").read_text(encoding="utf-8"))
assert active["status"] == "active-human"
assert history["games"] == []
assert len(list((state / "games").glob("*.json"))) == 1
assert len(list((state / "games").glob("*.pgn"))) == 1
print("valid: unchanged-history abandoned-game archive smoke")
PY
fi

if compgen -G "tests/*.test.mjs" > /dev/null; then
  node --test tests/*.test.mjs
fi

python3 - <<'PY'
import json
from pathlib import Path
for path in [Path("manifest.json"), *Path("schemas").glob("*.json")]:
    json.loads(path.read_text(encoding="utf-8"))
    print(f"valid: {path}")
PY
