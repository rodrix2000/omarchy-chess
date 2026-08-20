/*
 * Pure orthodox-game adjudication shared by QML and Node tests.
 *
 * Keep this file as a classic script: QML imports its top-level functions as a
 * namespace, while the guarded CommonJS export is used only by Node tests.
 */

"use strict"

function oppositeSide(side) {
  if (side === "white")
    return "black"
  if (side === "black")
    return "white"
  return null
}

function scoreForWinner(winner) {
  if (winner === "white")
    return "1-0"
  if (winner === "black")
    return "0-1"
  return "1/2-1/2"
}

function terminalResult(reason, winner, score) {
  return {
    terminal: true,
    result: {
      score: score || scoreForWinner(winner),
      reason: reason,
      winner: winner || null
    },
    claims: null
  }
}

function drawResult(reason) {
  return terminalResult(reason, null, "1/2-1/2")
}

function unfinishedResult(claims) {
  return {
    terminal: false,
    result: null,
    claims: claims
  }
}

function finiteNumber(value) {
  return typeof value === "number" && isFinite(value) ? value : 0
}

function contextPosition(context) {
  return context && context.position ? context.position : {}
}

function currentPositionCount(context) {
  var counts = context && context.position_counts
  var key = context && context.current_position_key
  var count

  if (!counts || typeof key !== "string")
    return 0

  count = counts[key]
  return finiteNumber(count)
}

function currentClaims(context) {
  var position = contextPosition(context)

  return {
    threefold_current: currentPositionCount(context) >= 3,
    fifty_move_current: finiteNumber(position.halfmove_clock) >= 100,
    prospective_moves: []
  }
}

function moveUci(move) {
  var promotion

  if (typeof move === "string")
    return move
  if (!move || typeof move !== "object")
    return null
  if (typeof move.uci === "string")
    return move.uci
  if (typeof move.from !== "string" || typeof move.to !== "string")
    return null

  promotion = move.promotion || ""
  if (promotion === "queen")
    promotion = "q"
  else if (promotion === "rook")
    promotion = "r"
  else if (promotion === "bishop")
    promotion = "b"
  else if (promotion === "knight")
    promotion = "n"

  return move.from + move.to + promotion
}

function firstDefined(object, names) {
  var i

  if (!object)
    return undefined

  for (i = 0; i < names.length; i += 1) {
    if (object[names[i]] !== undefined)
      return object[names[i]]
  }

  return undefined
}

function halfmoveFromFen(fen) {
  var fields
  var value

  if (typeof fen !== "string")
    return null

  fields = fen.trim().split(/\s+/)
  if (fields.length < 5)
    return null

  value = Number(fields[4])
  return isFinite(value) && value >= 0 ? value : null
}

function projectionFromPreparedMove(move) {
  var projection = move && (move.projection || move.resulting_position || move.after)
  var source = projection || move
  var key
  var halfmove

  if (!source || typeof source !== "object")
    return null
  if (source.ok === false)
    return null

  key = firstDefined(source, [
    "position_key_after",
    "resulting_position_key",
    "next_position_key",
    "position_key"
  ])
  halfmove = firstDefined(source, [
    "halfmove_clock_after",
    "resulting_halfmove_clock",
    "next_halfmove_clock",
    "halfmove_clock"
  ])

  if (typeof key !== "string" && typeof halfmove !== "number")
    return null

  return {
    position_key_after: typeof key === "string" ? key : null,
    halfmove_clock_after: typeof halfmove === "number" ? halfmove : null
  }
}

function cloneRulesForProjection(context) {
  var rules = context && context.rules
  var clone

  if (context && typeof context.clone_rules === "function")
    clone = context.clone_rules()
  else if (rules && typeof rules.clone === "function")
    clone = rules.clone()
  else if (context && typeof context.rules_factory === "function" && rules && typeof rules.fen === "function")
    clone = context.rules_factory({ fen: rules.fen() })
  else
    clone = null

  // A prospective query must never mutate the authoritative rules object.
  if (clone === rules)
    return null

  return clone
}

