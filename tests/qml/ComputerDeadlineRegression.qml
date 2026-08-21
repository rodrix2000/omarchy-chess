import QtQuick
import QtQml.WorkerScript
// Copied to the plugin root by validation so WorkerScript module paths remain
// identical to an installed Omarchy plugin.
import "engine/DifficultyProfiles.js" as DifficultyProfiles

Item {
  id: root

  property double startedAt: 0
  readonly property int responseDeadlineMs:
    DifficultyProfiles.hardResponseDeadline("casual", 325)

  function fail(message) {
    deadline.stop()
    console.error("COMPUTER_DEADLINE_REGRESSION_FAILURE", message)
    throw new Error(message)
  }

  Component.onCompleted: {
    startedAt = Date.now()
    worker.sendMessage({
      protocol_version: 1,
      type: "search",
      token: 8,
      game_id: "fixture-casual-deadline",
      source_fen: "1nbqkbnr/2pppppp/r7/pp6/4PB2/2NP4/PPP2PPP/R2QKBNR b KQk - 3 4",
      history_uci: ["e2e4", "b7b5", "d2d3", "a7a5", "b1c3", "a8a6", "c1f4"],
      position_counts: ({}),
      profile: DifficultyProfiles.resolveProfile("casual"),
      budget_ms: 325,
      seed: 17,
      sent_at_ms: startedAt
    })
  }

  WorkerScript {
    id: worker
    source: "engine/AiWorker.mjs"
    onMessage: function(message) {
      var elapsed = Date.now() - root.startedAt
      deadline.stop()
      if (!message || message.type !== "bestmove")
        root.fail("worker did not return a best move: " + JSON.stringify(message))
      if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(String(message.uci || "")))
        root.fail("worker returned malformed UCI: " + String(message.uci || ""))
      if (elapsed >= root.responseDeadlineMs)
        root.fail("valid search exceeded the service deadline: " + elapsed + " ms")
      console.log("COMPUTER_DEADLINE_REGRESSION_PASS elapsed_ms=" + elapsed
        + " deadline_ms=" + root.responseDeadlineMs + " uci=" + message.uci)
      Qt.quit()
    }
  }

  Timer {
    id: deadline
    interval: root.responseDeadlineMs
    running: true
    repeat: false
    onTriggered: root.fail("worker exceeded the " + interval + " ms service deadline")
  }
}
