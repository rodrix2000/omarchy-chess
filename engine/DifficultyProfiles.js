/*
 * Release-safe computer-opponent profiles.
 *
 * This stays a QML classic script: top-level functions are visible to QML,
 * while the guarded CommonJS export is used by the Node test harness.
 */

"use strict"

var PROFILE_DEFINITIONS = {
  learner: {
    id: "learner",
    label: "Learner",
    budget_ms: 90,
    max_depth: 2,
    quiescence_depth: 2,
    table_entries: 2500,
    node_limit: 12000,
    centipawn_window: 240,
    safety_floor_cp: 320,
    temperature: 1.2
  },
  casual: {
    id: "casual",
    label: "Casual",
    budget_ms: 275,
    max_depth: 3,
    quiescence_depth: 3,
    table_entries: 10000,
    node_limit: 50000,
    centipawn_window: 110,
    safety_floor_cp: 180,
    temperature: 0.55
  },
  challenging: {
    id: "challenging",
    label: "Challenging",
    budget_ms: 700,
    max_depth: 4,
    quiescence_depth: 4,
    table_entries: 24000,
    node_limit: 180000,
    centipawn_window: 35,
    safety_floor_cp: 80,
    temperature: 0.2
  },
  strong: {
    id: "strong",
    label: "Strong",
    budget_ms: 1600,
    max_depth: 6,
    quiescence_depth: 5,
    table_entries: 50000,
    node_limit: 500000,
    centipawn_window: 8,
    safety_floor_cp: 24,
    temperature: 0
  }
}

var PROFILE_LIMITS = {
  budget_ms: { min: 10, max: 5000 },
  max_depth: { min: 1, max: 8 },
  quiescence_depth: { min: 0, max: 8 },
  table_entries: { min: 0, max: 100000 },
  node_limit: { min: 100, max: 750000 },
  centipawn_window: { min: 0, max: 600 },
  safety_floor_cp: { min: 0, max: 800 },
  temperature: { min: 0, max: 2 }
}

function profileClone(profile) {
  var output = {}
  var key

  for (key in profile) {
    if (Object.prototype.hasOwnProperty.call(profile, key))
      output[key] = profile[key]
  }
  return output
}

function finiteProfileNumber(value) {
  return typeof value === "number" && isFinite(value)
}

function clampProfileNumber(value, fallback, limit, integer) {
  var number = finiteProfileNumber(value) ? value : fallback

  number = Math.max(limit.min, Math.min(limit.max, number))
  return integer ? Math.floor(number) : number
}

function profileId(input) {
  if (typeof input === "string")
    return input.toLowerCase()
  if (input && typeof input.id === "string")
    return input.id.toLowerCase()
  return ""
}

function isKnownProfile(input) {
  return Object.prototype.hasOwnProperty.call(PROFILE_DEFINITIONS, profileId(input))
}

function resolveProfile(input) {
  var requested = input && typeof input === "object" ? input : {}
  var id = profileId(input)
  var base
  var resolved

  if (!isKnownProfile(id))
    return null

  base = PROFILE_DEFINITIONS[id]
  resolved = profileClone(base)
  resolved.budget_ms = clampProfileNumber(
    requested.budget_ms,
    base.budget_ms,
    PROFILE_LIMITS.budget_ms,
    true
  )
  resolved.max_depth = clampProfileNumber(
    requested.max_depth,
    base.max_depth,
    PROFILE_LIMITS.max_depth,
    true
  )
  resolved.quiescence_depth = clampProfileNumber(
    requested.quiescence_depth,
    base.quiescence_depth,
    PROFILE_LIMITS.quiescence_depth,
    true
  )
  resolved.table_entries = clampProfileNumber(
    requested.table_entries,
    base.table_entries,
    PROFILE_LIMITS.table_entries,
    true
  )
  resolved.node_limit = clampProfileNumber(
    requested.node_limit,
    base.node_limit,
    PROFILE_LIMITS.node_limit,
    true
  )
  resolved.centipawn_window = clampProfileNumber(
    requested.centipawn_window,
    base.centipawn_window,
    PROFILE_LIMITS.centipawn_window,
    true
  )
  resolved.safety_floor_cp = clampProfileNumber(
    requested.safety_floor_cp,
    base.safety_floor_cp,
    PROFILE_LIMITS.safety_floor_cp,
    true
  )
  resolved.temperature = clampProfileNumber(
    requested.temperature,
    base.temperature,
    PROFILE_LIMITS.temperature,
    false
  )
  return resolved
}

function clockAwareBudget(profileInput, remainingMs, incrementMs) {
  var profile = resolveProfile(profileInput)
  var remaining = finiteProfileNumber(remainingMs) ? Math.max(0, remainingMs) : null
  var increment = finiteProfileNumber(incrementMs) ? Math.max(0, incrementMs) : 0
  var clockBudget

  if (!profile)
    return null
  if (remaining === null)
    return profile.budget_ms

  clockBudget = Math.max(30, remaining / 30 + increment * 0.5)
  return Math.max(10, Math.floor(Math.min(profile.budget_ms, clockBudget)))
}

function namedProfiles() {
  return [
    profileClone(PROFILE_DEFINITIONS.learner),
    profileClone(PROFILE_DEFINITIONS.casual),
    profileClone(PROFILE_DEFINITIONS.challenging),
    profileClone(PROFILE_DEFINITIONS.strong)
  ]
}

var DifficultyProfiles = {
  resolve: resolveProfile,
  isKnown: isKnownProfile,
  clockAwareBudget: clockAwareBudget,
  named: namedProfiles,
  limits: profileClone(PROFILE_LIMITS)
}

if (typeof module !== "undefined" && module.exports)
  module.exports = DifficultyProfiles
