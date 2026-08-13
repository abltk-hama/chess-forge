import type {
  Color,
  Definition,
  Match,
  Move,
  Piece,
  Pos,
  Preset,
  Role,
  Setup,
  Usage,
  Vec,
} from "./types";
import { idx, inside, other } from "./types";
import { formationFromSetup } from "./formation";
import { jumpLimit } from "./cost";
import type { EvolutionCondition } from "./types";
const back: Role[] = [
  "rook",
  "knight",
  "bishop",
  "queen",
  "king",
  "bishop",
  "knight",
  "rook",
];
const label: Record<Exclude<Role, "custom">, string> = {
  king: "KI",
  queen: "QU",
  rook: "RO",
  bishop: "BI",
  knight: "KN",
  pawn: "PO",
};
const at = (s: Match, p: Pos) => (inside(p) ? s.board[idx(p)] : null);
const eq = (a: Pos, b: Pos) => a.row === b.row && a.col === b.col;
export function createMatch(
  defs: Definition[],
  setup: Setup,
  preset: Preset,
): Match {
  const board: (Piece | null)[] = Array(64).fill(null);
  const formation = formationFromSetup(setup);
  let id = 0;
  for (const color of ["black", "white"] as Color[]) {
    const r = color === "black" ? 0 : 7,
      pr = color === "black" ? 1 : 6;
    back.forEach((role, col) => {
      const custom = formation[col],
        pawnCustom = formation[8 + col];
      board[idx({ row: r, col })] = {
        id: `p${id++}`,
        color,
        role: custom ? "custom" : role,
        definitionId: custom || undefined,
        moved: false,
      };
      board[idx({ row: pr, col })] = {
        id: `p${id++}`,
        color,
        role: pawnCustom ? "custom" : "pawn",
        definitionId: pawnCustom || undefined,
        moved: false,
      };
    });
  }
  const crowns = formation.filter(
    (id) => defs.find((definition) => definition.id === id)?.isCrown,
  ).length;
  return {
    board,
    turn: "white",
    preset,
    enPassant: null,
    lost: { white: 0, black: 0 },
    targets: { white: 1 + crowns, black: 1 + crowns },
    history: [],
    winner: null,
    draw: false,
    message: "白の手番です。",
    stats: {
      white: { captures: 0, losses: 0, evolutions: 0, kingDepth: 8 },
      black: { captures: 0, losses: 0, evolutions: 0, kingDepth: 8 },
    },
  };
}
function rays(
  s: Match,
  from: Pos,
  color: Color,
  vectors: Vec[],
  max: number,
  jumpAllies = 0,
  jumpEnemies = 0,
  usage: Usage = "both",
) {
  const out: Move[] = [];
  for (const v of vectors) {
    let alliesPassed = 0,
      enemiesPassed = 0;
    for (let n = 1; n <= max; n++) {
      const to = { row: from.row + v.dy * n, col: from.col + v.dx * n };
      if (!inside(to)) break;
      const t = at(s, to);
      if (!t) {
        if (usage !== "capture" && usage !== "stationary")
          out.push({ from, to });
      } else {
        if (t.color !== color && usage !== "move")
          out.push({ from, to, stationary: usage === "stationary" });
        if (t.color === color) {
          alliesPassed++;
          if (alliesPassed > jumpAllies) break;
        } else {
          enemiesPassed++;
          if (enemiesPassed > jumpEnemies) break;
        }
      }
    }
  }
  return out;
}
function cannonRays(
  s: Match,
  from: Pos,
  color: Color,
  vectors: Vec[],
  max: number,
  usage: Usage,
) {
  const out: Move[] = [];
  for (const v of vectors) {
    let screen = false;
    for (let n = 1; n <= max; n++) {
      const to = { row: from.row + v.dy * n, col: from.col + v.dx * n };
      if (!inside(to)) break;
      const target = at(s, to);
      if (!screen) {
        if (!target) {
          if (usage !== "capture") out.push({ from, to });
        } else screen = true;
      } else if (target) {
        if (target.color !== color && usage !== "move") out.push({ from, to });
        break;
      }
    }
  }
  return out;
}
const orth = [
    { dx: 0, dy: -1 },
    { dx: 1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
  ],
  diag = [
    { dx: 1, dy: -1 },
    { dx: 1, dy: 1 },
    { dx: -1, dy: 1 },
    { dx: -1, dy: -1 },
  ];
function standard(s: Match, from: Pos, p: Piece): Move[] {
  if (p.role === "rook") return rays(s, from, p.color, orth, 7);
  if (p.role === "bishop") return rays(s, from, p.color, diag, 7);
  if (p.role === "queen") return rays(s, from, p.color, [...orth, ...diag], 7);
  if (p.role === "knight")
    return rays(
      s,
      from,
      p.color,
      [
        { dx: 1, dy: 2 },
        { dx: 2, dy: 1 },
        { dx: 2, dy: -1 },
        { dx: 1, dy: -2 },
        { dx: -1, dy: -2 },
        { dx: -2, dy: -1 },
        { dx: -2, dy: 1 },
        { dx: -1, dy: 2 },
      ],
      1,
      2,
      2,
    );
  if (p.role === "king") {
    const m = rays(s, from, p.color, [...orth, ...diag], 1);
    if (!p.moved)
      for (const [c, side] of [
        [7, "king"],
        [0, "queen"],
      ] as const) {
        const r = at(s, { row: from.row, col: c }),
          between = side === "king" ? [5, 6] : [1, 2, 3];
        if (
          r?.role === "rook" &&
          !r.moved &&
          between.every((x) => !at(s, { row: from.row, col: x }))
        )
          m.push({
            from,
            to: { row: from.row, col: side === "king" ? 6 : 2 },
            castle: side,
          });
      }
    return m;
  }
  if (p.role === "pawn") {
    const d = p.color === "white" ? -1 : 1,
      m: Move[] = [];
    const one = { row: from.row + d, col: from.col };
    if (inside(one) && !at(s, one)) {
      m.push({ from, to: one, promotion: one.row === 0 || one.row === 7 });
      const two = { row: from.row + d * 2, col: from.col };
      if (!p.moved && !at(s, two)) m.push({ from, to: two });
    }
    for (const dx of [-1, 1]) {
      const to = { row: from.row + d, col: from.col + dx },
        t = at(s, to);
      if (t?.color === other(p.color))
        m.push({ from, to, promotion: to.row === 0 || to.row === 7 });
      else if (s.enPassant && eq(s.enPassant, to))
        m.push({ from, to, enPassant: true });
    }
    return m;
  }
  return [];
}
export function pseudo(
  s: Match,
  from: Pos,
  defs: Definition[],
  phase: 1 | 2 = 1,
) {
  const p = at(s, from);
  if (!p) return [];
  if (p.role !== "custom") return standard(s, from, p);
  const d = defs.find((x) => x.id === p.definitionId);
  if (!d) return [];
  const out: Move[] = [];
  for (const [patternIndex, pattern] of d.patterns.entries()) {
    if ((pattern.phase ?? 1) !== phase) continue;
    if (pattern.initialOnly && p.moved) continue;
    const sign = p.color === "white" ? 1 : -1,
      v = pattern.vectors.map((x) => ({ dx: x.dx, dy: x.dy * sign }));
    const max =
      pattern.kind === "leap"
        ? 1
        : pattern.range === "slide"
          ? 7
          : pattern.range;
    const unlock = p.evolved ? d.growth?.unlocks[patternIndex] : undefined;
    const usage =
      unlock?.capture && (pattern.usage ?? "both") === "move"
        ? "both"
        : (pattern.usage ?? "both");
    const additiveCannon = pattern.kind === "direction" && !!unlock?.cannon;
    const additiveStationary = !!unlock?.stationary;
    if (pattern.kind === "direction" && pattern.cannon) {
      out.push(
        ...cannonRays(s, from, p.color, v, max, usage),
      );
      continue;
    }
    out.push(
      ...rays(
        s,
        from,
        p.color,
        v,
        max,
        pattern.kind === "leap"
          ? 2
          : Math.max(
              jumpLimit(pattern.jumpAllies, pattern.canJump),
              unlock?.jumpAllies ?? 0,
            ),
        pattern.kind === "leap"
          ? 2
          : Math.max(
              jumpLimit(pattern.jumpEnemies, pattern.canJump),
              unlock?.jumpEnemies ?? 0,
            ),
        usage,
      ),
    );
    if (additiveCannon)
      out.push(...cannonRays(s, from, p.color, v, max, "capture"));
    if (additiveStationary)
      out.push(
        ...rays(
          s,
          from,
          p.color,
          v,
          max,
          pattern.kind === "leap"
            ? 2
            : Math.max(
                jumpLimit(pattern.jumpAllies, pattern.canJump),
                unlock?.jumpAllies ?? 0,
              ),
          pattern.kind === "leap"
            ? 2
            : Math.max(
                jumpLimit(pattern.jumpEnemies, pattern.canJump),
                unlock?.jumpEnemies ?? 0,
              ),
          "stationary",
        ),
      );
  }
  return [
    ...new Map(
      out.map((x) => [`${x.to.row},${x.to.col},${!!x.stationary}`, x]),
    ).values(),
  ];
}
const king = (s: Match, c: Color) => {
  const i = s.board.findIndex((p) => p?.color === c && p.role === "king");
  return i < 0 ? null : { row: Math.floor(i / 8), col: i % 8 };
};
export const isRoyal = (piece: Piece, definitions: Definition[]) => {
  if (piece.role === "king") return true;
  if (piece.role !== "custom") return false;
  const definition = definitions.find((item) => item.id === piece.definitionId);
  return !!(
    definition?.isCrown ||
    (piece.evolved && definition?.growth?.unlockCrown)
  );
};
export const threatened = (s: Match, target: Pos, by: Color, d: Definition[]) =>
  s.board.some((piece, i) => {
    if (piece?.color !== by) return false;
    const from = { row: Math.floor(i / 8), col: i % 8 };
    const first = pseudo(s, from, d);
    if (first.some((move) => eq(move.to, target))) return true;
    if (piece.role !== "custom") return false;
    const definition = d.find((item) => item.id === piece.definitionId);
    if (!definition?.patterns.some((pattern) => pattern.phase === 2))
      return false;
    return first.some((move) => {
      if (at(s, move.to)) return false;
      const afterFirst = raw(s, move);
      const secondFrom = move.stationary ? from : move.to;
      return pseudo(afterFirst, secondFrom, d, 2).some((next) =>
        eq(next.to, target),
      );
    });
  });

export interface RangeMark {
  to: Pos;
  move: boolean;
  capture: boolean;
  stationary: boolean;
  second: boolean;
}

function captureSquares(
  s: Match,
  from: Pos,
  d: Definition[],
  phase: 1 | 2 = 1,
) {
  const piece = at(s, from);
  if (!piece) return [];
  const enemy = other(piece.color);
  const targets: { to: Pos; stationary: boolean }[] = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const to = { row, col };
      if (eq(from, to)) continue;
      const board = [...s.board];
      board[idx(to)] = {
        id: "__range_target__",
        color: enemy,
        role: "pawn",
        moved: true,
      };
      const move = pseudo({ ...s, board }, from, d, phase).find((candidate) =>
        eq(candidate.to, to),
      );
      if (move) targets.push({ to, stationary: !!move.stationary });
    }
  }
  return targets;
}

