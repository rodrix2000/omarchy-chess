import QtQuick
import qs.Commons

FocusScope {
  id: root

  property bool opened: false
  property string title: "Confirm action"
  property string message: ""
  property string confirmText: "Confirm"
  property string cancelText: "Cancel"
  property bool destructive: false
  property var returnFocusItem: null
  property int selectedIndex: 0

  signal confirmed()
  signal canceled()

  function show(originItem) {
    returnFocusItem = originItem || null
    opened = true
  }

  function restoreFocus() {
    if (returnFocusItem && typeof returnFocusItem.forceActiveFocus === "function")
      returnFocusItem.forceActiveFocus()
  }

  function accept() {
    opened = false
    confirmed()
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
  z: 1000

  Accessible.role: Accessible.Dialog
  Accessible.name: title
  Accessible.description: message

  onOpenedChanged: {
    if (opened) {
      selectedIndex = destructive ? 0 : 1
      Qt.callLater(function() { root.forceActiveFocus() })
    }
  }

  Keys.onPressed: function(event) {
    if (event.key === Qt.Key_Escape) {
      root.reject()
    } else if (event.key === Qt.Key_Left || event.key === Qt.Key_Right
               || event.key === Qt.Key_Tab || event.key === Qt.Key_Backtab) {
      root.selectedIndex = root.selectedIndex === 0 ? 1 : 0
    } else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter
               || event.key === Qt.Key_Space) {
      if (root.selectedIndex === 0) root.reject()
      else root.accept()
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
      id: card
      width: Math.min(parent.width - Style.space(32), Style.space(460))
      height: dialogContent.implicitHeight + Style.space(40)
      anchors.centerIn: parent
      radius: Math.max(10, Style.cornerRadius)
      color: Color.background
      border.width: 1
      border.color: root.destructive ? Color.urgent : Color.accent

      MouseArea {
        anchors.fill: parent
        onClicked: function(mouse) { mouse.accepted = true }
      }

      Column {
        id: dialogContent
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.verticalCenter: parent.verticalCenter
        anchors.leftMargin: Style.space(20)
        anchors.rightMargin: Style.space(20)
        spacing: Style.space(14)

        Text {
          width: parent.width
          text: root.title
          color: Color.foreground
          font.family: Style.fontFamily
          font.pixelSize: Style.fontPx(1.333)
          font.weight: Font.DemiBold
          wrapMode: Text.WordWrap
        }

        Text {
          width: parent.width
          text: root.message
          color: Color.muted
          font.family: Style.fontFamily
          font.pixelSize: Style.fontPx(1)
          wrapMode: Text.WordWrap
        }

        Row {
          anchors.right: parent.right
          spacing: Style.space(10)

          SecondaryButton {
            id: cancelButton
            text: root.cancelText
            selected: root.selectedIndex === 0
            accessibleDescription: "Safe action. Close this confirmation without making changes."
            onClicked: root.reject()
          }

          PrimaryButton {
            id: confirmButton
            text: root.confirmText
            destructive: root.destructive
            accessibleDescription: root.message
            onClicked: root.accept()
          }
        }
      }
    }
  }
}
