import QtQuick
import Quickshell
// Validation copies this harness to the plugin root as shell.qml. It drives
// the real Panel and Service through minimum, narrow, medium, default, and
// wide logical sizes, then commits a move to prove input remains connected.
import "." as ChessPlugin
import "components" as ChessUi

Item {
  id: root

  property int phase: 0
  property int attempts: 0
  property int settleTicks: 0
  property var measuredBoards: []
  readonly property bool holdOpen:
    Quickshell.env("OMARCHY_CHESS_RESPONSIVE_HOLD") === "1"
  readonly property int captureIndex: Math.max(0, Math.min(
    layoutCases.length - 1,
    Number(Quickshell.env("OMARCHY_CHESS_RESPONSIVE_INDEX") || "0")))
  readonly property var layoutCases: [
    { width: 640, height: 560, sideBySide: false, minimumBoard: 190 },
    { width: 704, height: 855, sideBySide: false, minimumBoard: 400 },
    { width: 800, height: 700, sideBySide: true, minimumBoard: 430 },
    { width: 960, height: 720, sideBySide: true, minimumBoard: 500 },
    { width: 1398, height: 822, sideBySide: true, minimumBoard: 620 }
  ]
  readonly property var pieceCases: [
    { color: "white", type: "king" }, { color: "black", type: "king" },
    { color: "white", type: "queen" }, { color: "black", type: "queen" },
    { color: "white", type: "rook" }, { color: "black", type: "rook" },
    { color: "white", type: "bishop" }, { color: "black", type: "bishop" },
    { color: "white", type: "knight" }, { color: "black", type: "knight" },
    { color: "white", type: "pawn" }, { color: "black", type: "pawn" }
  ]
  readonly property var boardThemes: ["charcoal", "green", "ivory"]

  ChessPlugin.Service { id: chessService }

  Repeater {
    id: panels
    model: root.holdOpen ? [root.layoutCases[root.captureIndex]] : root.layoutCases

    ChessPlugin.Panel {
      required property var modelData
      service: chessService
      manifest: ({ id: "io.github.rodrix2000.chess" })
      preferredWindowSize: Qt.size(modelData.width, modelData.height)
    }
  }

  Repeater {
    id: pieceSamples
    model: root.pieceCases

    ChessUi.ChessPiece {
      required property var modelData
      width: 64
      height: 64
      visible: false
      pieceColor: modelData.color
      pieceType: modelData.type
    }
  }

  Repeater {
    id: boardSamples
    model: root.boardThemes

    ChessUi.BoardView {
      required property string modelData
      width: 64
      height: 64
      visible: false
      boardTheme: modelData
      showCoordinates: false
      inputEnabled: false
    }
  }

  Repeater {
    id: homeSamples
    model: root.layoutCases

    ChessUi.HomeView {
      required property var modelData
      width: modelData.width - 40
      height: modelData.height - 120
      visible: false
      compactLayout: modelData.width < 720
      hasPlayableGame: true
      historyCount: 3
      game: ({
        mode: "computer",
        difficulty: "casual",
        turn: "white",
        status: "paused"
      })
    }
  }

  ChessUi.HomeView {
    id: emptyHomeSample
    width: 600
    height: 440
    visible: false
    compactLayout: true
    hasPlayableGame: false
  }

  ChessUi.ChessSquare {
    id: selectionSample
    width: 64
    height: 64
    visible: false
    square: "e2"
    piece: ({ square: "e2", color: "white", piece: "pawn" })
    isSelected: true
    isCursor: true
  }

  function require(condition, message) {
    if (condition) return
    poll.running = false
    var firstPanel = panels.itemAt(0)
    console.error("RESPONSIVE_PANEL_SMOKE_FAILURE", message,
      firstPanel ? JSON.stringify(firstPanel.responsiveMetrics) : "no panel")
    Qt.quit()
    throw new Error(message)
  }

  function validateCases() {
    measuredBoards = []
    for (var index = 0; index < layoutCases.length; index++) {
      var layoutCase = layoutCases[index]
      var panel = panels.itemAt(index)
      var metrics = panel.responsiveMetrics
      require(Math.abs(metrics.window_width - layoutCase.width) <= 2,
        "window width did not settle at " + layoutCase.width)
      require(Math.abs(metrics.window_height - layoutCase.height) <= 2,
        "window height did not settle at " + layoutCase.height)
      require(metrics.side_by_side === layoutCase.sideBySide,
        "wrong responsive mode at " + layoutCase.width)
      require(metrics.board_theme === "charcoal",
        "legacy/default settings did not resolve to the charcoal board")
      require(metrics.show_legal_moves === true,
        "legacy/default settings did not show legal move hints")
      require(metrics.board_size >= layoutCase.minimumBoard,
        "board is too small at " + layoutCase.width + "x" + layoutCase.height)
      require(metrics.board_size <= metrics.viewport_width + 1
        && metrics.board_size <= metrics.viewport_height + 1,
        "board exceeds its game viewport")
      if (metrics.compact) {
        require(metrics.rail_height + 1 >= metrics.rail_implicit_height,
          "compact rail content overflows its allocated height")
      }
      measuredBoards.push(metrics.board_size)
      console.log("RESPONSIVE_PANEL_CASE", layoutCase.width,
        layoutCase.height, JSON.stringify(metrics))

      var homeMetrics = homeSamples.itemAt(index).layoutMetrics
      console.log("RESPONSIVE_HOME_CASE", layoutCase.width,
        layoutCase.height, JSON.stringify(homeMetrics))
      require(homeMetrics.cards_columns === (layoutCase.width < 720 ? 1 : 2),
        "home mode cards use the wrong responsive columns")
      require(homeMetrics.active_card_visible,
        "home omitted the active-game card")
      require(homeMetrics.compact_navigation_visible === (layoutCase.width < 720),
        "home secondary navigation duplicates or disappears")
      require(homeMetrics.computer_card_height > 0
        && homeMetrics.computer_card_height < 210,
        "computer mode card is not content-sized")
      require(homeMetrics.local_card_height > 0
        && homeMetrics.local_card_height < 210,
        "two-player mode card is not content-sized")
    }
    require(measuredBoards[1] > measuredBoards[0],
      "narrow board did not grow with added height")
    require(measuredBoards[4] > measuredBoards[3],
      "wide board did not grow with the larger viewport")
    require(!emptyHomeSample.layoutMetrics.active_card_visible,
      "empty home rendered a resume card")
    for (var pieceIndex = 0; pieceIndex < pieceSamples.count; pieceIndex += 2) {
      var whitePiece = pieceSamples.itemAt(pieceIndex)
      var blackPiece = pieceSamples.itemAt(pieceIndex + 1)
      require(whitePiece.assetReady && blackPiece.assetReady,
        "bundled piece asset did not load")
      require(whitePiece.highQualityMinification
        && blackPiece.highQualityMinification,
        blackPiece.pieceType + " colors do not use mipmapped minification")
      require(Math.abs(whitePiece.renderedPieceHeight
        - blackPiece.renderedPieceHeight) < 0.01,
        blackPiece.pieceType + " colors do not share a visual height")
    }
    for (var boardIndex = 0; boardIndex < boardSamples.count; boardIndex++) {
      var boardSample = boardSamples.itemAt(boardIndex)
      require(boardSample.boardTextureReady,
        boardSample.boardTheme + " board texture did not load")
      require(boardSample.normalizedBoardTheme === root.boardThemes[boardIndex],
        "board theme normalization changed a supported theme")
    }
    require(!selectionSample.keyboardCursorOutlineVisible,
      "keyboard cursor overlaps the selected-piece treatment")
    selectionSample.isSelected = false
    require(selectionSample.keyboardCursorOutlineVisible,
      "keyboard cursor outline disappeared on an unselected square")
    selectionSample.isLegal = true
    selectionSample.showLegalHint = false
    require(!selectionSample.legalMoveMarkerVisible,
      "hidden legal move hint still renders a marker")
    require(selectionSample.isLegal,
      "hiding the legal move marker changed legal-square semantics")
    selectionSample.showLegalHint = true
    require(selectionSample.legalMoveMarkerVisible,
      "shown legal move hint does not render its marker")
    var playingPanel = panels.itemAt(0)
    playingPanel.activateSquare("e2")
    require(playingPanel.selectedSquare === "e2",
      "responsive board did not select e2")
    require(playingPanel.isLegalTarget("e4"),
      "responsive board omitted legal e4")
    playingPanel.activateSquare("e4")
    phase = 2
  }

  Timer {
    id: poll
    interval: 25
    repeat: true
    running: true

    onTriggered: {
      if (root.phase === 5) return
      root.attempts++
      if (root.attempts > 800) {
        running = false
        throw new Error("Responsive panel smoke timed out in phase " + root.phase)
      }

      if (root.phase === 0 && chessService.ready) {
        var playingPanel = panels.itemAt(0)
        playingPanel.open(JSON.stringify({ view: "home" }))
        playingPanel.beginGame({
          mode: "local",
          time_control: { base_ms: null, increment_ms: 0 },
          orientation: "white",
          players: {
            white: { name: "White" },
            black: { name: "Black" }
          }
        })
        root.phase = 1
      } else if (root.phase === 1 && !chessService.persistenceBusy) {
        if (root.holdOpen) {
          var capturePanel = panels.itemAt(0)
          capturePanel.activateSquare("e2")
          root.require(capturePanel.selectedSquare === "e2",
            "capture board did not select e2")
          capturePanel.activateSquare("e4")
          root.phase = 2
          return
        }
        for (var index = 1; index < panels.count; index++)
          panels.itemAt(index).open(JSON.stringify({ view: "game" }))
        root.phase = 4
      } else if (root.phase === 4) {
        root.settleTicks++
        if (root.settleTicks >= 8) root.validateCases()
      } else if (root.phase === 2 && !chessService.persistenceBusy) {
        root.require(chessService.snapshot.moves.length === 1,
          "responsive game move did not persist")
        root.require(chessService.snapshot.moves[0].uci === "e2e4",
          "responsive game committed the wrong move")
        if (root.holdOpen) {
          console.log("RESPONSIVE_PANEL_READY_FOR_CAPTURE")
          root.phase = 5
          return
        }
        for (var panelIndex = 0; panelIndex < panels.count; panelIndex++)
          panels.itemAt(panelIndex).close()
        root.phase = 3
      } else if (root.phase === 3 && !chessService.persistenceBusy) {
        root.require(chessService.snapshot.status === "paused",
          "responsive panel close did not pause the game")
        running = false
        Qt.quit()
      }
    }
  }
}
