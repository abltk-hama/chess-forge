import { chooseMove, chooseSummonPlacement } from "./ai";
import { createMatch, isRoyal, pieceText, placeSummon, play, threatened } from "./game";
import type { AIDifficulty, Color, Definition, Match, Piece, PieceSimulationStat, Setup, SimulationResult } from "./types";

export interface SimulationOptions { games: number; whiteDifficulty: AIDifficulty; blackDifficulty: AIDifficulty; maxPlies: number; seed: number; swapSides?: boolean; thinkTimeMs?: 10 | 25 | 100; }
const rng = (seed: number) => { let value = seed >>> 0; return () => ((value = (value * 1664525 + 1013904223) >>> 0) / 4294967296); };
const statKey = (piece: Piece) => `${piece.role === "custom" ? piece.definitionId : piece.role}${piece.summoned ? ":summoned" : ""}`;
const statLabel = (piece: Piece, defs: Definition[]) => piece.role === "custom" ? `${pieceText(piece, defs).toUpperCase()}${piece.summoned ? " 派生" : ""}` : piece.role;
const ensure = (map: Map<string, PieceSimulationStat>, piece: Piece, defs: Definition[]) => {
  const key = statKey(piece);
  if (!map.has(key)) map.set(key, { key, label: statLabel(piece, defs), appearances: 0, generated: 0, captures: 0, losses: 0, survivors: 0, checks: 0, mates: 0, evolutions: 0, summons: 0 });
  return map.get(key)!;
};
const royalPositions = (match: Match, color: Color, defs: Definition[]) => match.board.flatMap((piece, index) => piece?.color === color && isRoyal(piece, defs) ? [{ row: Math.floor(index / 8), col: index % 8 }] : []);

export function runSimulation(defs: Definition[], setup: Setup, preset: Match["preset"], options: SimulationOptions, progress?: (done: number, partial: SimulationResult) => void): SimulationResult {
  const stats = new Map<string, PieceSimulationStat>(), games: SimulationResult["games"] = [];
  let whiteWins = 0, blackWins = 0, draws = 0;
  for (let gameIndex = 0; gameIndex < options.games; gameIndex++) {
    const seed = options.seed + gameIndex, random = rng(seed);
    let match = createMatch(defs, setup, preset), plies = 0;
    match.board.forEach((piece) => { if (piece) ensure(stats, piece, defs).appearances++; });
    while (!match.winner && !match.draw && plies < options.maxPlies) {
      while (match.pendingSummon) {
        const candidate = chooseSummonPlacement(match, defs);
        if (!candidate) break;
        const beforeIds = new Set(match.board.flatMap((piece) => piece ? [piece.id] : []));
        match = placeSummon(match, candidate);
        match.board.forEach((piece) => { if (piece && !beforeIds.has(piece.id)) { const stat = ensure(stats, piece, defs); stat.generated++; stat.summons++; } });
      }
      const swapped = !!options.swapSides && gameIndex >= Math.ceil(options.games / 2);
      const whiteDifficulty = swapped ? options.blackDifficulty : options.whiteDifficulty;
      const blackDifficulty = swapped ? options.whiteDifficulty : options.blackDifficulty;
      const movingColor = match.turn, move = chooseMove(match, defs, movingColor === "white" ? whiteDifficulty : blackDifficulty, random, options.thinkTimeMs ?? 25);
      if (!move) { match = { ...match, draw: true, message: "合法手がありません。" }; break; }
      const mover = match.board[move.from.row * 8 + move.from.col]!;
      const before = new Map(match.board.flatMap((piece) => piece ? [[piece.id, piece] as const] : []));
      const wasStage = mover.growthStage ?? (mover.evolved ? 1 : 0);
      match = play(match, move, defs); plies++;
      const afterIds = new Set(match.board.flatMap((piece) => piece ? [piece.id] : []));
      before.forEach((piece, id) => { if (!afterIds.has(id)) { ensure(stats, piece, defs).losses++; if (piece.color !== movingColor) ensure(stats, mover, defs).captures++; } });
      const movedNow = match.board.find((piece) => piece?.id === mover.id);
      const nowStage = movedNow?.growthStage ?? (movedNow?.evolved ? 1 : 0);
      if (nowStage > wasStage) ensure(stats, mover, defs).evolutions += nowStage - wasStage;
      const enemy = movingColor === "white" ? "black" : "white";
      if (royalPositions(match, enemy, defs).some((pos) => threatened(match, pos, movingColor, defs))) ensure(stats, movedNow ?? mover, defs).checks++;
      if (match.winner === movingColor && match.message.includes("メイト")) ensure(stats, movedNow ?? mover, defs).mates++;
    }
    if (!match.winner && !match.draw) match = { ...match, draw: true, message: "最大手数に到達しました。" };
    match.board.forEach((piece) => { if (piece) ensure(stats, piece, defs).survivors++; });
    if (match.winner === "white") whiteWins++; else if (match.winner === "black") blackWins++; else draws++;
    games.push({ winner: match.winner, draw: match.draw, plies, reason: match.message, seed, history: match.history });
    progress?.(gameIndex + 1, { id: `sim-${options.seed}`, createdAt: new Date().toISOString(), gamesRequested: options.games, gamesCompleted: games.length, whiteDifficulty: options.whiteDifficulty, blackDifficulty: options.blackDifficulty, maxPlies: options.maxPlies, thinkTimeMs: options.thinkTimeMs ?? 25, whiteWins, blackWins, draws, games: [...games], pieces: [...stats.values()].map((item) => ({ ...item })), definitions: structuredClone(defs), setup: structuredClone(setup), preset });
  }
  return { id: `sim-${Date.now()}`, createdAt: new Date().toISOString(), gamesRequested: options.games, gamesCompleted: games.length, whiteDifficulty: options.whiteDifficulty, blackDifficulty: options.blackDifficulty, maxPlies: options.maxPlies, thinkTimeMs: options.thinkTimeMs ?? 25, whiteWins, blackWins, draws, games, pieces: [...stats.values()], definitions: structuredClone(defs), setup: structuredClone(setup), preset };
}
