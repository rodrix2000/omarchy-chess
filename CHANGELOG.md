# Changelog

All notable user-visible and compatibility changes are recorded here.

## [Unreleased]

## [1.0.4] — 2026-08-20

### Fixed

- Preserved transparent source padding and enabled mipmapped minification so modern piece outlines remain continuous on smaller boards
- Prevented the keyboard cursor from drawing a dark inset box over the selected piece
- Replaced heavy legal-move dots and capture rings with compact destination markers and unobtrusive capture corners
- Replaced the sharp check beep with a warmer two-note alert chime
- Prevented transient piece-image binding warnings while closing a completed-game replay
- Kept completed-game results visible by removing invalid live controls and the live move list after checkmate
- Reported completed-game and history totals in full chess moves instead of plies
- Calibrated computer levels so normal searches finish a first pass, then scale move variety, tactical replies, work, and think time by difficulty
- Prevented a later completed game from stalling during save after an earlier archived game was deleted

### Added

- Added selectable Charcoal, Green, and Ivory textured chessboards with persisted settings and verified piece contrast
- Added a persisted setting to show or hide legal destination dots and capture rings without changing move input
- Redesigned Home as a compact native launcher with an integrated resume card, modern piece icons, player-facing mode copy, and non-duplicated responsive navigation
- Added a confirmed Clear history action that removes all archived games without touching the active game or settings

### Compatibility

- No active-game, completed-game, history, or settings schema migration is required
- Existing `1.0.0` through `1.0.3` state resumes without migration
- Tested with Omarchy Quattro (`4.0.0-1`), Quickshell `0.3.0.r20.g28771c7`, and Qt `6.11.1`

## [1.0.3] — 2026-08-20

### Fixed

- Prevented narrow game controls from overflowing their card and overlapping the footer
- Let the board use the available height in medium, default, and wide windows instead of remaining near its implicit size
- Normalized each bundled black piece to the visible height and vertical alignment of its matching white piece
- Added a real Quickshell journey across 640×560, 704×855, 800×700, 960×720, and 1398×822 layouts with a persisted move

### Compatibility

- No gameplay, rules, persistence schema, or state-path changes
- Existing `1.0.0`, `1.0.1`, and `1.0.2` state resumes without migration

## [1.0.2] — 2026-08-20

### Fixed

- Prevented the service from remaining on “Saving…” when startup retries an already-archived abandoned game whose history index is unchanged
- Added a real Quickshell restore journey covering canonical unchanged history and pre-existing archive files
- Kept manifest, diagnostics, help text, PGN, and persisted-game version metadata synchronized

### Compatibility

- No gameplay, rules, persistence schema, or state-path changes
- Existing `1.0.0` and `1.0.1` state resumes without migration

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

[1.0.4]: https://github.com/rodrix2000/omarchy-chess/releases/tag/v1.0.4
[1.0.3]: https://github.com/rodrix2000/omarchy-chess/releases/tag/v1.0.3
[1.0.2]: https://github.com/rodrix2000/omarchy-chess/releases/tag/v1.0.2
[1.0.1]: https://github.com/rodrix2000/omarchy-chess/releases/tag/v1.0.1
[1.0.0]: https://github.com/rodrix2000/omarchy-chess/releases/tag/v1.0.0
