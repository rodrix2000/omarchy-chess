/*
 * Bounded deterministic chess search for the offline computer opponent.
 *
 * The caller supplies only a FEN/protocol payload. Search always owns a fresh
 * RulesAdapter-compatible position, mutates it with commitMove()/undo(), and
 * never mutates the controller's authoritative position.
 */

"use strict"

var configuredRulesAdapter = null
var configuredEvaluation = null
var configuredProfiles = null
var configuredPositionKey = null

var SEARCH_MATE = 1000000
var SEARCH_INFINITY = 1100000
var SEARCH_PROTOCOL_VERSION = 1

function configureDependencies(rulesAdapter, evaluation, profiles, positionKey) {
  if (!rulesAdapter || typeof rulesAdapter.create !== "function")
    throw new Error("SearchEngine: invalid RulesAdapter dependency")
  if (!evaluation || typeof evaluation.evaluate !== "function")
    throw new Error("SearchEngine: invalid Evaluation dependency")
  if (!profiles || typeof profiles.resolve !== "function")
    throw new Error("SearchEngine: invalid DifficultyProfiles dependency")
  if (!positionKey || typeof positionKey.fromRules !== "function")
    throw new Error("SearchEngine: invalid PositionKey dependency")

  configuredRulesAdapter = rulesAdapter
  configuredEvaluation = evaluation
  configuredProfiles = profiles
  configuredPositionKey = positionKey
  return true
}

function searchDependencies() {
  if (!configuredRulesAdapter || !configuredEvaluation ||
      !configuredProfiles || !configuredPositionKey)
    throw new Error("SearchEngine: dependencies have not been configured")
  return {
    rules: configuredRulesAdapter,
    evaluation: configuredEvaluation,
    profiles: configuredProfiles,
    positionKey: configuredPositionKey
  }
}

function searchError(code, message) {
  return {
    ok: false,
    code: code,
    message: String(message || "Computer search failed.")
  }
}

function searchFiniteNumber(value) {
  return typeof value === "number" && isFinite(value)
}

function searchCloneCounts(value) {
  var output = {}
  var keys
  var index

  if (!value || typeof value !== "object" || Array.isArray(value))
    return output
  keys = Object.keys(value)
  for (index = 0; index < keys.length && index < 2048; index += 1) {
    var count = Number(value[keys[index]])
    if (isFinite(count) && count > 0)
      output[keys[index]] = Math.min(5, Math.floor(count))
  }
  return output
}

function searchSeededRandom(seed) {
  var state = Number(seed)

  if (!isFinite(state))
    state = 0x6d2b79f5
  state = state >>> 0
  if (state === 0)
    state = 0x6d2b79f5

  return function () {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    state = state >>> 0
    return state / 4294967296
  }
}

function searchNow(runtime) {
  return runtime && typeof runtime.now === "function"
    ? runtime.now
    : function () { return Date.now() }
}

function searchCancelled(runtime, token) {
  if (!runtime)
    return false
  if (typeof runtime.is_cancelled === "function")
    return runtime.is_cancelled(token) === true
  if (typeof runtime.isCancelled === "function")
    return runtime.isCancelled(token) === true
  return false
}

function searchAbort(reason) {
  return { search_abort: true, reason: reason }
}

function searchIsAbort(value) {
  return value && value.search_abort === true
}

function searchUci(move) {
  if (typeof move === "string")
    return move
  return move && typeof move.uci === "string" ? move.uci : ""
}

function searchPieceValue(piece) {
  var values = configuredEvaluation && configuredEvaluation.values
  return values && searchFiniteNumber(values[piece]) ? values[piece] : 0
}

