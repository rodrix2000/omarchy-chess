import QtQuick
import qs.Commons

Rectangle {
  id: root

  property string side: "white"
  property real remainingMs: -1
  property string formattedText: ""
  property bool running: false
  property bool urgent: false
  property bool paused: false
  property bool clockEnabled: remainingMs >= 0

  readonly property string displayText: formattedText || formatRemaining(remainingMs)
  readonly property string stateText: !clockEnabled ? "UNTIMED"
    : paused ? "PAUSED" : urgent ? "LOW TIME" : running ? "RUNNING" : "WAITING"

  function formatRemaining(milliseconds) {
    if (!clockEnabled || !isFinite(milliseconds) || milliseconds < 0) return "—"
    var totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000))
    var hours = Math.floor(totalSeconds / 3600)
    var minutes = Math.floor((totalSeconds % 3600) / 60)
    var seconds = totalSeconds % 60
    var secondsText = seconds < 10 ? "0" + seconds : String(seconds)
    if (hours > 0) {
      var minutesText = minutes < 10 ? "0" + minutes : String(minutes)
      return hours + ":" + minutesText + ":" + secondsText
    }
    return minutes + ":" + secondsText
  }

  function spokenRemaining(milliseconds) {
    if (!clockEnabled || milliseconds < 0) return "untimed"
    var totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000))
    var minutes = Math.floor(totalSeconds / 60)
    var seconds = totalSeconds % 60
    if (minutes > 0 && seconds > 0)
      return minutes + " minutes " + seconds + " seconds"
    if (minutes > 0) return minutes + " minutes"
    return seconds + " seconds"
  }

  implicitWidth: Style.space(178)
  implicitHeight: Math.max(64, Style.space(64))
  radius: Math.max(7, Style.cornerRadius)
  color: running
    ? Qt.rgba(Color.accent.r, Color.accent.g, Color.accent.b, 0.12)
    : Qt.rgba(Color.foreground.r, Color.foreground.g, Color.foreground.b, 0.05)
  border.width: running || urgent ? 2 : 1
  border.color: urgent ? Color.urgent : running ? Color.accent
    : Qt.rgba(Color.foreground.r, Color.foreground.g, Color.foreground.b, 0.24)

  Accessible.role: Accessible.StaticText
  Accessible.name: (side === "black" ? "Black" : "White") + " clock, "
    + spokenRemaining(remainingMs) + ", " + stateText.toLowerCase()
  Accessible.description: "Authoritative chess clock display"

  Column {
    anchors.left: parent.left
    anchors.leftMargin: Style.space(12)
    anchors.verticalCenter: parent.verticalCenter
    spacing: 1

    Text {
      text: root.displayText
      color: root.urgent ? Color.urgent : Color.foreground
      font.family: Style.fontFamily
      font.pixelSize: Math.max(24, Style.fontPx(2))
      font.weight: root.running || root.urgent ? Font.Bold : Font.DemiBold
    }

    Text {
      text: root.stateText
      color: root.urgent ? Color.urgent : root.running ? Color.accent : Color.muted
      font.family: Style.fontFamily
      font.pixelSize: Style.fontPx(0.833)
      font.weight: Font.DemiBold
      font.letterSpacing: 0.6
    }
  }

  Text {
    anchors.right: parent.right
    anchors.rightMargin: Style.space(12)
    anchors.verticalCenter: parent.verticalCenter
    visible: root.urgent
    text: "!"
    color: Color.urgent
    font.family: Style.fontFamily
    font.pixelSize: Style.fontPx(1.333)
    font.weight: Font.Bold
  }
}
