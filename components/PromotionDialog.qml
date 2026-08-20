pragma ComponentBehavior: Bound
import QtQuick
import qs.Commons

FocusScope {
  id: root

  property bool opened: false
  property string moverColor: "white"
  property string fromSquare: ""
  property string toSquare: ""
  property var returnFocusItem: null
  property int selectedIndex: 0
  readonly property var choices: [
    { type: "queen", label: "Queen", shortcut: "Q" },
    { type: "rook", label: "Rook", shortcut: "R" },
    { type: "bishop", label: "Bishop", shortcut: "B" },
    { type: "knight", label: "Knight", shortcut: "N" }
  ]

  signal chosen(string piece)
  signal canceled()

  function glyphFor(typeName) {
    var white = { queen: "♕", rook: "♖", bishop: "♗", knight: "♘" }
    var black = { queen: "♛", rook: "♜", bishop: "♝", knight: "♞" }
    return (moverColor === "black" ? black : white)[typeName]
  }

  function show(originItem) {
    returnFocusItem = originItem || null
    opened = true
  }

  function restoreFocus() {
    if (returnFocusItem && typeof returnFocusItem.forceActiveFocus === "function")
      returnFocusItem.forceActiveFocus()
  }

  function choose(piece) {
    opened = false
    chosen(piece)
    Qt.callLater(restoreFocus)
  }

  function reject() {
    opened = false
    canceled()
    Qt.callLater(restoreFocus)
  }

  visible: opened
  enabled: opened
  focus: opened
  z: 1010

  Accessible.role: Accessible.Dialog
  Accessible.name: "Choose promotion piece"
  Accessible.description: (fromSquare && toSquare)
    ? "Promote the pawn moving from " + fromSquare + " to " + toSquare
    : "Choose Queen, Rook, Bishop, or Knight"

  onOpenedChanged: {
    if (opened) {
      selectedIndex = 0
      Qt.callLater(function() { root.forceActiveFocus() })
    }
  }

  Keys.onPressed: function(event) {
    if (event.key === Qt.Key_Escape) {
      root.reject()
    } else if (event.key === Qt.Key_Left || event.key === Qt.Key_Backtab) {
      root.selectedIndex = (root.selectedIndex + 3) % 4
    } else if (event.key === Qt.Key_Right || event.key === Qt.Key_Tab) {
      root.selectedIndex = (root.selectedIndex + 1) % 4
    } else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter
               || event.key === Qt.Key_Space) {
      root.choose(root.choices[root.selectedIndex].type)
    } else if (event.key === Qt.Key_Q || event.key === Qt.Key_1) {
      root.choose("queen")
    } else if (event.key === Qt.Key_R || event.key === Qt.Key_2) {
      root.choose("rook")
    } else if (event.key === Qt.Key_B || event.key === Qt.Key_3) {
      root.choose("bishop")
    } else if (event.key === Qt.Key_N || event.key === Qt.Key_4) {
      root.choose("knight")
    } else {
      return
    }
    event.accepted = true
  }

  Rectangle {
    anchors.fill: parent
    color: Qt.rgba(Color.background.r, Color.background.g, Color.background.b, 0.76)

    MouseArea {
      anchors.fill: parent
      onClicked: root.reject()
    }

    Rectangle {
      width: Math.min(parent.width - Style.space(28), Style.space(500))
      height: Style.space(230)
      anchors.centerIn: parent
      radius: Math.max(10, Style.cornerRadius)
      color: Color.background
      border.width: 2
      border.color: Color.accent

      MouseArea {
        anchors.fill: parent
        onClicked: function(mouse) { mouse.accepted = true }
      }

      Column {
        anchors.fill: parent
        anchors.margins: Style.space(20)
        spacing: Style.space(14)

        Text {
          width: parent.width
          text: "Choose a promotion"
          color: Color.foreground
          font.family: Style.fontFamily
          font.pixelSize: Style.fontPx(1.333)
          font.weight: Font.DemiBold
          horizontalAlignment: Text.AlignHCenter
        }

        Text {
          width: parent.width
          text: "The clock continues until you choose. Press Q, R, B, or N."
          color: Color.muted
          font.family: Style.fontFamily
          font.pixelSize: Style.fontPx(0.917)
          wrapMode: Text.WordWrap
          horizontalAlignment: Text.AlignHCenter
        }

        Row {
          id: choicesRow
          width: parent.width
          spacing: Style.space(8)

          Repeater {
            model: root.choices

            SecondaryButton {
              required property int index
              required property var modelData

              width: (choicesRow.width - choicesRow.spacing * 3) / 4
              height: Math.max(72, Style.space(72))
              text: modelData.label + "  " + modelData.shortcut
              iconText: root.glyphFor(modelData.type)
              selected: root.selectedIndex === index
              accessibleDescription: "Promote to " + modelData.label
              onClicked: root.choose(modelData.type)
            }
          }
        }

        Text {
          width: parent.width
          text: "Escape cancels the uncommitted move"
          color: Color.muted
          font.family: Style.fontFamily
          font.pixelSize: Style.fontPx(0.833)
          horizontalAlignment: Text.AlignHCenter
        }
      }
    }
  }
}