/** Occupancy-aware movement and hypothetical capture reach for UI inspection. */
export function inspectRange(s: Match, from: Pos, d: Definition[]) {
  const marks = new Map<string, RangeMark>();
  const add = (to: Pos, values: Partial<Omit<RangeMark, "to">>) => {
    const key = `${to.row},${to.col}`;
    const current = marks.get(key) ?? {
      to,
      move: false,
      capture: false,
      stationary: false,
      second: false,
    };
    marks.set(key, { ...current, ...values });
  };
  const first = pseudo(s, from, d);
  first.forEach((move) => {
    if (!at(s, move.to)) add(move.to, { move: true });
  });
  captureSquares(s, from, d).forEach(({ to, stationary }) =>
    add(to, { capture: true, stationary }),
  );

  const piece = at(s, from);
  const definition =
    piece?.role === "custom"
      ? d.find((item) => item.id === piece.definitionId)
      : undefined;
  if (!definition?.patterns.some((pattern) => pattern.phase === 2))
    return [...marks.values()];

  for (const firstMove of first) {
    const afterFirst = raw(s, firstMove);
    const secondFrom = firstMove.stationary ? from : firstMove.to;
    pseudo(afterFirst, secondFrom, d, 2).forEach((move) => {
      if (!at(afterFirst, move.to)) add(move.to, { move: true, second: true });
    });
    if (!at(s, firstMove.to)) {
      captureSquares(afterFirst, secondFrom, d, 2).forEach(
        ({ to, stationary }) =>
          add(to, { capture: true, stationary, second: true }),
      );
    }
  }
  return [...marks.values()];
}
function raw(s: Match, m: Move) {
  const b = [...s.board],
    p = b[idx(m.from)]!;
  if (m.stationary) {
    b[idx(m.to)] = null;
    b[idx(m.from)] = { ...p, moved: true };
    return { ...s, board: b };
  }
  if (m.enPassant) b[idx({ row: m.from.row, col: m.to.col })] = null;
  b[idx(m.from)] = null;
  b[idx(m.to)] = { ...p, role: m.promotion ? "queen" : p.role, moved: true };
  if (m.castle) {
    const f = { row: m.from.row, col: m.castle === "king" ? 7 : 0 },
      t = { row: m.from.row, col: m.castle === "king" ? 5 : 3 },
      r = b[idx(f)]!;
    b[idx(f)] = null;
    b[idx(t)] = { ...r, moved: true };
  }
  return { ...s, board: b };
}
export function legal(s: Match, from: Pos, d: Definition[]) {
  const p = at(s, from);
  if (!p || p.color !== s.turn || s.winner || s.draw) return [];
  const first = pseudo(s, from, d);
  const base =
    s.preset !== "classic"
      ? first
      : first.filter((x) => {
          if (x.castle) {
            const step = x.castle === "king" ? 1 : -1;
            if (
              [0, 1, 2].some((n) =>
                threatened(
                  s,
                  { row: from.row, col: from.col + step * n },
                  other(p.color),
                  d,
                ),
              )
            )
              return false;
          }
          const n = raw(s, x),
            k = king(n, p.color);
          return !!k && !threatened(n, k, other(p.color), d);
        });
  if (p.role !== "custom") return base;
  const definition = d.find((item) => item.id === p.definitionId);
  if (!definition?.patterns.some((pattern) => pattern.phase === 2)) return base;
  const combined: Move[] = [...base];
  for (const firstMove of base) {
    const afterFirst = raw(s, firstMove);
    const secondFrom = firstMove.stationary ? from : firstMove.to;
    const capturedFirst = !!at(s, firstMove.to);
    for (const secondMove of pseudo(afterFirst, secondFrom, d, 2)) {
      if (capturedFirst && at(afterFirst, secondMove.to)) continue;
      const afterSecond = raw(afterFirst, secondMove);
      if (s.preset === "classic") {
        const k = king(afterSecond, p.color);
        if (!k || threatened(afterSecond, k, other(p.color), d)) continue;
      }
      combined.push({ ...firstMove, next: secondMove });
    }
  }
  return combined;
}
export function allLegal(s: Match, d: Definition[]) {
  return s.board.flatMap((piece, i) =>
    piece?.color === s.turn
      ? legal(s, { row: Math.floor(i / 8), col: i % 8 }, d)
      : [],
  );
}
const defaultStats = () => ({
  white: { captures: 0, losses: 0, evolutions: 0, kingDepth: 8 },
  black: { captures: 0, losses: 0, evolutions: 0, kingDepth: 8 },
});
const enemyDepth = (color: Color, position: Pos) =>
  color === "white" ? position.row + 1 : 8 - position.row;
