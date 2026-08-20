/*
 * Pure persistence documents for Omarchy Chess.
 *
 * This file intentionally performs no filesystem work. Keep it as a classic
 * script so QML can import its top-level functions; Node tests use only the
 * guarded CommonJS export at the bottom.
 */

"use strict"

var CURRENT_SCHEMA_VERSION = 1
var DEFAULT_PLUGIN_VERSION = "1.0.0"
var RESULT_SCORES = ["1-0", "0-1", "1/2-1/2", "*"]
var COMPLETED_SCORES = ["1-0", "0-1", "1/2-1/2"]
var RESULT_REASONS = [
  "checkmate",
  "stalemate",
  "dead-position",
  "resignation",
  "draw-agreement",
  "threefold-claim",
  "fivefold-automatic",
  "fifty-move-claim",
  "seventy-five-move-automatic",
  "timeout",
  "timeout-insufficient-mating-possibility",
  "abandoned"
]
var ACTIVE_STATUSES = [
  "active-human",
  "active-computer",
  "paused",
  "paused-error",
  "completed",
  "abandoned"
]
var migrations = {
  settings: {},
  active_game: {},
  history: {},
  completed_game: {}
}

function own(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key)
}

function isArray(value) {
  return Array.isArray(value)
}

function isObject(value) {
  var prototype

  if (!value || Object.prototype.toString.call(value) !== "[object Object]")
    return false
  if (typeof Object.getPrototypeOf !== "function")
    return true
  prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function isInteger(value) {
  return typeof value === "number" && isFinite(value) && Math.floor(value) === value
}

function inList(value, values) {
  return values.indexOf(value) !== -1
}

function keys(object) {
  var output = []
  var key

  if (!object || typeof object !== "object")
    return output
  for (key in object) {
    if (own(object, key))
      output.push(key)
  }
  return output
}

function setOwn(object, key, value) {
  if (key === "__proto__" && typeof Object.defineProperty === "function") {
    Object.defineProperty(object, key, {
      value: value,
      enumerable: true,
      configurable: true,
      writable: true
    })
  } else {
    object[key] = value
  }
}

function addError(errors, path, code, message) {
  errors.push({
    path: path,
    code: code,
    message: message
  })
}

function success(value, extra) {
  var output = {
    ok: true,
    valid: true,
    code: "OK",
    value: value,
    errors: []
  }
  var key

  if (extra) {
    for (key in extra) {
      if (own(extra, key))
        output[key] = extra[key]
    }
  }
  return output
}

function failure(code, errors, detail) {
  var list = errors || []
  return {
    ok: false,
    valid: false,
    code: code,
    detail: detail || (list.length > 0 ? list[0].message : ""),
    value: null,
    errors: list
  }
}

function validationFailure(errors) {
  return failure(
    "PERSISTENCE_VALIDATION_FAILED",
    errors,
    errors.length > 0 ? errors[0].path + ": " + errors[0].message : "Document is invalid"
  )
}

function requireObject(value, path, errors) {
  if (!isObject(value)) {
    addError(errors, path, "TYPE", "must be an object")
    return false
  }
  return true
}

function requireArray(value, path, errors) {
  if (!isArray(value)) {
    addError(errors, path, "TYPE", "must be an array")
    return false
  }
  return true
}

function requireKeys(value, required, path, errors) {
  var index

  for (index = 0; index < required.length; index += 1) {
    if (!own(value, required[index]))
      addError(errors, path + "." + required[index], "REQUIRED", "is required")
  }
}

function rejectUnknownKeys(value, allowed, path, errors) {
  var present = keys(value)
  var index

  for (index = 0; index < present.length; index += 1) {
    if (allowed.indexOf(present[index]) === -1)
      addError(errors, path + "." + present[index], "UNKNOWN_PROPERTY", "is not allowed")
  }
}

function validateString(value, path, errors, minimum, maximum) {
  if (typeof value !== "string") {
    addError(errors, path, "TYPE", "must be a string")
    return
  }
  if (minimum !== undefined && value.length < minimum)
    addError(errors, path, "MIN_LENGTH", "is shorter than " + minimum + " characters")
  if (maximum !== undefined && value.length > maximum)
    addError(errors, path, "MAX_LENGTH", "is longer than " + maximum + " characters")
}

function validateBoolean(value, path, errors) {
  if (typeof value !== "boolean")
    addError(errors, path, "TYPE", "must be a boolean")
}

function validateInteger(value, path, errors, minimum, maximum) {
  if (!isInteger(value)) {
    addError(errors, path, "TYPE", "must be an integer")
    return
  }
  if (minimum !== undefined && value < minimum)
    addError(errors, path, "MINIMUM", "must be at least " + minimum)
  if (maximum !== undefined && value > maximum)
    addError(errors, path, "MAXIMUM", "must be at most " + maximum)
}

function validateEnum(value, allowed, path, errors) {
  if (!inList(value, allowed))
    addError(errors, path, "ENUM", "has an unsupported value")
}

function isUtcTimestamp(value) {
  var match
  var date

  if (typeof value !== "string")
    return false
  match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/
  )
  if (!match)
    return false
  date = new Date(value)
  if (isNaN(date.getTime()))
    return false
  return date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() + 1 === Number(match[2]) &&
    date.getUTCDate() === Number(match[3]) &&
    date.getUTCHours() === Number(match[4]) &&
    date.getUTCMinutes() === Number(match[5]) &&
    date.getUTCSeconds() === Number(match[6])
}

function validateTimestamp(value, path, errors) {
  if (!isUtcTimestamp(value))
    addError(errors, path, "DATE_TIME", "must be a valid ISO 8601 UTC timestamp")
}

function timestamp(value, fallback) {
  var date

  if (typeof value === "string" && isUtcTimestamp(value))
    return new Date(value).toISOString()
  if (typeof value === "number" && isFinite(value)) {
    date = new Date(value)
    if (!isNaN(date.getTime()))
      return date.toISOString()
  }
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime()))
    return value.toISOString()
  if (value !== undefined && value !== null)
    return value
  if (fallback !== undefined)
    return timestamp(fallback)
  return new Date().toISOString()
}

