import assert from "node:assert/strict"
import test from "node:test"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const GameController = require("../engine/GameController.js")
const RulesAdapter = require("../engine/RulesAdapter.js")
const PositionKey = require("../engine/PositionKey.js")

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
const PROMOTION_FEN = "4k3/P7/8/8/8/8/8/4K3 w - - 0 1"
const CLAIM_FEN = "4k3/8/8/8/8/8/8/R3K2R w KQ - 100 1"
const PROSPECTIVE_CLAIM_FEN = "4k3/8/8/8/8/8/8/R3K2R w KQ - 99 1"

let sequence = 0

function makeClock() {
  return { now: 10_000 }
}

function makeConfig(options = {}) {
  const clock = options.clock || makeClock()
  const mode = options.mode || "local"
  const humanColor = options.humanColor || "white"
  const computerColor = humanColor === "black" ? "white" : "black"
  const players = options.players || {
    white: { kind: mode === "computer" && humanColor === "black" ? "computer" : "human", name: "White" },
    black: { kind: mode === "computer" && humanColor !== "black" ? "computer" : "human", name: "Black" }
  }

  return {
    gameId: options.gameId || `test-game-${++sequence}`,
    pluginVersion: "test",
    mode,
    players,
    humanColor,
    difficulty: options.difficulty || "casual",
    timeControl: options.timeControl || { base_ms: null, increment_ms: 0 },
    orientation: options.orientation || "white",
    now: options.now || (() => clock.now),
    random: options.random || (() => 0.25),
    ...(options.dependencies || {})
  }
}

function controller(options = {}) {
  const config = makeConfig(options)
  return {
    controller: GameController.create(config),
    clock: options.clock || { now: 10_000 },
    config
  }
}

function eventTypes(result) {
  return (result && Array.isArray(result.events) ? result.events : [])
    .map(event => typeof event === "string" ? event : event && (event.type || event.name))
    .filter(Boolean)
}

function assertOk(result, message = "expected a successful command") {
  assert.equal(result && result.ok, true, `${message}: ${JSON.stringify(result)}`)
  return result
}

function assertRejected(result, code) {
  assert.equal(result && result.ok, false, `expected rejection: ${JSON.stringify(result)}`)
  if (code)
    assert.equal(result.code, code, JSON.stringify(result))
  return result
}

function snapshot(controller) {
  return controller.snapshot()
}

function activeDocument({ fen = START_FEN, mode = "local", gameId = `loaded-game-${++sequence}`, clock = null, positionCounts = null } = {}) {
  const rules = RulesAdapter.create({ fen })
  assert.equal(rules.valid, true, rules.error && rules.error.detail)
  const key = PositionKey.fromRules(rules)
  const timestamp = "2026-08-20T00:00:00.000Z"

  return {
    schema_version: 1,
    game_id: gameId,
    plugin_version: "test",
    mode,
    status: "active-human",
    created_at: timestamp,
    updated_at: timestamp,
    players: {
      white: { kind: "human", name: "White" },
      black: { kind: mode === "computer" ? "computer" : "human", name: mode === "computer" ? "Computer" : "Black" }
    },
    human_color: mode === "computer" ? "white" : null,
    difficulty: mode === "computer" ? "casual" : null,
    time_control: { base_ms: null, increment_ms: 0 },
    fen,
    pgn: "",
    moves: [],
    position_counts: positionCounts || { [key]: 1 },
    clock: clock || {
      enabled: false,
      white_ms: null,
      black_ms: null,
      increment_ms: 0,
      running_side: null,
      last_started_at: null
    },
    pending_draw_offer_by: null,
    orientation: "white",
    result: null
  }
}

function play(controller, moves, actor = "human") {
  for (const uci of moves) {
    const result = controller.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.slice(4) || null,
      actor
    })
    assertOk(result, `move ${uci}`)
  }
}

