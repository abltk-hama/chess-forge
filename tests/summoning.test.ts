import { describe, expect, it } from "vitest";
import { definitionCost, summonLimit } from "../src/domain/cost";
import { createMatch, legal, placeSummon, play } from "../src/domain/game";
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
    const d = definition();
    expect(summonLimit(d)).toBe(11);
    expect(summonLimit(definition("inherit"))).toBe(11);
    expect(summonLimit(definition("split"))).toBe(7);
    expect(definitionCost({ ...d, summoning: { ...d.summoning!, range: "movement" } })).toBe(definitionCost(d) + 3);
    const plain = { ...d, summoning: undefined };
    expect(definitionCost(d)).toBe(definitionCost(plain) + 5);
    expect(definitionCost(definition("inherit"))).toBe(definitionCost(plain) + 5);
    expect(definitionCost(definition("split"))).toBe(definitionCost(plain));
  });
  it("uses the revised limit table for every condition difficulty", () => {
    const expected = {
      summon: [11, 13, 15, 18],
      inherit: [11, 13, 15, 18],
      split: [7, 9, 11, 12],
    } as const;
    const conditions = [
      { kind: "captures", subject: "self", threshold: 1 },
      { kind: "captures", subject: "self", threshold: 2 },
      { kind: "captures", subject: "self", threshold: 3 },
      { kind: "evolutions", side: "enemy", threshold: 3 },
    ] as const;
    for (const timing of ["summon", "inherit", "split"] as const) {
      conditions.forEach((condition, index) => {
        const d = definition(timing);
        d.summoning!.condition = condition;
        expect(summonLimit(d)).toBe(expected[timing][index]);
      });
    }
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
    twice.turn = "white";
    const summonedIndex = twice.board.findIndex((p) => p?.summoned);
    const from = { row: Math.floor(summonedIndex / 8), col: summonedIndex % 8 };
    const action = legal(twice, from, [d])[0];
    expect(action).toBeDefined();
    const after = play(twice, action, [d]);
    expect(after.pendingSummon).toBeUndefined();
    expect(after.board.filter((p) => p?.summoned)).toHaveLength(2);
  });
  it("does not inherit again when the inherited piece is captured", () => {
    const d = definition("inherit"), first = state(d);
    first.board[idx({ row: 4, col: 2 })] = { ...first.board[idx({ row: 4, col: 2 })]!, evolved: true };
    first.turn = "black";
    first.board[idx({ row: 4, col: 1 })] = { id: "attacker", color: "black", role: "rook", moved: true };
    const captured = play(first, { from: { row: 4, col: 1 }, to: { row: 4, col: 2 } }, [d]);
    expect(captured.pendingSummon).toBeDefined();
    const inherited = placeSummon(captured, captured.pendingSummon!.candidates[0]);
    const inheritedIndex = inherited.board.findIndex((p) => p?.summoned);
    const target = { row: Math.floor(inheritedIndex / 8), col: inheritedIndex % 8 };
    inherited.turn = "black";
    const attackFrom = { row: target.row, col: target.col > 0 ? target.col - 1 : target.col + 1 };
    inherited.board[idx(attackFrom)] = { id: "attacker2", color: "black", role: "rook", moved: true };
    const after = play(inherited, { from: attackFrom, to: target }, [d]);
    expect(after.pendingSummon).toBeUndefined();
  });
});
