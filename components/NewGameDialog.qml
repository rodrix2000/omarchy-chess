pragma ComponentBehavior: Bound
import QtQuick
import qs.Commons

FocusScope {
  id: root

  property bool opened: false
  property string mode: "local"
  property string humanColor: "white"
  property string difficulty: "casual"
  property string timePreset: "untimed"
  property string orientation: "auto"
  property string whiteName: "White"
  property string blackName: "Black"
  property var returnFocusItem: null

  readonly property var modeChoices: [
    { value: "local", label: "Local Two-Player" },
    { value: "computer", label: "Play Computer" }
  ]
  readonly property var colorChoices: [
    { value: "white", label: "White" },
    { value: "black", label: "Black" },
    { value: "random", label: "Random" }
  ]
  readonly property var difficultyChoices: [
    { value: "learner", label: "Learner" },
    { value: "casual", label: "Casual" },
    { value: "challenging", label: "Challenging" },
    { value: "strong", label: "Strong" }
  ]
  readonly property var orientationChoices: [
    { value: "white", label: "White" },
    { value: "black", label: "Black" },
    { value: "manual", label: "Manual" },
    { value: "auto", label: "Auto flip" }
  ]
  readonly property var timeChoices: [
    { value: "untimed", label: "Untimed", base: null, increment: 0 },
    { value: "5+0", label: "5 + 0", base: 300000, increment: 0 },
    { value: "10+5", label: "10 + 5", base: 600000, increment: 5000 },
    { value: "15+10", label: "15 + 10", base: 900000, increment: 10000 }
  ]

  signal startRequested(var options)
  signal canceled()

  function show(originItem) {
    returnFocusItem = originItem || null
    opened = true
  }

  function restoreFocus() {
    if (returnFocusItem && typeof returnFocusItem.forceActiveFocus === "function")
      returnFocusItem.forceActiveFocus()
  }

  function sanitizeName(value, fallback) {
    var cleaned = String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/^\s+|\s+$/g, "").replace(/\s+/g, " ").slice(0, 32)
    return cleaned || fallback
  }

  function selectedTimeControl() {
    for (var index = 0; index < timeChoices.length; index++) {
      if (timeChoices[index].value === timePreset) {
        return {
          base_ms: timeChoices[index].base,
          increment_ms: timeChoices[index].increment
        }
      }
    }
    return { base_ms: null, increment_ms: 0 }
  }

  function start() {
    var options = {
      mode: mode,
      time_control: selectedTimeControl(),
      orientation: mode === "local" ? orientation
        : (humanColor === "random" ? "auto" : humanColor)
    }
    if (mode === "computer") {
      options.human_color = humanColor
      options.difficulty = difficulty
    } else {
      whiteName = sanitizeName(whiteName, "White")
      blackName = sanitizeName(blackName, "Black")
      options.players = {
        white: { kind: "human", name: whiteName },
        black: { kind: "human", name: blackName }
      }
    }
    opened = false
    startRequested(options)
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
  Accessible.name: "Start a new chess game"
  Accessible.description: "Choose a mode, time control, and game options"

  onOpenedChanged: {
    if (opened) Qt.callLater(function() { root.forceActiveFocus() })
  }

  Keys.onEscapePressed: function(event) {
    root.reject()
    event.accepted = true
  }

  Rectangle {
    anchors.fill: parent
    color: Qt.rgba(Color.background.r, Color.background.g, Color.background.b, 0.78)

    MouseArea {
      anchors.fill: parent
      onClicked: root.reject()
    }

    Rectangle {
      id: card
      width: Math.min(parent.width - Style.space(32), Style.space(620))
      height: Math.min(parent.height - Style.space(32), Style.space(520))
      anchors.centerIn: parent
      radius: Math.max(12, Style.cornerRadius)
      color: Color.background
      border.width: 1
      border.color: Color.accent

      MouseArea {
        anchors.fill: parent
        onClicked: function(mouse) { mouse.accepted = true }
      }

      Text {
        id: heading
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: parent.top
        anchors.margins: Style.space(20)
        text: "New game"
        color: Color.foreground
        font.family: Style.fontFamily
        font.pixelSize: Style.fontPx(2)
        font.weight: Font.DemiBold
      }

      Row {
        id: actionRow
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        anchors.margins: Style.space(20)
        spacing: Style.space(10)

        SecondaryButton {
          text: "Cancel"
          accessibleDescription: "Close new game setup and keep the current game"
          onClicked: root.reject()
        }

        PrimaryButton {
          text: root.mode === "computer" ? "Play computer" : "Start local game"
          accessibleDescription: "Start with the selected options"
          onClicked: root.start()
        }
      }

      Rectangle {
        id: actionDivider
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.bottom: actionRow.top
        anchors.bottomMargin: Style.space(14)
        height: 1
        color: Qt.rgba(Color.foreground.r, Color.foreground.g,
                       Color.foreground.b, 0.16)
      }

      Flickable {
        id: setupScroll
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: heading.bottom
        anchors.bottom: actionDivider.top
        anchors.leftMargin: Style.space(20)
        anchors.rightMargin: Style.space(20)
        anchors.topMargin: Style.space(14)
        anchors.bottomMargin: Style.space(12)
        contentWidth: width
        contentHeight: setupColumn.implicitHeight
        clip: true
        boundsBehavior: Flickable.StopAtBounds

        Column {
          id: setupColumn
          width: setupScroll.width
          spacing: Style.space(16)

          Column {
            width: parent.width
            spacing: Style.space(6)

            Text {
              text: "MODE"
              color: Color.muted
              font.family: Style.fontFamily
              font.pixelSize: Style.fontPx(0.833)
              font.weight: Font.DemiBold
            }

            Row {
              id: modeRow
              width: parent.width
              spacing: Style.space(8)

              Repeater {
                model: root.modeChoices

                SecondaryButton {
                  required property int index
                  required property var modelData

                  width: (modeRow.width - modeRow.spacing) / 2
                  text: modelData.label
                  selected: root.mode === modelData.value
                  accessibleDescription: "Set game mode to " + modelData.label
                  onClicked: root.mode = modelData.value
                }
              }
            }
          }

          Column {
            width: parent.width
            visible: root.mode === "computer"
            spacing: Style.space(14)

            Column {
              width: parent.width
              spacing: Style.space(6)

              Text {
                text: "PLAY AS"
                color: Color.muted
                font.family: Style.fontFamily
                font.pixelSize: Style.fontPx(0.833)
                font.weight: Font.DemiBold
              }

              Row {
                id: colorRow
                width: parent.width
                spacing: Style.space(8)

                Repeater {
                  model: root.colorChoices

                  SecondaryButton {
                    required property int index
                    required property var modelData

                    width: (colorRow.width - colorRow.spacing * 2) / 3
                    text: modelData.label
                    selected: root.humanColor === modelData.value
                    accessibleDescription: "Play as " + modelData.label
                    onClicked: root.humanColor = modelData.value
                  }
                }
              }
            }

            Column {
              width: parent.width
              spacing: Style.space(6)

              Text {
                text: "COMPUTER LEVEL"
                color: Color.muted
                font.family: Style.fontFamily
                font.pixelSize: Style.fontPx(0.833)
                font.weight: Font.DemiBold
              }

              Row {
                id: difficultyRow
                width: parent.width
                spacing: Style.space(6)

                Repeater {
                  model: root.difficultyChoices

                  SecondaryButton {
                    required property int index
                    required property var modelData

                    width: (difficultyRow.width - difficultyRow.spacing * 3) / 4
                    text: modelData.label
                    selected: root.difficulty === modelData.value
                    accessibleDescription: "Set computer level to " + modelData.label
                    onClicked: root.difficulty = modelData.value
                  }
                }
              }
            }
          }

          Column {
            width: parent.width
            visible: root.mode === "local"
            spacing: Style.space(14)

            Row {
              width: parent.width
              spacing: Style.space(10)

              Column {
                width: (parent.width - parent.spacing) / 2
                spacing: Style.space(5)

                Text {
                  text: "WHITE PLAYER"
                  color: Color.muted
                  font.family: Style.fontFamily
                  font.pixelSize: Style.fontPx(0.833)
                  font.weight: Font.DemiBold
                }

                Rectangle {
                  width: parent.width
                  height: Math.max(44, Style.space(44))
                  radius: Math.max(6, Style.cornerRadius)
                  color: whiteInput.activeFocus ? Style.focusFillColor : Style.normalFill
                  border.width: whiteInput.activeFocus ? 2 : 1
                  border.color: whiteInput.activeFocus ? Color.accent : Style.normalBorderColor

                  TextInput {
                    id: whiteInput
                    anchors.fill: parent
                    anchors.leftMargin: Style.space(10)
                    anchors.rightMargin: Style.space(10)
                    verticalAlignment: TextInput.AlignVCenter
                    text: root.whiteName
                    color: Color.foreground
                    selectionColor: Style.selectionFill
                    selectedTextColor: Color.foreground
                    font.family: Style.fontFamily
                    font.pixelSize: Style.fontPx(1)
                    maximumLength: 32
                    activeFocusOnTab: true
                    Accessible.role: Accessible.EditableText
                    Accessible.name: "White player name"
                    Accessible.description: "Up to 32 characters"
                    onTextEdited: root.whiteName = text
                  }
                }
              }

              Column {
                width: (parent.width - parent.spacing) / 2
                spacing: Style.space(5)

                Text {
                  text: "BLACK PLAYER"
                  color: Color.muted
                  font.family: Style.fontFamily
                  font.pixelSize: Style.fontPx(0.833)
                  font.weight: Font.DemiBold
                }

                Rectangle {
                  width: parent.width
                  height: Math.max(44, Style.space(44))
                  radius: Math.max(6, Style.cornerRadius)
                  color: blackInput.activeFocus ? Style.focusFillColor : Style.normalFill
                  border.width: blackInput.activeFocus ? 2 : 1
                  border.color: blackInput.activeFocus ? Color.accent : Style.normalBorderColor

                  TextInput {
                    id: blackInput
                    anchors.fill: parent
                    anchors.leftMargin: Style.space(10)
                    anchors.rightMargin: Style.space(10)
                    verticalAlignment: TextInput.AlignVCenter
                    text: root.blackName
                    color: Color.foreground
                    selectionColor: Style.selectionFill
                    selectedTextColor: Color.foreground
                    font.family: Style.fontFamily
                    font.pixelSize: Style.fontPx(1)
                    maximumLength: 32
                    activeFocusOnTab: true
                    Accessible.role: Accessible.EditableText
                    Accessible.name: "Black player name"
                    Accessible.description: "Up to 32 characters"
                    onTextEdited: root.blackName = text
                  }
                }
              }
            }

            Column {
              width: parent.width
              spacing: Style.space(6)

              Text {
                text: "BOARD ORIENTATION"
                color: Color.muted
                font.family: Style.fontFamily
                font.pixelSize: Style.fontPx(0.833)
                font.weight: Font.DemiBold
              }

              Row {
                id: orientationRow
                width: parent.width
                spacing: Style.space(8)

                Repeater {
                  model: root.orientationChoices

                  SecondaryButton {
                    required property int index
                    required property var modelData

                    width: (orientationRow.width - orientationRow.spacing * 3) / 4
                    text: modelData.label
                    selected: root.orientation === modelData.value
                    accessibleDescription: modelData.value === "auto"
                      ? "Flip after each move so the side to move is at the bottom"
                      : modelData.value === "manual" ? "Start with White below and flip only when requested"
                      : modelData.label + " stays at the bottom"
                    onClicked: root.orientation = modelData.value
                  }
                }
              }
            }
          }

          Column {
            width: parent.width
            spacing: Style.space(6)

            Text {
              text: "TIME CONTROL"
              color: Color.muted
              font.family: Style.fontFamily
              font.pixelSize: Style.fontPx(0.833)
              font.weight: Font.DemiBold
            }

            Row {
              id: timeRow
              width: parent.width
              spacing: Style.space(6)

              Repeater {
                model: root.timeChoices

                SecondaryButton {
                  required property int index
                  required property var modelData

                  width: (timeRow.width - timeRow.spacing * 3) / 4
                  text: modelData.label
                  selected: root.timePreset === modelData.value
                  accessibleDescription: modelData.value === "untimed"
                    ? "Play without a chess clock"
                    : modelData.label + " time control"
                  onClicked: root.timePreset = modelData.value
                }
              }
            }
          }
        }
      }
    }
  }
}
