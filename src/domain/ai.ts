import {
  cost,
  evolvedDefinition,
  growthStages,
  growthCost,
  summonedDefinition,
  transformedDefinition,
} from "./cost";
import { allLegal, isRoyal, placeSummon, play } from "./game";
import {
  idx,
  inside,
  other,
  type AIDifficulty,
  type Color,
  type Definition,
  type Match,
  type Move,
  type Piece,
} from "./types";
import type { EvolutionCondition, Pos } from "./types";

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
  raptor: 900,
  crow: 750,
  demon: 1000,
  hound: 450,
  boar: 500,
  piglet: 175,
};

function activeDefinition(piece: Piece, definition: Definition) {
  if (piece.summoned && definition.summoning) return summonedDefinition(definition);
  if (piece.evolved && definition.transformation) return transformedDefinition(definition);
  const stage = piece.growthStage ?? (piece.evolved ? 1 : 0);
  if (definition.growth && stage) return evolvedDefinition(definition, stage);
  return { ...definition, growth: undefined, transformation: undefined, summoning: undefined };
}

export function pieceValue(piece: Piece, defs: Definition[]) {
  if (piece.role === "king") return 0;
  if (piece.role !== "custom") return standardValue[piece.role];
  const definition = defs.find((item) => item.id === piece.definitionId);
  if (!definition) return 100;
  const movementCost = cost({ ...activeDefinition(piece, definition), isCrown: false });
  return Math.max(100, Math.round((movementCost * 100) / 3));
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
function nearbyEnemyCount(match: Match, center: Pos, color: Color, radius: number) {
  return match.board.filter((piece, index) => {
    if (piece?.color !== other(color)) return false;
    const row = Math.floor(index / 8), col = index % 8;
    return Math.max(Math.abs(row - center.row), Math.abs(col - center.col)) <= radius;
  }).length;
}

function conditionProgress(condition: EvolutionCondition, piece: Piece, position: Pos, match: Match) {
  const own = match.stats?.[piece.color] ?? { captures: 0, losses: 0, evolutions: 0, kingDepth: 8 };
  const foe = match.stats?.[other(piece.color)] ?? { captures: 0, losses: 0, evolutions: 0, kingDepth: 8 };
  if (condition.kind === "captures")
    return clamp01((condition.subject === "self" ? piece.captures ?? 0 : own.captures) / condition.threshold);
  if (condition.kind === "losses") return clamp01(own.losses / condition.threshold);
  if (condition.kind === "evolutions")
    return clamp01((condition.side === "ally" ? own.evolutions : foe.evolutions) / condition.threshold);
  if (condition.kind === "territory") {
    const depth = condition.subject === "self" ? piece.reachedEnemyDepth ?? 8 : own.kingDepth;
    return clamp01((8 - depth) / Math.max(1, 8 - condition.depth));
  }
  const center = condition.center === "self"
    ? position
    : (() => {
        const index = match.board.findIndex((item) => item?.color === piece.color && item.role === "king");
        return index < 0 ? null : { row: Math.floor(index / 8), col: index % 8 };
      })();
  return center ? clamp01(nearbyEnemyCount(match, center, piece.color, condition.radius) / condition.threshold) : 0;
}

const capturedPiece = (match: Match, move: Move) => {
  if (move.swap) return null;
  if (move.chain?.length) {
    let state = match;
    for (const step of move.chain) {
      const captured = step.passCaptureAt
        ? state.board[idx(step.passCaptureAt)]
        : step.swap || step.transit || step.stationary
          ? null
          : state.board[idx(step.to)];
      if (captured) return captured;
      state = playFirst(state, step);
    }
    return null;
  }
  const afterFirst = move.next ? playFirst(match, move) : null;
  return move.next
    ? (afterFirst!.board[idx(move.next.to)] ?? match.board[idx(move.to)])
    : match.board[idx(move.to)];
};
const capturedValue = (match: Match, move: Move, defs: Definition[]) => {
  const captured = capturedPiece(match, move);
  return captured ? pieceValue(captured, defs) : 0;
};

function playFirst(match: Match, move: Move) {
  if (move.transit) return match;
  const board = [...match.board];
  const piece = board[idx(move.from)]!;
  if (move.stationary) board[idx(move.to)] = null;
  else {
    board[idx(move.from)] = null;
    board[idx(move.to)] = { ...piece, moved: true };
  }
  return { ...match, board };
}

export interface EvaluationBreakdown {
  material: number;
  position: number;
  mobility: number;
  pressure: number;
  safety: number;
  royal: number;
  evolution: number;
  abilities: number;
  total: number;
}

function evolutionExpectation(
  match: Match,
  piece: Piece,
  position: Pos,
  definition: Definition,
  survival: number,
  moves: Move[],
) {
  const baseDefinition = { ...definition, growth: undefined, transformation: undefined, summoning: undefined, isCrown: false };
  const baseCost = cost(baseDefinition);
  if (definition.growth) {
    const current = piece.growthStage ?? (piece.evolved ? 1 : 0);
    const pricing = growthCost({ ...definition, isCrown: false });
    const stages = growthStages(definition.growth);
    return pricing.stages.slice(current).reduce((sum, stage, offset) =>
      sum + stage.gap * (100 / 3) * conditionProgress(stages[current + offset].condition, piece, position, match) * survival, 0);
  }
  if (!piece.evolved && definition.transformation) {
    const gap = Math.max(0, cost({ ...transformedDefinition(definition), isCrown: false }) - baseCost);
    return gap * (100 / 3) * conditionProgress(definition.transformation.condition, piece, position, match) * survival;
  }
  if (!piece.evolved && definition.summoning) {
    const derived = cost({ ...summonedDefinition(definition), isCrown: false });
    const emptyAdjacent = [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => ({ dx, dy })))
      .filter(({ dx, dy }) => (dx || dy) && position.row + dy >= 0 && position.row + dy < 8 && position.col + dx >= 0 && position.col + dx < 8 && !match.board[idx({ row: position.row + dy, col: position.col + dx })]).length;
    const success = definition.summoning.range === "movement"
      ? clamp01(moves.filter((move) => !match.board[idx(move.to)]).length / 4)
      : emptyAdjacent / 8;
    const gain = definition.summoning.timing === "split" ? Math.max(0, derived * 2 - baseCost) : derived;
    return gain * (100 / 3) * conditionProgress(definition.summoning.condition, piece, position, match) * survival * success;
  }
  if (piece.evolved && !piece.summoned && definition.summoning?.timing === "inherit") {
    const derived = cost({ ...summonedDefinition(definition), isCrown: false });
    return derived * (100 / 3) * (survival < 1 ? 0.75 : 0.25);
  }
  return 0;
}

