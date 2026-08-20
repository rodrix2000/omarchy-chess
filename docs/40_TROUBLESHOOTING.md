# Troubleshooting Guide

## Plugin does not appear

Run:

```bash
omarchy plugin list
omarchy plugin validate ~/.config/omarchy/plugins/io.github.rodrix2000.chess
omarchy-shell shell rescanPlugins
```

Confirm the repository directory name matches the manifest ID and entry-point filenames have correct case.

## Clicking the bar icon does nothing

Check:

```bash
journalctl --user --since -5min | grep -i 'chess\|panel plugin'
```

Restart the shell after manifest kind/entry-point changes:

```bash
omarchy-restart-shell
```

## The panel opens but has no game service

- Verify manifest includes `service` and `entryPoints.service`.
- Verify plugin is enabled, not only copied.
- Confirm panel declares `property var service: null`.
- Confirm bar resolves `bar.shell.serviceFor(moduleName)`.

## QML edits do not appear

- Ensure the real files are under the plugin directory, not a symlink inside it.
- Rescan plugins.
- Restart shell for already-loaded panel/service changes.
- Check filename case.

## Computer never moves

- Check game is in `active-computer` state.
- Check worker health/error code.
- Retry computer move.
- Lower difficulty.
- Confirm no stale token/FEN mismatch.
- Use diagnostics rather than deleting the active game.

## Computer move is illegal

This is a release-critical bug.

- Pause game.
- Copy sanitized FEN and returned UCI.
- Record difficulty and version.
- Open a mechanics issue.
- Do not manually alter persisted JSON.

## Game will not save

The game should pause and remain in memory.

- Use Retry Save.
- Copy/export PGN.
- Check state directory permissions and free disk space.
- Inspect error code.
- Do not close the shell until export/retry if the game exists only in memory.

## Active game is corrupt

The plugin should quarantine the file under recovery and offer a valid backup or PGN reconstruction.

Do not delete recovery data before filing a bug or extracting PGN.

## Pieces are missing

- Confirm asset files exist and case matches.
- Check SVG validity.
- Unicode fallback should remain playable.
- Review theme contrast.

## Sound does not work

Gameplay should continue silently.

- Confirm sound enabled and volume.
- Check Qt Multimedia support.
- Inspect asset path.
- No system package installation should be required solely for the core game.

## Keyboard does not control board

- Click/focus the window once to diagnose.
- Check panel focus target and modal state.
- Verify text field is not consuming keys.
- Escape should close modal or clear selection first.

## Clock seems wrong

- Capture current saved clock state and timestamps.
- Check pause-on-close behavior.
- Use fake-time unit tests for reproduction.
- Do not infer authority from display refresh rate.

## Reset settings only

Use the in-app reset or remove `settings.json` while preserving active/history files. Never suggest deleting the full state directory unless the user intends to erase all games.