test("GameController exposes the documented command surface", () => {
  assert.equal(typeof GameController.create, "function")
  const { controller: game } = controller()

  for (const method of [
    "newGame", "loadGame", "move", "choosePromotion", "undo", "pause", "resume",
    "resign", "offerDraw", "respondToDraw", "claimDraw", "abandon",
    "convertComputerToLocal", "snapshot", "persistenceDocument"
  ])
    assert.equal(typeof game[method], "function", `${method} should be public`)
})

test("new local game starts one active human position with a counted root", () => {
  const { controller: game } = controller()
  const result = assertOk(game.newGame({ mode: "local" }))
  const state = snapshot(game)

  assert.ok(["GAME_CREATED", "NEW_GAME", "OK"].includes(result.code), JSON.stringify(result))
  assert.ok(eventTypes(result).includes("game-created"), JSON.stringify(result))
  assert.equal(state.game_id, result.data.game_id)
  assert.equal(state.mode, "local")
  assert.equal(state.status, "active-human")
  assert.equal(state.fen, START_FEN)
  assert.equal(state.turn, "white")
  assert.equal(state.players.white.kind, "human")
  assert.equal(state.players.black.kind, "human")
  assert.deepEqual(state.moves, [])
  assert.equal(Object.values(state.position_counts).length, 1)
  assert.equal(Object.values(state.position_counts)[0], 1)
})

test("computer color selection resolves random exactly once and gates the proper turn", () => {
  const white = controller({ mode: "computer", humanColor: "white", random: () => 0.99 })
  assertOk(white.controller.newGame({ mode: "computer", human_color: "random" }))
  assert.equal(snapshot(white.controller).human_color, "black")
  assert.equal(snapshot(white.controller).status, "active-computer")
  assert.ok(eventTypes(white.controller.newGame({ mode: "computer", human_color: "black", conflict: "abandon" })).includes("computer-turn-requested"))

  const black = controller({ mode: "computer", humanColor: "black", random: () => 0 })
  const result = assertOk(black.controller.newGame({ mode: "computer", human_color: "random" }))
  const state = snapshot(black.controller)
  assert.equal(state.human_color, "white")
  assert.equal(state.status, "active-human")
  assert.ok(eventTypes(result).includes("game-created"), JSON.stringify(result))
})

test("an active game cannot be replaced silently", () => {
  const { controller: game } = controller()
  assertOk(game.newGame({ mode: "local" }))
  assertOk(game.move({ from: "e2", to: "e4", actor: "human" }))
  const before = snapshot(game)

  assertRejected(game.newGame({ mode: "local" }), "ACTIVE_GAME_CONFLICT")
  assert.deepEqual(snapshot(game), before)

  assertOk(game.newGame({ mode: "local", conflict: "cancel" }))
  assert.deepEqual(snapshot(game).moves, before.moves)

  const replaced = assertOk(game.newGame({ mode: "local", conflict: "abandon" }))
  assert.ok(eventTypes(replaced).includes("game-created"), JSON.stringify(replaced))
  assert.notEqual(snapshot(game).game_id, before.game_id)
})

test("legal moves commit through the rules authority and publish normalized data", () => {
  const { controller: game } = controller()
  assertOk(game.newGame({ mode: "local" }))

  const result = assertOk(game.move({ from: "e2", to: "e4", actor: "human" }))
  const state = snapshot(game)
  const document = game.persistenceDocument()

  assert.equal(result.data.uci, "e2e4")
  assert.equal(result.data.san, "e4")
  assert.ok(eventTypes(result).includes("move-committed"), JSON.stringify(result))
  assert.equal(state.fen, "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1")
  assert.equal(state.turn, "black")
  assert.equal(state.moves.length, 1)
  assert.equal(state.moves[0].uci, "e2e4")
  assert.equal(state.moves[0].san, "e4")
  assert.equal(document.fen, state.fen)
  assert.equal(document.pgn, state.pgn)
  assert.deepEqual(document.moves.map(({ clock_before, draw_offer_before, ...record }) => record), state.moves)
  assert.ok(Object.values(state.position_counts).includes(1))
})

