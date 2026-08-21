#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

release_tmp=""
cleanup() {
  [[ -z "$release_tmp" ]] || rm -rf -- "$release_tmp"
}
trap cleanup EXIT

fail() {
  echo "release-check: $*" >&2
  exit 1
}

pass() {
  echo "release-check: PASS — $*"
}

for command in omarchy node python3 rg git tar sha256sum; do
  command -v "$command" >/dev/null 2>&1 || fail "required tool not found: $command"
done

omarchy plugin validate "$ROOT"
pass "Omarchy manifest and entry points"

python3 - <<'PY'
import json
import struct
from pathlib import Path

root = Path.cwd()
manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
assert manifest["schemaVersion"] == 1
assert manifest["id"] == "io.github.rodrix2000.chess"
assert manifest["version"] == "1.0.5"
assert set(manifest["kinds"]) == {"service", "panel", "bar-widget"}
version = manifest["version"]
assert f'var PLUGIN_VERSION = "{version}"' in (root / "engine/GameController.js").read_text(encoding="utf-8")
assert f'var DEFAULT_PLUGIN_VERSION = "{version}"' in (root / "engine/PersistenceModel.js").read_text(encoding="utf-8")
assert f'? String(manifest.version) : "{version}"' in (root / "Service.qml").read_text(encoding="utf-8")
for required in (
    "README.md", "LICENSE", "SECURITY.md", "CHANGELOG.md",
    "THIRD_PARTY_NOTICES.md", "preview.png",
):
    assert (root / required).is_file(), required

preview = (root / "preview.png").read_bytes()
assert preview[:8] == b"\x89PNG\r\n\x1a\n"
width, height = struct.unpack(">II", preview[16:24])
assert (width, height) == (1280, 800), (width, height)
assert (root / "demo.mp4").is_file() or (root / "demo.gif").is_file()

for path in [root / "manifest.json", *sorted((root / "schemas").glob("*.json"))]:
    json.loads(path.read_text(encoding="utf-8"))
print("valid: release metadata, JSON, preview, and demo contracts")
PY
pass "release metadata and preview contracts"

link="$(find . -name .git -prune -o -type l -print -quit)"
[[ -z "$link" ]] || fail "symlink is not allowed: $link"

forbidden="$(find . -name .git -prune -o -type f \
  \( -name '*.pyc' -o -name '*.bak' -o -name 'active-game.json' \
     -o -name 'history.json' -o -name 'settings.json' \) -print -quit)"
[[ -z "$forbidden" ]] || fail "release contains a cache, backup, or user-state file: $forbidden"

