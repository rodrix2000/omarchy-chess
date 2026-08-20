/*
 * Stable project rules API. This module normalizes chess.js values and is the
 * only project boundary allowed to commit or query orthodox chess moves.
 */

"use strict"

var configuredCore = null
var MAX_PGN_LENGTH = 1024 * 1024
var PROMOTION_NAMES = {
  q: "queen",
  r: "rook",
  b: "bishop",
  n: "knight"
}
var PROMOTION_SYMBOLS = {
  queen: "q",
  rook: "r",
  bishop: "b",
  knight: "n",
  q: "q",
  r: "r",
  b: "b",
  n: "n"
}
var PIECE_NAMES = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king"
}
var COLOR_NAMES = {
  w: "white",
  b: "black"
}
var FLAG_NAMES = {
  n: "normal",
  c: "capture",
  b: "double-pawn",
  e: "en-passant",
  p: "promotion",
  k: "kingside-castle",
  q: "queenside-castle"
}

function configureCore(core) {
  if (!core || typeof core.create !== "function" ||
      typeof core.validateFen !== "function")
    throw new Error("RulesAdapter: invalid ChessCore namespace")
  configuredCore = core
  return true
}

function core() {
  if (!configuredCore)
    throw new Error("RulesAdapter: ChessCore has not been configured")
  return configuredCore
}

function result(ok, code, detail) {
  return {
    ok: ok === true,
    code: code,
    detail: detail || ""
  }
}

function cloneObject(value) {
  var copy = {}
  var key

  if (!value || typeof value !== "object") return copy
  for (key in value) {
    if (Object.prototype.hasOwnProperty.call(value, key))
      copy[key] = value[key]
  }
  return copy
}

function normalizePromotion(value) {
  if (value === undefined || value === null || value === "") return null
  return PROMOTION_SYMBOLS[String(value).toLowerCase()] || ""
}

function normalizeFlags(flags) {
  var output = []
  var seen = {}
  var source = String(flags || "")
  var index

  for (index = 0; index < source.length; index += 1) {
    var normalized = FLAG_NAMES[source.charAt(index)]
    if (normalized && !seen[normalized]) {
      seen[normalized] = true
      output.push(normalized)
    }
  }
  return output
}

function normalizeMove(move) {
  var promotion = move && move.promotion ? String(move.promotion) : null
  var promotionName = promotion ? PROMOTION_NAMES[promotion] || null : null

  return {
    uci: move.from + move.to + (promotion || ""),
    san: String(move.san || ""),
    from: String(move.from),
    to: String(move.to),
    piece: PIECE_NAMES[move.piece] || "unknown",
    color: COLOR_NAMES[move.color] || "unknown",
    captured: move.captured ? PIECE_NAMES[move.captured] || "unknown" : null,
    promotion: promotionName,
    flags: normalizeFlags(move.flags)
  }
}

function parseFenCounters(fen) {
  var fields = String(fen).trim().split(/\s+/)
  return {
    halfmove: Number(fields[4]),
    fullmove: Number(fields[5])
  }
}

function parseMoveInput(move) {
  var match
  var promotion

  if (typeof move === "string") {
    match = move.trim().toLowerCase().match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/)
    if (!match) return null
    return { from: match[1], to: match[2], promotion: match[3] || null }
  }

  if (!move || typeof move !== "object") return null
  if (typeof move.uci === "string") return parseMoveInput(move.uci)
  if (typeof move.from !== "string" || typeof move.to !== "string") return null

  promotion = normalizePromotion(move.promotion)
  if (promotion === "") return { invalidPromotion: true }
  return {
    from: move.from.toLowerCase(),
    to: move.to.toLowerCase(),
    promotion: promotion
  }
}

function sanitizeHeaderKey(key) {
  var normalized = String(key || "").replace(/[^A-Za-z0-9_]/g, "")
  return normalized.slice(0, 40)
}

function sanitizeHeaderValue(value) {
  return String(value === undefined || value === null ? "" : value)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\\/g, "/")
    .replace(/"/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160)
}

