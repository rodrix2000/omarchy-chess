import * as ChessVendor from "./ChessVendor.mjs"
import * as ChessCore from "./ChessCore.mjs"
import * as RulesAdapter from "./RulesAdapter.mjs"
import * as PositionKey from "./PositionKey.mjs"
import * as DifficultyProfiles from "./DifficultyProfiles.mjs"
import * as Evaluation from "./Evaluation.mjs"
import * as SearchEngine from "./SearchEngine.mjs"
import * as WorkerProtocol from "./WorkerProtocol.mjs"

/*
 * This is the sole WorkerScript entry point. Token invalidation is enforced by
 * the service when a response returns; synchronous JavaScript cannot process a
 * cancel message while a search is already running.
 */

ChessCore.configureVendor(ChessVendor)
RulesAdapter.configureCore(ChessCore)
SearchEngine.configureDependencies(
  RulesAdapter,
  Evaluation,
  DifficultyProfiles,
  PositionKey
)
WorkerProtocol.configureDependencies(SearchEngine, DifficultyProfiles)

WorkerScript.onMessage = function (message) {
  var response

  try {
    response = WorkerProtocol.handleMessage(message)
  } catch (error) {
    response = {
      protocol_version: 1,
      type: "error",
      token: message && typeof message.token === "number" ? message.token : null,
      game_id: message && typeof message.game_id === "string" ? message.game_id : "",
      source_fen: message && typeof message.source_fen === "string" ? message.source_fen : "",
      code: "AI_WORKER_FAILURE",
      message: String(error && error.message || error).slice(0, 240)
    }
  }
  WorkerScript.sendMessage(response)
}
