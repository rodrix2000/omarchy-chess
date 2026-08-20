import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import test from "node:test"
import vm from "node:vm"

const require = createRequire(import.meta.url)
const ClockController = require("../engine/ClockController.js")

function timed(base = 60_000, increment = 0, side = "white", now = 1_000) {
  return ClockController.create({ base_ms: base, increment_ms: increment }, side, now)
}

test("exports the clock API to Node and loads without CommonJS globals", () => {
  assert.deepEqual(Object.keys(ClockController).sort(), [
    "commitMove",
    "create",
    "flaggedSide",
    "pause",
    "remaining",
    "restore",
    "resume",
    "snapshot"
  ])

  const source = readFileSync(new URL("../engine/ClockController.js", import.meta.url), "utf8")
  const qmlContext = {}
  vm.runInNewContext(source, qmlContext, { filename: "ClockController.js" })

  assert.equal(typeof qmlContext.create, "function")
  assert.equal(qmlContext.remaining(qmlContext.create({ base_ms: null }, "white", 0), "white", 10), null)
})

test("untimed clocks are numeric no-ops with fresh immutable returns", () => {
  const clock = ClockController.create({ base_ms: null, increment_ms: 5_000 }, "white", 1_000)
  const before = structuredClone(clock)

  assert.deepEqual(clock, {
    enabled: false,
    white_ms: null,
    black_ms: null,
    increment_ms: 0,
    running_side: null,
    last_started_at_ms: null,
    paused: false,
    pause_reason: null
  })
  assert.equal(ClockController.remaining(clock, "black", 99_000), null)
  assert.deepEqual(ClockController.commitMove(clock, "white", 99_000), clock)
  assert.notEqual(ClockController.snapshot(clock, 99_000), clock)
  assert.deepEqual(clock, before)
})

test("remaining and snapshot calculate exact elapsed time without mutating input", () => {
  const clock = timed(60_000, 0, "white", 1_000)
  const before = structuredClone(clock)

  assert.equal(ClockController.remaining(clock, "white", 2_234), 58_766)
  assert.equal(ClockController.remaining(clock, "black", 50_000), 60_000)
  assert.deepEqual(ClockController.snapshot(clock, 2_234), {
    ...clock,
    white_ms: 58_766,
    last_started_at_ms: 2_234
  })
  assert.deepEqual(clock, before)
})

test("a legal completed move adds increment and starts the opponent", () => {
  const clock = timed(60_000, 2_000, "white", 1_000)
  const committed = ClockController.commitMove(clock, "white", 6_000)

  assert.deepEqual(committed, {
    enabled: true,
    white_ms: 57_000,
    black_ms: 60_000,
    increment_ms: 2_000,
    running_side: "black",
    last_started_at_ms: 6_000,
    paused: false,
    pause_reason: null
  })
  assert.equal(ClockController.remaining(committed, "black", 6_750), 59_250)
  assert.equal(ClockController.remaining(committed, "white", 99_000), 57_000)
})

test("pause materializes time and explicit resume charges only post-resume elapsed", () => {
  const clock = timed(30_000, 0, "black", 10_000)
  const paused = ClockController.pause(clock, "panel-closed", 12_500)

  assert.deepEqual(paused, {
    enabled: true,
    white_ms: 30_000,
    black_ms: 27_500,
    increment_ms: 0,
    running_side: null,
    last_started_at_ms: null,
    paused: true,
    pause_reason: "panel-closed"
  })
  assert.equal(ClockController.remaining(paused, "black", 9_000_000), 27_500)

  const resumed = ClockController.resume(paused, "black", 20_000)
  assert.equal(resumed.running_side, "black")
  assert.equal(resumed.last_started_at_ms, 20_000)
  assert.equal(resumed.paused, false)
  assert.equal(ClockController.remaining(resumed, "black", 21_250), 26_250)
})

