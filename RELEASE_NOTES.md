# Omarchy Chess v1.0.4

Omarchy Chess is a complete native, offline chess game for Omarchy: play a friend locally or choose one of four built-in computer profiles, then close and resume the exact saved position without leaving the shell.

## Highlights

- Complete orthodox chess rules and FIDE-ordered game endings
- Local two-player and bounded off-thread computer modes
- Responsive game layouts keep essential controls visible across narrow, medium, default, and wide windows
- Selectable Charcoal, Green, and Ivory textured boards with verified piece contrast and persisted appearance settings
- A redesigned compact home launcher with resume context and clearer game-mode setup
- Optional polished legal-move hints, improved selection treatment, and a warmer check alert
- Optional clocks, undo, draw, resignation, promotion, and board orientation controls
- Atomic save/resume, completed-game history, replay, and PGN copy/export
- Keyboard-complete, theme-aware UI with non-color cues, reduced motion, high contrast, and optional sound
- Modern black and white pieces now render at matching visible heights for each piece type
- Clearable completed-game history that leaves active games and settings intact
- Calibrated Learner, Casual, Challenging, and Strong profiles with increasing search work and tactical consistency

## Compatibility

- Minimum tested line: Omarchy Quattro (Omarchy 4)
- Verified environment: Omarchy `4.0.0-1`, Quickshell `0.3.0.r20.g28771c7`, Qt `6.11.1`
- State/settings/history/completed-game schema: `1`
- Rules dependency: `chess.js` `1.4.0`, BSD-2-Clause
- No migration is required from v1.0.0 through v1.0.3

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
