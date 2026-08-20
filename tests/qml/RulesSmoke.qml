import QtQuick
import "../../engine/ChessCore.js" as ChessCore
import "../../engine/RulesAdapter.js" as RulesAdapter
import "../../third_party/chess.js/qml/chess.js" as ChessVendor

Item {
  property bool smokePassed: false

  Component.onCompleted: {
    ChessCore.configureVendor(ChessVendor)
    RulesAdapter.configureCore(ChessCore)
    var rules = RulesAdapter.create({})
    if (!rules || rules.valid !== true)
      throw new Error("RulesAdapter failed to initialize in QML")
    if (rules.perft(3) !== 8902)
      throw new Error("QML rules perft mismatch")
    rules.setHeader("Event", "Omarchy Chess")
    rules.setHeader("Site", "Local")
    rules.setHeader("Date", "2026.08.20")
    rules.setHeader("Round", "-")
    rules.setHeader("White", "White")
    rules.setHeader("Black", "Black")
    rules.setHeader("Result", "*")
    rules.setHeader("TimeControl", "60+1")
    rules.setHeader("Mode", "Local")
    rules.setHeader("PluginVersion", "0.1.0")
    var roundTrip = RulesAdapter.create({
      pgn: rules.pgn(),
      pgnOptions: { strict: true }
    })
    if (!roundTrip || roundTrip.valid !== true)
      throw new Error("QML strict PGN round trip failed: " +
        JSON.stringify(roundTrip && roundTrip.error))
    smokePassed = true
  }

  Timer {
    interval: 0
    running: parent.smokePassed
    onTriggered: Qt.quit()
  }
}