function positionKeyFromProjectedRules(context, rules) {
  var provider

  if (context && typeof context.position_key_from_rules === "function")
    return context.position_key_from_rules(rules)
  if (context && typeof context.position_key === "function")
    return context.position_key(rules)

  provider = context && (context.PositionKey || context.position_key_provider)
  if (provider && typeof provider.fromRules === "function")
    return provider.fromRules(rules)
  if (rules && typeof rules.positionKey === "function")
    return rules.positionKey()

  return null
}

function projectMove(context, move) {
  var prepared = projectionFromPreparedMove(move)
  var clone
  var committed
  var key
  var halfmove
  var fen

  if (prepared)
    return prepared

  if (context && typeof context.project_move === "function") {
    prepared = context.project_move(move)
    return projectionFromPreparedMove(prepared)
  }

  clone = cloneRulesForProjection(context)
  if (!clone || typeof clone.commitMove !== "function")
    return null

  committed = clone.commitMove(move)
  if (!committed || committed.ok !== true)
    return null

  key = positionKeyFromProjectedRules(context, clone)
  halfmove = firstDefined(committed, ["halfmove_clock", "halfmove_clock_after"])

  if (typeof halfmove !== "number" && typeof clone.fen === "function") {
    fen = clone.fen()
    halfmove = halfmoveFromFen(fen)
  }

  return {
    position_key_after: typeof key === "string" ? key : null,
    halfmove_clock_after: typeof halfmove === "number" ? halfmove : null
  }
}

function legalMovesFromContext(context) {
  if (!context)
    return []
  if (Array.isArray(context.legal_moves))
    return context.legal_moves
  if (Array.isArray(context.legalMoves))
    return context.legalMoves
  if (typeof context.legalMoves === "function")
    return context.legalMoves()
  if (context.rules && typeof context.rules.legalMoves === "function")
    return context.rules.legalMoves({ verbose: true })
  return []
}

/*
 * Each returned entry identifies one legal move and which before-move claim it
 * enables. Projected metadata may be supplied by the controller, or this
 * module clones `context.rules`, commits on the clone, and asks the injected
 * PositionKey provider for the resulting identity. Neither path mutates the
 * live position or the repetition map.
 */
function prospectiveClaims(context, legalMoves) {
  var moves = Array.isArray(legalMoves) ? legalMoves : legalMovesFromContext(context)
  var claims = []
  var seen = {}
  var counts = context && context.position_counts ? context.position_counts : {}
  var i
  var move
  var uci
  var projection
  var nextCount
  var isThreefold
  var isFiftyMove

  for (i = 0; i < moves.length; i += 1) {
    move = moves[i]
    uci = moveUci(move)
    if (!uci || seen[uci])
      continue

    projection = projectMove(context, move)
    if (!projection)
      continue

    nextCount = 0
    if (typeof projection.position_key_after === "string")
      nextCount = finiteNumber(counts[projection.position_key_after]) + 1

    isThreefold = nextCount >= 3
    isFiftyMove = typeof projection.halfmove_clock_after === "number" &&
      isFinite(projection.halfmove_clock_after) &&
      projection.halfmove_clock_after >= 100

    if (isThreefold || isFiftyMove) {
      seen[uci] = true
      claims.push({
        uci: uci,
        threefold: isThreefold,
        fifty_move: isFiftyMove
      })
    }
  }

  return claims
}

function evaluatePostMove(context) {
  var position = contextPosition(context)
  var sideToMove = position.side_to_move
  var claims

  // This order is a rules invariant. In particular, mate on ply 150 wins.
  if (position.checkmate === true)
    return terminalResult("checkmate", oppositeSide(sideToMove))
  if (position.stalemate === true)
    return drawResult("stalemate")
  if (position.dead_position === true)
    return drawResult("dead-position")
  if (currentPositionCount(context) >= 5)
    return drawResult("fivefold-automatic")
  if (finiteNumber(position.halfmove_clock) >= 150)
    return drawResult("seventy-five-move-automatic")

  claims = currentClaims(context)
  claims.prospective_moves = prospectiveClaims(context, legalMovesFromContext(context))
  return unfinishedResult(claims)
}

