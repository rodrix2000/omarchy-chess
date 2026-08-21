import QtQuick
import Quickshell
// Validation copies this harness to the plugin root as shell.qml. It plays
// the complete Opera Game through the real two-player Panel and Service.
import "." as ChessPlugin

ShellRoot {
  id: root

  property int phase: 0
  property int attempts: 0
  property int nextMove: 0
  property bool undoExercised: false
  property string completedGameId: ""
  property int moveEvents: 0
  property int captureEvents: 0
  property int castleEvents: 0
  property int checkEvents: 0
  property int completionEvents: 0
  readonly property int holdPly: Number(
    Quickshell.env("OMARCHY_CHESS_FULL_GAME_HOLD_PLY") || "-1")
  readonly property int testWidth: Number(
    Quickshell.env("OMARCHY_CHESS_FULL_GAME_WIDTH") || "960")
  readonly property int testHeight: Number(
    Quickshell.env("OMARCHY_CHESS_FULL_GAME_HEIGHT") || "720")

  readonly property var gameMoves: [
    { from: "e2", to: "e4", san: "e4" },
    { from: "e7", to: "e5", san: "e5" },
    { from: "g1", to: "f3", san: "Nf3" },
    { from: "d7", to: "d6", san: "d6" },
    { from: "d2", to: "d4", san: "d4" },
    { from: "c8", to: "g4", san: "Bg4" },
    { from: "d4", to: "e5", san: "dxe5" },
    { from: "g4", to: "f3", san: "Bxf3" },
    { from: "d1", to: "f3", san: "Qxf3" },
    { from: "d6", to: "e5", san: "dxe5" },
    { from: "f1", to: "c4", san: "Bc4" },
    { from: "g8", to: "f6", san: "Nf6" },
    { from: "f3", to: "b3", san: "Qb3" },
    { from: "d8", to: "e7", san: "Qe7" },
    { from: "b1", to: "c3", san: "Nc3" },
    { from: "c7", to: "c6", san: "c6" },
    { from: "c1", to: "g5", san: "Bg5" },
    { from: "b7", to: "b5", san: "b5" },
    { from: "c3", to: "b5", san: "Nxb5" },
    { from: "c6", to: "b5", san: "cxb5" },
    { from: "c4", to: "b5", san: "Bxb5+" },
    { from: "b8", to: "d7", san: "Nbd7" },
    { from: "e1", to: "c1", san: "O-O-O" },
    { from: "a8", to: "d8", san: "Rd8" },
    { from: "d1", to: "d7", san: "Rxd7" },
    { from: "d8", to: "d7", san: "Rxd7" },
    { from: "h1", to: "d1", san: "Rd1" },
    { from: "e7", to: "e6", san: "Qe6" },
    { from: "b5", to: "d7", san: "Bxd7+" },
    { from: "f6", to: "d7", san: "Nxd7" },
    { from: "b3", to: "b8", san: "Qb8+" },
    { from: "d7", to: "b8", san: "Nxb8" },
    { from: "d1", to: "d8", san: "Rd8#" }
  ]

  ChessPlugin.Service { id: service }

  ChessPlugin.Panel {
    id: panel
    service: service
    manifest: ({ id: "io.github.rodrix2000.chess", version: "1.0.5" })
    preferredWindowSize: Qt.size(root.testWidth, root.testHeight)
  }

  Connections {
    target: service
    function onGameEvent(event) {
      var type = String(event && event.type || "")
      var payload = event && event.payload ? event.payload : ({})
      if (type === "move-committed") {
        root.moveEvents++
        var san = String(payload.san || "")
        if (san.indexOf("x") >= 0) root.captureEvents++
        if (san.indexOf("O-O") === 0) root.castleEvents++
      } else if (type === "check") {
        root.checkEvents++
      } else if (type === "game-completed") {
        root.completionEvents++
      }
    }
  }

  function require(condition, message) {
    if (condition) return
    poll.running = false
    console.error("FULL_LOCAL_GAME_SMOKE_FAILURE", message,
      "phase=" + phase, "move=" + nextMove,
      "snapshot=" + JSON.stringify(service.snapshot))
    Qt.quit()
    throw new Error(message)
  }

  function pieceOn(square, color, piece) {
    var board = service.snapshot.board || []
    for (var index = 0; index < board.length; index++) {
      if (board[index].square === square)
        return board[index].color === color && board[index].piece === piece
    }
    return false
  }

  function playNextMove() {
    var expected = gameMoves[nextMove]
    panel.activateSquare(expected.from)
    require(panel.selectedSquare === expected.from,
      "could not select " + expected.from + " before " + expected.san)
    require(panel.isLegalTarget(expected.to),
      expected.san + " was missing from the legal destination hints")
    panel.activateSquare(expected.to)
    nextMove++
  }

  Timer {
    id: poll
    interval: 25
    repeat: true
    running: true

    onTriggered: {
      if (root.phase === 10) return
      root.attempts++
      if (root.attempts > 2000) {
        running = false
        throw new Error("Full local-game smoke timed out in phase " + root.phase
          + " at move " + root.nextMove + " busy=" + service.persistenceBusy)
      }

      if (root.phase === 0 && service.ready) {
        panel.open(JSON.stringify({ view: "home" }))
        root.require(panel.opened && panel.currentView === "home",
          "Home did not open before the two-player game")
        panel.beginGame({
          mode: "local",
          time_control: { base_ms: null, increment_ms: 0 },
          orientation: "white",
          players: {
            white: { name: "Paul Morphy" },
            black: { name: "Duke Karl / Count Isouard" }
          }
        })
        root.completedGameId = service.snapshot.game_id
        root.phase = 1
      } else if (root.phase === 1 && !service.persistenceBusy) {
        root.require(panel.currentView === "game" && panel.gameInputEnabled,
          "new local game did not enable the board")
        root.require(panel.responsiveMetrics.side_by_side
          === (panel.responsiveMetrics.window_width >= 720),
          "game did not select the layout for its compositor-assigned width")
        panel.activateSquare("e7")
        root.require(panel.selectedSquare === "",
          "the player could select the wrong side")
        panel.activateSquare("e2")
        panel.activateSquare("e5")
        root.require(panel.selectedSquare === "e2",
          "an illegal destination unexpectedly changed selection")
        root.require(panel.actionNotice.indexOf("not a legal destination") >= 0,
          "an illegal destination gave no visual feedback")
        panel.clearSelection()
        var paused = panel.pauseCurrentGame("user")
        root.require(paused.ok, "pause failed: " + paused.code)
        root.phase = 2
      } else if (root.phase === 2 && !service.persistenceBusy) {
        root.require(service.snapshot.status === "paused",
          "two-player game did not pause")
        root.require(!panel.gameInputEnabled, "paused board still accepted input")
        panel.activateSquare("e2")
        root.require(panel.selectedSquare === "", "paused input selected a piece")
        var resumed = service.resumeGame()
        root.require(resumed.ok, "resume failed: " + resumed.code)
        root.phase = 3
      } else if (root.phase === 3 && !service.persistenceBusy) {
        root.require(service.snapshot.status === "active-human",
          "two-player game did not resume")
        root.phase = 4
      } else if (root.phase === 4 && !service.persistenceBusy) {
        root.require(service.snapshot.moves.length === root.nextMove,
          "a persisted ply count did not match the played moves")
        if (root.nextMove > 0) {
          root.require(service.snapshot.moves[root.nextMove - 1].san
            === root.gameMoves[root.nextMove - 1].san,
            "SAN mismatch after " + root.gameMoves[root.nextMove - 1].san)
        }

        if (root.nextMove === root.holdPly) {
          console.log("FULL_LOCAL_GAME_READY_FOR_CAPTURE", root.nextMove,
            JSON.stringify(panel.responsiveMetrics))
          root.phase = 10
          return
        }

        if (root.nextMove === 3 && !root.undoExercised) {
          panel.openConfirmation("undo")
          root.require(panel.modalOpen && panel.confirmAction === "undo",
            "undo confirmation did not appear")
          panel.performConfirmedAction()
          root.undoExercised = true
          root.phase = 5
        } else if (root.nextMove === 21) {
          root.require(service.snapshot.in_check,
            "Bxb5+ did not publish the checked position")
          root.require(panel.checkedKingSquare === "e8",
            "the checked black king was not identified visually")
          root.playNextMove()
        } else if (root.nextMove === 23) {
          root.require(root.pieceOn("c1", "white", "king")
            && root.pieceOn("d1", "white", "rook"),
            "queenside castling did not place the king and rook correctly")
          panel.flipBoard()
          root.require(panel.boardOrientation === "black",
            "board flip did not switch orientation")
          panel.flipBoard()
          root.require(panel.boardOrientation === "white",
            "second board flip did not restore orientation")
          root.playNextMove()
        } else if (root.nextMove < root.gameMoves.length) {
          root.playNextMove()
        } else {
          root.phase = 6
        }
      } else if (root.phase === 5 && !service.persistenceBusy) {
        root.require(service.snapshot.moves.length === 2,
          "confirmed undo did not remove exactly one local ply")
        root.require(service.snapshot.turn === "white",
          "undo did not restore the correct side to move")
        root.nextMove = 2
        root.phase = 4
      } else if (root.phase === 6 && !service.persistenceBusy
                 && service.historySummary.total === 1) {
        root.require(service.snapshot.status === "completed",
          "checkmate did not complete the game")
        root.require(service.snapshot.result.reason === "checkmate"
          && service.snapshot.result.winner === "white"
          && service.snapshot.result.score === "1-0",
          "the Opera Game produced the wrong result")
        root.require(panel.statusText() === "Checkmate — White wins",
          "the completed-game banner has the wrong copy")
        root.require(panel.moveCountLabel(service.snapshot.moves.length)
          === "17 moves" && panel.moveCountLabel(1) === "1 move",
          "player-facing move totals counted plies instead of chess moves")
        root.require(panel.responsiveMetrics.rail_height + 1
          >= panel.responsiveMetrics.rail_implicit_height,
          "completed-game actions overflowed the visible rail")
        root.require(panel.capturedBy("white") !== ""
          && panel.capturedBy("black") !== "",
          "captured material did not remain visible at game end")
        root.require(root.moveEvents === root.gameMoves.length + 1,
          "move events did not include the replayed move after undo")
        root.require(root.captureEvents >= 10 && root.castleEvents === 1,
          "capture or castling event coverage was incomplete")
        root.require(root.checkEvents === 3 && root.completionEvents === 1,
          "check alerts or the checkmate event were not emitted exactly once")
        var copied = service.copyPgn(root.completedGameId)
        root.require(copied.ok, "completed PGN did not copy: " + copied.code)
        var exported = service.exportPgn(root.completedGameId, "")
        root.require(exported.ok, "completed PGN did not export: " + exported.code)
        root.phase = 7
      } else if (root.phase === 7 && !service.persistenceBusy
                 && service.lastExportPath !== "") {
        panel.openReplay(root.completedGameId)
        root.phase = 8
      } else if (root.phase === 8 && !service.persistenceBusy
                 && panel.currentView === "replay" && service.replaySnapshot) {
        root.require(service.replaySnapshot.frames.length
          === root.gameMoves.length + 1,
          "replay did not contain every full-game position")
        root.require(panel.replayPly === root.gameMoves.length,
          "replay did not open at the final position")
        panel.replayStep(-1)
        root.require(panel.replayPly === root.gameMoves.length - 1,
          "replay previous-step control failed")
        panel.replayStep(1)
        root.require(panel.replayFrame.fen === service.snapshot.fen,
          "final replay frame did not match the completed board")
        panel.replayOrientation = "black"
        root.require(panel.replayOrientation === "black",
          "replay orientation did not flip")
        panel.close()
        root.phase = 9
      } else if (root.phase === 9) {
        root.require(!panel.opened, "completed panel did not close")
        running = false
        Qt.quit()
      }
    }
  }
}