export function evaluateBreakdown(match: Match, defs: Definition[]): EvaluationBreakdown {
  const terminal = match.winner ? (match.winner === "black" ? WIN : -WIN) : match.draw ? 0 : null;
  if (terminal !== null)
    return { material: terminal, position: 0, mobility: 0, pressure: 0, safety: 0, royal: 0, evolution: 0, abilities: 0, total: terminal };
  const movesByColor = {
    white: allLegal({ ...match, turn: "white", winner: null, draw: false }, defs),
    black: allLegal({ ...match, turn: "black", winner: null, draw: false }, defs),
  };
  const attackedIds = {
    white: new Set(movesByColor.black.flatMap((move) => { const captured = capturedPiece(match, move); return captured?.color === "white" ? [captured.id] : []; })),
    black: new Set(movesByColor.white.flatMap((move) => { const captured = capturedPiece(match, move); return captured?.color === "black" ? [captured.id] : []; })),
  };
  const enemyDestinations = {
    white: new Set(movesByColor.black.map((move) => `${move.next?.to.row ?? move.to.row},${move.next?.to.col ?? move.to.col}`)),
    black: new Set(movesByColor.white.map((move) => `${move.next?.to.row ?? move.to.row},${move.next?.to.col ?? move.to.col}`)),
  };
  const result: EvaluationBreakdown = { material: (match.lost.white - match.lost.black) * 1_500, position: 0, mobility: 0, pressure: 0, safety: 0, royal: 0, evolution: 0, abilities: 0, total: 0 };
  result.mobility = (movesByColor.black.length - movesByColor.white.length) * 2;
  for (const color of ["white", "black"] as Color[]) {
    const sign = color === "black" ? 1 : -1;
    const captured = new Set<string>();
    for (const move of movesByColor[color]) {
      const target = capturedPiece(match, move);
      if (target && !captured.has(target.id)) { result.pressure += sign * pieceValue(target, defs) * 0.08; captured.add(target.id); }
    }
  }
  match.board.forEach((piece, index) => {
    if (!piece) return;
    const sign = piece.color === "black" ? 1 : -1;
    const row = Math.floor(index / 8), col = index % 8, position = { row, col };
    const value = pieceValue(piece, defs);
    result.material += sign * value;
    result.position += sign * (7 - (Math.abs(3.5 - row) + Math.abs(3.5 - col))) * 2;
    const attacked = attackedIds[piece.color].has(piece.id);
    const supported = [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => {
      const target = { row: row + dy, col: col + dx };
      return !!(dx || dy) && inside(target) && match.board[idx(target)]?.color === piece.color;
    }));
    if (attacked) result.safety -= sign * value * (supported ? 0.05 : 0.12);
    const pieceMoves = movesByColor[piece.color].filter((move) => idx(move.from) === index);
    const safeMoves = pieceMoves.filter((move) => !enemyDestinations[piece.color].has(`${move.next?.to.row ?? move.to.row},${move.next?.to.col ?? move.to.col}`)).length;
    result.mobility += sign * safeMoves * 2;
    if (isRoyal(piece, defs)) {
      if (attacked) result.royal -= sign * 180;
      result.royal += sign * safeMoves * 12;
    }
    if (piece.role !== "custom") return;
    const definition = defs.find((item) => item.id === piece.definitionId);
    if (!definition) return;
    const survival = attacked ? (supported ? 0.6 : 0.25) : 1;
    result.evolution += sign * evolutionExpectation(match, piece, position, definition, survival, pieceMoves);
    let bonus = 0;
    if (pieceMoves.some((move) => move.stationary)) bonus += 20;
    if (pieceMoves.some((move) => move.next)) bonus += 10;
    if (pieceMoves.some((move) => move.next && !!match.board[idx(move.to)])) bonus += 25;
    if (pieceMoves.some((move) => move.transit)) bonus += 25;
    if (pieceMoves.some((move) => move.swap === "local")) bonus += 10;
    if (pieceMoves.some((move) => move.swap === "global")) bonus += 20;
    const active = activeDefinition(piece, definition);
    if (active.patterns.some((pattern) => pattern.kind === "direction" && (pattern.cannon || pattern.growthCannon)) && pieceMoves.some((move) => capturedPiece(match, move))) bonus += 20;
    result.abilities += sign * bonus;
  });
  result.total = Math.round(result.material + result.position + result.mobility + result.pressure + result.safety + result.royal + result.evolution + result.abilities);
  return result;
}

