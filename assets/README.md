# Omarchy Chess Assets

All assets in this directory are original project artwork or deterministic
generated output.  They are MIT-licensed with the rest of the project; there
are no commercial chess marks, downloaded samples, fonts, or network resources.

| Asset | Purpose | Source/rebuild command |
| --- | --- | --- |
| `icon.svg` | Color product mark: knight silhouette plus board motif | `python3 assets/generate_assets.py` |
| `icon-monochrome.svg` | Single-ink mark for compact bar surfaces | `python3 assets/generate_assets.py` |
| `icon-256.png` | 256 px marketplace/product preview mark | `python3 assets/generate_assets.py` |
| `pieces/classic/*.svg` | Twelve light/dark chess pieces | `python3 assets/generate_assets.py` |
| `sounds/*.wav` | Optional move/result cues | `python3 scripts/generate-sounds.py` |

## Validation

The following checks are offline and reproducible:

```bash
python3 -m py_compile assets/generate_assets.py scripts/generate-sounds.py
for svg in assets/icon.svg assets/icon-monochrome.svg assets/pieces/classic/*.svg; do
  xmllint --noout "$svg"
done
file assets/icon-256.png assets/sounds/*.wav
```

SVGs intentionally use the standard SVG namespace URL as required by XML;
they contain no external resource references.  The pieces also have a Unicode
fallback in the UI for systems where local SVG image loading is unavailable.

## Preview alt text

The icon is an ivory knight profile over a slate board grid inside an amber
rounded frame.  The classic set shows six ivory outlined pieces and six slate
pieces with ivory outlines.  The sound cues are short, quiet interface tones,
not music.
