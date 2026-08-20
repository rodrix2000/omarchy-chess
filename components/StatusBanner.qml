import QtQuick
import qs.Commons

Rectangle {
  id: root

  property string text: ""
  property string detail: ""
  property string kind: "info"
  property string iconText: ""

  readonly property bool urgentState: kind === "error" || kind === "check"
  readonly property color semanticColor: urgentState ? Color.urgent
    : kind === "saved" || kind === "result" ? Color.accent : Color.foreground
  readonly property string resolvedIcon: iconText || iconFor(kind)

  function iconFor(value) {
    if (value === "check") return "!"
    if (value === "thinking") return "…"
    if (value === "paused") return "Ⅱ"
    if (value === "saved") return "✓"
    if (value === "error") return "!"
    if (value === "result") return "◆"
    return "•"
  }

  implicitWidth: Style.space(280)
  implicitHeight: detail ? Math.max(64, content.implicitHeight + Style.space(20))
    : Math.max(44, content.implicitHeight + Style.space(16))
  radius: Math.max(7, Style.cornerRadius)
  color: Qt.rgba(semanticColor.r, semanticColor.g, semanticColor.b,
                 urgentState ? 0.15 : 0.09)
  border.width: urgentState ? 2 : 1
  border.color: Qt.rgba(semanticColor.r, semanticColor.g, semanticColor.b,
                        urgentState ? 1 : 0.52)

  Accessible.role: urgentState || kind === "result"
    ? Accessible.Alert : Accessible.StaticText
  Accessible.name: text
  Accessible.description: detail

  Row {
    id: content
    anchors.left: parent.left
    anchors.right: parent.right
    anchors.verticalCenter: parent.verticalCenter
    anchors.leftMargin: Style.space(12)
    anchors.rightMargin: Style.space(12)
    spacing: Style.space(10)

    Rectangle {
      width: Math.max(26, Style.space(26))
      height: width
      radius: width / 2
      color: Qt.rgba(root.semanticColor.r, root.semanticColor.g,
                     root.semanticColor.b, 0.18)
      anchors.verticalCenter: parent.verticalCenter

      Text {
        anchors.centerIn: parent
        text: root.resolvedIcon
        color: root.semanticColor
        font.family: Style.fontFamily
        font.pixelSize: Style.fontPx(1.167)
        font.weight: Font.Bold
      }
    }

    Column {
      width: Math.max(0, content.width - Style.space(36))
      anchors.verticalCenter: parent.verticalCenter
      spacing: 2

      Text {
        width: parent.width
        text: root.text
        color: Color.foreground
        font.family: Style.fontFamily
        font.pixelSize: Style.fontPx(1)
        font.weight: Font.DemiBold
        wrapMode: Text.WordWrap
      }

      Text {
        width: parent.width
        visible: root.detail !== ""
        text: root.detail
        color: Color.muted
        font.family: Style.fontFamily
        font.pixelSize: Style.fontPx(0.917)
        wrapMode: Text.WordWrap
      }
    }
  }
}
