import assert from "node:assert/strict"
import test from "node:test"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const RulesAdapter = require("../engine/RulesAdapter.js")
const SearchEngine = require("../engine/SearchEngine.js")

function rules(fen) {
  const result = RulesAdapter.create(fen ? { fen } : {})
  assert.equal(result.valid, true, result.error?.detail)
  return result
}

function request(position, profile = {}) {
  return {
    token: 7,
    source_fen: position.fen(),
    history_uci: position.history({ format: "uci" }),
    position_counts: {},
    profile: {
      id: "challenging",
      budget_ms: 200,
      max_depth: 2,
      quiescence_depth: 2,
      table_entries: 2000,
      node_limit: 20000,
      ...profile
    },
    seed: 12345
  }
}

function immediateDeadline() {
  let calls = 0
  return {
    check_interval: 1,
    now() {
      calls += 1
      return calls === 1 ? 0 : 10000
    }
  }
}

test("mate in one is scored as mate and returned through legal UCI", () => {
  const position = rules("7k/5Q2/6K1/8/8/8/8/8 w - - 0 1")
  const legalMates = position.legalMoves()
    .filter((move) => move.san.endsWith("#"))
    .map((move) => move.uci)
  const result = SearchEngine.search(request(position, {
    id: "strong",
    budget_ms: 100,
    max_depth: 4,
    temperature: 0
  }))

  assert.equal(result.ok, true)
  assert.ok(legalMates.includes(result.uci))
  assert.equal(result.score_cp, SearchEngine.mate_score - 1)
  assert.equal(result.depth, 1)
})

test("search returns a legal move and never mutates an injected source position", () => {
  const source = rules()
  const beforeFen = source.fen()
  const beforeHistory = source.history({ format: "uci" })
  const result = SearchEngine.search(request(source, {
    max_depth: 1,
    budget_ms: 500
  }), {
    position: source,
    now: () => 0,
    check_interval: 1
  })

  assert.equal(result.ok, true)
  assert.ok(source.legalMoves({ verbose: false }).includes(result.uci))
  assert.equal(source.fen(), beforeFen)
  assert.deepEqual(source.history({ format: "uci" }), beforeHistory)
})

test("expired deadline preserves a legal deterministic fallback", () => {
  const position = rules()
  const input = request(position, { budget_ms: 1, max_depth: 6 })
  const first = SearchEngine.search(input, immediateDeadline())
  const second = SearchEngine.search(input, immediateDeadline())

  assert.equal(first.ok, true)
  assert.equal(first.depth, 0)
  assert.equal(first.limited_by, "deadline")
  assert.ok(position.legalMoves({ verbose: false }).includes(first.uci))
  assert.equal(second.uci, first.uci)
})

test("same position, profile, and seed is reproducible", () => {
  const position = rules("r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3")
  const input = request(position, {
    id: "learner",
    max_depth: 1,
    budget_ms: 500,
    node_limit: 10000
  })
  const runtime = () => ({ now: () => 0, check_interval: 1 })
  const first = SearchEngine.search(input, runtime())
  const second = SearchEngine.search(input, runtime())

  assert.equal(first.ok, true)
  assert.equal(second.ok, true)
  assert.equal(first.uci, second.uci)
  assert.equal(first.score_cp, second.score_cp)
  assert.equal(first.depth, second.depth)
  assert.equal(first.nodes, second.nodes)
})

test("root variety consumes injected randomness without weakening legality", () => {
  const position = rules()
  const input = request(position, {
    id: "learner",
    max_depth: 1,
    budget_ms: 500,
    centipawn_window: 600,
    safety_floor_cp: 600,
    temperature: 2
  })
  const low = SearchEngine.search(input, {
    now: () => 0,
    random: () => 0,
    check_interval: 1
  })
  const high = SearchEngine.search(input, {
    now: () => 0,
    random: () => 0.999999,
    check_interval: 1
  })
  const legal = position.legalMoves({ verbose: false })

  assert.equal(low.ok, true)
  assert.equal(high.ok, true)
  assert.ok(legal.includes(low.uci))
  assert.ok(legal.includes(high.uci))
  assert.notEqual(low.uci, high.uci)
})

test("promotion result remains legal and carries explicit promotion notation", () => {
  const position = rules("4k3/P7/8/8/8/8/8/4K3 w - - 0 1")
  const result = SearchEngine.search(request(position, {
    id: "strong",
    max_depth: 1,
    budget_ms: 500
  }), { now: () => 0, check_interval: 1 })

  assert.equal(result.ok, true)
  assert.match(result.uci, /^a7a8[qrbn]$/)
  assert.ok(position.legalMoves({ verbose: false }).includes(result.uci))
})

test("cancellation is checked before and during search", () => {
  const position = rules()
  const input = request(position, { max_depth: 5, budget_ms: 500 })
  const before = SearchEngine.search(input, {
    now: () => 0,
    is_cancelled: () => true
  })
  let checks = 0
  const during = SearchEngine.search(input, {
    now: () => 0,
    check_interval: 1,
    is_cancelled() {
      checks += 1
      return checks > 8
    }
  })

  assert.equal(before.code, "AI_CANCELLED")
  assert.equal(during.code, "AI_CANCELLED")
  assert.equal(position.fen(), input.source_fen)
})

test("node and transposition-table budgets are hard bounds", () => {
  const position = rules()
  const result = SearchEngine.search(request(position, {
    max_depth: 5,
    budget_ms: 5000,
    node_limit: 250,
    table_entries: 4
  }), { now: () => 0, check_interval: 1 })

  assert.equal(result.ok, true)
  assert.ok(result.nodes <= 250)
  assert.ok(result.table_entries <= 4)
  assert.equal(result.limited_by, "node_limit")
})

test("real wall-clock search stays within its budget tolerance", () => {
  const position = rules("7k/8/8/8/8/8/5K2/6R1 w - - 0 1")
  const result = SearchEngine.search(request(position, {
    id: "learner",
    max_depth: 5,
    budget_ms: 40,
    node_limit: 100000
  }))

  assert.equal(result.ok, true)
  assert.ok(result.duration_ms <= 75, `duration ${result.duration_ms} ms`)
  assert.ok(position.legalMoves({ verbose: false }).includes(result.uci))
})

test("terminal positions produce a structured no-legal-move error", () => {
  const position = rules("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1")
  const result = SearchEngine.search(request(position))

  assert.equal(result.ok, false)
  assert.equal(result.code, "AI_NO_LEGAL_MOVE")
})
