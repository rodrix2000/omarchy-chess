import QtQuick
// Copied to the plugin root by validation so WorkerScript module paths remain
// identical to an installed Omarchy plugin.
import "." as ChessPlugin

Item {
  id: root

  property int phase: 0
  property int attempts: 0
  property bool observedThinking: false

  ChessPlugin.Service {
    id: service
  }

  function require(condition, message) {
    if (condition) return
    poll.running = false
    console.error("COMPUTER_SERVICE_SMOKE_FAILURE", message)
    Qt.quit()
    throw new Error(message)
  }

  Timer {
    id: poll
    interval: 25
    repeat: true
    running: true

    onTriggered: {
      root.attempts++
      if (root.attempts > 600) {
        running = false
        throw new Error("Computer service smoke timed out in phase " + root.phase
          + " status=" + service.snapshot.status + " thinking="
          + service.computerThinking + " error=" + JSON.stringify(service.lastError))
      }

      if (root.phase === 0 && service.ready) {
        var created = service.newGame({
          mode: "computer",
          human_color: "white",
          difficulty: "casual",
          time_control: { base_ms: null, increment_ms: 0 }
        })
        root.require(created.ok, "computer game failed: " + created.code)
        root.phase = 1
      } else if (root.phase === 1 && !service.persistenceBusy) {
        var moved = service.requestMove("e2", "e4", null)
        root.require(moved.ok, "human move failed: " + moved.code)
        root.phase = 2
      } else if (root.phase === 2) {
        if (service.computerThinking) root.observedThinking = true
        if (!service.persistenceBusy && !service.computerThinking
            && service.snapshot.moves.length === 2) {
          root.require(root.observedThinking, "computer search never published thinking state")
          root.require(service.snapshot.status === "active-human",
            "computer reply did not return control to the human")
          root.require(service.snapshot.moves[1].uci.length >= 4,
            "computer reply did not publish legal UCI")
          var paused = service.pauseGame("computer-service-smoke")
          root.require(paused.ok, "computer game did not pause")
          root.phase = 3
        }
      } else if (root.phase === 3 && !service.persistenceBusy) {
        root.require(service.snapshot.status === "paused", "paused state was not saved")
        running = false
        Qt.quit()
      }
    }
  }
}
