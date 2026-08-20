import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import test from "node:test"
import vm from "node:vm"

const require = createRequire(import.meta.url)
const DemoFixtures = require("../engine/DemoFixtures.js")
const PositionKey = require("../engine/PositionKey.js")
const RulesAdapter = require("../engine/RulesAdapter.js")

const EXPECTED_IDS = [
  "standard-midgame",
  "castle-ready",
  "promotion",
  "checkmate-in-one",
  "stalemate-preview",
  "threefold-claim",
  "fifty-move-claim",
  "timeout-warning",
  "save-error",
  "ai-error",
  "history-populated"
]

function rules(fen) {
  const adapter = RulesAdapter.create({ fen })
  assert.equal(adapter.valid, true, adapter.error?.detail)
  return adapter
}

test("exports the documented classic-script API to Node and QML", () => {
  assert.deepEqual(Object.keys(DemoFixtures).sort(), [
    "all",
    "configureDependencies",
    "get",
    "ids",
    "validateAll",
    "validateFixture"
  ])

  const source = readFileSync(new URL("../engine/DemoFixtures.js", import.meta.url), "utf8")
  const context = {}
  vm.runInNewContext(source, context, { filename: "DemoFixtures.js" })
  assert.equal(typeof context.configureDependencies, "function")
  assert.equal(typeof context.get, "function")
  assert.equal(typeof context.validateAll, "function")
  context.configureDependencies(RulesAdapter, PositionKey)
  assert.equal(context.validateAll().ok, true)
})

test("catalog contains exactly the eleven documented deterministic fixture IDs", () => {
  assert.deepEqual(DemoFixtures.ids(), EXPECTED_IDS)
  assert.equal(new Set(DemoFixtures.ids()).size, EXPECTED_IDS.length)
  assert.equal(DemoFixtures.get(" PROMOTION ").id, "promotion")
  assert.equal(DemoFixtures.get("not-a-fixture"), null)
  assert.equal(DemoFixtures.get(null), null)
})

test("every fixture validates through RulesAdapter and carries required metadata", () => {
  const validation = DemoFixtures.validateAll()
  assert.deepEqual(validation, { ok: true, errors: [] })

  for (const fixture of DemoFixtures.all()) {
    const position = rules(fixture.fen)
    assert.equal(position.turn(), fixture.side_to_move, fixture.id)
    assert.ok(["local", "computer"].includes(fixture.mode), fixture.id)
    assert.equal(typeof fixture.description, "string", fixture.id)
    assert.ok(fixture.description.length > 20, fixture.id)
    assert.equal(fixture.demo, true, fixture.id)
    assert.equal(fixture.allow_normal_history, false, fixture.id)
    assert.equal(fixture.history_policy, "test-record-only", fixture.id)
    assert.equal(fixture.screenshot_safe, true, fixture.id)
    assert.equal(typeof fixture.expected_ui_state, "string", fixture.id)
    assert.ok(Array.isArray(fixture.allowed_next_actions), fixture.id)
    assert.ok(fixture.allowed_next_actions.length > 0, fixture.id)
    assert.equal(typeof fixture.players.white.name, "string", fixture.id)
    assert.equal(typeof fixture.players.black.name, "string", fixture.id)
    assert.equal(typeof fixture.clock.enabled, "boolean", fixture.id)
  }
})

test("returned fixtures are defensive deep clones", () => {
  const first = DemoFixtures.get("promotion")
  first.players.white.name = "mutated"
  first.expected_action.expected_choices.pop()
  first.allowed_next_actions.push("unsafe")

  const second = DemoFixtures.get("promotion")
  assert.equal(second.players.white.name, "Local White")
  assert.deepEqual(second.expected_action.expected_choices, [
    "queen", "rook", "bishop", "knight"
  ])
  assert.equal(second.allowed_next_actions.includes("unsafe"), false)

  const all = DemoFixtures.all()
  all.length = 0
  assert.deepEqual(DemoFixtures.ids(), EXPECTED_IDS)
})

