import type {
  Definition,
  EvolutionCondition,
  Growth,
  GrowthStage,
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
const preparePatternForEditing = (pattern: Pattern): Pattern => {
  if (pattern.kind === "leap")
    return { ...pattern, vectors: pattern.vectors.map((vector) => ({ ...vector })) };
  const { canJump: _legacyCanJump, ...current } = pattern;
  return {
    ...current,
    vectors: pattern.vectors.map((vector) => ({ ...vector })),
    jumpAllies:
      pattern.range === 1 ? 0 : jumpLimit(pattern.jumpAllies, pattern.canJump),
    jumpEnemies:
      pattern.range === 1 ? 0 : jumpLimit(pattern.jumpEnemies, pattern.canJump),
  };
};
/** Converts legacy jump fields to the canonical numeric form once editing begins. */
export function prepareDefinitionForEditing(d: Definition): Definition {
  return {
    ...structuredClone(d),
    patterns: d.patterns.map(preparePatternForEditing),
    transformation: d.transformation
      ? {
          ...structuredClone(d.transformation),
          patterns: d.transformation.patterns.map(preparePatternForEditing),
        }
      : undefined,
    summoning: d.summoning
      ? {
          ...structuredClone(d.summoning),
          patterns: d.summoning.patterns.map(preparePatternForEditing),
        }
      : undefined,
  };
}
export function migrateDefinition(d: Definition): Definition {
  return {
    ...d,
    patterns: d.patterns.map((pattern) =>
      pattern.phase === 2 && (pattern.secondTrigger ?? "normal") === "normal"
        ? { ...pattern, usage: "move" as const }
        : pattern,
    ),
  };
}
export function normalize(d: Definition): Definition {
  return {
    ...d,
    name: d.name.trim(),
    symbol: d.symbol.trim().toUpperCase().slice(0, 2),
    patterns: d.patterns.map((p) => ({ ...p, vectors: unique(p.vectors) })),
    growth: d.growth
      ? {
          ...d.growth,
          unlocks: { ...d.growth.unlocks },
          stages: d.growth.stages?.slice(0, 2).map((stage) => ({
            ...stage,
            condition: { ...stage.condition },
            unlocks: Object.fromEntries(
              Object.entries(stage.unlocks).map(([index, unlock]) => [
                index,
                { ...unlock, vectors: unlock.vectors ? unique(unlock.vectors) : undefined },
              ]),
            ),
          })),
        }
      : undefined,
    transformation: d.transformation
      ? {
          ...d.transformation,
          name: d.transformation.name.trim(),
          symbol: d.transformation.symbol.trim().toUpperCase().slice(0, 2),
          patterns: d.transformation.patterns.map((pattern) => ({
            ...pattern,
            vectors: unique(pattern.vectors),
          })),
        }
      : undefined,
    summoning: d.summoning
      ? { ...d.summoning, name: d.summoning.name.trim(), symbol: d.summoning.symbol.trim().toUpperCase().slice(0, 2), patterns: d.summoning.patterns.map((p) => ({ ...p, vectors: unique(p.vectors) })) }
      : undefined,
  };
}
export function transformedDefinition(d: Definition): Definition {
  if (!d.transformation) return d;
  return {
    ...d,
    name: d.transformation.name,
    symbol: d.transformation.symbol,
    patterns: d.transformation.patterns,
    growth: undefined,
    transformation: undefined,
  };
}
export function summonedDefinition(d: Definition): Definition {
  if (!d.summoning) return d;
  return { ...d, name: d.summoning.name, symbol: d.summoning.symbol, patterns: d.summoning.patterns, isCrown: false, growth: undefined, transformation: undefined, summoning: undefined };
}
export const SUMMON_LIMITS = {
  summon: [0, 11, 13, 15, 18],
  inherit: [0, 11, 13, 15, 18],
  split: [0, 7, 9, 11, 12],
} as const;
export function summonLimit(d: Definition) {
  return d.summoning ? SUMMON_LIMITS[d.summoning.timing][conditionDifficulty(d.summoning.condition)] : 0;
}
export function growthStages(growth: Growth): GrowthStage[] {
  return growth.stages?.length
    ? growth.stages.slice(0, 2)
    : [{
        condition: growth.condition,
        unlockCrown: growth.unlockCrown,
        unlocks: growth.unlocks,
        localSwap: growth.localSwap,
        globalSwap: growth.globalSwap,
      }];
}
export function evolvedDefinition(d: Definition, requestedStage?: number): Definition {
  if (!d.growth) return d;
  const stages = growthStages(d.growth);
  const stage = stages[Math.max(0, Math.min(stages.length, requestedStage ?? stages.length) - 1)];
  if (!stage) return { ...d, growth: undefined };
  return {
    ...d,
    isCrown: d.isCrown || !!stage.unlockCrown,
    growth: undefined,
    patterns: d.patterns.flatMap((pattern, index): Pattern[] => {
      const unlock = stage.unlocks[index];
      if (!unlock) return [pattern];
      const usage = unlock.capture
        ? "both"
        : pattern.usage;
      const evolvedPattern: Pattern =
        pattern.kind === "leap"
          ? { ...pattern, usage, vectors: unlock.vectors ?? pattern.vectors }
          : {
            ...pattern,
            range: unlock.range ?? pattern.range,
            usage,
            growthCannon: !!unlock.cannon,
            cannon: pattern.cannon,
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
        ? [
            { ...evolvedPattern, growthStationaryBase: true },
            { ...evolvedPattern, usage: "stationary" },
          ]
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
export function growthCost(d: Definition) {
  const base = cost({ ...d, growth: undefined });
  if (!d.growth) return { base, premium: 0, total: base, difficulty: 0, stages: [] };
  let previous = base;
  const stages = growthStages(d.growth).map((stage, index) => {
    const evolved = cost(evolvedDefinition(d, index + 1)) +
      (stage.localSwap ? 3 : 0) + (stage.globalSwap ? 5 : 0);
    const gap = Math.max(0, evolved - previous);
    const difficulty = conditionDifficulty(stage.condition);
    const discount = Math.floor(gap * Math.min(0.8, difficulty * 0.2));
    let charge = Math.max(gap ? 1 : 0, gap - discount);
    if (stage.unlockCrown && !growthStages(d.growth!)[index - 1]?.unlockCrown)
      charge = Math.max(10, charge);
    previous = Math.max(previous, evolved);
    return { level: index + 1, evaluated: evolved, gap, difficulty, discount, charge };
  });
  const premium = stages.reduce((sum, stage) => sum + stage.charge, 0);
  return {
    base,
    premium,
    total: base + premium,
    difficulty: stages.at(-1)?.difficulty ?? 0,
    stages,
  };
}
export const definitionCost = (definition: Definition) =>
  definition.growth
    ? growthCost(definition).total
    : cost({ ...definition, transformation: undefined, summoning: undefined }) + (definition.summoning ? (definition.summoning.timing === "split" ? 0 : 5) + (definition.summoning.range === "movement" ? 3 : 0) : 0);
export function transformationLimit(d: Definition) {
  if (!d.transformation) return 30;
  return [30, 24, 26, 28, 29][conditionDifficulty(d.transformation.condition)];
}
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
    if (p.growthStationaryBase) continue;
    const usage = p.usage ?? "both";
    if (p.kind === "leap") {
      const unit = COST.usageLeap[usage];
      let value = p.vectors.length * (p.initialOnly || p.evolvedInitialOnly ? Math.ceil(unit / 2) : unit);
      if (p.phase === 2 && p.secondTrigger && p.secondTrigger !== "normal" && !p.initialOnly && !p.evolvedInitialOnly) value = Math.ceil(value / 2);
      n += value;
      if (p.phase === 2 && (!p.secondTrigger || p.secondTrigger === "normal")) n += COST.secondPhaseBase;
    } else {
      if (p.range === "slide") {
        slide = true;
        const slideCost = p.vectors.reduce((sum, vector) => {
          const rawUnit = slideDirectionCost(vector, usage);
          const unit = p.phase === 2 && (p.secondTrigger ?? "normal") === "normal" && usage === "move"
            ? Math.max(1, rawUnit - 1)
            : rawUnit;
          return sum + (p.initialOnly || p.evolvedInitialOnly ? Math.ceil(unit / 2) : unit);
        }, 0);
        n += p.phase === 2 && p.secondTrigger && p.secondTrigger !== "normal" && !p.initialOnly && !p.evolvedInitialOnly ? Math.ceil(slideCost / 2) : slideCost;
      } else {
        const rawUnit = COST.usageRange[usage][p.range];
        const unit = p.phase === 2 && (p.secondTrigger ?? "normal") === "normal" && usage === "move"
          ? Math.max(1, rawUnit - 1)
          : rawUnit;
        let value = p.vectors.length * (p.initialOnly || p.evolvedInitialOnly ? Math.ceil(unit / 2) : unit);
        if (p.phase === 2 && p.secondTrigger && p.secondTrigger !== "normal" && !p.initialOnly && !p.evolvedInitialOnly) value = Math.ceil(value / 2);
        n += value;
      }
      if (p.phase === 2 && (!p.secondTrigger || p.secondTrigger === "normal")) n += COST.secondPhaseBase;
      if (p.cannon || p.growthCannon) {
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
  const evolution = d.growth ?? d.transformation;
  return n + (slide ? COST.slideBase : 0) + (cannon ? COST.cannonBase : 0) + (evolution?.localSwap ? 3 : 0) + (evolution?.globalSwap ? 5 : 0);
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
export function errors(d: Definition, all: Definition[] = [], evolvedContext = false) {
  const n = normalize(d),
    e: string[] = [];
  if (!n.name || n.name.length > 20) e.push("名前は1～20文字です。");
  if (!/^[A-Z]{1,2}$/.test(n.symbol)) e.push("記号は英字1～2文字です。");
  if ((RESERVED_SYMBOLS as readonly string[]).includes(n.symbol))
    e.push("標準駒の予約記号は使用できません。");
  if (all.some((x) => x.id !== n.id && x.symbol.toUpperCase() === n.symbol))
    e.push("記号が重複しています。");
  if (
    all.some(
      (x) =>
        x.id !== n.id &&
        x.transformation?.symbol.toUpperCase() === n.symbol,
    )
  )
    e.push("通常記号が別の駒の変身後記号と重複しています。");
  if (n.patterns.length < 1 || n.patterns.length > 4)
    e.push("移動セットは1～4個です。");
  if (n.patterns.some((p) => p.evolvedInitialOnly || p.evolutionOnly || (p.secondTrigger && p.secondTrigger !== "normal")) && !n.growth && !n.transformation)
    e.push("進化限定の移動設定には成長または変身が必要です。");
  if (n.patterns.some((p) => p.secondTrigger === "flight" && p.phase !== 2))
    e.push("飛翔は2回目の移動にだけ設定できます。");
  if (n.patterns.some((p) => p.secondTrigger === "after-capture" && ((p.usage ?? "both") !== "move" || p.phase !== 2)))
    e.push("捕獲後移動は2回目の移動専用セットに設定してください。");
  if (!evolvedContext && n.patterns.some((p) => p.phase === 2 && (p.secondTrigger ?? "normal") === "normal" && (p.usage ?? "both") !== "move"))
    e.push("通常の2回目移動は移動専用にしてください。捕獲は成長または変身後に設定できます。");
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
    const stages = growthStages(n.growth);
    if (stages.length < 1 || stages.length > 2) e.push("成長段階は1～2段階です。");
    const signature = (condition: EvolutionCondition) =>
      condition.kind === "captures" ? `${condition.kind}:${condition.subject}` :
      condition.kind === "territory" ? `${condition.kind}:${condition.subject}` :
      condition.kind === "evolutions" ? `${condition.kind}:${condition.side}` :
      condition.kind === "nearbyEnemies" ? `${condition.kind}:${condition.center}:${condition.radius}` : condition.kind;
    const strictness = (condition: EvolutionCondition) => condition.kind === "territory" ? 4 - condition.depth : condition.threshold;
    if (stages.some((stage) => signature(stage.condition) !== signature(stages[0].condition)))
      e.push("全成長段階で条件の種類・対象・範囲を共通にしてください。");
    if (stages.some((stage, index) => index > 0 && strictness(stage.condition) <= strictness(stages[index - 1].condition)))
      e.push("後の成長段階には、前段階より厳しい条件値が必要です。");
    if (stages.length === 2) {
      const [first, second] = stages;
      if ((first.unlockCrown && !second.unlockCrown) || (first.localSwap && !second.localSwap) || (first.globalSwap && !second.globalSwap))
        e.push("段階2の能力は段階1から累積させてください。");
      for (const [key, unlock] of Object.entries(first.unlocks)) {
        const next = second.unlocks[Number(key)] ?? {};
        const rank = (range: Range | undefined) => range === "slide" ? 4 : range ?? 0;
        if ((unlock.capture && !next.capture) || (unlock.stationary && !next.stationary) || (unlock.cannon && !next.cannon) || rank(unlock.range) > rank(next.range) || (unlock.jumpAllies ?? 0) > (next.jumpAllies ?? 0) || (unlock.jumpEnemies ?? 0) > (next.jumpEnemies ?? 0))
          e.push("段階2の移動能力は段階1から累積させてください。");
      }
    }
    if (!stages.some((stage) => stage.unlockCrown || Object.keys(stage.unlocks).length || stage.localSwap || stage.globalSwap) && !n.patterns.some((pattern) => pattern.evolutionOnly))
      e.push("成長後に解放する能力が必要です。");
    for (const [stageIndex, stage] of stages.entries()) for (const [key, unlock] of Object.entries(stage.unlocks)) {
      const pattern = n.patterns[Number(key)];
      if (!pattern) {
        e.push(`段階${stageIndex + 1}：存在しない移動セットへ成長能力が設定されています。`);
        continue;
      }
      if ((unlock.capture || unlock.stationary) && (pattern.usage ?? "both") !== "move")
        e.push("捕獲解放は移動専用セットにだけ設定できます。");
      if (unlock.capture && unlock.stationary)
        e.push("通常捕獲と静止捕獲は同時解放できません。");
      if (unlock.vectors && pattern.kind !== "leap")
        e.push("成長後の跳躍点は固定跳躍セットにだけ設定できます。");
      if (unlock.range !== undefined && pattern.kind !== "direction")
        e.push("成長後の距離は方向移動セットにだけ設定できます。");
      if (unlock.range !== undefined && pattern.kind === "direction") {
        const rank = (range: Range) => range === "slide" ? 4 : range;
        if (rank(unlock.range) < rank(pattern.range)) e.push("成長後の移動距離は短くできません。");
      }
      if (unlock.vectors?.some((vector) => Math.abs(vector.dx) > 3 || Math.abs(vector.dy) > 3 || (!vector.dx && !vector.dy)))
        e.push("成長後の固定跳躍点は7×7範囲内に設定してください。");
      if ((unlock.cannon || unlock.jumpAllies || unlock.jumpEnemies) && pattern.kind !== "direction")
        e.push("キャノン・飛び越し解放は方向移動専用です。");
      if (pattern.kind === "direction" && (unlock.range ?? pattern.range) === 1 && (unlock.cannon || unlock.jumpAllies || unlock.jumpEnemies))
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
  if (n.growth && n.transformation)
    e.push("成長と変身は同時に設定できません。");
  if ([n.growth, n.transformation, n.summoning].filter(Boolean).length > 1) e.push("成長・変身・召喚は同時に設定できません。");
  if (n.summoning) {
    const summoned = summonedDefinition(n);
    if (!summoned.name || !/^[A-Z]{1,2}$/.test(summoned.symbol)) e.push("派生駒の名前と英字1～2文字の記号が必要です。");
    if (summoned.symbol === n.symbol || (RESERVED_SYMBOLS as readonly string[]).includes(summoned.symbol)) e.push("派生駒の記号は通常駒・標準駒と重複できません。");
    if (all.some((item) => item.id !== n.id && (item.symbol.toUpperCase() === summoned.symbol || item.transformation?.symbol.toUpperCase() === summoned.symbol || item.summoning?.symbol.toUpperCase() === summoned.symbol))) e.push("派生駒の記号が重複しています。");
    if (summoned.patterns.length < 1 || summoned.patterns.length > 4 || summoned.patterns.some((p) => !p.vectors.length)) e.push("派生駒には1～4個の有効な移動セットが必要です。");
    if (cost(summoned) > summonLimit(n)) e.push(`派生駒コストが上限${summonLimit(n)}を超えています。`);
    if (n.isCrown && n.summoning.timing === "split") e.push("Crown駒は分裂できません。");
  }
  if (n.transformation) {
    const transformed = transformedDefinition(n);
    if (!transformed.name || transformed.name.length > 20)
      e.push("変身後名称は1～20文字です。");
    if (!/^[A-Z]{1,2}$/.test(transformed.symbol))
      e.push("変身後記号は英字1～2文字です。");
    if ((RESERVED_SYMBOLS as readonly string[]).includes(transformed.symbol))
      e.push("変身後記号に標準駒の予約記号は使用できません。");
    if (transformed.symbol === n.symbol)
      e.push("変身後記号は変身前と異なる記号にしてください。");
    if (
      all.some(
        (item) =>
          item.id !== n.id &&
          (item.symbol.toUpperCase() === transformed.symbol ||
            item.transformation?.symbol.toUpperCase() === transformed.symbol),
      )
    )
      e.push("変身後記号が重複しています。");
    if (transformed.patterns.length < 1 || transformed.patterns.length > 4)
      e.push("変身後の移動セットは1～4個です。");
    if (transformed.patterns.some((pattern) => !pattern.vectors.length))
      e.push("変身後の各移動セットに移動先が必要です。");
    const transformedPatternErrors = errors(
      { ...transformed, id: `${n.id}:transformed`, symbol: "ZZ" },
      [],
      true,
    ).filter((message) => !message.includes("記号") && !message.includes("進化限定"));
    e.push(...transformedPatternErrors.map((message) => `変身後：${message}`));
    const transformedCost = cost(transformed) + (n.transformation.localSwap ? 3 : 0) + (n.transformation.globalSwap ? 5 : 0);
    if (transformedCost > transformationLimit(n))
      e.push(`変身後コストが上限${transformationLimit(n)}を超えています。`);
  }
  if (growthCost(n).total > 30) e.push("コストが30を超えています。");
  return e;
}
