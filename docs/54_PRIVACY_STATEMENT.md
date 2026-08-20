# Privacy Statement

## Summary

Omarchy Chess Version 1 is an offline, local-first application.

## Data collected

The plugin does not collect or transmit telemetry, analytics, account data, device fingerprints, advertising identifiers, or usage events.

## Network

Version 1 makes no gameplay network requests and has no hosted backend.

Git-based plugin installation and updates are performed by the user through Omarchy/GitHub, not by hidden plugin telemetry.

## Local data

The plugin stores:

- Settings
- Active game
- Completed game history
- PGN files
- Recovery files
- Local diagnostics

Default location:

```text
$XDG_STATE_HOME/omarchy-chess/
```

Fallback:

```text
~/.local/state/omarchy-chess/
```

## Player names

Local player names and computer labels may appear in local game records and PGN exports. They are not transmitted by the plugin.

## Diagnostics

Default diagnostics exclude private PGN, FEN, names, clipboard content, and unrelated environment data. A user may explicitly choose to share sanitized game information when reporting a bug.

## Clipboard and export

The plugin writes PGN to the clipboard only after an explicit user action. Saving a PGN writes to a user-selected destination.

## Removal

Removing the plugin does not delete game history automatically. This protects against accidental data loss.

To delete all data:

```bash
rm -rf "${XDG_STATE_HOME:-$HOME/.local/state}/omarchy-chess"
```

## Future online features

Any future online correspondence feature requires a new privacy/security design and updated statement. It is not part of V1.
