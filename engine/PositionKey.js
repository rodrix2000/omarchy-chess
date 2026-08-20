"use strict"

var PositionKey = (function () {
  var CASTLING_ORDER = "KQkq"

  function fail(message) {
    throw new Error("PositionKey: " + message)
  }

  function canonicalPlacement(placement) {
    var ranks = placement.split("/")
    var canonicalRanks = []
    var rankIndex

    if (ranks.length !== 8) {
      fail("piece placement must contain eight ranks")
    }

    for (rankIndex = 0; rankIndex < ranks.length; rankIndex += 1) {
      var rank = ranks[rankIndex]
      var canonicalRank = ""
      var emptySquares = 0
      var squareCount = 0
      var characterIndex

      for (characterIndex = 0; characterIndex < rank.length; characterIndex += 1) {
        var character = rank.charAt(characterIndex)

        if (/^[1-8]$/.test(character)) {
          emptySquares += Number(character)
          squareCount += Number(character)
        } else if (/^[prnbqkPRNBQK]$/.test(character)) {
          if (emptySquares > 0) {
            canonicalRank += String(emptySquares)
            emptySquares = 0
          }
          canonicalRank += character
          squareCount += 1
        } else {
          fail("piece placement contains an invalid character")
        }
      }

      if (emptySquares > 0) {
        canonicalRank += String(emptySquares)
      }
      if (squareCount !== 8) {
        fail("each piece-placement rank must describe eight squares")
      }

      canonicalRanks.push(canonicalRank)
    }

    return canonicalRanks.join("/")
  }

  function canonicalSide(side) {
    var normalized = String(side).toLowerCase()

    if (normalized !== "w" && normalized !== "b") {
      fail("active color must be 'w' or 'b'")
    }

    return normalized
  }

  function canonicalCastling(castling) {
    var present = {}
    var canonical = ""
    var index

    if (castling === "-") {
      return "-"
    }
    if (!castling || !/^[KQkq]+$/.test(castling)) {
      fail("castling rights must contain only KQkq or '-'")
    }

    for (index = 0; index < castling.length; index += 1) {
      present[castling.charAt(index)] = true
    }
    for (index = 0; index < CASTLING_ORDER.length; index += 1) {
      var right = CASTLING_ORDER.charAt(index)
      if (present[right]) {
        canonical += right
      }
    }

    return canonical || "-"
  }

  function canonicalEnPassant(target, side) {
    var normalized

    if (target === "-") {
      return "-"
    }

    normalized = String(target).toLowerCase()
    if (!/^[a-h][36]$/.test(normalized)) {
      fail("en-passant target must be a square on rank 3 or 6, or '-'")
    }
    if ((side === "w" && normalized.charAt(1) !== "6") ||
        (side === "b" && normalized.charAt(1) !== "3")) {
      fail("en-passant target rank is inconsistent with the active color")
    }

    return normalized
  }

  function parseFen(fen) {
    var fields
    var side

    if (typeof fen !== "string") {
      fail("FEN must be a string")
    }

    fields = fen.trim().split(/\s+/)
    if (fields.length < 4 || fields.length > 6) {
      fail("FEN must contain four to six fields")
    }

    side = canonicalSide(fields[1])
    return {
      placement: canonicalPlacement(fields[0]),
      side: side,
      castling: canonicalCastling(fields[2]),
      nominalEnPassant: canonicalEnPassant(fields[3], side)
    }
  }

  function moveTarget(move) {
    var compact

    if (typeof move === "string") {
      compact = move.trim().toLowerCase()
      if (/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(compact)) {
        return compact.slice(2, 4)
      }
      if (/^[a-h][1-8]$/.test(compact)) {
        return compact
      }
      return null
    }

    if (move && typeof move === "object" && typeof move.to === "string") {
      return move.to.toLowerCase()
    }

    return null
  }

  function movesReachTarget(moves, target) {
    var index

    if (!Array.isArray(moves)) {
      return false
    }
    for (index = 0; index < moves.length; index += 1) {
      if (moveTarget(moves[index]) === target) {
        return true
      }
    }

    return false
  }

  function explicitEffectiveTarget(value, nominalTarget) {
    if (nominalTarget === "-" || value === undefined || value === null || value === false) {
      return "-"
    }
    if (value === true) {
      return nominalTarget
    }
    if (typeof value === "string") {
      var normalized = value.toLowerCase()
      return normalized === nominalTarget ? nominalTarget : "-"
    }
    if (Array.isArray(value)) {
      return movesReachTarget(value, nominalTarget) ? nominalTarget : "-"
    }
    if (typeof value === "object") {
      if (Object.prototype.hasOwnProperty.call(value, "legalEnPassantMoves")) {
        return explicitEffectiveTarget(value.legalEnPassantMoves, nominalTarget)
      }
      if (Object.prototype.hasOwnProperty.call(value, "effectiveEnPassant")) {
        return explicitEffectiveTarget(value.effectiveEnPassant, nominalTarget)
      }
      if (Object.prototype.hasOwnProperty.call(value, "effective_en_passant")) {
        return explicitEffectiveTarget(value.effective_en_passant, nominalTarget)
      }
      if (Object.prototype.hasOwnProperty.call(value, "target")) {
        return explicitEffectiveTarget(value.target, nominalTarget)
      }
      return moveTarget(value) === nominalTarget ? nominalTarget : "-"
    }

    return "-"
  }

  function flagIsEnPassant(flag) {
    var normalized = String(flag).toLowerCase()
    return normalized === "en-passant" || normalized === "en_passant" ||
      normalized === "enpassant" || normalized === "ep" || normalized === "e"
  }

  function moveIsEnPassant(move) {
    var flags
    var index

    if (!move || typeof move !== "object") {
      return false
    }
    if (move.enPassant === true || move.isEnPassant === true || move.is_en_passant === true) {
      return true
    }

    flags = move.flags !== undefined ? move.flags : move.flag
    if (Array.isArray(flags)) {
      for (index = 0; index < flags.length; index += 1) {
        if (flagIsEnPassant(flags[index])) {
          return true
        }
      }
      return false
    }

    return flags !== undefined && flagIsEnPassant(flags)
  }

  function legalEnPassantMoves(rules) {
    var moves
    var enPassantMoves = []
    var index

    if (typeof rules.legalEnPassantMoves === "function") {
      return rules.legalEnPassantMoves()
    }
    if (typeof rules.legalMoves !== "function") {
      fail("rules adapter cannot provide legal moves for en-passant identity")
    }

    moves = rules.legalMoves({ verbose: true })
    if (!Array.isArray(moves)) {
      fail("rules adapter legalMoves() must return an array")
    }
    for (index = 0; index < moves.length; index += 1) {
      if (moveIsEnPassant(moves[index])) {
        enPassantMoves.push(moves[index])
      }
    }

    return enPassantMoves
  }

  function rulesEffectiveEnPassant(rules) {
    if (typeof rules.effectiveEnPassant === "function") {
      return rules.effectiveEnPassant()
    }
    if (typeof rules.effectiveEnPassantSquare === "function") {
      return rules.effectiveEnPassantSquare()
    }
    if (Object.prototype.hasOwnProperty.call(rules, "effectiveEnPassant")) {
      return rules.effectiveEnPassant
    }
    if (Object.prototype.hasOwnProperty.call(rules, "effectiveEnPassantSquare")) {
      return rules.effectiveEnPassantSquare
    }

    return legalEnPassantMoves(rules)
  }

  function fromFen(fen, effectiveEnPassant) {
    var parsed = parseFen(fen)
    var effectiveTarget = explicitEffectiveTarget(
      effectiveEnPassant,
      parsed.nominalEnPassant
    )

    return parsed.placement + " " + parsed.side + " " + parsed.castling + " " + effectiveTarget
  }

  function fromRules(rules) {
    var fen
    var parsed

    if (!rules || typeof rules.fen !== "function") {
      fail("rules adapter must provide fen()")
    }

    fen = rules.fen()
    parsed = parseFen(fen)
    if (parsed.nominalEnPassant === "-") {
      return fromFen(fen, false)
    }

    return fromFen(fen, rulesEffectiveEnPassant(rules))
  }

  return {
    fromFen: fromFen,
    fromRules: fromRules
  }
}())

function fromFen(fen, effectiveEnPassant) {
  return PositionKey.fromFen(fen, effectiveEnPassant)
}

function fromRules(rules) {
  return PositionKey.fromRules(rules)
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = PositionKey
}