function cloneJson(value, stack) {
  var ancestors = stack || []
  var output
  var present
  var index

  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value
  if (typeof value === "number") {
    if (!isFinite(value))
      throw new TypeError("PersistenceModel: JSON numbers must be finite")
    return value
  }
  if (typeof value === "undefined" || typeof value === "function" || typeof value === "symbol")
    throw new TypeError("PersistenceModel: document contains a non-JSON value")
  if (ancestors.indexOf(value) !== -1)
    throw new TypeError("PersistenceModel: document contains a cycle")

  ancestors.push(value)
  if (isArray(value)) {
    output = []
    for (index = 0; index < value.length; index += 1)
      output.push(cloneJson(value[index], ancestors))
  } else if (isObject(value)) {
    output = {}
    present = keys(value)
    for (index = 0; index < present.length; index += 1)
      setOwn(output, present[index], cloneJson(value[present[index]], ancestors))
  } else {
    ancestors.pop()
    throw new TypeError("PersistenceModel: document contains a non-plain object")
  }
  ancestors.pop()
  return output
}

function stableClone(value, stack) {
  var ancestors = stack || []
  var output
  var present
  var index

  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value
  if (typeof value === "number") {
    if (!isFinite(value))
      throw new TypeError("PersistenceModel: JSON numbers must be finite")
    return value
  }
  if (typeof value === "undefined" || typeof value === "function" || typeof value === "symbol")
    throw new TypeError("PersistenceModel: document contains a non-JSON value")
  if (ancestors.indexOf(value) !== -1)
    throw new TypeError("PersistenceModel: document contains a cycle")

  ancestors.push(value)
  if (isArray(value)) {
    output = []
    for (index = 0; index < value.length; index += 1)
      output.push(stableClone(value[index], ancestors))
  } else if (isObject(value)) {
    output = {}
    present = keys(value).sort()
    for (index = 0; index < present.length; index += 1)
      setOwn(output, present[index], stableClone(value[present[index]], ancestors))
  } else {
    ancestors.pop()
    throw new TypeError("PersistenceModel: document contains a non-plain object")
  }
  ancestors.pop()
  return output
}

function serialize(value) {
  return JSON.stringify(stableClone(value), null, 2) + "\n"
}

function sameJson(left, right) {
  try {
    return serialize(left) === serialize(right)
  } catch (error) {
    return false
  }
}

function deepFreeze(value) {
  var present
  var index

  if (!value || typeof value !== "object")
    return value
  present = keys(value)
  for (index = 0; index < present.length; index += 1)
    deepFreeze(value[present[index]])
  if (typeof Object.freeze === "function")
    Object.freeze(value)
  return value
}

function schemaVersionResult(value, documentName) {
  var errors = []

  if (!isObject(value)) {
    addError(errors, "$", "TYPE", documentName + " must be an object")
    return validationFailure(errors)
  }
  if (!own(value, "schema_version")) {
    addError(errors, "$.schema_version", "REQUIRED", "is required")
    return validationFailure(errors)
  }
  if (!isInteger(value.schema_version) || value.schema_version < 1) {
    addError(errors, "$.schema_version", "SCHEMA_VERSION", "must be a positive integer")
    return validationFailure(errors)
  }
  if (value.schema_version > CURRENT_SCHEMA_VERSION) {
    addError(errors, "$.schema_version", "FUTURE_SCHEMA", "is newer than this plugin supports")
    return failure("UNSUPPORTED_FUTURE_SCHEMA", errors)
  }
  return success(value)
}

function defaultSettings() {
  return {
    schema_version: CURRENT_SCHEMA_VERSION,
    gameplay: {
      last_mode: "computer",
      computer_level: "casual",
      human_color: "white",
      time_control: {
        base_ms: null,
        increment_ms: 0
      },
      pause_when_closed: true,
      allow_computer_undo: true
    },
    appearance: {
      coordinates: true,
      orientation: "white",
      piece_set: "classic"
    },
    audio: {
      enabled: true,
      volume: 0.65
    },
    accessibility: {
      reduced_motion: false,
      high_contrast_indicators: false
    }
  }
}

function validateSettings(value) {
  var schema = schemaVersionResult(value, "Settings")
  var errors = []
  var gameplay
  var timeControl
  var appearance
  var audio
  var accessibility

  if (!schema.ok)
    return schema
  if (value.schema_version !== CURRENT_SCHEMA_VERSION) {
    addError(errors, "$.schema_version", "SCHEMA_VERSION", "has no registered current validator")
    return validationFailure(errors)
  }

  requireKeys(value, ["schema_version", "gameplay", "appearance", "audio", "accessibility"], "$", errors)
  rejectUnknownKeys(value, ["schema_version", "gameplay", "appearance", "audio", "accessibility"], "$", errors)

  gameplay = value.gameplay
  if (requireObject(gameplay, "$.gameplay", errors)) {
    requireKeys(gameplay, ["last_mode", "computer_level", "human_color", "time_control", "pause_when_closed"], "$.gameplay", errors)
    rejectUnknownKeys(gameplay, ["last_mode", "computer_level", "human_color", "time_control", "pause_when_closed", "allow_computer_undo"], "$.gameplay", errors)
    validateEnum(gameplay.last_mode, ["computer", "local"], "$.gameplay.last_mode", errors)
    validateEnum(gameplay.computer_level, ["learner", "casual", "challenging", "strong", "custom"], "$.gameplay.computer_level", errors)
    validateEnum(gameplay.human_color, ["white", "black", "random"], "$.gameplay.human_color", errors)
    validateBoolean(gameplay.pause_when_closed, "$.gameplay.pause_when_closed", errors)
    if (own(gameplay, "allow_computer_undo"))
      validateBoolean(gameplay.allow_computer_undo, "$.gameplay.allow_computer_undo", errors)

    timeControl = gameplay.time_control
    if (requireObject(timeControl, "$.gameplay.time_control", errors)) {
      requireKeys(timeControl, ["base_ms", "increment_ms"], "$.gameplay.time_control", errors)
      rejectUnknownKeys(timeControl, ["base_ms", "increment_ms"], "$.gameplay.time_control", errors)
      if (timeControl.base_ms !== null)
        validateInteger(timeControl.base_ms, "$.gameplay.time_control.base_ms", errors, 0)
      validateInteger(timeControl.increment_ms, "$.gameplay.time_control.increment_ms", errors, 0, 3600000)
    }
  }

  appearance = value.appearance
  if (requireObject(appearance, "$.appearance", errors)) {
    requireKeys(appearance, ["coordinates", "orientation", "piece_set"], "$.appearance", errors)
    rejectUnknownKeys(appearance, ["coordinates", "orientation", "piece_set"], "$.appearance", errors)
    validateBoolean(appearance.coordinates, "$.appearance.coordinates", errors)
    validateEnum(appearance.orientation, ["white", "black", "manual", "auto"], "$.appearance.orientation", errors)
    validateString(appearance.piece_set, "$.appearance.piece_set", errors, 1, 64)
  }

  audio = value.audio
  if (requireObject(audio, "$.audio", errors)) {
    requireKeys(audio, ["enabled", "volume"], "$.audio", errors)
    rejectUnknownKeys(audio, ["enabled", "volume"], "$.audio", errors)
    validateBoolean(audio.enabled, "$.audio.enabled", errors)
    if (typeof audio.volume !== "number" || !isFinite(audio.volume))
      addError(errors, "$.audio.volume", "TYPE", "must be a finite number")
    else if (audio.volume < 0 || audio.volume > 1)
      addError(errors, "$.audio.volume", "RANGE", "must be between 0 and 1")
  }

  accessibility = value.accessibility
  if (requireObject(accessibility, "$.accessibility", errors)) {
    requireKeys(accessibility, ["reduced_motion", "high_contrast_indicators"], "$.accessibility", errors)
    rejectUnknownKeys(accessibility, ["reduced_motion", "high_contrast_indicators"], "$.accessibility", errors)
    validateBoolean(accessibility.reduced_motion, "$.accessibility.reduced_motion", errors)
    validateBoolean(accessibility.high_contrast_indicators, "$.accessibility.high_contrast_indicators", errors)
  }

  return errors.length > 0 ? validationFailure(errors) : success(value)
}

