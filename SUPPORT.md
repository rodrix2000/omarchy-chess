# Support

## Before opening an issue

1. Update to the latest plugin release.
2. Validate the plugin checkout.
3. Review `docs/40_TROUBLESHOOTING.md`.
4. Capture the plugin and Omarchy versions.
5. Preserve the active game and recovery files.

## Commands

```bash
omarchy plugin validate ~/.config/omarchy/plugins/io.github.rodrix2000.chess
journalctl --user --since -10min | grep -i 'chess\|omarchy'
```

## Chess mechanics problem

Provide:

- FEN
- Side to move
- Attempted move
- Expected behavior
- Actual behavior
- Plugin version

A minimal FEN is preferred over a private full PGN.

## Save or recovery problem

Do not delete the project state directory. Use Copy PGN or recovery tools first. Report the error code and whether the game remains visible.

## Security problem

Use a private GitHub security advisory. Do not post exploit details or private files publicly.

## Feature requests

Review the release notes and existing issues first. Online play is outside the
current offline release and should not be treated as a v1 defect.