function normalizedActionType(action) {
  var type

  if (typeof action === "string")
    type = action
  else if (action && typeof action === "object")
    type = action.type || action.action || action.kind
  else
    return null

  if (!type && action.expired_side)
    type = "timeout"
  else if (!type && action.resigning_side)
    type = "resignation"

  if (typeof type !== "string")
    return null

  return type.toLowerCase().replace(/_/g, "-")
}

function selectedMoveForClaim(context, action) {
  var selected = action && (action.move_uci || action.moveUci || action.move)
  var selectedUci = moveUci(selected)
  var moves
  var i

  if (!selectedUci)
    return null

  moves = legalMovesFromContext(context)
  for (i = 0; i < moves.length; i += 1) {
    if (moveUci(moves[i]) === selectedUci)
      return moves[i]
  }

  // If no list was supplied, clone/commit still validates the selected move.
  return moves.length === 0 ? selected : null
}

function claimIsValid(context, action, claimType) {
  var current = currentClaims(context)
  var selected = selectedMoveForClaim(context, action)
  var prospective
  var i

  if (!action || (!action.move_uci && !action.moveUci && !action.move)) {
    if (claimType === "threefold")
      return current.threefold_current
    return current.fifty_move_current
  }

  if (!selected)
    return false

  prospective = prospectiveClaims(context, [selected])
  for (i = 0; i < prospective.length; i += 1) {
    if (claimType === "threefold" && prospective[i].threefold)
      return true
    if (claimType === "fifty-move" && prospective[i].fifty_move)
      return true
  }

  return false
}

function actionMatingPossibility(context, action, winningSide) {
  var supplied = firstDefined(action, ["opponent_can_possibly_mate", "can_possibly_mate"])
  var material

  if (typeof supplied === "boolean")
    return supplied

  supplied = firstDefined(context, ["opponent_can_possibly_mate", "can_possibly_mate"])
  if (typeof supplied === "boolean")
    return supplied

  material = firstDefined(action, ["material_position", "material"])
  if (material === undefined)
    material = firstDefined(context, ["material_position", "material"])
  if (material !== undefined)
    return canPossiblyMate(material, winningSide)

  // Validated callers normally supply the boolean or material. Missing data
  // must not invent an insufficient-material draw.
  return true
}

function evaluateExternalAction(context, action) {
  var existing = evaluatePostMove(context)
  var actualAction = action || (context && context.external_action)
  var type = normalizedActionType(actualAction)
  var side
  var winner
  var canMate
  var claimType

  if (existing.terminal || !type)
    return existing

  if (type === "resignation" || type === "resign") {
    side = actualAction.resigning_side || actualAction.side
    winner = oppositeSide(side)
    if (!winner)
      return existing
    canMate = actionMatingPossibility(context, actualAction, winner)
    return canMate ? terminalResult("resignation", winner) : drawResult("resignation")
  }

  if (type === "draw-agreement" || type === "draw-agreed") {
    if (actualAction.valid === false || actualAction.accepted === false)
      return existing
    return drawResult("draw-agreement")
  }

  if (type === "timeout") {
    side = actualAction.expired_side || actualAction.side
    winner = oppositeSide(side)
    if (!winner)
      return existing
    canMate = actionMatingPossibility(context, actualAction, winner)
    if (!canMate)
      return drawResult("timeout-insufficient-mating-possibility")
    return terminalResult("timeout", winner)
  }

  if (type === "abandon" || type === "abandoned")
    return terminalResult("abandoned", null, "*")

  claimType = null
  if (type === "threefold-claim" || type === "threefold")
    claimType = "threefold"
  else if (type === "fifty-move-claim" || type === "fifty-move")
    claimType = "fifty-move"
  else if (type === "claim" && (actualAction.claim_type || actualAction.claim)) {
    claimType = String(actualAction.claim_type || actualAction.claim).toLowerCase().replace(/_/g, "-")
    if (claimType === "threefold-claim")
      claimType = "threefold"
    else if (claimType === "fifty-move-claim")
      claimType = "fifty-move"
  }

  if (claimType === "threefold" && claimIsValid(context, actualAction, claimType))
    return drawResult("threefold-claim")
  if (claimType === "fifty-move" && claimIsValid(context, actualAction, claimType))
    return drawResult("fifty-move-claim")

  return existing
}

