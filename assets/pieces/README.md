# Piece Assets

`classic/` is the original Omarchy Chess Staunton-inspired set.  The geometry
was drawn for this project and is intentionally simple enough to remain clear
at 32 px while still showing a dark outline, light outline, and small interior
highlight.  White pieces use an ivory fill with a charcoal outline; black
pieces use a slate fill with an ivory outline.  That distinction remains
visible on both light and dark board squares and does not depend on color alone.

The SVGs contain only local paths, circles, and a title for accessibility. They
have no fonts, scripts, event handlers, stylesheets, or external references.
When an SVG cannot be loaded, the UI uses its documented Unicode fallback.

## Rebuild

From the repository root:

```bash
python3 assets/generate_assets.py
```

The piece source geometry lives in the generator so the twelve checked-in SVGs
can be recreated offline.  The same command also regenerates the product icon
SVGs and (when `rsvg-convert` or ImageMagick is installed) the 256 px PNG.

## Provenance and license

These are project-owned original assets.  They are distributed under the
repository MIT License; no third-party artwork or font is embedded.  See
`THIRD_PARTY_NOTICES.md` for the complete asset provenance record.