test("invalid moves, wrong actors, and wrong turns are non-mutating", () => {
  const { controller: game } = controller()
  assertOk(game.newGame({ mode: "local" }))
  const before = structuredClone(snapshot(game))

  assertRejected(game.move({ from: "e2", to: "e5", actor: "human" }), "INVALID_MOVE")
  assert.deepEqual(snapshot(game), before)

  assertRejected(game.move({ from: "e2", to: "e4", actor: "computer" }), "WRONG_ACTOR")
  assert.deepEqual(snapshot(game), before)

  assertOk(game.move({ from: "e2", to: "e4", actor: "human" }))
  const afterWhite = structuredClone(snapshot(game))
  assertRejected(game.move({ from: "e7", to: "e5", actor: "human", side: "white" }), "WRONG_TURN")
  assert.deepEqual(snapshot(game), afterWhite)
})

test("promotion is pending without mutating rules or switching clocks until a choice", () => {
  const { controller: game } = controller()
  assertOk(game.loadGame(activeDocument({ fen: PROMOTION_FEN })))
  assertOk(game.resume())
  const before = snapshot(game)

  const pending = assertRejected(game.move({ from: "a7", to: "a8", actor: "human" }), "PROMOTION_REQUIRED")
  const pendingState = snapshot(game)
  assert.deepEqual(pendingState.fen, before.fen)
  assert.deepEqual(pendingState.moves, before.moves)
  assert.equal(pendingState.status, "promotion-pending")
  assert.deepEqual(pendingState.pending_promotion.choices, ["queen", "rook", "bishop", "knight"])
  assert.equal(pending.data?.choices?.length || pending.choices?.length, 4)

  assertRejected(game.choosePromotion("king"), "INVALID_PROMOTION")
  assert.deepEqual(snapshot(game).fen, PROMOTION_FEN)

  const committed = assertOk(game.choosePromotion("queen"))
  const after = snapshot(game)
  assert.equal(committed.data.uci, "a7a8q")
  assert.ok(after.fen.split(" ")[0].startsWith("Q3k3/"))
  assert.equal(after.moves.length, 1)
  assert.equal(after.status, "active-human")
  assert.equal(after.turn, "black")
  assert.ok(eventTypes(committed).includes("move-committed"), JSON.stringify(committed))
})

test("timed moves consume only the mover clock, add increment, and flag before a late move", () => {
  const fake = makeClock()
  const { controller: game } = controller({
    clock: fake,
    timeControl: { base_ms: 1_000, increment_ms: 200 },
    now: () => fake.now
  })
  assertOk(game.newGame({ mode: "local", time_control: { base_ms: 1_000, increment_ms: 200 } }))

  fake.now += 300
  assertOk(game.move({ from: "e2", to: "e4", actor: "human" }))
  let state = snapshot(game)
  assert.equal(state.clock.white_ms, 900)
  assert.equal(state.clock.black_ms, 1_000)
  assert.equal(state.clock.running_side, "black")

  fake.now += 1_001
  const late = game.move({ from: "e7", to: "e5", actor: "human" })
  assert.equal(late.ok, false)
  state = snapshot(game)
  assert.equal(state.status, "completed")
  assert.equal(state.result.reason, "timeout")
  assert.equal(state.result.score, "1-0")
  assert.equal(state.moves.length, 1)
})

test("post-move checkmate takes precedence and completion is immutable", () => {
  const { controller: game } = controller()
  assertOk(game.newGame({ mode: "local" }))
  play(game, ["f2f3", "e7e5", "g2g4", "d8h4"])

  const completed = snapshot(game)
  assert.equal(completed.status, "completed")
  assert.equal(completed.result.reason, "checkmate")
  assert.equal(completed.result.score, "0-1")

  const attempts = [
    () => game.move({ from: "a2", to: "a3", actor: "human" }),
    () => game.undo({ confirmed: true }),
    () => game.resign("white"),
    () => game.offerDraw("white"),
    () => game.pause("after-result")
  ]
  for (const attempt of attempts) {
    assertRejected(attempt(), "GAME_ALREADY_COMPLETE")
    assert.deepEqual(snapshot(game), completed)
  }
})

