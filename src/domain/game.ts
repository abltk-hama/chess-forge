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
import { directions, idx, inside, other } from "./types";
import { formationFromSetup } from "./formation";
import { evolvedDefinition, growthStages, jumpLimit, rebirthEnhancedDefinition, summonedDefinition, transformedDefinition } from "./cost";
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
  raptor: "RA",
  crow: "CR",
  demon: "DM",
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
        zeroTurns: custom && defs.find((definition) => definition.id === custom)?.zeroBody ? 3 : undefined,
      };
      board[idx({ row: pr, col })] = {
        id: `p${id++}`,
        color,
        role: pawnCustom ? "custom" : "pawn",
        definitionId: pawnCustom || undefined,
        moved: false,
        zeroTurns: pawnCustom && defs.find((definition) => definition.id === pawnCustom)?.zeroBody ? 3 : undefined,
      };
    });
  }
  const crowns = formation.filter(
    (id) => defs.find((definition) => definition.id === id)?.isCrown,
  ).length;
  // 零体は配置時点から3回の所有者手番終了を寿命として持つ。
  for (let i = 0; i < board.length; i++) {
    const piece = board[i];
    if (piece?.role === "custom" && defs.find((definition) => definition.id === piece.definitionId)?.zeroBody)
      board[i] = { ...piece, zeroTurns: 3 };
  }
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
    ply: 0,
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
  options: { passEnemies?: number; passCapture?: "first" | "last"; charge?: boolean; isBarrier?: (piece: Piece) => boolean } = {},
) {
  const out: Move[] = [];
  for (const v of vectors) {
    let alliesPassed = 0, enemiesPassed = 0;
    const passedEnemies: Pos[] = [];
    for (let n = 1; n <= max; n++) {
      const to = { row: from.row + v.dy * n, col: from.col + v.dx * n };
      if (!inside(to)) break;
      const t = at(s, to);
      if (!t) {
        if (usage !== "capture" && usage !== "stationary") out.push({ from, to });
        // すり抜け捕獲は、通過した敵より先の空きマスへ着地する別アクション。
        // usageに関係なく、すり抜け能力そのものが対象1体への捕獲権を与える。
        if (passedEnemies.length) {
          const captureAt = options.passCapture === "last" ? passedEnemies[passedEnemies.length - 1] : passedEnemies[0];
          out.push({ from, to, passCaptureAt: captureAt });
        }
      } else {
        if (t.color !== color && options.isBarrier?.(t)) {
          if (usage !== "move") out.push({ from, to, stationary: usage === "stationary" });
          break;
        }
        if (t.color === color) {
          alliesPassed++;
          if (alliesPassed > jumpAllies) break;
          continue;
        }
        if (options.passEnemies) {
          // すり抜け設定方向では敵駒のマスへ着地する通常捕獲は行わない。
          // 指定数までは通過し、捕獲する場合も通過後の空きマスへ着地する。
          if (enemiesPassed < options.passEnemies) {
            enemiesPassed++;
            passedEnemies.push(to);
            continue;
          }
          break;
        }
        if (usage !== "move") out.push({ from, to, stationary: usage === "stationary" });
        enemiesPassed++;
        if (enemiesPassed > jumpEnemies) break;
      }
    }
    if (options.charge) {
      const own = out.filter((move) => {
        const delta = { dx: Math.sign(move.to.col - from.col), dy: Math.sign(move.to.row - from.row) };
        return delta.dx === v.dx && delta.dy === v.dy;
      });
      if (own.length > 1) {
        const distance = (move: Move) => Math.max(Math.abs(move.to.row - from.row), Math.abs(move.to.col - from.col));
        const maxDistance = Math.max(...own.map(distance));
        for (const move of [...own]) if (distance(move) !== maxDistance) out.splice(out.indexOf(move), 1);
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
  if (p.role === "raptor") return rays(s, from, p.color, [{ dx: -2, dy: -2 }, { dx: 0, dy: -2 }, { dx: 2, dy: -2 }, { dx: -1, dy: -1 }, { dx: 1, dy: -1 }, { dx: -2, dy: 0 }, { dx: 2, dy: 0 }, { dx: -1, dy: 1 }, { dx: 1, dy: 1 }, { dx: -2, dy: 2 }, { dx: 0, dy: 2 }, { dx: 2, dy: 2 }], 1, 2, 2);
  if (p.role === "crow") return rays(s, from, p.color, directions, 3);
  if (p.role === "demon") return rays(s, from, p.color, directions, 1);
  return [];
}
export function pseudo(
  s: Match,
  from: Pos,
  defs: Definition[],
  phase: 1 | 2 = 1,
  trigger: "normal" | "after-capture" = "normal",
) {
  const p = at(s, from);
  if (!p) return [];
  if (p.role !== "custom") {
    const base = standard(s, from, p);
    if (p.role !== "raptor") return base;
    const ownerIndex = s.board.findIndex((piece) => piece?.id === p.eagleOwnerId);
    if (ownerIndex < 0) return base;
    const ownerPos = { row: Math.floor(ownerIndex / 8), col: ownerIndex % 8 };
    const training = p.eagleTraining ?? "coordination";
    const special: Move[] = [];
    if (training === "coordination" || training === "support") special.push({ from, to: ownerPos, swap: "local" });
    if (training === "hunting" || training === "support") {
      const targets = [
        { dx: 0, dy: -2 }, { dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: 0, dy: 2 },
        { dx: -2, dy: 0 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }, { dx: 2, dy: 0 },
        { dx: -1, dy: -1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 1 }, { dx: 1, dy: 1 },
      ];
      for (const v of targets) {
        const to = { row: ownerPos.row + v.dy, col: ownerPos.col + v.dx };
        const target = inside(to) ? at(s, to) : null;
        if (!target || target.color === p.color) continue;
        if (training === "support" && ((to.row + to.col) & 1) !== ((from.row + from.col) & 1)) continue;
        special.push(training === "support" ? { from, to, stationary: true } : { from, to });
      }
    }
    return [...base, ...special];
  }
  const source = defs.find((x) => x.id === p.definitionId);
  if (!source) return [];
  const growthStage = p.growthStage ?? (p.evolved ? 1 : 0);
  const evolvedMovement = !!(
    (source.growth && growthStage > 0) ||
    (source.transformation && p.evolved)
  );
  let d = p.summoned
    ? summonedDefinition(source)
    : source.growth && growthStage > 0
      ? evolvedDefinition(source, growthStage)
      : p.evolved && source.transformation
        ? transformedDefinition(source)
        : source;
  if (p.rebirthEnhanced) d = rebirthEnhancedDefinition(source, d);
  const out: Move[] = [];
  for (const pattern of d.patterns) {
    const sealed = !!p.sealedUntil && (s.ply ?? 0) <= p.sealedUntil;
    if ((pattern.phase ?? 1) !== phase) continue;
    if (sealed && phase === 2) continue;
    if (phase === 2 && (pattern.secondTrigger ?? "normal") !== trigger) continue;
    if (pattern.evolutionOnly && !p.evolved) continue;
    if (pattern.initialOnly && p.moved) continue;
    if (pattern.evolvedInitialOnly && (!p.evolved || p.evolvedMoved)) continue;
    const sign = p.color === "white" ? 1 : -1,
      v = pattern.vectors.map((x) => ({ dx: x.dx, dy: x.dy * sign }));
    const max =
      pattern.kind === "leap"
        ? 1
        : pattern.range === "slide"
          ? 7
          : pattern.range;
    const usage = phase === 2 && trigger === "normal" && !evolvedMovement
      ? "move"
      : pattern.usage ?? "both";
    const additiveCannon = !sealed && pattern.kind === "direction" && !!pattern.growthCannon;
    if (!sealed && pattern.kind === "direction" && pattern.cannon) {
      out.push(
        ...cannonRays(s, from, p.color, v, max, usage),
      );
      continue;
    }
    const generated = rays(
      s,
      from,
      p.color,
      v,
      max,
      pattern.kind === "leap"
        ? 2
        : sealed ? 0 : source.zeroBody ? 2 : jumpLimit(pattern.jumpAllies, pattern.canJump),
      pattern.kind === "leap"
        ? 2
        : sealed ? 0 : source.zeroBody ? 2 : jumpLimit(pattern.jumpEnemies, pattern.canJump),
      usage,
      {
        passEnemies: sealed || pattern.kind === "leap" ? 0 : pattern.passEnemies,
        passCapture: pattern.kind === "direction" ? pattern.passCapture : undefined,
        charge: !sealed && pattern.kind === "direction" && !!pattern.charge,
        isBarrier: pattern.kind === "direction"
          ? (piece) => piece.role === "custom" && !!defs.find((item) => item.id === piece.definitionId)?.barrier && !(piece.sealedUntil && (s.ply ?? 0) <= piece.sealedUntil)
          : undefined,
      },
    );

    if (!sealed && pattern.kind === "direction" && pattern.recoil) {
      for (const move of generated) {
        if (!at(s, move.to) || move.stationary) continue;
        const dx = Math.sign(move.to.col - from.col), dy = Math.sign(move.to.row - from.row);
        const recoilTo = { row: move.to.row - dy, col: move.to.col - dx };
        // 出発地点は捕獲移動後には空くため、有効な反動先として扱う。
        if (!eq(recoilTo, from) && at(s, recoilTo)) continue;
        move.recoilTo = recoilTo;
      }
      out.push(...generated.filter((move) => !at(s, move.to) || !!move.recoilTo));
    } else out.push(...generated);
    if (additiveCannon)
      out.push(...cannonRays(s, from, p.color, v, max, "capture"));
  }
  // 追跡成立後は元の固定跳躍範囲に関係なく、その追跡対象だけを直接捕獲できる。
  // Royal は監視・追跡対象外で、途中でRoyal化した場合もここで除外する。
  const sealedNow = !!p.sealedUntil && (s.ply ?? 0) <= p.sealedUntil;
  if (!sealedNow) {
    for (const tracked of s.trackingTargets ?? []) {
      if (tracked.trackerId !== p.id || tracked.remaining <= 0) continue;
      const targetIndex = s.board.findIndex((piece) => piece?.id === tracked.targetId);
      if (targetIndex < 0) continue;
      const target = s.board[targetIndex]!;
      if (target.color === p.color || isRoyal(target, defs)) continue;
      out.push({ from, to: { row: Math.floor(targetIndex / 8), col: targetIndex % 8 } });
    }
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
  if (definition?.isCrown) return true;
  if (!definition?.growth) return false;
  const stage = piece.growthStage ?? (piece.evolved ? 1 : 0);
  return !!growthStages(definition.growth)[stage - 1]?.unlockCrown;
};
export const threatened = (s: Match, target: Pos, by: Color, d: Definition[]): boolean =>
  s.board.some((piece, i) => {
    if (piece?.color !== by) return false;
    const from = { row: Math.floor(i / 8), col: i % 8 };
    return legal(
      { ...s, preset: "royal-any", turn: by, winner: null, draw: false },
      from,
      d,
    ).some((move) => eq(move.passCaptureAt ?? move.next?.passCaptureAt ?? move.next?.to ?? move.to, target));
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
        eq(candidate.passCaptureAt ?? candidate.to, to),
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
    const capturedFirst = !!firstMove.passCaptureAt || !!at(s, firstMove.to);
    pseudo(afterFirst, secondFrom, d, 2, capturedFirst ? "after-capture" : "normal").forEach((move) => {
      if (!at(afterFirst, move.to)) add(move.to, { move: true, second: true });
    });
    if (!capturedFirst) {
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
  if (m.transit) return { ...s, board: b };
  if (m.swap) {
    const target = b[idx(m.to)]!;
    b[idx(m.from)] = target;
    b[idx(m.to)] = {
      ...p,
      moved: true,
      evolvedMoved: p.evolved ? true : p.evolvedMoved,
      globalSwapUsed: m.swap === "global" ? true : p.globalSwapUsed,
    };
    return { ...s, board: b };
  }
  if (m.stationary) {
    b[idx(m.to)] = null;
    b[idx(m.from)] = { ...p, moved: true, evolvedMoved: p.evolved ? true : p.evolvedMoved };
    return { ...s, board: b };
  }
  if (m.enPassant) b[idx({ row: m.from.row, col: m.to.col })] = null;
  if (m.passCaptureAt) b[idx(m.passCaptureAt)] = null;
  b[idx(m.from)] = null;
  const landing = m.recoilTo ?? m.to;
  b[idx(m.to)] = null;
  b[idx(landing)] = { ...p, role: m.promotion ? "queen" : p.role, moved: true, evolvedMoved: p.evolved ? true : p.evolvedMoved };
  if (m.castle) {
    const f = { row: m.from.row, col: m.castle === "king" ? 7 : 0 },
      t = { row: m.from.row, col: m.castle === "king" ? 5 : 3 },
      r = b[idx(f)]!;
    b[idx(f)] = null;
    b[idx(t)] = { ...r, moved: true };
  }
  return { ...s, board: b };
}
export function legal(s: Match, from: Pos, d: Definition[]): Move[] {
  const p = at(s, from);
  if (!p || p.color !== s.turn || s.winner || s.draw) return [];
  const first = pseudo(s, from, d).filter((move) => {
    const target = at(s, move.passCaptureAt ?? move.to);
    const definition = target?.role === "custom" ? d.find((item) => item.id === target.definitionId) : undefined;
    if (target && definition?.deathbind && target.evolved && !(target.sealedUntil && (s.ply ?? 0) <= target.sealedUntil) && isRoyal(p, d)) return false;
    if (target && definition?.dark && target.evolved && !(target.sealedUntil && (s.ply ?? 0) <= target.sealedUntil)) {
      const capturePos = move.passCaptureAt ?? move.to;
      const distance = Math.max(Math.abs(capturePos.row - from.row), Math.abs(capturePos.col - from.col));
      if (move.stationary || distance >= 3) return false;
    }
    return true;
  });
  const base: Move[] =
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
  if (p.role === "demon") {
    const combined: Move[] = [...base];
    for (const firstMove of base) {
      const capturedFirst = !!at(s, firstMove.to);
      const afterFirst = raw(s, firstMove);
      for (const secondMove of standard(afterFirst, firstMove.to, at(afterFirst, firstMove.to)!)) {
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
  if (p.role !== "custom") return base;
  const definition = d.find((item) => item.id === p.definitionId);
  if (!definition) return base;
  const growthStage = p.growthStage ?? (p.evolved ? 1 : 0);
  let activeDefinition = definition.growth && growthStage
    ? evolvedDefinition(definition, growthStage)
    : p.evolved && definition.transformation ? transformedDefinition(definition) : definition;
  if (p.rebirthEnhanced) activeDefinition = rebirthEnhancedDefinition(definition, activeDefinition);
  const combined: Move[] = [...base];
  const pieceSealed = !!p.sealedUntil && (s.ply ?? 0) <= p.sealedUntil;
  if (p.evolved && !pieceSealed) {
    const evolution = definition.growth
      ? growthStages(definition.growth)[growthStage - 1]
      : definition.transformation;
    const swapMoves: Move[] = [];
    if (evolution?.localSwap) {
      for (let i = 0; i < 64; i++) {
        const target = s.board[i];
        if (!target || target.color !== p.color || target.id === p.id) continue;
        const to = { row: Math.floor(i / 8), col: i % 8 };
        const board = [...s.board]; board[i] = null;
        if (pseudo({ ...s, board }, from, d).some((move) => eq(move.to, to))) swapMoves.push({ from, to, swap: "local" });
      }
    }
    if (evolution?.globalSwap && !p.globalSwapUsed) {
      s.board.forEach((target, i) => {
        if (target?.color === p.color && target.id !== p.id) swapMoves.push({ from, to: { row: Math.floor(i / 8), col: i % 8 }, swap: "global" });
      });
    }
    combined.push(...swapMoves.filter((move) => {
      if (s.preset !== "classic") return true;
      const after = raw(s, move), royal = king(after, p.color);
      return !!royal && !threatened(after, royal, other(p.color), d);
    }));
  }
  // 献身用の攻撃判定。legal()->献身->threatened()->legal() の再帰を避けるため、
  // ここでは相手の一次移動による捕獲到達だけを見る。
  const directlyThreatened = (state: Match, targetPos: Pos, by: Color) =>
    state.board.some((attacker, index) => {
      if (attacker?.color !== by) return false;
      const attackerFrom = { row: Math.floor(index / 8), col: index % 8 };
      return pseudo(state, attackerFrom, d).some((candidate) => eq(candidate.passCaptureAt ?? candidate.to, targetPos));
    });
  // 献身: 成長/変身後、チェック中の味方Royalと位置交換し、そのチェックを解除する。
  if (definition.devotion && p.evolved && !pieceSealed) {
    s.board.forEach((target, index) => {
      if (!target || target.color !== p.color || target.id === p.id || !isRoyal(target, d)) return;
      const to = { row: Math.floor(index / 8), col: index % 8 };
      if (!directlyThreatened(s, to, other(p.color))) return;
      const move: Move = { from, to, swap: "devotion" };
      const after = raw(s, move);
      if (!directlyThreatened(after, from, other(p.color))) combined.push(move);
    });
  }
  if (!activeDefinition.patterns.some((pattern) => pattern.phase === 2)) return combined;
  for (const firstMove of base) {
    const afterFirst = raw(s, firstMove);
    const secondFrom = firstMove.stationary ? from : firstMove.to;
    const capturedFirst = !!firstMove.passCaptureAt || !!at(s, firstMove.to);
    const secondMoves = capturedFirst
      ? pseudo(afterFirst, secondFrom, d, 2, "after-capture")
      : pseudo(afterFirst, secondFrom, d, 2, "normal");
    for (const secondMove of secondMoves) {
      if (capturedFirst && at(afterFirst, secondMove.to)) continue;
      const afterSecond = raw(afterFirst, secondMove);
      if (s.preset === "classic") {
        const k = king(afterSecond, p.color);
        if (!k || threatened(afterSecond, k, other(p.color), d)) continue;
      }
      combined.push({ ...firstMove, next: secondMove });
    }
  }
  // 飛翔: 固定跳躍先の駒を中継点として残し、そこから最終地点を計算する。
  const flightPatterns = activeDefinition.patterns.filter((pattern) => pattern.phase === 2 && pattern.secondTrigger === "flight");
  const leapPatterns = activeDefinition.patterns.filter((pattern) => (pattern.phase ?? 1) === 1 && pattern.kind === "leap");
  if (p.evolved && flightPatterns.length && leapPatterns.length) {
    const sign = p.color === "white" ? 1 : -1;
    for (const leap of leapPatterns) for (const vector of leap.vectors) {
      const anchor = { row: from.row + vector.dy * sign, col: from.col + vector.dx };
      if (!inside(anchor) || !at(s, anchor)) continue;
      for (const pattern of flightPatterns) for (const vector2 of pattern.vectors) {
        const max: number = pattern.kind === "direction" && pattern.range === "slide" ? 7 : pattern.kind === "direction" ? pattern.range as number : 1;
        for (let step = 1; step <= max; step++) {
          const to = { row: anchor.row + vector2.dy * sign * step, col: anchor.col + vector2.dx * step };
          if (!inside(to)) break;
          const target = at(s, to), usage = pattern.usage ?? "both";
          if (target?.color === p.color || (target && usage === "move") || (!target && usage === "capture")) continue;
          const first: Move = { from, to: anchor, transit: true };
          const action = { ...first, next: { from, to } };
          const after = raw(raw(s, first), action.next);
          if (s.preset === "classic") { const royal = king(after, p.color); if (!royal || threatened(after, royal, other(p.color), d)) continue; }
          combined.push(action);
        }
      }
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
function rebirthEnhancementActive(piece: Piece, definition: Definition) {
  const at = definition.rebirth?.enhancedAt;
  if (!definition.rebirth?.enhancement || definition.rebirth.enhancedPattern === undefined || !at) return false;
  if (at === "transformation") return !!piece.evolved && !!definition.transformation;
  return (piece.growthStage ?? (piece.evolved ? 1 : 0)) >= at;
}

function applyGrowth(match: Match, definitions: Definition[], statsSnapshot: ReturnType<typeof defaultStats>) {
  const board = [...match.board],
    evolved = { white: 0, black: 0 };
  board.forEach((piece, index) => {
    if (!piece || piece.role !== "custom" || piece.summoned) return;
    const definition = definitions.find((item) => item.id === piece.definitionId);
    const position = { row: Math.floor(index / 8), col: index % 8 };
    if (definition?.growth) {
      const stages = growthStages(definition.growth);
      let stage = piece.growthStage ?? (piece.evolved ? 1 : 0);
      const before = stage;
      while (stage < stages.length && conditionMet(stages[stage].condition, piece, position, match, statsSnapshot)) stage++;
      if (stage === before) return;
      board[index] = {
        ...piece,
        evolved: true,
        growthStage: stage as 1 | 2,
        evolvedMoved: false,
        globalSwapUsed: false,
        zeroTurns: stages[stage - 1]?.overcomeZero ? undefined : piece.zeroTurns === undefined ? undefined : piece.zeroTurns + (stages[stage - 1]?.zeroRecovery ?? 0),
      };
      evolved[piece.color] += stage - before;
      return;
    }
    if (piece.evolved) return;
    const evolution = definition?.transformation ?? definition?.summoning;
    if (!evolution || !conditionMet(evolution.condition, piece, position, match, statsSnapshot)) return;
    board[index] = {
      ...piece,
      evolved: true,
      moved: definition?.transformation ? false : piece.moved,
      evolvedMoved: false,
      globalSwapUsed: false,
    };
    evolved[piece.color]++;
  });
  if (!evolved.white && !evolved.black) return match;
  const stats = structuredClone(match.stats ?? defaultStats()),
    targets = { ...match.targets };
  for (const color of ["white", "black"] as Color[]) {
    stats[color].evolutions += evolved[color];
    const newCrowns = board.filter((piece, index) => {
      const before = match.board[index];
      if (!piece || !before || piece.color !== color) return false;
      const definition = definitions.find((item) => item.id === piece.definitionId);
      if (!definition?.growth) return false;
      const beforeStage = before.growthStage ?? (before.evolved ? 1 : 0);
      const afterStage = piece.growthStage ?? (piece.evolved ? 1 : 0);
      const stages = growthStages(definition.growth);
      return !stages[beforeStage - 1]?.unlockCrown && !!stages[afterStage - 1]?.unlockCrown;
    }).length;
    targets[color] += newCrowns;
  }
  let result: Match = { ...match, board, stats, targets };
  // 契約系能力: 新たに成長/変身した契約者について、配置可能性を確認して選択待ちにする。
  const contractIndex = board.findIndex((piece, i) => {
    const before = match.board[i];
    if (!piece || !before || piece.role !== "custom") return false;
    const definition = definitions.find((item) => item.id === piece.definitionId);
    if (!definition) return false;
    const beforeStage = before.growthStage ?? (before.evolved ? 1 : 0);
    const afterStage = piece.growthStage ?? (piece.evolved ? 1 : 0);
    const eagle = definition.growth
      ? growthStages(definition.growth).slice(beforeStage, afterStage).some((stage) => stage.eagleHunt)
      : !before.evolved && piece.evolved && !!definition.transformation && !!definition.eagleHunt;
    const demon = definition.growth
      ? growthStages(definition.growth).slice(beforeStage, afterStage).some((stage) => stage.demonContract)
      : !before.evolved && piece.evolved && !!definition.transformation && !!definition.demonContract;
    return (eagle && !piece.eagleHuntUsed) || (demon && !piece.demonContractUsed);
  });
  if (contractIndex >= 0) {
    const piece = board[contractIndex]!, before = match.board[contractIndex]!, definition = definitions.find((item) => item.id === piece.definitionId)!;
    const origin = { row: Math.floor(contractIndex / 8), col: contractIndex % 8 };
    const beforeStage = before.growthStage ?? (before.evolved ? 1 : 0), afterStage = piece.growthStage ?? (piece.evolved ? 1 : 0);
    const eagle = definition.growth
      ? growthStages(definition.growth).slice(beforeStage, afterStage).some((stage) => stage.eagleHunt)
      : !!definition.transformation && !!definition.eagleHunt;
    const demon = definition.growth
      ? growthStages(definition.growth).slice(beforeStage, afterStage).some((stage) => stage.demonContract)
      : !!definition.transformation && !!definition.demonContract;
    const triggerEagle = eagle && !piece.eagleHuntUsed;
    const triggerDemon = demon && !piece.demonContractUsed;
    if (triggerEagle) {
      const raptorCandidates = directions.map((v) => ({ row: origin.row + v.dy, col: origin.col + v.dx })).filter((pos) => inside(pos) && !at(result, pos));
      const enemy = other(piece.color);
      const crowCandidates: Pos[] = [];
      for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
        const inCamp = enemy === "white" ? row >= 5 : row <= 2;
        const pos = { row, col };
        if (inCamp && !at(result, pos)) crowCandidates.push(pos);
      }
      const safeRaptorCandidates = raptorCandidates.filter((candidate) => crowCandidates.some((crow) => !eq(crow, candidate)));
      if (safeRaptorCandidates.length && crowCandidates.length) {
        result.board[contractIndex] = { ...piece, eagleHuntUsed: true };
        result.pendingContract = { kind: "raptor", owner: piece.color, contractorId: piece.id, training: definition.eagleTraining ?? "coordination", origin, candidates: safeRaptorCandidates, nextCandidates: crowCandidates, followupDemon: triggerDemon };
        return result;
      }
      result.board[contractIndex] = { ...piece, eagleHuntUsed: true };
    }
    if (triggerDemon) {
      const candidates = directions.map((v) => ({ row: origin.row + v.dy, col: origin.col + v.dx })).filter((pos) => inside(pos) && !at(result, pos));
      result.board[contractIndex] = { ...piece, demonContractUsed: true };
      if (candidates.length) {
        result.pendingContract = { kind: "demon-own", owner: piece.color, contractorId: piece.id, origin, candidates };
        return result;
      }
    }
  }
  const index = board.findIndex((piece, i) => {
    const before = match.board[i], definition = definitions.find((item) => item.id === piece?.definitionId);
    return !!piece && !before?.evolved && !!piece.evolved && !!definition?.summoning && definition.summoning.timing !== "inherit";
  });
  if (index >= 0) {
    const piece = board[index]!, definition = definitions.find((item) => item.id === piece.definitionId)!, summon = definition.summoning!;
    const origin = { row: Math.floor(index / 8), col: index % 8 };
    if (summon.timing === "split") {
      result.board[index] = null;
      if (definition.rebirth?.splitAllowed && !piece.rebirthUsed) {
        const rebirthCandidates = directions
          .map((v) => ({ row: origin.row + v.dy, col: origin.col + v.dx }))
          .filter((pos) => inside(pos) && !at(result, pos));
        if (rebirthCandidates.length)
          result.pendingRebirth = {
            owner: piece.color,
            piece: { ...piece, rebirthUsed: true, rebirthPending: true, rebirthEnhanced: rebirthEnhancementActive(piece, definition) },
            origin,
            candidates: rebirthCandidates,
          };
      }
    }
    let candidates = summon.range === "movement" && summon.timing === "summon"
      ? pseudo(result, origin, definitions).filter((move) => !at(result, move.to)).map((move) => move.to)
      : directions.map((v) => ({ row: origin.row + v.dy, col: origin.col + v.dx })).filter((pos) => inside(pos) && !at(result, pos));
    if (summon.timing === "split") candidates = [origin, ...candidates];
    if (candidates.length) result.pendingSummon = { owner: piece.color, definitionId: definition.id, origin, remaining: summon.timing === "split" ? 2 : 1, candidates };
  }
  return result;
}
export function placeContract(s: Match, to: Pos): Match {
  const pending = s.pendingContract;
  if (!pending || !pending.candidates.some((pos) => eq(pos, to)) || at(s, to)) return s;
  const board = [...s.board];
  if (pending.kind === "raptor") {
    const name = ["鷲", "鷹", "隼"][Math.floor(Math.random() * 3)];
    const id = `raptor-${Date.now()}`;
    board[idx(to)] = { id, color: pending.owner, role: "raptor", moved: false, eagleOwnerId: pending.contractorId, eagleTraining: pending.training, contractName: name };
    const ownerIndex = board.findIndex((piece) => piece?.id === pending.contractorId);
    if (ownerIndex >= 0) board[ownerIndex] = { ...board[ownerIndex]!, raptorId: id };
    return { ...s, board, pendingContract: { kind: "crow", owner: other(pending.owner), contractorId: pending.contractorId, origin: pending.origin, candidates: (pending.nextCandidates ?? []).filter((pos) => !at({ ...s, board }, pos)), followupDemon: pending.followupDemon } };
  }
  if (pending.kind === "crow") {
    board[idx(to)] = { id: `crow-${Date.now()}`, color: pending.owner, role: "crow", moved: false, contractName: "鴉" };
    if (pending.followupDemon && pending.contractorId) {
      const ownerIndex = board.findIndex((piece) => piece?.id === pending.contractorId);
      if (ownerIndex >= 0) {
        const origin = { row: Math.floor(ownerIndex / 8), col: ownerIndex % 8 };
        const candidates = directions.map((v) => ({ row: origin.row + v.dy, col: origin.col + v.dx })).filter((pos) => inside(pos) && !at({ ...s, board }, pos));
        board[ownerIndex] = { ...board[ownerIndex]!, demonContractUsed: true };
        if (candidates.length) return { ...s, board, pendingContract: { kind: "demon-own", owner: board[ownerIndex]!.color, contractorId: pending.contractorId, origin, candidates } };
      }
    }
  } else board[idx(to)] = { id: `demon-${Date.now()}`, color: pending.owner, role: "demon", moved: false, contractName: "魔神", demonTurns: pending.kind === "demon-own" ? 4 : undefined, demonCompensation: pending.kind === "demon-own" };
  return { ...s, board, pendingContract: undefined };
}

export function placeSummon(s: Match, to: Pos): Match {
  const pending = s.pendingSummon;
  if (!pending || !pending.candidates.some((pos) => eq(pos, to)) || at(s, to)) return s;
  const board = [...s.board];
  board[idx(to)] = { id: `summon-${Date.now()}-${pending.remaining}`, color: pending.owner, role: "custom", definitionId: pending.definitionId, moved: false, summoned: true };
  const candidates = pending.candidates.filter((pos) => !eq(pos, to) && !at({ ...s, board }, pos));
  const pendingSummon = pending.remaining > 1 && candidates.length ? { ...pending, remaining: pending.remaining - 1, candidates } : undefined;
  let pendingRebirth = s.pendingRebirth;
  // 分裂後再生は派生駒の配置完了後の盤面で候補を作り直す。
  // 古い候補が派生駒で埋まると配置不能の pendingRebirth が残り、対局が停止していた。
  if (!pendingSummon && pendingRebirth) {
    const rebirthCandidates = directions
      .map((v) => ({ row: pendingRebirth!.origin.row + v.dy, col: pendingRebirth!.origin.col + v.dx }))
      .filter((pos) => inside(pos) && !at({ ...s, board }, pos));
    pendingRebirth = rebirthCandidates.length ? { ...pendingRebirth, candidates: rebirthCandidates } : undefined;
  }
  return { ...s, board, pendingSummon, pendingRebirth };
}
export function placeRebirth(s: Match, to: Pos): Match {
  const pending = s.pendingRebirth;
  if (!pending || !pending.candidates.some((pos) => eq(pos, to)) || at(s, to)) return s;
  const board = [...s.board];
  const piece = pending.piece;
  board[idx(to)] = { ...piece, moved: true, rebirthUsed: true, rebirthPending: false };
  return { ...s, board, pendingRebirth: undefined, message: `${pending.owner === "white" ? "白" : "黒"}の駒が再生しました。` };
}
export function play(s: Match, m: Move, d: Definition[]) {
  const p = at(s, m.from)!,
    captures = [m.passCaptureAt ? at(s, m.passCaptureAt) : (m.swap || m.transit ? null : at(s, m.to)), m.next ? at(raw(s, m), m.next.passCaptureAt ?? m.next.to) : null].filter(
      Boolean,
    ) as Piece[],
    enemy = other(p.color),
    royalCaptures = captures.filter((cap) => isRoyal(cap, d));
  let n = raw(s, m);
  if (m.next) n = raw(n, m.next);
  // 道連れは捕獲した側も同時に除去する（王冠は捕獲できない）。
  const deathbound = captures.some((capture) => {
    const definition = capture.role === "custom" ? d.find((item) => item.id === capture.definitionId) : undefined;
    return !!definition?.deathbind && capture.evolved && !(capture.sealedUntil && (s.ply ?? 0) <= capture.sealedUntil);
  });
  if (deathbound) {
    const moving = n.board.findIndex((piece) => piece?.id === p.id);
    if (moving >= 0) n.board[moving] = null;
  }
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
  // 封印は捕獲地点を中心に3×3、相手の次の手番終了まで継続する。
  const moverDefinition = p.role === "custom" ? d.find((item) => item.id === p.definitionId) : undefined;
  if (capturedCount && moverDefinition?.seal && p.evolved && !(p.sealedUntil && (s.ply ?? 0) <= p.sealedUntil)) {
    const center = m.next?.passCaptureAt ?? m.next?.to ?? m.passCaptureAt ?? m.to;
    n.board = n.board.map((piece, index) => {
      if (!piece || piece.color === p.color) return piece;
      const pos = { row: Math.floor(index / 8), col: index % 8 };
      return Math.max(Math.abs(pos.row - center.row), Math.abs(pos.col - center.col)) <= 1
        ? { ...piece, sealedUntil: (s.ply ?? 0) + 2 }
        : piece;
    });
  }
  // 再生は取られた直後に予約し、次の自分の手番で周囲から配置する。
  const reborn = captures.find((capture) => {
    const definition = capture.role === "custom" ? d.find((item) => item.id === capture.definitionId) : undefined;
    return !!definition?.rebirth && !capture.rebirthUsed && !definition?.zeroBody && !definition?.deathbind && !(capture.sealedUntil && (s.ply ?? 0) <= capture.sealedUntil);
  });
  if (reborn) {
    const definition = d.find((item) => item.id === reborn.definitionId)!;
    const origin = m.next?.passCaptureAt ?? m.next?.to ?? m.passCaptureAt ?? m.to;
    const candidates = directions.map((v) => ({ row: origin.row + v.dy, col: origin.col + v.dx })).filter((pos) => inside(pos) && !at(n, pos));
    if (candidates.length) n.pendingRebirth = { owner: reborn.color, piece: { ...reborn, rebirthUsed: true, rebirthEnhanced: rebirthEnhancementActive(reborn, definition) }, origin, candidates };
  }
  const deadDemon = captures.find((capture) => capture.role === "demon" && capture.demonCompensation);
  if (deadDemon) {
    const deathPos = m.next?.passCaptureAt ?? m.next?.to ?? m.passCaptureAt ?? m.to;
    const candidates: Pos[] = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const pos = { row: deathPos.row + dy, col: deathPos.col + dx };
      if (inside(pos) && !at(n, pos)) candidates.push(pos);
    }
    if (candidates.length) n.pendingContract = { kind: "demon-foe", owner: other(deadDemon.color), origin: deathPos, candidates };
  }
  if (royalCaptures.length)
    n.lost = { ...n.lost, [enemy]: n.lost[enemy] + royalCaptures.length };
  const statsSnapshot = structuredClone(stats);
  n = applyGrowth(n, d, statsSnapshot);
  const inherited = captures.find((capture) => !capture.summoned && capture.evolved && d.find((definition) => definition.id === capture.definitionId)?.summoning?.timing === "inherit");
  if (inherited) {
    const origin = m.next ? m.next.to : m.to;
    const candidates = directions.map((v) => ({ row: origin.row + v.dy, col: origin.col + v.dx })).filter((pos) => inside(pos) && !at(n, pos));
    if (candidates.length) n.pendingSummon = { owner: inherited.color, definitionId: inherited.definitionId!, origin, remaining: 1, candidates };
  }
  const win =
    s.preset === "royal-all"
      ? n.lost[enemy] >= n.targets[enemy]
      : s.preset === "royal-any" && !!royalCaptures.length;
  const f = (c: number) => String.fromCharCode(97 + c);
  n = {
    ...n,
    turn: enemy,
    ply: (s.ply ?? 0) + 1,
    lastMovedPieceId: p.id,
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
  // 再生予約は「次の自分の手番開始時」に実行する。相手の手で候補マスが
  // 埋まる可能性があるため、所有者へ手番が戻った時点の盤面で候補を更新する。
  if (n.pendingRebirth && n.pendingRebirth.owner === n.turn) {
    const pending = n.pendingRebirth;
    const candidates = directions
      .map((v) => ({ row: pending.origin.row + v.dy, col: pending.origin.col + v.dx }))
      .filter((pos) => inside(pos) && !at(n, pos));
    n.pendingRebirth = candidates.length ? { ...pending, candidates } : undefined;
  }
  // 追跡状態更新。
  // 1) 手番を終えた側の既存追跡期限を1手消費する。
  n.trackingTargets = (n.trackingTargets ?? [])
    .map((item) => {
      const tracker = n.board.find((piece) => piece?.id === item.trackerId);
      if (!tracker || tracker.color !== p.color) return item;
      return { ...item, remaining: (item.remaining - 1) as 0 | 1 };
    })
    .filter((item) => item.remaining > 0 && n.board.some((piece) => piece?.id === item.trackerId) && n.board.some((piece) => piece?.id === item.targetId));

  // 2) 今終了した手番の相手が前手番終了時に監視した敵について、
  //    固定跳躍射程外へ逃げ、かつ追跡者から3マス以内なら追跡成立。
  const remainingWatches = [];
  const newTargets = [...(n.trackingTargets ?? [])];
  for (const watch of n.trackingWatches ?? []) {
    const trackerIndex = n.board.findIndex((piece) => piece?.id === watch.trackerId);
    const targetIndex = n.board.findIndex((piece) => piece?.id === watch.targetId);
    if (trackerIndex < 0 || targetIndex < 0) continue;
    const tracker = n.board[trackerIndex]!, target = n.board[targetIndex]!;
    if (tracker.color === p.color) continue; // 自分側の古い監視はこの後作り直す。
    if (isRoyal(target, d)) continue;
    const trackerPos = { row: Math.floor(trackerIndex / 8), col: trackerIndex % 8 };
    const targetPos = { row: Math.floor(targetIndex / 8), col: targetIndex % 8 };
    const definition = tracker.role === "custom" ? d.find((item) => item.id === tracker.definitionId) : undefined;
    if (!definition) continue;
    const stage = tracker.growthStage ?? (tracker.evolved ? 1 : 0);
    let active = definition.growth && stage > 0 ? evolvedDefinition(definition, stage) : tracker.evolved && definition.transformation ? transformedDefinition(definition) : definition;
    if (tracker.rebirthEnhanced) active = rebirthEnhancedDefinition(definition, active);
    const pattern = active.patterns[watch.patternIndex];
    if (!pattern || pattern.kind !== "leap" || !pattern.tracking) continue;
    const sign = tracker.color === "white" ? 1 : -1;
    const stillInRange = pattern.vectors.some((vector) => targetPos.col === trackerPos.col + vector.dx && targetPos.row === trackerPos.row + vector.dy * sign);
    const distance = Math.max(Math.abs(targetPos.row - trackerPos.row), Math.abs(targetPos.col - trackerPos.col));
    if (!stillInRange && distance <= 3) {
      const existing = newTargets.find((item) => item.trackerId === tracker.id && item.targetId === target.id);
      if (existing) existing.remaining = Math.max(existing.remaining, watch.duration) as 1 | 2;
      else newTargets.push({ trackerId: tracker.id, targetId: target.id, remaining: watch.duration });
    }
  }
  n.trackingTargets = newTargets;

  // 3) 手番を終えた側は監視をリセットし、現在の追跡Leap射程内の非Royal敵を新たに監視する。
  n.trackingWatches = remainingWatches;
  for (let trackerIndex = 0; trackerIndex < n.board.length; trackerIndex++) {
    const tracker = n.board[trackerIndex];
    if (!tracker || tracker.color !== p.color || tracker.role !== "custom") continue;
    if (tracker.sealedUntil && (n.ply ?? 0) <= tracker.sealedUntil) continue;
    const definition = d.find((item) => item.id === tracker.definitionId);
    if (!definition) continue;
    const stage = tracker.growthStage ?? (tracker.evolved ? 1 : 0);
    let active = definition.growth && stage > 0 ? evolvedDefinition(definition, stage) : tracker.evolved && definition.transformation ? transformedDefinition(definition) : definition;
    if (tracker.rebirthEnhanced) active = rebirthEnhancedDefinition(definition, active);
    const trackerPos = { row: Math.floor(trackerIndex / 8), col: trackerIndex % 8 };
    const sign = tracker.color === "white" ? 1 : -1;
    active.patterns.forEach((pattern, patternIndex) => {
      if (pattern.kind !== "leap" || !pattern.tracking) return;
      for (const vector of pattern.vectors) {
        const targetPos = { row: trackerPos.row + vector.dy * sign, col: trackerPos.col + vector.dx };
        if (!inside(targetPos)) continue;
        const target = at(n, targetPos);
        if (!target || target.color === tracker.color || isRoyal(target, d)) continue;
        n.trackingWatches!.push({ trackerId: tracker.id, patternIndex, targetId: target.id, duration: pattern.tracking.duration });
      }
    });
  }

  // 契約魔神の寿命。召喚された手番ではなく、以後の所有者手番終了ごとに減少する。
  let expiredDemon: { pos: Pos; color: Color } | undefined;
  n.board = n.board.map((piece, index) => {
    if (!piece || piece.color !== p.color || piece.role !== "demon" || piece.demonTurns === undefined) return piece;
    const value = piece.demonTurns - 1;
    if (value > 0) return { ...piece, demonTurns: value };
    if (piece.demonCompensation) expiredDemon = { pos: { row: Math.floor(index / 8), col: index % 8 }, color: piece.color };
    return null;
  });
  if (expiredDemon) {
    const candidates: Pos[] = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const pos = { row: expiredDemon.pos.row + dy, col: expiredDemon.pos.col + dx };
      if (inside(pos) && !at(n, pos)) candidates.push(pos);
    }
    if (candidates.length) n.pendingContract = { kind: "demon-foe", owner: other(expiredDemon.color), origin: expiredDemon.pos, candidates };
  }

  // 零体は「その駒を動かしたか」に関係なく、所有者の手番終了ごとに寿命が1減る。
  n.board = n.board.map((piece) => {
    if (!piece || piece.color !== p.color || piece.role !== "custom") return piece;
    const definition = d.find((item) => item.id === piece.definitionId);
    if (!definition?.zeroBody) return piece;
    const stage = piece.growthStage ?? (piece.evolved ? 1 : 0);
    if (definition.growth && stage > 0 && growthStages(definition.growth)[stage - 1]?.overcomeZero)
      return { ...piece, zeroTurns: undefined };
    // 旧対局データや盤面Editor由来でzeroTurnsが無い零体も、初期寿命3として扱う。
    const value = (piece.zeroTurns ?? 3) - 1;
    return value > 0 ? { ...piece, zeroTurns: value } : null;
  });
  if (
    s.preset === "classic" && royalCaptures.some((cap) => cap.role === "custom")
  )
    return { ...n, winner: p.color, message: "王冠駒が取られました。" };
  if (s.preset === "classic" && !n.winner && !n.pendingSummon && !n.pendingRebirth && !n.pendingContract) {
    const moves = allLegal(n, d);
    if (!moves.length) {
      const k = king(n, enemy),
        check = k && threatened(n, k, p.color, d);
      n = check
        ? { ...n, winner: p.color, message: "チェックメイトです。" }
        : { ...n, draw: true, message: "ステイルメイトです。" };
    }
  }
  if (s.preset !== "classic" && !n.winner && !n.pendingSummon && !n.pendingContract && !allLegal(n, d).length)
    n = { ...n, draw: true, message: "合法手がないため引き分けです。" };
  return n;
}
export function pieceText(p: Piece, d: Definition[]) {
  const definition =
    p.role === "custom" ? d.find((x) => x.id === p.definitionId) : undefined;
  const t = definition
    ? p.summoned && definition.summoning
      ? definition.summoning.symbol
      : p.evolved && definition.transformation
      ? definition.transformation.symbol
      : definition.symbol
    : label[p.role as Exclude<Role, "custom">] ?? "?";
  return p.color === "white" ? t : t.toLowerCase();
}
