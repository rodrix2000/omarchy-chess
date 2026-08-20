import QtQuick
import qs.Ui

BarWidget {
  id: root

  moduleName: "io.github.rodrix2000.chess"

  function shellFor(hostBar) {
    return hostBar && hostBar.shell ? hostBar.shell : null
  }

  readonly property var hostShell: shellFor(root.bar)
  readonly property var chessService: hostShell
    && typeof hostShell.serviceFor === "function"
    ? hostShell.serviceFor(moduleName) : null
  readonly property string displayMode: String(setting("displayMode", "auto"))
  readonly property bool showTurn: setting("showTurn", true) === true
  readonly property bool showClock: setting("showClock", true) === true
  readonly property bool showResult: setting("showResult", true) === true
  readonly property var game: root.chessService && root.chessService.snapshot
    ? root.chessService.snapshot : ({ status: "idle" })

  function normalizedDisplayMode() {
    var allowed = ["auto", "minimal", "turn", "clock", "result"]
    return allowed.indexOf(root.displayMode) >= 0 ? root.displayMode : "auto"
  }

  function clockText() {
    var clock = root.game.clock || ({})
    var side = root.game.turn || "white"
    var remaining = Number(clock[side + "_ms"])
    if (clock.enabled !== true || !isFinite(remaining) || remaining < 0) return ""
    var totalSeconds = Math.max(0, Math.ceil(remaining / 1000))
    var minutes = Math.floor(totalSeconds / 60)
    var seconds = totalSeconds % 60
    return (minutes < 10 ? "0" : "") + minutes + ":"
      + (seconds < 10 ? "0" : "") + seconds
  }

  function hasLiveClock() {
    var status = String(root.game.status || "idle")
    return root.showClock && root.clockText() !== ""
      && (status === "active-human" || status === "active-computer"
        || status === "promotion-pending")
  }

  function hasResult() {
    return root.showResult && root.game.result
      && String(root.game.result.score || "") !== ""
  }

  function summaryText() {
    var mode = root.normalizedDisplayMode()
    if (root.vertical || mode === "minimal") return "♞"
    if (!root.chessService || !root.chessService.ready) return "♞ Chess"
    if (mode === "clock")
      return root.hasLiveClock() ? "♞ " + root.clockText() : "♞ Chess"
    if (mode === "result")
      return root.hasResult() ? "♞ " + root.game.result.score : "♞ Chess"
    if (mode === "turn")
      return root.showTurn ? "♞ " + (root.chessService.barText || "Chess") : "♞ Chess"
    if (!root.chessService.persistenceHealthy) return "♞ Save error"
    if (root.hasLiveClock()) {
      var activeMs = Number(root.game.clock[(root.game.turn || "white") + "_ms"])
      if (activeMs <= 20000) return "♞ " + root.clockText()
    }
    if (!root.showTurn && (root.game.status === "active-human"
        || root.game.status === "active-computer")) return "♞ Chess"
    if (root.game.status === "completed" && root.hasResult())
      return "♞ " + root.game.result.score
    return "♞ " + (root.chessService.barText || "Chess")
  }

  function detailedTooltip() {
    if (!root.chessService) return "Omarchy Chess — service loading"
    var base = root.chessService.tooltipText || "Omarchy Chess"
    var players = root.game.players
    if (players && players.white && players.black)
      base += "\n" + players.white.name + " — " + players.black.name
    if (root.game.clock && root.game.clock.enabled)
      base += "\nWhite " + root.formatClockValue(root.game.clock.white_ms)
        + " · Black " + root.formatClockValue(root.game.clock.black_ms)
    return base
  }

  function formatClockValue(value) {
    var totalSeconds = Math.max(0, Math.ceil(Number(value || 0) / 1000))
    var minutes = Math.floor(totalSeconds / 60)
    var seconds = totalSeconds % 60
    return (minutes < 10 ? "0" : "") + minutes + ":"
      + (seconds < 10 ? "0" : "") + seconds
  }

  function togglePanel() {
    if (hostShell && typeof hostShell.toggle === "function")
      hostShell.toggle(moduleName, "{}")
  }

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  WidgetButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: root.summaryText()
    tooltipText: root.detailedTooltip()
    active: root.chessService && (!root.chessService.persistenceHealthy
      || (root.hasLiveClock()
        && Number(root.game.clock[(root.game.turn || "white") + "_ms"]) <= 10000))
    fixedWidth: root.vertical ? root.barSize : -1

    onPressed: function(code) {
      if (code === Qt.LeftButton) root.togglePanel()
    }
  }
}
