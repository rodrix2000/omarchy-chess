# Installation, Update, Removal, and Data Management

## Install

Review the repository because Omarchy plugins run unsandboxed inside the shell.

```bash
omarchy plugin add https://github.com/rodrix2000/omarchy-chess.git --enable
```

Expected:

- Repository cloned into the user plugin directory
- Manifest validated
- Plugin enabled
- Bar widget placed in default section
- No plugin install hook, sudo, or package installation

## First launch

Click the bar knight or run:

```bash
omarchy-shell shell toggle io.github.rodrix2000.chess '{}'
```

## Update

```bash
omarchy plugin update io.github.rodrix2000.chess
```

Omarchy shows the diff and validates the new revision. Local game data stays outside the checkout.

## Pin a version

Advanced users may use Git inside the installed checkout to select a reviewed tag. Warn that older releases may not understand newer state schemas.

## Disable

```bash
omarchy plugin disable io.github.rodrix2000.chess
```

Disabling stops the service and hides the bar/panel. It does not delete game state.

## Remove source

```bash
omarchy plugin remove io.github.rodrix2000.chess
```

This removes/disables the plugin checkout according to Omarchy behavior. User data remains.

## Reinstall

Reinstalling a compatible version should detect and resume existing state.

## Delete one game

Use the history UI with confirmation. Completed record and PGN are removed together, then history index is atomically updated.

## Reset settings

Use Settings → Reset. Active/history data remains.

## Delete all data

```bash
rm -rf "${XDG_STATE_HOME:-$HOME/.local/state}/omarchy-chess"
```

This is irreversible.

## Backup

Copy the project state directory while the game is paused. PGN files are portable even if JSON schemas evolve.

## Restore

Restore into the same XDG state location while the plugin is disabled or shell is stopped. On next start, schemas and semantic consistency are validated.
