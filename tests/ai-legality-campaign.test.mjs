import assert from "node:assert/strict"
import test from "node:test"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const RulesAdapter = require("../engine/RulesAdapter.js")
const SearchEngine = require("../engine/SearchEngine.js")

function randomGenerator(seed) {
  let state = seed >>> 0
  return function random() {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    state >>>= 0
    return state / 4294967296
  }
}

function deadlineRuntime() {
  let calls = 0
  return {
    check_interval: 1,
    now() {
      calls += 1
      return calls === 1 ? 0 : 10000
    }
  }
}

test("1,000 seeded generated positions return legal moves across all profiles", () => {
  const profileIds = ["learner", "casual", "challenging", "strong"]
  const random = randomGenerator(0x5eedc0de)
  let position = RulesAdapter.create({})
  let generatedPly = 0

  for (let validation = 0; validation < 1000;) {
    let legal = position.legalMoves({ verbose: false })
    if (legal.length === 0 || generatedPly >= 140) {
      position = RulesAdapter.create({})
      generatedPly = 0
      legal = position.legalMoves({ verbose: false })
    }

    const sourceFen = position.fen()
    const result = SearchEngine.search({
      token: validation + 1,
      source_fen: sourceFen,
      history_uci: position.history({ format: "uci" }),
      position_counts: {},
      profile: {
        id: profileIds[validation % profileIds.length],
        budget_ms: 10,
        max_depth: 8,
        table_entries: 100,
        node_limit: 1000
      },
      budget_ms: 1,
      seed: validation + 99
    }, deadlineRuntime())

    assert.equal(result.ok, true, result.message)
    assert.match(result.uci, /^[a-h][1-8][a-h][1-8][qrbn]?$/)
    assert.ok(legal.includes(result.uci), `${result.uci} was illegal in ${sourceFen}`)
    assert.equal(position.fen(), sourceFen)
    validation += 1

    const played = legal[Math.floor(random() * legal.length)]
    assert.equal(position.commitMove(played).ok, true)
    generatedPly += 1
  }
})
