import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import test from "node:test"
import vm from "node:vm"

const require = createRequire(import.meta.url)
const Adjudicator = require("../engine/Adjudicator.js")

function context(overrides = {}) {
  return {
    position: {
      checkmate: false,
      stalemate: false,
      dead_position: false,
      side_to_move: "white",
      halfmove_clock: 0,
      ...(overrides.position || {})
    },
    position_counts: overrides.position_counts || { current: 1 },
    current_position_key: overrides.current_position_key || "current",
    legal_moves: overrides.legal_moves || [],
    ...Object.fromEntries(
      Object.entries(overrides).filter(([key]) =>
        !["position", "position_counts", "current_position_key", "legal_moves"].includes(key))
    )
  }
}

function assertTerminal(actual, reason, score, winner = null) {
  assert.deepEqual(actual, {
    terminal: true,
    result: { score, reason, winner },
    claims: null
  })
}

test("exports the API to Node and loads without CommonJS globals", () => {
  assert.deepEqual(Object.keys(Adjudicator).sort(), [
    "canPossiblyMate",
    "currentClaims",
    "evaluateExternalAction",
    "evaluatePostMove",
    "prospectiveClaims"
  ])

  const source = readFileSync(new URL("../engine/Adjudicator.js", import.meta.url), "utf8")
  const qmlContext = {}
  vm.runInNewContext(source, qmlContext, { filename: "Adjudicator.js" })

  assert.equal(typeof qmlContext.evaluatePostMove, "function")
  assert.equal(typeof qmlContext.canPossiblyMate, "function")
  assert.equal(qmlContext.currentClaims({ position: {} }).threefold_current, false)
})

test("post-move checkmate wins before the 150-ply and fivefold thresholds", () => {
  const actual = Adjudicator.evaluatePostMove(context({
    position: {
      checkmate: true,
      stalemate: true,
      dead_position: true,
      side_to_move: "black",
      halfmove_clock: 150
    },
    position_counts: { current: 5 }
  }))

  assertTerminal(actual, "checkmate", "1-0", "white")
})

test("post-move stalemate precedes dead position and automatic thresholds", () => {
  const actual = Adjudicator.evaluatePostMove(context({
    position: {
      stalemate: true,
      dead_position: true,
      side_to_move: "white",
      halfmove_clock: 150
    },
    position_counts: { current: 5 }
  }))

  assertTerminal(actual, "stalemate", "1/2-1/2")
})

test("post-move dead position precedes fivefold and seventy-five-move draws", () => {
  const actual = Adjudicator.evaluatePostMove(context({
    position: { dead_position: true, halfmove_clock: 150 },
    position_counts: { current: 5 }
  }))

  assertTerminal(actual, "dead-position", "1/2-1/2")
})

test("post-move fivefold repetition precedes the seventy-five-move draw", () => {
  const actual = Adjudicator.evaluatePostMove(context({
    position: { halfmove_clock: 150 },
    position_counts: { current: 5 }
  }))

  assertTerminal(actual, "fivefold-automatic", "1/2-1/2")
})

test("post-move halfmove clock 150 is an automatic draw", () => {
  assertTerminal(
    Adjudicator.evaluatePostMove(context({ position: { halfmove_clock: 150 } })),
    "seventy-five-move-automatic",
    "1/2-1/2"
  )
})

test("current claim availability is reported but does not end the game", () => {
  const actual = Adjudicator.evaluatePostMove(context({
    position: { halfmove_clock: 100 },
    position_counts: { current: 3 }
  }))

  assert.deepEqual(actual, {
    terminal: false,
    result: null,
    claims: {
      threefold_current: true,
      fifty_move_current: true,
      prospective_moves: []
    }
  })
})

test("prospective claims use resulting counts and halfmove clocks without mutation", () => {
  const candidateContext = context({
    position: { halfmove_clock: 99 },
    position_counts: { current: 1, repeated: 2 },
    legal_moves: [
      { uci: "g1f3", position_key_after: "repeated", halfmove_clock_after: 100 },
      { uci: "a2a3", position_key_after: "fresh", halfmove_clock_after: 0 },
      { uci: "h1g1", position_key_after: "fresh", halfmove_clock_after: 100 }
    ]
  })
  const before = structuredClone(candidateContext)

  assert.deepEqual(Adjudicator.prospectiveClaims(candidateContext, candidateContext.legal_moves), [
    { uci: "g1f3", threefold: true, fifty_move: true },
    { uci: "h1g1", threefold: false, fifty_move: true }
  ])
  assert.deepEqual(candidateContext, before)
})

