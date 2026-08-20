import QtQuick
import QtQuick.Window
import qs.Commons
import "../../components" as ChessUi

// A deterministic, non-interactive showcase scene. It uses the same native
// component catalog as Panel.qml, a curated legal midgame, and the checked-in
// original SVG pieces. The shell script captures this scene offscreen.
Window {
  id: previewWindow

  width: 1280
  height: 800
  visible: true
  color: Color.background
  flags: Qt.FramelessWindowHint

  readonly property string outputPath: String(Qt.resolvedUrl("../../preview.png"))
    .replace(/^file:\/\//, "")

  readonly property var demoPieces: [
    { square: "a8", color: "black", piece: "rook" },
    { square: "d8", color: "black", piece: "queen" },
    { square: "e8", color: "black", piece: "rook" },
    { square: "f8", color: "black", piece: "bishop" },
    { square: "g8", color: "black", piece: "king" },
    { square: "b7", color: "black", piece: "bishop" },
    { square: "c5", color: "black", piece: "knight" },
    { square: "f6", color: "black", piece: "knight" },
    { square: "a6", color: "black", piece: "pawn" },
    { square: "b5", color: "black", piece: "pawn" },
    { square: "d6", color: "black", piece: "pawn" },
    { square: "e5", color: "black", piece: "pawn" },
    { square: "f7", color: "black", piece: "pawn" },
    { square: "g6", color: "black", piece: "pawn" },
    { square: "h7", color: "black", piece: "pawn" },
    { square: "a1", color: "white", piece: "rook" },
    { square: "e1", color: "white", piece: "rook" },
    { square: "d1", color: "white", piece: "queen" },
    { square: "g1", color: "white", piece: "king" },
    { square: "b3", color: "white", piece: "bishop" },
    { square: "c1", color: "white", piece: "bishop" },
    { square: "f3", color: "white", piece: "knight" },
    { square: "g3", color: "white", piece: "knight" },
    { square: "a4", color: "white", piece: "pawn" },
    { square: "c3", color: "white", piece: "pawn" },
    { square: "d5", color: "white", piece: "pawn" },
    { square: "e4", color: "white", piece: "pawn" },
    { square: "f2", color: "white", piece: "pawn" },
    { square: "g2", color: "white", piece: "pawn" },
    { square: "h3", color: "white", piece: "pawn" }
  ]

  readonly property var demoMoves: [
    { ply: 1, san: "e4" }, { ply: 2, san: "e5" },
    { ply: 3, san: "Nf3" }, { ply: 4, san: "Nc6" },
    { ply: 5, san: "Bb5" }, { ply: 6, san: "a6" },
    { ply: 7, san: "Ba4" }, { ply: 8, san: "Nf6" },
    { ply: 9, san: "O-O" }, { ply: 10, san: "Be7" },
    { ply: 11, san: "Re1" }, { ply: 12, san: "b5" },
    { ply: 13, san: "Bb3" }, { ply: 14, san: "d6" },
    { ply: 15, san: "c3" }, { ply: 16, san: "O-O" },
    { ply: 17, san: "h3" }, { ply: 18, san: "Nb8" },
    { ply: 19, san: "d4" }, { ply: 20, san: "Nbd7" },
    { ply: 21, san: "Nbd2" }, { ply: 22, san: "Bb7" },
    { ply: 23, san: "Bc2" }, { ply: 24, san: "Re8" },
    { ply: 25, san: "Nf1" }, { ply: 26, san: "Bf8" },
    { ply: 27, san: "Ng3" }, { ply: 28, san: "g6" },
    { ply: 29, san: "a4" }, { ply: 30, san: "c5" },
    { ply: 31, san: "d5" }, { ply: 32, san: "c4" },
    { ply: 33, san: "b3" }, { ply: 34, san: "cxb3" },
    { ply: 35, san: "Bxb3" }, { ply: 36, san: "Nc5" }
  ]

  function setPreviewTheme() {
    // These are real Omarchy role tokens, pinned here only to make an asset
    // preview independent of the machine's current theme.
    Color.background = "#151a1f"
    Color.foreground = "#ebe7dc"
    Color.accent = "#e1aa62"
    Color.urgent = "#e27c6d"
    Color.muted = "#84909a"
    Style.cornerRadius = 12
    Style.fontBaseSize = 12
    Style.spacingScale = 1.0
    Style.spacingScaleWithFont = false
  }

  Item {
    id: scene
    anchors.fill: parent

    Rectangle {
      anchors.fill: parent
      color: Color.background
    }

    // Compact shell-like bar surface keeps the plugin context visible in the
    // marketplace image without depending on a running omarchy-shell.
    Rectangle {
      id: bar
      anchors.left: parent.left
      anchors.right: parent.right
      anchors.top: parent.top
      height: 52
      color: Qt.rgba(Color.foreground.r, Color.foreground.g,
                     Color.foreground.b, 0.045)
      border.color: Qt.rgba(Color.foreground.r, Color.foreground.g,
                            Color.foreground.b, 0.14)
      border.width: 1

      Row {
        anchors.left: parent.left
        anchors.leftMargin: 22
        anchors.verticalCenter: parent.verticalCenter
        spacing: 10

        Image {
          width: 27
          height: 27
          source: Qt.resolvedUrl("../../assets/icon-monochrome.svg")
          fillMode: Image.PreserveAspectFit
        }

        Text {
          anchors.verticalCenter: parent.verticalCenter
          text: "OMARCHY"
          color: Color.foreground
          font.family: Style.fontFamily
          font.pixelSize: 13
          font.weight: Font.DemiBold
          font.letterSpacing: 1.5
        }
      }

      Row {
        anchors.right: parent.right
        anchors.rightMargin: 22
        anchors.verticalCenter: parent.verticalCenter
        spacing: 18

        Text {
          text: "CHESS  •  OFFLINE"
          color: Color.muted
          font.family: Style.fontFamily
          font.pixelSize: 11
          font.weight: Font.DemiBold
          font.letterSpacing: 0.8
        }
        Text {
          text: "09:41"
          color: Color.foreground
          font.family: Style.fontFamily
          font.pixelSize: 13
          font.weight: Font.DemiBold
        }
      }
    }

    Rectangle {
      id: panelSurface
      anchors.left: parent.left
      anchors.right: parent.right
      anchors.top: bar.bottom
      anchors.bottom: parent.bottom
      anchors.margins: 22
      anchors.topMargin: 18
      radius: Style.cornerRadius
      color: Qt.rgba(Color.foreground.r, Color.foreground.g,
                     Color.foreground.b, 0.035)
      border.width: 1
      border.color: Qt.rgba(Color.foreground.r, Color.foreground.g,
                            Color.foreground.b, 0.16)

      Row {
        anchors.fill: parent
        anchors.margins: 22
        spacing: 24

        Column {
          id: boardColumn
          width: 614
          spacing: 10

          Row {
            width: parent.width
            height: 44

            Column {
              width: parent.width - liveBadge.width - 14
              spacing: 2
              Text {
                text: "Casual game"
                color: Color.foreground
                font.family: Style.fontFamily
                font.pixelSize: 22
                font.weight: Font.DemiBold
              }
              Text {
                text: "White to move  ·  move 19"
                color: Color.muted
                font.family: Style.fontFamily
                font.pixelSize: 12
              }
            }

            Rectangle {
              id: liveBadge
              width: 102
              height: 30
              radius: 15
              anchors.verticalCenter: parent.verticalCenter
              color: Qt.rgba(Color.accent.r, Color.accent.g,
                             Color.accent.b, 0.15)
              border.width: 1
              border.color: Qt.rgba(Color.accent.r, Color.accent.g,
                                    Color.accent.b, 0.65)
              Text {
                anchors.centerIn: parent
                text: "YOUR MOVE"
                color: Color.accent
                font.family: Style.fontFamily
                font.pixelSize: 10
                font.weight: Font.Bold
                font.letterSpacing: 0.8
              }
            }
          }

          ChessUi.BoardView {
            id: board
            width: 584
            height: 584
            anchors.horizontalCenter: parent.horizontalCenter
            pieces: previewWindow.demoPieces
            orientation: "white"
            selectedSquare: "f3"
            cursorSquare: "f3"
            legalMoves: [
              { to: "g5" },
              { to: "e5", captured: "pawn" },
              { to: "d4" }
            ]
            lastMove: ({ from: "d7", to: "c5", uci: "d7c5" })
            checkedKingSquare: ""
            inputEnabled: true
            showCoordinates: true
            focus: true
          }

          Row {
            width: parent.width
            spacing: 10

            ChessUi.SecondaryButton {
              width: 122
              text: "↻  Flip board"
              accessibleDescription: "Change board orientation"
            }
            ChessUi.SecondaryButton {
              width: 116
              text: "Ⅱ  Pause"
              accessibleDescription: "Pause and save this game"
            }
            Item { width: 1; height: 1 }
            Text {
              anchors.verticalCenter: parent.verticalCenter
              text: "Offline  ·  saved locally"
              color: Color.muted
              font.family: Style.fontFamily
              font.pixelSize: 11
            }
          }
        }

        Column {
          id: rail
          width: 418
          spacing: 12

          Row {
            width: parent.width
            spacing: 10

            Rectangle {
              width: 34
              height: 34
              radius: 17
              color: Qt.rgba(Color.accent.r, Color.accent.g,
                             Color.accent.b, 0.2)
              Text {
                anchors.centerIn: parent
                text: "W"
                color: Color.accent
                font.family: Style.fontFamily
                font.pixelSize: 14
                font.weight: Font.Bold
              }
            }
            Column {
              width: parent.width - 44
              spacing: 1
              Text {
                text: "You"
                color: Color.foreground
                font.family: Style.fontFamily
                font.pixelSize: 16
                font.weight: Font.DemiBold
              }
              Text {
                text: "White  ·  Local player"
                color: Color.muted
                font.family: Style.fontFamily
                font.pixelSize: 11
              }
            }
          }

          ChessUi.PlayerClock {
            width: parent.width
            height: 76
            side: "white"
            remainingMs: 8 * 60 * 1000 + 42 * 1000
            formattedText: "08:42"
            running: true
            urgent: false
            paused: false
          }

          Row {
            width: parent.width
            spacing: 10

            Rectangle {
              width: 34
              height: 34
              radius: 17
              color: Qt.rgba(Color.foreground.r, Color.foreground.g,
                             Color.foreground.b, 0.09)
              Text {
                anchors.centerIn: parent
                text: "C"
                color: Color.foreground
                font.family: Style.fontFamily
                font.pixelSize: 14
                font.weight: Font.Bold
              }
            }
            Column {
              width: parent.width - 44
              spacing: 1
              Text {
                text: "Omarchy Computer"
                color: Color.foreground
                font.family: Style.fontFamily
                font.pixelSize: 16
                font.weight: Font.DemiBold
              }
              Text {
                text: "Black  ·  Casual"
                color: Color.muted
                font.family: Style.fontFamily
                font.pixelSize: 11
              }
            }
          }

          ChessUi.PlayerClock {
            width: parent.width
            height: 76
            side: "black"
            remainingMs: 7 * 60 * 1000 + 18 * 1000
            formattedText: "07:18"
            running: false
            urgent: false
            paused: false
          }

          ChessUi.StatusBanner {
            width: parent.width
            text: "Your move"
            detail: "Choose a highlighted square or drag a piece to play."
            kind: "info"
            iconText: "●"
          }

          ChessUi.MoveList {
            width: parent.width
            height: 278
            moves: previewWindow.demoMoves
            selectedPly: 36
            replayMode: false
          }

          Row {
            width: parent.width
            spacing: 10

            ChessUi.PrimaryButton {
              width: 150
              text: "Offer draw"
              iconText: "◇"
              accessibleDescription: "Offer a draw to the computer"
            }
            ChessUi.SecondaryButton {
              width: 124
              text: "Resign"
              destructive: true
              accessibleDescription: "Resign this game"
            }
          }
        }
      }
    }
  }

  Timer {
    interval: 240
    running: true
    repeat: false
    onTriggered: {
      setPreviewTheme()
      renderTimer.start()
    }
  }

  Timer {
    id: renderTimer
    interval: 240
    repeat: false
    onTriggered: {
      scene.grabToImage(function(result) {
        if (!result.saveToFile(previewWindow.outputPath)) {
          console.error("PREVIEW_RENDER_FAILURE", previewWindow.outputPath)
          Qt.exit(2)
          return
        }
        console.log("PREVIEW_RENDERED", previewWindow.outputPath)
        Qt.quit()
      }, Qt.size(1280, 800))
    }
  }
}
