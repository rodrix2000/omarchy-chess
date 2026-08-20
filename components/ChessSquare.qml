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
  property string fileLabel: ""
  property string rankLabel: ""
  property color lightColor: "#d8d9d3"
  property color darkColor: "#70777c"

  readonly property string pieceColor: piece && piece.color
    ? String(piece.color) : ""
  readonly property string pieceType: piece && (piece.piece || piece.type)
    ? String(piece.piece || piece.type) : ""
  readonly property color markerColor: highContrast ? Color.foreground : Color.accent

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

  color: isLight ? lightColor : darkColor
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

  Rectangle {
    anchors.centerIn: parent
    width: Math.max(10, parent.width * (root.highContrast ? 0.24 : 0.19))
    height: width
    radius: width / 2
    visible: root.isLegal && !root.isCapture
    color: root.markerColor
    border.width: root.highContrast ? 2 : 0
    border.color: Color.background
  }

  Rectangle {
    anchors.centerIn: parent
    width: parent.width * (root.highContrast ? 0.72 : 0.64)
    height: width
    radius: width / 2
    visible: root.isLegal && root.isCapture
    color: "transparent"
    border.width: root.highContrast ? 5 : 4
    border.color: root.markerColor
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
    anchors.fill: parent
    anchors.margins: root.highContrast ? 2 : 3
    visible: root.isCursor
    color: "transparent"
    border.width: root.highContrast ? 4 : 3
    border.color: Color.foreground

    Rectangle {
      anchors.fill: parent
      anchors.margins: root.highContrast ? 5 : 4
      color: "transparent"
      border.width: 2
      border.color: Color.background
    }
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
