import assert from "node:assert/strict"
import test from "node:test"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const DifficultyProfiles = require("../engine/DifficultyProfiles.js")
const Evaluation = require("../engine/Evaluation.js")
const RulesAdapter = require("../engine/RulesAdapter.js")

function rules(fen) {
  const result = RulesAdapter.create(fen ? { fen } : {})
  assert.equal(result.valid, true, result.error?.detail)
  return result
}

test("named profiles are distinct, bounded, and carry no Elo claims", () => {
  const profiles = DifficultyProfiles.named()

  assert.deepEqual(profiles.map((profile) => profile.id), [
    "learner",
    "casual",
    "challenging",
    "strong"
  ])
  assert.ok(profiles[0].budget_ms < profiles[1].budget_ms)
  assert.ok(profiles[1].budget_ms < profiles[2].budget_ms)
  assert.ok(profiles[2].budget_ms < profiles[3].budget_ms)
  assert.ok(profiles[0].centipawn_window > profiles[3].centipawn_window)
  assert.equal(profiles.some((profile) => "elo" in profile), false)

  const clamped = DifficultyProfiles.resolve({
    id: "strong",
    budget_ms: 999999,
    max_depth: 99,
    table_entries: 9999999,
    temperature: -4
  })
  assert.equal(clamped.budget_ms, 5000)
  assert.equal(clamped.max_depth, 8)
  assert.equal(clamped.table_entries, 100000)
  assert.equal(clamped.temperature, 0)
  assert.equal(DifficultyProfiles.resolve("unknown"), null)
})

test("clock-aware budget keeps the documented reserve formula and floor", () => {
  assert.equal(DifficultyProfiles.clockAwareBudget("casual", 60000, 0), 325)
  assert.equal(DifficultyProfiles.clockAwareBudget("strong", 3000, 0), 100)
  assert.equal(DifficultyProfiles.clockAwareBudget("strong", 0, 0), 30)
  assert.equal(DifficultyProfiles.clockAwareBudget("learner", 300, 2000), 150)
})

test("worker deadline allows a normal first pass but keeps emergency budgets short", () => {
  assert.equal(DifficultyProfiles.hardResponseDeadline("casual", 325), 5000)
  assert.equal(DifficultyProfiles.hardResponseDeadline("strong", 1600), 5400)
  assert.equal(DifficultyProfiles.hardResponseDeadline("strong", 30), 750)
  assert.equal(DifficultyProfiles.hardResponseDeadline("unknown", 325), null)
})

test("evaluation is side-to-move relative and material has the correct sign", () => {
  const whiteToMove = rules("4k3/8/8/8/8/8/Q7/4K3 w - - 0 1")
  const blackToMove = rules("4k3/8/8/8/8/8/Q7/4K3 b - - 0 1")

  assert.ok(Evaluation.evaluate(whiteToMove) > 800)
  assert.ok(Evaluation.evaluate(blackToMove) < -800)
  assert.equal(Evaluation.whiteScore(whiteToMove), -Evaluation.evaluate(blackToMove) + 20)
})

test("symmetric start is near zero apart from the documented tempo", () => {
  assert.equal(Evaluation.evaluate(rules()), 10)
})

test("passed-pawn advance and endgame king activity improve evaluation", () => {
  const pawnFourth = Evaluation.whiteScore(rules("7k/8/8/8/P7/8/8/4K3 w - - 0 1"))
  const pawnSixth = Evaluation.whiteScore(rules("7k/8/P7/8/8/8/8/4K3 w - - 0 1"))
  const cornerKing = Evaluation.whiteScore(rules("7k/8/8/8/8/8/P7/K7 w - - 0 1"))
  const centralKing = Evaluation.whiteScore(rules("7k/8/8/8/3K4/8/P7/8 w - - 0 1"))

  assert.ok(pawnSixth > pawnFourth)
  assert.ok(centralKing > cornerKing)
})

test("bishop pair receives a bounded positional bonus", () => {
  const pair = Evaluation.whiteScore(rules("4k3/8/8/8/8/8/2BB4/4K3 w - - 0 1"))
  const bishopKnight = Evaluation.whiteScore(rules("4k3/8/8/8/8/8/2BN4/4K3 w - - 0 1"))

  assert.ok(pair > bishopKnight)
  assert.ok(pair - bishopKnight < 100)
})

test("evaluation is finite and deterministic across legal generated positions", () => {
  const position = rules()
  let seed = 0x12345678

  for (let ply = 0; ply < 120; ply += 1) {
    const first = Evaluation.evaluate(position)
    const second = Evaluation.evaluate(position)
    assert.equal(first, second)
    assert.equal(Number.isFinite(first), true)

    const moves = position.legalMoves({ verbose: false })
    if (moves.length === 0)
      break
    seed ^= seed << 13
    seed ^= seed >>> 17
    seed ^= seed << 5
    seed >>>= 0
    assert.equal(position.commitMove(moves[seed % moves.length]).ok, true)
  }
})
