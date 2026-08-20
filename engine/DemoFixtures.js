/*
 * Deterministic, in-memory demo and manual-QA positions.
 *
 * Demo fixtures are never persistence documents and are never eligible for
 * normal history. A service may translate one into controller commands only
 * after resolving the usual active-game confirmation flow.
 */

"use strict"

var DemoFixtures = (function () {
  var configuredRulesAdapter = null
  var configuredPositionKey = null
  var START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
  var START_KEY = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -"
  var MIDGAME_FEN = "r1bq1rk1/ppp1bppp/3p1n2/8/2BQP3/8/PPP2PPP/RNB1R1K1 w - - 0 9"
  var MIDGAME_KEY = "r1bq1rk1/ppp1bppp/3p1n2/8/2BQP3/8/PPP2PPP/RNB1R1K1 w - -"
  var MIDGAME_MOVES = [
    "e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "g8f6",
    "e1g1", "f8e7", "f1e1", "e8g8", "d2d4", "e5d4",
    "f3d4", "c6d4", "d1d4", "d7d6"
  ]

  if (typeof module !== "undefined" && module.exports && typeof require === "function") {
    configuredRulesAdapter = require("./RulesAdapter.js")
    configuredPositionKey = require("./PositionKey.js")
  }

  function localPlayers() {
    return {
      white: { kind: "human", name: "Local White" },
      black: { kind: "human", name: "Local Black" }
    }
  }

  function computerPlayers(humanColor) {
    return humanColor === "black" ? {
      white: { kind: "computer", name: "Casual Computer" },
      black: { kind: "human", name: "You" }
    } : {
      white: { kind: "human", name: "You" },
      black: { kind: "computer", name: "Casual Computer" }
    }
  }

  function untimedClock() {
    return {
      enabled: false,
      white_ms: null,
      black_ms: null,
      increment_ms: 0,
      running_side: null,
      paused: false
    }
  }

  function pausedClock(whiteMs, blackMs, incrementMs) {
    return {
      enabled: true,
      white_ms: whiteMs,
      black_ms: blackMs,
      increment_ms: incrementMs,
      running_side: null,
      paused: true
    }
  }

  function baseFixture(input) {
    input.demo = true
    input.allow_normal_history = false
    input.history_policy = "test-record-only"
    input.screenshot_safe = true
    if (!input.move_history_uci)
      input.move_history_uci = []
    if (!input.position_counts)
      input.position_counts = {}
    if (!input.clock)
      input.clock = untimedClock()
    return input
  }

  var fixtures = [
    baseFixture({
      id: "standard-midgame",
      description: "Curated castled middlegame with captures and sixteen plies for the primary board screenshot.",
      fen: MIDGAME_FEN,
      initial_fen: START_FEN,
      mode: "local",
      status: "paused",
      side_to_move: "white",
      players: localPlayers(),
      move_history_uci: MIDGAME_MOVES,
      position_counts: (function () {
        var counts = {}
        counts[MIDGAME_KEY] = 1
        return counts
      }()),
      expected_ui_state: "game",
      expected_legal_moves: ["c2c3", "b1c3"],
      expected_last_move_uci: "d7d6",
      expected_captured_piece_count: 4,
      allowed_next_actions: ["move", "resume", "export-pgn", "home"]
    }),
    baseFixture({
      id: "castle-ready",
      description: "Minimal legal position exposing both White castling choices and both Black castling rights.",
      fen: "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1",
      initial_fen: "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1",
      mode: "local",
      status: "active-human",
      side_to_move: "white",
      players: localPlayers(),
      expected_ui_state: "game",
      expected_legal_moves: ["e1g1", "e1c1"],
      expected_action: {
        type: "move",
        uci: "e1g1",
        expected_san: "O-O"
      },
      allowed_next_actions: ["move", "pause", "resign", "home"]
    }),
    baseFixture({
      id: "promotion",
      description: "Legal quiet promotion setup; choosing a7-a8 without a piece must open the Q/R/B/N chooser.",
      fen: "8/P7/8/8/8/8/6k1/4K3 w - - 0 1",
      initial_fen: "8/P7/8/8/8/8/6k1/4K3 w - - 0 1",
      mode: "local",
      status: "active-human",
      side_to_move: "white",
      players: localPlayers(),
      expected_ui_state: "game",
      expected_legal_moves: ["a7a8q", "a7a8r", "a7a8b", "a7a8n"],
      expected_action: {
        type: "move",
        from: "a7",
        to: "a8",
        expected_code: "PROMOTION_REQUIRED",
        expected_choices: ["queen", "rook", "bishop", "knight"]
      },
      allowed_next_actions: ["move", "choose-promotion", "cancel-promotion", "home"]
    }),
    baseFixture({
      id: "checkmate-in-one",
      description: "White can play Qg7 checkmate for a short deterministic result demonstration.",
      fen: "7k/5Q2/6K1/8/8/8/8/8 w - - 0 1",
      initial_fen: "7k/5Q2/6K1/8/8/8/8/8 w - - 0 1",
      mode: "local",
      status: "active-human",
      side_to_move: "white",
      players: localPlayers(),
      expected_ui_state: "game",
      expected_legal_moves: ["f7g7"],
      expected_action: {
        type: "move",
        uci: "f7g7",
        expected_san: "Qg7#",
        checkmate: true,
        winner: "white",
        score: "1-0"
      },
      allowed_next_actions: ["move", "review", "export-pgn", "home"]
    }),
    baseFixture({
      id: "stalemate-preview",
      description: "Terminal legal stalemate for result-dialog, replay, and draw-copy screenshots.",
      fen: "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1",
      initial_fen: "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1",
      mode: "local",
      status: "completed",
      side_to_move: "black",
      players: localPlayers(),
      expected_ui_state: "result",
      expected_result: {
        terminal: true,
        reason: "stalemate",
        score: "1/2-1/2",
        winner: null
      },
      allowed_next_actions: ["review", "export-pgn", "rematch", "home"]
    }),
    baseFixture({
      id: "threefold-claim",
      description: "Two complete knight shuffles return to the orthodox start for the current third occurrence.",
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 8 5",
      initial_fen: START_FEN,
      mode: "local",
      status: "active-human",
      side_to_move: "white",
      players: localPlayers(),
      move_history_uci: [
        "g1f3", "g8f6", "f3g1", "f6g8",
        "g1f3", "g8f6", "f3g1", "f6g8"
      ],
      position_counts: (function () {
        var counts = {}
        counts[START_KEY] = 3
        counts["rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq -"] = 2
        counts["rnbqkb1r/pppppppp/5n2/8/8/5N2/PPPPPPPP/RNBQKB1R w KQkq -"] = 2
        counts["rnbqkb1r/pppppppp/5n2/8/8/8/PPPPPPPP/RNBQKBNR b KQkq -"] = 2
        return counts
      }()),
      expected_ui_state: "game-with-claim",
      expected_claim: {
        type: "threefold-claim",
        available: true,
        current_position_count: 3
      },
      allowed_next_actions: ["claim-draw", "move", "pause", "home"]
    }),
    baseFixture({
      id: "fifty-move-claim",
      description: "Legal rook ending at halfmove clock 100 with a current fifty-move draw claim.",
      fen: "7k/8/8/8/8/8/8/R3K3 w - - 100 51",
      initial_fen: "7k/8/8/8/8/8/8/R3K3 w - - 100 51",
      mode: "local",
      status: "active-human",
      side_to_move: "white",
      players: localPlayers(),
      expected_ui_state: "game-with-claim",
      expected_halfmove_clock: 100,
      expected_claim: {
        type: "fifty-move-claim",
        available: true
      },
      allowed_next_actions: ["claim-draw", "move", "pause", "home"]
    }),
    baseFixture({
      id: "timeout-warning",
      description: "Paused low-clock display fixture with White below ten seconds and no live demo timer.",
      fen: MIDGAME_FEN,
      initial_fen: START_FEN,
      mode: "local",
      status: "paused",
      side_to_move: "white",
      players: localPlayers(),
      move_history_uci: MIDGAME_MOVES,
      clock: pausedClock(8400, 32700, 1000),
      expected_ui_state: "game-low-clock",
      expected_clock: {
        low_side: "white",
        warning_threshold_ms: 10000,
        simulated: true
      },
      allowed_next_actions: ["resume", "pause", "home"]
    }),
    baseFixture({
      id: "save-error",
      description: "Paused local game with a simulated recoverable atomic persistence failure.",
      fen: MIDGAME_FEN,
      initial_fen: START_FEN,
      mode: "local",
      status: "paused-error",
      side_to_move: "white",
      players: localPlayers(),
      move_history_uci: MIDGAME_MOVES,
      clock: pausedClock(272000, 284000, 2000),
      expected_ui_state: "recovery",
      injected_error: {
        code: "PERSISTENCE_WRITE_FAILED",
        severity: "critical",
        recoverable: true,
        operation: "save-active-game"
      },
      allowed_next_actions: ["retry-save", "export-pgn", "copy-diagnostics", "abandon"]
    }),
    baseFixture({
      id: "ai-error",
      description: "Paused computer game with a simulated worker failure and all documented recovery choices.",
      fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
      initial_fen: START_FEN,
      mode: "computer",
      status: "paused-error",
      side_to_move: "black",
      human_color: "white",
      difficulty: "casual",
      players: computerPlayers("white"),
      move_history_uci: ["e2e4"],
      expected_ui_state: "recovery",
      injected_error: {
        code: "AI_WORKER_FAILED",
        severity: "error",
        recoverable: true,
        operation: "search"
      },
      deterministic_seed: 424242,
      allowed_next_actions: ["retry-ai", "lower-difficulty", "convert-to-local", "export-pgn", "abandon"]
    }),
    baseFixture({
      id: "history-populated",
      description: "Three synthetic completed summaries for bounded history-list and replay screenshots.",
      fen: MIDGAME_FEN,
      initial_fen: START_FEN,
      mode: "local",
      status: "paused",
      side_to_move: "white",
      players: localPlayers(),
      move_history_uci: MIDGAME_MOVES,
      expected_ui_state: "history-list",
      history_records: [
        {
          game_id: "demo_history_001",
          completed_at: "2026-08-18T18:30:00.000Z",
          mode: "computer",
          white: "You",
          black: "Casual Computer",
          score: "1-0",
          result_reason: "checkmate",
          ply_count: 31
        },
        {
          game_id: "demo_history_002",
          completed_at: "2026-08-19T20:15:00.000Z",
          mode: "local",
          white: "Local White",
          black: "Local Black",
          score: "1/2-1/2",
          result_reason: "draw-agreement",
          ply_count: 42
        },
        {
          game_id: "demo_history_003",
          completed_at: "2026-08-20T02:45:00.000Z",
          mode: "computer",
          white: "Strong Computer",
          black: "You",
          score: "0-1",
          result_reason: "resignation",
          ply_count: 54
        }
      ],
      allowed_next_actions: ["review", "export-pgn", "home"]
    })
  ]

  var fixturesById = {}
  var fixtureIndex
  for (fixtureIndex = 0; fixtureIndex < fixtures.length; fixtureIndex += 1)
    fixturesById[fixtures[fixtureIndex].id] = fixtures[fixtureIndex]

  function clone(value) {
    var output
    var keys
    var index

    if (value === null || value === undefined || typeof value !== "object")
      return value
    if (Array.isArray(value)) {
      output = []
      for (index = 0; index < value.length; index += 1)
        output.push(clone(value[index]))
      return output
    }
    output = {}
    keys = Object.keys(value)
    for (index = 0; index < keys.length; index += 1)
      output[keys[index]] = clone(value[keys[index]])
    return output
  }

  function configure(rulesAdapter, positionKey) {
    if (!rulesAdapter || typeof rulesAdapter.create !== "function")
      throw new Error("DemoFixtures: invalid RulesAdapter dependency")
    if (!positionKey || typeof positionKey.fromRules !== "function")
      throw new Error("DemoFixtures: invalid PositionKey dependency")
    configuredRulesAdapter = rulesAdapter
    configuredPositionKey = positionKey
    return true
  }

  function ids() {
    var output = []
    var index
    for (index = 0; index < fixtures.length; index += 1)
      output.push(fixtures[index].id)
    return output
  }

  function get(id) {
    var normalized = typeof id === "string" ? id.toLowerCase().trim() : ""
    return fixturesById[normalized] ? clone(fixturesById[normalized]) : null
  }

  function all() {
    return clone(fixtures)
  }

  function pushError(errors, fixture, detail) {
    errors.push(fixture.id + ": " + detail)
  }

  function validateHistory(fixture, rules, errors) {
    var replay
    var index
    var result

    if (!fixture.move_history_uci || fixture.move_history_uci.length === 0)
      return
    replay = configuredRulesAdapter.create({ fen: fixture.initial_fen })
    if (!replay || replay.valid === false) {
      pushError(errors, fixture, "initial_fen is invalid")
      return
    }
    for (index = 0; index < fixture.move_history_uci.length; index += 1) {
      result = replay.commitMove(fixture.move_history_uci[index])
      if (!result || result.ok !== true) {
        pushError(errors, fixture, "move history is illegal at ply " + (index + 1))
        return
      }
    }
    if (replay.fen() !== rules.fen())
      pushError(errors, fixture, "move history does not reach fixture FEN")
  }

  function validateExpectedAction(fixture, rules, errors) {
    var action = fixture.expected_action
    var candidate
    var command
    var response

    if (!action)
      return
    candidate = configuredRulesAdapter.create({ fen: rules.fen() })
    command = action.uci || {
      from: action.from,
      to: action.to,
      promotion: action.promotion || null
    }
    response = candidate.commitMove(command)
    if (action.expected_code) {
      if (!response || response.code !== action.expected_code)
        pushError(errors, fixture, "expected action code " + action.expected_code)
      if (action.expected_choices &&
          JSON.stringify(response.choices || []) !== JSON.stringify(action.expected_choices))
        pushError(errors, fixture, "expected action choices mismatch")
      if (candidate.fen() !== rules.fen())
        pushError(errors, fixture, "rejected expected action mutated the position")
      return
    }
    if (!response || response.ok !== true) {
      pushError(errors, fixture, "expected action is illegal")
      return
    }
    if (action.expected_san && response.move.san !== action.expected_san)
      pushError(errors, fixture, "expected SAN mismatch")
    if (action.checkmate === true && candidate.isCheckmate() !== true)
      pushError(errors, fixture, "expected action is not checkmate")
  }

  function validateOne(fixture) {
    var errors = []
    var rules
    var legal
    var index
    var key
    var currentCount
    var fields
    var pieces

    if (!configuredRulesAdapter || !configuredPositionKey)
      return { ok: false, errors: [fixture.id + ": dependencies are not configured"] }
    rules = configuredRulesAdapter.create({ fen: fixture.fen })
    if (!rules || rules.valid === false)
      return { ok: false, errors: [fixture.id + ": FEN is invalid"] }
    if (rules.turn() !== fixture.side_to_move)
      pushError(errors, fixture, "side_to_move disagrees with FEN")
    if (fixture.allow_normal_history !== false)
      pushError(errors, fixture, "demo could pollute normal history")
    if (!Array.isArray(fixture.allowed_next_actions) || fixture.allowed_next_actions.length === 0)
      pushError(errors, fixture, "allowed_next_actions is empty")

    legal = rules.legalMoves({ verbose: false })
    for (index = 0; index < (fixture.expected_legal_moves || []).length; index += 1) {
      if (legal.indexOf(fixture.expected_legal_moves[index]) === -1)
        pushError(errors, fixture, "expected legal move missing: " + fixture.expected_legal_moves[index])
    }
    if (fixture.expected_result && fixture.expected_result.reason === "stalemate" &&
        rules.isStalemate() !== true)
      pushError(errors, fixture, "position is not stalemate")
    if (fixture.expected_halfmove_clock !== undefined) {
      fields = rules.fen().split(/\s+/)
      if (Number(fields[4]) !== fixture.expected_halfmove_clock)
        pushError(errors, fixture, "halfmove clock mismatch")
    }

    validateHistory(fixture, rules, errors)
    validateExpectedAction(fixture, rules, errors)

    key = configuredPositionKey.fromRules(rules)
    currentCount = fixture.position_counts[key]
    if (fixture.expected_claim && fixture.expected_claim.type === "threefold-claim" &&
        currentCount !== fixture.expected_claim.current_position_count)
      pushError(errors, fixture, "threefold current count mismatch")
    if (fixture.expected_last_move_uci &&
        fixture.move_history_uci[fixture.move_history_uci.length - 1] !== fixture.expected_last_move_uci)
      pushError(errors, fixture, "last move mismatch")
    if (fixture.expected_captured_piece_count !== undefined) {
      pieces = rules.board()
      if (32 - pieces.length !== fixture.expected_captured_piece_count)
        pushError(errors, fixture, "captured-piece count mismatch")
    }
    if (fixture.clock.enabled &&
        (!isFinite(fixture.clock.white_ms) || !isFinite(fixture.clock.black_ms) ||
         fixture.clock.white_ms < 0 || fixture.clock.black_ms < 0))
      pushError(errors, fixture, "clock values are invalid")

    return { ok: errors.length === 0, errors: errors }
  }

  function validateFixture(id) {
    var fixture = get(id)
    if (!fixture)
      return { ok: false, errors: ["unknown demo fixture"] }
    return validateOne(fixture)
  }

  function validateAll() {
    var errors = []
    var index
    var validation

    for (index = 0; index < fixtures.length; index += 1) {
      validation = validateOne(fixtures[index])
      errors = errors.concat(validation.errors)
    }
    return { ok: errors.length === 0, errors: errors }
  }

  return {
    configureDependencies: configure,
    ids: ids,
    get: get,
    all: all,
    validateFixture: validateFixture,
    validateAll: validateAll
  }
}())

function configureDependencies(rulesAdapter, positionKey) {
  return DemoFixtures.configureDependencies(rulesAdapter, positionKey)
}

function ids() {
  return DemoFixtures.ids()
}

function get(id) {
  return DemoFixtures.get(id)
}

function all() {
  return DemoFixtures.all()
}

function validateFixture(id) {
  return DemoFixtures.validateFixture(id)
}

function validateAll() {
  return DemoFixtures.validateAll()
}

if (typeof module !== "undefined" && module.exports)
  module.exports = DemoFixtures