test("prospective claims clone rules and never commit on the live adapter", () => {
  let liveCommits = 0
  let cloneCount = 0
  const liveRules = {
    fen: () => "8/8/8/8/8/8/8/K6k w - - 99 1",
    commitMove: () => {
      liveCommits += 1
      return { ok: true, halfmove_clock: 100 }
    }
  }
  const candidateContext = context({
    position_counts: { current: 1, repeated: 2 },
    legal_moves: ["a1a2"],
    rules: liveRules,
    clone_rules: () => {
      cloneCount += 1
      return {
        projectedKey: null,
        commitMove(move) {
          assert.equal(move, "a1a2")
          this.projectedKey = "repeated"
          return { ok: true, halfmove_clock: 100 }
        }
      }
    },
    position_key_from_rules: rules => rules.projectedKey
  })

  assert.deepEqual(Adjudicator.prospectiveClaims(candidateContext), [
    { uci: "a1a2", threefold: true, fifty_move: true }
  ])
  assert.equal(cloneCount, 1)
  assert.equal(liveCommits, 0)
})

test("a clone provider returning the live adapter is rejected without mutation", () => {
  let commits = 0
  const liveRules = {
    commitMove: () => {
      commits += 1
      return { ok: true, halfmove_clock: 100 }
    }
  }
  const candidateContext = context({
    rules: liveRules,
    clone_rules: () => liveRules,
    legal_moves: ["a1a2"]
  })

  assert.deepEqual(Adjudicator.prospectiveClaims(candidateContext), [])
  assert.equal(commits, 0)
})

test("current and prospective threefold claims end only when explicitly claimed", () => {
  assertTerminal(
    Adjudicator.evaluateExternalAction(
      context({ position_counts: { current: 3 } }),
      { type: "threefold-claim" }
    ),
    "threefold-claim",
    "1/2-1/2"
  )

  assertTerminal(
    Adjudicator.evaluateExternalAction(
      context({
        position_counts: { current: 1, repeated: 2 },
        legal_moves: [
          { uci: "g1f3", position_key_after: "repeated", halfmove_clock_after: 12 }
        ]
      }),
      { type: "claim", claim_type: "threefold", move_uci: "g1f3" }
    ),
    "threefold-claim",
    "1/2-1/2"
  )
})

test("current and prospective fifty-move claims honor reset moves", () => {
  assertTerminal(
    Adjudicator.evaluateExternalAction(
      context({ position: { halfmove_clock: 100 } }),
      { type: "fifty-move-claim" }
    ),
    "fifty-move-claim",
    "1/2-1/2"
  )

  const candidateContext = context({
    position: { halfmove_clock: 99 },
    legal_moves: [
      { uci: "g1f3", position_key_after: "fresh", halfmove_clock_after: 100 },
      { uci: "a2a3", position_key_after: "fresh-pawn", halfmove_clock_after: 0 }
    ]
  })

  assertTerminal(
    Adjudicator.evaluateExternalAction(candidateContext, {
      type: "fifty-move-claim",
      move_uci: "g1f3"
    }),
    "fifty-move-claim",
    "1/2-1/2"
  )
  assert.equal(
    Adjudicator.evaluateExternalAction(candidateContext, {
      type: "fifty-move-claim",
      move_uci: "a2a3"
    }).terminal,
    false
  )
})

test("invalid claims are ignored and leave their inputs unchanged", () => {
  const candidateContext = context({
    position: { halfmove_clock: 99 },
    position_counts: { current: 2, repeated: 1 },
    legal_moves: [
      { uci: "g1f3", position_key_after: "repeated", halfmove_clock_after: 100 }
    ]
  })
  const action = { type: "threefold-claim", move_uci: "g1f3" }
  const beforeContext = structuredClone(candidateContext)
  const beforeAction = structuredClone(action)

  assert.equal(Adjudicator.evaluateExternalAction(candidateContext, action).terminal, false)
  assert.deepEqual(candidateContext, beforeContext)
  assert.deepEqual(action, beforeAction)
})

