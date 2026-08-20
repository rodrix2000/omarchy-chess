/*
 * Deterministic, bounded static evaluation for the built-in opponent.
 * Scores are centipawns from the perspective of the side to move.
 */

"use strict"

var EVALUATION_VALUES = {
  pawn: 100,
  knight: 320,
  bishop: 330,
  rook: 500,
  queen: 900,
  king: 0
}

var EVALUATION_PHASE = {
  pawn: 0,
  knight: 1,
  bishop: 1,
  rook: 2,
  queen: 4,
  king: 0
}

var EVALUATION_MAX_PHASE = 24
var EVALUATION_TEMPO = 10

/* Tables are indexed a1..h1, a2..h2, ... from White's perspective. */
var EVALUATION_MG_TABLES = {
  pawn: [
     0,  0,  0,  0,  0,  0,  0,  0,
     5, 10, 10,-15,-15, 10, 10,  5,
     4,  6,  8, 16, 16,  8,  6,  4,
     2,  4,  6, 20, 20,  6,  4,  2,
     4,  6, 10, 24, 24, 10,  6,  4,
     8, 12, 18, 28, 28, 18, 12,  8,
    20, 24, 28, 34, 34, 28, 24, 20,
     0,  0,  0,  0,  0,  0,  0,  0
  ],
  knight: [
    -45,-30,-20,-20,-20,-20,-30,-45,
    -30,-12,  0,  4,  4,  0,-12,-30,
    -20,  2, 10, 14, 14, 10,  2,-20,
    -18,  6, 14, 20, 20, 14,  6,-18,
    -18,  6, 14, 20, 20, 14,  6,-18,
    -20,  2, 10, 14, 14, 10,  2,-20,
    -30,-12,  0,  4,  4,  0,-12,-30,
    -45,-30,-20,-20,-20,-20,-30,-45
  ],
  bishop: [
    -18,-10,-10,-10,-10,-10,-10,-18,
    -10,  4,  0,  2,  2,  0,  4,-10,
    -10,  6,  8, 10, 10,  8,  6,-10,
    -10,  4, 10, 14, 14, 10,  4,-10,
    -10,  6, 10, 14, 14, 10,  6,-10,
    -10,  8,  8, 10, 10,  8,  8,-10,
    -10,  4,  2,  2,  2,  2,  4,-10,
    -18,-10,-10,-10,-10,-10,-10,-18
  ],
  rook: [
     0,  0,  4,  8,  8,  4,  0,  0,
    -4,  0,  0,  2,  2,  0,  0, -4,
    -4,  0,  0,  2,  2,  0,  0, -4,
    -4,  0,  0,  2,  2,  0,  0, -4,
    -4,  0,  0,  2,  2,  0,  0, -4,
    -4,  0,  0,  2,  2,  0,  0, -4,
     8, 12, 12, 14, 14, 12, 12,  8,
     0,  0,  4,  8,  8,  4,  0,  0
  ],
  queen: [
    -18,-10,-10, -5, -5,-10,-10,-18,
    -10,  0,  2,  0,  0,  2,  0,-10,
    -10,  2,  4,  4,  4,  4,  2,-10,
     -5,  0,  4,  5,  5,  4,  0, -5,
      0,  0,  4,  5,  5,  4,  0, -5,
    -10,  4,  4,  4,  4,  4,  2,-10,
    -10,  0,  4,  0,  0,  0,  0,-10,
    -18,-10,-10, -5, -5,-10,-10,-18
  ],
  king: [
     18, 24,  8,-12,-12,  0, 24, 18,
     10, 10,-10,-18,-18,-10, 10, 10,
    -10,-14,-18,-24,-24,-18,-14,-10,
    -24,-28,-32,-38,-38,-32,-28,-24,
    -32,-36,-40,-46,-46,-40,-36,-32,
    -36,-40,-44,-50,-50,-44,-40,-36,
    -40,-44,-48,-54,-54,-48,-44,-40,
    -44,-48,-52,-58,-58,-52,-48,-44
  ]
}

