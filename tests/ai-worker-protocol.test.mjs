import assert from "node:assert/strict"
import test from "node:test"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const RulesAdapter = require("../engine/RulesAdapter.js")
const WorkerProtocol = require("../engine/WorkerProtocol.js")

function validRequest(overrides = {}) {
  const position = RulesAdapter.create({})
  return {
    protocol_version: 1,
    type: "search",
    token: 42,
    game_id: "game_protocol",
    source_fen: position.fen(),
    history_uci: [],
    position_counts: {},
    profile: {
      id: "casual",
      max_depth: 1,
      budget_ms: 1,
      table_entries: 100,
      centipawn_window: 80,
      temperature: 0.35
    },
    seed: 12345,
    sent_at_ms: 123456,
    ...overrides
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

test("valid request returns the stable protocol-v1 bestmove envelope", () => {
  const request = validRequest()
  const response = WorkerProtocol.handleMessage(request, immediateDeadline())

  assert.equal(response.protocol_version, 1)
  assert.equal(response.type, "bestmove")
  assert.equal(response.token, request.token)
  assert.equal(response.game_id, request.game_id)
  assert.equal(response.source_fen, request.source_fen)
  assert.match(response.uci, /^[a-h][1-8][a-h][1-8][qrbn]?$/)
  assert.equal(WorkerProtocol.validateResponse(response).ok, true)
})

test("malformed, unsupported, oversized, and unknown requests return errors", () => {
  const cases = [
    [null, "AI_INVALID_REQUEST"],
    [validRequest({ protocol_version: 2 }), "AI_PROTOCOL_UNSUPPORTED"],
    [validRequest({ type: "cancel" }), "AI_UNKNOWN_REQUEST"],
    [validRequest({ token: -1 }), "AI_INVALID_TOKEN"],
    [validRequest({ source_fen: "x".repeat(513) }), "AI_INVALID_FEN"],
    [validRequest({ profile: "grandmaster" }), "AI_UNKNOWN_PROFILE"],
    [validRequest({ seed: "random" }), "AI_INVALID_SEED"],
    [validRequest({ history_uci: new Array(2049).fill("e2e4") }), "AI_HISTORY_BOUNDS"],
    [validRequest({ history_uci: ["not-uci"] }), "AI_HISTORY_BOUNDS"],
    [validRequest({ position_counts: [] }), "AI_POSITION_COUNTS_BOUNDS"]
  ]

  for (const [request, code] of cases) {
    const response = WorkerProtocol.handleMessage(request)
    assert.equal(response.type, "error")
    assert.equal(response.code, code)
    assert.equal(response.protocol_version, 1)
    assert.equal(typeof response.message, "string")
  }
})

test("profile values are clamped inside the worker search boundary", () => {
  const response = WorkerProtocol.handleMessage(validRequest({
    profile: {
      id: "strong",
      budget_ms: 999999,
      max_depth: 999,
      table_entries: 99999999
    },
    budget_ms: 1
  }), immediateDeadline())

  assert.equal(response.type, "bestmove")
  assert.equal(response.budget_ms, 1)
  assert.ok(response.table_entries <= 100000)
})

test("stale, paused, completed, and mismatched responses are rejected", () => {
  const request = validRequest()
  const response = WorkerProtocol.handleMessage(request, immediateDeadline())
  const current = {
    token: request.token,
    game_id: request.game_id,
    source_fen: request.source_fen,
    accepting: true,
    paused: false,
    completed: false
  }

  assert.equal(WorkerProtocol.isCurrentResponse(response, current), true)
  assert.equal(WorkerProtocol.isCurrentResponse(response, { ...current, token: 43 }), false)
  assert.equal(WorkerProtocol.isCurrentResponse(response, { ...current, game_id: "new" }), false)
  assert.equal(WorkerProtocol.isCurrentResponse(response, { ...current, source_fen: "changed" }), false)
  assert.equal(WorkerProtocol.isCurrentResponse(response, { ...current, paused: true }), false)
  assert.equal(WorkerProtocol.isCurrentResponse(response, { ...current, completed: true }), false)
  assert.equal(WorkerProtocol.isCurrentResponse(response, { ...current, accepting: false }), false)
})

test("cancel signal becomes a structured error and cannot look current", () => {
  const request = validRequest()
  const response = WorkerProtocol.handleMessage(request, {
    now: () => 0,
    is_cancelled: () => true
  })

  assert.equal(response.type, "error")
  assert.equal(response.code, "AI_CANCELLED")
  assert.equal(WorkerProtocol.isCurrentResponse(response, {
    token: request.token,
    game_id: request.game_id,
    source_fen: request.source_fen
  }), false)
})

test("response validation rejects illegal shapes before integration", () => {
  assert.equal(WorkerProtocol.validateResponse({}).code, "AI_PROTOCOL_UNSUPPORTED")
  assert.equal(WorkerProtocol.validateResponse({
    protocol_version: 1,
    type: "bestmove",
    uci: "e2e9",
    score_cp: 0,
    depth: 1,
    nodes: 1,
    duration_ms: 1
  }).code, "AI_RESPONSE_INVALID")
})
