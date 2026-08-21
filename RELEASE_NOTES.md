# Omarchy Chess v1.0.5

Omarchy Chess v1.0.5 is a focused reliability and display-safety update for the native, offline chess game for Omarchy.

## Fixed

- Prevented valid computer searches from being falsely failed when the engine's guaranteed first search pass outlives its soft think-time budget
- Kept emergency low-clock searches on a short deadline while allowing normal profiles enough time to complete their first pass
- Reported untimed computer failures without incorrectly claiming that a clock was paused
- Rendered active-game, history, and replay player names as plain text so crafted names cannot trigger rich-text resource loading

## Compatibility

- Minimum tested line: Omarchy Quattro (Omarchy 4)
- Verified environment: Omarchy `4.0.0-1`, Quickshell `0.3.0.r20.g28771c7`, Qt `6.11.1`
- State/settings/history/completed-game schema: `1`
- Rules dependency: `chess.js` `1.4.0`, BSD-2-Clause
- No migration is required from v1.0.0 through v1.0.4

## Install

```bash
omarchy plugin add https://github.com/rodrix2000/omarchy-chess.git --enable
```

## Update

```bash
omarchy plugin update io.github.rodrix2000.chess
```

## Data safety

Game state remains under `${XDG_STATE_HOME:-$HOME/.local/state}/omarchy-chess` when the plugin is disabled, removed, updated, or reinstalled. Completed PGN is portable; atomic JSON records retain exact controller and repetition state.

## Verification

- Standard six-position quick and deeper release perft suites
- Complete rules, adjudication, clocks, controller, persistence, PGN, and migration-ready schema tests
- Real Quickshell service, panel, computer-reply, history/replay/export, and five-breakpoint responsive journeys
- Real Quickshell regression coverage for the computer worker's hard response deadline
- 1,000 seeded generated positions across all computer profiles with final legal-move checks
- Clean Omarchy CLI install, update, remove, reinstall, and retained-state fixture
- Real Quickshell recovery journey for an already-archived abandoned game with unchanged history
- Runtime-network, secret-pattern, symlink, executable, PNG/SVG/WAV, license, checksum, and reproducibility audits

## Known limitations

- No online play, accounts, cloud sync, variants, or chat in V1
- Computer profiles are descriptive, not Elo ratings or a professional analysis engine
- Marketplace validation and listing are separate from the public GitHub release

## Credits and licenses

Project code and original assets are MIT. Vendored `chess.js` is BSD-2-Clause with exact source and license preserved in `third_party/chess.js/`. FIDE rules informed adjudication; no endorsement is implied.
