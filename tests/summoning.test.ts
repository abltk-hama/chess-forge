import { describe, expect, it } from "vitest";
import { definitionCost, errors, summonLimit, summonedDefinition, summoningAbilityCost } from "../src/domain/cost";
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
  it("charges whole-piece abilities to the summoner without consuming the derived movement limit", () => {
    const normal = definition("summon");
    normal.summoning!.abilities = { dark: true, barrier: true, seal: true };
    expect(summoningAbilityCost(normal)).toBe(17);
    expect(definitionCost(normal)).toBe(definitionCost(definition("summon")) + 17);
    expect(errors(normal)).not.toContain(`派生駒コストが上限${summonLimit(normal)}を超えています。`);

    const split = definition("split");
    split.summoning!.abilities = { dark: true, barrier: true, deathbind: true, devotion: true, seal: true };
    expect(summoningAbilityCost(split)).toBe(4 + 2 + 5 + 4 + 3);
  });
  it("inherits only eligible whole-piece abilities and never leaks parent abilities otherwise", () => {
    const normal = { ...definition("summon"), dark: true, barrier: true, deathbind: true, devotion: true, seal: true, zeroBody: true, rebirth: {}, eagleHunt: true, isCrown: true } satisfies Definition;
    const ordinarySummon = summonedDefinition(normal);
    expect(ordinarySummon).toMatchObject({ isCrown: false });
    for (const key of ["dark", "barrier", "deathbind", "devotion", "seal", "zeroBody", "rebirth", "eagleHunt"] as const)
      expect(ordinarySummon[key]).toBeUndefined();

    const inherit = { ...normal, summoning: { ...normal.summoning!, timing: "inherit" as const } };
    expect(summonedDefinition(inherit)).toMatchObject({ dark: true, barrier: true, deathbind: true, devotion: true, seal: true, isCrown: false });
    expect(summonedDefinition(inherit).zeroBody).toBeUndefined();
    expect(summonedDefinition(inherit).rebirth).toBeUndefined();
    expect(summonedDefinition(inherit).eagleHunt).toBeUndefined();
  });
  it("activates a configured summoned dark ability without marking the piece evolved", () => {
    const d = definition("summon");
    d.summoning!.abilities = { dark: true };
    d.patterns = [{ kind: "direction", vectors: [{ dx: 1, dy: 0 }], range: "slide" }];
    d.isCrown = true;
    const s = createMatch([], emptySetup(), "royal-any");
    s.board = Array(64).fill(null);
    s.turn = "white";
    s.board[idx({ row: 4, col: 0 })] = { id: "crown", color: "white", role: "custom", definitionId: d.id, moved: true };
    s.board[idx({ row: 4, col: 4 })] = { id: "minion", color: "black", role: "custom", definitionId: d.id, moved: true, summoned: true };
    expect(legal(s, { row: 4, col: 0 }, [d]).some((move) => move.to.col === 4)).toBe(false);
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

describe("split rebirth sequencing", () => {
  it("does not block the opponent turn and refreshes rebirth squares when the owner turn returns", () => {
    const d: Definition = { ...definition("split"), rebirth: { splitAllowed: true } };
    let next = play(state(d), { from: { row: 4, col: 2 }, to: { row: 4, col: 3 } }, [d]);
    next = placeSummon(next, next.pendingSummon!.candidates[0]);
    next = placeSummon(next, next.pendingSummon!.candidates[0]);
    expect(next.turn).toBe("black");
    expect(next.pendingRebirth?.owner).toBe("white");

    next.board[idx({ row: 0, col: 0 })] = { id: "br", color: "black", role: "rook", moved: true };
    const afterBlack = play(next, { from: { row: 0, col: 0 }, to: { row: 0, col: 1 } }, [d]);
    expect(afterBlack.turn).toBe("white");
    expect(afterBlack.pendingRebirth?.owner).toBe("white");
    expect(afterBlack.pendingRebirth?.candidates.every((pos) => !afterBlack.board[idx(pos)])).toBe(true);
  });
});
