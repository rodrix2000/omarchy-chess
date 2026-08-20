import QtQuick

Item {
  id: root

  property string pieceColor: "white"
  property string pieceType: "pawn"
  property string square: ""
  property url source: ""
  property bool draggable: false
  property bool reducedMotion: false
  property bool dragActive: false
  readonly property bool hasNamedPiece: /^(white|black)$/.test(root.pieceColor)
    && /^(king|queen|rook|bishop|knight|pawn)$/.test(root.pieceType)
  readonly property url resolvedSource: root.source.toString() !== ""
    ? root.source
    : root.hasNamedPiece
      ? Qt.resolvedUrl("../assets/pieces/classic/" + root.pieceColor
        + "-" + root.pieceType + ".svg")
      : ""

  readonly property string accessibleName: {
    var colorName = pieceColor === "black" ? "Black" : "White"
    var typeName = pieceType || "piece"
    return colorName + " " + typeName + (square ? " on " + square : "")
  }

  signal activated()
  signal dragStarted(real sceneX, real sceneY)
  signal dragMoved(real sceneX, real sceneY)
  signal dragEnded(real sceneX, real sceneY)

  function glyphFor(colorName, typeName) {
    var white = {
      king: "♔", queen: "♕", rook: "♖",
      bishop: "♗", knight: "♘", pawn: "♙"
    }
    var black = {
      king: "♚", queen: "♛", rook: "♜",
      bishop: "♝", knight: "♞", pawn: "♟"
    }
    var set = colorName === "black" ? black : white
    return set[typeName] || "?"
  }

  Accessible.role: root.draggable ? Accessible.Button : Accessible.Graphic
  Accessible.name: accessibleName
  Accessible.description: root.draggable
    ? "Activate to select, or drag to a legal destination" : "Chess piece"

  Image {
    id: asset
    anchors.fill: parent
    anchors.margins: parent.width * 0.08
    source: root.resolvedSource
    visible: status === Image.Ready
    fillMode: Image.PreserveAspectFit
    asynchronous: true
    cache: true
  }

  Text {
    anchors.centerIn: parent
    visible: !asset.visible
    text: root.glyphFor(root.pieceColor, root.pieceType)
    color: root.pieceColor === "white" ? "#f5f3eb" : "#17191b"
    style: Text.Outline
    styleColor: root.pieceColor === "white" ? "#25282b" : "#e2e3de"
    font.family: "sans-serif"
    font.pixelSize: Math.max(18, Math.floor(root.width * 0.76))
    font.weight: Font.Normal
  }

  scale: dragActive && !reducedMotion ? 1.06 : 1
  opacity: dragActive ? 0.78 : 1

  Behavior on scale {
    enabled: !root.reducedMotion
    NumberAnimation { duration: 90 }
  }

  MouseArea {
    id: pointer
    anchors.fill: parent
    enabled: root.enabled
    hoverEnabled: true
    cursorShape: root.draggable ? Qt.OpenHandCursor : Qt.PointingHandCursor

    property real pressX: 0
    property real pressY: 0
    property bool moved: false

    onPressed: function(mouse) {
      pressX = mouse.x
      pressY = mouse.y
      moved = false
    }

    onPositionChanged: function(mouse) {
      if (!pressed || !root.draggable) return
      var deltaX = mouse.x - pressX
      var deltaY = mouse.y - pressY
      if (!moved && Math.sqrt(deltaX * deltaX + deltaY * deltaY) >= 6) {
        moved = true
        root.dragActive = true
        var startPoint = pointer.mapToItem(null, mouse.x, mouse.y)
        root.dragStarted(startPoint.x, startPoint.y)
      }
      if (moved) {
        var movePoint = pointer.mapToItem(null, mouse.x, mouse.y)
        root.dragMoved(movePoint.x, movePoint.y)
      }
    }

    onReleased: function(mouse) {
      if (moved) {
        var endPoint = pointer.mapToItem(null, mouse.x, mouse.y)
        root.dragActive = false
        root.dragEnded(endPoint.x, endPoint.y)
      } else {
        root.activated()
      }
      moved = false
    }

    onCanceled: {
      if (moved) root.dragEnded(-1, -1)
      root.dragActive = false
      moved = false
    }
  }
}
