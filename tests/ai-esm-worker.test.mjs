import assert from "node:assert/strict"
import test from "node:test"

test("ES-module WorkerScript graph returns a serializable bestmove", async () => {
  let response = null
  globalThis.WorkerScript = {
    onMessage: null,
    sendMessage(message) {
      response = structuredClone(message)
    }
  }

  try {
    await import("../engine/AiWorker.mjs")
    assert.equal(typeof globalThis.WorkerScript.onMessage, "function")
    globalThis.WorkerScript.onMessage({
      protocol_version: 1,
      type: "search",
      token: 91,
      game_id: "esm_worker",
      source_fen: "7k/5Q2/6K1/8/8/8/8/8 w - - 0 1",
      history_uci: [],
      position_counts: {},
      profile: {
        id: "strong",
        budget_ms: 100,
        max_depth: 4,
        table_entries: 1000,
        centipawn_window: 8,
        temperature: 0
      },
      seed: 17,
      sent_at_ms: 1
    })

    assert.equal(response.type, "bestmove")
    assert.equal(response.protocol_version, 1)
    assert.equal(response.token, 91)
    assert.equal(response.game_id, "esm_worker")
    assert.ok(["f7e8", "f7f8", "f7g7", "f7h7"].includes(response.uci))
    assert.doesNotThrow(() => JSON.stringify(response))
  } finally {
    delete globalThis.WorkerScript
  }
})