function migrateDocument(value, type, validator) {
  var schema = schemaVersionResult(value, type)
  var current
  var next
  var migration
  var validation

  if (!schema.ok)
    return schema
  current = cloneJson(value)
  while (current.schema_version < CURRENT_SCHEMA_VERSION) {
    migration = migrations[type] && migrations[type][current.schema_version]
    if (typeof migration !== "function")
      return failure("PERSISTENCE_MIGRATION_FAILED", [], "No migration is registered for " + type + " schema " + current.schema_version)
    try {
      next = migration(cloneJson(current))
    } catch (error) {
      return failure("PERSISTENCE_MIGRATION_FAILED", [], String(error && error.message || error))
    }
    if (!isObject(next) || next.schema_version !== current.schema_version + 1)
      return failure("PERSISTENCE_MIGRATION_FAILED", [], "Migration did not advance exactly one schema version")
    current = next
  }
  validation = validator(current)
  if (!validation.ok)
    return failure("PERSISTENCE_MIGRATION_FAILED", validation.errors, validation.detail)
  return success(current, { migrated: value.schema_version !== current.schema_version })
}

function migrateSettings(value) {
  return migrateDocument(value, "settings", validateSettings)
}

function mergeObjectPatch(current, patch) {
  var output = cloneJson(current)
  var present = keys(patch)
  var index
  var key

  for (index = 0; index < present.length; index += 1) {
    key = present[index]
    if (isObject(patch[key]) && isObject(output[key]))
      setOwn(output, key, mergeObjectPatch(output[key], patch[key]))
    else
      setOwn(output, key, cloneJson(patch[key]))
  }
  return output
}

function mergeSettingsPatch(current, patch) {
  var currentValidation = validateSettings(current)
  var errors = []
  var merged
  var validation

  if (!currentValidation.ok)
    return currentValidation
  if (!requireObject(patch, "$patch", errors))
    return validationFailure(errors)
  try {
    merged = mergeObjectPatch(current, patch)
  } catch (error) {
    addError(errors, "$patch", "NON_JSON_VALUE", String(error && error.message || error))
    return validationFailure(errors)
  }
  validation = validateSettings(merged)
  if (!validation.ok)
    return validation
  return success(merged)
}

function normalizePlayer(player) {
  var source = player || {}
  return {
    kind: source.kind,
    name: source.name
  }
}

function normalizePlayers(players) {
  var source = players || {}
  return {
    white: normalizePlayer(source.white),
    black: normalizePlayer(source.black)
  }
}

function normalizeMoveRecord(move, fallbackTimestamp) {
  var source = move || {}
  var output = {
    ply: source.ply,
    uci: source.uci,
    san: source.san,
    fen_after: source.fen_after,
    played_at: timestamp(source.played_at, fallbackTimestamp)
  }

  if (own(source, "clock_after_ms"))
    output.clock_after_ms = source.clock_after_ms
  if (own(source, "clock_before"))
    output.clock_before = source.clock_before === null
      ? null
      : normalizeClock(source.clock_before, output.played_at)
  if (own(source, "draw_offer_before"))
    output.draw_offer_before = source.draw_offer_before
  return output
}

function normalizeMoves(moves, fallbackTimestamp) {
  var source = isArray(moves) ? moves : []
  var output = []
  var index

  for (index = 0; index < source.length; index += 1)
    output.push(normalizeMoveRecord(source[index], fallbackTimestamp))
  return output
}

function normalizeClock(clock, fallbackTimestamp) {
  var source = clock || {}
  var enabled = source.enabled === true
  var started = source.last_started_at

  if ((started === undefined || started === null) && source.last_started_at_ms !== undefined)
    started = source.last_started_at_ms
  if (started !== undefined && started !== null)
    started = timestamp(started, fallbackTimestamp)
  else
    started = null

  return {
    enabled: enabled,
    white_ms: source.white_ms === undefined ? null : source.white_ms,
    black_ms: source.black_ms === undefined ? null : source.black_ms,
    increment_ms: source.increment_ms === undefined ? 0 : source.increment_ms,
    running_side: source.running_side === undefined ? null : source.running_side,
    last_started_at: started
  }
}

function normalizeResult(result, fallbackFinishedAt) {
  if (!result)
    return null
  return {
    score: result.score,
    reason: result.reason,
    finished_at: timestamp(result.finished_at, fallbackFinishedAt)
  }
}

