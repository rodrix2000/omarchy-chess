import QtQuick
import Quickshell
import Quickshell.Io

Item {
  id: root

  readonly property string home: Quickshell.env("HOME") || ""
  readonly property string stateHome: Quickshell.env("XDG_STATE_HOME") ||
    (home + "/.local/state")
  readonly property string stateDir: stateHome + "/omarchy-chess"
  readonly property string gamesDir: stateDir + "/games"
  readonly property string recoveryDir: stateDir + "/recovery"
  readonly property string diagnosticsDir: stateDir + "/diagnostics"
  readonly property string exportsDir: stateDir + "/exports"
  readonly property string settingsPath: stateDir + "/settings.json"
  readonly property string activeGamePath: stateDir + "/active-game.json"
  readonly property string historyPath: stateDir + "/history.json"

  property bool ready: false
  property bool autoStart: true
  property bool directoriesReady: false
  property bool busy: false
  property int initialReadsPending: 3
  property bool settingsRead: false
  property bool activeGameRead: false
  property bool historyRead: false
  property string settingsText: ""
  property string activeGameText: ""
  property string historyText: ""
  property var pendingCallback: null
  property string pendingOperation: ""
  property string archiveGameId: ""
  property string archiveRecordText: ""
  property string archivePgnText: ""
  property string archiveHistoryText: ""
  property string removeGameId: ""
  property string removeHistoryText: ""
  property string exportPath: ""
  property string exportText: ""

  signal initialized(string settingsText, string activeGameText, string historyText)
  signal operationFailed(string operation, string code, string detail)

  function initialize() {
    if (!ensureDirectoriesProcess.running && !directoriesReady)
      ensureDirectoriesProcess.running = true
  }

  function safeGameId(value) {
    var gameId = String(value || "")
    return /^[A-Za-z0-9_-]{8,128}$/.test(gameId) ? gameId : ""
  }

  function finish(ok, code, detail, data) {
    var callback = pendingCallback
    var operation = pendingOperation
    pendingCallback = null
    pendingOperation = ""
    busy = false
    if (!ok) operationFailed(operation, code, detail || "")
    if (callback) callback({
      ok: ok === true,
      code: code,
      detail: detail || "",
      operation: operation,
      data: data || ({})
    })
  }

  function begin(operation, callback) {
    if (!ready)
      return ({ ok: false, code: "PERSISTENCE_NOT_READY" })
    if (busy)
      return ({ ok: false, code: "PERSISTENCE_BUSY" })
    busy = true
    pendingOperation = operation
    pendingCallback = callback || null
    return ({ ok: true, code: "PERSISTENCE_STARTED" })
  }

  function saveActive(text, callback) {
    var started = begin("save-active-game", callback)
    if (!started.ok) return started
    activeGameFile.setText(String(text))
    return started
  }

  function saveSettings(text, callback) {
    var started = begin("save-settings", callback)
    if (!started.ok) return started
    settingsFile.setText(String(text))
    return started
  }

  function saveHistory(text, callback) {
    var started = begin("save-history", callback)
    if (!started.ok) return started
    historyFile.setText(String(text))
    return started
  }

  function archiveCompleted(gameId, recordText, pgnText, nextHistoryText, callback) {
    var normalized = safeGameId(gameId)
    var started

    if (!normalized)
      return ({ ok: false, code: "PERSISTENCE_VALIDATION_FAILED" })
    started = begin("archive-completed-game", callback)
    if (!started.ok) return started

    archiveGameId = normalized
    archiveRecordText = String(recordText)
    archivePgnText = String(pgnText)
    archiveHistoryText = String(nextHistoryText)
    completedJsonFile.path = gamesDir + "/" + normalized + ".json"
    completedPgnFile.path = gamesDir + "/" + normalized + ".pgn"
    completedJsonFile.setText(archiveRecordText)
    return started
  }

  function clearActive(callback) {
    var started = begin("clear-active-game", callback)
    if (!started.ok) return started
    clearActiveProcess.running = true
    return started
  }

  function quarantineActive(suffix, callback) {
    var normalized = String(suffix || "invalid").replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 80)
    var started = begin("quarantine-active-game", callback)
    if (!started.ok) return started
    quarantineProcess.command = [
      "cp", "--no-clobber", "--", activeGamePath,
      recoveryDir + "/active-game-" + (normalized || "invalid") + ".json"
    ]
    quarantineProcess.running = true
    return started
  }

  function loadCompleted(gameId, callback) {
    var normalized = safeGameId(gameId)
    var started
    if (!normalized)
      return ({ ok: false, code: "PERSISTENCE_VALIDATION_FAILED" })
    started = begin("load-completed-game", callback)
    if (!started.ok) return started
    historyRecordFile.path = gamesDir + "/" + normalized + ".json"
    return started
  }

  function removeCompleted(gameId, nextHistoryText, callback) {
    var normalized = safeGameId(gameId)
    var started
    if (!normalized)
      return ({ ok: false, code: "PERSISTENCE_VALIDATION_FAILED" })
    started = begin("remove-completed-game", callback)
    if (!started.ok) return started
    removeGameId = normalized
    removeHistoryText = String(nextHistoryText)
    historyFile.setText(removeHistoryText)
    return started
  }

  function normalizedExportPath(destination, gameId) {
    var path = String(destination || "")
    if (path.indexOf("file://") === 0)
      path = decodeURIComponent(path.slice(7))
    if (!path)
      path = exportsDir + "/" + safeGameId(gameId) + ".pgn"
    if (path.charAt(0) !== "/" || path.indexOf("\u0000") >= 0
        || !/\.pgn$/i.test(path))
      return ""
    return path
  }

  function exportPgn(gameId, destination, text, callback) {
    var path = normalizedExportPath(destination, gameId)
    var started
    if (!path)
      return ({ ok: false, code: "EXPORT_PATH_INVALID" })
    started = begin("export-pgn", callback)
    if (!started.ok) return started
    exportPath = path
    exportText = String(text || "")
    exportedPgnFile.path = exportPath
    exportedPgnFile.setText(exportText)
    return started
  }

  function initialReadFinished(kind, text) {
    if (kind === "settings") {
      if (settingsRead) return
      settingsRead = true
      settingsText = String(text || "")
    } else if (kind === "active") {
      if (activeGameRead) return
      activeGameRead = true
      activeGameText = String(text || "")
    } else if (kind === "history") {
      if (historyRead) return
      historyRead = true
      historyText = String(text || "")
    }

    initialReadsPending = Math.max(0, initialReadsPending - 1)
    maybeFinishInitialization()
  }

  function maybeFinishInitialization() {
    if (directoriesReady && initialReadsPending === 0 && !ready) {
      ready = true
      initialized(settingsText, activeGameText, historyText)
    }
  }

  function loadInitialFiles() {
    settingsFile.reload()
    activeGameFile.reload()
    historyFile.reload()
  }

  Process {
    id: ensureDirectoriesProcess
    command: [
      "mkdir", "-p", root.stateDir, root.gamesDir,
      root.recoveryDir, root.diagnosticsDir, root.exportsDir
    ]
    onExited: function(exitCode) {
      if (exitCode !== 0) {
        root.operationFailed("initialize", "PERSISTENCE_DIRECTORY_FAILED",
          "Could not create the XDG state directories")
        return
      }
      root.directoriesReady = true
      root.loadInitialFiles()
      root.maybeFinishInitialization()
    }
  }

  Process {
    id: clearActiveProcess
    command: ["rm", "-f", "--", root.activeGamePath]
    onExited: function(exitCode) {
      root.finish(exitCode === 0,
        exitCode === 0 ? "ACTIVE_GAME_CLEARED" : "PERSISTENCE_WRITE_FAILED",
        exitCode === 0 ? "" : "Could not clear the archived active record")
    }
  }

  Process {
    id: removeCompletedProcess
    command: [
      "rm", "-f", "--",
      root.gamesDir + "/" + root.removeGameId + ".json",
      root.gamesDir + "/" + root.removeGameId + ".pgn"
    ]
    onExited: function(exitCode) {
      root.finish(exitCode === 0,
        exitCode === 0 ? "HISTORY_GAME_REMOVED" : "PERSISTENCE_WRITE_FAILED",
        exitCode === 0 ? "" : "History index was updated but record cleanup failed")
    }
  }

  Process {
    id: quarantineProcess
    onExited: function(exitCode) {
      root.finish(exitCode === 0,
        exitCode === 0 ? "RECOVERY_COPY_CREATED" : "PERSISTENCE_WRITE_FAILED",
        exitCode === 0 ? "" : "Could not preserve the invalid active record")
    }
  }

  FileView {
    id: settingsFile
    path: root.settingsPath
    preload: true
    watchChanges: false
    atomicWrites: true
    printErrors: false
    onLoaded: root.initialReadFinished("settings", text())
    onLoadFailed: root.initialReadFinished("settings", "")
    onSaved: if (root.pendingOperation === "save-settings")
      root.finish(true, "SETTINGS_SAVED", "")
    onSaveFailed: function(error) {
      if (root.pendingOperation === "save-settings")
        root.finish(false, "PERSISTENCE_WRITE_FAILED", String(error))
    }
  }

  FileView {
    id: activeGameFile
    path: root.activeGamePath
    preload: true
    watchChanges: false
    atomicWrites: true
    printErrors: false
    onLoaded: root.initialReadFinished("active", text())
    onLoadFailed: root.initialReadFinished("active", "")
    onSaved: if (root.pendingOperation === "save-active-game")
      root.finish(true, "ACTIVE_GAME_SAVED", "")
    onSaveFailed: function(error) {
      if (root.pendingOperation === "save-active-game")
        root.finish(false, "PERSISTENCE_WRITE_FAILED", String(error))
    }
  }

  FileView {
    id: historyFile
    path: root.historyPath
    preload: true
    watchChanges: false
    atomicWrites: true
    printErrors: false
    onLoaded: root.initialReadFinished("history", text())
    onLoadFailed: root.initialReadFinished("history", "")
    onSaved: {
      if (root.pendingOperation === "save-history")
        root.finish(true, "HISTORY_SAVED", "")
      else if (root.pendingOperation === "archive-completed-game")
        root.finish(true, "GAME_ARCHIVED", "")
      else if (root.pendingOperation === "remove-completed-game")
        removeCompletedProcess.running = true
    }
    onSaveFailed: function(error) {
      if (root.pendingOperation === "save-history" ||
          root.pendingOperation === "archive-completed-game" ||
          root.pendingOperation === "remove-completed-game")
        root.finish(false, "HISTORY_ARCHIVE_FAILED", String(error))
    }
  }

  FileView {
    id: completedJsonFile
    path: ""
    preload: false
    watchChanges: false
    atomicWrites: true
    printErrors: false
    onSaved: if (root.pendingOperation === "archive-completed-game")
      completedPgnFile.setText(root.archivePgnText)
    onSaveFailed: function(error) {
      if (root.pendingOperation === "archive-completed-game")
        root.finish(false, "HISTORY_ARCHIVE_FAILED", String(error))
    }
  }

  FileView {
    id: historyRecordFile
    path: ""
    // A path assignment is the read trigger. Quickshell's non-preloaded
    // FileView requires an explicit blocking read to resolve dynamic paths;
    // preloading keeps this history action asynchronous and UI-safe.
    preload: true
    watchChanges: false
    atomicWrites: false
    printErrors: false
    onLoaded: if (root.pendingOperation === "load-completed-game")
      root.finish(true, "HISTORY_GAME_LOADED", "", { text: text() })
    onLoadFailed: if (root.pendingOperation === "load-completed-game")
      root.finish(false, "HISTORY_GAME_NOT_FOUND", "Completed record could not be read")
  }

  FileView {
    id: exportedPgnFile
    path: ""
    preload: false
    watchChanges: false
    atomicWrites: true
    printErrors: false
    onSaved: if (root.pendingOperation === "export-pgn")
      root.finish(true, "PGN_EXPORTED", "", { path: root.exportPath })
    onSaveFailed: function(error) {
      if (root.pendingOperation === "export-pgn")
        root.finish(false, "PGN_EXPORT_FAILED", String(error))
    }
  }

  FileView {
    id: completedPgnFile
    path: ""
    preload: false
    watchChanges: false
    atomicWrites: true
    printErrors: false
    onSaved: if (root.pendingOperation === "archive-completed-game")
      historyFile.setText(root.archiveHistoryText)
    onSaveFailed: function(error) {
      if (root.pendingOperation === "archive-completed-game")
        root.finish(false, "HISTORY_ARCHIVE_FAILED", String(error))
    }
  }

  Component.onCompleted: if (autoStart) initialize()
}
