import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import test from "node:test"
import vm from "node:vm"

const require = createRequire(import.meta.url)
const PositionKey = require("../engine/PositionKey.js")

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
const LEGAL_EP_FEN = "6k1/8/8/3pP3/8/8/8/4K3 w - d6 0 1"
const PINNED_EP_FEN = "4r1k1/8/8/3pP3/8/8/8/4K3 w - d6 0 1"

test("exports the classic-script API to Node", () => {
  assert.deepEqual(Object.keys(PositionKey).sort(), ["fromFen", "fromRules"])
})

test("loads as a QML-compatible classic script without CommonJS globals", () => {
  const source = readFileSync(new URL("../engine/PositionKey.js", import.meta.url), "utf8")
  const context = {}

  vm.runInNewContext(source, context, { filename: "PositionKey.js" })

  assert.equal(typeof context.fromFen, "function")
  assert.equal(typeof context.fromRules, "function")
  assert.equal(context.fromFen(START_FEN), START_FEN.split(" 0 1")[0])
})

test("uses placement, turn, canonical rights, and effective en passant only", () => {
  assert.equal(
    PositionKey.fromFen("8/8/8/8/8/8/8/K6k W qKQk - 17 83"),
    "8/8/8/8/8/8/8/K6k w KQkq -"
  )
})

test("ignores halfmove and fullmove counters", () => {
  const first = PositionKey.fromFen(START_FEN)
  const second = PositionKey.fromFen(
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 99 42"
  )

  assert.equal(first, second)
})

test("distinguishes the side to move", () => {
  const white = PositionKey.fromFen("8/8/8/8/8/8/8/K6k w - - 0 1")
  const black = PositionKey.fromFen("8/8/8/8/8/8/8/K6k b - - 0 1")

  assert.notEqual(white, black)
})

test("distinguishes changed castling rights", () => {
  const allRights = PositionKey.fromFen(START_FEN)
  const lostWhiteKingside = PositionKey.fromFen(
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w Qkq - 0 1"
  )

  assert.notEqual(allRights, lostWhiteKingside)
})

test("includes an explicitly effective en-passant target", () => {
  assert.equal(
    PositionKey.fromFen(LEGAL_EP_FEN, true),
    "6k1/8/8/3pP3/8/8/8/4K3 w - d6"
  )
  assert.equal(
    PositionKey.fromFen(LEGAL_EP_FEN, "D6"),
    "6k1/8/8/3pP3/8/8/8/4K3 w - d6"
  )
  assert.equal(
    PositionKey.fromFen(LEGAL_EP_FEN, [{ from: "e5", to: "d6" }]),
    "6k1/8/8/3pP3/8/8/8/4K3 w - d6"
  )
})

test("a nominal en-passant target is ineffective without a legal capture", () => {
  const nominal = PositionKey.fromFen(LEGAL_EP_FEN)
  const none = PositionKey.fromFen(LEGAL_EP_FEN, [])
  const noTarget = PositionKey.fromFen("6k1/8/8/3pP3/8/8/8/4K3 w - - 0 1")

  assert.equal(nominal, noTarget)
  assert.equal(none, noTarget)
})

test("pinned en passant does not change repetition identity", () => {
  // e5xd6 would expose the white king on e1 to the black rook on e8.
  const pinnedWithNominalTarget = PositionKey.fromFen(PINNED_EP_FEN, [])
  const pinnedWithoutTarget = PositionKey.fromFen(
    "4r1k1/8/8/3pP3/8/8/8/4K3 w - - 0 1"
  )

  assert.equal(pinnedWithNominalTarget, pinnedWithoutTarget)
})

test("fromRules includes an en-passant target only for a legal flagged move", () => {
  let requestedOptions = null
  const legalRules = {
    fen() {
      return LEGAL_EP_FEN
    },
    legalMoves(options) {
      requestedOptions = options
      return [
        { from: "e1", to: "e2", flags: ["normal"] },
        { from: "e5", to: "d6", flags: ["capture", "en-passant"] }
      ]
    }
  }

  assert.equal(
    PositionKey.fromRules(legalRules),
    "6k1/8/8/3pP3/8/8/8/4K3 w - d6"
  )
  assert.deepEqual(requestedOptions, { verbose: true })
})

test("fromRules excludes a pinned pseudo-capture not marked legal en passant", () => {
  const pinnedRules = {
    fen() {
      return PINNED_EP_FEN
    },
    legalMoves() {
      return [{ from: "e5", to: "d6", flags: ["normal"] }]
    }
  }

  assert.equal(
    PositionKey.fromRules(pinnedRules),
    "4r1k1/8/8/3pP3/8/8/8/4K3 w - -"
  )
})

test("fromRules accepts a dedicated legal-en-passant move provider", () => {
  const rules = {
    fen() {
      return LEGAL_EP_FEN
    },
    legalEnPassantMoves() {
      return ["e5d6"]
    }
  }

  assert.equal(
    PositionKey.fromRules(rules),
    "6k1/8/8/3pP3/8/8/8/4K3 w - d6"
  )
})

test("fromRules does not request moves when FEN has no nominal target", () => {
  const rules = {
    fen() {
      return START_FEN
    },
    legalMoves() {
      throw new Error("legalMoves must not be called")
    }
  }

  assert.equal(PositionKey.fromRules(rules), START_FEN.split(" 0 1")[0])
})

test("rejects malformed identity inputs", () => {
  assert.throws(() => PositionKey.fromFen(null), /FEN must be a string/)
  assert.throws(
    () => PositionKey.fromFen("8/8/8/8/8/8/8/7 w - - 0 1"),
    /eight squares/
  )
  assert.throws(
    () => PositionKey.fromFen("8/8/8/8/8/8/8/K6k w Ax - 0 1"),
    /castling rights/
  )
  assert.throws(
    () => PositionKey.fromRules({ fen: () => LEGAL_EP_FEN }),
    /cannot provide legal moves/
  )
})
