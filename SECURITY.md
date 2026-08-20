# Security Policy

Omarchy plugins run unsandboxed inside the long-lived `omarchy-shell` process with the current user's permissions. Review the repository and its changes before installing or updating.

## Supported version

Security fixes are provided for the latest `1.0.x` release. Report suspected vulnerabilities through the repository's private GitHub Security Advisory flow rather than a public issue.

## Runtime boundary

Omarchy Chess has no network client, telemetry, account, remote code download, install hook, `sudo`, package-manager action, browser surface, external daemon, or bundled executable chess engine. Runtime code is committed QML, JavaScript, JSON, SVG, and WAV.

The plugin starts only fixed, project-owned filesystem operations for XDG directory creation, active-record cleanup, and corrupt-record recovery. Imported text is never used as a command or evaluated as code. Clipboard writes use Quickshell's native clipboard property after an explicit user action.

## Data safety

- Mutable files stay under `${XDG_STATE_HOME:-$HOME/.local/state}/omarchy-chess`, except an explicit user-selected PGN export.
- Active/settings/history writes and PGN exports use atomic `FileView` writes.
- Game IDs are restricted before they become owned record paths.
- JSON, FEN, PGN, move arrays, history, worker requests, names, headers, and diagnostics are bounded and validated.
- Persisted chess state is checked structurally and semantically against the rules authority before use.
- Invalid active state is copied into `recovery/` and is not silently replaced.
- Unknown future schema versions are rejected without overwrite.
- Completed records are archived before the active record is cleared.

## Computer opponent

Search runs in one WorkerScript with hard time, depth, node, quiescence, and transposition-table bounds. Responses are checked against protocol version, request token, game ID, source FEN, current state, and final legal UCI before the controller can commit them. Stale or malformed responses are non-mutating.

## Dependencies and assets

`chess.js` 1.4.0 is pinned by tag, commit, source hash, preserved BSD-2-Clause license, and a reproducible compatibility transform. Original SVG and WAV assets are reproducibly generated and scanned for scripts, handlers, external resources, invalid audio structure, and clipping. No runtime dependency is downloaded.

## Diagnostics and privacy

Diagnostics are bounded and exclude FEN, PGN, player names, clipboard content, arbitrary environment values, and private user state. Preview/demo records are synthetic. See [docs/54_PRIVACY_STATEMENT.md](docs/54_PRIVACY_STATEMENT.md) for the data inventory.

## Reporting

Include the plugin version, Omarchy version, affected action, and a minimal reproduction. If chess state is relevant, provide a sanitized FEN or PGN only if you are comfortable sharing it. Do not post credentials, private game records, or sensitive system paths.
