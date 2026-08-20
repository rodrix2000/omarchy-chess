pragma ComponentBehavior: Bound

import QtQuick
import QtQml.WorkerScript
import QtMultimedia
import Quickshell
import "engine/ChessCore.js" as ChessCore
import "engine/RulesAdapter.js" as RulesAdapter
import "engine/PositionKey.js" as PositionKey
import "engine/Adjudicator.js" as Adjudicator
import "engine/ClockController.js" as ClockController
import "engine/GameController.js" as GameController
import "engine/PersistenceModel.js" as PersistenceModel
import "engine/PgnMetadata.js" as PgnMetadata
import "engine/DifficultyProfiles.js" as DifficultyProfiles
import "engine/WorkerProtocol.js" as WorkerProtocol
import "third_party/chess.js/qml/chess.js" as ChessVendor

Item {
  id: root

  property string omarchyPath: ""
  property var shell: null
  property var manifest: null

  property bool ready: false
  property bool rulesReady: false
  property bool storageReady: false
  property bool hasActiveGame: false
  property bool computerThinking: false
  property bool persistenceHealthy: true
  property bool persistenceBusy: false
  property string gameStatus: "idle"
  property string activeGameId: ""
  property string barText: "Chess"
  property string tooltipText: "Omarchy Chess — no active game"
  property string activeSide: ""
  property string latestResult: ""
  property var snapshot: ({ status: "idle" })
  property var settingsSnapshot: ({})
  property var historyDocument: ({ schema_version: 1, games: [] })
  property var historySummary: ({ total: 0, recent: [] })
  property var historyRecord: null
  property var replaySnapshot: null
  property bool historyLoading: false
  property string lastExportPath: ""
  property var recentDiagnostics: []
  property var lastError: null
  property var rulesAdapter: null
  property var gameController: null
  property var pendingNewGameOptions: null
  property var activeSearchContext: null
  property int computerSearchBudgetMs: 0
  property int clockCheckpointSeconds: 0
  readonly property string pluginVersion: manifest && manifest.version
    ? String(manifest.version) : "1.0.2"
  readonly property string stateDirectory: persistenceStore.stateDir
  readonly property bool audioRuntimeEnabled:
    Quickshell.env("OMARCHY_CHESS_DISABLE_AUDIO") !== "1"

  signal serviceStateChanged()
  signal gameEvent(var event)
  signal notificationRequested(var notification)
  signal persistenceFailed(var error)
  signal computerSearchStarted(var search)
  signal computerSearchFinished(var result)
  signal historyRecordLoaded(var record)
  signal historyRecordLoadFailed(var error)
  signal exportCompleted(string path)
  signal settingsSaved(var settings)

  function result(ok, code, detail, data) {
    return {
      ok: ok === true,
      code: code,
      detail: detail || "",
      data: data || ({}),
      events: []
    }
  }

  function safeParseObject(raw, emptyValue, maxCharacters) {
    var text = String(raw || "")
    var limit = Number(maxCharacters || (2 * 1024 * 1024))
    if (text.length > limit)
      return ({
        ok: false,
        code: "PERSISTENCE_VALIDATION_FAILED",
        detail: "Document exceeds the " + limit + " character safety limit"
      })
    if (text.trim() === "")
      return ({ ok: true, value: emptyValue })
    try {
      var parsed = JSON.parse(text)
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        return ({ ok: false, code: "PERSISTENCE_VALIDATION_FAILED" })
      return ({ ok: true, value: parsed })
    } catch (error) {
      return ({
        ok: false,
        code: "PERSISTENCE_VALIDATION_FAILED",
        detail: String(error)
      })
    }
  }

  function parseOptions(optionsJson) {
    if (optionsJson === undefined || optionsJson === null || optionsJson === "")
      return ({ ok: true, value: ({}) })
    if (typeof optionsJson === "object" && !Array.isArray(optionsJson))
      return ({ ok: true, value: optionsJson })
    return safeParseObject(optionsJson, ({}), 64 * 1024)
  }

  function errorEnvelope(code, operation, detail) {
    return {
      code: code,
      severity: "critical",
      recoverable: true,
      message_key: "error." + String(code).toLowerCase(),
      details: { operation: operation || "unknown", detail: detail || "" },
      occurred_at: new Date().toISOString()
    }
  }

  function emitEvents(commandResult) {
    var sound = ""
    if (!commandResult || !Array.isArray(commandResult.events)) return
    for (var index = 0; index < commandResult.events.length; index++) {
      recordDiagnostic(commandResult.events[index].type,
        commandResult.events[index].payload || ({}))
      gameEvent(commandResult.events[index])
      var eventType = commandResult.events[index].type
      var payload = commandResult.events[index].payload || ({})
      if (eventType === "move-committed" && !sound) {
        if (String(payload.san || "").indexOf("O-O") === 0) sound = "castle"
        else if (String(payload.san || "").indexOf("x") >= 0) sound = "capture"
        else sound = "move"
      } else if (eventType === "check") {
        sound = "check"
      } else if (eventType === "game-completed") {
        if (payload.result && payload.result.reason === "timeout") sound = "timeout"
        else if (payload.result && payload.result.winner) sound = "victory"
        else sound = "draw"
      }
    }
    if (sound) playSound(sound)
  }

  function playSound(name) {
    if (!audioRuntimeEnabled || !settingsSnapshot.audio
        || settingsSnapshot.audio.enabled !== true)
      return
    var normalized = /^(move|capture|castle|check|victory|draw|timeout)$/.test(name)
      ? name : "move"
    lazySound.active = false
    lazySound.requestedSource = Qt.resolvedUrl("assets/sounds/" + normalized + ".wav")
    lazySound.active = true
  }

  function recordDiagnostic(type, payload) {
    var next = recentDiagnostics.slice(Math.max(0, recentDiagnostics.length - 39))
    var safe = {
      type: String(type || "event").slice(0, 80),
      occurred_at: new Date().toISOString()
    }
    if (payload && payload.code) safe.code = String(payload.code).slice(0, 80)
    if (payload && typeof payload.duration_ms === "number")
      safe.duration_ms = payload.duration_ms
    if (payload && typeof payload.depth === "number") safe.depth = payload.depth
    if (payload && typeof payload.nodes === "number") safe.nodes = payload.nodes
    next.push(safe)
    recentDiagnostics = next
  }

  function diagnosticSnapshot() {
    return {
      plugin_version: pluginVersion,
      rules_version: "chess.js 1.4.0",
      state_schema: 1,
      settings_schema: 1,
      history_schema: 1,
      game_mode: snapshot.mode || null,
      game_status: snapshot.status || "idle",
      last_error_code: lastError ? lastError.code : null,
      ai_worker: computerThinking ? "searching" : "idle",
      recent_events: recentDiagnostics.slice()
    }
  }

  function rebuildHistorySummary() {
    var games = historyDocument && Array.isArray(historyDocument.games)
      ? historyDocument.games : []
    var recent = []
    for (var index = games.length - 1; index >= 0 && recent.length < 10; index--)
      recent.push(games[index])
    historySummary = { total: games.length, recent: recent }
  }

  function replayFrames(record) {
    var adapter = RulesAdapter.create({
      pgn: record.pgn,
      pgnOptions: { strict: true }
    })
    var frames = []
    var index
    if (!adapter || adapter.valid === false || adapter.fen() !== record.fen)
      return null
    frames.unshift({
      ply: record.moves.length,
      fen: adapter.fen(),
      board: adapter.board(),
      turn: adapter.turn(),
      in_check: adapter.isCheck(),
      last_move: record.moves.length ? record.moves[record.moves.length - 1] : null
    })
    for (index = record.moves.length - 1; index >= 0; index--) {
      var undone = adapter.undo()
      if (!undone.ok) return null
      frames.unshift({
        ply: index,
        fen: adapter.fen(),
        board: adapter.board(),
        turn: adapter.turn(),
        in_check: adapter.isCheck(),
        last_move: index > 0 ? record.moves[index - 1] : null
      })
    }
    return frames
  }

  function openHistoryGame(gameId) {
    var started
    if (!ready) return result(false, "NOT_READY")
    if (persistenceBusy) return result(false, "PERSISTENCE_BUSY")
    historyLoading = true
    persistenceBusy = true
    started = persistenceStore.loadCompleted(gameId, function(loadResult) {
      var parsed
      var migrated
      var frames
      historyLoading = false
      persistenceBusy = false
      if (!loadResult.ok) {
        var readError = errorEnvelope(loadResult.code, "load-history-game", loadResult.detail)
        readError.category = "history"
        lastError = readError
        publishSnapshot()
        historyRecordLoadFailed(readError)
        return
      }
      parsed = safeParseObject(loadResult.data.text, null, 4 * 1024 * 1024)
      migrated = parsed.ok ? PersistenceModel.migrateCompletedRecord(parsed.value) : parsed
      frames = migrated.ok ? replayFrames(migrated.value) : null
      if (!migrated.ok || !frames) {
        var validationError = errorEnvelope(
          migrated.ok ? "HISTORY_RECORD_INVALID" : migrated.code,
          "load-history-game",
          migrated.ok ? "The game replay did not match its saved record." : migrated.detail)
        validationError.category = "history"
        lastError = validationError
        publishSnapshot()
        historyRecordLoadFailed(validationError)
        return
      }
      historyRecord = migrated.value
      replaySnapshot = { record: migrated.value, frames: frames }
      if (lastError && lastError.category === "history") lastError = null
      publishSnapshot()
      historyRecordLoaded(replaySnapshot)
    })
    if (!started.ok) {
      historyLoading = false
      persistenceBusy = false
      return result(false, started.code)
    }
    return result(true, "HISTORY_LOAD_STARTED")
  }

  function removeHistoryGame(gameId) {
    var next = PersistenceModel.removeHistorySummary(historyDocument, gameId)
    var started
    if (!ready) return result(false, "NOT_READY")
    if (persistenceBusy) return result(false, "PERSISTENCE_BUSY")
    if (!next.ok) return result(false, next.code, next.detail)
    if (!next.removed) return result(true, "HISTORY_GAME_ALREADY_REMOVED")
    persistenceBusy = true
    started = persistenceStore.removeCompleted(gameId,
      PersistenceModel.serialize(next.value), function(removeResult) {
        persistenceBusy = false
        if (!removeResult.ok) {
          var removeError = errorEnvelope(removeResult.code,
            "remove-history-game", removeResult.detail)
          removeError.category = "history"
          lastError = removeError
          publishSnapshot()
          historyRecordLoadFailed(removeError)
          return
        }
        historyDocument = next.value
        if (historyRecord && historyRecord.game_id === gameId) {
          historyRecord = null
          replaySnapshot = null
        }
        rebuildHistorySummary()
        publishSnapshot()
        gameEvent({
          type: "history-game-removed",
          occurred_at: new Date().toISOString(),
          game_id: gameId,
          payload: ({})
        })
      })
    if (!started.ok) {
      persistenceBusy = false
      return result(false, started.code)
    }
    return result(true, "HISTORY_REMOVE_STARTED")
  }

  function pgnForGame(gameId) {
    if ((!gameId || gameId === activeGameId) && gameController
        && gameController.snapshot().status !== "idle")
      return gameController.snapshot().pgn
    if (historyRecord && historyRecord.game_id === gameId)
      return PersistenceModel.toPgn(historyRecord)
    return ""
  }

  function copyPgn(gameId) {
    var pgn = pgnForGame(gameId)
    if (!pgn) return result(false, "PGN_NOT_AVAILABLE")
    Quickshell.clipboardText = pgn
    return result(true, "PGN_COPIED")
  }

  function copyDiagnostics() {
    var text = JSON.stringify(diagnosticSnapshot(), null, 2) + "\n"
    Quickshell.clipboardText = text
    return result(true, "DIAGNOSTICS_COPIED")
  }

  function exportPgn(gameId, destination) {
    var pgn = pgnForGame(gameId)
    var id = gameId || activeGameId
    var started
    if (!pgn || !id) return result(false, "PGN_NOT_AVAILABLE")
    if (persistenceBusy) return result(false, "PERSISTENCE_BUSY")
    persistenceBusy = true
    started = persistenceStore.exportPgn(id, destination, pgn, function(exportResult) {
      persistenceBusy = false
      if (!exportResult.ok) {
        var exportError = errorEnvelope(exportResult.code, "export-pgn", exportResult.detail)
        exportError.category = "export"
        lastError = exportError
        publishSnapshot()
        return
      }
      lastExportPath = exportResult.data.path
      if (lastError && lastError.category === "export") lastError = null
      publishSnapshot()
      exportCompleted(lastExportPath)
    })
    if (!started.ok) {
      persistenceBusy = false
      return result(false, started.code)
    }
    return result(true, "PGN_EXPORT_STARTED")
  }

  function updateSettings(patchJson) {
    var parsed = parseOptions(patchJson)
    var merged
    var started
    if (!ready) return result(false, "NOT_READY")
    if (persistenceBusy) return result(false, "PERSISTENCE_BUSY")
    if (!parsed.ok) return result(false, "INVALID_COMMAND")
    merged = PersistenceModel.mergeSettingsPatch(settingsSnapshot, parsed.value)
    if (!merged.ok) return result(false, merged.code, merged.detail)
    persistenceBusy = true
    started = persistenceStore.saveSettings(PersistenceModel.serialize(merged.value),
      function(saveResult) {
        persistenceBusy = false
        if (!saveResult.ok) {
          failPersistence("save-settings", saveResult.code, saveResult.detail)
          return
        }
        settingsSnapshot = merged.value
        publishSnapshot()
        settingsSaved(settingsSnapshot)
      })
    if (!started.ok) {
      persistenceBusy = false
      return result(false, started.code)
    }
    return result(true, "SETTINGS_SAVE_STARTED")
  }

  function resetSettings() {
    return updateSettings(PersistenceModel.defaultSettings())
  }

  function publishSnapshot() {
    var game = gameController ? gameController.snapshot() : ({ status: "idle" })
    game.ready = ready
    game.persistence_healthy = persistenceHealthy
    game.persistence_busy = persistenceBusy
    game.save_error = lastError
    game.computer_thinking = computerThinking
    snapshot = game

    gameStatus = game.status || "idle"
    activeGameId = game.game_id || ""
    activeSide = game.turn || ""
    hasActiveGame = gameStatus !== "idle"
    if (game.result) latestResult = game.result.score || ""

    if (!ready) {
      barText = "Starting…"
      tooltipText = "Omarchy Chess — starting"
    } else if (!persistenceHealthy || gameStatus === "paused-error") {
      barText = lastError && lastError.category === "ai" ? "Computer paused" : "Save error"
      tooltipText = lastError && lastError.category === "ai"
        ? "Omarchy Chess — computer move failed; game paused safely"
        : "Omarchy Chess — game safe in memory; save needs attention"
    } else if (gameStatus === "active-computer") {
      barText = "Thinking…"
      tooltipText = "Omarchy Chess — computer is thinking"
    } else if (gameStatus === "promotion-pending") {
      barText = "Promote"
      tooltipText = "Omarchy Chess — choose a promotion piece"
    } else if (gameStatus === "active-human") {
      barText = game.mode === "computer" && activeSide === game.human_color
        ? "Your move"
        : (activeSide === "black" ? "Black" : "White") + " to move"
      tooltipText = "Omarchy Chess — " + barText.toLowerCase()
    } else if (gameStatus === "paused") {
      barText = "Paused"
      tooltipText = "Omarchy Chess — game paused"
    } else if (gameStatus === "completed") {
      barText = latestResult || "Finished"
      tooltipText = "Omarchy Chess — game finished " + latestResult
    } else if (gameStatus === "abandoned") {
      barText = "Game ended"
      tooltipText = "Omarchy Chess — game abandoned"
    } else {
      barText = "Chess"
      tooltipText = "Omarchy Chess — no active game"
    }
    serviceStateChanged()
  }

  function failPersistence(operation, code, detail) {
    persistenceBusy = false
    persistenceHealthy = false
    lastError = errorEnvelope(code || "PERSISTENCE_WRITE_FAILED", operation, detail)
    if (gameController && gameStatus !== "completed" && gameStatus !== "abandoned")
      gameController.markErrorPause(lastError.code)
    publishSnapshot()
    persistenceFailed(lastError)
    notificationRequested({
      title: "Chess game paused",
      body: "The game is safe in memory, but it could not be saved.",
      urgency: "critical",
      code: lastError.code
    })
  }

  function archiveCurrentGame(activeDocument) {
    var record = PersistenceModel.createCompletedRecord(
      activeDocument, activeDocument.result)
    var recordValidation = PersistenceModel.validateCompletedRecord(record)
    var nextHistory = historyDocument
    var historyResult
    var pgn
    var started

    if (!recordValidation.ok) {
      failPersistence("archive-completed-game", recordValidation.code,
        recordValidation.detail)
      return
    }

    if (activeDocument.status === "completed") {
      historyResult = PersistenceModel.appendHistorySummary(historyDocument, record)
      if (!historyResult.ok) {
        failPersistence("archive-completed-game", historyResult.code,
          historyResult.detail)
        return
      }
      nextHistory = historyResult.value
    }
    pgn = PersistenceModel.toPgn(record)
    if (typeof pgn !== "string") {
      failPersistence("archive-completed-game", "HISTORY_ARCHIVE_FAILED",
        "Completed PGN validation failed")
      return
    }

    persistenceBusy = true
    started = persistenceStore.archiveCompleted(
      record.game_id,
      PersistenceModel.serialize(record),
      pgn.charAt(pgn.length - 1) === "\n" ? pgn : pgn + "\n",
      PersistenceModel.serialize(nextHistory),
      function(saveResult) {
        persistenceBusy = false
        if (!saveResult.ok) {
          failPersistence(saveResult.operation, saveResult.code, saveResult.detail)
          return
        }
        historyDocument = nextHistory
        rebuildHistorySummary()
        gameEvent({
          type: "save-completed",
          occurred_at: new Date().toISOString(),
          game_id: record.game_id,
          payload: { operation: "archive-completed-game" }
        })
        persistenceStore.clearActive(function(clearResult) {
          if (!clearResult.ok) {
            failPersistence(clearResult.operation, clearResult.code, clearResult.detail)
            return
          }
          persistenceHealthy = true
          lastError = null
          publishSnapshot()
          if (pendingNewGameOptions) {
            var nextOptions = pendingNewGameOptions
            pendingNewGameOptions = null
            handleCommand(gameController.newGame(nextOptions), true)
          }
        })
      })
    if (!started.ok)
      failPersistence("archive-completed-game", started.code, "Archive is busy")
  }

  function persistController(commandResult) {
    var document = gameController.persistenceDocument()
    var structural = PersistenceModel.validateActiveGame(document)
    var semantic
    var started

    if (!structural.ok) {
      failPersistence("save-active-game", structural.code, structural.detail)
      return commandResult
    }
    semantic = PersistenceModel.semanticValidateActiveGame(document, RulesAdapter)
    if (!semantic.ok) {
      var pgnProbe = RulesAdapter.create({
        pgn: document.pgn,
        pgnOptions: { strict: true }
      })
      failPersistence("save-active-game", semantic.code, semantic.detail)
      if (lastError && pgnProbe && pgnProbe.error)
        lastError.details.rules_error = pgnProbe.error
      return commandResult
    }

    persistenceBusy = true
    if (!commandResult.data) commandResult.data = ({})
    commandResult.data.persistence_pending = true
    started = persistenceStore.saveActive(PersistenceModel.serialize(document),
      function(saveResult) {
        persistenceBusy = false
        if (!saveResult.ok) {
          failPersistence(saveResult.operation, saveResult.code, saveResult.detail)
          return
        }
        persistenceHealthy = true
        if (!lastError || lastError.category !== "ai")
          lastError = null
        gameEvent({
          type: "save-completed",
          occurred_at: new Date().toISOString(),
          game_id: document.game_id,
          payload: { operation: "save-active-game" }
        })
        publishSnapshot()
        if (document.status === "completed" || document.status === "abandoned")
          archiveCurrentGame(document)
        else
          maybeStartComputerSearch()
      })
    if (!started.ok)
      failPersistence("save-active-game", started.code, "Save is busy")
    return commandResult
  }

  function handleCommand(commandResult, persist) {
    emitEvents(commandResult)
    publishSnapshot()
    if (persist)
      return persistController(commandResult)
    return commandResult
  }

  function stableSearchSeed(game) {
    var text = String(game.game_id || "omarchy-chess") + ":"
      + String(game.search_token || 0) + ":" + String(game.moves ? game.moves.length : 0)
    var hash = 2166136261
    for (var index = 0; index < text.length; index++) {
      hash ^= text.charCodeAt(index)
      hash = (hash * 16777619) >>> 0
    }
    return hash >>> 0
  }

  function cancelComputerSearch(reason) {
    if (!computerThinking && !activeSearchContext) return
    computerThinking = false
    activeSearchContext = null
    computerSearchBudgetMs = 0
    computerWatchdog.stop()
    gameEvent({
      type: "computer-search-cancelled",
      occurred_at: new Date().toISOString(),
      game_id: activeGameId,
      payload: { reason: reason || "state-changed" }
    })
  }

  function maybeStartComputerSearch() {
    var game
    var profile
    var remaining = null
    var increment = 0
    var budget
    var history = []
    var request

    if (!ready || persistenceBusy || !persistenceHealthy || computerThinking
        || !gameController)
      return false
    game = gameController.snapshot()
    if (game.status !== "active-computer" || game.mode !== "computer"
        || !game.computer_turn_requested)
      return false
    profile = DifficultyProfiles.resolveProfile(game.difficulty || "casual")
    if (!profile) {
      failComputerSearch("AI_UNKNOWN_PROFILE", "The saved difficulty is unavailable.")
      return false
    }
    if (game.clock && game.clock.enabled) {
      remaining = Number(game.clock[game.turn + "_ms"])
      increment = Number(game.clock.increment_ms || 0)
    }
    budget = DifficultyProfiles.clockAwareBudget(profile, remaining, increment)
    for (var index = 0; index < game.moves.length; index++)
      history.push(game.moves[index].uci)
    request = {
      protocol_version: 1,
      type: "search",
      token: game.search_token,
      game_id: game.game_id,
      source_fen: game.fen,
      history_uci: history,
      position_counts: game.position_counts || ({}),
      profile: profile,
      budget_ms: budget,
      seed: stableSearchSeed(game),
      sent_at_ms: Date.now()
    }
    activeSearchContext = {
      token: request.token,
      game_id: request.game_id,
      source_fen: request.source_fen,
      budget_ms: budget
    }
    computerSearchBudgetMs = budget
    computerThinking = true
    publishSnapshot()
    computerSearchStarted(request)
    computerWatchdog.interval = Math.max(750, budget + 600)
    computerWatchdog.restart()
    aiWorker.sendMessage(request)
    return true
  }

  function responseMatchesActive(response, game) {
    return activeSearchContext && response
      && response.token === activeSearchContext.token
      && response.game_id === activeSearchContext.game_id
      && response.source_fen === activeSearchContext.source_fen
      && game.status === "active-computer"
      && game.game_id === activeSearchContext.game_id
      && game.search_token === activeSearchContext.token
      && game.fen === activeSearchContext.source_fen
  }

  function failComputerSearch(code, detail) {
    var paused
    cancelComputerSearch(code || "AI_SEARCH_FAILED")
    lastError = errorEnvelope(code || "AI_SEARCH_FAILED", "computer-search", detail)
    lastError.category = "ai"
    paused = gameController.markErrorPause(lastError.code)
    emitEvents(paused)
    publishSnapshot()
    if (paused.ok)
      persistController(paused)
    notificationRequested({
      title: "Computer game paused",
      body: "The computer could not finish its move. Your game is safe.",
      urgency: "normal",
      code: lastError.code
    })
    return paused
  }

  function handleComputerResponse(response) {
    var game = gameController ? gameController.snapshot() : ({ status: "idle" })
    var validation = WorkerProtocol.validateWorkerResponse(response)
    var commandResult
    var metrics

    if (!responseMatchesActive(response, game)) {
      if (activeSearchContext && response
          && response.token === activeSearchContext.token)
        cancelComputerSearch("stale-response")
      gameEvent({
        type: "computer-search-stale",
        occurred_at: new Date().toISOString(),
        game_id: response && response.game_id || "",
        payload: { code: validation.code }
      })
      return
    }
    computerWatchdog.stop()
    if (!validation.ok || response.type === "error") {
      failComputerSearch(response && response.code || validation.code,
        response && response.message || "The worker returned an invalid response.")
      return
    }
    if (!WorkerProtocol.isCurrentResponse(response, {
      token: game.search_token,
      game_id: game.game_id,
      source_fen: game.fen,
      accepting: true,
      paused: false,
      completed: false
    })) {
      cancelComputerSearch("response-rejected")
      return
    }

    metrics = {
      uci: response.uci,
      score_cp: response.score_cp,
      depth: response.depth,
      nodes: response.nodes,
      duration_ms: response.duration_ms,
      principal_variation: response.principal_variation || [],
      limited_by: response.limited_by || "",
      profile_id: response.profile_id || game.difficulty
    }
    computerThinking = false
    activeSearchContext = null
    computerSearchBudgetMs = 0
    commandResult = commitComputerMove(response.uci, response.token)
    if (!commandResult.ok) {
      failComputerSearch(commandResult.code || "ILLEGAL_ENGINE_MOVE",
        "The returned move failed final rules validation.")
      return
    }
    computerSearchFinished(metrics)
    gameEvent({
      type: "computer-search-completed",
      occurred_at: new Date().toISOString(),
      game_id: game.game_id,
      payload: metrics
    })
  }

  function retryComputerMove(difficulty) {
    var changed
    var recovered
    var resumed
    if (!ready || persistenceBusy)
      return result(false, !ready ? "NOT_READY" : "PERSISTENCE_BUSY")
    if (!lastError || lastError.category !== "ai")
      return result(false, "AI_RETRY_NOT_AVAILABLE")
    if (difficulty) {
      changed = gameController.setComputerDifficulty(difficulty)
      if (!changed.ok) return changed
      emitEvents(changed)
    }
    recovered = gameController.recoverErrorPause()
    if (!recovered.ok) return recovered
    emitEvents(recovered)
    lastError = null
    resumed = gameController.resume()
    return handleCommand(resumed, true)
  }

  function commandAllowed() {
    if (!ready) return result(false, "NOT_READY", "Chess is still starting")
    if (persistenceBusy)
      return result(false, "PERSISTENCE_BUSY", "A save is already in progress")
    if (!persistenceHealthy)
      return result(false, "PERSISTENCE_UNHEALTHY", "Retry the save before continuing")
    return null
  }

  function newGame(optionsJson) {
    var blocked = commandAllowed()
    var parsed
    if (blocked) return blocked
    parsed = parseOptions(optionsJson)
    if (!parsed.ok)
      return result(false, "INVALID_COMMAND", "New-game options must be a JSON object")
    if (parsed.value.conflict === "abandon" && gameController) {
      var current = gameController.snapshot()
      if (current.status === "active-human" || current.status === "active-computer"
          || current.status === "promotion-pending" || current.status === "paused"
          || current.status === "paused-error") {
        cancelComputerSearch("new-game")
        pendingNewGameOptions = JSON.parse(JSON.stringify(parsed.value))
        pendingNewGameOptions.conflict = "cancel"
        return handleCommand(gameController.abandon(), true)
      }
    }
    cancelComputerSearch("new-game")
    return handleCommand(gameController.newGame(parsed.value), true)
  }

  function resumeGame() {
    var blocked = commandAllowed()
    if (blocked) return blocked
    return handleCommand(gameController.resume(), true)
  }

  function pauseGame(reason) {
    if (!ready) return result(false, "NOT_READY", "Chess is still starting")
    if (persistenceBusy)
      return result(false, "PERSISTENCE_BUSY", "A save is already in progress")
    cancelComputerSearch(reason || "pause")
    return handleCommand(gameController.pause(reason || "user"), true)
  }

  function requestMove(fromSquare, toSquare, promotion) {
    var blocked = commandAllowed()
    var commandResult
    if (blocked) return blocked
    commandResult = gameController.move({
      from: String(fromSquare || ""),
      to: String(toSquare || ""),
      promotion: promotion || null,
      actor: "human"
    })
    return handleCommand(commandResult,
      commandResult.ok || commandResult.code === "CLOCK_EXPIRED")
  }

  function commitComputerMove(uci, searchToken) {
    var blocked = commandAllowed()
    var move = String(uci || "").toLowerCase()
    var commandResult
    if (blocked) return blocked
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move))
      return result(false, "ILLEGAL_ENGINE_MOVE", "Computer move was malformed")
    commandResult = gameController.move({
      from: move.slice(0, 2),
      to: move.slice(2, 4),
      promotion: move.length === 5 ? move.charAt(4) : null,
      actor: "computer",
      search_token: searchToken
    })
    return handleCommand(commandResult,
      commandResult.ok || commandResult.code === "CLOCK_EXPIRED")
  }

  function choosePromotion(piece) {
    var blocked = commandAllowed()
    var commandResult
    if (blocked) return blocked
    commandResult = gameController.choosePromotion(piece)
    return handleCommand(commandResult, commandResult.ok)
  }

  function requestUndo(confirmed) {
    var blocked = commandAllowed()
    if (blocked) return blocked
    if (confirmed === true) cancelComputerSearch("undo")
    return handleCommand(gameController.undo({ confirmed: confirmed === true }), true)
  }

  function resign(side) {
    var blocked = commandAllowed()
    if (blocked) return blocked
    cancelComputerSearch("resign")
    return handleCommand(gameController.resign(side), true)
  }

  function offerDraw(side) {
    var blocked = commandAllowed()
    if (blocked) return blocked
    return handleCommand(gameController.offerDraw(side), true)
  }

  function respondToDraw(side, accepted) {
    var blocked = commandAllowed()
    if (blocked) return blocked
    return handleCommand(gameController.respondToDraw(side, accepted === true), true)
  }

  function claimDraw(side, type, moveUci) {
    var blocked = commandAllowed()
    if (blocked) return blocked
    cancelComputerSearch("draw-claim")
    return handleCommand(gameController.claimDraw(side, type, moveUci), true)
  }

  function abandonGame() {
    if (!ready || persistenceBusy)
      return result(false, !ready ? "NOT_READY" : "PERSISTENCE_BUSY")
    cancelComputerSearch("abandon")
    return handleCommand(gameController.abandon(), true)
  }

  function convertComputerToLocal() {
    if (!ready || persistenceBusy)
      return result(false, !ready ? "NOT_READY" : "PERSISTENCE_BUSY")
    cancelComputerSearch("mode-conversion")
    lastError = null
    return handleCommand(gameController.convertComputerToLocal(), true)
  }

  function legalMoves(square) {
    return gameController ? gameController.legalMoves(square) : []
  }

  function retrySave() {
    var recovered
    if (!ready) return result(false, "NOT_READY")
    if (persistenceBusy) return result(false, "PERSISTENCE_BUSY")
    if (persistenceHealthy) return result(true, "PERSISTENCE_HEALTHY")
    recovered = gameController.recoverErrorPause()
    if (!recovered.ok) return recovered
    persistenceHealthy = true
    return persistController(recovered)
  }

  function loadSettings(raw) {
    var parsed = safeParseObject(raw, PersistenceModel.defaultSettings(), 256 * 1024)
    var migrated
    if (!parsed.ok) {
      settingsSnapshot = PersistenceModel.defaultSettings()
      lastError = errorEnvelope(parsed.code, "load-settings", parsed.detail)
      return
    }
    migrated = PersistenceModel.migrateSettings(parsed.value)
    settingsSnapshot = migrated.ok ? migrated.value : PersistenceModel.defaultSettings()
    if (!migrated.ok)
      lastError = errorEnvelope(migrated.code, "load-settings", migrated.detail)
  }

  function loadHistory(raw) {
    var parsed = safeParseObject(raw, PersistenceModel.defaultHistory(), 2 * 1024 * 1024)
    var migrated
    if (!parsed.ok) {
      historyDocument = PersistenceModel.defaultHistory()
      lastError = errorEnvelope(parsed.code, "load-history", parsed.detail)
      rebuildHistorySummary()
      return
    }
    migrated = PersistenceModel.migrateHistory(parsed.value)
    historyDocument = migrated.ok ? migrated.value : PersistenceModel.defaultHistory()
    if (!migrated.ok)
      lastError = errorEnvelope(migrated.code, "load-history", migrated.detail)
    rebuildHistorySummary()
  }

  function loadActiveGame(raw) {
    var parsed
    var migrated
    var semantic
    var loaded
    var loadCode
    if (!raw || String(raw).trim() === "") return

    parsed = safeParseObject(raw, null, 4 * 1024 * 1024)
    if (parsed.ok) migrated = PersistenceModel.migrateActiveGame(parsed.value)
    if (!parsed.ok || !migrated.ok) {
      loadCode = parsed.ok ? migrated.code : parsed.code
      lastError = errorEnvelope(loadCode, "load-active-game",
        parsed.ok ? migrated.detail : parsed.detail)
      persistenceHealthy = false
      persistenceStore.quarantineActive(String(Date.now()), function(copyResult) {
        if (copyResult.ok) {
          persistenceHealthy = true
          publishSnapshot()
        }
      })
      return
    }

    semantic = PersistenceModel.semanticValidateActiveGame(migrated.value, RulesAdapter)
    if (!semantic.ok) {
      lastError = errorEnvelope(semantic.code, "load-active-game", semantic.detail)
      persistenceHealthy = false
      persistenceStore.quarantineActive(String(Date.now()), function(copyResult) {
        if (copyResult.ok) {
          persistenceHealthy = true
          publishSnapshot()
        }
      })
      return
    }
    loaded = gameController.loadGame(migrated.value)
    emitEvents(loaded)
    if (!loaded.ok) {
      lastError = errorEnvelope(loaded.code, "load-active-game", "Controller rejected saved game")
      persistenceHealthy = false
      return
    }
    if (migrated.value.status === "completed" || migrated.value.status === "abandoned")
      Qt.callLater(function() { archiveCurrentGame(migrated.value) })
  }

  function initializeFromStorage(settingsText, activeText, historyText) {
    loadSettings(settingsText)
    loadHistory(historyText)
    loadActiveGame(activeText)
    storageReady = true
    ready = rulesReady && storageReady
    publishSnapshot()
  }

  PersistenceStore {
    id: persistenceStore
    autoStart: false
    onInitialized: function(settingsText, activeGameText, historyText) {
      root.initializeFromStorage(settingsText, activeGameText, historyText)
    }
    onOperationFailed: function(operation, code, detail) {
      if (!root.persistenceBusy && operation === "initialize")
        root.failPersistence(operation, code, detail)
    }
  }

  Loader {
    id: lazySound
    active: false
    property url requestedSource: ""
    sourceComponent: Component {
      SoundEffect {
        property bool playPending: true
        source: lazySound.requestedSource
        volume: root.settingsSnapshot.audio
          ? root.settingsSnapshot.audio.volume : 0.65
        onStatusChanged: {
          if (status === SoundEffect.Ready && playPending) {
            playPending = false
            play()
          }
        }
        Component.onCompleted: {
          if (status === SoundEffect.Ready && playPending) {
            playPending = false
            play()
          }
        }
      }
    }
  }

  WorkerScript {
    id: aiWorker
    source: "engine/AiWorker.mjs"
    onMessage: function(message) { root.handleComputerResponse(message) }
  }

  Timer {
    id: computerWatchdog
    interval: 2200
    repeat: false
    onTriggered: {
      if (root.computerThinking)
        root.failComputerSearch("AI_DEADLINE_EXCEEDED",
          "The computer exceeded its hard response deadline.")
    }
  }

  Timer {
    id: clockTimer
    interval: 1000
    repeat: true
    running: root.ready && root.snapshot.clock
      && root.snapshot.clock.enabled === true
      && (root.gameStatus === "active-human"
        || root.gameStatus === "active-computer"
        || root.gameStatus === "promotion-pending")
    onTriggered: {
      if (!root.gameController || root.persistenceBusy) return
      var status = root.gameController.snapshot().status
      if (status !== "active-human" && status !== "active-computer" &&
          status !== "promotion-pending") return
      var tickResult = root.gameController.tick()
      root.emitEvents(tickResult)
      root.publishSnapshot()
      if (tickResult.code === "GAME_COMPLETED") {
        root.persistController(tickResult)
        return
      }
      root.clockCheckpointSeconds++
      if (root.clockCheckpointSeconds >= 10 && root.snapshot.clock &&
          root.snapshot.clock.enabled) {
        root.clockCheckpointSeconds = 0
        root.persistController(tickResult)
      }
    }
  }

  Component.onCompleted: {
    try {
      ChessCore.configureVendor(ChessVendor)
      RulesAdapter.configureCore(ChessCore)
      GameController.configureDependencies({
        RulesAdapter: RulesAdapter,
        PositionKey: PositionKey,
        Adjudicator: Adjudicator,
        ClockController: ClockController,
        PgnMetadata: PgnMetadata
      })
      rulesAdapter = RulesAdapter.create({})
      gameController = GameController.create({
        autostart: false,
        pluginVersion: root.pluginVersion
      })
      rulesReady = rulesAdapter && rulesAdapter.valid === true
      persistenceStore.initialize()
    } catch (error) {
      rulesReady = false
      lastError = errorEnvelope("RULES_STARTUP_FAILED", "initialize-rules", String(error))
      gameStatus = "error"
      barText = "Rules error"
      tooltipText = "Omarchy Chess — rules authority unavailable"
    }
    ready = rulesReady && storageReady
    publishSnapshot()
  }

  Component.onDestruction: {
    computerWatchdog.stop()
    clockTimer.stop()
    lazySound.active = false
    root.cancelComputerSearch("service-destroyed")
  }
}
