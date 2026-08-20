# Omarchy Chess Assets

All assets in this directory are original project artwork, supplied canonical
masters, or deterministic generated output. They are MIT-licensed with the
rest of the project and load entirely from the installed plugin.

| Asset | Purpose | Source/rebuild command |
| --- | --- | --- |
| `icon.svg` | Color product mark: knight silhouette plus board motif | `python3 assets/generate_assets.py` |
| `icon-monochrome.svg` | Single-ink mark for compact bar surfaces | `python3 assets/generate_assets.py` |
| `icon-256.png` | 256 px marketplace/product preview mark | `python3 assets/generate_assets.py` |
| `pieces/modern/*.png` | Twelve light/dark modern chess pieces | Canonical 512 px masters; verify with `sha256sum -c assets/pieces/SHA256SUMS` |
| `sounds/*.wav` | Optional move/result cues | `python3 scripts/generate-sounds.py` |

## Validation

The following checks are offline and reproducible:

```bash
python3 -m py_compile assets/generate_assets.py scripts/generate-sounds.py
sha256sum -c assets/pieces/SHA256SUMS
for svg in assets/icon.svg assets/icon-monochrome.svg; do
  xmllint --noout "$svg"
done
file assets/icon-256.png assets/pieces/modern/*.png assets/sounds/*.wav
```

SVGs intentionally use the standard SVG namespace URL as required by XML;
they contain no external resource references. The modern pieces are transparent
indexed PNGs containing only standard image chunks. The UI retains a Unicode
fallback if a local piece image cannot be loaded.

## Preview alt text

The icon is an ivory knight profile over a slate board grid inside an amber
rounded frame. The modern set shows six dimensional ivory pieces and six
charcoal pieces with strong contrasting outlines. The sound cues are short,
quiet interface tones, not music.