function documentSource(snapshot) {
  if (snapshot && isObject(snapshot.persistence_document))
    return snapshot.persistence_document
  if (snapshot && isObject(snapshot.game))
    return snapshot.game
  return snapshot || {}
}

function createActiveGame(controllerSnapshot, metadata) {
  var source = documentSource(controllerSnapshot)
  var meta = metadata || {}
  var nowValue = typeof meta.now === "function" ? meta.now() : meta.now
  var updatedAt = timestamp(meta.updated_at !== undefined ? meta.updated_at : source.updated_at, nowValue)
  var createdAt = timestamp(meta.created_at !== undefined ? meta.created_at : source.created_at, updatedAt)
  var output = {
    schema_version: CURRENT_SCHEMA_VERSION,
    game_id: meta.game_id !== undefined ? meta.game_id : (source.game_id !== undefined ? source.game_id : source.id),
    plugin_version: meta.plugin_version || source.plugin_version || DEFAULT_PLUGIN_VERSION,
    mode: source.mode,
    status: source.status,
    created_at: createdAt,
    updated_at: updatedAt,
    players: normalizePlayers(source.players),
    difficulty: source.difficulty === undefined ? null : source.difficulty,
    fen: source.fen,
    pgn: typeof source.pgn === "string" ? source.pgn : "",
    moves: normalizeMoves(source.moves, updatedAt),
    position_counts: isObject(source.position_counts) ? cloneJson(source.position_counts) : {},
    clock: normalizeClock(source.clock, updatedAt),
    pending_draw_offer_by: source.pending_draw_offer_by === undefined ? null : source.pending_draw_offer_by,
    orientation: source.orientation || meta.orientation || "white",
    result: normalizeResult(source.result, updatedAt)
  }

  if (own(source, "human_color"))
    output.human_color = source.human_color
  if (own(source, "time_control"))
    output.time_control = cloneJson(source.time_control)

  return output
}

function validatePlayer(player, path, errors) {
  if (!requireObject(player, path, errors))
    return
  requireKeys(player, ["kind", "name"], path, errors)
  rejectUnknownKeys(player, ["kind", "name"], path, errors)
  validateEnum(player.kind, ["human", "computer"], path + ".kind", errors)
  validateString(player.name, path + ".name", errors, 1, 80)
}

function validatePlayers(players, path, errors) {
  if (!requireObject(players, path, errors))
    return
  requireKeys(players, ["white", "black"], path, errors)
  rejectUnknownKeys(players, ["white", "black"], path, errors)
  validatePlayer(players.white, path + ".white", errors)
  validatePlayer(players.black, path + ".black", errors)
}

function validateMoveRecord(move, index, errors) {
  var path = "$.moves[" + index + "]"

  if (!requireObject(move, path, errors))
    return
  requireKeys(move, ["ply", "uci", "san", "fen_after", "played_at"], path, errors)
  rejectUnknownKeys(move, ["ply", "uci", "san", "fen_after", "played_at", "clock_after_ms", "clock_before", "draw_offer_before"], path, errors)
  validateInteger(move.ply, path + ".ply", errors, 1)
  validateString(move.uci, path + ".uci", errors)
  if (typeof move.uci === "string" && !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move.uci))
    addError(errors, path + ".uci", "PATTERN", "must be normalized UCI")
  validateString(move.san, path + ".san", errors, 1, 32)
  validateString(move.fen_after, path + ".fen_after", errors, 1, 256)
  validateTimestamp(move.played_at, path + ".played_at", errors)
  if (own(move, "clock_after_ms") && move.clock_after_ms !== null)
    validateInteger(move.clock_after_ms, path + ".clock_after_ms", errors, 0)
  if (own(move, "clock_before") && move.clock_before !== null)
    validateClock(move.clock_before, path + ".clock_before", errors)
  if (own(move, "draw_offer_before"))
    validateEnum(move.draw_offer_before, ["white", "black", null], path + ".draw_offer_before", errors)
}

function validateMoves(moves, errors) {
  var index

  if (!requireArray(moves, "$.moves", errors))
    return
  if (moves.length > 20000)
    addError(errors, "$.moves", "MAX_ITEMS", "must contain at most 20000 plies")
  for (index = 0; index < moves.length; index += 1)
    validateMoveRecord(moves[index], index, errors)
}

function validatePositionCounts(counts, errors) {
  var present
  var index

  if (!requireObject(counts, "$.position_counts", errors))
    return
  present = keys(counts)
  for (index = 0; index < present.length; index += 1)
    validateInteger(counts[present[index]], "$.position_counts[" + JSON.stringify(present[index]) + "]", errors, 1, 1000)
}

function validateClock(clock, path, errors) {
  if (errors === undefined) {
    errors = path
    path = "$.clock"
  }
  if (!requireObject(clock, path, errors))
    return
  requireKeys(clock, ["enabled", "white_ms", "black_ms", "increment_ms", "running_side", "last_started_at"], path, errors)
  rejectUnknownKeys(clock, ["enabled", "white_ms", "black_ms", "increment_ms", "running_side", "last_started_at"], path, errors)
  validateBoolean(clock.enabled, path + ".enabled", errors)
  if (clock.white_ms !== null)
    validateInteger(clock.white_ms, path + ".white_ms", errors, 0)
  if (clock.black_ms !== null)
    validateInteger(clock.black_ms, path + ".black_ms", errors, 0)
  validateInteger(clock.increment_ms, path + ".increment_ms", errors, 0)
  validateEnum(clock.running_side, ["white", "black", null], path + ".running_side", errors)
  if (clock.last_started_at !== null)
    validateTimestamp(clock.last_started_at, path + ".last_started_at", errors)
}

function validateTimeControl(timeControl, path, errors) {
  if (!requireObject(timeControl, path, errors))
    return
  requireKeys(timeControl, ["base_ms", "increment_ms"], path, errors)
  rejectUnknownKeys(timeControl, ["base_ms", "increment_ms"], path, errors)
  if (timeControl.base_ms !== null)
    validateInteger(timeControl.base_ms, path + ".base_ms", errors, 0)
  validateInteger(timeControl.increment_ms, path + ".increment_ms", errors, 0, 3600000)
}