test("local undo restores the exact prior position, history, counts, clock, and draw state", () => {
  const fake = makeClock()
  const { controller: game } = controller({
    clock: fake,
    timeControl: { base_ms: 10_000, increment_ms: 500 },
    now: () => fake.now
  })
  assertOk(game.newGame({ mode: "local", time_control: { base_ms: 10_000, increment_ms: 500 } }))
  fake.now += 1_000
  assertOk(game.move({ from: "e2", to: "e4", actor: "human" }))
  assertOk(game.offerDraw("black"))
  fake.now += 2_000
  assertOk(game.move({ from: "e7", to: "e5", actor: "human" }))
  const afterTwo = snapshot(game)

  const undone = assertOk(game.undo({ confirmed: true }))
  const restored = snapshot(game)
  assert.ok(["UNDO_COMPLETED", "UNDO", "OK"].includes(undone.code), JSON.stringify(undone))
  assert.equal(restored.fen, "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1")
  assert.equal(restored.moves.length, 1)
  assert.equal(restored.pending_draw_offer_by, "black")
  assert.equal(restored.turn, "black")
  assert.notDeepEqual(restored, afterTwo)
  assert.equal(restored.clock.running_side, "black")
  assert.equal(restored.position_counts[PositionKey.fromRules(RulesAdapter.create({ fen: restored.fen }))], 1)
})

test("computer undo removes a full move when an AI ply is present and rejects human input while thinking", () => {
  const { controller: game } = controller({ mode: "computer", humanColor: "white" })
  assertOk(game.newGame({ mode: "computer", human_color: "white" }))
  assertOk(game.move({ from: "e2", to: "e4", actor: "human" }))
  const blocked = game.move({ from: "e7", to: "e5", actor: "human" })
  assertRejected(blocked, "COMPUTER_THINKING")

  assertOk(game.move({ from: "e7", to: "e5", actor: "computer" }))
  assert.equal(snapshot(game).status, "active-human")
  assertOk(game.undo({ confirmed: true }))
  const restored = snapshot(game)
  assert.equal(restored.fen, START_FEN)
  assert.deepEqual(restored.moves, [])
  assert.equal(restored.turn, "white")
  assert.equal(restored.status, "active-human")
})

test("pause stops clocks, cancels promotion/search state, and resume starts the side to move", () => {
  const fake = makeClock()
  const { controller: game } = controller({
    clock: fake,
    timeControl: { base_ms: 5_000, increment_ms: 0 },
    now: () => fake.now
  })
  assertOk(game.newGame({ mode: "local", time_control: { base_ms: 5_000, increment_ms: 0 } }))

  fake.now += 2_000
  assertOk(game.pause("panel-closed"))
  let state = snapshot(game)
  assert.equal(state.status, "paused")
  assert.equal(state.pending_promotion, null)
  assert.equal(state.clock.running_side, null)
  assert.equal(state.clock.white_ms, 3_000)

  fake.now += 9_000
  assertOk(game.resume())
  state = snapshot(game)
  assert.equal(state.status, "active-human")
  assert.equal(state.turn, "white")
  assert.equal(state.clock.running_side, "white")

  // A promotion selection is transient. Pausing it must not leave an
  // uncommitted move behind when the game is resumed.
  const promotion = controller()
  assertOk(promotion.controller.loadGame(activeDocument({ fen: PROMOTION_FEN })))
  assertOk(promotion.controller.resume())
  assertRejected(promotion.controller.move({ from: "a7", to: "a8", actor: "human" }), "PROMOTION_REQUIRED")
  assert.equal(snapshot(promotion.controller).status, "promotion-pending")
  assertOk(promotion.controller.pause("promotion-cancel"))
  assert.equal(snapshot(promotion.controller).pending_promotion, null)
  assertOk(promotion.controller.resume())
  assert.equal(snapshot(promotion.controller).status, "active-human")
  assert.equal(snapshot(promotion.controller).fen, PROMOTION_FEN)
})

