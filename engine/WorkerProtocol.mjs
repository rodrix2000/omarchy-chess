/* Stable JSON-only boundary around the search worker. */

"use strict"

var configuredSearchEngine = null
var configuredDifficultyProfiles = null
var WORKER_PROTOCOL_VERSION = 1
var WORKER_MAX_HISTORY = 2048
var WORKER_MAX_POSITION_COUNTS = 2048

function configureDependencies(searchEngine, difficultyProfiles) {
  if (!searchEngine || typeof searchEngine.search !== "function")
    throw new Error("WorkerProtocol: invalid SearchEngine dependency")
  if (!difficultyProfiles || typeof difficultyProfiles.isKnown !== "function")
    throw new Error("WorkerProtocol: invalid DifficultyProfiles dependency")
  configuredSearchEngine = searchEngine
  configuredDifficultyProfiles = difficultyProfiles
  return true
}

function workerFinite(value) {
  return typeof value === "number" && isFinite(value)
}

function workerSafeString(value, maximum) {
  return typeof value === "string" && value.length > 0 && value.length <= maximum
}

function workerContext(request) {
  var input = request && typeof request === "object" ? request : {}
  return {
    token: workerFinite(input.token) ? input.token : null,
    game_id: workerSafeString(input.game_id, 128) ? input.game_id : "",
    source_fen: typeof input.source_fen === "string" && input.source_fen.length <= 512
      ? input.source_fen : ""
  }
}

function workerErrorEnvelope(request, code, message) {
  var context = workerContext(request)
  return {
    protocol_version: WORKER_PROTOCOL_VERSION,
    type: "error",
    token: context.token,
    game_id: context.game_id,
    source_fen: context.source_fen,
    code: code,
    message: String(message || "Computer worker rejected the request.").slice(0, 240)
  }
}

function workerValidateHistory(history) {
  var index

  if (history === undefined)
    return true
  if (!Array.isArray(history) || history.length > WORKER_MAX_HISTORY)
    return false
  for (index = 0; index < history.length; index += 1) {
    if (typeof history[index] !== "string" ||
        !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(history[index]))
      return false
  }
  return true
}

function workerValidateCounts(counts) {
  var keys
  var index

  if (counts === undefined)
    return true
  if (!counts || typeof counts !== "object" || Array.isArray(counts))
    return false
  keys = Object.keys(counts)
  if (keys.length > WORKER_MAX_POSITION_COUNTS)
    return false
  for (index = 0; index < keys.length; index += 1) {
    if (keys[index].length === 0 || keys[index].length > 128 ||
        !workerFinite(counts[keys[index]]) || counts[keys[index]] < 0 ||
        Math.floor(counts[keys[index]]) !== counts[keys[index]])
      return false
  }
  return true
}

function validateSearchRequest(request) {
  if (!request || typeof request !== "object" || Array.isArray(request))
    return { ok: false, code: "AI_INVALID_REQUEST", message: "Request must be an object." }
  if (request.protocol_version !== WORKER_PROTOCOL_VERSION)
    return { ok: false, code: "AI_PROTOCOL_UNSUPPORTED", message: "Unsupported AI worker protocol version." }
  if (request.type !== "search")
    return { ok: false, code: "AI_UNKNOWN_REQUEST", message: "Worker accepts search requests only." }
  if (!workerFinite(request.token) || request.token < 0 ||
      Math.floor(request.token) !== request.token)
    return { ok: false, code: "AI_INVALID_TOKEN", message: "Search token must be a non-negative integer." }
  if (!workerSafeString(request.game_id, 128))
    return { ok: false, code: "AI_INVALID_GAME_ID", message: "Game ID is missing or too long." }
  if (!workerSafeString(request.source_fen, 512))
    return { ok: false, code: "AI_INVALID_FEN", message: "Source FEN is missing or too long." }
  if (!configuredDifficultyProfiles ||
      !configuredDifficultyProfiles.isKnown(request.profile))
    return { ok: false, code: "AI_UNKNOWN_PROFILE", message: "Unknown computer difficulty profile." }
  if (!workerFinite(request.seed))
    return { ok: false, code: "AI_INVALID_SEED", message: "Search seed must be numeric." }
  if (request.budget_ms !== undefined &&
      (!workerFinite(request.budget_ms) || request.budget_ms < 1))
    return { ok: false, code: "AI_INVALID_BUDGET", message: "Search budget must be positive." }
  if (!workerValidateHistory(request.history_uci))
    return { ok: false, code: "AI_HISTORY_BOUNDS", message: "Move history is malformed or too large." }
  if (!workerValidateCounts(request.position_counts))
    return { ok: false, code: "AI_POSITION_COUNTS_BOUNDS", message: "Position counts are malformed or too large." }
  return { ok: true, code: "OK", message: "" }
}

