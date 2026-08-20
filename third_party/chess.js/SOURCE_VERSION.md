# chess.js source provenance

- Package: `chess.js`
- Version: `1.4.0`
- License: `BSD-2-Clause`
- Upstream: <https://github.com/jhlywa/chess.js>
- Annotated tag: `v1.4.0`
- Tag object: `101efe3dc60a59b7259d1618fc3d77d7fbbb8e68`
- Source commit: `ce1ff9e9fc342984ff75ca475ab39f37888cb28a`
- npm tarball shasum: `edc1439492d1a0d7f530ba72b2b5398baece28a1`
- npm tarball integrity:
  `sha512-BBJgrrtKQOzFLonR0l+k64A98NLemPwNsCskwb+29bRwobUa4iTm51E1kwGPbWXAcfdDa18nad6vpPPKPWarqw==`
- Downloaded tarball SHA-256:
  `dce92e280439d7a16f645be94f22e6da50e579a1f3011d0a2381755bfe2c2ef7`
- Vendored ESM source SHA-256:
  `76c7c34f0e2e9ab076521a5d6fe786a9cce537bb1b6f29d32a9c9970b5b232d2`
- Vendored license SHA-256:
  `0b3a3c2b4432a26bb18f9d06f5bba4de015bcc980306b7db28b06025495e2186`
- Generated QML artifact SHA-256:
  `e48cfe37fbd980fc4a8c8b2e9a850f15841226e75c5374f16c8751c6acf6725f`

The `upstream/` directory contains the published package metadata, README,
TypeScript source, PGN parser source, and CommonJS/ESM distributions needed to
audit the runtime artifact. No upstream source has been edited.

## Reproducible QML artifact

Run:

```bash
./scripts/build-chess-vendor.sh
```

The script verifies the pinned ESM source hash, removes the ESM export and
source-map comment, adds small QML/CommonJS factory exports, and writes
`qml/chess.js` deterministically. Qt's QML JavaScript parser does not accept
the bundle's BigInt literals or class fields, and its runtime lacks
`Object.fromEntries` and `Array.prototype.flat`. The build replaces only
chess.js's internal 64-bit Zobrist PRNG with a deterministic 32-bit xorshift
table, converts the remaining zero BigInt initializers to numbers, initializes
class fields in the constructor, lowers object spread, and provides two small
PGN-parser compatibility helpers. Omarchy Chess does not use the vendor hash
or repetition helper; `PositionKey.js` owns FIDE repetition identity.
Differential legal-move, SAN, FEN, PGN, and perft tests guard this compatibility
transform. The generated artifact is committed so the installed plugin has no
build step or Node.js runtime dependency.
