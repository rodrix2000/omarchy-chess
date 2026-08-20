# Chess and Project Glossary

## Chess terms

### Ply

One move by one side. A full move consists of White’s ply and Black’s ply.

### FEN

Forsyth–Edwards Notation: one-line complete position description including turn, castling, en passant, and counters.

### PGN

Portable Game Notation: game headers and SAN move history.

### SAN

Standard Algebraic Notation shown to users, such as `Nf3`, `O-O`, or `Qh7#`.

### UCI move

Machine-friendly from/to move such as `e2e4` or promotion `e7e8q`.

### Check

King is attacked.

### Checkmate

King is in check and no legal move exists.

### Stalemate

Side to move is not in check and has no legal move; draw.

### Dead position

No legal sequence can produce checkmate by either side.

### Claimable draw

A draw that does not end automatically until a player claims it, such as threefold repetition or the fifty-move rule.

### Automatic draw

Ends immediately when condition is met, such as fivefold repetition or seventy-five moves, subject to checkmate precedence.

### En passant

Immediate special pawn capture after an adjacent two-square pawn advance.

### Underpromotion

Promotion to rook, bishop, or knight instead of queen.

## Project terms

### Rules authority

The single adapter/library boundary that decides legal moves and notation.

### Adjudicator

Project module that decides results and claim availability from rules, repetition, clocks, and actions.

### Active game

The single resumable game stored in `active-game.json`.

### Completed record

Immutable archived JSON and PGN for a finished game.

### Snapshot

Display-safe current state published by the service.

### Search token

Monotonic identifier preventing stale AI results from committing.

### Demo fixture

Deterministic nonprivate position/state used for tests, screenshots, or contest recording.