function validateResult(result, path, errors, nullable) {
  if (result === null && nullable)
    return
  if (!requireObject(result, path, errors))
    return
  requireKeys(result, ["score", "reason", "finished_at"], path, errors)
  rejectUnknownKeys(result, ["score", "reason", "finished_at"], path, errors)
  validateEnum(result.score, RESULT_SCORES, path + ".score", errors)
  validateEnum(result.reason, RESULT_REASONS, path + ".reason", errors)
  validateTimestamp(result.finished_at, path + ".finished_at", errors)
}

function validateActiveStructure(value, completedOnly) {
  var schema = schemaVersionResult(value, completedOnly ? "completed_game" : "active_game")
  var errors = []
  var allowed = [
    "schema_version", "game_id", "plugin_version", "mode", "status",
    "created_at", "updated_at", "players", "difficulty", "fen", "pgn",
    "moves", "position_counts", "clock", "pending_draw_offer_by",
    "orientation", "result", "human_color", "time_control"
  ]
  var required = [
    "schema_version", "game_id", "plugin_version", "mode", "status",
    "created_at", "updated_at", "players", "fen", "pgn", "moves",
    "position_counts", "clock", "result"
  ]

  if (!schema.ok)
    return schema
  if (completedOnly) {
    allowed.push("duration_ms")
    required.push("duration_ms")
  }
  requireKeys(value, required, "$", errors)
  rejectUnknownKeys(value, allowed, "$", errors)
  validateString(value.game_id, "$.game_id", errors, 8, 128)
  validateString(value.plugin_version, "$.plugin_version", errors, 1, 64)
  validateEnum(value.mode, ["computer", "local"], "$.mode", errors)
  validateEnum(value.status, completedOnly ? ["completed", "abandoned"] : ACTIVE_STATUSES, "$.status", errors)
  validateTimestamp(value.created_at, "$.created_at", errors)
  validateTimestamp(value.updated_at, "$.updated_at", errors)
  validatePlayers(value.players, "$.players", errors)
  if (own(value, "difficulty"))
    validateEnum(value.difficulty, ["learner", "casual", "challenging", "strong", "custom", null], "$.difficulty", errors)
  validateString(value.fen, "$.fen", errors, 1, 256)
  validateString(value.pgn, "$.pgn", errors, 0, 2000000)
  validateMoves(value.moves, errors)
  validatePositionCounts(value.position_counts, errors)
  validateClock(value.clock, "$.clock", errors)
  if (own(value, "pending_draw_offer_by"))
    validateEnum(value.pending_draw_offer_by, ["white", "black", null], "$.pending_draw_offer_by", errors)
  if (own(value, "orientation"))
    validateEnum(value.orientation, ["white", "black", "manual", "auto"], "$.orientation", errors)
  if (own(value, "human_color"))
    validateEnum(value.human_color, ["white", "black", null], "$.human_color", errors)
  if (own(value, "time_control"))
    validateTimeControl(value.time_control, "$.time_control", errors)
  validateResult(value.result, "$.result", errors, !completedOnly)
  if (completedOnly)
    validateInteger(value.duration_ms, "$.duration_ms", errors, 0)
  return errors.length > 0 ? validationFailure(errors) : success(value)
}

function validateActiveGame(value) {
  return validateActiveStructure(value, false)
}

function migrateActiveGame(value) {
  return migrateDocument(value, "active_game", validateActiveGame)
}

function rulesFrom(rulesAdapter, options) {
  var candidate
  var loaded

  try {
    if (!rulesAdapter)
      return null
    if (typeof rulesAdapter.create === "function")
      return rulesAdapter.create(options)
    if (typeof rulesAdapter === "function")
      return rulesAdapter(options)
    if (typeof rulesAdapter.clone !== "function")
      return null

    candidate = rulesAdapter.clone()
    if (!candidate || candidate === rulesAdapter)
      return null
    if (options.fen !== undefined && typeof candidate.loadFen === "function")
      loaded = candidate.loadFen(options.fen)
    else if (options.pgn !== undefined && typeof candidate.loadPgn === "function")
      loaded = candidate.loadPgn(options.pgn, options.pgnOptions || {})
    else
      return null
    return loaded && loaded.ok === true ? candidate : { valid: false, error: loaded }
  } catch (error) {
    return { valid: false, error: error }
  }
}

function validRules(rules) {
  return !!rules && rules.valid !== false && typeof rules.fen === "function" &&
    typeof rules.turn === "function"
}

function currentPositionKey(rules) {
  var fields = String(rules.fen()).trim().split(/\s+/)
  var effective = "-"

  if (fields.length < 4)
    return null
  if (fields[3] !== "-") {
    if (typeof rules.effectiveEnPassant === "function")
      effective = rules.effectiveEnPassant()
    else if (typeof rules.legalEnPassantMoves === "function" && rules.legalEnPassantMoves().length > 0)
      effective = fields[3]
  }
  return fields[0] + " " + fields[1] + " " + fields[2] + " " + effective
}

function semanticError(errors, path, code, message) {
  addError(errors, path, code, message)
}

function validateModePlayers(value, errors) {
  var whiteKind = value.players.white.kind
  var blackKind = value.players.black.kind

  if (value.mode === "local" && (whiteKind !== "human" || blackKind !== "human"))
    semanticError(errors, "$.players", "CONTROL_MISMATCH", "local games must have two human players")
  if (value.mode === "computer" && (whiteKind === blackKind ||
      (whiteKind !== "computer" && blackKind !== "computer")))
    semanticError(errors, "$.players", "CONTROL_MISMATCH", "computer games must have exactly one human and one computer")
  if (value.mode === "computer" && own(value, "human_color") &&
      value.human_color !== null && value.players[value.human_color].kind !== "human")
    semanticError(errors, "$.human_color", "CONTROL_MISMATCH", "must identify the human-controlled side")
}

