# State Path Reference

## Base directory

```text
${XDG_STATE_HOME:-$HOME/.local/state}/omarchy-chess
```

## Files

### `settings.json`

Global game preferences.

### `active-game.json`

One resumable unfinished or not-yet-archived completed game.

### `history.json`

Summary index for completed records.

### `games/<game-id>.json`

Immutable completed game record.

### `games/<game-id>.pgn`

Portable PGN.

### `recovery/`

Preserved invalid/original files and migration backups.

### `diagnostics/`

Bounded local diagnostic bundles when explicitly created.

## Runtime files

If lock/temp files are needed, prefer:

```text
${XDG_RUNTIME_DIR:-/tmp}/omarchy-chess-<uid>/
```

Temporary atomic-write files should normally be in the same state directory as their destination for rename semantics and cleaned safely.

## Source directory

```text
~/.config/omarchy/plugins/io.github.rodrix2000.chess/
```

Never store mutable game data here.

## Permissions

Project directories/files should be user-owned and not world-writable. Sensitive private game records are local user data even though they are not credentials.

## Backup recommendation

Pause game, then copy the base directory. PGN files are the most portable recovery format.
