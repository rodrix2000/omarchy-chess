# Board Assets

`charcoal.png`, `green.png`, and `ivory.png` are the three selectable textured
chessboards. They are 1254×1254, 8-bit, non-interlaced RGB PNGs supplied by
project owner Rudy Rodriguez and distributed under the repository MIT License.

The committed files preserve the supplied pixel content exactly. Export-tool
and C2PA metadata was removed from the PNG containers so the offline runtime
ships no embedded URLs, certificates, private source paths, or unrelated SVG
payloads. Integrity is pinned in `SHA256SUMS`.

The QML renderer samples only each image's playable 8×8 surface and retains the
native board border/focus treatment. The sampled square averages used for
fallbacks and contrast review are:

| Theme | Light square | Dark square |
| --- | --- | --- |
| Charcoal | `#c1b8a9` | `#3a3d42` |
| Green | `#e0d09f` | `#193e1b` |
| Ivory | `#e7c392` | `#703e1f` |

The existing modern pieces remain unchanged. Their graphite outline separates
light pieces from all three light squares, and their ivory outline separates
dark pieces from all three dark squares without changing the traditional
white-versus-black identity.

Verify from this directory with:

```bash
sha256sum -c SHA256SUMS
```