var EVALUATION_EG_KING = [
  -45,-30,-20,-15,-15,-20,-30,-45,
  -30,-15, -5,  0,  0, -5,-15,-30,
  -20, -5, 10, 15, 15, 10, -5,-20,
  -15,  0, 15, 24, 24, 15,  0,-15,
  -15,  0, 15, 24, 24, 15,  0,-15,
  -20, -5, 10, 15, 15, 10, -5,-20,
  -30,-15, -5,  0,  0, -5,-15,-30,
  -45,-30,-20,-15,-15,-20,-30,-45
]

var EVALUATION_PASSED = [0, 4, 10, 20, 36, 58, 90, 0]
var EVALUATION_MOBILITY_WEIGHT = {
  pawn: 1,
  knight: 3,
  bishop: 3,
  rook: 2,
  queen: 1,
  king: 1
}

function evaluationSquare(square) {
  var file = String(square).charCodeAt(0) - 97
  var rank = Number(String(square).charAt(1)) - 1

  return { file: file, rank: rank }
}

function evaluationIndex(square, color) {
  var parsed = evaluationSquare(square)
  var rank = color === "white" ? parsed.rank : 7 - parsed.rank

  return rank * 8 + parsed.file
}

function evaluationSign(color) {
  return color === "white" ? 1 : -1
}

function evaluationBoardMap(pieces) {
  var map = {}
  var index

  for (index = 0; index < pieces.length; index += 1)
    map[pieces[index].square] = pieces[index]
  return map
}

function evaluationSquareName(file, rank) {
  if (file < 0 || file > 7 || rank < 0 || rank > 7)
    return null
  return String.fromCharCode(97 + file) + String(rank + 1)
}

function evaluationRayMobility(piece, map, directions) {
  var origin = evaluationSquare(piece.square)
  var mobility = 0
  var index

  for (index = 0; index < directions.length; index += 1) {
    var file = origin.file + directions[index][0]
    var rank = origin.rank + directions[index][1]
    var square
    var occupant

    while ((square = evaluationSquareName(file, rank)) !== null) {
      occupant = map[square]
      if (!occupant) {
        mobility += 1
      } else {
        if (occupant.color !== piece.color)
          mobility += 1
        break
      }
      file += directions[index][0]
      rank += directions[index][1]
    }
  }
  return mobility
}

function evaluationJumpMobility(piece, map, jumps) {
  var origin = evaluationSquare(piece.square)
  var mobility = 0
  var index

  for (index = 0; index < jumps.length; index += 1) {
    var square = evaluationSquareName(
      origin.file + jumps[index][0],
      origin.rank + jumps[index][1]
    )
    var occupant = square ? map[square] : null

    if (square && (!occupant || occupant.color !== piece.color))
      mobility += 1
  }
  return mobility
}

function evaluationMobility(piece, map) {
  var diagonal = [[1, 1], [1, -1], [-1, 1], [-1, -1]]
  var straight = [[1, 0], [-1, 0], [0, 1], [0, -1]]
  var knight = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]
  var king = diagonal.concat(straight)
  var origin
  var direction
  var forward
  var mobility
  var index

  if (piece.piece === "bishop")
    return evaluationRayMobility(piece, map, diagonal)
  if (piece.piece === "rook")
    return evaluationRayMobility(piece, map, straight)
  if (piece.piece === "queen")
    return evaluationRayMobility(piece, map, king)
  if (piece.piece === "knight")
    return evaluationJumpMobility(piece, map, knight)
  if (piece.piece === "king")
    return evaluationJumpMobility(piece, map, king)

  origin = evaluationSquare(piece.square)
  direction = piece.color === "white" ? 1 : -1
  forward = evaluationSquareName(origin.file, origin.rank + direction)
  mobility = forward && !map[forward] ? 1 : 0
  for (index = -1; index <= 1; index += 2) {
    var capture = evaluationSquareName(origin.file + index, origin.rank + direction)
    if (capture && map[capture] && map[capture].color !== piece.color)
      mobility += 1
  }
  return mobility
}