test("resignation awards the opponent the game for both colors", () => {
  assertTerminal(
    Adjudicator.evaluateExternalAction(context(), {
      type: "resignation",
      resigning_side: "white",
      opponent_can_possibly_mate: true
    }),
    "resignation",
    "0-1",
    "black"
  )
  assertTerminal(
    Adjudicator.evaluateExternalAction(context(), {
      type: "resignation",
      side: "black",
      opponent_can_possibly_mate: true
    }),
    "resignation",
    "1-0",
    "white"
  )
})

test("resignation is drawn when the opponent cannot possibly mate", () => {
  assertTerminal(
    Adjudicator.evaluateExternalAction(context(), {
      type: "resignation",
      side: "white",
      material_position: {
        white: { king: 1 },
        black: { king: 1, bishop: 1 }
      }
    }),
    "resignation",
    "1/2-1/2"
  )
})

test("a valid accepted draw is terminal and an explicitly invalid one is ignored", () => {
  assertTerminal(
    Adjudicator.evaluateExternalAction(context(), { type: "draw-agreement", accepted: true }),
    "draw-agreement",
    "1/2-1/2"
  )
  assert.equal(
    Adjudicator.evaluateExternalAction(context(), { type: "draw-agreement", valid: false }).terminal,
    false
  )
})

test("timeout is a win only when the opponent can possibly mate", () => {
  assertTerminal(
    Adjudicator.evaluateExternalAction(context(), {
      type: "timeout",
      expired_side: "white",
      opponent_can_possibly_mate: true
    }),
    "timeout",
    "0-1",
    "black"
  )
  assertTerminal(
    Adjudicator.evaluateExternalAction(context(), {
      expired_side: "black",
      opponent_can_possibly_mate: false
    }),
    "timeout-insufficient-mating-possibility",
    "1/2-1/2"
  )
})

test("timeout can derive mating possibility from normalized board material", () => {
  assertTerminal(
    Adjudicator.evaluateExternalAction(context(), {
      type: "timeout",
      expired_side: "white",
      material_position: [
        { square: "a1", color: "white", piece: "king" },
        { square: "h8", color: "black", piece: "king" },
        { square: "f8", color: "black", piece: "knight" }
      ]
    }),
    "timeout-insufficient-mating-possibility",
    "1/2-1/2"
  )
})

test("abandon produces the non-game PGN score", () => {
  assertTerminal(
    Adjudicator.evaluateExternalAction(context(), { type: "abandon" }),
    "abandoned",
    "*"
  )
})

test("an existing board ending takes precedence over a later external action", () => {
  const mate = context({
    position: { checkmate: true, side_to_move: "white", halfmove_clock: 0 }
  })

  assertTerminal(
    Adjudicator.evaluateExternalAction(mate, {
      type: "draw-agreement",
      accepted: true
    }),
    "checkmate",
    "0-1",
    "black"
  )
})

test("major pieces and pawns always retain mating possibility", () => {
  for (const piece of ["queen", "rook", "pawn"]) {
    assert.equal(
      Adjudicator.canPossiblyMate({
        white: { king: 1, [piece]: 1 },
        black: { king: 1 }
      }, "white"),
      true,
      piece
    )
  }
})

test("standard minor-piece mating and non-mating families are distinguished", () => {
  const bareOpponent = { black: { king: 1 } }

  assert.equal(Adjudicator.canPossiblyMate({ white: { king: 1 }, ...bareOpponent }, "white"), false)
  assert.equal(Adjudicator.canPossiblyMate({ white: { king: 1, bishop: 1 }, ...bareOpponent }, "white"), false)
  assert.equal(Adjudicator.canPossiblyMate({ white: { king: 1, knight: 1 }, ...bareOpponent }, "white"), false)
  assert.equal(Adjudicator.canPossiblyMate({ white: { king: 1, bishop: 1, knight: 1 }, ...bareOpponent }, "white"), true)
  assert.equal(Adjudicator.canPossiblyMate({ white: { king: 1, knight: 2 }, ...bareOpponent }, "white"), true)
  assert.equal(Adjudicator.canPossiblyMate({ white: { king: 1, bishops: ["dark", "light"] }, ...bareOpponent }, "white"), true)
})

