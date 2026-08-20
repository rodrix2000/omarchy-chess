# Piece Assets

`modern/` is the current Omarchy Chess set. Each piece is a 512×512 transparent
PNG with consistent perspective, dimensional shading, and a high-contrast
outline. White pieces use an ivory body with a charcoal edge; black pieces use
a charcoal body with an ivory edge. That distinction remains visible on both
light and dark board squares and does not depend on color alone.

The renderer uses the audited nontransparent bounds of each master to remove
uneven canvas padding at display time. Each black piece is fitted to the visible
height and vertical placement of its matching white piece; the canonical PNGs
remain unchanged and retain their original geometry and checksums.

The PNGs contain only the standard `IHDR`, `PLTE`, `tRNS`, `IDAT`, and `IEND`
chunks—no text metadata, scripts, URLs, fonts, or external references. If a
piece image cannot be loaded, the UI uses its documented Unicode fallback.

## Integrity

From the repository root:

```bash
sha256sum -c assets/pieces/SHA256SUMS
```

The checked-in PNGs are the canonical masters and are not recompressed during a
build. `assets/generate_assets.py` continues to regenerate the product icon
SVGs and, when `rsvg-convert` or ImageMagick is installed, the 256 px icon PNG.
It also retains the V1.0.0 classic vector geometry for source-history
reproducibility, but that retired set is not emitted or shipped.

## Provenance and license

The modern masters were supplied by project owner Rudy Rodriguez for Omarchy
Chess and are distributed under the repository MIT License. No third-party
font or network resource is embedded. See `THIRD_PARTY_NOTICES.md` for the
complete asset provenance record.
