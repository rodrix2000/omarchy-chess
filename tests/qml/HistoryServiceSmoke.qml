import QtQuick
// Validation copies this harness to the plugin root as shell.qml so all
// persistence, PGN, and replay paths match an installed plugin.
import "." as ChessPlugin

Item {
  id: root

  property int phase: 0
  property int attempts: 0
  property string completedGameId: ""
  property string bulkFirstId: ""
  property string bulkSecondId: ""
  property string retainedActiveId: ""

  ChessPlugin.Service { id: service }

  function require(condition, message) {
    if (condition) return
    poll.running = false
    console.error("HISTORY_SERVICE_SMOKE_FAILURE", message)
    Qt.quit()
    throw new Error(message)
  }

  function move(fromSquare, toSquare) {
    var moved = service.requestMove(fromSquare, toSquare, null)
    require(moved.ok, fromSquare + toSquare + " failed: " + moved.code)
    phase++
  }

  Timer {
    id: poll
    interval: 25
    repeat: true
    running: true

    onTriggered: {
      root.attempts++
      if (root.attempts > 1600) {
        running = false
        throw new Error("History service smoke timed out in phase " + root.phase
          + " busy=" + service.persistenceBusy + " history="
          + JSON.stringify(service.historySummary) + " error="
          + JSON.stringify(service.lastError))
      }

      if (root.phase === 0 && service.ready) {
        var created = service.newGame({
          mode: "local",
          white_name: "White",
          black_name: "Black",
          time_control: { base_ms: null, increment_ms: 0 }
        })
        root.require(created.ok, "new game failed: " + created.code)
        root.completedGameId = service.snapshot.game_id
        root.phase = 1
      } else if (root.phase === 1 && !service.persistenceBusy) {
        root.move("f2", "f3")
      } else if (root.phase === 2 && !service.persistenceBusy) {
        root.move("e7", "e5")
      } else if (root.phase === 3 && !service.persistenceBusy) {
        root.move("g2", "g4")
      } else if (root.phase === 4 && !service.persistenceBusy) {
        root.move("d8", "h4")
      } else if (root.phase === 5 && service.historySummary.total === 1
                 && !service.persistenceBusy) {
        root.require(service.snapshot.result.reason === "checkmate",
          "Fool's mate did not adjudicate as checkmate")
        var opened = service.openHistoryGame(root.completedGameId)
        if (opened.ok) root.phase = 6
        else root.require(opened.code === "PERSISTENCE_BUSY",
          "history load failed to start: " + opened.code)
      } else if (root.phase === 6 && service.replaySnapshot
                 && !service.persistenceBusy) {
        root.require(service.replaySnapshot.record.game_id === root.completedGameId,
          "loaded the wrong history record")
        root.require(service.replaySnapshot.frames.length === 5,
          "replay did not reconstruct initial plus four plies")
        root.require(service.replaySnapshot.frames[0].ply === 0,
          "replay is missing its initial frame")
        root.require(service.replaySnapshot.frames[4].fen
          === service.replaySnapshot.record.fen,
          "final replay frame does not match the archived FEN")
        var exported = service.exportPgn(root.completedGameId, "")
        root.require(exported.ok, "PGN export failed to start: " + exported.code)
        root.phase = 7
      } else if (root.phase === 7 && service.lastExportPath !== ""
                 && !service.persistenceBusy) {
        root.require(service.lastExportPath.indexOf(root.completedGameId + ".pgn") > 0,
          "default export path does not use the game ID")
        var settings = service.updateSettings({
          appearance: {
            coordinates: false,
            board_theme: "green",
            show_legal_moves: false
          },
          audio: { enabled: false }
        })
        root.require(settings.ok, "settings save failed to start: " + settings.code)
        root.phase = 8
      } else if (root.phase === 8 && !service.persistenceBusy
                 && service.settingsSnapshot.audio.enabled === false) {
        root.require(service.settingsSnapshot.appearance.coordinates === false,
          "settings patch was not merged atomically")
        root.require(service.settingsSnapshot.appearance.board_theme === "green",
          "board theme was not persisted through settings")
        root.require(service.settingsSnapshot.appearance.show_legal_moves === false,
          "legal move hint preference was not persisted through settings")
        var removed = service.removeHistoryGame(root.completedGameId)
        root.require(removed.ok, "history removal failed to start: " + removed.code)
        root.phase = 9
      } else if (root.phase === 9 && !service.persistenceBusy
                 && service.historySummary.total === 0) {
        root.require(service.replaySnapshot === null,
          "deleting a history record left its replay in memory")
        var firstBulk = service.newGame({
          mode: "local",
          white_name: "First White",
          black_name: "First Black",
          time_control: { base_ms: null, increment_ms: 0 }
        })
        root.require(firstBulk.ok, "first bulk game failed: " + firstBulk.code)
        root.bulkFirstId = service.snapshot.game_id
        root.phase = 10
      } else if (root.phase === 10 && !service.persistenceBusy) {
        root.move("f2", "f3")
      } else if (root.phase === 11 && !service.persistenceBusy) {
        root.move("e7", "e5")
      } else if (root.phase === 12 && !service.persistenceBusy) {
        root.move("g2", "g4")
      } else if (root.phase === 13 && !service.persistenceBusy) {
        root.move("d8", "h4")
      } else if (root.phase === 14 && service.historySummary.total === 1
                 && !service.persistenceBusy) {
        var secondBulk = service.newGame({
          mode: "local",
          white_name: "Second White",
          black_name: "Second Black",
          time_control: { base_ms: null, increment_ms: 0 }
        })
        root.require(secondBulk.ok, "second bulk game failed: " + secondBulk.code)
        root.bulkSecondId = service.snapshot.game_id
        root.require(root.bulkSecondId !== root.bulkFirstId,
          "bulk history games reused a game ID")
        root.phase = 15
      } else if (root.phase === 15 && !service.persistenceBusy) {
        root.move("f2", "f3")
      } else if (root.phase === 16 && !service.persistenceBusy) {
        root.move("e7", "e5")
      } else if (root.phase === 17 && !service.persistenceBusy) {
        root.move("g2", "g4")
      } else if (root.phase === 18 && !service.persistenceBusy) {
        root.move("d8", "h4")
      } else if (root.phase === 19 && service.historySummary.total === 2
                 && !service.persistenceBusy) {
        var retainedActive = service.newGame({
          mode: "local",
          white_name: "Retained White",
          black_name: "Retained Black",
          time_control: { base_ms: null, increment_ms: 0 }
        })
        root.require(retainedActive.ok,
          "retained active game failed: " + retainedActive.code)
        root.retainedActiveId = service.snapshot.game_id
        root.phase = 20
      } else if (root.phase === 20 && !service.persistenceBusy) {
        root.move("e2", "e4")
      } else if (root.phase === 21 && !service.persistenceBusy) {
        var openedBulk = service.openHistoryGame(root.bulkFirstId)
        if (openedBulk.ok) root.phase = 22
        else root.require(openedBulk.code === "PERSISTENCE_BUSY",
          "bulk replay failed to start: " + openedBulk.code)
      } else if (root.phase === 22 && service.replaySnapshot
                 && !service.persistenceBusy) {
        root.require(service.replaySnapshot.record.game_id === root.bulkFirstId,
          "bulk clear setup loaded the wrong replay")
        var cleared = service.clearHistory()
        root.require(cleared.ok, "history clear failed to start: " + cleared.code)
        root.require(cleared.data.removed_count === 2,
          "history clear reported the wrong removed count")
        root.phase = 23
      } else if (root.phase === 23 && !service.persistenceBusy
                 && service.historySummary.total === 0) {
        root.require(service.replaySnapshot === null,
          "clearing history left its replay in memory")
        root.require(service.snapshot.game_id === root.retainedActiveId,
          "clearing history changed the active game")
        root.require(service.snapshot.moves.length === 1,
          "clearing history changed active-game moves")
        var repeatedClear = service.clearHistory()
        root.require(repeatedClear.ok, "empty history clear failed")
        root.require(repeatedClear.code === "HISTORY_ALREADY_EMPTY",
          "empty history clear was not idempotent")
        running = false
        Qt.quit()
      }
    }
  }
}
