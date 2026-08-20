/*
 * Transactional chess-game coordinator shared by QML and Node tests.
 *
 * This module owns game state, but never writes files and never performs AI
 * search.  The service persists successful command results and may use the
 * checkpoint API to roll back a failed integration transaction.
 */

"use strict"

var configuredDependencies = null
var ORTHODOX_START_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
var PLUGIN_VERSION = "1.0.4"
var gameSequence = 0

if (typeof module !== "undefined" && module.exports && typeof require === "function") {
  configuredDependencies = {
    RulesAdapter: require("./RulesAdapter.js"),
    PositionKey: require("./PositionKey.js"),
    Adjudicator: require("./Adjudicator.js"),
    ClockController: require("./ClockController.js"),
    PgnMetadata: require("./PgnMetadata.js")
  }
}

function configureDependencies(dependencies) {
  var input = dependencies || {}

  if (!input.RulesAdapter || typeof input.RulesAdapter.create !== "function")
    throw new Error("GameController: RulesAdapter dependency is invalid")
  if (!input.PositionKey || typeof input.PositionKey.fromRules !== "function")
    throw new Error("GameController: PositionKey dependency is invalid")
  if (!input.Adjudicator || typeof input.Adjudicator.evaluatePostMove !== "function")
    throw new Error("GameController: Adjudicator dependency is invalid")
  if (!input.ClockController || typeof input.ClockController.create !== "function")
    throw new Error("GameController: ClockController dependency is invalid")

  configuredDependencies = input
  return true
}

function dependencies() {
  if (!configuredDependencies)
    throw new Error("GameController: dependencies have not been configured")
  return configuredDependencies
}

function own(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key)
}

function cloneJson(value) {
  if (value === undefined)
    return undefined
  return JSON.parse(JSON.stringify(value))
}

function shallowCopy(value) {
  var output = {}
  var key

  if (!value || typeof value !== "object")
    return output
  for (key in value) {
    if (own(value, key))
      output[key] = value[key]
  }
  return output
}

function sideName(value) {
  var normalized = String(value || "").toLowerCase()

  if (normalized === "w")
    normalized = "white"
  else if (normalized === "b")
    normalized = "black"
  return normalized === "white" || normalized === "black" ? normalized : null
}

function oppositeSide(side) {
  return side === "white" ? "black" : "white"
}

function activeStatus(status) {
  return status === "active-human" || status === "active-computer" ||
    status === "paused" || status === "paused-error"
}

function terminalStatus(status) {
  return status === "completed" || status === "abandoned"
}

function finiteInteger(value, fallback) {
  var number = Number(value)

  if (!isFinite(number))
    return fallback
  return Math.floor(number)
}

function clockControl(value) {
  var input = value || {}
  var base = input.base_ms
  var increment = finiteInteger(input.increment_ms, 0)

  if (base === undefined || base === null)
    base = null
  else {
    base = finiteInteger(base, -1)
    if (base < 0)
      return null
  }
  if (increment < 0)
    return null
  return {
    base_ms: base,
    increment_ms: increment
  }
}

function validSquare(value) {
  return typeof value === "string" && /^[a-h][1-8]$/.test(value.toLowerCase())
}

function parseHalfmove(fen) {
  var fields = String(fen || "").trim().split(/\s+/)
  var value = Number(fields[4])

  return isFinite(value) && value >= 0 ? value : 0
}

function normalizePromotion(value) {
  var normalized = String(value || "").toLowerCase()
  var names = {
    q: "queen",
    r: "rook",
    b: "bishop",
    n: "knight",
    queen: "queen",
    rook: "rook",
    bishop: "bishop",
    knight: "knight"
  }

  return names[normalized] || null
}

function publicResult(result) {
  var output

  if (!result)
    return null
  output = cloneJson(result)
  if (!own(output, "winner")) {
    if (output.score === "1-0")
      output.winner = "white"
    else if (output.score === "0-1")
      output.winner = "black"
    else
      output.winner = null
  }
  return output
}

function persistedResult(result) {
  if (!result)
    return null
  return {
    score: result.score,
    reason: result.reason,
    finished_at: result.finished_at
  }
}