function validateLifecycle(value, turn, errors) {
  var terminal = value.status === "completed" || value.status === "abandoned"

  if (!terminal && value.result !== null)
    semanticError(errors, "$.result", "RESULT_STATE_MISMATCH", "an unfinished game cannot have a final result")
  if (terminal && value.result === null)
    semanticError(errors, "$.result", "RESULT_STATE_MISMATCH", "a terminal game must have a result")
  if (value.status === "completed" && value.result &&
      (!inList(value.result.score, COMPLETED_SCORES) || value.result.reason === "abandoned"))
    semanticError(errors, "$.result", "RESULT_STATE_MISMATCH", "completed games need a scored non-abandonment result")
  if (value.status === "abandoned" && value.result &&
      (value.result.reason !== "abandoned" || value.result.score !== "*"))
    semanticError(errors, "$.result", "RESULT_STATE_MISMATCH", "abandoned games need an abandoned, unfinished result")

  if (value.status === "active-human" && value.players[turn].kind !== "human")
    semanticError(errors, "$.status", "CONTROL_MISMATCH", "active-human must identify a human-controlled turn")
  if (value.status === "active-computer" &&
      (value.mode !== "computer" || value.players[turn].kind !== "computer"))
    semanticError(errors, "$.status", "CONTROL_MISMATCH", "active-computer must identify the computer-controlled turn")
  if (terminal && own(value, "pending_draw_offer_by") && value.pending_draw_offer_by !== null)
    semanticError(errors, "$.pending_draw_offer_by", "RESULT_STATE_MISMATCH", "terminal games cannot retain a draw offer")
}

function validateClockSemantics(value, turn, errors) {
  var clock = value.clock
  var runningStatus = value.status === "active-human" || value.status === "active-computer"

  if (!clock.enabled) {
    if (clock.white_ms !== null || clock.black_ms !== null || clock.running_side !== null || clock.last_started_at !== null)
      semanticError(errors, "$.clock", "CLOCK_STATE_MISMATCH", "an untimed clock must have null remaining, running, and start values")
    return
  }
  if (!isInteger(clock.white_ms) || !isInteger(clock.black_ms))
    semanticError(errors, "$.clock", "CLOCK_STATE_MISMATCH", "a timed clock needs both remaining values")
  if (runningStatus) {
    if (clock.running_side !== turn)
      semanticError(errors, "$.clock.running_side", "CLOCK_STATE_MISMATCH", "must match the FEN side to move")
    if (clock.last_started_at === null)
      semanticError(errors, "$.clock.last_started_at", "CLOCK_STATE_MISMATCH", "a running clock needs a start timestamp")
  } else if (clock.running_side !== null || clock.last_started_at !== null) {
    semanticError(errors, "$.clock", "CLOCK_STATE_MISMATCH", "paused and terminal games cannot have a running clock")
  }
  if (own(value, "time_control") && value.time_control.increment_ms !== clock.increment_ms)
    semanticError(errors, "$.time_control.increment_ms", "CLOCK_STATE_MISMATCH", "must match the persisted clock increment")
  if (own(value, "time_control") && (value.time_control.base_ms !== null) !== clock.enabled)
    semanticError(errors, "$.time_control.base_ms", "CLOCK_STATE_MISMATCH", "must agree with whether the clock is enabled")
}

function validateMoveSemantics(value, errors) {
  var index
  var previousTime = new Date(value.created_at).getTime()
  var updatedTime = new Date(value.updated_at).getTime()
  var playedTime

  for (index = 0; index < value.moves.length; index += 1) {
    if (value.moves[index].ply !== index + 1)
      semanticError(errors, "$.moves[" + index + "].ply", "MOVE_HISTORY_MISMATCH", "plies must be sequential from one")
    playedTime = new Date(value.moves[index].played_at).getTime()
    if (playedTime < previousTime || playedTime > updatedTime)
      semanticError(errors, "$.moves[" + index + "].played_at", "TIMESTAMP_ORDER", "must be ordered between created_at and updated_at")
    previousTime = playedTime
  }
  if (value.moves.length > 0 && value.moves[value.moves.length - 1].fen_after !== value.fen)
    semanticError(errors, "$.moves[" + (value.moves.length - 1) + "].fen_after", "RULES_STATE_MISMATCH", "last move FEN must equal the document FEN")
}

function semanticValidateActiveGame(value, rulesAdapter) {
  var structural = validateActiveGame(value)
  var errors = []
  var fenRules
  var pgnRules
  var turn
  var key

  if (!structural.ok)
    return structural
  fenRules = rulesFrom(rulesAdapter, { fen: value.fen })
  if (!validRules(fenRules)) {
    semanticError(errors, "$.fen", "POSITION_INVALID", "FEN could not be loaded by RulesAdapter")
    return validationFailure(errors)
  }
  turn = fenRules.turn()
  if (turn !== "white" && turn !== "black")
    semanticError(errors, "$.fen", "POSITION_INVALID", "RulesAdapter returned an invalid side to move")

  if (value.pgn.trim() !== "") {
    pgnRules = rulesFrom(rulesAdapter, {
      pgn: value.pgn,
      pgnOptions: { strict: true }
    })
    if (!validRules(pgnRules))
      semanticError(errors, "$.pgn", "PGN_INVALID", "PGN could not be loaded by RulesAdapter")
    else if (pgnRules.fen() !== fenRules.fen())
      semanticError(errors, "$.pgn", "RULES_STATE_MISMATCH", "PGN final position must equal the document FEN")
  }

  validateModePlayers(value, errors)
  validateLifecycle(value, turn, errors)
  validateClockSemantics(value, turn, errors)
  validateMoveSemantics(value, errors)

  key = currentPositionKey(fenRules)
  if (!key || !own(value.position_counts, key) || value.position_counts[key] < 1)
    semanticError(errors, "$.position_counts", "RULES_STATE_MISMATCH", "current repetition position key is missing")
  if (new Date(value.updated_at).getTime() < new Date(value.created_at).getTime())
    semanticError(errors, "$.updated_at", "TIMESTAMP_ORDER", "cannot precede created_at")
  if (value.result && new Date(value.result.finished_at).getTime() < new Date(value.created_at).getTime())
    semanticError(errors, "$.result.finished_at", "TIMESTAMP_ORDER", "cannot precede created_at")

  return errors.length > 0 ? validationFailure(errors) : success(value)
}

function defaultHistory() {
  return {
    schema_version: CURRENT_SCHEMA_VERSION,
    games: []
  }
}