function handleMessage(request, runtime) {
  var validation
  var result

  if (!configuredSearchEngine || !configuredDifficultyProfiles)
    return workerErrorEnvelope(request, "AI_NOT_CONFIGURED", "Worker dependencies are unavailable.")
  validation = validateSearchRequest(request)
  if (!validation.ok)
    return workerErrorEnvelope(request, validation.code, validation.message)

  try {
    result = configuredSearchEngine.search(request, runtime || {})
  } catch (error) {
    return workerErrorEnvelope(
      request,
      "AI_SEARCH_FAILED",
      String(error && error.message || error)
    )
  }
  if (!result || result.ok !== true)
    return workerErrorEnvelope(
      request,
      result && result.code || "AI_SEARCH_FAILED",
      result && result.message || "Search did not return a result."
    )
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(result.uci))
    return workerErrorEnvelope(request, "AI_NO_MOVE", "Search returned malformed move notation.")

  return {
    protocol_version: WORKER_PROTOCOL_VERSION,
    type: "bestmove",
    token: request.token,
    game_id: request.game_id,
    source_fen: request.source_fen,
    uci: result.uci,
    score_cp: result.score_cp,
    depth: result.depth,
    nodes: result.nodes,
    duration_ms: result.duration_ms,
    principal_variation: result.principal_variation || [],
    limited_by: result.limited_by,
    table_entries: result.table_entries,
    profile_id: result.profile_id,
    budget_ms: result.budget_ms
  }
}

function validateWorkerResponse(response) {
  if (!response || typeof response !== "object" || Array.isArray(response))
    return { ok: false, code: "AI_RESPONSE_INVALID" }
  if (response.protocol_version !== WORKER_PROTOCOL_VERSION)
    return { ok: false, code: "AI_PROTOCOL_UNSUPPORTED" }
  if (response.type === "error") {
    return workerSafeString(response.code, 80) && typeof response.message === "string"
      ? { ok: true, code: "OK" }
      : { ok: false, code: "AI_RESPONSE_INVALID" }
  }
  if (response.type !== "bestmove" ||
      !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(String(response.uci || "")) ||
      !workerFinite(response.score_cp) || !workerFinite(response.depth) ||
      response.depth < 0 || !workerFinite(response.nodes) || response.nodes < 0 ||
      !workerFinite(response.duration_ms) || response.duration_ms < 0)
    return { ok: false, code: "AI_RESPONSE_INVALID" }
  return { ok: true, code: "OK" }
}

function isCurrentResponse(response, expected) {
  var validation = validateWorkerResponse(response)
  var state = expected || {}

  if (!validation.ok || response.type !== "bestmove")
    return false
  if (response.token !== state.token || response.game_id !== state.game_id ||
      response.source_fen !== state.source_fen)
    return false
  if (state.accepting === false || state.completed === true || state.paused === true)
    return false
  return true
}

var WorkerProtocol = {
  configureDependencies: configureDependencies,
  validateSearchRequest: validateSearchRequest,
  handleMessage: handleMessage,
  validateResponse: validateWorkerResponse,
  isCurrentResponse: isCurrentResponse,
  protocol_version: WORKER_PROTOCOL_VERSION
}

export {
  configureDependencies,
  validateSearchRequest,
  handleMessage,
  validateWorkerResponse as validateResponse,
  isCurrentResponse
}
