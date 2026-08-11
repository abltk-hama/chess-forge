import type { Definition, Range, Usage, Vec } from "./types";
export const RESERVED_SYMBOLS = ["KI", "QU", "RO", "BI", "KN", "PO"] as const;
export const MAX_DEFINITIONS = 16;
export const COST = {
  range: { 1: 1, 2: 2, 3: 4, slide: 5 } as Record<Range, number>,
  usageRange: {
    both: { 1: 1, 2: 2, 3: 4, slide: 5 },
    move: { 1: 1, 2: 1, 3: 2, slide: 3 },
    capture: { 1: 1, 2: 2, 3: 3, slide: 4 },
  } as Record<Usage, Record<Range, number>>,
  usageLeap: { both: 3, move: 2, capture: 3 } as Record<Usage, number>,
  jumpBase: 5,
  allyJump: { 1: 0, 2: 1, 3: 2, slide: 3 } as Record<Range, number>,
  enemyJump: { 1: 0, 2: 2, 3: 4, slide: 6 } as Record<Range, number>,
  legacyJump: 15,
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
  };
}
export function cost(d: Definition) {
  let n = d.isCrown ? COST.crown : 0,
    legacyJump = false,
    allyJump = false,
    enemyJump = false,
    cannon = false;
  for (const p of normalize(d).patterns) {
    const usage = p.usage ?? "both";
    if (p.kind === "leap") {
      const unit = COST.usageLeap[usage];
      n += p.vectors.length * (p.initialOnly ? Math.ceil(unit / 2) : unit);
    } else {
      const unit = COST.usageRange[usage][p.range];
      n += p.vectors.length * (p.initialOnly ? Math.ceil(unit / 2) : unit);
      if (p.cannon) {
        cannon = true;
        n += p.vectors.length * COST.cannonDirection;
      }
      const legacy =
        p.canJump !== undefined &&
        p.jumpAllies === undefined &&
        p.jumpEnemies === undefined;
      if (legacy) legacyJump ||= !!p.canJump;
      else if (p.range !== 1) {
        if (p.jumpAllies) {
          allyJump = true;
          const premium = COST.allyJump[p.range];
          n +=
            p.vectors.length *
            (p.initialOnly ? Math.ceil(premium / 2) : premium);
        }
        if (p.jumpEnemies) {
          enemyJump = true;
          const premium = COST.enemyJump[p.range];
          n +=
            p.vectors.length *
            (p.initialOnly ? Math.ceil(premium / 2) : premium);
        }
      }
    }
  }
  return (
    n +
    (legacyJump ? COST.legacyJump : 0) +
    (allyJump ? COST.jumpBase : 0) +
    (enemyJump ? COST.jumpBase : 0) +
    (cannon ? COST.cannonBase : 0)
  );
}
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
        p.cannon &&
        ((p.usage ?? "both") === "move" ||
          p.jumpAllies ||
          p.jumpEnemies ||
          p.canJump),
    )
  )
    e.push("キャノンは移動専用・飛び越しと併用できません。");
  if (!n.patterns.some((p) => p.vectors.length)) e.push("移動先が必要です。");
  if (cost(n) > 30) e.push("コストが30を超えています。");
  return e;
}
