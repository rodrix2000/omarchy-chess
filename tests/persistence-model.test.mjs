import assert from "node:assert/strict"
import test from "node:test"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const PersistenceModel = require("../engine/PersistenceModel.js")
const PositionKey = require("../engine/PositionKey.js")
const RulesAdapter = require("../engine/RulesAdapter.js")

const STARTED = "2026-08-20T12:00:00.000Z"
const MOVED = "2026-08-20T12:00:05.000Z"
const FINISHED = "2026-08-20T12:00:10.000Z"

function jsonCopy(value) {
  return JSON.parse(JSON.stringify(value))
}

function localActive(moves = []) {
  const rules = RulesAdapter.create({})
  const moveRecords = []
  const counts = { [PositionKey.fromRules(rules)]: 1 }

  for (let index = 0; index < moves.length; index += 1) {
    const committed = rules.commitMove(moves[index])
    assert.equal(committed.ok, true)
    const playedAt = new Date(Date.parse(MOVED) + index * 1000).toISOString()
    moveRecords.push({
      ply: index + 1,
      uci: committed.move.uci,
      san: committed.move.san,
      fen_after: committed.fen_after,
      played_at: playedAt,
      clock_after_ms: null,
      clock_before: {
        enabled: false,
        white_ms: null,
        black_ms: null,
        increment_ms: 0,
        running_side: null,
        last_started_at: null
      },
      draw_offer_before: null
    })
    const key = PositionKey.fromRules(rules)
    counts[key] = (counts[key] || 0) + 1
  }

  return PersistenceModel.createActiveGame({
    game_id: "game-0001",
    mode: "local",
    status: "active-human",
    players: {
      white: { kind: "human", name: "White Player" },
      black: { kind: "human", name: "Black Player" }
    },
    human_color: null,
    difficulty: null,
    time_control: { base_ms: null, increment_ms: 0 },
    fen: rules.fen(),
    pgn: rules.pgn(),
    moves: moveRecords,
    position_counts: counts,
    clock: {
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
  }, {
    plugin_version: "0.1.0",
    created_at: STARTED,
    updated_at: moves.length
      ? new Date(Date.parse(MOVED) + (moves.length - 1) * 1000).toISOString()
      : STARTED
  })
}

test("settings defaults validate and merge without mutating the source", () => {
  const defaults = PersistenceModel.defaultSettings()
  assert.equal(PersistenceModel.validateSettings(defaults).ok, true)

  const merged = PersistenceModel.mergeSettingsPatch(defaults, {
    audio: { volume: 0.25 },
    accessibility: { reduced_motion: true }
  })
  assert.equal(merged.ok, true)
  assert.equal(merged.value.audio.volume, 0.25)
  assert.equal(merged.value.accessibility.reduced_motion, true)
  assert.equal(defaults.audio.volume, 0.65)
})

test("strict validation rejects unknown properties and invalid bounds", () => {
  const settings = PersistenceModel.defaultSettings()
  settings.audio.execute = "never"
  settings.gameplay.time_control.increment_ms = 3600001
  const validation = PersistenceModel.validateSettings(settings)
  assert.equal(validation.ok, false)
  assert.ok(validation.errors.some((error) => error.code === "UNKNOWN_PROPERTY"))
  assert.ok(validation.errors.some((error) => error.path.endsWith("increment_ms")))
})

test("future schemas are rejected without mutation", () => {
  const settings = PersistenceModel.defaultSettings()
  settings.schema_version = 2
  const before = JSON.stringify(settings)
  assert.equal(PersistenceModel.validateSettings(settings).code, "UNSUPPORTED_FUTURE_SCHEMA")
  assert.equal(PersistenceModel.migrateSettings(settings).code, "UNSUPPORTED_FUTURE_SCHEMA")
  assert.equal(JSON.stringify(settings), before)
})

test("every document type is migration-ready and rejects a future version", () => {
  const active = localActive(["e2e4"])
  const record = PersistenceModel.createCompletedRecord(active, {
    score: "1-0",
    reason: "resignation",
    finished_at: FINISHED
  })
  const currentDocuments = [
    [active, PersistenceModel.migrateActiveGame],
    [PersistenceModel.defaultHistory(), PersistenceModel.migrateHistory],
    [record, PersistenceModel.migrateCompletedRecord]
  ]

  for (const [document, migrate] of currentDocuments) {
    const current = migrate(document)
    assert.equal(current.ok, true)
    assert.equal(current.migrated, false)
    assert.notEqual(current.value, document)

    const future = jsonCopy(document)
    future.schema_version = 2
    assert.equal(migrate(future).code, "UNSUPPORTED_FUTURE_SCHEMA")
    assert.equal(future.schema_version, 2)
  }
})

test("serialization is stable, two-space JSON with one trailing newline", () => {
  const left = { z: 1, nested: { b: true, a: false }, a: 2 }
  const right = { a: 2, nested: { a: false, b: true }, z: 1 }
  const expected = PersistenceModel.serialize(left)
  assert.equal(PersistenceModel.serialize(right), expected)
  assert.match(expected, /\n  "nested": \{/)
  assert.equal(expected.endsWith("\n"), true)
  assert.equal(expected.endsWith("\n\n"), false)
})

test("active creation preserves deterministic undo extensions", () => {
  const active = localActive(["e2e4"])
  assert.equal(PersistenceModel.validateActiveGame(active).ok, true)
  assert.deepEqual(active.time_control, { base_ms: null, increment_ms: 0 })
  assert.equal(active.human_color, null)
  assert.equal(active.moves[0].clock_before.enabled, false)
  assert.equal(active.moves[0].draw_offer_before, null)
})

test("active semantic validation uses RulesAdapter for all position authorities", () => {
  const active = localActive(["e2e4", "e7e5"])
  assert.equal(PersistenceModel.semanticValidateActiveGame(active, RulesAdapter).ok, true)

  const pgnMismatch = jsonCopy(active)
  const other = RulesAdapter.create({})
  other.commitMove("d2d4")
  pgnMismatch.pgn = other.pgn()
  const invalidPgn = PersistenceModel.semanticValidateActiveGame(pgnMismatch, RulesAdapter)
  assert.equal(invalidPgn.ok, false)
  assert.ok(invalidPgn.errors.some((error) => error.code === "RULES_STATE_MISMATCH"))

  const missingKey = jsonCopy(active)
  missingKey.position_counts = {}
  const invalidCounts = PersistenceModel.semanticValidateActiveGame(missingKey, RulesAdapter)
  assert.equal(invalidCounts.ok, false)
  assert.ok(invalidCounts.errors.some((error) => error.path === "$.position_counts"))
})

test("semantic validation rejects status/control and running-clock mismatches", () => {
  const active = localActive()
  active.status = "active-computer"
  active.clock = {
    enabled: true,
    white_ms: 60000,
    black_ms: 60000,
    increment_ms: 0,
    running_side: "black",
    last_started_at: STARTED
  }
  active.time_control = { base_ms: 60000, increment_ms: 0 }
  const validation = PersistenceModel.semanticValidateActiveGame(active, RulesAdapter)
  assert.equal(validation.ok, false)
  assert.ok(validation.errors.some((error) => error.code === "CONTROL_MISMATCH"))
  assert.ok(validation.errors.some((error) => error.code === "CLOCK_STATE_MISMATCH"))
})

test("completed records are immutable and keep PGN/result/duration coherent", () => {
  const active = localActive(["e2e4"])
  const record = PersistenceModel.createCompletedRecord(active, {
    score: "1-0",
    reason: "resignation",
    finished_at: FINISHED
  })
  assert.equal(Object.isFrozen(record), true)
  assert.equal(Object.isFrozen(record.moves[0]), true)
  assert.equal(record.duration_ms, 10000)
  assert.equal(record.clock.running_side, null)
  assert.match(record.pgn, /\[Result "1-0"\]/)
  assert.match(record.pgn, /1-0\s*$/)
  assert.equal(PersistenceModel.validateCompletedRecord(record).ok, true)
  assert.equal(PersistenceModel.toPgn(record), record.pgn)
  const restored = RulesAdapter.create({ pgn: record.pgn, pgnOptions: { strict: true } })
  assert.equal(restored.valid, true, restored.error?.detail)
  assert.equal(restored.fen(), record.fen)
})

test("history append is idempotent and conflicting duplicate IDs are rejected", () => {
  const active = localActive(["e2e4"])
  const record = PersistenceModel.createCompletedRecord(active, {
    score: "1-0",
    reason: "resignation",
    finished_at: FINISHED
  })
  const first = PersistenceModel.appendHistorySummary(PersistenceModel.defaultHistory(), record)
  assert.equal(first.ok, true)
  assert.equal(first.appended, true)
  assert.equal(PersistenceModel.validateHistory(first.value).ok, true)

  const retry = PersistenceModel.appendHistorySummary(first.value, record)
  assert.equal(retry.ok, true)
  assert.equal(retry.appended, false)
  assert.equal(retry.idempotent, true)
  assert.equal(retry.value.games.length, 1)

  const changedActive = jsonCopy(active)
  changedActive.players.white.name = "Different Player"
  const conflictingRecord = PersistenceModel.createCompletedRecord(changedActive, {
    score: "1-0",
    reason: "resignation",
    finished_at: FINISHED
  })
  assert.equal(
    PersistenceModel.appendHistorySummary(first.value, conflictingRecord).code,
    "HISTORY_DUPLICATE_CONFLICT"
  )
})

test("history removal is repeat-safe and owned paths reject traversal", () => {
  const active = localActive(["e2e4"])
  const record = PersistenceModel.createCompletedRecord(active, {
    score: "1-0",
    reason: "resignation",
    finished_at: FINISHED
  })
  const history = PersistenceModel.appendHistorySummary(PersistenceModel.defaultHistory(), record).value
  const removed = PersistenceModel.removeHistorySummary(history, record.game_id)
  assert.equal(removed.ok, true)
  assert.equal(removed.removed, true)
  assert.equal(removed.value.games.length, 0)
  assert.equal(PersistenceModel.removeHistorySummary(removed.value, record.game_id).idempotent, true)

  const unsafe = jsonCopy(history)
  unsafe.games[0].record_path = "../game.json"
  const validation = PersistenceModel.validateHistory(unsafe)
  assert.equal(validation.ok, false)
  assert.ok(validation.errors.some((error) => error.code === "UNSAFE_PATH"))
})

test("history preserves sub-second time controls without inferring final remainders", () => {
  const active = localActive(["e2e4"])
  active.time_control = { base_ms: 1500, increment_ms: 250 }
  active.clock = {
    enabled: true,
    white_ms: 1500,
    black_ms: 1500,
    increment_ms: 250,
    running_side: "black",
    last_started_at: MOVED
  }
  assert.equal(PersistenceModel.semanticValidateActiveGame(active, RulesAdapter).ok, true)
  const record = PersistenceModel.createCompletedRecord(active, {
    score: "1-0",
    reason: "resignation",
    finished_at: FINISHED
  })
  const appended = PersistenceModel.appendHistorySummary(PersistenceModel.defaultHistory(), record)
  assert.equal(appended.ok, true)
  assert.equal(appended.value.games[0].time_control, "1.5+0.25")
})