test("draw offer is side-bound, acceptance completes once, and decline clears the offer", () => {
  const { controller: game } = controller()
  assertOk(game.newGame({ mode: "local" }))

  assertOk(game.offerDraw("white"))
  assert.equal(snapshot(game).pending_draw_offer_by, "white")
  assertRejected(game.offerDraw("white"), "DRAW_ALREADY_OFFERED")
  assertOk(game.respondToDraw("white", false))
  assert.equal(snapshot(game).pending_draw_offer_by, null)

  assertOk(game.offerDraw("white"))
  const accepted = assertOk(game.respondToDraw("black", true))
  assert.ok(eventTypes(accepted).includes("game-completed"), JSON.stringify(accepted))
  assert.equal(snapshot(game).status, "completed")
  assert.equal(snapshot(game).result.reason, "draw-agreement")
  assert.equal(snapshot(game).result.score, "1/2-1/2")
  assertRejected(game.respondToDraw("white", true), "GAME_ALREADY_COMPLETE")
})

test("current and prospective draw claims are validated without mutating the position", () => {
  const current = controller()
  assertOk(current.controller.loadGame(activeDocument({
    fen: CLAIM_FEN,
    positionCounts: { [PositionKey.fromRules(RulesAdapter.create({ fen: CLAIM_FEN }))]: 3 }
  })))
  assertOk(current.controller.resume())
  const before = structuredClone(snapshot(current.controller))
  assertOk(current.controller.claimDraw("white", "threefold", null))
  assert.equal(snapshot(current.controller).result.reason, "threefold-claim")
  assert.deepEqual(snapshot(current.controller).moves, before.moves)

  const prospective = controller()
  assertOk(prospective.controller.loadGame(activeDocument({ fen: PROSPECTIVE_CLAIM_FEN })))
  assertOk(prospective.controller.resume())
  const beforeProspective = structuredClone(snapshot(prospective.controller))
  const claim = prospective.controller.claimDraw("white", "fifty-move", "a1a2")
  assertOk(claim)
  assert.equal(snapshot(prospective.controller).result.reason, "fifty-move-claim")
  assert.deepEqual(snapshot(prospective.controller).moves, beforeProspective.moves)
  assert.equal(snapshot(prospective.controller).fen, beforeProspective.fen)
})

test("resignation, abandon, and computer-to-local conversion use explicit transitions", () => {
  const resigned = controller()
  assertOk(resigned.controller.newGame({ mode: "local" }))
  assertOk(resigned.controller.resign("white"))
  assert.equal(snapshot(resigned.controller).result.score, "0-1")
  assert.equal(snapshot(resigned.controller).result.reason, "resignation")
  assert.equal(snapshot(resigned.controller).result.winner, "black")

  const abandoned = controller()
  assertOk(abandoned.controller.newGame({ mode: "local" }))
  assertOk(abandoned.controller.pause("user"))
  assertOk(abandoned.controller.abandon())
  assert.equal(snapshot(abandoned.controller).status, "abandoned")
  assert.equal(snapshot(abandoned.controller).result.reason, "abandoned")

  const converted = controller({ mode: "computer", humanColor: "white" })
  assertOk(converted.controller.newGame({ mode: "computer", human_color: "white" }))
  assertOk(converted.controller.move({ from: "e2", to: "e4", actor: "human" }))
  assert.equal(snapshot(converted.controller).status, "active-computer")
  assertOk(converted.controller.convertComputerToLocal())
  assert.equal(snapshot(converted.controller).mode, "local")
  assert.equal(snapshot(converted.controller).status, "active-human")
  assert.equal(snapshot(converted.controller).players.black.kind, "human")
  assert.equal(snapshot(converted.controller).turn, "black")
})

test("computer difficulty can change only while a computer game is paused", () => {
  const { controller: game } = controller({ mode: "computer", humanColor: "white" })
  assertOk(game.newGame({ mode: "computer", human_color: "white", difficulty: "strong" }))
  assert.equal(game.setComputerDifficulty("casual").code, "GAME_NOT_PAUSED")
  assertOk(game.pause("settings"))
  const changed = assertOk(game.setComputerDifficulty("challenging"))

  assert.equal(changed.data.difficulty, "challenging")
  assert.equal(snapshot(game).difficulty, "challenging")
  assert.equal(game.persistenceDocument().difficulty, "challenging")
  assert.equal(game.setComputerDifficulty("impossible").code, "AI_UNKNOWN_PROFILE")

  const local = controller().controller
  assertOk(local.newGame({ mode: "local" }))
  assertOk(local.pause("settings"))
  assert.equal(local.setComputerDifficulty("casual").code, "ALREADY_LOCAL_MODE")
})