function evaluationPawnFiles(pieces, color) {
  var files = [[], [], [], [], [], [], [], []]
  var index

  for (index = 0; index < pieces.length; index += 1) {
    if (pieces[index].color === color && pieces[index].piece === "pawn") {
      var parsed = evaluationSquare(pieces[index].square)
      files[parsed.file].push(parsed.rank)
    }
  }
  return files
}

function evaluationIsPassed(file, rank, color, enemyFiles) {
  var adjacent
  var pawnIndex

  for (adjacent = Math.max(0, file - 1); adjacent <= Math.min(7, file + 1); adjacent += 1) {
    for (pawnIndex = 0; pawnIndex < enemyFiles[adjacent].length; pawnIndex += 1) {
      var enemyRank = enemyFiles[adjacent][pawnIndex]
      if ((color === "white" && enemyRank > rank) ||
          (color === "black" && enemyRank < rank))
        return false
    }
  }
  return true
}

function evaluationPawnStructure(files, enemyFiles, color) {
  var score = 0
  var file
  var index

  for (file = 0; file < 8; file += 1) {
    if (files[file].length > 1)
      score -= (files[file].length - 1) * 14

    for (index = 0; index < files[file].length; index += 1) {
      var rank = files[file][index]
      var relativeRank = color === "white" ? rank : 7 - rank
      var hasNeighbor = (file > 0 && files[file - 1].length > 0) ||
        (file < 7 && files[file + 1].length > 0)
      var connected = (file > 0 && files[file - 1].indexOf(rank) !== -1) ||
        (file < 7 && files[file + 1].indexOf(rank) !== -1)

      if (!hasNeighbor)
        score -= 12
      if (connected)
        score += 5
      if (evaluationIsPassed(file, rank, color, enemyFiles))
        score += EVALUATION_PASSED[Math.max(0, Math.min(7, relativeRank))]
    }
  }
  return score
}

function evaluationRookActivity(piece, ownPawns, enemyPawns) {
  var parsed = evaluationSquare(piece.square)
  var relativeRank = piece.color === "white" ? parsed.rank : 7 - parsed.rank
  var score = 0

  if (ownPawns[parsed.file].length === 0)
    score += enemyPawns[parsed.file].length === 0 ? 14 : 8
  if (relativeRank === 6)
    score += 18
  return score
}

function evaluationKingSafety(piece, map, ownPawns, fen) {
  var origin = evaluationSquare(piece.square)
  var direction = piece.color === "white" ? 1 : -1
  var score = 0
  var file
  var rights = String(fen || "").trim().split(/\s+/)[2] || "-"

  for (file = Math.max(0, origin.file - 1); file <= Math.min(7, origin.file + 1); file += 1) {
    var shelterOne = evaluationSquareName(file, origin.rank + direction)
    var shelterTwo = evaluationSquareName(file, origin.rank + direction * 2)
    if (shelterOne && map[shelterOne] && map[shelterOne].color === piece.color && map[shelterOne].piece === "pawn")
      score += 9
    else if (shelterTwo && map[shelterTwo] && map[shelterTwo].color === piece.color && map[shelterTwo].piece === "pawn")
      score += 4
    if (ownPawns[file].length === 0)
      score -= 8
  }

  if (piece.color === "white" && /[KQ]/.test(rights))
    score += 4
  if (piece.color === "black" && /[kq]/.test(rights))
    score += 4
  return score
}

function evaluationDevelopment(pieces, color) {
  var home = color === "white"
    ? { knight: { b1: true, g1: true }, bishop: { c1: true, f1: true } }
    : { knight: { b8: true, g8: true }, bishop: { c8: true, f8: true } }
  var score = 0
  var index

  for (index = 0; index < pieces.length; index += 1) {
    var piece = pieces[index]
    if (piece.color !== color || !home[piece.piece])
      continue
    score += home[piece.piece][piece.square] ? -6 : 5
  }
  return score
}