while IFS= read -r executable; do
  case "$executable" in
    ./scripts/*.sh|./scripts/*.py|./assets/*.py) ;;
    *) fail "unexpected executable file: $executable" ;;
  esac
done < <(find . -name .git -prune -o -type f -perm /111 -print)
pass "source tree contains no symlinks, state, cache, or unexpected executables"

runtime_violation="$(rg -l \
  'QtWebEngine|WebView|XMLHttpRequest|WebSocket|fetch[[:space:]]*\(|bash[[:space:]]*,[[:space:]]*["'\"']-c|curl[[:space:]]|wget[[:space:]]' \
  Service.qml Panel.qml BarWidget.qml PersistenceStore.qml components engine \
  -g '*.qml' -g '*.js' -g '*.mjs' -g '!ChessVendor.mjs' || true)"
[[ -z "$runtime_violation" ]] || fail "forbidden runtime/network API found in: $runtime_violation"

secret_violation="$(rg -l --hidden \
  -g '!.git/**' -g '!third_party/**' \
  'AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|-----BEGIN ([A-Z0-9 ]+ )?PRIVATE KEY-----' \
  . || true)"
[[ -z "$secret_violation" ]] || fail "possible committed secret found in: $secret_violation"
pass "runtime network/process scan and secret-pattern scan"

for script in scripts/*.sh; do
  bash -n "$script"
done
if command -v shellcheck >/dev/null 2>&1; then
  shellcheck scripts/*.sh
  pass "shellcheck"
else
  echo "release-check: NOTE — shellcheck unavailable; bash -n and manual review used"
fi

./scripts/build-chess-vendor.sh --check

asset_hashes() {
  sha256sum assets/icon.svg assets/icon-monochrome.svg assets/icon-256.png \
    assets/pieces/modern/*.png assets/pieces/SHA256SUMS \
    assets/boards/*.png assets/boards/SHA256SUMS assets/sounds/*.wav | sort
}
before_assets="$(asset_hashes)"
sha256sum -c assets/pieces/SHA256SUMS >/dev/null
(
  cd assets/boards
  sha256sum -c SHA256SUMS >/dev/null
)
python3 assets/generate_assets.py >/dev/null
python3 scripts/generate-sounds.py >/dev/null
after_assets="$(asset_hashes)"
[[ "$before_assets" == "$after_assets" ]] || fail "generated assets are not reproducible"

python3 - <<'PY'
import re
import struct
import wave
import xml.etree.ElementTree as ET
import zlib
from pathlib import Path

root = Path.cwd()
pieces = sorted((root / "assets/pieces/modern").glob("*.png"))
boards = sorted((root / "assets/boards").glob("*.png"))
sounds = sorted((root / "assets/sounds").glob("*.wav"))
assert len(pieces) == 12
assert len(boards) == 3
assert len(sounds) == 7
for path in [root / "assets/icon.svg", root / "assets/icon-monochrome.svg"]:
    text = path.read_text(encoding="utf-8")
    ET.fromstring(text)
    assert not re.search(r"<script|\son[a-z]+\s*=|(?:href|src)\s*=\s*['\"](?:https?:|data:|file:)", text, re.I)
for path in pieces:
    data = path.read_bytes()
    assert data[:8] == b"\x89PNG\r\n\x1a\n", path
    position = 8
    chunks = []
    while position < len(data):
        length = struct.unpack(">I", data[position:position + 4])[0]
        kind = data[position + 4:position + 8]
        payload = data[position + 8:position + 8 + length]
        checksum = struct.unpack(">I", data[position + 8 + length:position + 12 + length])[0]
        assert zlib.crc32(kind + payload) & 0xffffffff == checksum, path
        chunks.append(kind)
        position += 12 + length
    assert position == len(data), path
    assert chunks == [b"IHDR", b"PLTE", b"tRNS", b"IDAT", b"IEND"], (path, chunks)
    width, height, depth, color_type, compression, filtering, interlace = struct.unpack(">IIBBBBB", data[16:29])
    assert (width, height, depth, color_type) == (512, 512, 8, 3), path
    assert (compression, filtering, interlace) == (0, 0, 0), path
for path in boards:
    data = path.read_bytes()
    assert data[:8] == b"\x89PNG\r\n\x1a\n", path
    position = 8
    chunks = []
    while position < len(data):
        length = struct.unpack(">I", data[position:position + 4])[0]
        kind = data[position + 4:position + 8]
        payload = data[position + 8:position + 8 + length]
        checksum = struct.unpack(">I", data[position + 8 + length:position + 12 + length])[0]
        assert zlib.crc32(kind + payload) & 0xffffffff == checksum, path
        chunks.append(kind)
        position += 12 + length
    assert position == len(data), path
    assert chunks[0] == b"IHDR" and chunks[-1] == b"IEND", path
    assert all(kind in (b"IHDR", b"IDAT", b"IEND") for kind in chunks), (path, chunks)
    width, height, depth, color_type, compression, filtering, interlace = struct.unpack(">IIBBBBB", data[16:29])
    assert (width, height, depth, color_type) == (1254, 1254, 8, 2), path
    assert (compression, filtering, interlace) == (0, 0, 0), path
for path in sounds:
    with wave.open(str(path), "rb") as wav:
        assert wav.getnchannels() == 1
        assert wav.getsampwidth() == 2
        assert wav.getframerate() == 44100
        assert wav.getnframes() / wav.getframerate() <= 0.5
print("valid: modern piece PNG, board PNG, original SVG, and WAV asset inventory/security")
PY
pass "pinned dependency and reproducible original assets"

./scripts/validate.sh
pass "full rules, perft, controller, AI, persistence, and QML suite"

node tests/perft-release.mjs
pass "release-depth perft suite"

release_tmp="$(mktemp -d)"
source_work="$release_tmp/source"
origin_repo="$release_tmp/origin.git"
test_home="$release_tmp/home"
test_state="$release_tmp/state"
stub_bin="$release_tmp/bin"
mkdir -p "$source_work" "$test_home" "$test_state/omarchy-chess" "$stub_bin"
tar -C "$ROOT" --exclude=.git --exclude='*.pyc' -cf - . | tar -C "$source_work" -xf -
git -C "$source_work" init -q -b main
git -C "$source_work" add .
git -C "$source_work" -c user.name='Release Check' \
  -c user.email='release-check@invalid.local' commit -q -m 'v1.0.5 fixture'
git clone -q --bare "$source_work" "$origin_repo"

printf '%s\n' \
  '#!/usr/bin/env bash' \
  'if [[ "$*" == "shell listPlugins" ]]; then' \
  '  printf '\''%s\n'\'' '\''[{"id":"io.github.rodrix2000.chess","enabled":false,"firstParty":false,"kinds":["service","panel","bar-widget"],"name":"Omarchy Chess"}]'\''' \
  'elif [[ "${1:-}" == "shell" && "${2:-}" == "enablePlugin" ]]; then' \
  '  printf '\''ok\n'\''' \
  'fi' \
  'exit 0' > "$stub_bin/omarchy-shell"
chmod 0755 "$stub_bin/omarchy-shell"

fixture_env=(
  env HOME="$test_home" XDG_STATE_HOME="$test_state"
  PATH="$stub_bin:$PATH" OMARCHY_CHESS_DISABLE_AUDIO=1
)
"${fixture_env[@]}" omarchy plugin add "file://$origin_repo" --enable --yes >/dev/null
installed="$test_home/.config/omarchy/plugins/io.github.rodrix2000.chess"
[[ -f "$installed/manifest.json" ]] || fail "clean CLI install did not create the plugin checkout"
[[ -f "$installed/third_party/chess.js/upstream/dist/esm/chess.js" ]] \
  || fail "clean CLI install omitted the pinned vendor source"
omarchy plugin validate "$installed"
printf '%s\n' 'state-survives-source-lifecycle' > "$test_state/omarchy-chess/release-fixture"

printf '%s\n' 'update-fixture' > "$source_work/UPDATE_FIXTURE"
git -C "$source_work" add UPDATE_FIXTURE
git -C "$source_work" -c user.name='Release Check' \
  -c user.email='release-check@invalid.local' commit -q -m 'update fixture'
git -C "$source_work" push -q "$origin_repo" main
"${fixture_env[@]}" omarchy plugin update io.github.rodrix2000.chess --yes >/dev/null
[[ -f "$installed/UPDATE_FIXTURE" ]] || fail "CLI update did not fast-forward the plugin"

"${fixture_env[@]}" omarchy plugin remove io.github.rodrix2000.chess --yes >/dev/null
[[ ! -e "$installed" ]] || fail "CLI remove left the plugin checkout behind"
[[ -f "$test_state/omarchy-chess/release-fixture" ]] || fail "CLI remove deleted retained state"
"${fixture_env[@]}" omarchy plugin add "file://$origin_repo" --enable --yes >/dev/null
[[ -f "$installed/UPDATE_FIXTURE" ]] || fail "CLI reinstall did not restore the current release"
[[ -f "$test_state/omarchy-chess/release-fixture" ]] || fail "CLI reinstall lost retained state"
pass "clean Omarchy CLI install, update, remove, reinstall, and retained-state fixture"

if [[ -f demo.mp4 ]] && command -v ffprobe >/dev/null 2>&1; then
  duration="$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 demo.mp4)"
  python3 - "$duration" <<'PY'
import sys
duration = float(sys.argv[1])
assert 5 <= duration <= 60, duration
print(f"valid: demo duration {duration:.2f}s")
PY
fi

pass "Omarchy Chess v1.0.5 release candidate"
