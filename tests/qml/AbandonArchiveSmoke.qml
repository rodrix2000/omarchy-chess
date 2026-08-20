import QtQuick
// Validation pre-seeds an abandoned active game and an already-current empty
// history file. Startup archival must not wait for a FileView save signal when
// the abandoned-game history is unchanged.
import "." as ChessPlugin

Item {
  id: root

  property int phase: 0
  property int attempts: 0
  ChessPlugin.Service { id: service }

  function require(condition, message) {
    if (condition) return
    poll.running = false
    console.error("ABANDON_ARCHIVE_SMOKE_FAILURE", message)
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
      if (root.attempts > 400) {
        running = false
        throw new Error("Abandon archive smoke timed out in phase " + root.phase
          + " busy=" + service.persistenceBusy + " status="
          + service.snapshot.status + " error=" + JSON.stringify(service.lastError))
      }

      if (root.phase === 0 && service.ready && !service.persistenceBusy) {
        var created = service.newGame({
          mode: "local",
          time_control: { base_ms: null, increment_ms: 0 }
        })
        root.require(created.ok, "post-restore game failed: " + created.code)
        root.phase = 1
      } else if (root.phase === 1 && !service.persistenceBusy) {
        if (service.snapshot.status !== "active-human") return
        root.require(service.snapshot.game_id !== "fixture-abandoned-restore",
          "new game retained the abandoned game ID")
        root.require(service.historySummary.total === 0,
          "abandoned game leaked into normal history")
        running = false
        Qt.quit()
      }
    }
  }
}