function evaluationWhiteScore(position) {
  var pieces = position.board()
  var map = evaluationBoardMap(pieces)
  var whitePawns = evaluationPawnFiles(pieces, "white")
  var blackPawns = evaluationPawnFiles(pieces, "black")
  var phase = 0
  var middlegame = 0
  var endgame = 0
  var bishopCounts = { white: 0, black: 0 }
  var index
  var fen = typeof position.fen === "function" ? position.fen() : ""

  for (index = 0; index < pieces.length; index += 1)
    phase += EVALUATION_PHASE[pieces[index].piece] || 0
  phase = Math.max(0, Math.min(EVALUATION_MAX_PHASE, phase))

  for (index = 0; index < pieces.length; index += 1) {
    var piece = pieces[index]
    var sign = evaluationSign(piece.color)
    var tableIndex = evaluationIndex(piece.square, piece.color)
    var material = EVALUATION_VALUES[piece.piece] || 0
    var mgTable = EVALUATION_MG_TABLES[piece.piece] || EVALUATION_MG_TABLES.king
    var mg = material + mgTable[tableIndex]
    var eg = material + (piece.piece === "king" ? EVALUATION_EG_KING[tableIndex] : mgTable[tableIndex])
    var mobility = evaluationMobility(piece, map) * EVALUATION_MOBILITY_WEIGHT[piece.piece]

    middlegame += sign * (mg + mobility)
    endgame += sign * (eg + mobility)
    if (piece.piece === "bishop")
      bishopCounts[piece.color] += 1
    if (piece.piece === "rook") {
      var activity = evaluationRookActivity(
        piece,
        piece.color === "white" ? whitePawns : blackPawns,
        piece.color === "white" ? blackPawns : whitePawns
      )
      middlegame += sign * activity
      endgame += sign * activity
    }
    if (piece.piece === "king")
      middlegame += sign * evaluationKingSafety(
        piece,
        map,
        piece.color === "white" ? whitePawns : blackPawns,
        fen
      )
  }

  if (bishopCounts.white >= 2) {
    middlegame += 28
    endgame += 34
  }
  if (bishopCounts.black >= 2) {
    middlegame -= 28
    endgame -= 34
  }

  middlegame += evaluationPawnStructure(whitePawns, blackPawns, "white")
  middlegame -= evaluationPawnStructure(blackPawns, whitePawns, "black")
  endgame += evaluationPawnStructure(whitePawns, blackPawns, "white")
  endgame -= evaluationPawnStructure(blackPawns, whitePawns, "black")
  middlegame += evaluationDevelopment(pieces, "white")
  middlegame -= evaluationDevelopment(pieces, "black")

  if (position.turn() === "white") {
    middlegame += EVALUATION_TEMPO
    endgame += EVALUATION_TEMPO
  } else {
    middlegame -= EVALUATION_TEMPO
    endgame -= EVALUATION_TEMPO
  }

  return Math.round(
    (middlegame * phase + endgame * (EVALUATION_MAX_PHASE - phase)) /
      EVALUATION_MAX_PHASE
  )
}

function evaluate(position) {
  var whiteScore

  if (!position || typeof position.board !== "function" ||
      typeof position.turn !== "function")
    throw new Error("Evaluation: position must implement board() and turn()")

  whiteScore = evaluationWhiteScore(position)
  return position.turn() === "white" ? whiteScore : -whiteScore
}

var Evaluation = {
  evaluate: evaluate,
  whiteScore: evaluationWhiteScore,
  values: EVALUATION_VALUES,
  mate_score: 1000000
}

export {
  evaluate,
  evaluationWhiteScore as whiteScore,
  EVALUATION_VALUES as values
}