test("checkpoint and rollback restore the full authoritative state", () => {
  const { controller: game } = controller()
  assert.equal(typeof game.checkpoint, "function", "integration needs a controller checkpoint")
  assert.equal(typeof game.rollback, "function", "integration needs a controller rollback")
  assertOk(game.newGame({ mode: "local" }))
  assertOk(game.move({ from: "e2", to: "e4", actor: "human" }))
  const checkpoint = game.checkpoint()
  const expected = structuredClone(snapshot(game))

  assertOk(game.move({ from: "e7", to: "e5", actor: "human" }))
  assertOk(game.offerDraw("white"))
  assertOk(game.rollback(checkpoint))
  assert.deepEqual(snapshot(game), expected)
})

test("persistence documents are defensive snapshots and load restores exact chess state", () => {
  const first = controller()
  assertOk(first.controller.newGame({ mode: "local" }))
  play(first.controller, ["e2e4", "e7e5", "g1f3", "b8c6"])
  const document = first.controller.persistenceDocument()
  const expected = structuredClone(snapshot(first.controller))

  document.fen = START_FEN
  document.moves.length = 0
  document.position_counts = {}
  assert.equal(snapshot(first.controller).fen, expected.fen)
  assert.deepEqual(snapshot(first.controller).moves, expected.moves)
  assert.deepEqual(snapshot(first.controller).position_counts, expected.position_counts)

  const second = controller()
  assertOk(second.controller.loadGame(first.controller.persistenceDocument()))
  const restored = snapshot(second.controller)
  assert.equal(restored.game_id, expected.game_id)
  assert.equal(restored.fen, expected.fen)
  assert.equal(restored.pgn, expected.pgn)
  assert.deepEqual(restored.moves, expected.moves)
  assert.deepEqual(restored.position_counts, expected.position_counts)
  assert.equal(restored.turn, expected.turn)
  assert.ok(["paused", "active-human"].includes(restored.status))
})

test("invalid loads are transactional and do not replace the current game", () => {
  const { controller: game } = controller()
  assertOk(game.newGame({ mode: "local" }))
  assertOk(game.move({ from: "e2", to: "e4", actor: "human" }))
  const before = structuredClone(snapshot(game))
  const invalid = game.loadGame({
    ...activeDocument({ gameId: "bad-game" }),
    fen: "not a fen",
    position_counts: { bogus: 1 }
  })

  assert.equal(invalid.ok, false)
  assert.ok(["ACTIVE_GAME_CONFLICT", "PERSISTENCE_VALIDATION_FAILED", "RULES_STATE_MISMATCH", "POSITION_INVALID"].includes(invalid.code), JSON.stringify(invalid))
  assert.deepEqual(snapshot(game), before)
})

test("result and persisted completed record remain immutable after all later commands", () => {
  const { controller: game } = controller()
  assertOk(game.newGame({ mode: "local" }))
  assertOk(game.resign("white"))
  const result = structuredClone(snapshot(game).result)
  const record = structuredClone(game.persistenceDocument())

  assert.deepEqual(game.persistenceDocument().result, {
    score: result.score,
    reason: result.reason,
    finished_at: result.finished_at
  })
  for (const command of [
    () => game.move({ from: "e2", to: "e4", actor: "human" }),
    () => game.undo({ confirmed: true }),
    () => game.resign("black"),
    () => game.abandon(),
    () => game.convertComputerToLocal()
  ]) {
    const response = command()
    assert.equal(response.ok, false)
    assert.equal(response.code, "GAME_ALREADY_COMPLETE")
    assert.deepEqual(snapshot(game).result, result)
    assert.deepEqual(game.persistenceDocument(), record)
  }
})
