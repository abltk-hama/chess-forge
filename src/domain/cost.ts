import type { Definition, Range, Usage, Vec } from "./types";
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
    symbol: d.symbol.trim().toUpperCase().slice(0, 1),
    patterns: d.patterns.map((p) => ({ ...p, vectors: unique(p.vectors) })),
  };
}
export function cost(d: Definition) {
  let n = d.isCrown ? COST.crown : 0,
    legacyJump = false,
    allyJump = false,
    enemyJump = false;
  for (const p of normalize(d).patterns) {
    const usage = p.usage ?? "both";
    if (p.kind === "leap") n += p.vectors.length * COST.usageLeap[usage];
    else {
      n += p.vectors.length * COST.usageRange[usage][p.range];
      const legacy =
        p.canJump !== undefined &&
        p.jumpAllies === undefined &&
        p.jumpEnemies === undefined;
      if (legacy) legacyJump ||= !!p.canJump;
      else if (p.range !== 1) {
        if (p.jumpAllies) {
          allyJump = true;
          n += p.vectors.length * COST.allyJump[p.range];
        }
        if (p.jumpEnemies) {
          enemyJump = true;
          n += p.vectors.length * COST.enemyJump[p.range];
        }
      }
    }
  }
  return (
    n +
    (legacyJump ? COST.legacyJump : 0) +
    (allyJump ? COST.jumpBase : 0) +
    (enemyJump ? COST.jumpBase : 0)
  );
}
export function errors(d: Definition, all: Definition[] = []) {
  const n = normalize(d),
    e: string[] = [];
  if (!n.name || n.name.length > 20) e.push("名前は1～20文字です。");
  if (!/^[A-Z]$/.test(n.symbol)) e.push("記号は英字1文字です。");
  if (all.some((x) => x.id !== n.id && x.symbol === n.symbol))
    e.push("記号が重複しています。");
  if (n.patterns.length < 1 || n.patterns.length > 4)
    e.push("移動セットは1～4個です。");
  if (!n.patterns.some((p) => p.vectors.length)) e.push("移動先が必要です。");
  if (cost(n) > 30) e.push("コストが30を超えています。");
  return e;
}
