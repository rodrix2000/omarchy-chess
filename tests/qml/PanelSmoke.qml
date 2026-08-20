import QtQuick
// Validation copies this harness to the plugin root as shell.qml so the
// Quickshell module scanner keeps every imported plugin file in one config.
import "." as ChessPlugin

Item {
  id: root

  property int phase: 0
  property int attempts: 0

  ChessPlugin.Service {
    id: service
  }

  ChessPlugin.Panel {
    id: panel
    service: service
    manifest: ({ id: "io.github.rodrix2000.chess" })
  }

  function require(condition, message) {
    if (condition) return
    poll.running = false
    console.error("PANEL_SMOKE_FAILURE", message)
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
      if (root.attempts > 500) {
        running = false
        throw new Error("Panel smoke test timed out in phase " + root.phase)
      }

      if (root.phase === 0 && service.ready) {
        panel.open(JSON.stringify({ view: "home" }))
        root.require(panel.opened, "panel did not open")
        root.require(panel.currentView === "home", "home payload was not honored")
        panel.beginGame({
          mode: "local",
          time_control: { base_ms: 60000, increment_ms: 1000 },
          orientation: "white",
          players: {
            white: { name: "Keyboard White" },
            black: { name: "Keyboard Black" }
          }
        })
        root.require(panel.currentView === "game", "new game did not open board")
        root.phase = 1
      } else if (root.phase === 1 && !service.persistenceBusy) {
        root.require(panel.gameInputEnabled, "board input was not enabled")
        panel.activateSquare("e2")
        root.require(panel.selectedSquare === "e2", "piece was not selected")
        root.require(panel.isLegalTarget("e4"), "service move markers omitted e4")
        panel.activateSquare("e4")
        root.phase = 2
      } else if (root.phase === 2 && !service.persistenceBusy) {
        root.require(service.snapshot.moves.length === 1, "panel move did not commit")
        root.require(service.snapshot.moves[0].uci === "e2e4", "wrong panel move committed")
        panel.flipBoard()
        root.require(panel.boardOrientation === "black", "board did not flip")
        panel.close()
        root.require(!panel.opened, "panel did not close")
        root.phase = 3
      } else if (root.phase === 3 && !service.persistenceBusy) {
        root.require(service.snapshot.status === "paused", "close did not pause game")
        panel.open(JSON.stringify({ action: "resume" }))
        root.require(panel.currentView === "game", "resume did not open game view")
        root.phase = 4
      } else if (root.phase === 4 && !service.persistenceBusy) {
        root.require(service.snapshot.status === "active-human", "game did not resume")
        root.require(service.snapshot.moves.length === 1, "resume lost move history")
        panel.close()
        root.phase = 5
      } else if (root.phase === 5 && !service.persistenceBusy) {
        root.require(service.snapshot.status === "paused", "final close did not pause")
        running = false
        Qt.quit()
      }
    }
  }
}