function emptyMaterialSide() {
  return {
    pawn: 0,
    knight: 0,
    bishop: 0,
    rook: 0,
    queen: 0,
    king: 0,
    bishop_colors: [],
    unknown_bishop_colors: 0,
    unknown_pieces: 0
  }
}

function normalizeSide(side) {
  if (side === "white" || side === "w")
    return "white"
  if (side === "black" || side === "b")
    return "black"
  return null
}

function normalizePiece(piece) {
  var value

  if (typeof piece !== "string")
    return null
  value = piece.toLowerCase()
  if (value === "p" || value === "pawn" || value === "pawns")
    return "pawn"
  if (value === "n" || value === "knight" || value === "knights")
    return "knight"
  if (value === "b" || value === "bishop" || value === "bishops")
    return "bishop"
  if (value === "r" || value === "rook" || value === "rooks")
    return "rook"
  if (value === "q" || value === "queen" || value === "queens")
    return "queen"
  if (value === "k" || value === "king" || value === "kings")
    return "king"
  return null
}

function normalizedSquareColor(value) {
  if (value === 0 || value === "dark" || value === "black")
    return "dark"
  if (value === 1 || value === "light" || value === "white")
    return "light"
  return null
}

function squareColor(square) {
  var file
  var rank

  if (typeof square !== "string" || !/^[a-h][1-8]$/i.test(square))
    return null

  file = square.toLowerCase().charCodeAt(0) - 97
  rank = Number(square.charAt(1)) - 1
  return (file + rank) % 2 === 0 ? "dark" : "light"
}

function addPiece(sideInfo, piece, square, explicitSquareColor) {
  var type = normalizePiece(piece)
  var color

  if (!type) {
    sideInfo.unknown_pieces += 1
    return
  }

  sideInfo[type] += 1
  if (type !== "bishop")
    return

  color = normalizedSquareColor(explicitSquareColor) || squareColor(square)
  if (color)
    sideInfo.bishop_colors.push(color)
  else
    sideInfo.unknown_bishop_colors += 1
}

function addPieceEntry(material, entry, expectedSide, inferredSquare) {
  var side
  var piece
  var square
  var color

  if (typeof entry === "string") {
    if (expectedSide) {
      addPiece(material[expectedSide], entry, inferredSquare, null)
    } else if (/^[prnbqk]$/i.test(entry)) {
      side = entry === entry.toUpperCase() ? "white" : "black"
      addPiece(material[side], entry, inferredSquare, null)
    }
    return
  }
  if (!entry || typeof entry !== "object")
    return

  side = normalizeSide(entry.color || entry.side) || expectedSide
  if (!side)
    return
  piece = entry.piece || entry.type || entry.name || entry.symbol
  square = entry.square || inferredSquare
  color = entry.square_color || entry.squareColor || entry.bishop_color
  addPiece(material[side], piece, square, color)
}

