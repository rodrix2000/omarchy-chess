import QtQuick
import qs.Commons

Rectangle {
  id: root

  property string square: ""
  property var piece: null
  property bool isLight: true
  property bool isSelected: false
  property bool isCursor: false
  property bool isLastMove: false
  property bool isChecked: false
  property bool isLegal: false
  property bool isCapture: false
  property bool inputEnabled: true
  property bool highContrast: false
  property bool reducedMotion: false
  property bool showFileLabel: false
  property bool showRankLabel: false
  property bool showLegalHint: true
  property bool texturedBackground: false
  property string fileLabel: ""
  property string rankLabel: ""
  property color lightColor: "#d8d9d3"
  property color darkColor: "#70777c"

  readonly property string pieceColor: piece && piece.color
    ? String(piece.color) : ""
  readonly property string pieceType: piece && (piece.piece || piece.type)
    ? String(piece.piece || piece.type) : ""
  readonly property color markerColor: highContrast ? Color.foreground : Color.accent
  readonly property bool keyboardCursorOutlineVisible: isCursor && !isSelected
  readonly property bool legalMoveMarkerVisible: isLegal && showLegalHint

  signal activated(string square)
  signal dragStarted(string square, real sceneX, real sceneY)
  signal dragMoved(string square, real sceneX, real sceneY)
  signal dragEnded(string square, real sceneX, real sceneY)

  function accessibleLabel() {
    var parts = [square ? square.toUpperCase() : "Unknown square"]
    parts.push(pieceType ? pieceColor + " " + pieceType : "empty")
    if (isSelected) parts.push("selected")
    if (isLegal) parts.push(isCapture ? "legal capture" : "legal move")
    if (isLastMove) parts.push("last move")
    if (isChecked) parts.push("in check")
    if (isCursor) parts.push("keyboard cursor")
    return parts.join(", ")
  }

  color: texturedBackground ? "transparent" : isLight ? lightColor : darkColor
  border.width: isChecked ? (highContrast ? 5 : 4)
    : isSelected ? (highContrast ? 4 : 3) : 0
  border.color: isChecked ? Color.urgent : Color.accent
  clip: true

  Accessible.role: Accessible.Button
  Accessible.name: accessibleLabel()
  Accessible.description: inputEnabled ? "Chess board square" : "Read-only chess board square"
  Accessible.focusable: false

  Rectangle {
    anchors.fill: parent
    anchors.margins: root.highContrast ? 5 : 4
    visible: root.isLastMove
    color: Qt.rgba(Color.accent.r, Color.accent.g, Color.accent.b,
                   root.highContrast ? 0.28 : 0.18)
    border.width: root.highContrast ? 3 : 2
    border.color: Color.accent
  }

  Text {
    anchors.right: parent.right
    anchors.top: parent.top
    anchors.margins: Math.max(2, parent.width * 0.045)
    visible: root.isLastMove
    text: "⌟"
    color: Color.accent
    font.family: Style.fontFamily
    font.pixelSize: Math.max(10, parent.width * 0.2)
    font.weight: Font.Bold
  }

  MouseArea {
    id: squarePointer
    anchors.fill: parent
    enabled: root.inputEnabled
    hoverEnabled: true
    cursorShape: enabled ? Qt.PointingHandCursor : Qt.ArrowCursor
    onClicked: root.activated(root.square)
  }

  Item {
    anchors.centerIn: parent
    width: Math.max(9, parent.width * (root.highContrast ? 0.2 : 0.16))
    height: width
    visible: root.legalMoveMarkerVisible && !root.isCapture

    Rectangle {
      anchors.fill: parent
      radius: width / 2
      color: Qt.rgba(root.markerColor.r, root.markerColor.g,
                     root.markerColor.b, root.highContrast ? 0.28 : 0.16)
      border.width: root.highContrast ? 2 : 1
      border.color: Qt.rgba(root.markerColor.r, root.markerColor.g,
                            root.markerColor.b, root.highContrast ? 1 : 0.72)
    }

    Rectangle {
      anchors.centerIn: parent
      width: Math.max(4, parent.width * 0.42)
      height: width
      radius: width / 2
      color: root.markerColor
    }
  }

  Item {
    id: captureHint
    anchors.fill: parent
    anchors.margins: Math.max(5, parent.width * 0.1)
    visible: root.legalMoveMarkerVisible && root.isCapture
    opacity: root.highContrast ? 1 : 0.88

    readonly property real stroke: root.highContrast ? 3
      : Math.max(2, root.width * 0.035)
    readonly property real arm: Math.max(9, root.width
      * (root.highContrast ? 0.24 : 0.2))

    Rectangle { anchors.left: parent.left; anchors.top: parent.top; width: captureHint.arm; height: captureHint.stroke; color: root.markerColor; radius: height / 2 }
    Rectangle { anchors.left: parent.left; anchors.top: parent.top; width: captureHint.stroke; height: captureHint.arm; color: root.markerColor; radius: width / 2 }
    Rectangle { anchors.right: parent.right; anchors.top: parent.top; width: captureHint.arm; height: captureHint.stroke; color: root.markerColor; radius: height / 2 }
    Rectangle { anchors.right: parent.right; anchors.top: parent.top; width: captureHint.stroke; height: captureHint.arm; color: root.markerColor; radius: width / 2 }
    Rectangle { anchors.left: parent.left; anchors.bottom: parent.bottom; width: captureHint.arm; height: captureHint.stroke; color: root.markerColor; radius: height / 2 }
    Rectangle { anchors.left: parent.left; anchors.bottom: parent.bottom; width: captureHint.stroke; height: captureHint.arm; color: root.markerColor; radius: width / 2 }
    Rectangle { anchors.right: parent.right; anchors.bottom: parent.bottom; width: captureHint.arm; height: captureHint.stroke; color: root.markerColor; radius: height / 2 }
    Rectangle { anchors.right: parent.right; anchors.bottom: parent.bottom; width: captureHint.stroke; height: captureHint.arm; color: root.markerColor; radius: width / 2 }
  }

  ChessPiece {
    id: pieceVisual
    anchors.fill: parent
    visible: root.pieceType !== ""
    pieceColor: root.pieceColor
    pieceType: root.pieceType
    square: root.square
    source: root.piece && root.piece.source ? root.piece.source : ""
    draggable: root.inputEnabled
    reducedMotion: root.reducedMotion
    onActivated: root.activated(root.square)
    onDragStarted: function(sceneX, sceneY) {
      root.dragStarted(root.square, sceneX, sceneY)
    }
    onDragMoved: function(sceneX, sceneY) {
      root.dragMoved(root.square, sceneX, sceneY)
    }
    onDragEnded: function(sceneX, sceneY) {
      root.dragEnded(root.square, sceneX, sceneY)
    }
  }

  Rectangle {
    id: cursorIndicator
    anchors.fill: parent
    anchors.margins: root.highContrast ? 3 : 4
    visible: root.keyboardCursorOutlineVisible
    color: "transparent"
    radius: Math.max(1, parent.width * 0.04)
    border.width: root.highContrast ? 3 : 2
    border.color: root.markerColor
  }

  Rectangle {
    width: Math.max(16, parent.width * 0.25)
    height: width
    radius: width / 2
    anchors.left: parent.left
    anchors.top: parent.top
    anchors.margins: Math.max(2, parent.width * 0.04)
    visible: root.isChecked
    color: Color.urgent

    Text {
      anchors.centerIn: parent
      text: "!"
      color: Color.background
      font.family: Style.fontFamily
      font.pixelSize: Math.max(10, parent.width * 0.68)
      font.weight: Font.Bold
    }
  }

  Text {
    anchors.left: parent.left
    anchors.top: parent.top
    anchors.margins: Math.max(2, parent.width * 0.035)
    visible: root.showRankLabel
    text: root.rankLabel
    color: root.isLight ? root.darkColor : root.lightColor
    style: Text.Outline
    styleColor: Qt.rgba(Color.background.r, Color.background.g, Color.background.b, 0.34)
    font.family: Style.fontFamily
    font.pixelSize: Math.max(9, parent.width * 0.16)
    font.weight: Font.DemiBold
  }

  Text {
    anchors.right: parent.right
    anchors.bottom: parent.bottom
    anchors.margins: Math.max(2, parent.width * 0.035)
    visible: root.showFileLabel
    text: root.fileLabel
    color: root.isLight ? root.darkColor : root.lightColor
    style: Text.Outline
    styleColor: Qt.rgba(Color.background.r, Color.background.g, Color.background.b, 0.34)
    font.family: Style.fontFamily
    font.pixelSize: Math.max(9, parent.width * 0.16)
    font.weight: Font.DemiBold
  }
}