function create(options) {
  var input = options || {}
  var deps = input.dependencies || dependencies()
  var nowProvider = typeof input.now === "function" ? input.now : function () {
    return Date.now()
  }
  var randomProvider = typeof input.random === "function" ? input.random : Math.random
  var rules = null
  var state = null
  var eventSequence = 0
  var lastCommand = null

  function nowMilliseconds() {
    var value = nowProvider()
    var number

    if (Object.prototype.toString.call(value) === "[object Date]")
      value = value.getTime()
    if (typeof value === "string" && !/^[-+]?\d+(\.\d+)?$/.test(value))
      value = Date.parse(value)
    number = Number(value)
    if (!isFinite(number))
      throw new Error("GameController: now provider returned an invalid value")
    return number
  }

  function iso(milliseconds) {
    return new Date(milliseconds === undefined ? nowMilliseconds() : milliseconds).toISOString()
  }

  function newGameId(milliseconds) {
    var randomPart

    gameSequence += 1
    randomPart = Math.floor(Math.max(0, Math.min(0.999999999, Number(randomProvider()))) *
      0x100000000).toString(36)
    return "game_" + Math.floor(milliseconds).toString(36) + "_" +
      gameSequence.toString(36) + "_" + randomPart
  }

  function event(type, payload, occurredAt) {
    eventSequence += 1
    return {
      id: "evt_" + eventSequence,
      type: type,
      occurred_at: occurredAt || iso(),
      game_id: state ? state.game_id : null,
      payload: cloneJson(payload || {})
    }
  }

  function failed(code, details) {
    var output = {
      ok: false,
      code: code,
      message_key: "error." + String(code || "unknown").toLowerCase(),
      details: cloneJson(details || {}),
      events: []
    }

    lastCommand = output
    return output
  }

  function succeeded(code, data, events) {
    var output = {
      ok: true,
      code: code,
      data: cloneJson(data || {}),
      events: cloneJson(events || [])
    }

    lastCommand = output
    return output
  }

  function playerFor(side) {
    return state && state.players ? state.players[side] : null
  }

  function statusForCurrentTurn() {
    var player

    if (!rules || !state)
      return "idle"
    player = playerFor(rules.turn())
    return player && player.kind === "computer" ? "active-computer" : "active-human"
  }

  function pgnHeaders() {
    var metadata = deps.PgnMetadata

    if (!metadata || typeof metadata.buildHeaders !== "function")
      return {}
    return metadata.buildHeaders(state, {
      active: !terminalStatus(state.status),
      result: state.result,
      initial_fen: state.initial_fen,
      plugin_version: state.plugin_version,
      time_control: state.time_control
    })
  }

  function applyPgnHeaders() {
    var headers = pgnHeaders()
    var key

    if (!rules || typeof rules.setHeader !== "function")
      return
    for (key in headers) {
      if (own(headers, key))
        rules.setHeader(key, headers[key])
    }
  }

  function positionContext(positionOverrides) {
    var position = {
      side_to_move: rules.turn(),
      checkmate: rules.isCheckmate(),
      stalemate: rules.isStalemate(),
      dead_position: rules.isDeadPositionCandidate(),
      halfmove_clock: parseHalfmove(rules.fen())
    }
    var key

    if (positionOverrides) {
      for (key in positionOverrides) {
        if (own(positionOverrides, key))
          position[key] = positionOverrides[key]
      }
    }
    return {
      position: position,
      position_counts: state.position_counts,
      current_position_key: deps.PositionKey.fromRules(rules),
      rules: rules,
      PositionKey: deps.PositionKey,
      material: rules.material()
    }
  }

  function refreshClaims(positionOverrides) {
    var adjudication = deps.Adjudicator.evaluatePostMove(positionContext(positionOverrides))

    state.claims = adjudication.claims || {
      threefold_current: false,
      fifty_move_current: false,
      prospective_moves: []
    }
    return adjudication
  }

  function persistedClock(clock, sampleAt) {
    var controller = deps.ClockController
    var value = controller.snapshot(clock, sampleAt)
    var started = value.last_started_at_ms

    return {
      enabled: value.enabled === true,
      white_ms: value.enabled ? finiteInteger(value.white_ms, 0) : null,
      black_ms: value.enabled ? finiteInteger(value.black_ms, 0) : null,
      increment_ms: value.enabled ? finiteInteger(value.increment_ms, 0) : 0,
      running_side: value.enabled ? sideName(value.running_side) : null,
      last_started_at: value.enabled && started !== null && started !== undefined ?
        iso(Number(started)) : null
    }
  }

  function restoreClockDocument(documentClock) {
    var source = shallowCopy(documentClock || {})

    source.last_started_at_ms = source.last_started_at
    return deps.ClockController.restore(source, nowMilliseconds())
  }

  function completedResult(result, finishedAt) {
    return {
      score: result.score,
      reason: result.reason,
      winner: result.winner || null,
      finished_at: finishedAt || iso()
    }
  }

  function finish(adjudication, finishedAt, resultStatus) {
    var result = adjudication && adjudication.result ? adjudication.result : adjudication

    state.result = completedResult(result, finishedAt)
    state.status = resultStatus || (result.reason === "abandoned" ? "abandoned" : "completed")
    state.pending_promotion = null
    state.pending_draw_offer_by = null
    state.claims = null
    state.search_token += 1
    state.clock = deps.ClockController.pause(state.clock, result.reason, nowMilliseconds())
    state.updated_at = finishedAt || iso()
    applyPgnHeaders()
    return event(state.status === "abandoned" ? "game-abandoned" : "game-completed", {
      result: state.result
    }, state.updated_at)
  }

  function computerTurnEvent(occurredAt) {
    if (state.status !== "active-computer")
      return null
    return event("computer-turn-requested", {
      token: state.search_token,
      fen: rules.fen(),
      side: rules.turn(),
      difficulty: state.difficulty
    }, occurredAt)
  }

  function replayRules(checkpointState) {
    var candidate
    var index
    var committed

    candidate = deps.RulesAdapter.create({ fen: checkpointState.initial_fen || ORTHODOX_START_FEN })
    if (!candidate || candidate.valid === false)
      throw new Error("GameController invariant: checkpoint starting FEN is invalid")

    for (index = 0; index < checkpointState.moves.length; index += 1) {
      committed = candidate.commitMove(checkpointState.moves[index].uci)
      if (!committed || committed.ok !== true)
        throw new Error("GameController invariant: checkpoint move history is invalid")
    }
    return candidate
  }

  function checkpoint() {
    if (!state)
      return { state: null, rules_pgn: null, event_sequence: eventSequence }
    return {
      state: cloneJson(state),
      rules_pgn: rules.pgn(),
      rules_fen: rules.fen(),
      event_sequence: eventSequence
    }
  }

  function restoreCheckpoint(saved) {
    var candidate

    if (!saved || saved.state === undefined)
      return failed("INVALID_CHECKPOINT")
    if (saved.state === null) {
      state = null
      rules = null
      eventSequence = finiteInteger(saved.event_sequence, eventSequence)
      return succeeded("CHECKPOINT_RESTORED")
    }

    try {
      candidate = typeof saved.rules_pgn === "string" && saved.rules_pgn ?
        deps.RulesAdapter.create({ pgn: saved.rules_pgn }) : replayRules(saved.state)
      if (!candidate || candidate.valid === false ||
          (saved.rules_fen && candidate.fen() !== saved.rules_fen))
        candidate = replayRules(saved.state)
      if (saved.rules_fen && candidate.fen() !== saved.rules_fen)
        return failed("INVALID_CHECKPOINT", { reason: "position-mismatch" })
    } catch (error) {
      return failed("INVALID_CHECKPOINT", { reason: String(error && error.message || error) })
    }

    state = cloneJson(saved.state)
    rules = candidate
    eventSequence = finiteInteger(saved.event_sequence, eventSequence)
    return succeeded("CHECKPOINT_RESTORED", { game_id: state.game_id })
  }

  function normalizedPlayers(mode, humanColor, supplied) {
    var players = supplied || {}
    var whiteKind = mode === "computer" && humanColor !== "white" ? "computer" : "human"
    var blackKind = mode === "computer" && humanColor !== "black" ? "computer" : "human"

    return {
      white: {
        kind: whiteKind,
        name: String(players.white && players.white.name ||
          (whiteKind === "computer" ? "Omarchy" : "White")).slice(0, 80) || "White"
      },
      black: {
        kind: blackKind,
        name: String(players.black && players.black.name ||
          (blackKind === "computer" ? "Omarchy" : "Black")).slice(0, 80) || "Black"
      }
    }
  }

  function newGame(newOptions) {
    var settings = newOptions || {}
    var mode = settings.mode || input.mode || "computer"
    var humanColor = settings.human_color || settings.humanColor ||
      input.human_color || input.humanColor || "white"
    var control = clockControl(settings.time_control || settings.timeControl ||
      input.time_control || input.timeControl)
    var startedMs
    var startedAt
    var candidate
    var currentKey
    var adjudication
    var events
    var computerEvent
    var conflictEvents = []
    var requestedGameId = settings.game_id || settings.gameId ||
      (!state ? (input.game_id || input.gameId) : null)

    if (state && activeStatus(state.status)) {
      if (settings.conflict === "cancel")
        return succeeded("NEW_GAME_CANCELLED", { game_id: state.game_id })
      if (settings.conflict !== "abandon")
        return failed("ACTIVE_GAME_CONFLICT", { game_id: state.game_id })
      conflictEvents.push(finish(deps.Adjudicator.evaluateExternalAction(
        positionContext(), { type: "abandon" }
      ), iso()))
    }
    if (mode !== "computer" && mode !== "local")
      return failed("INVALID_MODE")
    if (!control)
      return failed("INVALID_TIME_CONTROL")

    if (mode === "local")
      humanColor = null
    else {
      humanColor = String(humanColor || "white").toLowerCase()
      if (humanColor === "random")
        humanColor = Number(randomProvider()) < 0.5 ? "white" : "black"
      if (humanColor !== "white" && humanColor !== "black")
        return failed("INVALID_HUMAN_COLOR")
    }

    startedMs = nowMilliseconds()
    startedAt = iso(startedMs)
    candidate = deps.RulesAdapter.create({
      fen: settings.initial_fen || settings.fen || ORTHODOX_START_FEN
    })
    if (!candidate || candidate.valid === false)
      return failed("POSITION_INVALID", { rules_error: candidate && candidate.error })

    rules = candidate
    state = {
      schema_version: 1,
      game_id: typeof requestedGameId === "string" && requestedGameId.length >= 8 ?
        requestedGameId.slice(0, 128) :
        newGameId(startedMs),
      plugin_version: String(settings.plugin_version || settings.pluginVersion ||
        input.plugin_version || input.pluginVersion || PLUGIN_VERSION).slice(0, 64),
      mode: mode,
      status: "active-human",
      created_at: startedAt,
      updated_at: startedAt,
      players: normalizedPlayers(mode, humanColor, settings.players || input.players),
      human_color: humanColor,
      difficulty: mode === "computer" ?
        String(settings.difficulty || input.difficulty || "casual").toLowerCase() : null,
      time_control: control,
      initial_fen: rules.fen(),
      orientation: settings.orientation || input.orientation || (humanColor || "auto"),
      moves: [],
      position_counts: {},
      clock: null,
      pending_draw_offer_by: null,
      pending_promotion: null,
      result: null,
      claims: null,
      search_token: 1
    }

    currentKey = deps.PositionKey.fromRules(rules)
    state.position_counts[currentKey] = 1
    state.status = statusForCurrentTurn()
    state.clock = deps.ClockController.create({
      enabled: control.base_ms !== null,
      base_ms: control.base_ms,
      increment_ms: control.increment_ms
    }, rules.turn(), startedMs)
    applyPgnHeaders()
    adjudication = refreshClaims()
    events = conflictEvents.concat([event("game-created", {
      mode: state.mode,
      human_color: state.human_color,
      status: state.status
    }, startedAt)])

    if (adjudication.terminal)
      events.push(finish(adjudication, startedAt))
    else {
      computerEvent = computerTurnEvent(startedAt)
      if (computerEvent)
        events.push(computerEvent)
    }

    return succeeded("GAME_CREATED", { game_id: state.game_id }, events)
  }

  function loadGame(document) {
    var source = document || {}
    var candidate
    var history
    var index
    var currentKey
    var loadedState
    var originalStatus
    var restoredAt
    var resultEvent

    if (state && activeStatus(state.status))
      return failed("ACTIVE_GAME_CONFLICT", { game_id: state.game_id })
    if (!source || typeof source !== "object" || typeof source.fen !== "string")
      return failed("PERSISTENCE_VALIDATION_FAILED")
    if (source.mode !== "computer" && source.mode !== "local")
      return failed("PERSISTENCE_VALIDATION_FAILED", { field: "mode" })

    try {
      candidate = typeof source.pgn === "string" && source.pgn.trim() ?
        deps.RulesAdapter.create({ pgn: source.pgn }) : deps.RulesAdapter.create({ fen: source.fen })
      if (!candidate || candidate.valid === false || candidate.fen() !== source.fen)
        return failed("RULES_STATE_MISMATCH", { field: "fen" })
      history = candidate.history({ format: "uci" })
      if (!Array.isArray(source.moves) || history.length !== source.moves.length)
        return failed("RULES_STATE_MISMATCH", { field: "moves" })
      for (index = 0; index < history.length; index += 1) {
        if (history[index] !== source.moves[index].uci ||
            source.moves[index].fen_after === undefined)
          return failed("RULES_STATE_MISMATCH", { ply: index + 1 })
      }
    } catch (error) {
      return failed("RULES_LOAD_FAILED", { reason: String(error && error.message || error) })
    }

    originalStatus = source.status
    if (!activeStatus(originalStatus) && !terminalStatus(originalStatus))
      return failed("PERSISTENCE_VALIDATION_FAILED", { field: "status" })
    if (terminalStatus(originalStatus) && !source.result)
      return failed("PERSISTENCE_VALIDATION_FAILED", { field: "result" })

    restoredAt = iso()
    loadedState = {
      schema_version: 1,
      game_id: String(source.game_id || ""),
      plugin_version: String(source.plugin_version || PLUGIN_VERSION),
      mode: source.mode,
      status: terminalStatus(originalStatus) ? originalStatus : "paused",
      created_at: source.created_at,
      updated_at: restoredAt,
      players: cloneJson(source.players),
      human_color: source.human_color || null,
      difficulty: source.difficulty === undefined ? null : source.difficulty,
      time_control: clockControl(source.time_control || {
        base_ms: source.clock && source.clock.enabled ? source.clock.white_ms : null,
        increment_ms: source.clock && source.clock.increment_ms
      }),
      initial_fen: candidate.getHeaders().FEN || ORTHODOX_START_FEN,
      orientation: source.orientation || "auto",
      moves: cloneJson(source.moves),
      position_counts: cloneJson(source.position_counts || {}),
      clock: restoreClockDocument(source.clock),
      pending_draw_offer_by: source.pending_draw_offer_by || null,
      pending_promotion: null,
      result: publicResult(source.result),
      claims: null,
      search_token: finiteInteger(source.search_token, 0) + 1
    }
    if (!loadedState.time_control)
      return failed("PERSISTENCE_VALIDATION_FAILED", { field: "time_control" })

    rules = candidate
    state = loadedState
    currentKey = deps.PositionKey.fromRules(rules)
    if (finiteInteger(state.position_counts[currentKey], 0) < 1) {
      state = null
      rules = null
      return failed("RULES_STATE_MISMATCH", { field: "position_counts" })
    }
    if (!terminalStatus(state.status))
      refreshClaims()
    applyPgnHeaders()
    resultEvent = event("recovery-loaded", {
      previous_status: originalStatus,
      status: state.status
    }, restoredAt)
    return succeeded("GAME_LOADED", { game_id: state.game_id }, [resultEvent])
  }

  function rejectIfUnavailable() {
    if (!state || !rules)
      return failed("NO_ACTIVE_GAME")
    if (terminalStatus(state.status))
      return failed("GAME_ALREADY_COMPLETE", { result: state.result })
    if (state.status === "paused")
      return failed("GAME_PAUSED")
    if (state.status === "paused-error")
      return failed("PERSISTENCE_UNHEALTHY")
    return null
  }

  function completeExternal(action, occurredAt) {
    var adjudication = deps.Adjudicator.evaluateExternalAction(positionContext(), action)
    var completion

    if (!adjudication.terminal)
      return null
    completion = finish(adjudication, occurredAt)
    return completion
  }

  function timeoutIfNeeded(at) {
    var flagged = deps.ClockController.flaggedSide(state.clock, at)
    var completion

    if (!flagged)
      return null
    completion = completeExternal({
      type: "timeout",
      expired_side: flagged,
      material: rules.material()
    }, iso(at))
    return {
      side: flagged,
      event: completion
    }
  }

  function commitMoveCommand(command, fromPending) {
    var input = command || {}
    var unavailable = rejectIfUnavailable()
    var actor = String(input.actor || "human").toLowerCase()
    var movingSide
    var controllingPlayer
    var at
    var timeout
    var clockBefore
    var drawBefore
    var committed
    var key
    var moveRecord
    var clockAfter
    var adjudication
    var events
    var checkEvent
    var completion
    var searchEvent

    if (unavailable)
      return unavailable
    if (state.pending_promotion && !fromPending)
      return failed("PROMOTION_REQUIRED", {
        choices: cloneJson(state.pending_promotion.choices)
      })
    if (!validSquare(input.from) || !validSquare(input.to))
      return failed(actor === "computer" ? "ILLEGAL_ENGINE_MOVE" : "INVALID_MOVE")

    movingSide = rules.turn()
    controllingPlayer = playerFor(movingSide)
    if (!controllingPlayer)
      return failed("RULES_STATE_MISMATCH", { field: "players" })
    if (actor !== controllingPlayer.kind) {
      if (actor === "human" && controllingPlayer.kind === "computer")
        return failed("COMPUTER_THINKING")
      return failed("WRONG_ACTOR", { expected_actor: controllingPlayer.kind })
    }
    if (input.side !== undefined && sideName(input.side) !== movingSide)
      return failed("WRONG_TURN", { side: movingSide })
    if (actor === "computer" && input.search_token !== undefined &&
        Number(input.search_token) !== state.search_token)
      return failed("AI_STALE_RESULT", { expected_token: state.search_token })

    at = nowMilliseconds()
    timeout = timeoutIfNeeded(at)
    if (timeout) {
      var expired = failed("CLOCK_EXPIRED", { result: state.result })
      expired.events = [timeout.event]
      return expired
    }

    clockBefore = cloneJson(state.clock)
    drawBefore = state.pending_draw_offer_by
    committed = rules.commitMove({
      from: input.from.toLowerCase(),
      to: input.to.toLowerCase(),
      promotion: input.promotion || null
    })

    if (!committed || committed.ok !== true) {
      if (committed && committed.code === "PROMOTION_REQUIRED" && actor === "human") {
        state.pending_promotion = {
          from: input.from.toLowerCase(),
          to: input.to.toLowerCase(),
          side: movingSide,
          actor: actor,
          choices: cloneJson(committed.choices || ["queen", "rook", "bishop", "knight"]),
          initiated_at: iso(at)
        }
        state.updated_at = iso(at)
        var required = failed("PROMOTION_REQUIRED", {
          pending_promotion: state.pending_promotion
        })
        required.choices = cloneJson(state.pending_promotion.choices)
        required.data = { choices: cloneJson(state.pending_promotion.choices) }
        required.events = [event("promotion-requested", state.pending_promotion, state.updated_at)]
        return required
      }
      return failed(actor === "computer" ? "ILLEGAL_ENGINE_MOVE" : "INVALID_MOVE", {
        rules_code: committed && committed.code
      })
    }

    state.pending_promotion = null
    clockAfter = deps.ClockController.commitMove(state.clock, movingSide, at)
    state.clock = clockAfter
    if (state.pending_draw_offer_by && state.pending_draw_offer_by !== movingSide)
      state.pending_draw_offer_by = null

    key = deps.PositionKey.fromRules(rules)
    state.position_counts[key] = finiteInteger(state.position_counts[key], 0) + 1
    moveRecord = {
      ply: state.moves.length + 1,
      uci: committed.move.uci,
      san: committed.move.san,
      fen_after: committed.fen_after,
      played_at: iso(at),
      clock_after_ms: clockAfter.enabled ? clockAfter[movingSide + "_ms"] : null,
      clock_before: clockBefore,
      draw_offer_before: drawBefore
    }
    state.moves.push(moveRecord)
    state.updated_at = moveRecord.played_at
    state.search_token += 1

    adjudication = refreshClaims({
      side_to_move: rules.turn(),
      checkmate: committed.checkmate,
      stalemate: committed.stalemate,
      dead_position: committed.dead_position,
      halfmove_clock: committed.halfmove_clock
    })
    events = [event("move-committed", {
      uci: moveRecord.uci,
      san: moveRecord.san,
      side: movingSide,
      fen_after: moveRecord.fen_after
    }, moveRecord.played_at)]

    if (committed.in_check && !committed.checkmate) {
      checkEvent = event("check", { side: rules.turn() }, moveRecord.played_at)
      events.push(checkEvent)
    }
    if (adjudication.terminal) {
      completion = finish(adjudication, moveRecord.played_at)
      events.push(completion)
    } else {
      state.status = statusForCurrentTurn()
      if (state.claims && (state.claims.threefold_current || state.claims.fifty_move_current ||
          state.claims.prospective_moves.length > 0)) {
        events.push(event("draw-claim-available", state.claims, moveRecord.played_at))
      }
      searchEvent = computerTurnEvent(moveRecord.played_at)
      if (searchEvent)
        events.push(searchEvent)
    }

    return succeeded("MOVE_COMMITTED", {
      game_id: state.game_id,
      uci: moveRecord.uci,
      san: moveRecord.san,
      result: state.result
    }, events)
  }

  function move(command) {
    return commitMoveCommand(command, false)
  }

  function choosePromotion(piece) {
    var promotion = normalizePromotion(piece)
    var pending

    if (!state || !rules)
      return failed("NO_ACTIVE_GAME")
    if (!state.pending_promotion)
      return failed("NO_PROMOTION_PENDING")
    if (!promotion || state.pending_promotion.choices.indexOf(promotion) === -1)
      return failed("INVALID_PROMOTION")

    pending = cloneJson(state.pending_promotion)
    return commitMoveCommand({
      from: pending.from,
      to: pending.to,
      promotion: promotion,
      actor: pending.actor
    }, true)
  }

  function cancelPromotion() {
    if (!state || !state.pending_promotion)
      return failed("NO_PROMOTION_PENDING")
    state.pending_promotion = null
    state.updated_at = iso()
    return succeeded("PROMOTION_CANCELLED")
  }

  function pause(reason) {
    var unavailable
    var at

    if (!state || !rules)
      return failed("NO_ACTIVE_GAME")
    if (terminalStatus(state.status))
      return failed("GAME_ALREADY_COMPLETE")
    if (state.status === "paused" || state.status === "paused-error")
      return succeeded("GAME_ALREADY_PAUSED", { status: state.status })
    unavailable = rejectIfUnavailable()
    if (unavailable)
      return unavailable

    at = nowMilliseconds()
    state.clock = deps.ClockController.pause(state.clock, reason || "user", at)
    state.status = "paused"
    state.pending_promotion = null
    state.search_token += 1
    state.updated_at = iso(at)
    return succeeded("GAME_PAUSED", {}, [event("game-paused", {
      reason: reason || "user"
    }, state.updated_at)])
  }

  function resume() {
    var at
    var timeout
    var computerEvent
    var events

    if (!state || !rules)
      return failed("NO_ACTIVE_GAME")
    if (terminalStatus(state.status))
      return failed("GAME_ALREADY_COMPLETE")
    if (state.status === "paused-error")
      return failed("PERSISTENCE_UNHEALTHY")
    if (state.status !== "paused")
      return failed("GAME_NOT_PAUSED")

    at = nowMilliseconds()
    state.clock = deps.ClockController.resume(state.clock, rules.turn(), at)
    timeout = timeoutIfNeeded(at)
    if (timeout)
      return succeeded("GAME_COMPLETED", { result: state.result }, [timeout.event])
    state.status = statusForCurrentTurn()
    state.updated_at = iso(at)
    events = [event("game-resumed", { status: state.status }, state.updated_at)]
    computerEvent = computerTurnEvent(state.updated_at)
    if (computerEvent)
      events.push(computerEvent)
    return succeeded("GAME_RESUMED", { status: state.status }, events)
  }

  function markErrorPause(code) {
    var at

    if (!state || !rules || terminalStatus(state.status))
      return failed("NO_ACTIVE_GAME")
    at = nowMilliseconds()
    state.clock = deps.ClockController.pause(state.clock, code || "error", at)
    state.pending_promotion = null
    state.status = "paused-error"
    state.search_token += 1
    state.updated_at = iso(at)
    return succeeded("GAME_PAUSED_ERROR", { error_code: code || "UNKNOWN" }, [
      event("game-paused", { reason: code || "error", error: true }, state.updated_at)
    ])
  }

  function recoverErrorPause() {
    if (!state || !rules)
      return failed("NO_ACTIVE_GAME")
    if (state.status !== "paused-error")
      return failed("GAME_NOT_PAUSED_ERROR")
    state.status = "paused"
    state.updated_at = iso()
    return succeeded("PERSISTENCE_RECOVERED", { status: state.status }, [
      event("game-paused", { reason: "persistence-recovered" }, state.updated_at)
    ])
  }

  function tick() {
    var unavailable = rejectIfUnavailable()
    var at
    var timeout

    if (unavailable)
      return unavailable
    at = nowMilliseconds()
    timeout = timeoutIfNeeded(at)
    if (!timeout)
      return succeeded("CLOCK_UPDATED", { clock: persistedClock(state.clock, at) })
    return succeeded("GAME_COMPLETED", { result: state.result }, [timeout.event])
  }

  function undo(options) {
    var settings = options || {}
    var unavailable
    var wasPaused
    var plies
    var firstRecord
    var index
    var currentKey
    var undone
    var at
    var computerEvent
    var events

    if (!state || !rules)
      return failed("NO_ACTIVE_GAME")
    if (terminalStatus(state.status))
      return failed("GAME_ALREADY_COMPLETE")
    if (state.status === "paused-error" && settings.from_error !== true)
      return failed("PERSISTENCE_UNHEALTHY")
    if (settings.confirmed !== true)
      return failed("UNDO_CONFIRMATION_REQUIRED")
    if (state.moves.length === 0)
      return failed("UNDO_NOT_AVAILABLE")

    unavailable = state.status === "paused" || state.status === "paused-error" ? null :
      rejectIfUnavailable()
    if (unavailable)
      return unavailable
    wasPaused = state.status === "paused" || state.status === "paused-error"
    plies = 1
    if (state.mode === "computer" && state.status !== "active-computer" &&
        state.moves.length > 1)
      plies = 2
    if (plies > state.moves.length)
      plies = state.moves.length
    firstRecord = state.moves[state.moves.length - plies]

    for (index = 0; index < plies; index += 1) {
      currentKey = deps.PositionKey.fromRules(rules)
      state.position_counts[currentKey] = finiteInteger(state.position_counts[currentKey], 1) - 1
      if (state.position_counts[currentKey] <= 0)
        delete state.position_counts[currentKey]
      undone = rules.undo()
      if (!undone || undone.ok !== true)
        throw new Error("GameController invariant: move record cannot be undone")
      state.moves.pop()
    }

    at = nowMilliseconds()
    state.clock = cloneJson(firstRecord.clock_before || state.clock)
    if (wasPaused)
      state.clock = deps.ClockController.pause(state.clock, "undo", at)
    else {
      state.clock = deps.ClockController.pause(state.clock, "undo", at)
      state.clock = deps.ClockController.resume(state.clock, rules.turn(), at)
    }
    state.pending_draw_offer_by = firstRecord.draw_offer_before || null
    state.pending_promotion = null
    state.result = null
    state.status = wasPaused ? "paused" : statusForCurrentTurn()
    state.search_token += 1
    state.updated_at = iso(at)
    refreshClaims()
    applyPgnHeaders()
    events = [event("move-undone", {
      plies: plies,
      fen: rules.fen(),
      status: state.status
    }, state.updated_at)]
    computerEvent = computerTurnEvent(state.updated_at)
    if (computerEvent && !wasPaused)
      events.push(computerEvent)
    return succeeded("UNDO_COMPLETED", { plies: plies, fen: rules.fen() }, events)
  }

  function resign(side) {
    var unavailable = rejectIfUnavailable()
    var resigning = sideName(side)
    var at
    var completion

    if (unavailable)
      return unavailable
    if (!resigning || !playerFor(resigning))
      return failed("INVALID_SIDE")
    at = iso()
    completion = completeExternal({
      type: "resignation",
      resigning_side: resigning,
      material: rules.material()
    }, at)
    if (!completion)
      return failed("INVALID_ACTION")
    return succeeded("GAME_COMPLETED", { result: state.result }, [completion])
  }

  function offerDraw(side) {
    var unavailable = rejectIfUnavailable()
    var offering = sideName(side)
    var at

    if (unavailable)
      return unavailable
    if (state.mode !== "local")
      return failed("UNSUPPORTED_ACTION", { action: "offer-draw" })
    if (!offering || offering !== rules.turn())
      return failed("WRONG_TURN")
    if (state.pending_draw_offer_by)
      return failed("DRAW_ALREADY_OFFERED")
    at = iso()
    state.pending_draw_offer_by = offering
    state.updated_at = at
    return succeeded("DRAW_OFFERED", { side: offering }, [
      event("draw-offered", { side: offering }, at)
    ])
  }

  function respondToDraw(side, accepted) {
    var unavailable = rejectIfUnavailable()
    var responding = sideName(side)
    var at
    var completion

    if (unavailable)
      return unavailable
    if (!state.pending_draw_offer_by)
      return failed("NO_DRAW_OFFER")
    if (!responding || (accepted === true && responding === state.pending_draw_offer_by))
      return failed("INVALID_DRAW_RESPONSE")
    at = iso()
    if (accepted === true) {
      completion = completeExternal({ type: "draw-agreement", accepted: true }, at)
      return succeeded("GAME_COMPLETED", { result: state.result }, [completion])
    }
    state.pending_draw_offer_by = null
    state.updated_at = at
    return succeeded("DRAW_DECLINED", { side: responding }, [
      event("draw-declined", { side: responding }, at)
    ])
  }

  function claimDraw(side, type, moveUci) {
    var unavailable = rejectIfUnavailable()
    var claiming = sideName(side)
    var normalized = String(type || "").toLowerCase().replace(/_/g, "-")
    var action
    var at
    var completion

    if (unavailable)
      return unavailable
    if (!claiming || claiming !== rules.turn())
      return failed("WRONG_TURN")
    if (normalized === "threefold-claim")
      normalized = "threefold"
    if (normalized === "fifty-move-claim")
      normalized = "fifty-move"
    if (normalized !== "threefold" && normalized !== "fifty-move")
      return failed("DRAW_CLAIM_NOT_AVAILABLE")
    action = {
      type: normalized,
      side: claiming
    }
    if (moveUci)
      action.move_uci = String(moveUci).toLowerCase()
    at = iso()
    completion = completeExternal(action, at)
    if (!completion)
      return failed("DRAW_CLAIM_NOT_AVAILABLE", { claim_type: normalized })
    return succeeded("GAME_COMPLETED", { result: state.result }, [completion])
  }

  function abandon() {
    var at
    var completion

    if (!state || !rules)
      return failed("NO_ACTIVE_GAME")
    if (terminalStatus(state.status))
      return failed("GAME_ALREADY_COMPLETE")
    at = iso()
    completion = completeExternal({ type: "abandon" }, at)
    if (!completion)
      return failed("INVALID_ACTION")
    return succeeded("GAME_ABANDONED", { result: state.result }, [completion])
  }

  function convertComputerToLocal() {
    var at

    if (!state || !rules)
      return failed("NO_ACTIVE_GAME")
    if (terminalStatus(state.status))
      return failed("GAME_ALREADY_COMPLETE")
    if (state.mode !== "computer")
      return failed("ALREADY_LOCAL_MODE")

    at = nowMilliseconds()
    state.clock = deps.ClockController.pause(state.clock, "mode-conversion", at)
    state.mode = "local"
    state.players.white.kind = "human"
    state.players.black.kind = "human"
    if (state.players.white.name === "Omarchy")
      state.players.white.name = "White"
    if (state.players.black.name === "Omarchy")
      state.players.black.name = "Black"
    state.human_color = null
    state.difficulty = null
    state.clock = deps.ClockController.resume(state.clock, rules.turn(), at)
    state.status = statusForCurrentTurn()
    state.pending_promotion = null
    state.search_token += 1
    state.updated_at = iso(at)
    applyPgnHeaders()
    return succeeded("GAME_CONVERTED_TO_LOCAL", { status: state.status }, [
      event("game-paused", { reason: "mode-conversion" }, state.updated_at)
    ])
  }

  function setComputerDifficulty(difficulty) {
    var normalized = String(difficulty || "").toLowerCase()

    if (!state || !rules)
      return failed("NO_ACTIVE_GAME")
    if (state.mode !== "computer")
      return failed("ALREADY_LOCAL_MODE")
    if (terminalStatus(state.status))
      return failed("GAME_ALREADY_COMPLETE")
    if (state.status !== "paused" && state.status !== "paused-error")
      return failed("GAME_NOT_PAUSED")
    if (["learner", "casual", "challenging", "strong"].indexOf(normalized) < 0)
      return failed("AI_UNKNOWN_PROFILE")

    state.difficulty = normalized
    state.search_token += 1
    state.updated_at = iso()
    applyPgnHeaders()
    return succeeded("COMPUTER_DIFFICULTY_CHANGED", {
      difficulty: normalized,
      search_token: state.search_token
    }, [event("computer-difficulty-changed", {
      difficulty: normalized
    }, state.updated_at)])
  }

  function legalMoves(square) {
    if (!state || !rules || terminalStatus(state.status) ||
        state.status === "paused" || state.status === "paused-error")
      return []
    if (square !== undefined && !validSquare(square))
      return []
    return cloneJson(rules.legalMoves({
      square: square === undefined ? undefined : String(square).toLowerCase(),
      verbose: true
    }))
  }

  function clockSnapshot() {
    if (!state)
      return null
    return persistedClock(state.clock, nowMilliseconds())
  }

  function snapshot() {
    var sampledClock
    var pending

    if (!state || !rules) {
      return {
        status: "idle",
        game_id: null,
        board: [],
        moves: [],
        result: null,
        clock: null,
        claims: null,
        search_token: 0
      }
    }
    sampledClock = clockSnapshot()
    pending = cloneJson(state.pending_promotion)
    return {
      game_id: state.game_id,
      mode: state.mode,
      status: pending ? "promotion-pending" : state.status,
      persisted_status: state.status,
      created_at: state.created_at,
      updated_at: state.updated_at,
      players: cloneJson(state.players),
      human_color: state.human_color,
      difficulty: state.difficulty,
      time_control: cloneJson(state.time_control),
      orientation: state.orientation,
      fen: rules.fen(),
      pgn: rules.pgn(),
      turn: rules.turn(),
      board: cloneJson(rules.board()),
      moves: cloneJson(state.moves.map(function (moveRecord) {
        return {
          ply: moveRecord.ply,
          uci: moveRecord.uci,
          san: moveRecord.san,
          fen_after: moveRecord.fen_after,
          played_at: moveRecord.played_at,
          clock_after_ms: moveRecord.clock_after_ms
        }
      })),
      position_counts: cloneJson(state.position_counts),
      clock: sampledClock,
      in_check: rules.isCheck(),
      material: cloneJson(rules.material()),
      pending_promotion: pending,
      pending_draw_offer_by: state.pending_draw_offer_by,
      claims: cloneJson(state.claims),
      result: publicResult(state.result),
      search_token: state.search_token,
      computer_turn_requested: state.status === "active-computer"
    }
  }

  function persistenceDocument() {
    var sampledAt
    var document
    var records

    if (!state || !rules)
      return null
    sampledAt = nowMilliseconds()
    records = state.moves.map(function (moveRecord) {
      return {
        ply: moveRecord.ply,
        uci: moveRecord.uci,
        san: moveRecord.san,
        fen_after: moveRecord.fen_after,
        played_at: moveRecord.played_at,
        clock_after_ms: moveRecord.clock_after_ms,
        clock_before: moveRecord.clock_before ?
          persistedClock(moveRecord.clock_before, moveRecord.clock_before.last_started_at_ms) : null,
        draw_offer_before: moveRecord.draw_offer_before === undefined ? null :
          moveRecord.draw_offer_before
      }
    })
    document = {
      schema_version: 1,
      game_id: state.game_id,
      plugin_version: state.plugin_version,
      mode: state.mode,
      status: state.status,
      created_at: state.created_at,
      updated_at: state.updated_at,
      players: cloneJson(state.players),
      human_color: state.human_color,
      difficulty: state.difficulty,
      time_control: cloneJson(state.time_control),
      fen: rules.fen(),
      pgn: rules.pgn(),
      moves: records,
      position_counts: cloneJson(state.position_counts),
      clock: persistedClock(state.clock, sampledAt),
      pending_draw_offer_by: state.pending_draw_offer_by,
      orientation: state.orientation,
      result: persistedResult(state.result)
    }
    return document
  }

  function rulesAdapter() {
    return rules
  }

  var controller = {
    newGame: newGame,
    loadGame: loadGame,
    load: loadGame,
    move: move,
    choosePromotion: choosePromotion,
    cancelPromotion: cancelPromotion,
    undo: undo,
    pause: pause,
    resume: resume,
    markErrorPause: markErrorPause,
    recoverErrorPause: recoverErrorPause,
    tick: tick,
    resign: resign,
    offerDraw: offerDraw,
    respondToDraw: respondToDraw,
    claimDraw: claimDraw,
    abandon: abandon,
    convertComputerToLocal: convertComputerToLocal,
    setComputerDifficulty: setComputerDifficulty,
    legalMoves: legalMoves,
    clockSnapshot: clockSnapshot,
    checkpoint: checkpoint,
    restoreCheckpoint: restoreCheckpoint,
    rollback: restoreCheckpoint,
    snapshot: snapshot,
    persistenceDocument: persistenceDocument,
    rulesAdapter: rulesAdapter,
    lastCommand: function () { return cloneJson(lastCommand) }
  }

  if (input.document)
    loadGame(input.document)
  else if (input.autostart === true)
    newGame(input)

  return controller
}

var GameController = {
  configureDependencies: configureDependencies,
  create: create
}

if (typeof module !== "undefined" && module.exports)
  module.exports = GameController
