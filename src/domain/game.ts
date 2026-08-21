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
  hound: "HD",
  boar: "BR",
  piglet: "PG",
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
  if (p.role === "hound") return rays(s, from, p.color, orth, 1);
  if (p.role === "boar") {
    // 猪の前方は所有者から敵陣へ向かう向き。黒は画面下、白は画面上。
    const forward = p.color === "black" ? 1 : -1;
    const moves = [
      ...rays(s, from, p.color, [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }], 7, 0, 0, "both", { charge: true }),
      ...rays(s, from, p.color, [{ dx: -1, dy: forward }, { dx: 1, dy: forward }], 3, 0, 0, "both", { charge: true }),
    ];
    return moves.filter((move) => {
      if (!at(s, move.to)) return true;
      const dx = Math.sign(move.to.col - from.col), dy = Math.sign(move.to.row - from.row);
      const recoilTo = { row: move.to.row - dy, col: move.to.col - dx };
      if (!eq(recoilTo, from) && at(s, recoilTo)) return false;
      move.recoilTo = recoilTo;
      return true;
    });
  }
  if (p.role === "piglet") return rays(s, from, p.color, [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }], 2);
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
    if (p.role === "hound" && p.dogTraining === "coordination") {
      const ownerIndex = s.board.findIndex((piece) => piece?.id === p.dogOwnerId);
      const enemyNear = s.board.some((piece, index) => piece?.color === other(p.color) && Math.max(Math.abs(Math.floor(index / 8) - from.row), Math.abs(index % 8 - from.col)) <= 2);
      if (ownerIndex < 0 || !enemyNear) return base;
      const owner = { row: Math.floor(ownerIndex / 8), col: ownerIndex % 8 };
      const returns: Move[] = directions.map((v) => ({ row: owner.row + v.dy, col: owner.col + v.dx })).filter((to) => inside(to) && !at(s, to)).map((to) => ({ from, to }));
      return [...base, ...returns];
    }
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
  // 索敵型が共有した対象は、契約者だけが距離・通常射程を問わず静止捕獲できる。
  for (const track of s.dogTracks ?? []) {
    if (!track.shared || track.ownerId !== p.id) continue;
    const houndIndex = s.board.findIndex((piece) => piece?.id === track.houndId);
    const targetIndex = s.board.findIndex((piece) => piece?.id === track.targetId);
    if (houndIndex < 0 || targetIndex < 0) continue;
    const houndPos = { row: Math.floor(houndIndex / 8), col: houndIndex % 8 }, targetPos = { row: Math.floor(targetIndex / 8), col: targetIndex % 8 };
    if (Math.max(Math.abs(houndPos.row - targetPos.row), Math.abs(houndPos.col - targetPos.col)) <= 2)
      out.push({ from, to: targetPos, stationary: true });
  }
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
    if (pattern.kind === "chain") {
      const usage = pattern.usage ?? "both";
      const visit = (state: Match, current: Pos, steps: Move[], previous?: Vec) => {
        for (const vector of v) {
          if (previous && vector.dx === -previous.dx && vector.dy === -previous.dy) continue;
          const to = { row: current.row + vector.dy, col: current.col + vector.dx };
          if (!inside(to)) continue;
          const target = at(state, to);
          if (target?.color === p.color || (target && usage === "move")) continue;
          const step = { from: current, to };
          const chain = [...steps, step];
          out.push({ from, to: chain[0].to, chain });
          if (!target && chain.length < pattern.maxChains) visit(raw(state, step), to, chain, vector);
        }
      };
      visit(s, from, []);
      continue;
    }
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
      out.map((x) => [`${x.to.row},${x.to.col},${!!x.stationary},${x.passCaptureAt?.row ?? ""},${x.passCaptureAt?.col ?? ""},${x.chain?.map((step) => `${step.to.row}:${step.to.col}`).join("|") ?? ""}`, x]),
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
    ).some((move) => move.chain?.some((step) => eq(step.passCaptureAt ?? step.to, target)) ?? eq(move.passCaptureAt ?? move.next?.passCaptureAt ?? move.next?.to ?? move.to, target));
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
        candidate.chain?.some((step) => eq(step.passCaptureAt ?? step.to, to)) ?? eq(candidate.passCaptureAt ?? candidate.to, to),
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
    const destination = move.chain?.at(-1)?.to ?? move.to;
    if (!at(s, destination)) add(destination, { move: true });
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
function raw(s: Match, m: Move): Match {
  if (m.chain?.length) return m.chain.reduce((state, step) => raw(state, step), s);
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
          const n = (x.chain ?? [x]).reduce((state, step) => raw(state, step), s),
            k = king(n, p.color);
          return !!k && !threatened(n, k, other(p.color), d);
        });
  if (p.role === "hound") {
    const ownerIndex = s.board.findIndex((piece) => piece?.id === p.dogOwnerId);
    const owner = ownerIndex < 0 ? null : { row: Math.floor(ownerIndex / 8), col: ownerIndex % 8 };
    const accelerated = !!owner && (p.dogTraining === "hunting" || p.dogTraining === "scouting") && Math.max(Math.abs(owner.row - from.row), Math.abs(owner.col - from.col)) <= 1;
    const paths: Move[] = [];
    if (p.dogTraining === "coordination" && owner) {
      const enemyNear = s.board.some((piece, index) => piece?.color === other(p.color) && Math.max(Math.abs(Math.floor(index / 8) - from.row), Math.abs(index % 8 - from.col)) <= 2);
      if (enemyNear) for (const vector of directions) {
        const to = { row: owner.row + vector.dy, col: owner.col + vector.dx };
        if (inside(to) && !at(s, to)) paths.push({ from, to, chain: [{ from, to }] });
      }
    }
    const visit = (state: Match, current: Pos, steps: Move[], previous?: Vec) => {
      if (steps.length) paths.push({ from, to: steps[0].to, chain: steps });
      if (steps.length >= 3) {
        // 索敵型は、3連鎖終了時に敵を発見済みかつ契約者へ近ければ追加2連鎖。
        const ownerNear = !!owner && Math.max(Math.abs(owner.row - current.row), Math.abs(owner.col - current.col)) <= 2;
        const found = state.board.some((piece, index) => piece?.color === other(p.color) && Math.max(Math.abs(Math.floor(index / 8) - current.row), Math.abs(index % 8 - current.col)) <= 2);
        if (p.dogTraining === "scouting" && steps.length < 5 && ownerNear && found) {
          // 下の通常連鎖生成を続け、最大5連鎖までを追加2連鎖として扱う。
        } else {
        // 狩猟型は通常3連鎖を使い切った後、同じ方向制限で捕獲専用の4連鎖目を持つ。
        if (p.dogTraining === "hunting") for (const vector of orth) {
          if (previous && vector.dx === -previous.dx && vector.dy === -previous.dy) continue;
          const to = { row: current.row + vector.dy, col: current.col + vector.dx };
          if (!inside(to) || at(state, to)?.color !== other(p.color)) continue;
          const captureStep = { from: current, to };
          const afterCapture = raw(state, captureStep);
          const exits = orth
            .filter((exit) => exit.dx !== -vector.dx || exit.dy !== -vector.dy)
            .map((exit) => ({ from: to, to: { row: to.row + exit.dy, col: to.col + exit.dx } }))
            .filter((exit) => inside(exit.to) && !at(afterCapture, exit.to));
          if (exits.length) for (const exit of exits) paths.push({ from, to: steps[0].to, chain: [...steps, captureStep, exit] });
          else paths.push({ from, to: steps[0].to, chain: [...steps, captureStep] });
        }
        return;
        }
      }
      const max = accelerated && steps.length < 2 ? 2 : 1;
      for (const vector of orth) {
        if (previous && vector.dx === -previous.dx && vector.dy === -previous.dy) continue;
        for (let distance = 1; distance <= max; distance++) {
          const to = { row: current.row + vector.dy * distance, col: current.col + vector.dx * distance };
          if (!inside(to)) break;
          const target = at(state, to);
          if (distance > 1 && at(state, { row: current.row + vector.dy * (distance - 1), col: current.col + vector.dx * (distance - 1) })) break;
          if (target?.color === p.color || (p.dogTraining === "scouting" && target)) break;
          const step: Move = { from: current, to };
          const after = raw(state, step);
          if (s.preset === "classic") {
            const royal = king(after, p.color);
            if (!royal || threatened(after, royal, other(p.color), d)) continue;
          }
          // 通常連鎖の捕獲は、その時点で終了する。
          if (target) {
            const capturedSteps = [...steps, step];
            const forcedExits: Move[] = [];
            // 狩猟型は捕獲後に、逆方向を除く1連鎖だけ移動専用で離脱できる。
            if (p.dogTraining === "hunting") {
              for (const exit of orth) {
                if (exit.dx === -vector.dx && exit.dy === -vector.dy) continue;
                const exitTo = { row: to.row + exit.dy, col: to.col + exit.dx };
                if (inside(exitTo) && !at(after, exitTo)) forcedExits.push({ from: to, to: exitTo });
              }
            }
            // 1〜2連鎖目での捕獲時は、離脱の代わりに契約者周囲へ帰還できる。
            if (p.dogTraining === "hunting" && owner && capturedSteps.length <= 2) for (const returnVector of directions) {
              const returnTo = { row: owner.row + returnVector.dy, col: owner.col + returnVector.dx };
              if (inside(returnTo) && !at(after, returnTo)) forcedExits.push({ from: to, to: returnTo });
            }
            if (forcedExits.length) for (const exit of forcedExits) paths.push({ from, to: capturedSteps[0].to, chain: [...capturedSteps, exit] });
            else paths.push({ from, to: steps.length ? steps[0].to : to, chain: capturedSteps });
          }
          else visit(after, to, [...steps, step], vector);
          if (target) break;
        }
      }
    };
    visit(s, from, []);
    // 連携型の追跡捕獲は通常の連鎖範囲を問わず対象の地点へ移動して捕獲する。
    if (p.dogTraining === "coordination") for (const track of s.dogTracks ?? []) {
      if (track.houndId !== p.id) continue;
      const targetIndex = s.board.findIndex((piece) => piece?.id === track.targetId);
      if (targetIndex >= 0) {
        const to = { row: Math.floor(targetIndex / 8), col: targetIndex % 8 };
        paths.push({ from, to, chain: [{ from, to }] });
      }
    }
    return s.preset !== "classic"
      ? paths
      : paths.filter((move) => {
          const after = (move.chain ?? [move]).reduce((state, step) => raw(state, step), s);
          const royal = king(after, p.color);
          return !!royal && !threatened(after, royal, other(p.color), d);
        });
  }
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
    const dog = definition.growth
      ? growthStages(definition.growth).slice(beforeStage, afterStage).some((stage) => stage.dogHunt)
      : !before.evolved && piece.evolved && !!definition.transformation && !!definition.dogHunt;
    return (eagle && !piece.eagleHuntUsed) || (demon && !piece.demonContractUsed) || (dog && !piece.dogHuntUsed);
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
    const dog = definition.growth
      ? growthStages(definition.growth).slice(beforeStage, afterStage).some((stage) => stage.dogHunt)
      : !!definition.transformation && !!definition.dogHunt;
    if (dog && !piece.dogHuntUsed) {
      const enemyHome = (pos: Pos) => piece.color === "white" ? pos.row <= 2 : pos.row >= 5;
      const enemyHomeVacancies = result.board.filter((occupant, index) => !occupant && (piece.color === "white" ? Math.floor(index / 8) <= 2 : Math.floor(index / 8) >= 5)).length;
      const candidates = directions
        .map((v) => ({ row: origin.row + v.dy, col: origin.col + v.dx }))
        .filter((pos) => inside(pos) && !at(result, pos) && enemyHomeVacancies - (enemyHome(pos) ? 1 : 0) >= 2);
      // 猟犬・猪・うり坊のどれか一体でも置けない契約は開始しない。
      if (candidates.length && enemyHomeVacancies >= 2) {
        result.board[contractIndex] = { ...piece, dogHuntUsed: true };
        result.pendingContract = { kind: "hound", owner: piece.color, contractorId: piece.id, training: definition.dogTraining ?? "hunting", huntId: `hunt-${piece.id}-${match.ply ?? 0}`, origin, candidates };
        return result;
      }
    }
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
  if (pending.kind === "hound") {
    const huntId = pending.huntId!;
    board[idx(to)] = { id: `hound-${Date.now()}`, color: pending.owner, role: "hound", moved: false, dogOwnerId: pending.contractorId, dogTraining: pending.training as "hunting" | "coordination" | "scouting", dogHuntId: huntId, contractName: "猟犬" };
    const recipient = other(pending.owner);
    const candidates = Array.from({ length: 64 }, (_, i) => ({ row: Math.floor(i / 8), col: i % 8 })).filter((pos) => !at({ ...s, board }, pos) && (recipient === "white" ? pos.row >= 5 : pos.row <= 2));
    return { ...s, board, pendingContract: candidates.length ? { kind: "boar", owner: recipient, contractorId: pending.contractorId, huntId, origin: pending.origin, candidates } : undefined };
  }
  if (pending.kind === "boar") {
    const boarId = `boar-${Date.now()}`;
    board[idx(to)] = { id: boarId, color: pending.owner, role: "boar", moved: false, dogHuntId: pending.huntId, contractName: "猪" };
    const candidates = Array.from({ length: 64 }, (_, i) => ({ row: Math.floor(i / 8), col: i % 8 })).filter((pos) => !at({ ...s, board }, pos) && (pending.owner === "white" ? pos.row >= 5 : pos.row <= 2));
    return { ...s, board, pendingContract: candidates.length ? { kind: "piglet", owner: pending.owner, contractorId: pending.contractorId, huntId: pending.huntId, origin: pending.origin, candidates } : undefined };
  }
  if (pending.kind === "piglet") {
    const boar = board.find((piece) => piece?.role === "boar" && piece.dogHuntId === pending.huntId);
    board[idx(to)] = { id: `piglet-${Date.now()}`, color: pending.owner, role: "piglet", moved: false, dogHuntId: pending.huntId, boarId: boar?.id, contractName: "うり坊" };
    return { ...s, board, pendingContract: undefined };
  }
  if (pending.kind === "raptor") {
    const name = ["鷲", "鷹", "隼"][Math.floor(Math.random() * 3)];
    const id = `raptor-${Date.now()}`;
    board[idx(to)] = { id, color: pending.owner, role: "raptor", moved: false, eagleOwnerId: pending.contractorId, eagleTraining: pending.training as "coordination" | "hunting" | "support" | undefined, contractName: name };
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
  const steps = m.chain?.length ? m.chain : [m, ...(m.next ? [m.next] : [])];
  const p = at(s, steps[0].from)!;
  let before = s;
  const captures: Piece[] = [];
  for (const step of steps) {
    const captured = step.passCaptureAt ? at(before, step.passCaptureAt) : (step.swap || step.transit || step.stationary ? null : at(before, step.to));
    if (captured) captures.push(captured);
    before = raw(before, step);
  }
  const lastStep = steps[steps.length - 1],
    enemy = other(p.color),
    royalCaptures = captures.filter((cap) => isRoyal(cap, d));
  let n = before;
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
    const positions = steps.map((step) => step.stationary ? step.from : (step.recoilTo ?? step.to));
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
  // うり坊は、紐付いた猪が取られるか、同じ猪が累計2体を捕獲した時点で猪化する。
  const capturedBoars = captures.filter((piece) => piece.role === "boar").map((piece) => piece.id);
  n.board = n.board.map((piece) => {
    if (!piece || piece.role !== "piglet") return piece;
    const pairedBoar = n.board.find((candidate) => candidate?.id === piece.boarId);
    if (capturedBoars.includes(piece.boarId ?? "") || (pairedBoar?.boarCaptures ?? 0) >= 2 || (p.role === "boar" && piece.boarId === p.id && (p.boarCaptures ?? 0) + capturedCount >= 2))
      return { ...piece, role: "boar", contractName: "猪" };
    return piece;
  });
  const movedPigletIndex = n.board.findIndex((piece) => piece?.id === p.id);
  if (p.role === "piglet" && capturedCount && movedPigletIndex >= 0)
    n.board[movedPigletIndex] = { ...n.board[movedPigletIndex]!, role: "boar", contractName: "猪" };
  const movedBoarIndex = n.board.findIndex((piece) => piece?.id === p.id);
  if (p.role === "boar" && capturedCount && movedBoarIndex >= 0)
    n.board[movedBoarIndex] = { ...n.board[movedBoarIndex]!, boarCaptures: (n.board[movedBoarIndex]!.boarCaptures ?? 0) + capturedCount };
  n = { ...n, stats };
  // 封印は捕獲地点を中心に3×3、相手の次の手番終了まで継続する。
  const moverDefinition = p.role === "custom" ? d.find((item) => item.id === p.definitionId) : undefined;
  if (capturedCount && moverDefinition?.seal && p.evolved && !(p.sealedUntil && (s.ply ?? 0) <= p.sealedUntil)) {
    const center = lastStep.passCaptureAt ?? lastStep.to;
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
    const origin = lastStep.passCaptureAt ?? lastStep.to;
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
    const origin = lastStep.to;
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
      !m.chain && !m.next &&
      !m.stationary &&
      p.role === "pawn" &&
      Math.abs(m.to.row - m.from.row) === 2
        ? { row: (m.to.row + m.from.row) / 2, col: m.from.col }
        : null,
    history: [
      ...n.history,
      steps.map((step, index) => `${index ? "→" : ""}${f(step.from.col)}${8 - step.from.row}${step.stationary ? "×" : "-"}${f(step.to.col)}${8 - step.to.row}`).join(""),
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
  n.trackingTargets = (n.trackingTargets ?? []).flatMap((item) => {
      const tracker = n.board.find((piece) => piece?.id === item.trackerId);
      if (!tracker || tracker.color !== p.color) return item;
      const remaining = item.remaining - 1;
      return remaining > 0 ? [{ ...item, remaining: remaining as 1 | 2 }] : [];
    }).flatMap((item) => Array.isArray(item) ? item : [item])
    .filter((item) => item.remaining > 0 && n.board.some((piece) => piece?.id === item.trackerId) && n.board.some((piece) => piece?.id === item.targetId));

  // 2) 今終了した手番の相手が前手番終了時に監視した敵について、
  //    固定跳躍射程外へ逃げ、かつ追跡者から3マス以内なら追跡成立。
  const remainingWatches: NonNullable<Match["trackingWatches"]> = [];
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
  // 犬猟追跡。索敵型は猟犬の連鎖終了地点で近接敵を発見し、契約者に近ければ共有する。
  // 連携型は猟犬・契約者の双方の近接監視を同じ契約IDに記録する。
  let dogTracks = (n.dogTracks ?? []).filter((track) => {
    const houndIndex = n.board.findIndex((piece) => piece?.id === track.houndId), ownerIndex = n.board.findIndex((piece) => piece?.id === track.ownerId), targetIndex = n.board.findIndex((piece) => piece?.id === track.targetId);
    if (houndIndex < 0 || ownerIndex < 0 || targetIndex < 0) return false;
    const hound = n.board[houndIndex]!;
    if (track.remaining && hound.color === p.color) return false;
    // 索敵型は対象を犬が見失った瞬間、共有済み情報を含めて解除する。
    if (hound.dogTraining === "scouting") {
      const houndPos = { row: Math.floor(houndIndex / 8), col: houndIndex % 8 }, targetPos = { row: Math.floor(targetIndex / 8), col: targetIndex % 8 };
      if (Math.max(Math.abs(houndPos.row - targetPos.row), Math.abs(houndPos.col - targetPos.col)) > 2) return false;
    }
    return true;
  });
  const dogWatches = (n.dogWatches ?? []).filter((watch) => n.board.some((piece) => piece?.id === watch.houndId) && n.board.some((piece) => piece?.id === watch.ownerId) && n.board.some((piece) => piece?.id === watch.targetId));
  // 相手が動かした監視対象だけを、次の自分手番限定の追跡対象にする。
  for (const watch of dogWatches.filter((item) => n.board.find((piece) => piece?.id === item.houndId)?.color === enemy)) {
    const targetIndex = n.board.findIndex((piece) => piece?.id === watch.targetId), houndIndex = n.board.findIndex((piece) => piece?.id === watch.houndId), ownerIndex = n.board.findIndex((piece) => piece?.id === watch.ownerId);
    if (targetIndex < 0 || houndIndex < 0 || ownerIndex < 0) continue;
    const targetPos = { row: Math.floor(targetIndex / 8), col: targetIndex % 8 }, houndPos = { row: Math.floor(houndIndex / 8), col: houndIndex % 8 }, ownerPos = { row: Math.floor(ownerIndex / 8), col: ownerIndex % 8 };
    const moved = targetPos.row !== watch.row || targetPos.col !== watch.col;
    const near = Math.max(Math.abs(houndPos.row - targetPos.row), Math.abs(houndPos.col - targetPos.col)) <= 2 || Math.max(Math.abs(ownerPos.row - targetPos.row), Math.abs(ownerPos.col - targetPos.col)) <= 2;
    if (moved && near) dogTracks.push({ huntId: watch.huntId, houndId: watch.houndId, ownerId: watch.ownerId, targetId: watch.targetId, shared: false, remaining: 1 });
  }
  n.board.forEach((hound, houndIndex) => {
    if (!hound || hound.role !== "hound" || hound.color !== p.color || !hound.dogOwnerId || !hound.dogHuntId) return;
    if (hound.dogTraining === "scouting" && p.id !== hound.id) return;
    const ownerIndex = n.board.findIndex((piece) => piece?.id === hound.dogOwnerId);
    if (ownerIndex < 0) return;
    const houndPos = { row: Math.floor(houndIndex / 8), col: houndIndex % 8 }, ownerPos = { row: Math.floor(ownerIndex / 8), col: ownerIndex % 8 };
    for (let i = 0; i < 64; i++) {
      const target = n.board[i];
      if (!target || target.color === hound.color || isRoyal(target, d)) continue;
      const targetPos = { row: Math.floor(i / 8), col: i % 8 };
      const scoutStops = p.id === hound.id ? steps.map((step) => step.recoilTo ?? step.to) : [houndPos];
      const houndNear = scoutStops.some((stop) => Math.max(Math.abs(stop.row - targetPos.row), Math.abs(stop.col - targetPos.col)) <= 2);
      if (hound.dogTraining === "scouting" ? houndNear : false) {
        const shared = hound.dogTraining === "scouting" && houndNear && Math.max(Math.abs(houndPos.row - ownerPos.row), Math.abs(houndPos.col - ownerPos.col)) <= 2;
        const existing = dogTracks.find((track) => track.houndId === hound.id && track.targetId === target.id);
        if (existing) existing.shared ||= shared;
        else {
          // 猟犬ごとの追跡対象は新しいものを優先し、最大2体まで。
          const oldest = dogTracks.findIndex((track) => track.houndId === hound.id);
          if (dogTracks.filter((track) => track.houndId === hound.id).length >= 2 && oldest >= 0) dogTracks.splice(oldest, 1);
          dogTracks.push({ huntId: hound.dogHuntId, houndId: hound.id, ownerId: hound.dogOwnerId, targetId: target.id, shared });
        }
      }
    }
  });
  // 今回新規に発見した対象にも、手番終了時点の「犬から2マス以内」を適用する。
  dogTracks = dogTracks.filter((track) => {
    const houndIndex = n.board.findIndex((piece) => piece?.id === track.houndId), targetIndex = n.board.findIndex((piece) => piece?.id === track.targetId);
    if (houndIndex < 0 || targetIndex < 0) return false;
    const hound = n.board[houndIndex]!;
    if (hound.dogTraining !== "scouting") return true;
    return Math.max(Math.abs(Math.floor(houndIndex / 8) - Math.floor(targetIndex / 8)), Math.abs(houndIndex % 8 - targetIndex % 8)) <= 2;
  });
  n.dogTracks = dogTracks;
  // 連携型の監視は、手番を終えた側の猟犬／契約者から2マス以内の敵を最大2体保存する。
  // 両陣営の旧監視は、昇格判定後に破棄する。手番を終えた側の監視だけを以下で作り直す。
  const nextDogWatches: NonNullable<Match["dogWatches"]> = [];
  n.dogWatches = nextDogWatches;
  n.board.forEach((hound, houndIndex) => {
    if (!hound || hound.role !== "hound" || hound.color !== p.color || hound.dogTraining !== "coordination" || !hound.dogOwnerId || !hound.dogHuntId) return;
    const ownerIndex = n.board.findIndex((piece) => piece?.id === hound.dogOwnerId);
    if (ownerIndex < 0) return;
    const houndPos = { row: Math.floor(houndIndex / 8), col: houndIndex % 8 }, ownerPos = { row: Math.floor(ownerIndex / 8), col: ownerIndex % 8 };
    for (let i = 0; i < 64; i++) {
      const target = n.board[i]; if (!target || target.color === p.color || isRoyal(target, d)) continue;
      const pos = { row: Math.floor(i / 8), col: i % 8 };
      if (Math.max(Math.abs(houndPos.row - pos.row), Math.abs(houndPos.col - pos.col)) > 2 && Math.max(Math.abs(ownerPos.row - pos.row), Math.abs(ownerPos.col - pos.col)) > 2) continue;
      const own = nextDogWatches.filter((watch) => watch.houndId === hound.id);
      if (own.length >= 2) nextDogWatches.splice(nextDogWatches.findIndex((watch) => watch.houndId === hound.id), 1);
      nextDogWatches.push({ huntId: hound.dogHuntId, houndId: hound.id, ownerId: hound.dogOwnerId, targetId: target.id, row: pos.row, col: pos.col });
    }
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
