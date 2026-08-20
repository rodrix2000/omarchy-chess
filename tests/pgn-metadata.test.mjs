import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import test from "node:test"
import vm from "node:vm"

const require = createRequire(import.meta.url)
const PgnMetadata = require("../engine/PgnMetadata.js")
const RulesAdapter = require("../engine/RulesAdapter.js")
const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"

test("exports the PGN metadata API and loads as a QML classic script", () => {
  assert.deepEqual(Object.keys(PgnMetadata).sort(), [
    "buildHeaders",
    "sanitizeTagValue",
    "terminationTag",
    "timeControlTag"
  ])

  const source = readFileSync(new URL("../engine/PgnMetadata.js", import.meta.url), "utf8")
  const qmlContext = {}
  vm.runInNewContext(source, qmlContext, { filename: "PgnMetadata.js" })

  assert.equal(typeof qmlContext.buildHeaders, "function")
  assert.equal(qmlContext.timeControlTag({ base_ms: 600_000, increment_ms: 0 }), "600+0")
})

test("tag values remove PGN injection characters, control characters, and excess length", () => {
  assert.equal(
    PgnMetadata.sanitizeTagValue("  Rudy\\Name\n[Result \"0-1\"]  "),
    "Rudy/Name [Result '0-1']"
  )
  assert.equal(PgnMetadata.sanitizeTagValue("abcdef", 4), "abcd")
  assert.equal(PgnMetadata.sanitizeTagValue(null), "")
})

test("buildHeaders creates the seven-tag roster and completed app metadata", () => {
  const game = {
    mode: "computer",
    created_at: "2026-08-20T23:59:58.000Z",
    players: {
      white: { kind: "human", name: "Rudy" },
      black: { kind: "computer", name: "Omarchy Chess — Casual" }
    },
    difficulty: "casual",
    time_control: { base_ms: 600_000, increment_ms: 2_000 },
    plugin_version: "1.0.0",
    result: { score: "1-0", reason: "checkmate", winner: "white" }
  }
  const before = structuredClone(game)
  const headers = PgnMetadata.buildHeaders(game)

  assert.deepEqual(headers, {
    Event: "Omarchy Chess",
    Site: "Local",
    Date: "2026.08.20",
    Round: "-",
    White: "Rudy",
    Black: "Omarchy Chess — Casual",
    Result: "1-0",
    Mode: "Computer",
    TimeControl: "600+2",
    ComputerLevel: "Casual",
    Termination: "checkmate",
    PluginVersion: "1.0.0"
  })
  assert.deepEqual(game, before)
  assert.deepEqual(Object.keys(headers).slice(0, 7), [
    "Event", "Site", "Date", "Round", "White", "Black", "Result"
  ])
})

test("active export always uses star and omits termination", () => {
  const headers = PgnMetadata.buildHeaders({
    mode: "local",
    created_at: "2026-01-02T12:00:00Z",
    players: { white: "Alice", black: "Bob" },
    time_control: { base_ms: null, increment_ms: 0 },
    result: null
  })

  assert.equal(headers.Result, "*")
  assert.equal(headers.Mode, "Local")
  assert.equal(headers.TimeControl, "-")
  assert.equal("Termination" in headers, false)
})

test("active option cannot accidentally publish a supplied terminal result", () => {
  const headers = PgnMetadata.buildHeaders({
    result: { score: "0-1", reason: "resignation" }
  }, { active: true, date: "2025-12-31" })

  assert.equal(headers.Result, "*")
  assert.equal("Termination" in headers, false)
})

test("time-control tags use PGN seconds and never expose milliseconds", () => {
  assert.equal(PgnMetadata.timeControlTag({ base_ms: 300_000, increment_ms: 5_000 }), "300+5")
  assert.equal(PgnMetadata.timeControlTag({ enabled: true, initial_ms: 90_000, increment_ms: 1_000 }), "90+1")
  assert.equal(PgnMetadata.timeControlTag({ enabled: true, white_ms: 45_000, black_ms: 45_000, increment_ms: 0 }), "45+0")
  assert.equal(PgnMetadata.timeControlTag({ enabled: false, white_ms: null, black_ms: null }), "-")
  assert.equal(PgnMetadata.timeControlTag({ base_ms: null, increment_ms: 5_000 }), "-")
})

test("termination reasons map to stable portable descriptions", () => {
  const expected = new Map([
    ["checkmate", "checkmate"],
    ["dead-position", "dead position"],
    ["fivefold-automatic", "fivefold repetition"],
    ["seventy-five-move-automatic", "seventy-five-move rule"],
    ["threefold-claim", "threefold repetition claim"],
    ["fifty-move-claim", "fifty-move rule claim"],
    ["draw-agreement", "draw agreement"],
    ["timeout", "time forfeit"],
    ["resignation", "resignation"]
  ])

  for (const [reason, tag] of expected)
    assert.equal(PgnMetadata.terminationTag({ reason }), tag)
  assert.equal(PgnMetadata.terminationTag({ reason: "custom-safe-reason" }), "custom-safe-reason")
  assert.equal(PgnMetadata.terminationTag(null), "")
})

test("custom starting positions get SetUp and FEN while orthodox starts do not", () => {
  const custom = "8/8/8/8/8/8/2k5/K7 w - - 0 1"
  const customHeaders = PgnMetadata.buildHeaders({
    created_at: "2026-08-20",
    initial_fen: custom
  })
  const normalHeaders = PgnMetadata.buildHeaders({
    created_at: "2026-08-20",
    initial_fen: START_FEN
  })

  assert.equal(customHeaders.SetUp, "1")
  assert.equal(customHeaders.FEN, custom)
  assert.equal("SetUp" in normalHeaders, false)
  assert.equal("FEN" in normalHeaders, false)
})

test("unsafe player names are bounded to the persisted player-name limit", () => {
  const name = `  ${"x".repeat(90)}\n\"spoof\"  `
  const headers = PgnMetadata.buildHeaders({
    players: { white: { name }, black: { name: "\\Backslash" } }
  }, { date: "2026.08.20" })

  assert.equal(headers.White.length, 80)
  assert.doesNotMatch(headers.White, /[\n"\\]/)
  assert.equal(headers.Black, "/Backslash")
})

test("generated headers pass safely through the rules authority PGN writer", () => {
  const adapter = RulesAdapter.create()
  const headers = PgnMetadata.buildHeaders({
    created_at: "2026-08-20T10:00:00Z",
    players: {
      white: { name: "Alice\n[Result \"0-1\"]" },
      black: { name: "Bob\\Builder" }
    },
    result: { score: "1-0", reason: "resignation" }
  })

  for (const [key, value] of Object.entries(headers))
    assert.equal(adapter.setHeader(key, value).ok, true)
  const pgn = adapter.pgn()

  assert.match(pgn, /\[White "Alice \[Result '0-1'\]"\]/)
  assert.match(pgn, /\[Black "Bob\/Builder"\]/)
  assert.match(pgn, /\[Result "1-0"\]/)
  assert.doesNotMatch(pgn, /\n\[Result '0-1'/)
})

test("missing dates use the PGN unknown-date convention deterministically", () => {
  assert.equal(PgnMetadata.buildHeaders({}).Date, "????.??.??")
  assert.equal(PgnMetadata.buildHeaders({}, { date: new Date(Date.UTC(2024, 1, 29)) }).Date, "2024.02.29")
})
