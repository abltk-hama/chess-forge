import type {
  Definition,
  EvolutionCondition,
  Pattern,
  Range,
  Usage,
  Vec,
} from "./types";
export const RESERVED_SYMBOLS = ["KI", "QU", "RO", "BI", "KN", "PO"] as const;
export const MAX_DEFINITIONS = 16;
export const COST = {
  usageRange: {
    both: { 1: 1, 2: 4, 3: 5, slide: 0 },
    move: { 1: 1, 2: 3, 3: 4, slide: 0 },
    capture: { 1: 1, 2: 3, 3: 4, slide: 0 },
    stationary: { 1: 1, 2: 4, 3: 5, slide: 0 },
  } as Record<Usage, Record<Range, number>>,
  usageLeap: { both: 3, move: 2, capture: 3, stationary: 3 } as Record<
    Usage,
    number
  >,
  secondPhaseBase: 3,
  slideBase: 5,
  jumpDirectionBase: 2,
  allyJumpPerPiece: 1,
  enemyJumpPerPiece: 2,
  cannonBase: 5,
  cannonDirection: 1,
  crown: 25,
  budget: 30,
};
const key = (v: Vec) => `${v.dx},${v.dy}`;
export const unique = (v: Vec[]) => [
  ...new Map(v.filter((x) => x.dx || x.dy).map((x) => [key(x), x])).values(),
];
export function normalize(d: Definition): Definition {
  return {
    ...d,
    name: d.name.trim(),
    symbol: d.symbol.trim().toUpperCase().slice(0, 2),
    patterns: d.patterns.map((p) => ({ ...p, vectors: unique(p.vectors) })),
    growth: d.growth
      ? { ...d.growth, unlocks: { ...d.growth.unlocks } }
      : undefined,
  };
}
export function evolvedDefinition(d: Definition): Definition {
  if (!d.growth) return d;
  return {
    ...d,
    isCrown: d.isCrown || !!d.growth.unlockCrown,
    growth: undefined,
    patterns: d.patterns.flatMap((pattern, index): Pattern[] => {
      const unlock = d.growth?.unlocks[index];
      if (!unlock) return [pattern];
      const usage = unlock.capture
        ? "both"
        : pattern.usage;
      const evolvedPattern: Pattern =
        pattern.kind === "leap"
          ? { ...pattern, usage }
          : {
            ...pattern,
            usage,
            growthCannon: undefined,
            cannon: pattern.cannon || unlock.cannon,
            jumpAllies: Math.max(
              jumpLimit(pattern.jumpAllies, pattern.canJump),
              unlock.jumpAllies ?? 0,
            ) as 0 | 1 | 2,
            jumpEnemies: Math.max(
              jumpLimit(pattern.jumpEnemies, pattern.canJump),
              unlock.jumpEnemies ?? 0,
            ) as 0 | 1 | 2,
          };
      return unlock.stationary
        ? [evolvedPattern, { ...evolvedPattern, usage: "stationary" }]
        : [evolvedPattern];
    }),
  };
}
export function conditionDifficulty(condition: EvolutionCondition) {
  if (condition.kind === "captures")
    return condition.subject === "self"
      ? Math.min(3, condition.threshold)
      : Math.min(4, Math.ceil(condition.threshold / 2));
  if (condition.kind === "losses")
    return Math.min(4, Math.ceil(condition.threshold / 2));
  if (condition.kind === "territory") {
    const base = 4 - condition.depth;
    return Math.min(4, base + (condition.subject === "king" ? 1 : 0));
  }
  if (condition.kind === "evolutions")
    return Math.min(
      4,
      condition.threshold + (condition.side === "enemy" ? 1 : 0),
    );
  const density = condition.threshold / (condition.radius * 2 + 1);
  const base = density >= 1 ? 3 : density >= 0.6 ? 2 : 1;
  return Math.min(4, base + (condition.center === "king" ? 1 : 0));
}
const GROWTH_RATE = [0, 0.85, 0.65, 0.5, 0.35];
export function growthCost(d: Definition) {
  const base = cost({ ...d, growth: undefined });
  if (!d.growth) return { base, premium: 0, total: base, difficulty: 0 };
  const evolved = cost(evolvedDefinition(d));
  const rawPremium = Math.max(0, evolved - base);
  const difficulty = conditionDifficulty(d.growth.condition);
  let premium = Math.ceil(rawPremium * GROWTH_RATE[difficulty]);
  if (d.growth.unlockCrown || Object.keys(d.growth.unlocks).length)
    premium = Math.max(1, premium);
  if (d.growth.unlockCrown) premium = Math.max(10, premium);
  return { base, premium, total: base + premium, difficulty };
}
export const definitionCost = (definition: Definition) =>
  growthCost(definition).total;