function create(options) {
  var input = options || {}
  var hasFen = typeof input.fen === "string"
  var hasPgn = typeof input.pgn === "string"
  var chess

  if (hasFen && hasPgn)
    return createInvalid("AMBIGUOUS_INITIAL_POSITION", "Provide FEN or PGN, not both")

  try {
    chess = core().create(hasFen ? { fen: input.fen } : {})
    if (hasPgn) {
      if (input.pgn.length > MAX_PGN_LENGTH)
        return createInvalid("PGN_TOO_LARGE", "PGN exceeds the one MiB import limit")
      chess.loadPgn(input.pgn, input.pgnOptions || {})
    }
  } catch (error) {
    return createInvalid("INVALID_INITIAL_POSITION", String(error && error.message || error))
  }

  return createAdapter(chess)
}

function createInvalid(code, detail) {
  return {
    valid: false,
    error: result(false, code, detail)
  }
}

function createAdapter(initialChess) {
  var chess = initialChess

  function reset() {
    chess = core().create({})
    return result(true, "OK")
  }

  function loadFen(fen) {
    var validation = core().validateFen(fen)
    var candidate

    if (!validation || validation.ok !== true)
      return result(false, "INVALID_FEN", validation && validation.error)
    try {
      candidate = core().create({ fen: fen })
    } catch (error) {
      return result(false, "INVALID_FEN", String(error && error.message || error))
    }
    chess = candidate
    return result(true, "OK")
  }

  function loadPgn(pgn, options) {
    var candidate

    if (typeof pgn !== "string")
      return result(false, "INVALID_PGN", "PGN must be a string")
    if (pgn.length > MAX_PGN_LENGTH)
      return result(false, "PGN_TOO_LARGE", "PGN exceeds the one MiB import limit")
    try {
      candidate = core().create({})
      candidate.loadPgn(pgn, options || {})
    } catch (error) {
      return result(false, "INVALID_PGN", String(error && error.message || error))
    }
    chess = candidate
    return result(true, "OK")
  }

  function fen() {
    return chess.fen({ forceEnpassantSquare: true })
  }

  function pgn(options) {
    var input = options || {}
    return chess.pgn({
      newline: typeof input.newline === "string" ? input.newline : "\n",
      maxWidth: typeof input.maxWidth === "number" ? input.maxWidth : 0
    })
  }

  function turn() {
    return COLOR_NAMES[chess.turn()]
  }

  function board() {
    var ranks = chess.board()
    var output = []
    var rank
    var file

    for (rank = 0; rank < ranks.length; rank += 1) {
      for (file = 0; file < ranks[rank].length; file += 1) {
        var piece = ranks[rank][file]
        if (piece) {
          output.push({
            square: piece.square,
            color: COLOR_NAMES[piece.color],
            piece: PIECE_NAMES[piece.type]
          })
        }
      }
    }
    return output
  }

  function legalMoves(options) {
    var input = options || {}
    var query = { verbose: true }
    var moves
    var normalized = []
    var index

    if (typeof input.square === "string") query.square = input.square.toLowerCase()
    try {
      moves = chess.moves(query)
    } catch (error) {
      return []
    }
    for (index = 0; index < moves.length; index += 1)
      normalized.push(normalizeMove(moves[index]))

    if (input.verbose === false) {
      var compact = []
      for (index = 0; index < normalized.length; index += 1)
        compact.push(normalized[index].uci)
      return compact
    }
    return normalized
  }

  function legalEnPassantMoves() {
    var moves = legalMoves({ verbose: true })
    var output = []
    var index

    for (index = 0; index < moves.length; index += 1) {
      if (moves[index].flags.indexOf("en-passant") !== -1)
        output.push(moves[index])
    }
    return output
  }

  function commitMove(move) {
    var parsed = parseMoveInput(move)
    var before = fen()
    var candidates
    var candidate = null
    var promotionCandidates = []
    var index
    var moved
    var after
    var counters

    if (!parsed)
      return result(false, "INVALID_MOVE_FORMAT", "Use UCI or from/to/promotion")
    if (parsed.invalidPromotion)
      return result(false, "INVALID_PROMOTION", "Promotion must be queen, rook, bishop, or knight")
    if (!/^[a-h][1-8]$/.test(parsed.from) || !/^[a-h][1-8]$/.test(parsed.to))
      return result(false, "INVALID_MOVE_FORMAT", "Squares must use algebraic coordinates")

    candidates = chess.moves({ verbose: true, square: parsed.from })
    for (index = 0; index < candidates.length; index += 1) {
      if (candidates[index].to !== parsed.to) continue
      if (candidates[index].promotion)
        promotionCandidates.push(candidates[index])
      if ((candidates[index].promotion || null) === parsed.promotion)
        candidate = candidates[index]
    }

    if (promotionCandidates.length > 0 && !parsed.promotion) {
      var required = result(false, "PROMOTION_REQUIRED", "Choose a promotion piece")
      required.choices = ["queen", "rook", "bishop", "knight"]
      return required
    }
    if (!candidate)
      return result(false, "ILLEGAL_MOVE", "The move is not legal in this position")

    try {
      moved = chess.move({
        from: parsed.from,
        to: parsed.to,
        promotion: parsed.promotion || undefined
      })
    } catch (error) {
      if (fen() !== before)
        throw new Error("RulesAdapter invariant: rejected move mutated position")
      return result(false, "ILLEGAL_MOVE", String(error && error.message || error))
    }

    after = fen()
    counters = parseFenCounters(after)
    return {
      ok: true,
      code: "OK",
      move: normalizeMove(moved),
      fen_before: before,
      fen_after: after,
      in_check: chess.isCheck(),
      checkmate: chess.isCheckmate(),
      stalemate: chess.isStalemate(),
      dead_position: chess.isInsufficientMaterial(),
      halfmove_clock: counters.halfmove,
      fullmove_number: counters.fullmove
    }
  }

  function undo() {
    var move = chess.undo()
    if (!move)
      return result(false, "NO_MOVE_TO_UNDO", "Move history is empty")
    return {
      ok: true,
      code: "OK",
      move: normalizeMove(move),
      restored_fen: fen()
    }
  }

  function history(options) {
    var input = options || {}
    var verbose = chess.history({ verbose: true })
    var output = []
    var index

    if (input.format === "san" || input.verbose === false)
      return chess.history()
    for (index = 0; index < verbose.length; index += 1) {
      var move = normalizeMove(verbose[index])
      output.push(input.format === "uci" ? move.uci : move)
    }
    return output
  }

  function setHeader(key, value) {
    var safeKey = sanitizeHeaderKey(key)
    if (!safeKey)
      return result(false, "INVALID_HEADER_KEY", "PGN header key is empty")
    chess.setHeader(safeKey, sanitizeHeaderValue(value))
    return result(true, "OK")
  }

  function getHeaders() {
    return cloneObject(chess.getHeaders())
  }

  function removeHeader(key) {
    var safeKey = sanitizeHeaderKey(key)
    if (!safeKey)
      return result(false, "INVALID_HEADER_KEY", "PGN header key is empty")
    return chess.removeHeader(safeKey)
      ? result(true, "OK")
      : result(false, "HEADER_NOT_FOUND", "PGN header does not exist")
  }

  function material() {
    var pieces = board()
    var counts = {
      white: { pawn: 0, knight: 0, bishop: 0, rook: 0, queen: 0, king: 0 },
      black: { pawn: 0, knight: 0, bishop: 0, rook: 0, queen: 0, king: 0 }
    }
    var index

    for (index = 0; index < pieces.length; index += 1)
      counts[pieces[index].color][pieces[index].piece] += 1
    return { pieces: pieces, counts: counts }
  }

  function clone() {
    var copy = create({ pgn: pgn(), pgnOptions: { strict: true } })
    if (!copy || copy.valid === false)
      copy = create({ fen: fen() })
    return copy
  }

  function effectiveEnPassant() {
    var target = fen().split(/\s+/)[3]
    return target !== "-" && legalEnPassantMoves().length > 0 ? target : "-"
  }

  return {
    valid: true,
    reset: reset,
    loadFen: loadFen,
    loadPgn: loadPgn,
    fen: fen,
    pgn: pgn,
    turn: turn,
    board: board,
    legalMoves: legalMoves,
    legalEnPassantMoves: legalEnPassantMoves,
    effectiveEnPassant: effectiveEnPassant,
    commitMove: commitMove,
    undo: undo,
    history: history,
    isCheck: function () { return chess.isCheck() },
    isCheckmate: function () { return chess.isCheckmate() },
    isStalemate: function () { return chess.isStalemate() },
    hasLegalMoves: function () { return chess.moves().length > 0 },
    isDeadPositionCandidate: function () { return chess.isInsufficientMaterial() },
    material: material,
    setHeader: setHeader,
    getHeaders: getHeaders,
    removeHeader: removeHeader,
    clone: clone,
    perft: function (depth) { return chess.perft(depth) }
  }
}

var RulesAdapter = {
  configureCore: configureCore,
  create: create,
  normalizeMove: normalizeMove
}

export { configureCore, create, normalizeMove }