test("restore is pause-on-close and never deducts offline elapsed time", () => {
  const saved = ClockController.pause(timed(10_000, 500, "white", 1_000), "closed", 4_000)
  const document = JSON.parse(JSON.stringify(saved))
  const restored = ClockController.restore(document, 8_640_004_000)

  assert.deepEqual(restored, saved)
  assert.notEqual(restored, document)
  assert.equal(ClockController.remaining(restored, "white", 99_999_999_999), 7_000)

  const schemaClock = {
    enabled: true,
    white_ms: 5_000,
    black_ms: 8_000,
    increment_ms: 0,
    running_side: "white",
    last_started_at: "2026-08-20T12:00:00.000Z"
  }
  assert.deepEqual(ClockController.restore({ clock: schemaClock }, Date.UTC(2030, 0, 1)), {
    enabled: true,
    white_ms: 5_000,
    black_ms: 8_000,
    increment_ms: 0,
    running_side: null,
    last_started_at_ms: null,
    paused: true,
    pause_reason: "restored"
  })
})

test("promotion selection time stays on the mover until the move commits", () => {
  const clock = timed(15_000, 1_000, "white", 0)

  // Selecting the destination did not commit the promotion, so no transition.
  assert.equal(ClockController.remaining(clock, "white", 4_000), 11_000)
  assert.equal(clock.running_side, "white")

  const afterChoice = ClockController.commitMove(clock, "white", 6_000)
  assert.equal(afterChoice.white_ms, 10_000)
  assert.equal(afterChoice.running_side, "black")
})

test("a rejected or wrong-side move cannot switch or alter the clock", () => {
  const clock = timed(15_000, 0, "white", 1_000)

  assert.deepEqual(ClockController.commitMove(clock, "black", 8_000), clock)
  assert.deepEqual(clock, timed(15_000, 0, "white", 1_000))
})

test("a backward time jump never adds time or moves the safe anchor backward", () => {
  const clock = timed(10_000, 0, "white", 5_000)
  const snap = ClockController.snapshot(clock, 4_000)
  const committed = ClockController.commitMove(clock, "white", 4_000)

  assert.equal(snap.white_ms, 10_000)
  assert.equal(snap.last_started_at_ms, 5_000)
  assert.equal(committed.white_ms, 10_000)
  assert.equal(committed.running_side, "black")
  assert.equal(committed.last_started_at_ms, 5_000)
  assert.equal(ClockController.remaining(committed, "black", 4_500), 10_000)
})

test("zero is flagged and commit does not grant increment or switch turns", () => {
  const clock = timed(1_000, 5_000, "white", 10_000)

  assert.equal(ClockController.flaggedSide(clock, 10_999), null)
  assert.equal(ClockController.flaggedSide(clock, 11_000), "white")

  const timedOut = ClockController.commitMove(clock, "white", 11_000)
  assert.equal(timedOut.white_ms, 0)
  assert.equal(timedOut.running_side, "white")
  assert.equal(timedOut.last_started_at_ms, 11_000)
  assert.equal(ClockController.flaggedSide(timedOut, 50_000), "white")
})

test("repeated AI-budget reads are frame independent and accept a fake time provider", () => {
  let now = 1_000
  const clock = ClockController.create({ base_ms: 20_000, increment_ms: 0 }, "black", () => now)
  const before = structuredClone(clock)

  now = 1_250
  assert.equal(ClockController.remaining(clock, "black", () => now), 19_750)
  assert.equal(ClockController.remaining(clock, "black", () => now), 19_750)
  now = 2_000
  assert.equal(ClockController.remaining(clock, "black", () => now), 19_000)
  assert.deepEqual(clock, before)
})

test("invalid enabled controls and invalid explicit sides fail at the boundary", () => {
  assert.throws(
    () => ClockController.create({ base_ms: -1, increment_ms: 0 }, "white", 0),
    /base_ms/
  )
  assert.throws(
    () => ClockController.create({ base_ms: 1_000, increment_ms: 0 }, "north", 0),
    /starting side/
  )
  assert.throws(() => ClockController.remaining(timed(), "north", 0), /side/)
  assert.throws(() => ClockController.resume(ClockController.pause(timed(), "test", 2_000), "north", 3_000), /resume side/)
})