export function cost(d: Definition) {
  if (
    d.patterns.some(
      (p) =>
        p.kind === "direction" &&
        (p.canJump !== undefined ||
          typeof p.jumpAllies === "boolean" ||
          typeof p.jumpEnemies === "boolean"),
    )
  )
    return legacyCost(d);
  let n = d.isCrown ? COST.crown : 0,
    cannon = false,
    slide = false;
  for (const p of normalize(d).patterns) {
    const usage = p.usage ?? "both";
    if (p.kind === "leap") {
      const unit = COST.usageLeap[usage];
      n += p.vectors.length * (p.initialOnly ? Math.ceil(unit / 2) : unit);
      if (p.phase === 2) n += COST.secondPhaseBase;
    } else {
      if (p.range === "slide") {
        slide = true;
        n += p.vectors.reduce((sum, vector) => {
          const unit = slideDirectionCost(vector, usage);
          return sum + (p.initialOnly ? Math.ceil(unit / 2) : unit);
        }, 0);
      } else {
        const unit = COST.usageRange[usage][p.range];
        n += p.vectors.length * (p.initialOnly ? Math.ceil(unit / 2) : unit);
      }
      if (p.phase === 2) n += COST.secondPhaseBase;
      if (p.cannon) {
        cannon = true;
        n += p.vectors.length * COST.cannonDirection;
      }
      if (p.range !== 1) {
        const allies = jumpLimit(p.jumpAllies, p.canJump);
        const enemies = jumpLimit(p.jumpEnemies, p.canJump);
        if (allies || enemies) {
          const premium =
            COST.jumpDirectionBase +
            allies * COST.allyJumpPerPiece +
            enemies * COST.enemyJumpPerPiece;
          n +=
            p.vectors.length *
            (p.initialOnly ? Math.ceil(premium / 2) : premium);
        }
      }
    }
  }
  return n + (slide ? COST.slideBase : 0) + (cannon ? COST.cannonBase : 0);
}
function slideDirectionCost(vector: Vec, usage: Usage) {
  const full = usage === "both" || usage === "stationary";
  const base =
    vector.dx && vector.dy
      ? 4
      : vector.dy < 0
        ? 6
        : vector.dy > 0
          ? 5
          : vector.dx
            ? 3
            : 0;
  return full ? base : Math.max(0, base - 1);
}
function legacyCost(d: Definition) {
  const rangeCost: Record<Range, number> = { 1: 1, 2: 2, 3: 4, slide: 5 };
  const allyPremium: Record<Range, number> = { 1: 0, 2: 1, 3: 2, slide: 3 };
  const enemyPremium: Record<Range, number> = { 1: 0, 2: 2, 3: 4, slide: 6 };
  let total = d.isCrown ? COST.crown : 0,
    allies = false,
    enemies = false,
    legacy = false,
    cannon = false;
  for (const p of normalize(d).patterns) {
    const usage = p.usage ?? "both";
    if (p.kind === "leap") {
      const unit = usage === "move" ? 2 : 3;
      total += p.vectors.length * (p.initialOnly ? Math.ceil(unit / 2) : unit);
      continue;
    }
    const unit =
      usage === "move"
        ? ({ 1: 1, 2: 1, 3: 2, slide: 3 } as Record<Range, number>)[p.range]
        : usage === "capture"
          ? ({ 1: 1, 2: 2, 3: 3, slide: 4 } as Record<Range, number>)[p.range]
          : rangeCost[p.range];
    total += p.vectors.length * (p.initialOnly ? Math.ceil(unit / 2) : unit);
    if (p.cannon) {
      cannon = true;
      total += p.vectors.length;
    }
    if (
      p.canJump !== undefined &&
      p.jumpAllies === undefined &&
      p.jumpEnemies === undefined
    )
      legacy ||= !!p.canJump;
    else if (p.range !== 1) {
      if (p.jumpAllies) {
        allies = true;
        total += p.vectors.length * allyPremium[p.range];
      }
      if (p.jumpEnemies) {
        enemies = true;
        total += p.vectors.length * enemyPremium[p.range];
      }
    }
  }
  return (
    total +
    (legacy ? 15 : 0) +
    (allies ? 5 : 0) +
    (enemies ? 5 : 0) +
    (cannon ? 5 : 0)
  );
}
export const jumpLimit = (
  value: 0 | 1 | 2 | boolean | undefined,
  legacy?: boolean,
): 0 | 1 | 2 =>
  value === true || (value === undefined && legacy)
    ? 2
    : value === 1 || value === 2
      ? value
      : 0;