function safeOwnedGamePath(path, gameId, suffix) {
  if (typeof path !== "string" || typeof gameId !== "string")
    return false
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/.test(gameId) || gameId.indexOf("..") !== -1)
    return false
  return path === "games/" + gameId + suffix
}

function validateHistorySummary(summary, index, errors) {
  var path = "$.games[" + index + "]"
  var allowed = [
    "game_id", "mode", "white", "black", "score", "reason", "move_count",
    "started_at", "finished_at", "difficulty", "time_control", "pgn_path",
    "record_path"
  ]
  var required = [
    "game_id", "mode", "white", "black", "score", "reason", "move_count",
    "started_at", "finished_at", "pgn_path", "record_path"
  ]

  if (!requireObject(summary, path, errors))
    return
  requireKeys(summary, required, path, errors)
  rejectUnknownKeys(summary, allowed, path, errors)
  validateString(summary.game_id, path + ".game_id", errors)
  validateEnum(summary.mode, ["computer", "local"], path + ".mode", errors)
  validateString(summary.white, path + ".white", errors, 0, 80)
  validateString(summary.black, path + ".black", errors, 0, 80)
  validateEnum(summary.score, COMPLETED_SCORES, path + ".score", errors)
  validateString(summary.reason, path + ".reason", errors)
  validateInteger(summary.move_count, path + ".move_count", errors, 0)
  validateTimestamp(summary.started_at, path + ".started_at", errors)
  validateTimestamp(summary.finished_at, path + ".finished_at", errors)
  if (own(summary, "difficulty") && summary.difficulty !== null)
    validateString(summary.difficulty, path + ".difficulty", errors)
  if (own(summary, "time_control"))
    validateString(summary.time_control, path + ".time_control", errors)
  validateString(summary.pgn_path, path + ".pgn_path", errors)
  validateString(summary.record_path, path + ".record_path", errors)
  if (!safeOwnedGamePath(summary.pgn_path, summary.game_id, ".pgn"))
    addError(errors, path + ".pgn_path", "UNSAFE_PATH", "must be the project-owned PGN path for this game")
  if (!safeOwnedGamePath(summary.record_path, summary.game_id, ".json"))
    addError(errors, path + ".record_path", "UNSAFE_PATH", "must be the project-owned record path for this game")
  if (isUtcTimestamp(summary.started_at) && isUtcTimestamp(summary.finished_at) &&
      new Date(summary.finished_at).getTime() < new Date(summary.started_at).getTime())
    addError(errors, path + ".finished_at", "TIMESTAMP_ORDER", "cannot precede started_at")
}

function validateHistory(value) {
  var schema = schemaVersionResult(value, "history")
  var errors = []
  var seen = {}
  var index

  if (!schema.ok)
    return schema
  requireKeys(value, ["schema_version", "games"], "$", errors)
  rejectUnknownKeys(value, ["schema_version", "games"], "$", errors)
  if (requireArray(value.games, "$.games", errors)) {
    for (index = 0; index < value.games.length; index += 1) {
      validateHistorySummary(value.games[index], index, errors)
      if (isObject(value.games[index]) && typeof value.games[index].game_id === "string") {
        var seenKey = "$" + value.games[index].game_id
        if (seen[seenKey])
          addError(errors, "$.games[" + index + "].game_id", "DUPLICATE_GAME_ID", "must be unique")
        seen[seenKey] = true
      }
    }
  }
  return errors.length > 0 ? validationFailure(errors) : success(value)
}

function migrateHistory(value) {
  return migrateDocument(value, "history", validateHistory)
}