test("single knight policy depends on the opponent's material type", () => {
  const canMateAgainst = ["pawn", "knight", "bishop", "rook"]

  for (const piece of canMateAgainst) {
    assert.equal(
      Adjudicator.canPossiblyMate({
        white: { king: 1, knight: 1 },
        black: { king: 1, [piece]: 1 }
      }, "white"),
      true,
      `knight versus ${piece}`
    )
  }

  assert.equal(Adjudicator.canPossiblyMate({
    white: { king: 1, knight: 1 },
    black: { king: 1, queen: 1 }
  }, "white"), false)
})

test("bishop-only policy accounts for all bishop color complexes and helpers", () => {
  assert.equal(
    Adjudicator.canPossiblyMate("7k/8/8/8/8/4B3/8/K1B5 w - - 0 1", "white"),
    false,
    "same-color bishops only"
  )
  assert.equal(
    Adjudicator.canPossiblyMate("7k/8/8/8/8/8/8/K1B2B2 w - - 0 1", "white"),
    true,
    "opposite-color bishop pair"
  )
  assert.equal(
    Adjudicator.canPossiblyMate("2b4k/8/8/8/8/8/8/K1B5 w - - 0 1", "white"),
    true,
    "opposing bishop on the other color complex"
  )
  assert.equal(Adjudicator.canPossiblyMate({
    white: { king: 1, bishops: ["dark"] },
    black: { king: 1, rook: 1, queen: 1 }
  }, "white"), false)
  assert.equal(Adjudicator.canPossiblyMate({
    white: { king: 1, bishops: ["dark"] },
    black: { king: 1, pawn: 1 }
  }, "white"), true)
  assert.equal(Adjudicator.canPossiblyMate({
    white: { king: 1, bishops: ["dark"] },
    black: { king: 1, knight: 1 }
  }, "white"), true)
})

test("unknown colors for multiple bishops conservatively retain possibility", () => {
  assert.equal(Adjudicator.canPossiblyMate({
    white: { king: 1, bishop: 2 },
    black: { king: 1 }
  }, "white"), true)
})

test("bishop count summaries use supplied square-color evidence", () => {
  assert.equal(Adjudicator.canPossiblyMate({
    white: { king: 1, bishop: 2, bishop_square_colors: ["dark", "dark"] },
    black: { king: 1 }
  }, "white"), false)
  assert.equal(Adjudicator.canPossiblyMate({
    white: { king: 1, bishops: ["c1", "f1"] },
    black: { king: 1 }
  }, "white"), true)
})

test("all required result reason enums have a fixture", () => {
  const reasons = new Set([
    Adjudicator.evaluatePostMove(context({ position: { checkmate: true, side_to_move: "black" } })).result.reason,
    Adjudicator.evaluatePostMove(context({ position: { stalemate: true } })).result.reason,
    Adjudicator.evaluatePostMove(context({ position: { dead_position: true } })).result.reason,
    Adjudicator.evaluateExternalAction(context(), { type: "resignation", side: "white" }).result.reason,
    Adjudicator.evaluateExternalAction(context(), { type: "draw-agreement" }).result.reason,
    Adjudicator.evaluateExternalAction(context({ position_counts: { current: 3 } }), { type: "threefold-claim" }).result.reason,
    Adjudicator.evaluatePostMove(context({ position_counts: { current: 5 } })).result.reason,
    Adjudicator.evaluateExternalAction(context({ position: { halfmove_clock: 100 } }), { type: "fifty-move-claim" }).result.reason,
    Adjudicator.evaluatePostMove(context({ position: { halfmove_clock: 150 } })).result.reason,
    Adjudicator.evaluateExternalAction(context(), { type: "timeout", side: "white" }).result.reason,
    Adjudicator.evaluateExternalAction(context(), { type: "timeout", side: "white", opponent_can_possibly_mate: false }).result.reason,
    Adjudicator.evaluateExternalAction(context(), { type: "abandon" }).result.reason
  ])

  assert.deepEqual(reasons, new Set([
    "checkmate",
    "stalemate",
    "dead-position",
    "resignation",
    "draw-agreement",
    "threefold-claim",
    "fivefold-automatic",
    "fifty-move-claim",
    "seventy-five-move-automatic",
    "timeout",
    "timeout-insufficient-mating-possibility",
    "abandoned"
  ]))
})
