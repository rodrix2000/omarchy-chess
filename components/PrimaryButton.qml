import QtQuick
import qs.Commons

FocusScope {
  id: root

  property string text: ""
  property string iconText: ""
  property string accessibleDescription: ""
  property bool busy: false
  property bool destructive: false

  readonly property color stateColor: destructive ? Color.urgent : Color.accent

  signal clicked()

  function trigger() {
    if (root.enabled && !root.busy) root.clicked()
  }

  implicitWidth: Math.max(Style.space(112), contentRow.implicitWidth + Style.space(32))
  implicitHeight: Math.max(44, Style.space(44))
  activeFocusOnTab: enabled
  opacity: enabled ? 1 : 0.58

  Accessible.role: Accessible.Button
  Accessible.name: text
  Accessible.description: accessibleDescription
  Accessible.focusable: enabled
  Accessible.focused: activeFocus

  Keys.onReturnPressed: trigger()
  Keys.onEnterPressed: trigger()
  Keys.onSpacePressed: trigger()

  Rectangle {
    anchors.fill: parent
    radius: Math.max(6, Style.cornerRadius)
    color: pointer.pressed
      ? Style.pressedFillFor(Color.background, root.stateColor, Color.urgent)
      : pointer.containsMouse || root.activeFocus
        ? Qt.lighter(root.stateColor, 1.12) : root.stateColor
    border.width: root.activeFocus ? Math.max(2, Style.focusBorderWidth) : 1
    border.color: root.activeFocus ? Color.foreground : root.stateColor

    Behavior on color {
      ColorAnimation { duration: 90 }
    }
  }

  Row {
    id: contentRow
    anchors.centerIn: parent
    spacing: Style.space(8)

    Text {
      visible: root.iconText !== "" || root.busy
      text: root.busy ? "…" : root.iconText
      color: Color.background
      font.family: Style.fontFamily
      font.pixelSize: Style.fontPx(1.167)
      font.weight: Font.DemiBold
      anchors.verticalCenter: parent.verticalCenter
    }

    Text {
      text: root.text
      color: Color.background
      font.family: Style.fontFamily
      font.pixelSize: Style.fontPx(1)
      font.weight: Font.DemiBold
      anchors.verticalCenter: parent.verticalCenter
    }
  }

  MouseArea {
    id: pointer
    anchors.fill: parent
    enabled: root.enabled && !root.busy
    hoverEnabled: true
    cursorShape: enabled ? Qt.PointingHandCursor : Qt.ArrowCursor
    onClicked: {
      root.forceActiveFocus()
      root.trigger()
    }
  }
}