export function evaluate(match: Match, defs: Definition[]) {
  return evaluateBreakdown(match, defs).total;
}

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
  const maximize = match.turn === "black";
  let best: Move | null = null,
    bestScore = maximize ? -Infinity : Infinity,
    alpha = -Infinity,
    beta = Infinity;
  for (const move of ordered(match, defs)) {
    const score = search(
      play(match, move, defs),
      defs,
      depth - 1,
      alpha,
      beta,
      deadline,
    );
    if (maximize ? score > bestScore : score < bestScore) {
      bestScore = score;
      best = move;
    }
    if (maximize) alpha = Math.max(alpha, score);
    else beta = Math.min(beta, score);
  }
  return best;
}

export function chooseMove(
  match: Match,
  defs: Definition[],
  difficulty: AIDifficulty,
  random = Math.random,
  hardTimeMs = 1_000,
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
  const deadline = performance.now() + hardTimeMs;
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

export function chooseSummonPlacement(match: Match, defs: Definition[]) {
  const candidates = match.pendingSummon?.candidates ?? [];
  if (!candidates.length) return null;
  const maximize = match.pendingSummon!.owner === "black";
  return candidates.reduce((best, candidate) => {
    const score = evaluate(placeSummon(match, candidate), defs);
    const bestScore = evaluate(placeSummon(match, best), defs);
    return maximize ? (score > bestScore ? candidate : best) : score < bestScore ? candidate : best;
  });
}
