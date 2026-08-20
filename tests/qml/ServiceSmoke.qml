import QtQuick
// Validation copies this harness to the plugin root as shell.qml so the
// Quickshell module scanner keeps every imported plugin file inside its
// configuration boundary.
import "." as ChessPlugin

Item {
  id: root

  property int phase: 0
  property int attempts: 0

  ChessPlugin.Service {
    id: service
  }

  function require(condition, message) {
    if (!condition) {
      poll.running = false
      console.error("SERVICE_SMOKE_FAILURE", message)
      Qt.quit()
      throw new Error(message)
    }
  }

  Timer {
    id: poll
    interval: 25
    repeat: true
    running: true
    onTriggered: {
      root.attempts++
      if (root.attempts > 400) {
        running = false
        throw new Error("Service smoke test timed out in phase " + root.phase +
          " ready=" + service.ready + " rules=" + service.rulesReady +
          " storage=" + service.storageReady + " error=" +
          JSON.stringify(service.lastError))
      }

      if (root.phase === 0 && service.ready) {
        var created = service.newGame({
          mode: "local",
          time_control: { base_ms: 60000, increment_ms: 1000 }
        })
        root.require(created.ok, "new game failed: " + created.code)
        root.phase = 1
      } else if (root.phase === 1 && !service.persistenceBusy) {
        root.require(service.persistenceHealthy, "initial save failed: " +
          JSON.stringify(service.lastError) + " document=" +
          JSON.stringify(service.gameController.persistenceDocument()))
        var moved = service.requestMove("e2", "e4", null)
        root.require(moved.ok, "move failed: " + moved.code)
        root.phase = 2
      } else if (root.phase === 2 && !service.persistenceBusy) {
        root.require(service.snapshot.moves.length === 1, "move did not publish")
        root.require(service.snapshot.fen.indexOf("4P3") !== -1, "FEN did not update")
        var paused = service.pauseGame("service-smoke")
        root.require(paused.ok, "pause failed: " + paused.code)
        root.phase = 3
      } else if (root.phase === 3 && !service.persistenceBusy) {
        root.require(service.persistenceHealthy, "pause save failed")
        root.require(service.snapshot.status === "paused", "game was not paused")
        running = false
        Qt.quit()
      }
    }
  }
}