function addBoardArray(material, board) {
  var row
  var column
  var entry
  var square
  var files = "abcdefgh"

  for (row = 0; row < board.length; row += 1) {
    if (Array.isArray(board[row])) {
      for (column = 0; column < board[row].length; column += 1) {
        entry = board[row][column]
        square = files.charAt(column) + String(8 - row)
        addPieceEntry(material, entry, null, square)
      }
    } else {
      addPieceEntry(material, board[row], null, null)
    }
  }
}

function addCount(sideInfo, type, count) {
  var i
  var safeCount = typeof count === "number" && isFinite(count) && count > 0 ? Math.floor(count) : 0

  for (i = 0; i < safeCount; i += 1)
    addPiece(sideInfo, type, null, null)
}

function addMaterialSummarySide(material, side, summary) {
  var sideInfo = material[side]
  var types = ["pawn", "knight", "rook", "queen", "king"]
  var i
  var type
  var value
  var bishops
  var bishopColors
  var bishopCount
  var describedBishops

  if (Array.isArray(summary)) {
    for (i = 0; i < summary.length; i += 1)
      addPieceEntry(material, summary[i], side, null)
    return
  }
  if (!summary || typeof summary !== "object")
    return

  if (Array.isArray(summary.pieces)) {
    addMaterialSummarySide(material, side, summary.pieces)
    return
  }

  for (i = 0; i < types.length; i += 1) {
    type = types[i]
    value = summary[type]
    if (value === undefined)
      value = summary[type + "s"]
    addCount(sideInfo, type, value)
  }

  bishops = summary.bishops !== undefined ? summary.bishops : summary.bishop
  bishopColors = summary.bishop_square_colors
  if (Array.isArray(bishops)) {
    for (i = 0; i < bishops.length; i += 1) {
      if (typeof bishops[i] === "string" && normalizedSquareColor(bishops[i]))
        addPiece(sideInfo, "bishop", null, bishops[i])
      else if (typeof bishops[i] === "string" && /^[a-h][1-8]$/i.test(bishops[i]))
        addPiece(sideInfo, "bishop", bishops[i], null)
      else if (bishops[i] && typeof bishops[i] === "object")
        addPiece(
          sideInfo,
          "bishop",
          bishops[i].square,
          bishops[i].square_color || bishops[i].squareColor || bishops[i].bishop_color
        )
      else
        addPieceEntry(material, bishops[i], side, null)
    }
  } else {
    bishopCount = typeof bishops === "number" && isFinite(bishops) && bishops > 0 ? Math.floor(bishops) : 0
    describedBishops = 0
    if (Array.isArray(bishopColors)) {
      describedBishops = Math.min(bishopCount || bishopColors.length, bishopColors.length)
      for (i = 0; i < describedBishops; i += 1)
        addPiece(sideInfo, "bishop", null, bishopColors[i])
    }
    addCount(sideInfo, "bishop", bishopCount - describedBishops)
  }
}

function addFen(material, fen) {
  var placement = fen.trim().split(/\s+/)[0]
  var ranks = placement.split("/")
  var files = "abcdefgh"
  var rankIndex
  var fileIndex
  var i
  var symbol
  var side
  var square

  if (ranks.length !== 8)
    return false

  for (rankIndex = 0; rankIndex < ranks.length; rankIndex += 1) {
    fileIndex = 0
    for (i = 0; i < ranks[rankIndex].length; i += 1) {
      symbol = ranks[rankIndex].charAt(i)
      if (/^[1-8]$/.test(symbol)) {
        fileIndex += Number(symbol)
      } else if (/^[prnbqk]$/i.test(symbol) && fileIndex < 8) {
        side = symbol === symbol.toUpperCase() ? "white" : "black"
        square = files.charAt(fileIndex) + String(8 - rankIndex)
        addPiece(material[side], symbol, square, null)
        fileIndex += 1
      } else {
        return false
      }
    }
    if (fileIndex !== 8)
      return false
  }

  return true
}