test("catalog output is byte-for-byte deterministic and has no runtime randomness or network behavior", () => {
  const first = JSON.stringify(DemoFixtures.all())
  const second = JSON.stringify(DemoFixtures.all())
  const source = readFileSync(new URL("../engine/DemoFixtures.js", import.meta.url), "utf8")

  assert.equal(first, second)
  assert.doesNotMatch(source, /Math\.random|Date\.now|fetch\s*\(|XMLHttpRequest|https?:\/\//)
})

test("standard midgame replays exactly and meets screenshot composition requirements", () => {
  const fixture = DemoFixtures.get("standard-midgame")
  const replay = rules(fixture.initial_fen)

  for (const move of fixture.move_history_uci)
    assert.equal(replay.commitMove(move).ok, true, move)
  assert.equal(replay.fen(), fixture.fen)
  assert.equal(fixture.move_history_uci.length, 16)
  assert.equal(fixture.expected_last_move_uci, "d7d6")
  assert.equal(32 - replay.board().length, 4)
  assert.ok(replay.board().some((piece) => piece.square === "g1" && piece.piece === "king"))
  assert.ok(replay.board().some((piece) => piece.square === "g8" && piece.piece === "king"))
  assert.equal(replay.isCheck(), false)
  assert.equal(replay.isCheckmate(), false)
  assert.equal(replay.isStalemate(), false)
})

test("castle-ready fixture exposes legal castling and authoritative SAN", () => {
  const fixture = DemoFixtures.get("castle-ready")
  const position = rules(fixture.fen)
  const legal = position.legalMoves({ verbose: false })

  assert.ok(legal.includes("e1g1"))
  assert.ok(legal.includes("e1c1"))
  const result = position.commitMove(fixture.expected_action.uci)
  assert.equal(result.ok, true)
  assert.equal(result.move.san, "O-O")
})

test("promotion fixture uses separated kings and preserves state until piece choice", () => {
  const fixture = DemoFixtures.get("promotion")
  const position = rules(fixture.fen)
  const before = position.fen()
  const pending = position.commitMove({ from: "a7", to: "a8" })

  assert.equal(position.isCheck(), false)
  assert.equal(pending.code, "PROMOTION_REQUIRED")
  assert.deepEqual(pending.choices, ["queen", "rook", "bishop", "knight"])
  assert.equal(position.fen(), before)
  for (const symbol of ["q", "r", "b", "n"])
    assert.ok(position.legalMoves({ verbose: false }).includes(`a7a8${symbol}`))
})

test("checkmate and stalemate fixtures match their result expectations", () => {
  const mateFixture = DemoFixtures.get("checkmate-in-one")
  const mate = rules(mateFixture.fen)
  const committed = mate.commitMove(mateFixture.expected_action.uci)
  assert.equal(committed.ok, true)
  assert.equal(committed.move.san, "Qg7#")
  assert.equal(mate.isCheckmate(), true)

  const staleFixture = DemoFixtures.get("stalemate-preview")
  const stale = rules(staleFixture.fen)
  assert.equal(stale.isStalemate(), true)
  assert.equal(stale.isCheck(), false)
  assert.equal(stale.legalMoves().length, 0)
  assert.deepEqual(staleFixture.expected_result, {
    terminal: true,
    reason: "stalemate",
    score: "1/2-1/2",
    winner: null
  })
})

test("threefold fixture replays exact occurrence counts without mutating its catalog entry", () => {
  const fixture = DemoFixtures.get("threefold-claim")
  const original = JSON.stringify(fixture)
  const replay = rules(fixture.initial_fen)
  const counts = { [PositionKey.fromRules(replay)]: 1 }

  for (const move of fixture.move_history_uci) {
    assert.equal(replay.commitMove(move).ok, true)
    const key = PositionKey.fromRules(replay)
    counts[key] = (counts[key] || 0) + 1
  }
  assert.equal(replay.fen(), fixture.fen)
  assert.deepEqual(counts, fixture.position_counts)
  assert.equal(counts[PositionKey.fromRules(replay)], 3)
  assert.equal(JSON.stringify(fixture), original)
})

test("fifty-move and low-clock fixtures carry exact claim and display thresholds", () => {
  const fifty = DemoFixtures.get("fifty-move-claim")
  const fields = rules(fifty.fen).fen().split(/\s+/)
  assert.equal(Number(fields[4]), 100)
  assert.deepEqual(fifty.expected_claim, {
    type: "fifty-move-claim",
    available: true
  })

  const timeout = DemoFixtures.get("timeout-warning")
  assert.equal(timeout.clock.paused, true)
  assert.equal(timeout.clock.running_side, null)
  assert.equal(timeout.clock.white_ms, 8400)
  assert.ok(timeout.clock.white_ms < timeout.expected_clock.warning_threshold_ms)
  assert.ok(timeout.clock.black_ms > timeout.expected_clock.warning_threshold_ms)
  assert.equal(timeout.expected_clock.simulated, true)
})

test("error fixtures use documented stable codes and complete recovery actions", () => {
  const save = DemoFixtures.get("save-error")
  assert.equal(save.status, "paused-error")
  assert.equal(save.injected_error.code, "PERSISTENCE_WRITE_FAILED")
  assert.equal(save.injected_error.severity, "critical")
  assert.equal(save.injected_error.recoverable, true)
  assert.ok(save.allowed_next_actions.includes("retry-save"))
  assert.ok(save.allowed_next_actions.includes("export-pgn"))

  const ai = DemoFixtures.get("ai-error")
  assert.equal(ai.status, "paused-error")
  assert.equal(ai.injected_error.code, "AI_WORKER_FAILED")
  assert.equal(ai.deterministic_seed, 424242)
  for (const action of ["retry-ai", "lower-difficulty", "convert-to-local", "export-pgn"])
    assert.ok(ai.allowed_next_actions.includes(action))
})

test("history fixture is synthetic, stable, and isolated from normal history", () => {
  const fixture = DemoFixtures.get("history-populated")
  assert.equal(fixture.history_records.length, 3)
  assert.equal(new Set(fixture.history_records.map((record) => record.game_id)).size, 3)
  assert.equal(fixture.allow_normal_history, false)
  assert.equal(fixture.expected_ui_state, "history-list")

  for (const record of fixture.history_records) {
    assert.match(record.game_id, /^demo_history_\d{3}$/)
    assert.equal(new Date(record.completed_at).toISOString(), record.completed_at)
    assert.ok(["1-0", "0-1", "1/2-1/2"].includes(record.score))
    assert.ok(Number.isInteger(record.ply_count) && record.ply_count > 0)
  }
})

test("dependency and unknown-fixture failures are structured", () => {
  assert.throws(
    () => DemoFixtures.configureDependencies({}, PositionKey),
    /invalid RulesAdapter/
  )
  assert.throws(
    () => DemoFixtures.configureDependencies(RulesAdapter, {}),
    /invalid PositionKey/
  )
  DemoFixtures.configureDependencies(RulesAdapter, PositionKey)
  assert.deepEqual(DemoFixtures.validateFixture("missing"), {
    ok: false,
    errors: ["unknown demo fixture"]
  })
})
