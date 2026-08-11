import { cost } from "./cost";
import { allLegal, play, threatened } from "./game";
import {
  idx,
  type AIDifficulty,
  type Color,
  type Definition,
  type Match,
  type Move,
  type Piece,
} from "./types";

const WIN = 1_000_000;
const standardValue: Record<
  Exclude<Piece["role"], "custom" | "king">,
  number
> = {
  pawn: 100,
  knight: 300,
  bishop: 325,
  rook: 500,
  queen: 900,
};

function pieceValue(piece: Piece, defs: Definition[]) {
  if (piece.role === "king") return 0;
  if (piece.role !== "custom") return standardValue[piece.role];
  const definition = defs.find((item) => item.id === piece.definitionId);
  if (!definition) return 100;
  const movementCost = cost({ ...definition, isCrown: false });
  return Math.max(100, Math.round((movementCost * 100) / 3));
}

function mobility(match: Match, color: Color, defs: Definition[]) {
  return allLegal({ ...match, turn: color, winner: null, draw: false }, defs)
    .length;
}

export function evaluate(match: Match, defs: Definition[]) {
  if (match.winner) return match.winner === "black" ? WIN : -WIN;
  if (match.draw) return 0;
  let score = (match.lost.white - match.lost.black) * 1_500;
  match.board.forEach((piece, index) => {
    if (!piece) return;
    const sign = piece.color === "black" ? 1 : -1;
    score += sign * pieceValue(piece, defs);
    const row = Math.floor(index / 8),
      col = index % 8;
    const center = 7 - (Math.abs(3.5 - row) + Math.abs(3.5 - col));
    score += sign * center * 2;
    const definition =
      piece.role === "custom"
        ? defs.find((item) => item.id === piece.definitionId)
        : undefined;
    if (
      (piece.role === "king" || definition?.isCrown) &&
      threatened(
        match,
        { row, col },
        piece.color === "black" ? "white" : "black",
        defs,
      )
    )
      score -= sign * 180;
  });
  return (
    score +
    (mobility(match, "black", defs) - mobility(match, "white", defs)) * 3
  );
}

const capturedValue = (match: Match, move: Move, defs: Definition[]) => {
  const captured = match.board[idx(move.to)];
  return captured ? pieceValue(captured, defs) : 0;
};

function ordered(match: Match, defs: Definition[]) {
  return allLegal(match, defs).sort(
    (a, b) => capturedValue(match, b, defs) - capturedValue(match, a, defs),
  );
}

function search(
  match: Match,
  defs: Definition[],
  depth: number,
  alpha: number,
  beta: number,
  deadline: number,
): number {
  if (performance.now() >= deadline) throw new Error("AI_TIMEOUT");
  if (!depth || match.winner || match.draw) return evaluate(match, defs);
  const moves = ordered(match, defs);
  if (!moves.length) return evaluate(match, defs);
  if (match.turn === "black") {
    let value = -Infinity;
    for (const move of moves) {
      value = Math.max(
        value,
        search(play(match, move, defs), defs, depth - 1, alpha, beta, deadline),
      );
      alpha = Math.max(alpha, value);
      if (alpha >= beta) break;
    }
    return value;
  }
  let value = Infinity;
  for (const move of moves) {
    value = Math.min(
      value,
      search(play(match, move, defs), defs, depth - 1, alpha, beta, deadline),
    );
    beta = Math.min(beta, value);
    if (alpha >= beta) break;
  }
  return value;
}

function bestAtDepth(
  match: Match,
  defs: Definition[],
  depth: number,
  deadline: number,
) {
  let best: Move | null = null,
    bestScore = -Infinity,
    alpha = -Infinity;
  for (const move of ordered(match, defs)) {
    const score = search(
      play(match, move, defs),
      defs,
      depth - 1,
      alpha,
      Infinity,
      deadline,
    );
    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
    alpha = Math.max(alpha, score);
  }
  return best;
}

export function chooseMove(
  match: Match,
  defs: Definition[],
  difficulty: AIDifficulty,
  random = Math.random,
): Move | null {
  const moves = ordered(match, defs);
  if (!moves.length) return null;
  if (difficulty === "easy") {
    const weights = moves.map(
      (move) => 1 + Math.floor(capturedValue(match, move, defs) / 100),
    );
    let pick = random() * weights.reduce((sum, value) => sum + value, 0);
    for (let i = 0; i < moves.length; i++)
      if ((pick -= weights[i]) <= 0) return moves[i];
    return moves.at(-1)!;
  }
  if (difficulty === "normal") return bestAtDepth(match, defs, 2, Infinity);
  const deadline = performance.now() + 1_000;
  let best = moves[0];
  for (let depth = 1; depth <= 8; depth++) {
    try {
      best = bestAtDepth(match, defs, depth, deadline) ?? best;
    } catch (error) {
      if (error instanceof Error && error.message === "AI_TIMEOUT") break;
      throw error;
    }
  }
  return best;
}