function parseMaterial(materialPosition) {
  var material = {
    white: emptyMaterialSide(),
    black: emptyMaterialSide(),
    valid: true
  }
  var source = materialPosition

  if (typeof source === "string") {
    material.valid = addFen(material, source)
    return material
  }
  if (Array.isArray(source)) {
    addBoardArray(material, source)
    return material
  }
  if (!source || typeof source !== "object") {
    material.valid = false
    return material
  }

  if (typeof source.fen === "string") {
    material.valid = addFen(material, source.fen)
    return material
  }
  if (Array.isArray(source.board)) {
    addBoardArray(material, source.board)
    return material
  }
  if (Array.isArray(source.pieces)) {
    addBoardArray(material, source.pieces)
    return material
  }
  if (source.material_position)
    return parseMaterial(source.material_position)
  if (source.material)
    return parseMaterial(source.material)

  addMaterialSummarySide(material, "white", source.white)
  addMaterialSummarySide(material, "black", source.black)
  return material
}

function nonKingCount(sideInfo) {
  return sideInfo.pawn + sideInfo.knight + sideInfo.bishop +
    sideInfo.rook + sideInfo.queen + sideInfo.unknown_pieces
}

function allBishopsShareOneColor(material) {
  var white = material.white
  var black = material.black
  var total = white.bishop + black.bishop
  var colors = white.bishop_colors.concat(black.bishop_colors)
  var unknown = white.unknown_bishop_colors + black.unknown_bishop_colors
  var first
  var i

  if (total <= 1)
    return true
  if (unknown > 0)
    return false

  first = colors[0]
  for (i = 1; i < colors.length; i += 1) {
    if (colors[i] !== first)
      return false
  }
  return true
}

/*
 * Material-only "possible mate" policy for timeout and resignation.
 *
 * This proves the standard impossible families and otherwise returns true;
 * it does not pretend to solve arbitrary fortress/reachability positions.
 * The single-minor cases intentionally inspect the opponent's material:
 *
 * - A lone knight can selfmate an opponent only when that opponent retains a
 *   pawn, knight, bishop, or rook. A bare king or king plus queens cannot.
 * - Bishop-only material is impossible only when every bishop on the board is
 *   confined to one color complex and no pawn or knight remains. Opposing
 *   rooks/queens alone do not change that proof.
 *
 * Thus Q/R/P, B+N, two knights, and opposite-color bishop pairs are possible;
 * K, K+B, K+N versus a bare king, and same-complex bishops-only are not.
 * Unknown bishop complexes are treated as possibly mating, preventing an
 * unsupported insufficient-mating-possibility draw.
 */
function canPossiblyMate(materialPosition, winningSide) {
  var side = normalizeSide(winningSide)
  var opponentSide = oppositeSide(side)
  var material
  var winner
  var opponent

  if (!side)
    return false

  material = parseMaterial(materialPosition)
  if (!material.valid)
    return false

  winner = material[side]
  opponent = material[opponentSide]

  if (winner.unknown_pieces > 0)
    return true
  if (winner.pawn > 0 || winner.rook > 0 || winner.queen > 0)
    return true

  if (winner.knight > 0) {
    if (nonKingCount(winner) > 1)
      return true
    return opponent.pawn > 0 || opponent.knight > 0 ||
      opponent.bishop > 0 || opponent.rook > 0 ||
      opponent.unknown_pieces > 0
  }

  if (winner.bishop > 0) {
    if (!allBishopsShareOneColor(material))
      return true
    return material.white.pawn > 0 || material.black.pawn > 0 ||
      material.white.knight > 0 || material.black.knight > 0 ||
      material.white.unknown_pieces > 0 || material.black.unknown_pieces > 0
  }

  return false
}

var Adjudicator = {
  evaluatePostMove: evaluatePostMove,
  evaluateExternalAction: evaluateExternalAction,
  currentClaims: currentClaims,
  prospectiveClaims: prospectiveClaims,
  canPossiblyMate: canPossiblyMate
}

if (typeof module !== "undefined" && module.exports)
  module.exports = Adjudicator
