/*
 * Pure timestamp-based chess clock calculations shared by QML and Node.
 *
 * This is intentionally a classic script. QML imports the top-level
 * functions, while Node tests use the guarded CommonJS export at the end.
 */

"use strict"

function clockSide(side) {
  return side === "white" || side === "black" ? side : null
}

function oppositeClockSide(side) {
  return side === "white" ? "black" : "white"
}

function nonnegativeInteger(value, fallback) {
  var number = Number(value)

  if (!isFinite(number) || number < 0)
    return fallback
  return Math.floor(number)
}

function clockNow(now, fallback) {
  var value = typeof now === "function" ? now() : now
  var number = Number(value)

  if (!isFinite(number))
    return fallback === undefined ? 0 : fallback
  return number
}

function storedStart(clock) {
  var value
  var parsed

  if (!clock || typeof clock !== "object")
    return null

  value = clock.last_started_at_ms
  if (value === undefined)
    value = clock.last_started_at
  if (value === null || value === undefined || value === "")
    return null

  if (typeof value === "string" && !/^[-+]?\d+(\.\d+)?$/.test(value)) {
    parsed = Date.parse(value)
    return isFinite(parsed) ? parsed : null
  }

  value = Number(value)
  return isFinite(value) ? value : null
}

function copyClock(clock) {
  var source = clock || {}
  var enabled = source.enabled === true
  var runningSide = clockSide(source.running_side)
  var paused = source.paused === true
  var white = enabled ? nonnegativeInteger(source.white_ms, 0) : null
  var black = enabled ? nonnegativeInteger(source.black_ms, 0) : null

  if (paused)
    runningSide = null

  return {
    enabled: enabled,
    white_ms: white,
    black_ms: black,
    increment_ms: enabled ? nonnegativeInteger(source.increment_ms, 0) : 0,
    running_side: enabled ? runningSide : null,
    last_started_at_ms: enabled && runningSide ? storedStart(source) : null,
    paused: enabled ? paused : false,
    pause_reason: enabled && paused && source.pause_reason !== undefined &&
      source.pause_reason !== null ? String(source.pause_reason) : null
  }
}

function create(timeControl, startingSide, now) {
  var control = timeControl || {}
  var base = control.base_ms
  var enabled = control.enabled === true || (base !== null && base !== undefined)
  var side = clockSide(startingSide)
  var start

  if (!enabled) {
    return copyClock({
      enabled: false,
      increment_ms: 0
    })
  }

  base = nonnegativeInteger(base, null)
  if (base === null)
    throw new Error("ClockController: base_ms must be a nonnegative number or null")
  if (!side)
    throw new Error("ClockController: starting side must be white or black")

  start = clockNow(now)
  return {
    enabled: true,
    white_ms: base,
    black_ms: base,
    increment_ms: nonnegativeInteger(control.increment_ms, 0),
    running_side: side,
    last_started_at_ms: start,
    paused: false,
    pause_reason: null
  }
}

function remaining(clock, side, now) {
  var state = copyClock(clock)
  var requestedSide = clockSide(side)
  var stored
  var start
  var current
  var elapsed

  if (!requestedSide)
    throw new Error("ClockController: side must be white or black")
  if (!state.enabled)
    return null

  stored = requestedSide === "white" ? state.white_ms : state.black_ms
  if (state.paused || state.running_side !== requestedSide)
    return stored

  start = state.last_started_at_ms
  if (start === null)
    return stored

  current = clockNow(now, start)
  elapsed = Math.max(0, current - start)
  return Math.max(0, Math.floor(stored - elapsed))
}

function snapshot(clock, now) {
  var state = copyClock(clock)
  var side = state.running_side
  var start
  var current

  if (!state.enabled || state.paused || !side)
    return state

  start = state.last_started_at_ms
  current = clockNow(now, start === null ? 0 : start)
  if (start !== null && current < start)
    current = start

  if (side === "white")
    state.white_ms = remaining(state, "white", current)
  else
    state.black_ms = remaining(state, "black", current)

  state.last_started_at_ms = current
  return state
}

function commitMove(clock, movingSide, now) {
  var state = copyClock(clock)
  var side = clockSide(movingSide)
  var moverRemaining

  // Untimed clocks and non-running/wrong-side commits are deliberate no-ops.
  // Move legality is decided by the rules authority before this is called.
  if (!state.enabled || !side || state.paused || state.running_side !== side)
    return state

  state = snapshot(state, now)
  moverRemaining = side === "white" ? state.white_ms : state.black_ms

  // At the zero boundary the mover has flagged: do not add increment or start
  // the opponent's clock. flaggedSide() exposes the timeout to the controller.
  if (moverRemaining <= 0)
    return state

  if (side === "white")
    state.white_ms += state.increment_ms
  else
    state.black_ms += state.increment_ms

  state.running_side = oppositeClockSide(side)
  // snapshot() already chose a safe anchor for backward clock jumps.
  return state
}

function pause(clock, reason, now) {
  var state = snapshot(clock, now)

  if (!state.enabled)
    return state

  state.running_side = null
  state.last_started_at_ms = null
  state.paused = true
  state.pause_reason = reason === undefined || reason === null ? null : String(reason)
  return state
}

function resume(clock, side, now) {
  var state = copyClock(clock)
  var runningSide = clockSide(side)

  if (!state.enabled)
    return state
  if (!runningSide)
    throw new Error("ClockController: resume side must be white or black")
  if (!state.paused && state.running_side)
    return state

  state.running_side = runningSide
  state.last_started_at_ms = clockNow(now)
  state.paused = false
  state.pause_reason = null
  return state
}

function flaggedSide(clock, now) {
  var state = copyClock(clock)
  var side = state.running_side

  if (!state.enabled || state.paused || !side)
    return null
  return remaining(state, side, now) <= 0 ? side : null
}

/*
 * Persisted games are restored paused. V1 intentionally does not charge time
 * while the plugin is closed; the controller explicitly resumes the current
 * game turn. Both a clock document and an active-game document are accepted.
 */
function restore(document, now) {
  var source = document && document.clock ? document.clock : document
  var state = copyClock(source)
  var reason

  // Touch the injected value to catch a broken time provider at the boundary,
  // without deducting any offline elapsed time.
  clockNow(now)

  if (!state.enabled)
    return state

  reason = source && source.pause_reason
  state.running_side = null
  state.last_started_at_ms = null
  state.paused = true
  state.pause_reason = reason === undefined || reason === null ? "restored" : String(reason)
  return state
}

var ClockController = {
  create: create,
  remaining: remaining,
  snapshot: snapshot,
  commitMove: commitMove,
  pause: pause,
  resume: resume,
  flaggedSide: flaggedSide,
  restore: restore
}

if (typeof module !== "undefined" && module.exports)
  module.exports = ClockController