export function errors(d: Definition, all: Definition[] = []) {
  const n = normalize(d),
    e: string[] = [];
  if (!n.name || n.name.length > 20) e.push("名前は1～20文字です。");
  if (!/^[A-Z]{1,2}$/.test(n.symbol)) e.push("記号は英字1～2文字です。");
  if ((RESERVED_SYMBOLS as readonly string[]).includes(n.symbol))
    e.push("標準駒の予約記号は使用できません。");
  if (all.some((x) => x.id !== n.id && x.symbol.toUpperCase() === n.symbol))
    e.push("記号が重複しています。");
  if (n.patterns.length < 1 || n.patterns.length > 4)
    e.push("移動セットは1～4個です。");
  if (
    n.patterns.some(
      (p) =>
        p.kind === "direction" &&
        ([p.jumpAllies, p.jumpEnemies] as unknown[]).some(
          (value) =>
            value !== undefined &&
            value !== false &&
            value !== true &&
            value !== 0 &&
            value !== 1 &&
            value !== 2,
        ),
    )
  )
    e.push("飛び越し上限は0～2枚です。");
  if (
    n.patterns.some(
      (p) =>
        p.kind === "direction" &&
        p.cannon &&
        ((p.usage ?? "both") === "move" ||
          p.jumpAllies ||
          p.jumpEnemies ||
          p.canJump),
    )
  )
    e.push("キャノンは移動専用・飛び越しと併用できません。");
  if (
    n.patterns.some((p) => p.kind === "direction" && p.cannon && p.phase === 2)
  )
    e.push("キャノンは2回目の移動に設定できません。");
  if (
    n.patterns.some(
      (p) =>
        p.kind === "direction" &&
        p.cannon &&
        (p.usage ?? "both") === "stationary",
    )
  )
    e.push("キャノンと静止捕獲は併用できません。");
  if (!n.patterns.some((p) => p.vectors.length)) e.push("移動先が必要です。");
  if (n.growth) {
    const unlocks = Object.entries(n.growth.unlocks);
    if (!n.growth.unlockCrown && !unlocks.length)
      e.push("成長後に解放する能力が必要です。");
    for (const [key, unlock] of unlocks) {
      const pattern = n.patterns[Number(key)];
      if (!pattern) {
        e.push("存在しない移動セットへ成長能力が設定されています。");
        continue;
      }
      if ((unlock.capture || unlock.stationary) && (pattern.usage ?? "both") !== "move")
        e.push("捕獲解放は移動専用セットにだけ設定できます。");
      if (unlock.capture && unlock.stationary)
        e.push("通常捕獲と静止捕獲は同時解放できません。");
      if ((unlock.cannon || unlock.jumpAllies || unlock.jumpEnemies) && pattern.kind !== "direction")
        e.push("キャノン・飛び越し解放は方向移動専用です。");
      if (pattern.kind === "direction" && pattern.range === 1 && (unlock.cannon || unlock.jumpAllies || unlock.jumpEnemies))
        e.push("1マス移動へキャノン・飛び越しは設定できません。");
      if (unlock.cannon && (unlock.jumpAllies || unlock.jumpEnemies))
        e.push("同じセットでキャノンと飛び越しは解放できません。");
      if (
        pattern.kind === "direction" &&
        ((unlock.cannon &&
          (pattern.phase === 2 ||
            pattern.cannon ||
            pattern.jumpAllies ||
            pattern.jumpEnemies ||
            pattern.canJump)) ||
          ((unlock.jumpAllies || unlock.jumpEnemies) && pattern.cannon))
      )
        e.push("成長キャノンは2回目移動・飛び越しと併用できません。");
    }
  }
  if (growthCost(n).total > 30) e.push("コストが30を超えています。");
  return e;
}
