pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Controls as Controls
import QtQuick.Layouts
import qs.Commons

Controls.ScrollView {
  id: root

  property bool hasPlayableGame: false
  property bool compactLayout: false
  property var game: ({})
  property int historyCount: 0

  readonly property var layoutMetrics: ({
    cards_columns: modeCards.columns,
    active_card_visible: hasPlayableGame,
    compact_navigation_visible: compactLayout,
    content_implicit_height: homeContent.implicitHeight,
    active_card_height: activeGameCard.implicitHeight,
    computer_card_height: computerCard.implicitHeight,
    local_card_height: localCard.implicitHeight
  })

  signal resumeRequested()
  signal computerGameRequested()
  signal localGameRequested()
  signal historyRequested()
  signal settingsRequested()
  signal helpRequested()

  function titleCase(value) {
    var text = String(value || "")
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : ""
  }

  function activeModeLabel() {
    if (!game) return "Saved game"
    if (game.mode === "computer")
      return "vs Computer · " + titleCase(game.difficulty || "casual")
    return "Two-Player Game"
  }

  function activeTurnLabel() {
    return titleCase(game && game.turn || "white") + " to move"
  }

  contentWidth: availableWidth
  clip: true

  component ModeCard: Rectangle {
    id: card

    required property string title
    required property string description
    required property string actionText
    required property string accessibleDescription
    required property string pieceColor
    required property string pieceType
    property bool compact: false

    signal requested()

    implicitHeight: cardContent.implicitHeight + (compact ? 28 : 36)
    radius: Math.max(10, Style.cornerRadius + 2)
    color: Qt.rgba(Color.foreground.r, Color.foreground.g,
                   Color.foreground.b, 0.048)
    border.width: 1
    border.color: Qt.rgba(Color.foreground.r, Color.foreground.g,
                          Color.foreground.b, 0.15)

    GridLayout {
      id: cardContent
      anchors.fill: parent
      anchors.margins: card.compact ? 14 : 18
      columns: 3
      columnSpacing: card.compact ? 10 : 12
      rowSpacing: card.compact ? 7 : 9

      Rectangle {
        Layout.row: 0
        Layout.column: 0
        Layout.preferredWidth: card.compact ? 48 : 54
        Layout.preferredHeight: Layout.preferredWidth
        radius: Math.max(8, Style.cornerRadius)
        color: Qt.rgba(Color.accent.r, Color.accent.g,
                       Color.accent.b, 0.09)
        border.width: 1
        border.color: Qt.rgba(Color.accent.r, Color.accent.g,
                              Color.accent.b, 0.24)

        ChessPiece {
          anchors.centerIn: parent
          width: card.compact ? 42 : 48
          height: width
          pieceColor: card.pieceColor
          pieceType: card.pieceType
          enabled: false
        }
      }

      Text {
        Layout.row: 0
        Layout.column: 1
        Layout.columnSpan: card.compact ? 1 : 2
        Layout.fillWidth: true
        text: card.title
        color: Color.foreground
        font.family: Style.fontFamily
        font.pixelSize: card.compact ? 19 : 21
        font.weight: Font.DemiBold
        wrapMode: Text.WordWrap
      }

      Text {
        Layout.row: 1
        Layout.column: 0
        Layout.columnSpan: 3
        Layout.fillWidth: true
        text: card.description
        color: Color.muted
        font.family: Style.fontFamily
        font.pixelSize: 13
        lineHeight: 1.16
        wrapMode: Text.WordWrap
      }

      PrimaryButton {
        Layout.row: card.compact ? 0 : 2
        Layout.column: card.compact ? 2 : 0
        Layout.columnSpan: card.compact ? 1 : 3
        Layout.alignment: Qt.AlignLeft
        text: card.actionText
        iconText: "→"
        accessibleDescription: card.accessibleDescription
        onClicked: card.requested()
      }
    }
  }

  ColumnLayout {
    id: homeContent
    width: parent.width
    spacing: root.compactLayout ? 12 : 16

    Item { Layout.preferredHeight: root.compactLayout ? 2 : 8 }

    ColumnLayout {
      Layout.fillWidth: true
      Layout.maximumWidth: 860
      Layout.alignment: Qt.AlignHCenter
      spacing: 5

      Text {
        Layout.fillWidth: true
        text: root.hasPlayableGame
          ? "Your game is waiting" : "Ready for your next move?"
        color: Color.foreground
        font.family: Style.fontFamily
        font.pixelSize: root.compactLayout ? 25 : 31
        font.weight: Font.DemiBold
        wrapMode: Text.WordWrap
      }

      Text {
        Layout.fillWidth: true
        text: root.hasPlayableGame
          ? "Pick up exactly where you left off. Your clock stays paused while Omarchy Chess is closed."
          : "Offline chess, built right into Omarchy. Play the computer or share the board with a friend."
        color: Color.muted
        font.family: Style.fontFamily
        font.pixelSize: 13
        lineHeight: 1.18
        wrapMode: Text.WordWrap
      }
    }

    Rectangle {
      id: activeGameCard
      Layout.fillWidth: true
      Layout.maximumWidth: 860
      Layout.alignment: Qt.AlignHCenter
      Layout.preferredHeight: activeGameLayout.implicitHeight + 28
      visible: root.hasPlayableGame
      implicitHeight: activeGameLayout.implicitHeight + 28
      radius: Math.max(10, Style.cornerRadius + 2)
      color: Qt.rgba(Color.accent.r, Color.accent.g, Color.accent.b, 0.07)
      border.width: 1
      border.color: Qt.rgba(Color.accent.r, Color.accent.g,
                            Color.accent.b, 0.38)

      Rectangle {
        anchors.left: parent.left
        anchors.top: parent.top
        anchors.bottom: parent.bottom
        anchors.margins: 8
        width: 3
        radius: 2
        color: Color.accent
      }

      RowLayout {
        id: activeGameLayout
        anchors.fill: parent
        anchors.leftMargin: root.compactLayout ? 22 : 26
        anchors.rightMargin: root.compactLayout ? 14 : 18
        anchors.topMargin: 14
        anchors.bottomMargin: 14
        spacing: 12

        ColumnLayout {
          Layout.fillWidth: true
          spacing: 3

          Text {
            text: "GAME IN PROGRESS"
            color: Color.accent
            font.family: Style.fontFamily
            font.pixelSize: 10
            font.weight: Font.Bold
            font.letterSpacing: 0.9
          }
          Text {
            Layout.fillWidth: true
            text: root.activeModeLabel()
            color: Color.foreground
            font.family: Style.fontFamily
            font.pixelSize: root.compactLayout ? 16 : 18
            font.weight: Font.DemiBold
            elide: Text.ElideRight
          }
          Text {
            text: root.activeTurnLabel()
            color: Color.muted
            font.family: Style.fontFamily
            font.pixelSize: 12
          }
        }

        PrimaryButton {
          text: "Resume game"
          iconText: "→"
          accessibleDescription: "Resume the current chess game"
          onClicked: root.resumeRequested()
        }
      }
    }

    GridLayout {
      id: modeCards
      Layout.fillWidth: true
      Layout.maximumWidth: 860
      Layout.alignment: Qt.AlignHCenter
      columns: root.compactLayout ? 1 : 2
      columnSpacing: 14
      rowSpacing: 12

      ModeCard {
        id: computerCard
        Layout.fillWidth: true
        compact: root.compactLayout || root.width < 820
        title: "Play Computer"
        description: "Challenge the built-in opponent at four difficulty levels — completely offline."
        actionText: "Choose difficulty"
        accessibleDescription: "Configure a game against the computer"
        pieceColor: "black"
        pieceType: "knight"
        onRequested: root.computerGameRequested()
      }

      ModeCard {
        id: localCard
        Layout.fillWidth: true
        compact: root.compactLayout || root.width < 820
        title: "Two-Player Game"
        description: "Share one board with a friend, with optional clocks and automatic board rotation."
        actionText: "Set up game"
        accessibleDescription: "Configure a local two-player game"
        pieceColor: "white"
        pieceType: "rook"
        onRequested: root.localGameRequested()
      }
    }

    RowLayout {
      id: compactNavigation
      Layout.alignment: Qt.AlignHCenter
      spacing: 8
      visible: root.compactLayout

      SecondaryButton {
        text: "History"
        accessibleDescription: "Open game history"
        onClicked: root.historyRequested()
      }
      SecondaryButton {
        text: "Settings"
        accessibleDescription: "Open chess settings"
        onClicked: root.settingsRequested()
      }
      SecondaryButton {
        text: "Help"
        accessibleDescription: "Open chess help"
        onClicked: root.helpRequested()
      }
    }

    Text {
      Layout.fillWidth: true
      visible: root.historyCount > 0
      text: root.historyCount + " completed game"
        + (root.historyCount === 1 ? "" : "s") + " saved locally"
      color: Color.muted
      font.family: Style.fontFamily
      font.pixelSize: 11
      horizontalAlignment: Text.AlignHCenter
    }

    Item { Layout.preferredHeight: root.compactLayout ? 2 : 8 }
  }
}
