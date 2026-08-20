import QtQuick
import qs.Commons

FocusScope {
  id: root

  property string text: ""
  property string iconText: ""
  property string accessibleDescription: ""
  property bool busy: false
  property bool selected: false
  property bool destructive: false

  readonly property color stateColor: destructive ? Color.urgent : Color.accent

  signal clicked()

  function trigger() {
    if (root.enabled && !root.busy) root.clicked()
  }

  implicitWidth: Math.max(Style.space(104), contentRow.implicitWidth + Style.space(30))
  implicitHeight: Math.max(44, Style.space(44))
  activeFocusOnTab: enabled
  opacity: enabled ? 1 : 0.58

  Accessible.role: Accessible.Button
  Accessible.name: text
  Accessible.description: accessibleDescription
  Accessible.focusable: enabled
  Accessible.focused: activeFocus
  Accessible.selected: selected

  Keys.onReturnPressed: trigger()
  Keys.onEnterPressed: trigger()
  Keys.onSpacePressed: trigger()

  Rectangle {
    anchors.fill: parent
    radius: Math.max(6, Style.cornerRadius)
    color: pointer.pressed
      ? Style.pressedFillFor(Color.foreground, root.stateColor, Color.urgent)
      : root.selected
        ? Style.selectedFillFor(Color.foreground, root.stateColor, Color.urgent)
        : pointer.containsMouse || root.activeFocus
          ? Style.hoverFillFor(Color.foreground, root.stateColor, Color.urgent)
          : Style.normalFillFor(Color.foreground, root.stateColor, Color.urgent)
    border.width: root.activeFocus ? Math.max(2, Style.focusBorderWidth) : 1
    border.color: root.activeFocus || root.selected
      ? root.stateColor : Qt.rgba(Color.foreground.r, Color.foreground.g,
                                 Color.foreground.b, 0.32)

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
      color: root.destructive ? Color.urgent
        : root.selected ? Color.accent : Color.foreground
      font.family: Style.fontFamily
      font.pixelSize: Style.fontPx(1.167)
      font.weight: root.selected ? Font.DemiBold : Font.Normal
      anchors.verticalCenter: parent.verticalCenter
    }

    Text {
      text: root.text
      color: root.destructive ? Color.urgent
        : root.selected ? Color.accent : Color.foreground
      font.family: Style.fontFamily
      font.pixelSize: Style.fontPx(1)
      font.weight: root.selected ? Font.DemiBold : Font.Medium
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
