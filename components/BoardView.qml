pragma ComponentBehavior: Bound
import QtQuick
import qs.Commons

FocusScope {
  id: root

  property var pieces: []
  property string orientation: "white"
  property string selectedSquare: ""
  property string cursorSquare: ""
  property var legalMoves: []
  property var lastMove: null
  property string checkedKingSquare: ""
  property bool inputEnabled: true
  property bool reducedMotion: false
  property bool highContrast: false
  property bool showCoordinates: true
  property bool showLegalMoves: true
  property string boardTheme: "charcoal"

  readonly property int boardSize: Math.max(0, Math.floor(Math.min(width, height)))
  readonly property string normalizedBoardTheme:
    /^(charcoal|green|ivory)$/.test(root.boardTheme)
      ? root.boardTheme : "charcoal"
  readonly property url boardTextureSource: Qt.resolvedUrl(
    "../assets/boards/" + root.normalizedBoardTheme + ".png")
  readonly property rect boardTextureClip: {
    if (root.normalizedBoardTheme === "green")
      return Qt.rect(53, 53, 1149, 1149)
    if (root.normalizedBoardTheme === "ivory")
      return Qt.rect(30, 30, 1194, 1194)
    return Qt.rect(39, 43, 1177, 1173)
  }
  readonly property color lightSquareColor:
    root.normalizedBoardTheme === "green" ? "#e0d09f"
      : root.normalizedBoardTheme === "ivory" ? "#e7c392" : "#c1b8a9"
  readonly property color darkSquareColor:
    root.normalizedBoardTheme === "green" ? "#193e1b"
      : root.normalizedBoardTheme === "ivory" ? "#703e1f" : "#3a3d42"
  readonly property color boardFrameColor:
    root.normalizedBoardTheme === "green" ? "#9a783a"
      : root.normalizedBoardTheme === "ivory" ? "#a86f35" : "#b8a27d"
  readonly property bool boardTextureReady: boardTexture.status === Image.Ready
  property string draggedSquare: ""

  signal squareActivated(string square)
  signal moveRequested(string from, string to)
  signal promotionRequested(string from, string to)
  signal flipRequested()
  signal cursorMoved(string square)
  signal cancelRequested()

  function normalizedOrientation() {
    return orientation === "black" ? "black" : "white"
  }

  function squareAtVisual(visualIndex) {
    var row = Math.floor(visualIndex / 8)
    var column = visualIndex % 8
    var whiteBottom = normalizedOrientation() === "white"
    var fileIndex = whiteBottom ? column : 7 - column
    var rank = whiteBottom ? 8 - row : row + 1
    return String.fromCharCode(97 + fileIndex) + String(rank)
  }

  function visualIndexForSquare(square) {
    if (!/^[a-h][1-8]$/.test(String(square || "").toLowerCase())) return -1
    var normalized = String(square).toLowerCase()
    var fileIndex = normalized.charCodeAt(0) - 97
    var rank = Number(normalized.charAt(1))
    if (normalizedOrientation() === "black")
      return (rank - 1) * 8 + (7 - fileIndex)
    return (8 - rank) * 8 + fileIndex
  }

  function pieceAt(square) {
    var source = Array.isArray(pieces) ? pieces : []
    for (var index = 0; index < source.length; index++) {
      if (source[index] && String(source[index].square).toLowerCase() === square)
        return source[index]
    }
    return null
  }

  function legalAt(square) {
    var source = Array.isArray(legalMoves) ? legalMoves : []
    var state = { legal: false, capture: false, promotion: false }
    for (var index = 0; index < source.length; index++) {
      var move = source[index]
      var destination = ""
      if (typeof move === "string") destination = move.length >= 4 ? move.substr(2, 2) : move
      else if (move) destination = String(move.to || move.square || "")
      if (destination.toLowerCase() !== square) continue
      state.legal = true
      if (move && typeof move === "object") {
        state.capture = Boolean(move.captured || move.capture)
        if (Array.isArray(move.flags))
          state.capture = state.capture || move.flags.indexOf("capture") >= 0
            || move.flags.indexOf("en-passant") >= 0
        else if (typeof move.flags === "string")
          state.capture = state.capture || move.flags.indexOf("c") >= 0
            || move.flags.indexOf("e") >= 0
        state.promotion = state.promotion || Boolean(move.promotion)
      } else if (typeof move === "string" && move.length > 4) {
        state.promotion = true
      }
    }
    return state
  }

  function isLastMoveSquare(square) {
    if (!lastMove) return false
    if (typeof lastMove === "string")
      return lastMove.substr(0, 2) === square || lastMove.substr(2, 2) === square
    if (typeof lastMove.uci === "string")
      return lastMove.uci.substr(0, 2) === square || lastMove.uci.substr(2, 2) === square
    return String(lastMove.from || "").toLowerCase() === square
      || String(lastMove.to || "").toLowerCase() === square
  }

  function ensureCursor() {
    if (visualIndexForSquare(cursorSquare) >= 0) return
    cursorSquare = normalizedOrientation() === "black" ? "h8" : "a1"
    cursorMoved(cursorSquare)
  }

  function setCursor(square) {
    if (visualIndexForSquare(square) < 0) return
    cursorSquare = String(square).toLowerCase()
    cursorMoved(cursorSquare)
  }

  function activateSquare(square) {
    if (!inputEnabled) return
    root.forceActiveFocus()
    setCursor(square)
    squareActivated(square)
    if (!selectedSquare || selectedSquare === square) return
    var state = legalAt(square)
    if (!state.legal) return
    if (state.promotion) promotionRequested(selectedSquare, square)
    else moveRequested(selectedSquare, square)
  }

  function moveCursorBy(rowDelta, columnDelta) {
    ensureCursor()
    var current = visualIndexForSquare(cursorSquare)
    var row = Math.floor(current / 8)
    var column = current % 8
    row = Math.max(0, Math.min(7, row + rowDelta))
    column = Math.max(0, Math.min(7, column + columnDelta))
    setCursor(squareAtVisual(row * 8 + column))
  }

  function requestDrop(from, sceneX, sceneY) {
    draggedSquare = ""
    var local = boardGrid.mapFromItem(null, sceneX, sceneY)
    if (local.x < 0 || local.y < 0 || local.x >= boardGrid.width
        || local.y >= boardGrid.height) return
    var column = Math.min(7, Math.floor(local.x / (boardGrid.width / 8)))
    var row = Math.min(7, Math.floor(local.y / (boardGrid.height / 8)))
    var destination = squareAtVisual(row * 8 + column)
    setCursor(destination)
    var state = legalAt(destination)
    if (!state.legal || destination === from) return
    if (state.promotion) promotionRequested(from, destination)
    else moveRequested(from, destination)
  }

  implicitWidth: Style.space(520)
  implicitHeight: implicitWidth
  activeFocusOnTab: inputEnabled

  Accessible.role: Accessible.Table
  Accessible.name: "Chessboard, " + (normalizedOrientation() === "black"
    ? "Black" : "White") + " at the bottom"
  Accessible.description: inputEnabled
    ? "Use arrow keys or H J K L to move the cursor. Press Enter or Space to activate a square."
    : "Read-only chessboard"
  Accessible.focusable: inputEnabled
  Accessible.focused: activeFocus

  Keys.onPressed: function(event) {
    if (!root.inputEnabled) return
    if (event.key === Qt.Key_Left || event.key === Qt.Key_H) {
      root.moveCursorBy(0, -1)
    } else if (event.key === Qt.Key_Right || event.key === Qt.Key_L) {
      root.moveCursorBy(0, 1)
    } else if (event.key === Qt.Key_Up || event.key === Qt.Key_K) {
      root.moveCursorBy(-1, 0)
    } else if (event.key === Qt.Key_Down || event.key === Qt.Key_J) {
      root.moveCursorBy(1, 0)
    } else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter
               || event.key === Qt.Key_Space) {
      root.ensureCursor()
      root.activateSquare(root.cursorSquare)
    } else if (event.key === Qt.Key_Escape) {
      root.cancelRequested()
    } else if (event.key === Qt.Key_F) {
      root.flipRequested()
    } else {
      return
    }
    event.accepted = true
  }

  Rectangle {
    width: root.boardSize + (root.highContrast ? 8 : 4)
    height: width
    anchors.centerIn: parent
    color: Color.background
    border.width: root.highContrast ? 4 : 2
    border.color: root.activeFocus ? Color.accent
      : root.boardFrameColor

    Image {
      id: boardTexture
      width: root.boardSize
      height: root.boardSize
      anchors.centerIn: parent
      source: root.boardTextureSource
      sourceClipRect: root.boardTextureClip
      fillMode: Image.Stretch
      smooth: true
      mipmap: true
      asynchronous: true
      cache: true
    }

    Grid {
      id: boardGrid
      width: root.boardSize
      height: root.boardSize
      anchors.centerIn: parent
      columns: 8
      rows: 8

      Repeater {
        model: 64

        ChessSquare {
          required property int index

          readonly property int visualRow: Math.floor(index / 8)
          readonly property int visualColumn: index % 8
          readonly property string algebraicSquare: root.squareAtVisual(index)
          readonly property var legalState: root.legalAt(algebraicSquare)

          width: boardGrid.width / 8
          height: boardGrid.height / 8
          square: algebraicSquare
          piece: root.pieceAt(algebraicSquare)
          isLight: (visualRow + visualColumn) % 2 === 0
          isSelected: root.selectedSquare === algebraicSquare
            || root.draggedSquare === algebraicSquare
          isCursor: root.activeFocus && root.cursorSquare === algebraicSquare
          isLastMove: root.isLastMoveSquare(algebraicSquare)
          isChecked: root.checkedKingSquare === algebraicSquare
          isLegal: legalState.legal
          isCapture: legalState.capture
          showLegalHint: root.showLegalMoves
          inputEnabled: root.inputEnabled
          highContrast: root.highContrast
          reducedMotion: root.reducedMotion
          showFileLabel: root.showCoordinates && visualRow === 7
          showRankLabel: root.showCoordinates && visualColumn === 0
          fileLabel: algebraicSquare.charAt(0)
          rankLabel: algebraicSquare.charAt(1)
          lightColor: root.lightSquareColor
          darkColor: root.darkSquareColor
          texturedBackground: root.boardTextureReady

          onActivated: function(square) { root.activateSquare(square) }
          onDragStarted: function(square, sceneX, sceneY) {
            root.draggedSquare = square
            root.setCursor(square)
          }
          onDragMoved: function(square, sceneX, sceneY) {
            // Movement is intentionally visual-only. The service remains authoritative.
          }
          onDragEnded: function(square, sceneX, sceneY) {
            root.requestDrop(square, sceneX, sceneY)
          }
        }
      }
    }
  }
}