function searchMoveOrderScore(move, ttMove, context, ply) {
  var uci = searchUci(move)
  var score = 0
  var san = String(move && move.san || "")
  var flags = move && Array.isArray(move.flags) ? move.flags : []
  var killer = context.killers[ply] || []

  if (uci === ttMove)
    score += 10000000
  if (/#$/.test(san))
    score += 9000000
  if (move && move.promotion)
    score += 8000000 + searchPieceValue(move.promotion)
  if (move && (move.captured || flags.indexOf("en-passant") !== -1))
    score += 5000000 + searchPieceValue(move.captured || "pawn") * 10 -
      searchPieceValue(move.piece)
  if (/\+$/.test(san))
    score += 2000000
  if (killer.indexOf(uci) !== -1)
    score += 1000000 - killer.indexOf(uci)
  score += context.history[uci] || 0
  return score
}

function searchOrderMoves(moves, ttMove, context, ply) {
  var ordered = moves.slice()

  ordered.sort(function (left, right) {
    var difference = searchMoveOrderScore(right, ttMove, context, ply) -
      searchMoveOrderScore(left, ttMove, context, ply)
    if (difference !== 0)
      return difference
    return searchUci(left) < searchUci(right) ? -1 :
      (searchUci(left) > searchUci(right) ? 1 : 0)
  })
  return ordered
}

function searchIsTactical(move) {
  var flags = move && Array.isArray(move.flags) ? move.flags : []

  return Boolean(move && (move.captured || move.promotion ||
    flags.indexOf("en-passant") !== -1))
}

function searchFenHalfmove(position) {
  var fields = position.fen().trim().split(/\s+/)
  var count = Number(fields[4])

  return isFinite(count) && count >= 0 ? count : 0
}

function searchPositionKey(position, context) {
  try {
    return context.dependencies.positionKey.fromRules(position)
  } catch (error) {
    return position.fen().trim().split(/\s+/).slice(0, 4).join(" ")
  }
}

function searchPositionCount(position, context) {
  var key = searchPositionKey(position, context)
  return context.position_counts[key] || 0
}

function searchPushPosition(position, context) {
  var key = searchPositionKey(position, context)
  context.position_counts[key] = (context.position_counts[key] || 0) + 1
  return key
}

function searchPopPosition(key, context) {
  var count = context.position_counts[key] || 0
  if (count <= 1)
    delete context.position_counts[key]
  else
    context.position_counts[key] = count - 1
}

/*
 * The V1 computer deterministically takes an available threefold/fifty-move
 * claim. This avoids search pretending a claimable position must continue;
 * the controller remains responsible for recording the actual claim result.
 */
function searchTerminalScore(position, ply, context, legalMoves) {
  if (legalMoves && legalMoves.length === 0)
    return { terminal: true, score: position.isCheck() ? -SEARCH_MATE + ply : 0 }
  if (position.isDeadPositionCandidate())
    return { terminal: true, score: 0 }
  if (searchFenHalfmove(position) >= 100)
    return { terminal: true, score: 0 }
  if (searchPositionCount(position, context) >= 3)
    return { terminal: true, score: 0 }
  return { terminal: false, score: 0 }
}

function searchCheckBudget(context, force) {
  context.nodes += 1
  if (context.nodes >= context.profile.node_limit)
    throw searchAbort("node_limit")
  if (searchCancelled(context.runtime, context.token))
    throw searchAbort("cancelled")
  if (!context.ignore_deadline &&
      (force || context.nodes % context.check_interval === 0)) {
    if (context.now() >= context.deadline_ms)
      throw searchAbort("deadline")
  }
}

function searchTableKey(position, context) {
  return position.fen() + "|r" + searchPositionCount(position, context)
}

function searchTableLookup(context, key) {
  return context.table["$" + key] || null
}

function searchTableStore(context, key, entry) {
  var storageKey
  var existing
  var evicted

  if (context.profile.table_entries <= 0)
    return
  storageKey = "$" + key
  existing = context.table[storageKey]
  if (existing && existing.depth > entry.depth && existing.age === context.age)
    return

  if (!existing && context.table_count >= context.profile.table_entries) {
    evicted = context.table_order.shift()
    if (evicted !== undefined && context.table[evicted]) {
      delete context.table[evicted]
      context.table_count -= 1
    }
  }
  if (!existing) {
    context.table_order.push(storageKey)
    context.table_count += 1
  }
  context.table[storageKey] = entry
}

function searchRecordCutoff(move, depth, ply, context) {
  var uci = searchUci(move)
  var killers

  if (move && (move.captured || move.promotion))
    return
  killers = context.killers[ply] || []
  if (killers[0] !== uci) {
    killers.unshift(uci)
    if (killers.length > 2)
      killers.pop()
    context.killers[ply] = killers
  }
  context.history[uci] = Math.min(100000, (context.history[uci] || 0) + depth * depth)
}

function quiescence(position, alpha, beta, ply, context, qply) {
  var terminal
  var standPat
  var legal
  var moves
  var index
  var inCheck

  searchCheckBudget(context, false)
  legal = position.legalMoves({ verbose: true })
  terminal = searchTerminalScore(position, ply, context, legal)
  if (terminal.terminal)
    return { score: terminal.score, pv: [] }

  inCheck = position.isCheck()
  standPat = context.dependencies.evaluation.evaluate(position)
  if (qply >= context.profile.quiescence_depth)
    return { score: standPat, pv: [] }

  if (!inCheck) {
    if (standPat >= beta)
      return { score: standPat, pv: [] }
    if (standPat > alpha)
      alpha = standPat
  }

  moves = []
  for (index = 0; index < legal.length; index += 1) {
    if (inCheck || searchIsTactical(legal[index]))
      moves.push(legal[index])
  }
  moves = searchOrderMoves(moves, "", context, ply)

  for (index = 0; index < moves.length; index += 1) {
    var committed = position.commitMove(moves[index].uci)
    var repetitionKey
    var child
    var score

    if (!committed || committed.ok !== true)
      continue
    repetitionKey = searchPushPosition(position, context)
    try {
      child = quiescence(position, -beta, -alpha, ply + 1, context, qply + 1)
      score = -child.score
    } finally {
      searchPopPosition(repetitionKey, context)
      position.undo()
    }
    if (score >= beta)
      return { score: score, pv: [moves[index].uci].concat(child.pv) }
    if (score > alpha)
      alpha = score
  }
  return { score: alpha, pv: [] }
}

function negamax(position, depth, alpha, beta, ply, context) {
  var terminal
  var key
  var tableEntry
  var originalAlpha = alpha
  var moves
  var bestScore = -SEARCH_INFINITY
  var bestMove = ""
  var bestPv = []
  var index
  var legal

  searchCheckBudget(context, false)
  if (depth <= 0)
    return quiescence(position, alpha, beta, ply, context, 0)
  legal = position.legalMoves({ verbose: true })
  terminal = searchTerminalScore(position, ply, context, legal)
  if (terminal.terminal)
    return { score: terminal.score, pv: [] }

  key = searchTableKey(position, context)
  tableEntry = searchTableLookup(context, key)
  if (tableEntry && tableEntry.depth >= depth) {
    if (tableEntry.flag === "exact")
      return { score: tableEntry.score, pv: tableEntry.best_move ? [tableEntry.best_move] : [] }
    if (tableEntry.flag === "lower" && tableEntry.score > alpha)
      alpha = tableEntry.score
    else if (tableEntry.flag === "upper" && tableEntry.score < beta)
      beta = tableEntry.score
    if (alpha >= beta)
      return { score: tableEntry.score, pv: tableEntry.best_move ? [tableEntry.best_move] : [] }
  }

  moves = searchOrderMoves(
    legal,
    tableEntry ? tableEntry.best_move : "",
    context,
    ply
  )
  if (moves.length === 0)
    return { score: position.isCheck() ? -SEARCH_MATE + ply : 0, pv: [] }

  for (index = 0; index < moves.length; index += 1) {
    var committed = position.commitMove(moves[index].uci)
    var repetitionKey
    var child
    var score

    if (!committed || committed.ok !== true)
      continue
    repetitionKey = searchPushPosition(position, context)
    try {
      child = negamax(position, depth - 1, -beta, -alpha, ply + 1, context)
      score = -child.score
    } finally {
      searchPopPosition(repetitionKey, context)
      position.undo()
    }

    if (score > bestScore) {
      bestScore = score
      bestMove = moves[index].uci
      bestPv = [bestMove].concat(child.pv)
    }
    if (score > alpha)
      alpha = score
    if (alpha >= beta) {
      searchRecordCutoff(moves[index], depth, ply, context)
      break
    }
  }

  searchTableStore(context, key, {
    depth: depth,
    score: bestScore,
    flag: bestScore <= originalAlpha ? "upper" : (bestScore >= beta ? "lower" : "exact"),
    best_move: bestMove,
    age: context.age
  })
  return { score: bestScore, pv: bestPv }
}

function searchRoot(position, rootMoves, depth, context) {
  var candidates = []
  var ordered = searchOrderMoves(rootMoves, context.previous_best, context, 0)
  var bestOnly = context.profile.temperature <= 0
  var rootAlpha = -SEARCH_INFINITY
  var index

  /* Deterministic Strong play only needs the exact best move. Carrying root
   * alpha lets later branches cut off; exact candidates win score ties so a
   * bounded fail-low result can never displace the proven best move. */

  for (index = 0; index < ordered.length; index += 1) {
    var committed
    var repetitionKey
    var child
    var score
    var exact = !bestOnly || index === 0

    searchCheckBudget(context, true)
    committed = position.commitMove(ordered[index].uci)
    if (!committed || committed.ok !== true)
      continue
    repetitionKey = searchPushPosition(position, context)
    try {
      child = negamax(position, depth - 1, -SEARCH_INFINITY,
        bestOnly ? -rootAlpha : SEARCH_INFINITY, 1, context)
    } finally {
      searchPopPosition(repetitionKey, context)
      position.undo()
    }
    score = -child.score
    if (bestOnly && score > rootAlpha) {
      rootAlpha = score
      exact = true
    }
    candidates.push({
      uci: ordered[index].uci,
      score: score,
      pv: [ordered[index].uci].concat(child.pv),
      exact: exact
    })
  }

  candidates.sort(function (left, right) {
    if (right.score !== left.score)
      return right.score - left.score
    if (left.exact !== right.exact)
      return left.exact ? -1 : 1
    return left.uci < right.uci ? -1 : (left.uci > right.uci ? 1 : 0)
  })
  return candidates
}

function searchChooseCandidate(candidates, profile, random) {
  var best
  var floor
  var window
  var eligible = []
  var index
  var total = 0
  var target

  if (!candidates || candidates.length === 0)
    return null
  best = candidates[0].score
  floor = best - Math.min(profile.centipawn_window, profile.safety_floor_cp)
  for (index = 0; index < candidates.length; index += 1) {
    if (candidates[index].score >= floor)
      eligible.push(candidates[index])
  }
  if (eligible.length === 0)
    eligible.push(candidates[0])
  if (profile.temperature <= 0)
    return eligible[0]

  window = Math.max(1, profile.temperature * 100)
  for (index = 0; index < eligible.length; index += 1) {
    eligible[index].weight = Math.exp((eligible[index].score - best) / window)
    total += eligible[index].weight
  }
  target = Math.max(0, Math.min(0.999999999, random())) * total
  for (index = 0; index < eligible.length; index += 1) {
    target -= eligible[index].weight
    if (target <= 0)
      return eligible[index]
  }
  return eligible[eligible.length - 1]
}

function iterativeDeepening(position, context) {
  var rootMoves = searchOrderMoves(position.legalMoves({ verbose: true }), "", context, 0)
  var fallback = rootMoves.length > 0 ? {
    uci: rootMoves[0].uci,
    score: 0,
    pv: [rootMoves[0].uci]
  } : null
  var completedCandidates = null
  var completedDepth = 0
  var limitedBy = "depth"
  var depth
  var mateCandidates = []
  var rootIndex

  for (rootIndex = 0; rootIndex < rootMoves.length; rootIndex += 1) {
    if (/#$/.test(String(rootMoves[rootIndex].san || ""))) {
      mateCandidates.push({
        uci: rootMoves[rootIndex].uci,
        score: SEARCH_MATE - 1,
        pv: [rootMoves[rootIndex].uci]
      })
    }
  }
  if (mateCandidates.length > 0) {
    mateCandidates.sort(function (left, right) {
      return left.uci < right.uci ? -1 : (left.uci > right.uci ? 1 : 0)
    })
    return {
      candidate: searchChooseCandidate(mateCandidates, context.profile, context.random),
      depth: 1,
      limited_by: "mate",
      candidates: mateCandidates
    }
  }

  for (depth = 1; depth <= context.profile.max_depth; depth += 1) {
    var candidates

    /* Normal untimed profiles get one complete root pass. Without it a busy
     * position can exhaust the budget on the first ordered capture and make
     * every difficulty return the same fallback. Clock-emergency budgets stay
     * hard-bounded because they do not enable this minimum. */
    context.ignore_deadline = context.guarantee_first_depth && depth === 1
    try {
      searchCheckBudget(context, true)
      candidates = searchRoot(position, rootMoves, depth, context)
    } catch (error) {
      context.ignore_deadline = false
      if (!searchIsAbort(error))
        throw error
      if (error.reason === "cancelled")
        throw error
      limitedBy = error.reason
      break
    }
    context.ignore_deadline = false
    if (candidates.length > 0) {
      completedCandidates = candidates
      completedDepth = depth
      context.previous_best = candidates[0].uci
      rootMoves.sort(function (left, right) {
        var leftIndex = -1
        var rightIndex = -1
        var candidateIndex
        for (candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
          if (candidates[candidateIndex].uci === left.uci)
            leftIndex = candidateIndex
          if (candidates[candidateIndex].uci === right.uci)
            rightIndex = candidateIndex
        }
        return leftIndex - rightIndex
      })
      if (candidates[0].score >= SEARCH_MATE - depth)
        break
    }
  }

  return {
    candidate: completedCandidates
      ? searchChooseCandidate(completedCandidates, context.profile, context.random)
      : fallback,
    depth: completedDepth,
    limited_by: limitedBy,
    candidates: completedCandidates || (fallback ? [fallback] : [])
  }
}

function searchCreatePosition(fen, runtime, dependencies) {
  var position

  if (runtime && runtime.position) {
    if (typeof runtime.position.clone !== "function")
      return null
    position = runtime.position.clone()
  } else if (runtime && typeof runtime.create_position === "function") {
    position = runtime.create_position(fen)
  } else if (runtime && typeof runtime.createPosition === "function") {
    position = runtime.createPosition(fen)
  } else {
    position = dependencies.rules.create({ fen: fen })
  }
  if (!position || position.valid === false || typeof position.fen !== "function")
    return null
  return position
}

function search(request, runtime) {
  var input = request || {}
  var environment = runtime || {}
  var dependencies
  var profile
  var budget
  var position
  var now
  var started
  var context
  var deepening
  var duration
  var sourceFen

  try {
    dependencies = searchDependencies()
  } catch (error) {
    return searchError("AI_NOT_CONFIGURED", error.message)
  }
  profile = dependencies.profiles.resolve(input.profile)
  if (!profile)
    return searchError("AI_UNKNOWN_PROFILE", "Unknown computer difficulty profile.")
  if (typeof input.source_fen !== "string" && typeof input.fen !== "string")
    return searchError("AI_INVALID_FEN", "A source FEN is required.")
  sourceFen = typeof input.source_fen === "string" ? input.source_fen : input.fen
  if (sourceFen.length > 512)
    return searchError("AI_INVALID_FEN", "Source FEN exceeds 512 bytes.")

  if (searchFiniteNumber(input.budget_ms))
    profile.budget_ms = Math.max(1, Math.min(5000, Math.floor(input.budget_ms)))
  budget = profile.budget_ms
  position = searchCreatePosition(sourceFen, environment, dependencies)
  if (!position)
    return searchError("AI_INVALID_FEN", "Source FEN could not be loaded.")
  if (position.fen() !== sourceFen) {
    /* chess.js may normalize nominal en-passant; compare the rules identity. */
    try {
      if (dependencies.positionKey.fromRules(position) !==
          dependencies.positionKey.fromFen(sourceFen, position.effectiveEnPassant()))
        return searchError("AI_INVALID_FEN", "Source FEN did not round-trip through the rules authority.")
    } catch (error) {
      return searchError("AI_INVALID_FEN", "Source FEN could not be normalized.")
    }
  }
  if (position.legalMoves({ verbose: true }).length === 0)
    return searchError("AI_NO_LEGAL_MOVE", "The source position has no legal move.")

  now = searchNow(environment)
  started = now()
  context = {
    dependencies: dependencies,
    profile: profile,
    runtime: environment,
    token: input.token,
    now: now,
    started_ms: started,
    deadline_ms: started + budget,
    check_interval: searchFiniteNumber(environment.check_interval)
      ? Math.max(1, Math.floor(environment.check_interval)) : 32,
    nodes: 0,
    position_counts: searchCloneCounts(input.position_counts),
    table: {},
    table_order: [],
    table_count: 0,
    history: {},
    killers: {},
    previous_best: "",
    age: 1,
    guarantee_first_depth: budget >= 80,
    ignore_deadline: false,
    random: typeof environment.random === "function"
      ? environment.random
      : searchSeededRandom(input.seed)
  }

  try {
    var initialKey = searchPositionKey(position, context)
    if (!context.position_counts[initialKey])
      context.position_counts[initialKey] = 1
  } catch (error) {
    return searchError("AI_INVALID_FEN", "Source position identity could not be created.")
  }

  if (searchCancelled(environment, input.token))
    return searchError("AI_CANCELLED", "Search token was cancelled.")

  try {
    deepening = iterativeDeepening(position, context)
  } catch (error) {
    if (searchIsAbort(error) && error.reason === "cancelled")
      return searchError("AI_CANCELLED", "Search token was cancelled.")
    return searchError("AI_SEARCH_FAILED", String(error && error.message || error))
  }
  if (!deepening.candidate)
    return searchError("AI_NO_MOVE", "No move was returned for a nonterminal position.")

  duration = Math.max(0, now() - started)
  return {
    ok: true,
    uci: deepening.candidate.uci,
    score_cp: Math.round(deepening.candidate.score),
    depth: deepening.depth,
    nodes: context.nodes,
    duration_ms: duration,
    principal_variation: deepening.candidate.pv.slice(0, 16),
    limited_by: deepening.limited_by,
    table_entries: context.table_count,
    profile_id: profile.id,
    budget_ms: budget
  }
}

var SearchEngine = {
  configureDependencies: configureDependencies,
  search: search,
  iterativeDeepening: iterativeDeepening,
  negamax: negamax,
  quiescence: quiescence,
  mate_score: SEARCH_MATE,
  protocol_version: SEARCH_PROTOCOL_VERSION
}

export {
  configureDependencies,
  search,
  iterativeDeepening,
  negamax,
  quiescence
}
