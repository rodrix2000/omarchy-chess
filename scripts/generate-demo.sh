#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
preview="$repo_dir/preview.png"
output="$repo_dir/demo.mp4"
font_file="${OMARCHY_CHESS_DEMO_FONT:-/usr/share/fonts/TTF/JetBrainsMonoNerdFont-Regular.ttf}"

command -v ffmpeg >/dev/null 2>&1 || {
  echo "generate-demo: ffmpeg is required" >&2
  exit 2
}
command -v ffprobe >/dev/null 2>&1 || {
  echo "generate-demo: ffprobe is required" >&2
  exit 2
}
[[ -f "$preview" ]] || {
  echo "generate-demo: preview.png is missing; run scripts/generate-preview.sh" >&2
  exit 2
}
[[ -f "$font_file" ]] || {
  echo "generate-demo: deterministic font is missing: $font_file" >&2
  exit 2
}

filter="zoompan=z='if(lt(on,125),1,if(lt(on,375),1+(on-125)*0.0006,if(lt(on,625),1.15,1.15-(on-625)*0.000545)))':x='if(lt(on,375),0,if(lt(on,625),(on-375)/250*(iw-iw/zoom),iw-iw/zoom))':y='(ih-ih/zoom)/2':d=900:s=1280x800:fps=25"
filter+=",drawbox=x=0:y=716:w=1280:h=84:color=#151a1f@0.90:t=fill"
filter+=",drawtext=fontfile=$font_file:text='Native chess for Omarchy':fontcolor=#ebe7dc:fontsize=30:x=(w-text_w)/2:y=738:enable='between(t,0,4.99)'"
filter+=",drawtext=fontfile=$font_file:text='Computer and local two-player':fontcolor=#ebe7dc:fontsize=30:x=(w-text_w)/2:y=738:enable='between(t,5,9.99)'"
filter+=",drawtext=fontfile=$font_file:text='Complete rules  ·  clocks  ·  legal markers':fontcolor=#ebe7dc:fontsize=28:x=(w-text_w)/2:y=738:enable='between(t,10,14.99)'"
filter+=",drawtext=fontfile=$font_file:text='Bounded computer search stays off the shell thread':fontcolor=#ebe7dc:fontsize=26:x=(w-text_w)/2:y=738:enable='between(t,15,19.99)'"
filter+=",drawtext=fontfile=$font_file:text='Close, pause, and resume the exact position':fontcolor=#ebe7dc:fontsize=28:x=(w-text_w)/2:y=738:enable='between(t,20,24.99)'"
filter+=",drawtext=fontfile=$font_file:text='History  ·  replay  ·  portable PGN':fontcolor=#ebe7dc:fontsize=30:x=(w-text_w)/2:y=738:enable='between(t,25,29.99)'"
filter+=",drawtext=fontfile=$font_file:text='Offline  ·  private  ·  no account':fontcolor=#e1aa62:fontsize=31:x=(w-text_w)/2:y=738:enable='between(t,30,36)'"

ffmpeg -hide_banner -loglevel error -y \
  -loop 1 -framerate 25 -i "$preview" -t 36 \
  -vf "$filter" \
  -an -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p \
  -threads 1 -map_metadata -1 -metadata creation_time=1970-01-01T00:00:00Z \
  -movflags +faststart "$output"

python3 - "$output" "$(ffprobe -v error -show_entries stream=width,height \
  -of csv=p=0:s=x "$output")" "$(ffprobe -v error -show_entries format=duration \
  -of default=nw=1:nk=1 "$output")" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
assert sys.argv[2] == "1280x800", sys.argv[2]
duration = float(sys.argv[3])
assert 35.9 <= duration <= 36.1, duration
assert path.stat().st_size < 15 * 1024 * 1024, path.stat().st_size
print(f"generate-demo: verified 1280x800, {duration:.2f}s, {path.stat().st_size} bytes")
PY

echo "generate-demo: wrote $output"
