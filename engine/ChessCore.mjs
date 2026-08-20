/*
 * The only project module that knows how to construct the vendored rules
 * implementation. QML configures it with the generated vendor namespace;
 * Node tests resolve the same committed artifact through CommonJS.
 */

"use strict"

var configuredVendor = null

function configureVendor(vendor) {
  if (!vendor || typeof vendor.createChess !== "function" ||
      typeof vendor.validateFen !== "function")
    throw new Error("ChessCore: invalid vendor namespace")

  configuredVendor = vendor
  return true
}

function vendor() {
  if (!configuredVendor)
    throw new Error("ChessCore: rules vendor has not been configured")
  return configuredVendor
}

function create(options) {
  var input = options || {}
  var hasFen = typeof input.fen === "string"
  var hasPgn = typeof input.pgn === "string"
  var chess

  if (hasFen && hasPgn)
    throw new Error("ChessCore: provide fen or pgn, not both")

  chess = vendor().createChess(hasFen ? input.fen : undefined)
  if (hasPgn)
    chess.loadPgn(input.pgn, input.pgnOptions || {})
  return chess
}

function validateFen(fen) {
  if (typeof fen !== "string")
    return { ok: false, error: "FEN must be a string" }
  return vendor().validateFen(fen)
}

function defaultFen() {
  return vendor().defaultPosition()
}

var ChessCore = {
  configureVendor: configureVendor,
  create: create,
  validateFen: validateFen,
  defaultFen: defaultFen
}

export { configureVendor, create, validateFen, defaultFen }
