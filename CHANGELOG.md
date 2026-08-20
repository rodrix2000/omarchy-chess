# Changelog

All notable user-visible and compatibility changes are recorded here.

## [1.0.1] — 2026-08-20

### Changed

- Replaced the classic vector pieces with a new twelve-piece modern PNG set
- Refreshed the repository preview and demo so the public homepage matches the in-game board
- Added pinned checksums and strict PNG structure/CRC validation for all piece masters
- Updated the default appearance metadata from `classic` to `modern`; saved games and settings remain compatible

### Compatibility

- No gameplay, rules, persistence schema, or state-path changes
- Existing games resume normally after `omarchy plugin update io.github.rodrix2000.chess`

## [1.0.0] — 2026-08-20

### Added

- Native Omarchy service, summoned panel, and responsive bar widget
- Complete local two-player and built-in offline computer modes
- Four bounded computer profiles running in an ES-module WorkerScript off the shell UI thread
- Pinned `chess.js` 1.4.0 legality/notation authority with reproducible QML and worker artifacts
- Castling, en passant, all promotions, check, mate, stalemate, and SAN/FEN/PGN support
- FIDE-ordered adjudication for dead positions, claimable/automatic repetition and move-count draws, agreements, resignation, abandonment, and timeout mating possibility
- Timed and untimed games with exact timestamp clocks, increments, pause-on-close, and safe restore
- Transactional controller commands for move, promotion, undo, draw, resignation, pause, recovery, and computer-to-local conversion
- Atomic XDG settings, active-game, history, completed-record, recovery, and PGN export storage
- Completed-game replay rebuilt from strict PGN with owned-record deletion and portable PGN copy/export
- Responsive mouse, drag, arrow-key, and Vim-style board input with keyboard promotion and replay controls
- Visible focus, non-color state cues, high-contrast indicators, reduced motion, coordinates, and optional volume-controlled sound
- Original reproducible twelve-piece SVG set, product icons, seven short WAV cues, preview, and demo video
- Deterministic demo/test fixture catalog covering rules, clocks, recovery, result, and history states
- Full QML shell journeys, controller/persistence suites, release-depth perft, 1,000-position AI legality campaign, and clean CLI lifecycle checks

### Fixed during release hardening

- Prevented active games from being silently replaced before archival
- Ensured stale or malformed computer results cannot stop or mutate the current search/game
- Paused safely on AI or persistence errors and added retry/lower-level/local recovery actions
- Made history record reads explicitly asynchronous after dynamic path changes
- Removed eager audio-backend initialization and idle clock polling
- Replaced shell-interpolated clipboard writes with Quickshell's native clipboard API
- Added bounded JSON input parsing, strict game-ID paths, atomic exports, and service-destruction cleanup
- Corrected every user-facing result-reason mapping, including automatic and claimable draws
- Prevented empty squares from probing nonexistent SVG paths
- Made replay layout responsive below the wide-panel breakpoint
- Transferred keyboard focus before pause so the active board never loses its
  tab-focus contract during a state transition
- Ensured the pinned upstream chess.js distribution sources are tracked by Git
  and verified after a clean Omarchy CLI installation

### Compatibility

- Tested with Omarchy `4.0.0-1`, Quickshell `0.3.0.r20.g28771c7`, and Qt `6.11.1`
- State, settings, history, and completed-record schemas start at version `1`
- No migration is needed for the first public release
- Runtime dependency: the Omarchy/Quickshell environment only; no user-installed engine or build tool

[1.0.1]: https://github.com/rodrix2000/omarchy-chess/releases/tag/v1.0.1
[1.0.0]: https://github.com/rodrix2000/omarchy-chess/releases/tag/v1.0.0
