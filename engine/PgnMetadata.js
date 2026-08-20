/*
 * Portable PGN header construction for active exports and completed games.
 * This file remains a QML-compatible classic script with a guarded Node export.
 */

"use strict"

var ORTHODOX_START_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
var PGN_RESULTS = {
  "1-0": true,
  "0-1": true,
  "1/2-1/2": true,
  "*": true
}
var TERMINATIONS = {
  "checkmate": "checkmate",
  "stalemate": "stalemate",
  "dead-position": "dead position",
  "insufficient-material": "dead position",
  "fivefold-automatic": "fivefold repetition",
  "seventy-five-move-automatic": "seventy-five-move rule",
  "threefold-claim": "threefold repetition claim",
  "fifty-move-claim": "fifty-move rule claim",
  "draw-agreement": "draw agreement",
  "draw-agreed": "draw agreement",
  "resignation": "resignation",
  "timeout": "time forfeit",
  "time-forfeit": "time forfeit",
  "abandoned": "abandoned"
}

function sanitizeTagValue(value, maximumLength) {
  var limit = Number(maximumLength)
  var sanitized

  if (!isFinite(limit) || limit < 1)
    limit = 256

  // Avoid permitting a caller to smuggle a second tag or an unterminated tag
  // into serialized PGN. Replacement (rather than escaping) also remains safe
  // when passed through the rules adapter's defensive header sanitizer.
  sanitized = String(value === undefined || value === null ? "" : value)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\\/g, "/")
    .replace(/"/g, "'")
    .replace(/\s+/g, " ")
    .trim()

  return sanitized.slice(0, Math.floor(limit))
}

function nonnegativeMilliseconds(value) {
  var number = Number(value)

  if (!isFinite(number) || number < 0)
    return null
  return Math.floor(number)
}

function timeControlTag(clock) {
  var source = clock || {}
  var base
  var increment

  if (typeof source === "string")
    return sanitizeTagValue(source, 64) || "-"
  if (source.enabled === false || source.base_ms === null)
    return "-"

  base = nonnegativeMilliseconds(source.base_ms)
  if (base === null)
    base = nonnegativeMilliseconds(source.initial_ms)
  if (base === null && source.white_ms === source.black_ms)
    base = nonnegativeMilliseconds(source.white_ms)
  if (base === null)
    return "-"

  increment = nonnegativeMilliseconds(source.increment_ms)
  if (increment === null)
    increment = 0

  return String(Math.floor(base / 1000)) + "+" +
    String(Math.floor(increment / 1000))
}

function resultScore(result, active) {
  var value

  if (active || !result)
    return "*"
  value = typeof result === "string" ? result : result.score
  value = String(value || "")
  return PGN_RESULTS[value] ? value : "*"
}

function terminationTag(result) {
  var reason

  if (!result || typeof result === "string")
    return ""
  reason = sanitizeTagValue(result.reason, 80).toLowerCase()
  if (!reason)
    return ""
  return TERMINATIONS[reason] || reason
}

function pgnDate(value) {
  var match
  var date

  if (value instanceof Date && !isNaN(value.getTime()))
    return value.getUTCFullYear() + "." + padDate(value.getUTCMonth() + 1) +
      "." + padDate(value.getUTCDate())

  value = sanitizeTagValue(value, 64)
  match = value.match(/^(\d{4})[.-](\d{2})[.-](\d{2})/)
  if (match)
    return match[1] + "." + match[2] + "." + match[3]

  date = new Date(value)
  if (value && !isNaN(date.getTime())) {
    return date.getUTCFullYear() + "." + padDate(date.getUTCMonth() + 1) +
      "." + padDate(date.getUTCDate())
  }
  return "????.??.??"
}

function padDate(value) {
  return value < 10 ? "0" + value : String(value)
}

function playerName(player, fallback) {
  var value = player

  if (player && typeof player === "object")
    value = player.name
  value = sanitizeTagValue(value, 80)
  return value || fallback
}

function displayName(value) {
  var normalized = sanitizeTagValue(value, 80)

  if (!normalized)
    return ""
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

function customStartingFen(game, options) {
  var fen = options.initial_fen || options.starting_fen ||
    game.initial_fen || game.starting_fen || ""
  var explicit = options.setup === true || options.custom_start === true ||
    game.setup === true || game.custom_start === true

  fen = sanitizeTagValue(fen, 256)
  if (!fen)
    return ""
  return explicit || fen !== ORTHODOX_START_FEN ? fen : ""
}

function buildHeaders(game, options) {
  var source = game || {}
  var input = options || {}
  var players = source.players || {}
  var result = input.result !== undefined ? input.result : source.result
  var active = input.active === true || !result
  var mode = input.mode || source.mode
  var difficulty = input.computer_level || input.difficulty ||
    source.computer_level || source.difficulty
  var pluginVersion = input.plugin_version || source.plugin_version
  var clock = input.time_control || source.time_control || source.clock
  var startFen = customStartingFen(source, input)
  var headers = {
    Event: sanitizeTagValue(input.event || source.event || "Omarchy Chess", 160),
    Site: sanitizeTagValue(input.site || source.site || "Local", 160),
    Date: pgnDate(input.date || source.started_at || source.created_at),
    Round: sanitizeTagValue(input.round || source.round || "-", 32),
    White: playerName(input.white || players.white || source.white, "White"),
    Black: playerName(input.black || players.black || source.black, "Black"),
    Result: resultScore(result, active)
  }
  var termination

  if (mode)
    headers.Mode = displayName(mode)
  if (clock)
    headers.TimeControl = timeControlTag(clock)
  if (difficulty)
    headers.ComputerLevel = displayName(difficulty)

  termination = active ? "" : terminationTag(result)
  if (termination)
    headers.Termination = termination
  if (pluginVersion)
    headers.PluginVersion = sanitizeTagValue(pluginVersion, 64)
  if (startFen) {
    headers.SetUp = "1"
    headers.FEN = startFen
  }

  return headers
}

var PgnMetadata = {
  buildHeaders: buildHeaders,
  sanitizeTagValue: sanitizeTagValue,
  timeControlTag: timeControlTag,
  terminationTag: terminationTag
}

if (typeof module !== "undefined" && module.exports)
  module.exports = PgnMetadata
