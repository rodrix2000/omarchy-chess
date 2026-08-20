pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Controls as Controls
import QtQuick.Layouts
import Quickshell
import qs.Commons
import "components" as ChessUi

Item {
  id: root

  property string omarchyPath: ""
  property var shell: null
  property var manifest: null
  property var service: null
  property bool closingFromHost: false
  property string requestedView: "home"
  property string currentView: "home"
  property string payloadNotice: ""
  property string actionNotice: ""
  property string selectedSquare: ""
  property string cursorSquare: "e2"
  property var legalTargets: []
  property string manualOrientation: ""
  property string confirmAction: ""
  property var pendingNewGameOptions: null
  property bool drawActionsOpen: false
  property bool resultDialogDismissed: false
  property int replayPly: 0
  property string replayOrientation: "white"
  property string pendingHistoryId: ""

  readonly property var game: service && service.snapshot
    ? service.snapshot : ({ status: "idle", board: [], moves: [] })
  readonly property string gameStatus: String(game.status || "idle")
  readonly property bool hasPlayableGame: gameStatus !== "idle"
    && gameStatus !== "completed" && gameStatus !== "abandoned"
  readonly property bool gameInputEnabled: gameStatus === "active-human"
    && game.persistence_healthy !== false
  readonly property bool wideLayout: gameWindow.width >= 850
  readonly property bool compactLayout: gameWindow.width < 720
  readonly property var latestMove: game.moves && game.moves.length > 0
    ? game.moves[game.moves.length - 1] : null
  readonly property string checkedKingSquare: checkedKing()
  readonly property string boardOrientation: effectiveOrientation()
  readonly property bool modalOpen: newGameDialog.opened || promotionDialog.opened
    || confirmDialog.opened
  readonly property bool aiError: game.save_error
    && game.save_error.category === "ai"
  readonly property var replayData: service && service.replaySnapshot
    ? service.replaySnapshot : null
  readonly property var replayFrame: replayData && replayData.frames
    && replayData.frames.length > replayPly ? replayData.frames[replayPly] : null
  readonly property string pluginId: manifest && manifest.id
    ? String(manifest.id) : "io.github.rodrix2000.chess"
  readonly property bool opened: gameWindow.visible

  signal gameFocusRequested()

  function validView(value) {
    var name = String(value || "home")
    var supported = ["home", "game", "history", "help", "settings",
      "setup-local", "setup-computer"]
    return supported.indexOf(name) >= 0 ? name : "home"
  }

  function parsePayload(payloadJson) {
    requestedView = "home"
    payloadNotice = ""
    if (!payloadJson) return ({})
    try {
      var payload = JSON.parse(String(payloadJson))
      if (!payload || typeof payload !== "object" || Array.isArray(payload))
        return ({})
      if (typeof payload.view === "string") requestedView = validView(payload.view)
      return payload
    } catch (error) {
      payloadNotice = "The launch request was invalid, so Home was opened."
      return ({})
    }
  }

  function open(payloadJson) {
    closingFromHost = false
    var payload = parsePayload(payloadJson)
    currentView = requestedView
    if (payload.action === "resume" && service
        && typeof service.resumeGame === "function") {
      invoke(service.resumeGame())
      currentView = "game"
    } else if (payload.action === "new") {
      var setupMode = payload.mode === "local" ? "local" : "computer"
      currentView = "home"
      openNewGameDialog(setupMode, payload)
    } else if (currentView === "game" && gameStatus === "idle") {
      currentView = "home"
    }
    gameWindow.visible = true
    focusScope.focus = true
    Qt.callLater(root.focusCurrentView)
  }

  function focusCurrentView() {
    if (!gameWindow.visible || root.modalOpen) return
    if (root.currentView === "game") {
      root.gameFocusRequested()
      return
    }
    keyCatcher.forceActiveFocus()
  }

  function pauseCurrentGame(reason) {
    if (gameWindow.visible)
      keyCatcher.forceActiveFocus()
    return service.pauseGame(reason)
  }

  function close() {
    closingFromHost = true
    clearSelection()
    closeTransientLayers()
    if (service && hasPlayableGame && gameStatus !== "paused"
        && gameStatus !== "paused-error"
        && typeof service.pauseGame === "function")
      pauseCurrentGame("panel-closed")
    keyCatcher.focus = false
    focusScope.focus = false
    gameWindow.visible = false
    closingFromHost = false
  }

  function requestClose() {
    if (shell && typeof shell.hide === "function") shell.hide(pluginId)
    else close()
  }

  function closeTransientLayers() {
    newGameDialog.opened = false
    confirmDialog.opened = false
    drawActionsOpen = false
  }

  function invoke(commandResult, successMessage) {
    if (!commandResult) {
      actionNotice = "That action is unavailable."
      return false
    }
    if (commandResult.ok === true) {
      actionNotice = successMessage || ""
      return true
    }
    if (commandResult.code === "PERSISTENCE_BUSY")
      actionNotice = "Saving… try again in a moment."
    else if (commandResult.code === "INVALID_MOVE")
      actionNotice = "That move is not legal in this position."
    else if (commandResult.code === "COMPUTER_THINKING")
      actionNotice = "The computer is thinking."
    else if (commandResult.code === "DRAW_CLAIM_NOT_AVAILABLE")
      actionNotice = "A draw cannot be claimed yet."
    else if (commandResult.code === "UNDO_NOT_AVAILABLE")
      actionNotice = "There is no move to take back."
    else if (commandResult.code === "ACTIVE_GAME_CONFLICT")
      actionNotice = "Finish or abandon the current game first."
    else
      actionNotice = commandResult.detail || "That action could not be completed."
    return false
  }

  function updateSetting(patch) {
    if (invoke(service.updateSettings(patch), "Saving settings…"))
      return true
    return false
  }

  function openReplay(gameId) {
    actionNotice = "Loading saved game…"
    invoke(service.openHistoryGame(gameId))
  }

  function openNewGameDialog(mode, seed) {
    var data = seed || ({})
    var settings = service && service.settingsSnapshot ? service.settingsSnapshot : ({})
    var gameplay = settings.gameplay || ({})
    var appearance = settings.appearance || ({})
    newGameDialog.mode = mode === "local" ? "local" : "computer"
    newGameDialog.humanColor = data.color || data.human_color
      || gameplay.human_color || "white"
    newGameDialog.difficulty = data.difficulty || gameplay.computer_level || "casual"
    newGameDialog.timePreset = presetForControl(data.time_control || gameplay.time_control)
    newGameDialog.orientation = data.orientation || appearance.orientation || "white"
    newGameDialog.opened = true
  }

  function presetForControl(control) {
    if (!control || control.base_ms === null || control.base_ms === undefined)
      return "untimed"
    if (Number(control.base_ms) === 300000 && Number(control.increment_ms) === 0)
      return "5+0"
    if (Number(control.base_ms) === 600000 && Number(control.increment_ms) === 5000)
      return "10+5"
    if (Number(control.base_ms) === 900000 && Number(control.increment_ms) === 10000)
      return "15+10"
    return "untimed"
  }

  function normalizeStartOptions(options) {
    var source = options || ({})
    var control = source.time_control || source.timeControl
    if (!control) {
      if (source.timePreset === "5+0" || source.time_preset === "5+0")
        control = { base_ms: 300000, increment_ms: 0 }
      else if (source.timePreset === "10+5" || source.time_preset === "10+5")
        control = { base_ms: 600000, increment_ms: 5000 }
      else if (source.timePreset === "15+10" || source.time_preset === "15+10")
        control = { base_ms: 900000, increment_ms: 10000 }
      else
        control = { base_ms: null, increment_ms: 0 }
    }
    return {
      mode: source.mode === "local" ? "local" : "computer",
      human_color: source.human_color || source.humanColor || "white",
      difficulty: source.difficulty || "casual",
      time_control: control,
      orientation: source.orientation || "white",
      players: source.players || {
        white: { name: source.whiteName || source.white_name || "White" },
        black: { name: source.blackName || source.black_name || "Black" }
      }
    }
  }

  function beginGame(options) {
    var normalized = normalizeStartOptions(options)
    newGameDialog.opened = false
    if (hasPlayableGame) {
      pendingNewGameOptions = normalized
      openConfirmation("replace")
      return
    }
    if (invoke(service.newGame(normalized))) {
      currentView = "game"
      manualOrientation = ""
      resultDialogDismissed = false
      clearSelection()
      Qt.callLater(root.focusCurrentView)
    }
  }

  function openConfirmation(action) {
    confirmAction = action
    if (action === "replace") {
      confirmDialog.title = "Start a new game?"
      confirmDialog.message = "The current game will be archived as abandoned before the new game starts."
      confirmDialog.confirmText = "Abandon and start new"
      confirmDialog.destructive = true
    } else if (action === "undo") {
      confirmDialog.title = "Take back the last move?"
      confirmDialog.message = game.mode === "computer"
        ? "Your move and the computer reply will be removed when available."
        : "The last move will be removed and the previous turn restored."
      confirmDialog.confirmText = "Take back"
      confirmDialog.destructive = false
    } else if (action === "resign") {
      confirmDialog.title = "Resign this game?"
      confirmDialog.message = titleCase(game.turn || "The current player")
        + " will lose the game immediately."
      confirmDialog.confirmText = "Resign"
      confirmDialog.destructive = true
    } else if (action === "delete-history") {
      confirmDialog.title = "Delete this saved game?"
      confirmDialog.message = "Its local JSON record and PGN file will be removed. This cannot be undone."
      confirmDialog.confirmText = "Delete saved game"
      confirmDialog.destructive = true
    } else if (action === "reset-settings") {
      confirmDialog.title = "Reset all chess settings?"
      confirmDialog.message = "Gameplay and accessibility defaults will reset. Active games and history stay untouched."
      confirmDialog.confirmText = "Reset settings"
      confirmDialog.destructive = false
    } else {
      confirmDialog.title = "End this game?"
      confirmDialog.message = "The unfinished game will be archived as abandoned."
      confirmDialog.confirmText = "End game"
      confirmDialog.destructive = true
    }
    confirmDialog.opened = true
  }

  function performConfirmedAction() {
    confirmDialog.opened = false
    if (confirmAction === "replace") {
      var options = pendingNewGameOptions || ({})
      options.conflict = "abandon"
      pendingNewGameOptions = null
      if (invoke(service.newGame(options), "Archiving the old game…")) {
        currentView = "game"
        manualOrientation = ""
        resultDialogDismissed = false
      }
    } else if (confirmAction === "undo") {
      invoke(service.requestUndo(true))
      clearSelection()
    } else if (confirmAction === "resign") {
      invoke(service.resign(game.turn))
      clearSelection()
    } else if (confirmAction === "abandon") {
      if (invoke(service.abandonGame())) currentView = "home"
      clearSelection()
    } else if (confirmAction === "delete-history") {
      if (invoke(service.removeHistoryGame(pendingHistoryId), "Deleting saved game…"))
        currentView = "history"
      pendingHistoryId = ""
    } else if (confirmAction === "reset-settings") {
      invoke(service.resetSettings(), "Resetting settings…")
    }
    confirmAction = ""
  }

  function titleCase(value) {
    var text = String(value || "")
    return text.length ? text.charAt(0).toUpperCase() + text.slice(1) : ""
  }

  function pieceAt(square) {
    var pieces = game.board || []
    for (var index = 0; index < pieces.length; index++)
      if (pieces[index].square === square) return pieces[index]
    return null
  }

  function clearSelection() {
    selectedSquare = ""
    legalTargets = []
  }

  function selectSquare(square) {
    var piece = pieceAt(square)
    if (!piece || piece.color !== game.turn) {
      clearSelection()
      return
    }
    selectedSquare = square
    legalTargets = service && typeof service.legalMoves === "function"
      ? service.legalMoves(square) : []
  }

  function isLegalTarget(square) {
    for (var index = 0; index < legalTargets.length; index++)
      if (legalTargets[index].to === square) return true
    return false
  }

  function activateSquare(square) {
    cursorSquare = square
    if (!gameInputEnabled) return
    if (!selectedSquare) {
      selectSquare(square)
      return
    }
    if (square === selectedSquare) {
      clearSelection()
      return
    }
    var piece = pieceAt(square)
    if (piece && piece.color === game.turn) {
      selectSquare(square)
      return
    }
    if (!isLegalTarget(square)) {
      actionNotice = "That square is not a legal destination."
      return
    }
    requestBoardMove(selectedSquare, square)
  }

  function requestBoardMove(from, to) {
    if (!gameInputEnabled) return
    var commandResult = service.requestMove(from, to, null)
    if (commandResult && commandResult.code === "PROMOTION_REQUIRED") {
      actionNotice = "Choose a promotion piece."
      return
    }
    if (invoke(commandResult)) clearSelection()
  }

  function checkedKing() {
    if (!game.in_check) return ""
    var pieces = game.board || []
    for (var index = 0; index < pieces.length; index++)
      if (pieces[index].piece === "king" && pieces[index].color === game.turn)
        return pieces[index].square
    return ""
  }

  function opposite(side) { return side === "black" ? "white" : "black" }

  function capturedBy(side) {
    var material = game.material && game.material.counts
      ? game.material.counts : null
    if (!material) return ""
    var enemy = opposite(side)
    var current = material[enemy] || ({})
    var initial = { pawn: 8, knight: 2, bishop: 2, rook: 2, queen: 1 }
    var whiteGlyph = { pawn: "♙", knight: "♘", bishop: "♗", rook: "♖", queen: "♕" }
    var blackGlyph = { pawn: "♟", knight: "♞", bishop: "♝", rook: "♜", queen: "♛" }
    var glyphs = enemy === "white" ? whiteGlyph : blackGlyph
    var output = ""
    var order = ["queen", "rook", "bishop", "knight", "pawn"]
    for (var index = 0; index < order.length; index++) {
      var piece = order[index]
      var missing = initial[piece] - Number(current[piece] || 0)
      for (var count = 0; count < missing; count++) output += glyphs[piece]
    }
    return output
  }

  function effectiveOrientation() {
    if (manualOrientation) return manualOrientation
    var stored = String(game.orientation || "white")
    if (stored === "black") return "black"
    if (stored === "auto" && game.mode === "local") return game.turn || "white"
    if (stored === "manual") return "white"
    return game.human_color === "black" ? "black" : "white"
  }

  function flipBoard() {
    manualOrientation = boardOrientation === "white" ? "black" : "white"
  }

  function statusText() {
    if (gameStatus === "idle") return "Choose how you want to play"
    if (gameStatus === "paused-error")
      return aiError ? "Computer move failed — game paused" : "Save failed — game paused"
    if (gameStatus === "paused") return "Game paused"
    if (gameStatus === "active-computer") return "Computer is thinking"
    if (gameStatus === "promotion-pending") return "Choose a promotion piece"
    if (gameStatus === "completed") return resultTitle()
    if (gameStatus === "abandoned") return "Game ended"
    if (game.in_check) return "Check — " + titleCase(game.turn) + " to move"
    if (game.mode === "computer" && game.turn === game.human_color) return "Your move"
    return titleCase(game.turn) + " to move"
  }

  function resultTitle() {
    var result = game.result || ({})
    var winner = result.winner ? titleCase(result.winner) : ""
    if (result.reason === "checkmate") return "Checkmate — " + winner + " wins"
    if (result.reason === "stalemate") return "Draw by stalemate"
    if (result.reason === "dead-position") return "Draw — checkmate is impossible"
    if (result.reason === "threefold-claim") return "Draw claimed by repetition"
    if (result.reason === "fivefold-automatic") return "Draw by fivefold repetition"
    if (result.reason === "fifty-move-claim") return "Draw claimed under the fifty-move rule"
    if (result.reason === "seventy-five-move-automatic") return "Draw under the seventy-five-move rule"
    if (result.reason === "draw-agreement") return "Draw by agreement"
    if (result.reason === "timeout") return winner ? winner + " wins on time" : "Draw on time"
    if (result.reason === "timeout-insufficient-mating-possibility")
      return "Draw on time — checkmate was impossible"
    if (result.reason === "resignation")
      return winner ? winner + " wins by resignation" : "Draw after resignation"
    return result.score ? "Game finished — " + result.score : "Game finished"
  }

  function claimCurrentDraw() {
    var claims = game.claims || ({})
    var type = claims.threefold_current ? "threefold"
      : claims.fifty_move_current ? "fifty-move" : ""
    if (!type) {
      actionNotice = "A draw cannot be claimed in the current position."
      return
    }
    invoke(service.claimDraw(game.turn, type, null))
    drawActionsOpen = false
  }

  function claimProspectiveDraw(entry) {
    if (!entry) return
    var type = entry.threefold ? "threefold" : "fifty-move"
    invoke(service.claimDraw(game.turn, type, entry.uci))
    drawActionsOpen = false
    clearSelection()
  }

  function respondToOffer(accept) {
    invoke(service.respondToDraw(game.turn, accept))
    drawActionsOpen = false
  }

  function easierDifficulty() {
    if (game.difficulty === "strong") return "challenging"
    if (game.difficulty === "challenging") return "casual"
    return "learner"
  }

  function replayStep(delta) {
    if (!replayData || !replayData.frames) return
    replayPly = Math.max(0, Math.min(replayData.frames.length - 1,
      replayPly + delta))
  }

  function handleEscape() {
    if (confirmDialog.opened) { confirmDialog.opened = false; return }
    if (newGameDialog.opened) { newGameDialog.opened = false; return }
    if (gameStatus === "promotion-pending") return
    if (drawActionsOpen) { drawActionsOpen = false; return }
    if (selectedSquare) { clearSelection(); return }
    if (currentView === "replay") {
      currentView = "history"
      return
    }
    if (currentView !== "game" && currentView !== "home") {
      currentView = "home"
      return
    }
    if (currentView === "game" && hasPlayableGame && gameStatus !== "paused") {
      invoke(pauseCurrentGame("user"))
      return
    }
    requestClose()
  }

  Connections {
    target: root.service
    ignoreUnknownSignals: true

    function onHistoryRecordLoaded(replay) {
      root.replayPly = replay && replay.frames ? replay.frames.length - 1 : 0
      root.replayOrientation = replay && replay.record
        && replay.record.orientation === "black" ? "black" : "white"
      root.currentView = "replay"
      root.actionNotice = ""
    }

    function onHistoryRecordLoadFailed(error) {
      root.actionNotice = "That saved game could not be opened. "
        + String(error && error.code || "HISTORY_RECORD_INVALID")
    }

    function onExportCompleted(path) {
      root.actionNotice = "PGN saved to " + path
    }

    function onSettingsSaved(settings) {
      root.actionNotice = "Settings saved."
    }
  }

  onCurrentViewChanged: {
    if (gameWindow.visible) Qt.callLater(root.focusCurrentView)
  }

  FloatingWindow {
    id: gameWindow
    title: "Omarchy Chess"
    implicitWidth: 960
    implicitHeight: 720
    minimumSize: Qt.size(640, 560)
    visible: false
    color: Color.background

    onVisibleChanged: {
      if (!visible && !root.closingFromHost) root.requestClose()
    }

    FocusScope {
      id: focusScope
      anchors.fill: parent
      focus: gameWindow.visible

      Rectangle {
        anchors.fill: parent
        color: Color.background

        ColumnLayout {
          anchors.fill: parent
          anchors.margins: 20
          spacing: 14

          RowLayout {
            Layout.fillWidth: true
            spacing: 10
            ChessUi.SecondaryButton {
              text: root.currentView === "home" ? "♞" : "‹ Home"
              accessibleDescription: root.currentView === "home" ? "Omarchy Chess home" : "Return to home"
              onClicked: { root.clearSelection(); root.currentView = "home" }
            }
            ColumnLayout {
              Layout.fillWidth: true
              spacing: 1
              Text {
                text: root.currentView === "game" ? root.statusText() : "Omarchy Chess"
                color: Color.foreground
                font.pixelSize: root.compactLayout ? 19 : 23
                font.weight: Font.DemiBold
                elide: Text.ElideRight
                Layout.fillWidth: true
              }
              Text {
                visible: root.currentView === "game" && root.game.mode
                text: root.game.mode === "computer" ? "Play Computer · " + root.titleCase(root.game.difficulty) : "Local Two-Player"
                color: Color.muted
                font.pixelSize: 12
              }
            }
            ChessUi.SecondaryButton { text: "History"; visible: !root.compactLayout && root.currentView !== "history"; accessibleDescription: "Open completed game history"; onClicked: root.currentView = "history" }
            ChessUi.SecondaryButton { text: "Help"; visible: !root.compactLayout && root.currentView !== "help"; accessibleDescription: "Open chess controls and help"; onClicked: root.currentView = "help" }
            ChessUi.SecondaryButton { text: "Close"; accessibleDescription: "Close and safely pause Omarchy Chess"; onClicked: root.requestClose() }
          }

          ChessUi.StatusBanner {
            Layout.fillWidth: true
            visible: root.payloadNotice !== "" || root.actionNotice !== ""
              || root.game.persistence_healthy === false || root.aiError
            text: root.aiError ? "The computer could not finish its move"
              : root.game.persistence_healthy === false ? "Your game could not be saved"
              : root.payloadNotice || root.actionNotice
            detail: root.aiError ? "The clock is paused and your game is safe. Retry, use an easier level, or continue as a local game."
              : root.game.persistence_healthy === false ? "The game is paused and safe in memory. Retry saving before continuing." : ""
            kind: root.game.persistence_healthy === false || root.aiError ? "error" : "info"
            iconText: root.game.persistence_healthy === false || root.aiError ? "!" : "i"
          }

          Loader {
            id: contentLoader
            Layout.fillWidth: true
            Layout.fillHeight: true
            sourceComponent: root.currentView === "game" ? gameComponent
              : root.currentView === "history" ? historyComponent
              : root.currentView === "replay" ? replayComponent
              : root.currentView === "help" ? helpComponent
              : root.currentView === "settings" ? settingsComponent : homeComponent
          }

          RowLayout {
            Layout.fillWidth: true
            spacing: 12
            Text {
              Layout.fillWidth: true
              text: root.currentView === "game" ? "Arrows/HJKL move · Enter selects · F flips · U undo · P pause · ? help" : "Fully offline · Native QML · Games stay on this device"
              color: Color.muted
              font.pixelSize: 11
              elide: Text.ElideRight
            }
            Text {
              text: root.service && root.service.persistenceBusy ? "Saving…" : root.game.persistence_healthy === false ? "Save needs attention" : "Saved locally"
              color: root.game.persistence_healthy === false ? Color.urgent : Color.muted
              font.pixelSize: 11
            }
          }
        }
      }

      Item {
        id: keyCatcher
        anchors.fill: parent
        focus: true
        z: -1
        Keys.onPressed: function(event) {
          if (event.key === Qt.Key_Escape) {
            root.handleEscape(); event.accepted = true
          } else if (event.key === Qt.Key_F1 || event.key === Qt.Key_Question) {
            root.currentView = "help"; event.accepted = true
          } else if (root.currentView === "game" && !root.modalOpen) {
            if (event.key === Qt.Key_F) { root.flipBoard(); event.accepted = true }
            else if (event.key === Qt.Key_U) { root.openConfirmation("undo"); event.accepted = true }
            else if (event.key === Qt.Key_P) {
              if (root.gameStatus === "paused") root.invoke(root.service.resumeGame())
              else if (root.hasPlayableGame) root.invoke(root.pauseCurrentGame("user"))
              event.accepted = true
            } else if (event.key === Qt.Key_D) { root.drawActionsOpen = !root.drawActionsOpen; event.accepted = true }
            else if (event.key === Qt.Key_R && (event.modifiers & Qt.ControlModifier)) { root.openConfirmation("resign"); event.accepted = true }
            else if (event.key === Qt.Key_N) { root.openNewGameDialog(root.game.mode || "computer", ({})); event.accepted = true }
          } else if (root.currentView === "replay" && !root.modalOpen) {
            if (event.key === Qt.Key_Left) { root.replayStep(-1); event.accepted = true }
            else if (event.key === Qt.Key_Right) { root.replayStep(1); event.accepted = true }
            else if (event.key === Qt.Key_Home) { root.replayPly = 0; event.accepted = true }
            else if (event.key === Qt.Key_End && root.replayData) { root.replayPly = root.replayData.frames.length - 1; event.accepted = true }
            else if (event.key === Qt.Key_F) { root.replayOrientation = root.replayOrientation === "white" ? "black" : "white"; event.accepted = true }
            else if (event.key === Qt.Key_C) { root.invoke(root.service.copyPgn(root.replayData.record.game_id), "PGN copied."); event.accepted = true }
          }
        }
      }

      ChessUi.NewGameDialog {
        id: newGameDialog
        anchors.fill: parent
        z: 20
        opened: false
        onStartRequested: function(options) { root.beginGame(options) }
        onCanceled: {
          opened = false
          Qt.callLater(root.focusCurrentView)
        }
      }
      ChessUi.PromotionDialog {
        id: promotionDialog
        anchors.fill: parent
        z: 22
        opened: root.gameStatus === "promotion-pending"
        moverColor: root.game.pending_promotion ? root.game.pending_promotion.side
          : (root.game.turn || "white")
        fromSquare: root.game.pending_promotion ? root.game.pending_promotion.from : ""
        toSquare: root.game.pending_promotion ? root.game.pending_promotion.to : ""
        onChosen: function(piece) {
          if (root.invoke(root.service.choosePromotion(piece))) root.clearSelection()
          Qt.callLater(root.focusCurrentView)
        }
        onCanceled: root.actionNotice = "Choose a piece to complete the promotion."
      }
      ChessUi.ConfirmDialog {
        id: confirmDialog
        anchors.fill: parent
        z: 24
        opened: false
        title: "Confirm action"
        message: ""
        confirmText: "Confirm"
        cancelText: "Cancel"
        destructive: false
        onConfirmed: {
          root.performConfirmedAction()
          Qt.callLater(root.focusCurrentView)
        }
        onCanceled: {
          opened = false
          root.pendingNewGameOptions = null
          root.confirmAction = ""
          Qt.callLater(root.focusCurrentView)
        }
      }
    }
  }

  Component {
    id: homeComponent
    Controls.ScrollView {
      contentWidth: availableWidth
      clip: true
      ColumnLayout {
        width: parent.width
        spacing: 18
        Item { Layout.preferredHeight: 8 }
        Text {
          Layout.fillWidth: true
          text: root.hasPlayableGame ? "Your board is waiting" : "A quiet place to play"
          color: Color.foreground
          font.pixelSize: root.compactLayout ? 27 : 36
          font.weight: Font.DemiBold
          horizontalAlignment: Text.AlignHCenter
        }
        Text {
          Layout.fillWidth: true
          Layout.maximumWidth: 620
          Layout.alignment: Qt.AlignHCenter
          text: root.hasPlayableGame ? "Resume exactly where you left off. Clocks do not run while the panel is closed." : "Complete orthodox chess, a friendly built-in opponent, and local play — all offline."
          color: Color.muted
          font.pixelSize: 14
          wrapMode: Text.WordWrap
          horizontalAlignment: Text.AlignHCenter
        }
        ChessUi.PrimaryButton {
          Layout.alignment: Qt.AlignHCenter
          visible: root.hasPlayableGame
          text: root.gameStatus === "paused" || root.gameStatus === "paused-error" ? "Resume game" : "Return to game"
          iconText: "▶"
          accessibleDescription: "Resume the saved active game"
          onClicked: { if (root.gameStatus === "paused") root.invoke(root.service.resumeGame()); root.currentView = "game" }
        }
        GridLayout {
          Layout.fillWidth: true
          Layout.maximumWidth: 760
          Layout.alignment: Qt.AlignHCenter
          columns: root.compactLayout ? 1 : 2
          columnSpacing: 14
          rowSpacing: 14
          Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 170
            radius: 16
            color: Qt.rgba(Color.foreground.r, Color.foreground.g, Color.foreground.b, 0.055)
            border.width: 1
            border.color: Qt.rgba(Color.foreground.r, Color.foreground.g, Color.foreground.b, 0.14)
            ColumnLayout {
              anchors.fill: parent; anchors.margins: 20; spacing: 8
              Text { text: "♟"; color: Color.accent; font.pixelSize: 31 }
              Text { text: "Play Computer"; color: Color.foreground; font.pixelSize: 20; font.weight: Font.DemiBold }
              Text { Layout.fillWidth: true; text: "Four distinct levels, with thinking kept off the shell thread."; color: Color.muted; font.pixelSize: 12; wrapMode: Text.WordWrap }
              Item { Layout.fillHeight: true }
              ChessUi.PrimaryButton { text: "Set up game"; accessibleDescription: "Configure a game against the computer"; onClicked: root.openNewGameDialog("computer", ({})) }
            }
          }
          Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 170
            radius: 16
            color: Qt.rgba(Color.foreground.r, Color.foreground.g, Color.foreground.b, 0.055)
            border.width: 1
            border.color: Qt.rgba(Color.foreground.r, Color.foreground.g, Color.foreground.b, 0.14)
            ColumnLayout {
              anchors.fill: parent; anchors.margins: 20; spacing: 8
              Text { text: "♜"; color: Color.accent; font.pixelSize: 31 }
              Text { text: "Local Two-Player"; color: Color.foreground; font.pixelSize: 20; font.weight: Font.DemiBold }
              Text { Layout.fillWidth: true; text: "Share the board, use optional clocks, and choose automatic orientation."; color: Color.muted; font.pixelSize: 12; wrapMode: Text.WordWrap }
              Item { Layout.fillHeight: true }
              ChessUi.PrimaryButton { text: "Set up game"; accessibleDescription: "Configure a local two-player game"; onClicked: root.openNewGameDialog("local", ({})) }
            }
          }
        }
        RowLayout {
          Layout.alignment: Qt.AlignHCenter; spacing: 10
          ChessUi.SecondaryButton { text: "History"; accessibleDescription: "Open game history"; onClicked: root.currentView = "history" }
          ChessUi.SecondaryButton { text: "Settings"; accessibleDescription: "Open chess settings"; onClicked: root.currentView = "settings" }
          ChessUi.SecondaryButton { text: "Help"; accessibleDescription: "Open chess help"; onClicked: root.currentView = "help" }
        }
        Text {
          Layout.fillWidth: true
          visible: root.service && root.service.historySummary && root.service.historySummary.total > 0
          text: root.service && root.service.historySummary ? String(root.service.historySummary.total) + " completed game" + (root.service.historySummary.total === 1 ? "" : "s") + " saved locally" : ""
          color: Color.muted; font.pixelSize: 12; horizontalAlignment: Text.AlignHCenter
        }
      }
    }
  }

  Component {
    id: gameComponent
    Item {
      id: gameView

      function focusBoard() {
        if (root.wideLayout) wideBoardView.forceActiveFocus()
        else compactBoardView.forceActiveFocus()
      }

      Connections {
        target: root
        function onGameFocusRequested() { gameView.focusBoard() }
      }

      RowLayout {
        anchors.fill: parent; spacing: 16; visible: root.wideLayout
        ChessUi.BoardView {
          id: wideBoardView
          Layout.fillWidth: true; Layout.fillHeight: true; Layout.maximumWidth: height; Layout.maximumHeight: width
          pieces: root.game.board || []; orientation: root.boardOrientation; selectedSquare: root.selectedSquare; cursorSquare: root.cursorSquare; legalMoves: root.legalTargets; lastMove: root.latestMove; checkedKingSquare: root.checkedKingSquare; inputEnabled: root.gameInputEnabled
          reducedMotion: root.service && root.service.settingsSnapshot.accessibility ? root.service.settingsSnapshot.accessibility.reduced_motion : false
          highContrast: root.service && root.service.settingsSnapshot.accessibility ? root.service.settingsSnapshot.accessibility.high_contrast_indicators : false
          showCoordinates: !root.service || !root.service.settingsSnapshot.appearance || root.service.settingsSnapshot.appearance.coordinates !== false
          onSquareActivated: function(square) { root.activateSquare(square) }
          onMoveRequested: function(from, to) { root.requestBoardMove(from, to) }
          onPromotionRequested: function(from, to) { root.requestBoardMove(from, to) }
          onFlipRequested: root.flipBoard()
          onCursorMoved: function(square) { root.cursorSquare = square }
          onCancelRequested: root.clearSelection()
        }
        Loader { Layout.preferredWidth: 292; Layout.fillHeight: true; sourceComponent: railComponent }
      }
      ColumnLayout {
        anchors.fill: parent; spacing: 12; visible: !root.wideLayout
        ChessUi.BoardView {
          id: compactBoardView
          Layout.fillWidth: true; Layout.preferredHeight: Math.min(width, parent.height * 0.62)
          pieces: root.game.board || []; orientation: root.boardOrientation; selectedSquare: root.selectedSquare; cursorSquare: root.cursorSquare; legalMoves: root.legalTargets; lastMove: root.latestMove; checkedKingSquare: root.checkedKingSquare; inputEnabled: root.gameInputEnabled
          reducedMotion: root.service && root.service.settingsSnapshot.accessibility ? root.service.settingsSnapshot.accessibility.reduced_motion : false
          highContrast: root.service && root.service.settingsSnapshot.accessibility ? root.service.settingsSnapshot.accessibility.high_contrast_indicators : false
          showCoordinates: !root.service || !root.service.settingsSnapshot.appearance || root.service.settingsSnapshot.appearance.coordinates !== false
          onSquareActivated: function(square) { root.activateSquare(square) }
          onMoveRequested: function(from, to) { root.requestBoardMove(from, to) }
          onPromotionRequested: function(from, to) { root.requestBoardMove(from, to) }
          onFlipRequested: root.flipBoard()
          onCursorMoved: function(square) { root.cursorSquare = square }
          onCancelRequested: root.clearSelection()
        }
        Loader { Layout.fillWidth: true; Layout.fillHeight: true; sourceComponent: railComponent }
      }
    }
  }

  Component {
    id: railComponent
    Rectangle {
      radius: 14
      color: Qt.rgba(Color.foreground.r, Color.foreground.g, Color.foreground.b, 0.045)
      border.width: 1
      border.color: Qt.rgba(Color.foreground.r, Color.foreground.g, Color.foreground.b, 0.12)
      ColumnLayout {
        anchors.fill: parent; anchors.margins: 14; spacing: 9
        RowLayout {
          Layout.fillWidth: true
          Text { Layout.fillWidth: true; text: root.game.players ? root.game.players[root.boardOrientation === "white" ? "black" : "white"].name : "Opponent"; color: Color.foreground; font.pixelSize: 15; font.weight: Font.Medium; elide: Text.ElideRight }
          ChessUi.PlayerClock {
            side: root.boardOrientation === "white" ? "black" : "white"
            remainingMs: root.game.clock && root.game.clock.enabled ? root.game.clock[(root.boardOrientation === "white" ? "black" : "white") + "_ms"] : -1
            running: root.game.clock && !root.game.clock.paused && root.game.clock.running_side === side
            paused: !root.game.clock || root.game.clock.paused === true
            clockEnabled: root.game.clock && root.game.clock.enabled === true
          }
        }
        ChessUi.StatusBanner {
          Layout.fillWidth: true; text: root.statusText(); detail: root.game.in_check ? "The king is under attack." : ""
          kind: root.game.persistence_healthy === false ? "error" : root.game.in_check ? "warning" : root.gameStatus === "active-computer" ? "thinking" : root.gameStatus === "paused" ? "paused" : "info"
          iconText: root.game.in_check ? "!" : root.gameStatus === "active-computer" ? "…" : ""
        }
        ChessUi.MoveList { Layout.fillWidth: true; Layout.fillHeight: true; moves: root.game.moves || []; selectedPly: root.game.moves ? root.game.moves.length : 0; replayMode: false; followLatest: true; emptyText: "Moves will appear here" }
        ColumnLayout {
          Layout.fillWidth: true
          visible: root.capturedBy("white") !== "" || root.capturedBy("black") !== ""
          spacing: 2
          Text { text: "Captured material"; color: Color.muted; font.pixelSize: 10; font.weight: Font.DemiBold }
          Text { Layout.fillWidth: true; text: "White: " + (root.capturedBy("white") || "—"); color: Color.foreground; font.pixelSize: 15; elide: Text.ElideRight }
          Text { Layout.fillWidth: true; text: "Black: " + (root.capturedBy("black") || "—"); color: Color.foreground; font.pixelSize: 15; elide: Text.ElideRight }
        }
        ColumnLayout {
          Layout.fillWidth: true; visible: root.drawActionsOpen; spacing: 6
          Text { Layout.fillWidth: true; text: root.game.pending_draw_offer_by ? root.titleCase(root.game.pending_draw_offer_by) + " offered a draw." : "Draw actions"; color: Color.foreground; font.pixelSize: 12; wrapMode: Text.WordWrap }
          RowLayout {
            Layout.fillWidth: true; visible: root.game.pending_draw_offer_by && root.game.pending_draw_offer_by !== root.game.turn
            ChessUi.PrimaryButton { Layout.fillWidth: true; text: "Accept"; accessibleDescription: "Accept the draw offer"; onClicked: root.respondToOffer(true) }
            ChessUi.SecondaryButton { Layout.fillWidth: true; text: "Decline"; accessibleDescription: "Decline the draw offer"; onClicked: root.respondToOffer(false) }
          }
          ChessUi.PrimaryButton { Layout.fillWidth: true; visible: root.game.claims && (root.game.claims.threefold_current || root.game.claims.fifty_move_current); text: "Claim available draw"; accessibleDescription: "Claim the currently available rules draw"; onClicked: root.claimCurrentDraw() }
          ChessUi.SecondaryButton { Layout.fillWidth: true; visible: root.game.claims && root.game.claims.prospective_moves && root.game.claims.prospective_moves.length > 0; text: root.game.claims && root.game.claims.prospective_moves && root.game.claims.prospective_moves.length > 0 ? "Claim with " + root.game.claims.prospective_moves[0].uci : "Claim with move"; accessibleDescription: "Make the qualifying move and claim a draw"; onClicked: root.claimProspectiveDraw(root.game.claims.prospective_moves[0]) }
          ChessUi.SecondaryButton { Layout.fillWidth: true; visible: root.game.mode === "local" && !root.game.pending_draw_offer_by; text: "Offer draw"; accessibleDescription: "Offer a draw to the other player"; onClicked: root.invoke(root.service.offerDraw(root.game.turn)) }
        }
        Flow {
          Layout.fillWidth: true; spacing: 6
          ChessUi.SecondaryButton { text: "Flip"; accessibleDescription: "Flip the board orientation"; onClicked: root.flipBoard() }
          ChessUi.SecondaryButton { text: "Undo"; accessibleDescription: "Request to take back moves"; onClicked: root.openConfirmation("undo") }
          ChessUi.SecondaryButton { text: "Draw"; selected: root.drawActionsOpen; accessibleDescription: "Open draw actions"; onClicked: root.drawActionsOpen = !root.drawActionsOpen }
          ChessUi.SecondaryButton { text: root.gameStatus === "paused" ? "Resume" : "Pause"; accessibleDescription: root.gameStatus === "paused" ? "Resume the paused game" : "Pause the game"; onClicked: { if (root.gameStatus === "paused") root.invoke(root.service.resumeGame()); else root.invoke(root.pauseCurrentGame("user")) } }
          ChessUi.SecondaryButton { text: "Resign"; destructive: true; accessibleDescription: "Resign the current game"; onClicked: root.openConfirmation("resign") }
          ChessUi.SecondaryButton { text: "Copy PGN"; accessibleDescription: "Copy the current game as PGN"; onClicked: root.invoke(root.service.copyPgn(root.game.game_id), "PGN copied.") }
          ChessUi.SecondaryButton { text: "Save PGN"; accessibleDescription: "Save a PGN copy in the local exports folder"; onClicked: root.invoke(root.service.exportPgn(root.game.game_id, ""), "Saving PGN…") }
        }
        RowLayout {
          Layout.fillWidth: true
          Text { Layout.fillWidth: true; text: root.game.players ? root.game.players[root.boardOrientation].name : "Player"; color: Color.foreground; font.pixelSize: 15; font.weight: Font.Medium; elide: Text.ElideRight }
          ChessUi.PlayerClock {
            side: root.boardOrientation
            remainingMs: root.game.clock && root.game.clock.enabled ? root.game.clock[root.boardOrientation + "_ms"] : -1
            running: root.game.clock && !root.game.clock.paused && root.game.clock.running_side === side
            paused: !root.game.clock || root.game.clock.paused === true
            clockEnabled: root.game.clock && root.game.clock.enabled === true
          }
        }
        ColumnLayout {
          Layout.fillWidth: true; visible: root.gameStatus === "paused-error"
          ChessUi.PrimaryButton {
            Layout.fillWidth: true
            text: root.aiError ? "Retry computer move" : "Retry save"
            accessibleDescription: root.aiError ? "Retry the paused computer move" : "Retry saving the safe in-memory game"
            busy: root.service && root.service.persistenceBusy
            onClicked: root.invoke(root.aiError
              ? root.service.retryComputerMove() : root.service.retrySave())
          }
          RowLayout {
            Layout.fillWidth: true
            visible: root.aiError
            ChessUi.SecondaryButton { Layout.fillWidth: true; text: "Easier level"; accessibleDescription: "Retry the computer move at an easier level"; onClicked: root.invoke(root.service.retryComputerMove(root.easierDifficulty())) }
            ChessUi.SecondaryButton { Layout.fillWidth: true; text: "Play locally"; accessibleDescription: "Convert the computer game to local two-player"; onClicked: root.invoke(root.service.convertComputerToLocal()) }
          }
        }
        ColumnLayout {
          Layout.fillWidth: true; visible: root.gameStatus === "completed" && !root.resultDialogDismissed; spacing: 7
          Text { Layout.fillWidth: true; text: root.resultTitle(); color: Color.foreground; font.pixelSize: 17; font.weight: Font.DemiBold; wrapMode: Text.WordWrap }
          Text { Layout.fillWidth: true; text: (root.game.result && root.game.result.score ? root.game.result.score : "") + " · " + String(root.game.moves ? root.game.moves.length : 0) + " moves"; color: Color.muted; font.pixelSize: 12 }
          RowLayout {
            Layout.fillWidth: true
            ChessUi.PrimaryButton { Layout.fillWidth: true; text: "New game"; accessibleDescription: "Set up another game"; onClicked: root.openNewGameDialog(root.game.mode || "computer", ({})) }
            ChessUi.SecondaryButton { Layout.fillWidth: true; text: "Dismiss"; accessibleDescription: "Keep viewing the final board"; onClicked: root.resultDialogDismissed = true }
          }
        }
      }
    }
  }

  Component {
    id: historyComponent
    ColumnLayout {
      spacing: 12
      Text { text: "Game history"; color: Color.foreground; font.pixelSize: 28; font.weight: Font.DemiBold }
      Text { Layout.fillWidth: true; text: root.service && root.service.historySummary && root.service.historySummary.total > 0 ? "Completed games saved on this device." : "Finished games will appear here."; color: Color.muted; font.pixelSize: 13 }
      ListView {
        Layout.fillWidth: true; Layout.fillHeight: true; clip: true; spacing: 8
        model: root.service && root.service.historySummary ? root.service.historySummary.recent : []
        delegate: Rectangle {
          id: historyRow
          required property var modelData
          width: ListView.view.width; height: 86; radius: 10
          color: Qt.rgba(Color.foreground.r, Color.foreground.g, Color.foreground.b, 0.05)
          border.width: 1; border.color: Qt.rgba(Color.foreground.r, Color.foreground.g, Color.foreground.b, 0.12)
          RowLayout {
            anchors.fill: parent; anchors.margins: 12
            ColumnLayout {
              Layout.fillWidth: true; spacing: 2
              Text { text: historyRow.modelData.white + " — " + historyRow.modelData.black; color: Color.foreground; font.pixelSize: 14; font.weight: Font.Medium; elide: Text.ElideRight; Layout.fillWidth: true }
              Text { text: root.titleCase(historyRow.modelData.mode) + " · " + historyRow.modelData.move_count + " moves · " + historyRow.modelData.reason; color: Color.muted; font.pixelSize: 11; elide: Text.ElideRight; Layout.fillWidth: true }
            }
            Text { text: historyRow.modelData.score; color: Color.accent; font.pixelSize: 17; font.weight: Font.DemiBold }
            ChessUi.PrimaryButton {
              text: "Review"
              accessibleDescription: "Open the saved game replay"
              onClicked: root.openReplay(historyRow.modelData.game_id)
            }
            ChessUi.SecondaryButton {
              text: "Delete"
              destructive: true
              accessibleDescription: "Delete this saved game with confirmation"
              onClicked: {
                root.pendingHistoryId = historyRow.modelData.game_id
                root.openConfirmation("delete-history")
              }
            }
          }
        }
      }
      ChessUi.PrimaryButton { visible: root.hasPlayableGame; text: "Return to active game"; accessibleDescription: "Return to the current game"; onClicked: root.currentView = "game" }
    }
  }

  Component {
    id: replayComponent
    Item {
      GridLayout {
        anchors.fill: parent
        rowSpacing: 16
        columnSpacing: 16
        columns: root.wideLayout ? 2 : 1

        ChessUi.BoardView {
          Layout.fillWidth: true
          Layout.fillHeight: root.wideLayout
          Layout.preferredHeight: root.wideLayout
            ? parent.height : Math.min(width, parent.height * 0.62)
          Layout.maximumWidth: root.wideLayout ? height : Number.POSITIVE_INFINITY
          Layout.maximumHeight: width
          pieces: root.replayFrame ? root.replayFrame.board : []
          orientation: root.replayOrientation
          selectedSquare: ""
          cursorSquare: ""
          legalMoves: []
          lastMove: root.replayFrame ? root.replayFrame.last_move : null
          checkedKingSquare: ""
          inputEnabled: false
          reducedMotion: true
          highContrast: root.service && root.service.settingsSnapshot.accessibility
            ? root.service.settingsSnapshot.accessibility.high_contrast_indicators : false
          showCoordinates: true
        }

        Rectangle {
          Layout.preferredWidth: root.wideLayout ? 300 : 250
          Layout.fillWidth: !root.wideLayout
          Layout.fillHeight: true
          Layout.minimumHeight: root.wideLayout ? 0 : 250
          radius: 14
          color: Qt.rgba(Color.foreground.r, Color.foreground.g,
                         Color.foreground.b, 0.045)
          border.width: 1
          border.color: Qt.rgba(Color.foreground.r, Color.foreground.g,
                                Color.foreground.b, 0.12)

          ColumnLayout {
            anchors.fill: parent
            anchors.margins: 14
            spacing: 10

            Text {
              Layout.fillWidth: true
              text: root.replayData ? root.replayData.record.players.white.name
                + " — " + root.replayData.record.players.black.name : "Saved game"
              color: Color.foreground
              font.pixelSize: 16
              font.weight: Font.DemiBold
              wrapMode: Text.WordWrap
            }
            Text {
              Layout.fillWidth: true
              text: root.replayData ? root.replayData.record.result.score
                + " · " + root.replayData.record.result.reason : ""
              color: Color.muted
              font.pixelSize: 12
              wrapMode: Text.WordWrap
            }

            ChessUi.MoveList {
              Layout.fillWidth: true
              Layout.fillHeight: true
              moves: root.replayData ? root.replayData.record.moves : []
              selectedPly: root.replayPly
              replayMode: true
              followLatest: false
              onPlySelected: function(ply) { root.replayPly = ply }
            }

            Text {
              Layout.fillWidth: true
              text: "Position " + root.replayPly + " of "
                + (root.replayData ? root.replayData.frames.length - 1 : 0)
              color: Color.muted
              font.pixelSize: 11
              horizontalAlignment: Text.AlignHCenter
            }
            RowLayout {
              Layout.fillWidth: true
              ChessUi.SecondaryButton { text: "|‹"; accessibleDescription: "First position"; onClicked: root.replayPly = 0 }
              ChessUi.SecondaryButton { text: "‹"; accessibleDescription: "Previous move"; onClicked: root.replayStep(-1) }
              ChessUi.SecondaryButton { text: "›"; accessibleDescription: "Next move"; onClicked: root.replayStep(1) }
              ChessUi.SecondaryButton { text: "›|"; accessibleDescription: "Final position"; onClicked: if (root.replayData) root.replayPly = root.replayData.frames.length - 1 }
            }
            Flow {
              Layout.fillWidth: true
              spacing: 6
              ChessUi.SecondaryButton { text: "Flip"; accessibleDescription: "Flip replay board"; onClicked: root.replayOrientation = root.replayOrientation === "white" ? "black" : "white" }
              ChessUi.PrimaryButton { text: "Copy PGN"; accessibleDescription: "Copy this game as PGN"; onClicked: if (root.replayData) root.invoke(root.service.copyPgn(root.replayData.record.game_id), "PGN copied.") }
              ChessUi.SecondaryButton { text: "Save copy"; accessibleDescription: "Save a PGN copy in the local exports folder"; onClicked: if (root.replayData) root.invoke(root.service.exportPgn(root.replayData.record.game_id, ""), "Saving PGN…") }
            }
            ChessUi.SecondaryButton { text: "Back to history"; accessibleDescription: "Return to saved games"; onClicked: root.currentView = "history" }
          }
        }
      }
    }
  }

  Component {
    id: settingsComponent
    Controls.ScrollView {
      contentWidth: availableWidth; clip: true
      ColumnLayout {
        width: parent.width; spacing: 14
        Text { text: "Settings"; color: Color.foreground; font.pixelSize: 28; font.weight: Font.DemiBold }
        Text { Layout.fillWidth: true; text: "Defaults are stored locally and never synced. Current-game clocks and rules are not changed here."; color: Color.muted; font.pixelSize: 13; wrapMode: Text.WordWrap }

        Text { text: "BOARD"; color: Color.muted; font.pixelSize: 11; font.weight: Font.DemiBold }
        RowLayout {
          Layout.fillWidth: true
          Text { Layout.fillWidth: true; text: "Coordinates"; color: Color.foreground; font.pixelSize: 13 }
          ChessUi.SecondaryButton { text: "Show"; selected: root.service.settingsSnapshot.appearance.coordinates === true; accessibleDescription: "Show board coordinates"; onClicked: root.updateSetting({ appearance: { coordinates: true } }) }
          ChessUi.SecondaryButton { text: "Hide"; selected: root.service.settingsSnapshot.appearance.coordinates === false; accessibleDescription: "Hide board coordinates"; onClicked: root.updateSetting({ appearance: { coordinates: false } }) }
        }
        RowLayout {
          Layout.fillWidth: true
          Text { Layout.fillWidth: true; text: "Default orientation"; color: Color.foreground; font.pixelSize: 13 }
          Repeater {
            model: ["white", "black", "manual", "auto"]
            ChessUi.SecondaryButton {
              required property var modelData
              text: root.titleCase(modelData)
              selected: root.service.settingsSnapshot.appearance.orientation === modelData
              accessibleDescription: "Use " + modelData + " board orientation for new games"
              onClicked: root.updateSetting({ appearance: { orientation: modelData } })
            }
          }
        }

        Text { text: "COMPUTER DEFAULT"; color: Color.muted; font.pixelSize: 11; font.weight: Font.DemiBold }
        Flow {
          Layout.fillWidth: true; spacing: 7
          Repeater {
            model: ["learner", "casual", "challenging", "strong"]
            ChessUi.SecondaryButton {
              required property var modelData
              text: root.titleCase(modelData)
              selected: root.service.settingsSnapshot.gameplay.computer_level === modelData
              accessibleDescription: "Set the default computer level to " + modelData
              onClicked: root.updateSetting({ gameplay: { computer_level: modelData } })
            }
          }
        }

        Text { text: "ACCESSIBILITY"; color: Color.muted; font.pixelSize: 11; font.weight: Font.DemiBold }
        RowLayout {
          Layout.fillWidth: true
          Text { Layout.fillWidth: true; text: "Reduced motion"; color: Color.foreground; font.pixelSize: 13 }
          ChessUi.SecondaryButton { text: "On"; selected: root.service.settingsSnapshot.accessibility.reduced_motion; accessibleDescription: "Turn reduced motion on"; onClicked: root.updateSetting({ accessibility: { reduced_motion: true } }) }
          ChessUi.SecondaryButton { text: "Off"; selected: !root.service.settingsSnapshot.accessibility.reduced_motion; accessibleDescription: "Turn reduced motion off"; onClicked: root.updateSetting({ accessibility: { reduced_motion: false } }) }
        }
        RowLayout {
          Layout.fillWidth: true
          Text { Layout.fillWidth: true; text: "High-contrast markers"; color: Color.foreground; font.pixelSize: 13 }
          ChessUi.SecondaryButton { text: "On"; selected: root.service.settingsSnapshot.accessibility.high_contrast_indicators; accessibleDescription: "Turn high contrast board markers on"; onClicked: root.updateSetting({ accessibility: { high_contrast_indicators: true } }) }
          ChessUi.SecondaryButton { text: "Off"; selected: !root.service.settingsSnapshot.accessibility.high_contrast_indicators; accessibleDescription: "Turn high contrast board markers off"; onClicked: root.updateSetting({ accessibility: { high_contrast_indicators: false } }) }
        }

        Text { text: "SOUND"; color: Color.muted; font.pixelSize: 11; font.weight: Font.DemiBold }
        RowLayout {
          Layout.fillWidth: true
          Text { Layout.fillWidth: true; text: "Game sounds"; color: Color.foreground; font.pixelSize: 13 }
          ChessUi.SecondaryButton { text: "On"; selected: root.service.settingsSnapshot.audio.enabled; accessibleDescription: "Turn game sounds on"; onClicked: root.updateSetting({ audio: { enabled: true } }) }
          ChessUi.SecondaryButton { text: "Off"; selected: !root.service.settingsSnapshot.audio.enabled; accessibleDescription: "Turn game sounds off"; onClicked: root.updateSetting({ audio: { enabled: false } }) }
        }
        RowLayout {
          Layout.fillWidth: true
          Text { Layout.fillWidth: true; text: "Volume"; color: Color.foreground; font.pixelSize: 13 }
          ChessUi.SecondaryButton { text: "Quiet"; selected: root.service.settingsSnapshot.audio.volume === 0.3; accessibleDescription: "Set quiet game sounds"; onClicked: root.updateSetting({ audio: { volume: 0.3 } }) }
          ChessUi.SecondaryButton { text: "Normal"; selected: root.service.settingsSnapshot.audio.volume === 0.65; accessibleDescription: "Set normal game sounds"; onClicked: root.updateSetting({ audio: { volume: 0.65 } }) }
          ChessUi.SecondaryButton { text: "Full"; selected: root.service.settingsSnapshot.audio.volume === 1; accessibleDescription: "Set full game sound volume"; onClicked: root.updateSetting({ audio: { volume: 1 } }) }
        }

        ChessUi.StatusBanner {
          Layout.fillWidth: true
          text: "Local diagnostics"
          detail: "Plugin " + root.service.pluginVersion
            + " · chess.js 1.4.0 · state schema 1\n"
            + root.service.stateDirectory + "\nAI worker: "
            + (root.service.computerThinking ? "searching" : "idle")
            + (root.service.lastError ? " · " + root.service.lastError.code : "")
          kind: root.service.lastError ? "warning" : "info"
          iconText: "i"
        }
        Flow {
          Layout.fillWidth: true; spacing: 8
          ChessUi.SecondaryButton { text: "Copy diagnostics"; accessibleDescription: "Copy anonymous local diagnostics"; onClicked: root.invoke(root.service.copyDiagnostics(), "Diagnostics copied.") }
          ChessUi.SecondaryButton { text: "Reset settings"; accessibleDescription: "Reset all settings without deleting games"; onClicked: root.openConfirmation("reset-settings") }
          ChessUi.SecondaryButton { text: "Back to home"; accessibleDescription: "Return to Omarchy Chess home"; onClicked: root.currentView = "home" }
        }
      }
    }
  }

  Component {
    id: helpComponent
    Controls.ScrollView {
      contentWidth: availableWidth; clip: true
      ColumnLayout {
        width: parent.width; spacing: 14
        Text { text: "Help & controls"; color: Color.foreground; font.pixelSize: 28; font.weight: Font.DemiBold }
        Text { Layout.fillWidth: true; text: "Click a piece, then a highlighted destination. You can also drag pieces or play entirely from the keyboard."; color: Color.muted; font.pixelSize: 13; wrapMode: Text.WordWrap }
        Repeater {
          model: [
            { key: "Arrows / H J K L", value: "Move the board cursor" },
            { key: "Enter / Space", value: "Select a piece or commit a move" },
            { key: "Escape", value: "Cancel a selection, pause, or go back" },
            { key: "F", value: "Flip the board" },
            { key: "U", value: "Request an undo" },
            { key: "P", value: "Pause or resume" },
            { key: "D", value: "Open draw actions" },
            { key: "Ctrl+R", value: "Resign with confirmation" },
            { key: "? / F1", value: "Open this help" }
          ]
          delegate: Rectangle {
            id: shortcutRow
            required property var modelData
            Layout.fillWidth: true; implicitHeight: 48; radius: 8
            color: Qt.rgba(Color.foreground.r, Color.foreground.g, Color.foreground.b, 0.045)
            RowLayout {
              anchors.fill: parent; anchors.margins: 10
              Text { Layout.preferredWidth: 150; text: shortcutRow.modelData.key; color: Color.accent; font.pixelSize: 12; font.weight: Font.DemiBold }
              Text { Layout.fillWidth: true; text: shortcutRow.modelData.value; color: Color.foreground; font.pixelSize: 12; wrapMode: Text.WordWrap }
            }
          }
        }
        ChessUi.StatusBanner { Layout.fillWidth: true; text: "Special moves"; detail: "Castling moves the king and rook together when the path is clear and safe. En passant is offered only on the immediately following move. Promotion lets you choose Queen, Rook, Bishop, or Knight with Q/R/B/N."; kind: "info"; iconText: "♔" }
        ChessUi.StatusBanner { Layout.fillWidth: true; text: "Draws and endings"; detail: "Threefold repetition and the fifty-move rule must be claimed. Stalemate, impossible checkmate, fivefold repetition, and seventy-five moves are automatic. Local players can also agree to a draw."; kind: "info"; iconText: "=" }
        ChessUi.StatusBanner { Layout.fillWidth: true; text: "Computer levels"; detail: "Learner gives room to practice; Casual spots simple tactics; Challenging searches deeper; Strong uses the largest safe local budget. These are descriptions, not Elo ratings."; kind: "info"; iconText: "♞" }
        ChessUi.StatusBanner { Layout.fillWidth: true; text: "Clocks, saving, and history"; detail: "An increment is added after each legal move. Closing pauses clocks and autosaves. Completed games are archived as portable PGN and can be replayed from History."; kind: "info"; iconText: "◷" }
        ChessUi.StatusBanner { Layout.fillWidth: true; text: "Private and offline"; detail: "No account, network request, telemetry, external chess engine, or cloud storage is used. Game files remain in your XDG state directory."; kind: "info"; iconText: "●" }
        Text { Layout.fillWidth: true; text: "Omarchy Chess " + root.service.pluginVersion + " · MIT License · chess.js 1.4.0 (BSD-2-Clause)\nState: " + root.service.stateDirectory; color: Color.muted; font.pixelSize: 11; wrapMode: Text.WordWrap }
        Item { Layout.fillHeight: true }
        RowLayout {
          ChessUi.PrimaryButton { visible: root.hasPlayableGame; text: "Return to game"; accessibleDescription: "Return to the active chess game"; onClicked: root.currentView = "game" }
          ChessUi.SecondaryButton { text: "Home"; accessibleDescription: "Return to Omarchy Chess home"; onClicked: root.currentView = "home" }
        }
      }
    }
  }
}
