import { describe, expect, it } from "vitest";
import { definitionCost, summonLimit } from "../src/domain/cost";
import { createMatch, placeSummon, play } from "../src/domain/game";
import { emptySetup, idx, type Definition } from "../src/domain/types";

const definition = (timing: "summon" | "inherit" | "split" = "summon"): Definition => ({
  id: "caller", name: "Caller", symbol: "CA", isCrown: false,
  patterns: [{ kind: "leap", vectors: [{ dx: 1, dy: 0 }] }],
  summoning: { condition: { kind: "captures", subject: "self", threshold: 1 }, timing, range: "adjacent", name: "Minion", symbol: "MI", patterns: [{ kind: "leap", vectors: [{ dx: 1, dy: 0 }] }] },
});
const state = (d: Definition) => {
  const s = createMatch([], emptySetup(), "royal-any"); s.board = Array(64).fill(null);
  s.board[idx({ row: 4, col: 2 })] = { id: "c", color: "white", role: "custom", definitionId: d.id, moved: false };
  s.board[idx({ row: 4, col: 3 })] = { id: "e", color: "black", role: "pawn", moved: true };
  return s;
};
describe("summoning", () => {
  it("uses stable limits and range premium", () => {
    const d = definition(); expect(summonLimit(d)).toBe(13); expect(definitionCost({ ...d, summoning: { ...d.summoning!, range: "movement" } })).toBe(definitionCost(d) + 3);
  });
  it("summons once after evolution and consumes the placement", () => {
    const d = definition(), next = play(state(d), { from: { row: 4, col: 2 }, to: { row: 4, col: 3 } }, [d]);
    expect(next.pendingSummon?.remaining).toBe(1);
    const placed = placeSummon(next, next.pendingSummon!.candidates[0]);
    expect(placed.pendingSummon).toBeUndefined(); expect(placed.board.some((p) => p?.summoned)).toBe(true);
  });
  it("splits into two summoned pieces and removes the original", () => {
    const d = definition("split"), next = play(state(d), { from: { row: 4, col: 2 }, to: { row: 4, col: 3 } }, [d]);
    expect(next.board.some((p) => p?.id === "c")).toBe(false);
    const once = placeSummon(next, next.pendingSummon!.candidates[0]);
    const twice = placeSummon(once, once.pendingSummon!.candidates[0]);
    expect(twice.board.filter((p) => p?.summoned)).toHaveLength(2);
  });
});