function nearbyEnemyCount(s: Match, center: Pos, color: Color, radius: number) {
  return s.board.filter((piece, index) => {
    if (piece?.color !== other(color)) return false;
    const row = Math.floor(index / 8),
      col = index % 8;
    return Math.max(Math.abs(row - center.row), Math.abs(col - center.col)) <= radius;
  }).length;
}
function conditionMet(
  condition: EvolutionCondition,
  piece: Piece,
  position: Pos,
  match: Match,
  stats: ReturnType<typeof defaultStats>,
) {
  const own = stats[piece.color],
    foe = stats[other(piece.color)];
  if (condition.kind === "captures")
    return (condition.subject === "self" ? piece.captures ?? 0 : own.captures) >= condition.threshold;
  if (condition.kind === "losses") return own.losses >= condition.threshold;
  if (condition.kind === "territory")
    return (condition.subject === "self" ? piece.reachedEnemyDepth ?? 8 : own.kingDepth) <= condition.depth;
  if (condition.kind === "evolutions")
    return (condition.side === "ally" ? own.evolutions : foe.evolutions) >= condition.threshold;
  const center =
    condition.center === "self" ? position : king(match, piece.color);
  return !!center && nearbyEnemyCount(match, center, piece.color, condition.radius) >= condition.threshold;
}
function applyGrowth(match: Match, definitions: Definition[], statsSnapshot: ReturnType<typeof defaultStats>) {
  const board = [...match.board],
    evolved = { white: 0, black: 0 };
  board.forEach((piece, index) => {
    if (!piece || piece.role !== "custom" || piece.evolved) return;
    const definition = definitions.find((item) => item.id === piece.definitionId);
    if (!definition?.growth) return;
    const position = { row: Math.floor(index / 8), col: index % 8 };
    if (!conditionMet(definition.growth.condition, piece, position, match, statsSnapshot)) return;
    board[index] = { ...piece, evolved: true };
    evolved[piece.color]++;
  });
  if (!evolved.white && !evolved.black) return match;
  const stats = structuredClone(match.stats ?? defaultStats()),
    targets = { ...match.targets };
  for (const color of ["white", "black"] as Color[]) {
    stats[color].evolutions += evolved[color];
    const newCrowns = board.filter((piece, index) => {
      const before = match.board[index];
      if (!piece || !before || piece.color !== color || before.evolved || !piece.evolved) return false;
      const definition = definitions.find((item) => item.id === piece.definitionId);
      return !!definition?.growth?.unlockCrown;
    }).length;
    targets[color] += newCrowns;
  }
  return { ...match, board, stats, targets };
}
export function play(s: Match, m: Move, d: Definition[]) {
  const p = at(s, m.from)!,
    captures = [at(s, m.to), m.next ? at(raw(s, m), m.next.to) : null].filter(
      Boolean,
    ) as Piece[],
    enemy = other(p.color),
    royalCaptures = captures.filter((cap) => isRoyal(cap, d));
  let n = raw(s, m);
  if (m.next) n = raw(n, m.next);
  const stats = structuredClone(s.stats ?? defaultStats()),
    capturedCount = captures.length;
  stats[p.color].captures += capturedCount;
  stats[enemy].losses += capturedCount;
  const movingIndex = n.board.findIndex((piece) => piece?.id === p.id);
  if (movingIndex >= 0) {
    const moving = n.board[movingIndex]!;
    const firstPosition = m.stationary ? m.from : m.to;
    const positions = [
      firstPosition,
      ...(m.next ? [m.next.stationary ? firstPosition : m.next.to] : []),
    ];
    const reached = Math.min(
      moving.reachedEnemyDepth ?? 8,
      ...positions.map((position) => enemyDepth(p.color, position)),
    );
    n.board[movingIndex] = {
      ...moving,
      captures: (moving.captures ?? 0) + capturedCount,
      reachedEnemyDepth: reached,
    };
    if (p.role === "king") stats[p.color].kingDepth = Math.min(stats[p.color].kingDepth, reached);
  }
  n = { ...n, stats };
  if (royalCaptures.length)
    n.lost = { ...n.lost, [enemy]: n.lost[enemy] + royalCaptures.length };
  const statsSnapshot = structuredClone(stats);
  n = applyGrowth(n, d, statsSnapshot);
  const win =
    s.preset === "royal-all"
      ? n.lost[enemy] >= n.targets[enemy]
      : s.preset === "royal-any" && !!royalCaptures.length;
  const f = (c: number) => String.fromCharCode(97 + c);
  n = {
    ...n,
    turn: enemy,
    enPassant:
      !m.next &&
      !m.stationary &&
      p.role === "pawn" &&
      Math.abs(m.to.row - m.from.row) === 2
        ? { row: (m.to.row + m.from.row) / 2, col: m.from.col }
        : null,
    history: [
      ...n.history,
      `${f(m.from.col)}${8 - m.from.row}${m.stationary ? "×" : "-"}${f(m.to.col)}${8 - m.to.row}${m.next ? `${m.next.stationary ? "×" : "-"}${f(m.next.to.col)}${8 - m.next.to.row}` : ""}`,
    ],
    winner: win ? p.color : null,
    message: win
      ? `${p.color === "white" ? "白" : "黒"}の勝利です。`
      : `${enemy === "white" ? "白" : "黒"}の手番です。`,
  };
  if (
    s.preset === "classic" && royalCaptures.some((cap) => cap.role === "custom")
  )
    return { ...n, winner: p.color, message: "王冠駒が取られました。" };
  if (s.preset === "classic" && !n.winner) {
    const moves = allLegal(n, d);
    if (!moves.length) {
      const k = king(n, enemy),
        check = k && threatened(n, k, p.color, d);
      n = check
        ? { ...n, winner: p.color, message: "チェックメイトです。" }
        : { ...n, draw: true, message: "ステイルメイトです。" };
    }
  }
  if (s.preset !== "classic" && !n.winner && !allLegal(n, d).length)
    n = { ...n, draw: true, message: "合法手がないため引き分けです。" };
  return n;
}
export function pieceText(p: Piece, d: Definition[]) {
  const t =
    p.role === "custom"
      ? d.find((x) => x.id === p.definitionId)?.symbol || "?"
      : label[p.role];
  return p.color === "white" ? t : t.toLowerCase();
}
