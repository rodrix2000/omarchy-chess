pragma ComponentBehavior: Bound
import QtQuick
import qs.Commons

Rectangle {
  id: root

  property var moves: []
  property int selectedPly: 0
  property bool replayMode: false
  property bool followLatest: !replayMode
  property string emptyText: "Moves will appear here"

  readonly property var rowModel: pairMoves(moves)

  signal plySelected(int ply)

  function pairMoves(source) {
    var input = Array.isArray(source) ? source : []
    var output = []
    for (var index = 0; index < input.length; index++) {
      var item = input[index] || {}
      if (item.white !== undefined || item.black !== undefined) {
        output.push({
          number: Number(item.number || item.move_number || output.length + 1),
          white: String(item.white || ""),
          black: String(item.black || ""),
          whitePly: Number(item.white_ply || (output.length * 2 + 1)),
          blackPly: item.black ? Number(item.black_ply || (output.length * 2 + 2)) : 0
        })
        continue
      }

      var ply = Number(item.ply || index + 1)
      var moveNumber = Math.floor((ply + 1) / 2)
      if (ply % 2 === 1) {
        output.push({
          number: moveNumber,
          white: String(item.san || item.notation || ""),
          black: "",
          whitePly: ply,
          blackPly: 0
        })
      } else {
        var row = output.length > 0 && output[output.length - 1].number === moveNumber
          ? output[output.length - 1] : null
        if (!row) {
          row = { number: moveNumber, white: "", black: "", whitePly: 0, blackPly: 0 }
          output.push(row)
        }
        row.black = String(item.san || item.notation || "")
        row.blackPly = ply
      }
    }
    return output
  }

  function selectPly(ply) {
    if (ply <= 0) return
    selectedPly = ply
    plySelected(ply)
  }

  function followEnd() {
    if (followLatest && list.count > 0) list.positionViewAtEnd()
  }

  onRowModelChanged: Qt.callLater(followEnd)

  implicitWidth: Style.space(300)
  implicitHeight: Style.space(300)
  radius: Math.max(7, Style.cornerRadius)
  color: Qt.rgba(Color.foreground.r, Color.foreground.g, Color.foreground.b, 0.035)
  border.width: 1
  border.color: Qt.rgba(Color.foreground.r, Color.foreground.g,
                        Color.foreground.b, 0.18)
  clip: true

  Accessible.role: Accessible.List
  Accessible.name: "Move list"
  Accessible.description: replayMode
    ? "Select a move to review that position" : "Moves played in this game"

  Rectangle {
    id: header
    anchors.left: parent.left
    anchors.right: parent.right
    anchors.top: parent.top
    height: Math.max(34, Style.space(34))
    color: Qt.rgba(Color.foreground.r, Color.foreground.g, Color.foreground.b, 0.05)

    Row {
      anchors.fill: parent
      anchors.leftMargin: Style.space(10)
      anchors.rightMargin: Style.space(10)

      Text {
        width: Style.space(38)
        anchors.verticalCenter: parent.verticalCenter
        text: "#"
        color: Color.muted
        font.family: Style.fontFamily
        font.pixelSize: Style.fontPx(0.833)
        font.weight: Font.DemiBold
      }
      Text {
        width: (parent.width - Style.space(38)) / 2
        anchors.verticalCenter: parent.verticalCenter
        text: "WHITE"
        color: Color.muted
        font.family: Style.fontFamily
        font.pixelSize: Style.fontPx(0.833)
        font.weight: Font.DemiBold
      }
      Text {
        width: (parent.width - Style.space(38)) / 2
        anchors.verticalCenter: parent.verticalCenter
        text: "BLACK"
        color: Color.muted
        font.family: Style.fontFamily
        font.pixelSize: Style.fontPx(0.833)
        font.weight: Font.DemiBold
      }
    }
  }

  ListView {
    id: list
    anchors.left: parent.left
    anchors.right: parent.right
    anchors.top: header.bottom
    anchors.bottom: parent.bottom
    clip: true
    boundsBehavior: Flickable.StopAtBounds
    model: root.rowModel

    delegate: Item {
      id: moveRow
      required property int index
      required property var modelData

      width: list.width
      height: Math.max(44, Style.space(44))

      readonly property var rowData: modelData
      readonly property bool alternate: index % 2 === 1

      Rectangle {
        anchors.fill: parent
        color: moveRow.alternate
          ? Qt.rgba(Color.foreground.r, Color.foreground.g, Color.foreground.b, 0.025)
          : "transparent"
      }

      Text {
        width: Style.space(38)
        anchors.left: parent.left
        anchors.leftMargin: Style.space(10)
        anchors.verticalCenter: parent.verticalCenter
        text: String(moveRow.rowData.number) + "."
        color: Color.muted
        font.family: Style.fontFamily
        font.pixelSize: Style.fontPx(0.917)
      }

      FocusScope {
        id: whiteMove
        x: Style.space(48)
        width: (parent.width - Style.space(58)) / 2
        height: parent.height
        activeFocusOnTab: moveRow.rowData.whitePly > 0

        Accessible.role: Accessible.ListItem
        Accessible.name: "Move " + moveRow.rowData.number + ", White "
          + (moveRow.rowData.white || "not yet moved")
        Accessible.focusable: moveRow.rowData.whitePly > 0
        Accessible.focused: activeFocus
        Accessible.selected: root.selectedPly === moveRow.rowData.whitePly

        Rectangle {
          anchors.fill: parent
          anchors.margins: 3
          radius: 5
          color: root.selectedPly === moveRow.rowData.whitePly
            ? Style.selectedAccentFill
            : whiteMove.activeFocus || whitePointer.containsMouse
              ? Style.hoverFill : "transparent"
          border.width: whiteMove.activeFocus ? 2 : 0
          border.color: Color.accent
        }

        Text {
          anchors.left: parent.left
          anchors.leftMargin: Style.space(10)
          anchors.verticalCenter: parent.verticalCenter
          text: moveRow.rowData.white
          color: Color.foreground
          font.family: Style.fontFamily
          font.pixelSize: Style.fontPx(1)
          font.weight: root.selectedPly === moveRow.rowData.whitePly
            ? Font.DemiBold : Font.Normal
        }

        Keys.onReturnPressed: root.selectPly(moveRow.rowData.whitePly)
        Keys.onEnterPressed: root.selectPly(moveRow.rowData.whitePly)
        Keys.onSpacePressed: root.selectPly(moveRow.rowData.whitePly)

        MouseArea {
          id: whitePointer
          anchors.fill: parent
          enabled: moveRow.rowData.whitePly > 0
          hoverEnabled: true
          cursorShape: enabled ? Qt.PointingHandCursor : Qt.ArrowCursor
          onClicked: {
            whiteMove.forceActiveFocus()
            root.selectPly(moveRow.rowData.whitePly)
          }
        }
      }

      FocusScope {
        id: blackMove
        anchors.left: whiteMove.right
        anchors.right: parent.right
        anchors.rightMargin: Style.space(10)
        height: parent.height
        activeFocusOnTab: moveRow.rowData.blackPly > 0

        Accessible.role: Accessible.ListItem
        Accessible.name: "Move " + moveRow.rowData.number + ", Black "
          + (moveRow.rowData.black || "not yet moved")
        Accessible.focusable: moveRow.rowData.blackPly > 0
        Accessible.focused: activeFocus
        Accessible.selected: root.selectedPly === moveRow.rowData.blackPly

        Rectangle {
          anchors.fill: parent
          anchors.margins: 3
          radius: 5
          color: root.selectedPly === moveRow.rowData.blackPly
            ? Style.selectedAccentFill
            : blackMove.activeFocus || blackPointer.containsMouse
              ? Style.hoverFill : "transparent"
          border.width: blackMove.activeFocus ? 2 : 0
          border.color: Color.accent
        }

        Text {
          anchors.left: parent.left
          anchors.leftMargin: Style.space(10)
          anchors.verticalCenter: parent.verticalCenter
          text: moveRow.rowData.black
          color: Color.foreground
          font.family: Style.fontFamily
          font.pixelSize: Style.fontPx(1)
          font.weight: root.selectedPly === moveRow.rowData.blackPly
            ? Font.DemiBold : Font.Normal
        }

        Keys.onReturnPressed: root.selectPly(moveRow.rowData.blackPly)
        Keys.onEnterPressed: root.selectPly(moveRow.rowData.blackPly)
        Keys.onSpacePressed: root.selectPly(moveRow.rowData.blackPly)

        MouseArea {
          id: blackPointer
          anchors.fill: parent
          enabled: moveRow.rowData.blackPly > 0
          hoverEnabled: true
          cursorShape: enabled ? Qt.PointingHandCursor : Qt.ArrowCursor
          onClicked: {
            blackMove.forceActiveFocus()
            root.selectPly(moveRow.rowData.blackPly)
          }
        }
      }
    }
  }

  Text {
    anchors.centerIn: list
    visible: root.rowModel.length === 0
    text: root.emptyText
    color: Color.muted
    font.family: Style.fontFamily
    font.pixelSize: Style.fontPx(1)
  }
}
