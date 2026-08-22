import type {
  Definition,
  EvolutionCondition,
  Growth,
  GrowthStage,
  GrowthUnlock,
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
  /** 新方向料金体系。Slideは方向料金とは別に最高Range基本料金を持つ。 */
  slideBase: 10,
  rangeBase: { 1: 0, 2: 2, 3: 5, slide: 10 } as Record<Range, number>,
  usageWalletLimit: 20,
  usageEvaluation: { 1: 1, 2: 2, 3: 4, slide: 6 } as Record<Range, number>,
  directionR1Move: 1,
  directionLongMove: 2,
  directionForwardLongMove: 3,
  directionUsage: { move: 0, capture: 1, stationary: 1, both: 2 } as Record<Usage, number>,
  jumpDirectionBase: 2,
  allyJumpPerPiece: 1,
  enemyJumpPerPiece: 2,
  cannonBase: 5,
  cannonDirection: 1,
  crown: 25,
  dark: 8,
  barrier: 4,
  deathbind: 9,
  rebirth: 8,
  devotion: 7,
  tracking: 5,
  seal: 5,
  eagleHunt: 5,
  demonContract: 3,
  dogHunt: 5,
  fortress: 8,
  watchtower: 10,
  wagon: 12,
  budget: 30,
};
const key = (v: Vec) => `${v.dx},${v.dy}`;
export const unique = (v: Vec[]) => [
  ...new Map(v.filter((x) => x.dx || x.dy).map((x) => [key(x), x])).values(),
];
const preparePatternForEditing = (pattern: Pattern): Pattern => {
  if (pattern.kind !== "direction")
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
  const legacyTracking = !!d.tracking;
  return {
    ...d,
    tracking: undefined,
    patterns: d.patterns.map((pattern) => {
      const migrated = pattern.phase === 2 && (pattern.secondTrigger ?? "normal") === "normal"
        ? { ...pattern, usage: "move" as const }
        : pattern;
      if (migrated.kind !== "leap") return migrated;
      const oldPatternTracking = (migrated as typeof migrated & { tracking?: boolean | { duration: 1 | 2 } }).tracking;
      if (legacyTracking || oldPatternTracking === true) return { ...migrated, tracking: { duration: 1 } };
      return migrated;
    }),
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
  const abilities = d.summoning.timing === "inherit"
    ? { dark: d.dark, barrier: d.barrier, deathbind: d.deathbind, devotion: d.devotion, seal: d.seal }
    : d.summoning.abilities ?? {};
  return {
    id: d.id,
    name: d.summoning.name,
    symbol: d.summoning.symbol,
    patterns: structuredClone(d.summoning.patterns),
    isCrown: false,
    ...abilities,
  };
}
export const SUMMON_LIMITS = {
  summon: [0, 11, 13, 15, 18],
  inherit: [0, 11, 13, 15, 18],
  split: [0, 7, 9, 11, 12],
} as const;
export function summonLimit(d: Definition) {
  return d.summoning ? SUMMON_LIMITS[d.summoning.timing][conditionDifficulty(d.summoning.condition)] : 0;
}
export function summoningAbilityCost(d: Definition) {
  const summoning = d.summoning;
  if (!summoning || summoning.timing === "inherit") return 0;
  const abilities = summoning.abilities ?? {};
  const values = [
    abilities.dark ? COST.dark : 0,
    abilities.barrier ? COST.barrier : 0,
    abilities.deathbind ? COST.deathbind : 0,
    abilities.devotion ? COST.devotion : 0,
    abilities.seal ? COST.seal : 0,
  ];
  return values.reduce((sum, value) => sum + (summoning.timing === "split" ? Math.ceil(value / 2) : value), 0);
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
export function applyPatternEnhancement(d: Definition, patternIndex: number, unlock: GrowthUnlock): Definition {
  return {
    ...d,
    patterns: d.patterns.flatMap((pattern, index): Pattern[] => {
      if (index !== patternIndex) return [pattern];
      const usage = unlock.capture ? "both" : pattern.usage;
      const enhanced: Pattern = pattern.kind === "leap"
        ? { ...pattern, usage, vectors: unlock.vectors ?? pattern.vectors }
        : pattern.kind === "chain"
          ? { ...pattern, usage: usage === "move" ? "move" : "both", maxChains: unlock.maxChains ?? pattern.maxChains }
          : pattern.kind === "advance"
            ? { ...pattern, usage }
        : {
            ...pattern,
            range: unlock.range ?? pattern.range,
            usage,
            growthCannon: !!unlock.cannon,
            cannon: pattern.cannon,
            jumpAllies: Math.max(jumpLimit(pattern.jumpAllies, pattern.canJump), unlock.jumpAllies ?? 0) as 0 | 1 | 2,
            jumpEnemies: Math.max(jumpLimit(pattern.jumpEnemies, pattern.canJump), unlock.jumpEnemies ?? 0) as 0 | 1 | 2,
          };
      return unlock.stationary && enhanced.kind !== "chain"
        ? [{ ...enhanced, growthStationaryBase: true }, { ...enhanced, usage: "stationary" }]
        : [enhanced];
    }),
  };
}

export function rebirthEnhancedDefinition(d: Definition, active: Definition): Definition {
  const rebirth = d.rebirth;
  if (rebirth?.enhancedPattern === undefined || !rebirth.enhancement) return active;
  return applyPatternEnhancement(active, rebirth.enhancedPattern, rebirth.enhancement);
}

export function evolvedDefinition(d: Definition, requestedStage?: number): Definition {
  if (!d.growth) return d;
  const stages = growthStages(d.growth);
  const stage = stages[Math.max(0, Math.min(stages.length, requestedStage ?? stages.length) - 1)];
  if (!stage) return { ...d, growth: undefined };
  return {
    ...d,
    facility: d.facility?.kind === "watchtower" && stage.watchRadius === 2 ? { ...d.facility, radius: 2 } : d.facility,
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
          : pattern.kind === "chain"
            ? { ...pattern, usage: usage === "move" ? "move" : "both", maxChains: unlock.maxChains ?? pattern.maxChains }
            : pattern.kind === "advance"
              ? { ...pattern, usage }
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
      return unlock.stationary && evolvedPattern.kind !== "chain"
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
  const base = cost({ ...d, growth: undefined, patterns: d.patterns.filter((pattern) => !pattern.evolutionOnly) });
  if (!d.growth) return { base, premium: 0, total: base, difficulty: 0, stages: [] };
  let previous = base;
  const stages = growthStages(d.growth).map((stage, index) => {
    const evolved = cost(evolvedDefinition(d, index + 1)) +
      (stage.localSwap ? 3 : 0) + (stage.globalSwap ? 5 : 0);
    const gap = Math.max(0, evolved - previous);
    const difficulty = conditionDifficulty(stage.condition);
    const discount = Math.floor(gap * Math.min(0.8, difficulty * 0.2));
    let charge = Math.max(gap ? 1 : 0, gap - discount);
  const special = (stage.zeroRecovery ?? 0) * 3 + (stage.overcomeZero ? 15 : 0) + (stage.eagleHunt ? COST.eagleHunt : 0) + (stage.demonContract ? COST.demonContract : 0) + (stage.dogHunt ? COST.dogHunt : 0);
    charge += Math.max(0, special - Math.floor(special * Math.min(0.8, difficulty * 0.2)));
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
    : cost({ ...definition, transformation: undefined, summoning: undefined }) + (definition.summoning ? (definition.summoning.timing === "split" ? 0 : 5) + (definition.summoning.range === "movement" ? 3 : 0) + summoningAbilityCost(definition) : 0);

export interface DirectionCostBreakdown {
  moveDirection: number;
  rangeBase: number;
  rangeEvaluation: number;
  usage: number;
  usageWallet: number;
  usageCharge: number;
  total: number;
}

const rangeRank = (range: Range) => range === "slide" ? 4 : range;
const directionMoveUnit = (vector: Vec, range: Range) => {
  if (range === 1) return COST.directionR1Move;
  return vector.dx === 0 && vector.dy < 0
    ? COST.directionForwardLongMove
    : COST.directionLongMove;
};

/** Direction Pattern群だけを、新しい財布式で評価する純粋関数。 */
export function directionCostBreakdown(patterns: Pattern[], transformedContext = false): DirectionCostBreakdown {
  const directionsOnly = patterns.filter((pattern): pattern is Extract<Pattern, { kind: "direction" }> => pattern.kind === "direction" && !pattern.growthStationaryBase);
  const chainsOnly = patterns.filter((pattern): pattern is Extract<Pattern, { kind: "chain" }> => pattern.kind === "chain" && !pattern.growthStationaryBase);
  const advancesOnly = patterns.filter((pattern): pattern is Extract<Pattern, { kind: "advance" }> => pattern.kind === "advance" && !pattern.growthStationaryBase);
  if (!directionsOnly.length && !chainsOnly.length && !advancesOnly.length) return { moveDirection: 0, rangeBase: 0, rangeEvaluation: 0, usage: 0, usageWallet: COST.usageWalletLimit, usageCharge: 0, total: 0 };
  let moveDirection = 0;
  let usage = 0;
  let rangeEvaluation = 0;
  let highestRank = 0;
  for (const pattern of directionsOnly) {
    highestRank = Math.max(highestRank, rangeRank(pattern.range));
    const effectiveUsage = pattern.phase === 2 && (pattern.secondTrigger ?? "normal") === "normal"
      ? "move"
      : pattern.usage ?? "both";
    const initial = !!(pattern.initialOnly || pattern.evolvedInitialOnly);
    const vectors = pattern.vectors;
    for (const vector of vectors) {
      let unit = directionMoveUnit(vector, pattern.range);
      if (pattern.phase === 2 && (pattern.secondTrigger ?? "normal") === "normal" && effectiveUsage === "move") unit = Math.max(1, unit - 1);
      moveDirection += initial ? Math.ceil(unit / 2) : unit;
      rangeEvaluation += COST.usageEvaluation[pattern.range];
      if (rangeRank(pattern.range) >= 2) {
        const usageUnit = COST.directionUsage[effectiveUsage];
        usage += initial ? Math.ceil(usageUnit / 2) : usageUnit;
      }
    }
  }
  for (const pattern of chainsOnly) {
    if ((pattern.usage ?? "both") !== "both") continue;
    const chainUsage = pattern.maxChains * 2;
    usage += pattern.initialOnly || pattern.evolvedInitialOnly ? Math.ceil(chainUsage / 2) : chainUsage;
  }
  for (const pattern of advancesOnly) {
    const initial = !!(pattern.initialOnly || pattern.evolvedInitialOnly);
    const usageUnit = COST.directionUsage[pattern.usage ?? "both"];
    let setPremium = (pattern.runup === 1 ? 2 : 0) + (pattern.width === 3 ? 1 : 0);
    if (initial) setPremium = Math.ceil(setPremium / 2);
    moveDirection += setPremium;
    for (const _vector of pattern.vectors) {
      moveDirection += initial ? 1 : 2;
      rangeEvaluation += 4;
      usage += initial ? Math.ceil(usageUnit / 2) : usageUnit;
    }
  }
  const highestRange: Range = highestRank >= 4 ? "slide" : highestRank === 3 ? 3 : highestRank === 2 ? 2 : 1;
  const directionBase = transformedContext
    ? highestRank >= 4 ? 5 : highestRank === 3 ? 2 : 0
    : COST.rangeBase[highestRange];
  const rangeBase = Math.max(directionBase, advancesOnly.length && !transformedContext ? 5 : 0);
  const usageWallet = Math.max(0, COST.usageWalletLimit - rangeEvaluation);
  const usageCharge = Math.max(0, usage - usageWallet);
  return { moveDirection, rangeBase, rangeEvaluation, usage, usageWallet, usageCharge, total: moveDirection + rangeBase + usageCharge };
}
export function transformationLimit(d: Definition) {
  if (!d.transformation) return 30;
  return [30, 24, 26, 28, 29][conditionDifficulty(d.transformation.condition)];
}
export function cost(d: Definition, transformedContext = false) {
  if (
    !transformedContext &&
    !d.facility &&
    d.patterns.some(
      (p) =>
        p.kind === "direction" &&
        (p.canJump !== undefined ||
          typeof p.jumpAllies === "boolean" ||
          typeof p.jumpEnemies === "boolean"),
    )
  )
    return legacyCost(d, transformedContext);
  let n = d.isCrown ? COST.crown : 0,
    cannon = false,
    slide = false;
  const pricedPatterns = d.facility ? [] : normalize(d).patterns;
  const directionPricing = directionCostBreakdown(pricedPatterns, transformedContext);
  if (d.facility) n += d.facility.kind === "fortress" ? COST.fortress : d.facility.kind === "watchtower" ? COST.watchtower + (d.facility.radius === 2 ? 5 : 0) : COST.wagon;
  for (const p of pricedPatterns) {
    if (p.growthStationaryBase) continue;
    const usage = p.usage ?? "both";
    if (p.kind === "advance") {
      // Move方向料金・基本料・Usageは共通wallet計算に含まれる。
    } else if (p.kind === "chain") {
      const chargedChains = transformedContext ? Math.max(1, p.maxChains - 1) : p.maxChains;
      let value = p.vectors.length * chargedChains * (chargedChains + 1) / 2;
      if (p.initialOnly || p.evolvedInitialOnly) value = Math.ceil(value / 2);
      n += value;
    } else if (p.kind === "leap") {
      const unit = Math.max(1, COST.usageLeap[usage] - (transformedContext ? 1 : 0));
      let value = p.vectors.length * (p.initialOnly || p.evolvedInitialOnly ? Math.ceil(unit / 2) : unit);
      if (p.phase === 2 && p.secondTrigger && p.secondTrigger !== "normal" && !p.initialOnly && !p.evolvedInitialOnly) value = Math.ceil(value / 2);
      n += value;
      if (p.phase === 2 && (!p.secondTrigger || p.secondTrigger === "normal")) n += COST.secondPhaseBase;
      if (p.tracking) n += COST.tracking;
    } else {
      slide ||= p.range === "slide";
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
      if (p.passEnemies) {
        const passCost = p.passEnemies === 2 && p.passCapture === "last" ? 3 : 2;
        n += p.vectors.length * passCost;
      }
      if (p.charge) n -= p.vectors.length * (p.range === "slide" ? 2 : 1);
      if (p.recoil) n += 3;
    }
  }
  const evolution = d.growth ?? d.transformation;
  n += directionPricing.total + (cannon ? COST.cannonBase : 0) + (evolution?.localSwap ? 3 : 0) + (evolution?.globalSwap ? 5 : 0);
  n += (d.dark ? COST.dark : 0) + (d.barrier ? COST.barrier : 0) + (d.deathbind ? COST.deathbind : 0) + (d.rebirth ? COST.rebirth + (d.rebirth.splitAllowed ? 5 : 0) : 0) + (d.devotion ? COST.devotion : 0) + (d.seal ? COST.seal : 0) + (d.eagleHunt && d.transformation ? COST.eagleHunt : 0) + (d.demonContract && d.transformation ? COST.demonContract : 0) + (d.dogHunt && d.transformation ? COST.dogHunt : 0);
  if (d.rebirth?.enhancedPattern !== undefined && d.rebirth.enhancement) {
    const at = d.rebirth.enhancedAt;
    const active = at === "transformation"
      ? transformedDefinition({ ...d, rebirth: undefined })
      : at === 1 || at === 2
        ? evolvedDefinition({ ...d, rebirth: undefined }, at)
        : { ...d, rebirth: undefined };
    const enhanced = applyPatternEnhancement(active, d.rebirth.enhancedPattern, d.rebirth.enhancement);
    n += Math.max(0, cost(enhanced) - cost(active));
  }
  if (d.zeroBody) {
    const jumpPremium = d.patterns.filter((p) => p.kind === "direction" && p.range !== 1).reduce((sum, p) => sum + p.vectors.length * (COST.jumpDirectionBase + 2 * COST.allyJumpPerPiece + 2 * COST.enemyJumpPerPiece), 0);
    n = Math.max(3, Math.ceil((n + jumpPremium) * 0.6));
  }
  return Math.max(0, n);
}
function legacyCost(d: Definition, transformedContext = false) {
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
    if (p.kind === "advance") continue;
    if (p.kind === "chain") {
      const chargedChains = transformedContext ? Math.max(1, p.maxChains - 1) : p.maxChains;
      let value = p.vectors.length * chargedChains * (chargedChains + 1) / 2;
      if (p.initialOnly || p.evolvedInitialOnly) value = Math.ceil(value / 2);
      total += value;
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
  if ((!n.facility && n.patterns.length < 1) || n.patterns.length > 4)
    e.push("移動セットは1～4個です。");
  if (n.patterns.some((p) => p.evolvedInitialOnly || p.evolutionOnly || (p.secondTrigger && p.secondTrigger !== "normal")) && !n.growth && !n.transformation)
    e.push("進化限定の移動設定には成長または変身が必要です。");
  if (n.patterns.some((p) => p.secondTrigger === "flight" && p.phase !== 2))
    e.push("飛翔は2回目の移動にだけ設定できます。");
  if (n.zeroBody && (n.isCrown || n.rebirth || n.deathbind)) e.push("零体はCrown・再生・道連れと併用できません。");
  if (n.deathbind && (n.isCrown || n.rebirth)) e.push("道連れはCrown・再生と併用できません。");
  if (n.dark && n.isCrown) e.push("暗躍はCrown駒に設定できません。");
  if ((n.eagleHunt || n.demonContract || n.dogHunt) && !n.growth && !n.transformation) e.push("契約能力には成長または変身が必要です。");
  if (n.eagleHunt && n.growth && !growthStages(n.growth).some((stage) => stage.eagleHunt)) e.push("鷹狩を発動する成長段階を指定してください。");
  if (n.demonContract && n.growth && !growthStages(n.growth).some((stage) => stage.demonContract)) e.push("魔神との契約を発動する成長段階を指定してください。");
  if (n.dogHunt && n.growth && !growthStages(n.growth).some((stage) => stage.dogHunt)) e.push("犬猟を発動する成長段階を指定してください。");
  if (n.rebirth?.splitAllowed && n.summoning?.timing !== "split") e.push("分裂後再生は分裂召喚の駒だけに設定できます。");
  if (n.rebirth?.enhancement) {
    if (n.rebirth.enhancedPattern === undefined || !n.patterns[n.rebirth.enhancedPattern]) e.push("強化再生の対象移動セットが不正です。");
    if (!n.rebirth.enhancedAt) e.push("強化再生の発動進化状態を指定してください。");
    if (n.rebirth.enhancedAt === "transformation" && !n.transformation) e.push("変身後の強化再生には変身設定が必要です。");
    if ((n.rebirth.enhancedAt === 1 || n.rebirth.enhancedAt === 2) && !n.growth) e.push("成長後の強化再生には成長設定が必要です。");
    if (n.rebirth.enhancedAt === 2 && growthStages(n.growth!).length < 2) e.push("成長第2段階の強化再生には第2段階が必要です。");
  }
  if (n.patterns.some((p) => p.kind === "direction" && p.passEnemies && (p.cannon || p.jumpEnemies))) e.push("すり抜けは敵飛び越し・キャノンと併用できません。");
  if (!evolvedContext && n.patterns.some((p) => p.kind === "leap" && p.tracking && (p.usage ?? "both") !== "move"))
    e.push("追跡は通常形態では移動専用の固定跳躍セットにだけ設定できます。");
  if (n.patterns.some((p) => p.kind === "leap" && p.tracking && p.tracking.duration !== 1 && p.tracking.duration !== 2))
    e.push("追跡期限は1手または2手です。");
  if (n.patterns.some((p) => p.kind === "direction" && p.recoil && ((p.usage ?? "both") === "stationary" || p.cannon || p.phase === 2))) e.push("反動は静止捕獲・キャノン・2回目移動と併用できません。");
  if (n.patterns.some((p) => p.kind === "chain" && !["move", "both"].includes(p.usage ?? "both"))) e.push("連鎖移動は移動専用または移動・捕獲だけ設定できます。");
  if (n.patterns.some((p) => p.kind === "chain" && (p.phase === 2 || (p.secondTrigger && p.secondTrigger !== "normal")))) e.push("連鎖移動は2回目移動・捕獲後移動・飛翔に設定できません。");
  if (n.patterns.some((p) => p.kind === "chain" && p.vectors.some((v) => Math.abs(v.dx) + Math.abs(v.dy) !== 1))) e.push("連鎖移動は前後左右だけ設定できます。");
  if (n.patterns.some((p) => p.kind === "advance" && (p.phase === 2 || (p.secondTrigger && p.secondTrigger !== "normal")))) e.push("躍進は第1移動専用です。");
  if (n.patterns.some((p) => p.kind === "advance" && (!Number.isInteger(p.jump) || p.jump < 1))) e.push("躍進の跳躍距離は1以上の整数で設定してください。");
  if (n.patterns.some((p) => p.kind === "advance" && p.runup !== 1 && p.runup !== 2)) e.push("躍進の助走距離は1または2で設定してください。");
  if (n.patterns.some((p) => p.kind === "advance" && p.width !== 1 && p.width !== 3)) e.push("躍進の着地点幅は1または3で設定してください。");
  if (n.patterns.some((p) => p.kind === "advance" && p.vectors.some((v) => Math.max(Math.abs(v.dx), Math.abs(v.dy)) !== 1))) e.push("躍進は周囲8方向だけ設定できます。");
  if (!evolvedContext && n.patterns.some((p) => p.kind === "chain" && p.maxChains === 4 && !p.evolutionOnly)) e.push("4連鎖は成長・変身後限定です。");
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
  if (!n.facility && !n.patterns.some((p) => p.vectors.length)) e.push("移動先が必要です。");
  if (n.facility && n.isCrown) e.push("施設にCrownは設定できません。");
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
    if (!stages.some((stage) => stage.unlockCrown || Object.keys(stage.unlocks).length || stage.localSwap || stage.globalSwap || stage.watchRadius === 2) && !n.patterns.some((pattern) => pattern.evolutionOnly))
      e.push("成長後に解放する能力が必要です。");
    if (stages.some((stage) => stage.watchRadius === 2) && n.facility?.kind !== "watchtower") e.push("捕捉範囲の成長解放は見張り台専用です。");
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
      if (unlock.stationary && pattern.kind === "chain") e.push("連鎖移動には静止捕獲を成長解放できません。");
      if (unlock.vectors && pattern.kind !== "leap")
        e.push("成長後の跳躍点は固定跳躍セットにだけ設定できます。");
      if (unlock.range !== undefined && pattern.kind !== "direction")
        e.push("成長後の距離は方向移動セットにだけ設定できます。");
      if (unlock.range !== undefined && pattern.kind === "direction") {
        const rank = (range: Range) => range === "slide" ? 4 : range;
        if (rank(unlock.range) < rank(pattern.range)) e.push("成長後の移動距離は短くできません。");
      }
      if (unlock.maxChains !== undefined && pattern.kind !== "chain") e.push("最大連鎖数の解放は連鎖移動セットにだけ設定できます。");
      if (unlock.maxChains !== undefined && pattern.kind === "chain" && unlock.maxChains <= pattern.maxChains) e.push("成長後の最大連鎖数は増加させてください。");
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
    const summonedMovement = { ...summoned, dark: undefined, barrier: undefined, deathbind: undefined, devotion: undefined, seal: undefined };
    if (cost(summonedMovement) > summonLimit(n)) e.push(`派生駒コストが上限${summonLimit(n)}を超えています。`);
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
    const transformedCost = cost(transformed, true) + (n.transformation.localSwap ? 3 : 0) + (n.transformation.globalSwap ? 5 : 0);
    if (transformedCost > transformationLimit(n))
      e.push(`変身後コストが上限${transformationLimit(n)}を超えています。`);
  }
  if (definitionCost(n) > 30) e.push("コストが30を超えています。");
  return e;
}