function replacePgnResult(pgn, score) {
  var normalized = String(pgn || "").replace(/\r\n?/g, "\n").trim()
  var lines = normalized === "" ? [] : normalized.split("\n")
  var headers = []
  var outputHeaders = []
  var index = 0
  var resultSeen = false
  var line
  var body
  var terminal = /(^|\s)(1-0|0-1|1\/2-1\/2|\*)\s*$/

  while (index < lines.length) {
    line = lines[index].trim()
    if (line === "" && headers.length > 0) {
      index += 1
      continue
    }
    if (!/^\[[A-Za-z0-9_]+\s+".*"\]$/.test(line))
      break
    headers.push(line)
    index += 1
  }
  for (var headerIndex = 0; headerIndex < headers.length; headerIndex += 1) {
    if (/^\[Result\s+"/.test(headers[headerIndex])) {
      if (!resultSeen)
        outputHeaders.push("[Result \"" + score + "\"]")
      resultSeen = true
    } else {
      outputHeaders.push(headers[headerIndex])
    }
  }
  if (!resultSeen)
    outputHeaders.push("[Result \"" + score + "\"]")

  body = lines.slice(index).join("\n").trim()
  if (terminal.test(body))
    body = body.replace(terminal, "$1" + score)
  else
    body += (body === "" ? "" : " ") + score
  return outputHeaders.join("\n") + "\n\n" + body.trim() + "\n"
}

function createCompletedRecord(activeGame, result) {
  var source = cloneJson(activeGame || {})
  var finalResult = normalizeResult(result || source.result, source.updated_at || source.created_at)
  var finishedAt = finalResult ? finalResult.finished_at : timestamp(source.updated_at, source.created_at)
  var startedMs = new Date(source.created_at).getTime()
  var finishedMs = new Date(finishedAt).getTime()

  source.schema_version = CURRENT_SCHEMA_VERSION
  source.result = finalResult
  source.status = finalResult && finalResult.reason === "abandoned" ? "abandoned" : "completed"
  source.updated_at = finishedAt
  source.duration_ms = isFinite(startedMs) && isFinite(finishedMs)
    ? Math.max(0, finishedMs - startedMs)
    : 0
  source.pgn = replacePgnResult(source.pgn, finalResult ? finalResult.score : "*")
  if (isObject(source.clock)) {
    source.clock.running_side = null
    source.clock.last_started_at = null
  }
  if (own(source, "pending_draw_offer_by"))
    source.pending_draw_offer_by = null
  return deepFreeze(source)
}

function pgnResultTag(pgn) {
  var match = String(pgn || "").match(/^\[Result\s+"(1-0|0-1|1\/2-1\/2|\*)"\]$/m)
  return match ? match[1] : null
}

function pgnTerminalMarker(pgn) {
  var match = String(pgn || "").trim().match(/(?:^|\s)(1-0|0-1|1\/2-1\/2|\*)$/)
  return match ? match[1] : null
}

function validateCompletedRecord(value) {
  var structural = validateActiveStructure(value, true)
  var errors = []
  var expectedDuration
  var headerResult
  var terminalResult

  if (!structural.ok)
    return structural
  validateModePlayers(value, errors)
  validateLifecycle(value, value.fen.trim().split(/\s+/)[1] === "w" ? "white" : "black", errors)
  validateClockSemantics(value, value.fen.trim().split(/\s+/)[1] === "w" ? "white" : "black", errors)
  validateMoveSemantics(value, errors)
  if (new Date(value.updated_at).getTime() < new Date(value.created_at).getTime())
    semanticError(errors, "$.updated_at", "TIMESTAMP_ORDER", "cannot precede created_at")
  if (value.result.finished_at !== value.updated_at)
    semanticError(errors, "$.result.finished_at", "RESULT_STATE_MISMATCH", "must equal the completed record updated_at")
  expectedDuration = new Date(value.result.finished_at).getTime() - new Date(value.created_at).getTime()
  if (expectedDuration >= 0 && value.duration_ms !== expectedDuration)
    semanticError(errors, "$.duration_ms", "TIMESTAMP_ORDER", "must equal finished_at minus created_at")
  headerResult = pgnResultTag(value.pgn)
  terminalResult = pgnTerminalMarker(value.pgn)
  if (headerResult !== value.result.score)
    semanticError(errors, "$.pgn", "RESULT_STATE_MISMATCH", "PGN Result tag must match the record result")
  if (terminalResult !== value.result.score)
    semanticError(errors, "$.pgn", "RESULT_STATE_MISMATCH", "PGN terminal marker must match the record result")
  return errors.length > 0 ? validationFailure(errors) : success(value)
}

function migrateCompletedRecord(value) {
  var migrated = migrateDocument(value, "completed_game", validateCompletedRecord)

  if (migrated.ok)
    migrated.value = deepFreeze(migrated.value)
  return migrated
}

function timeControlSummary(record) {
  var control = record.time_control

  if (isObject(control)) {
    if (control.base_ms === null)
      return "-"
    return String(control.base_ms / 1000) + "+" +
      String(control.increment_ms / 1000)
  }
  return record.clock && record.clock.enabled ? "unknown" : "-"
}

function summaryFromRecord(record) {
  var summary = {
    game_id: record.game_id,
    mode: record.mode,
    white: record.players.white.name,
    black: record.players.black.name,
    score: record.result.score,
    reason: record.result.reason,
    move_count: record.moves.length,
    started_at: record.created_at,
    finished_at: record.result.finished_at,
    difficulty: own(record, "difficulty") ? record.difficulty : null,
    time_control: timeControlSummary(record),
    pgn_path: "games/" + record.game_id + ".pgn",
    record_path: "games/" + record.game_id + ".json"
  }

  return summary
}

function appendHistorySummary(history, gameRecord) {
  var historyValidation = validateHistory(history)
  var recordValidation = validateCompletedRecord(gameRecord)
  var next
  var summary
  var index

  if (!historyValidation.ok)
    return historyValidation
  if (!recordValidation.ok)
    return recordValidation
  if (!inList(gameRecord.result.score, COMPLETED_SCORES))
    return failure("HISTORY_SUMMARY_INVALID", [], "Abandoned games do not have a scored history summary")
  summary = summaryFromRecord(gameRecord)
  if (!safeOwnedGamePath(summary.record_path, summary.game_id, ".json"))
    return failure("HISTORY_SUMMARY_INVALID", [], "Game ID cannot be used in an owned history path")

  for (index = 0; index < history.games.length; index += 1) {
    if (history.games[index].game_id !== summary.game_id)
      continue
    if (sameJson(history.games[index], summary))
      return success(cloneJson(history), { appended: false, idempotent: true })
    return failure("HISTORY_DUPLICATE_CONFLICT", [
      {
        path: "$.games[" + index + "]",
        code: "DUPLICATE_GAME_ID",
        message: "game_id already refers to a different summary"
      }
    ])
  }

  next = cloneJson(history)
  next.games.push(summary)
  return success(next, { appended: true, idempotent: false })
}

function removeHistorySummary(history, gameId) {
  var validation = validateHistory(history)
  var next
  var index
  var removed = false

  if (!validation.ok)
    return validation
  if (typeof gameId !== "string")
    return failure("PERSISTENCE_VALIDATION_FAILED", [{
      path: "$game_id",
      code: "TYPE",
      message: "game ID must be a string"
    }])
  next = defaultHistory()
  for (index = 0; index < history.games.length; index += 1) {
    if (history.games[index].game_id === gameId)
      removed = true
    else
      next.games.push(cloneJson(history.games[index]))
  }
  return success(next, { removed: removed, idempotent: !removed })
}

function toPgn(record) {
  var validation = validateCompletedRecord(record)

  if (!validation.ok)
    return validation
  return replacePgnResult(record.pgn, record.result.score)
}

var PersistenceModel = {
  CURRENT_SCHEMA_VERSION: CURRENT_SCHEMA_VERSION,
  migrations: migrations,
  defaultSettings: defaultSettings,
  validateSettings: validateSettings,
  migrateSettings: migrateSettings,
  mergeSettingsPatch: mergeSettingsPatch,
  createActiveGame: createActiveGame,
  validateActiveGame: validateActiveGame,
  migrateActiveGame: migrateActiveGame,
  semanticValidateActiveGame: semanticValidateActiveGame,
  defaultHistory: defaultHistory,
  validateHistory: validateHistory,
  migrateHistory: migrateHistory,
  appendHistorySummary: appendHistorySummary,
  removeHistorySummary: removeHistorySummary,
  createCompletedRecord: createCompletedRecord,
  validateCompletedRecord: validateCompletedRecord,
  migrateCompletedRecord: migrateCompletedRecord,
  toPgn: toPgn,
  serialize: serialize,
  stableSerialize: serialize
}

if (typeof module !== "undefined" && module.exports)
  module.exports = PersistenceModel
