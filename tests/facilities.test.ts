import { describe, expect, it } from "vitest";
import { cost, errors, growthCost } from "../src/domain/cost";
import { createMatch, legal, play } from "../src/domain/game";
import { emptySetup, idx, type Definition, type Match, type Piece } from "../src/domain/types";

const definition = (id: string, values: Partial<Definition> = {}): Definition => ({
  id, name: id, symbol: id.slice(0, 2).toUpperCase(), isCrown: false,
  patterns: [{ kind: "direction", vectors: [{ dx: 1, dy: 0 }], range: 1 }],
  ...values,
});
const state = (): Match => {
  const match = createMatch([], emptySetup(), "royal-any");
  match.board = Array(64).fill(null); match.turn = "white";
  return match;
};
const custom = (id: string, definitionId = id, values: Partial<Piece> = {}): Piece => ({ id, color: "white", role: "custom", definitionId, moved: true, ...values });

describe("facilities", () => {
  it("uses facility-only pricing and unlocks watch radius through a growth gap", () => {
    const fortress = definition("fortress", { facility: { kind: "fortress" }, patterns: [{ kind: "direction", vectors: [{ dx: 0, dy: -1 }], range: "slide" }] });
    expect(cost(fortress)).toBe(8);
    expect(errors({ ...fortress, isCrown: true })).toContain("施設にCrownは設定できません。");
    const tower = definition("tower", { facility: { kind: "watchtower", directions: "orthogonal", radius: 1 }, growth: { condition: { kind: "captures", subject: "self", threshold: 1 }, unlocks: {}, stages: [{ condition: { kind: "captures", subject: "self", threshold: 1 }, unlocks: {}, watchRadius: 2 }] } });
    expect(growthCost(tower).base).toBe(10);
    expect(growthCost(tower).stages[0].evaluated).toBe(15);
  });

  it("disables facility movement and fortress protects only against R3 or Slide direction captures", () => {
    const fortress = definition("fort", { facility: { kind: "fortress" } });
    const slide = definition("slide", { patterns: [{ kind: "direction", vectors: [{ dx: 1, dy: 0 }], range: "slide" }] });
    const leap = definition("leap", { patterns: [{ kind: "leap", vectors: [{ dx: 3, dy: 0 }] }] });
    const match = state();
    match.board[idx({ row: 4, col: 4 })] = custom("fort-piece", "fort");
    expect(legal(match, { row: 4, col: 4 }, [fortress])).toHaveLength(0);
    match.board[idx({ row: 4, col: 0 })] = custom("attacker", "slide");
    match.board[idx({ row: 4, col: 3 })] = { id: "ally", color: "black", role: "pawn", moved: true };
    match.board[idx({ row: 4, col: 5 })] = { ...custom("black-fort", "fort"), color: "black" };
    expect(legal(match, { row: 4, col: 0 }, [fortress, slide]).some((move) => move.to.col === 3)).toBe(false);
    match.board[idx({ row: 4, col: 0 })] = { id: "rook", color: "white", role: "rook", moved: true };
    expect(legal(match, { row: 4, col: 0 }, [fortress]).some((move) => move.to.col === 3)).toBe(false);
    match.board[idx({ row: 4, col: 0 })] = custom("attacker", "leap");
    expect(legal(match, { row: 4, col: 0 }, [fortress, leap]).some((move) => move.to.col === 3)).toBe(true);
  });

  it("fortress and watchtower stop path-based jumps but not fixed leaps", () => {
    const tower = definition("tower", { facility: { kind: "watchtower", directions: "diagonal" } });
    const advance = definition("advance", { patterns: [{ kind: "advance", vectors: [{ dx: 1, dy: 0 }], runup: 1, jump: 3, width: 1, usage: "move" }] });
    const jumper = definition("jumper", { patterns: [{ kind: "direction", vectors: [{ dx: 1, dy: 0 }], range: "slide", usage: "move", jumpAllies: 2 }] });
    const leap = definition("leap2", { patterns: [{ kind: "leap", vectors: [{ dx: 4, dy: 0 }], usage: "move" }] });
    const match = state();
    match.board[idx({ row: 4, col: 0 })] = custom("mover", "advance");
    match.board[idx({ row: 4, col: 2 })] = custom("tower-piece", "tower");
    expect(legal(match, { row: 4, col: 0 }, [tower, advance]).some((move) => move.to.col === 4)).toBe(false);
    match.board[idx({ row: 4, col: 0 })] = custom("mover", "jumper");
    expect(legal(match, { row: 4, col: 0 }, [tower, jumper]).some((move) => move.to.col > 2)).toBe(false);
    match.board[idx({ row: 4, col: 0 })] = custom("mover", "leap2");
    expect(legal(match, { row: 4, col: 0 }, [tower, leap]).some((move) => move.to.col === 4)).toBe(true);
  });

  it("watchtower promotes an escaped watched enemy and deploys an adjacent ally", () => {
    const tower = definition("tower", { facility: { kind: "watchtower", directions: "orthogonal", radius: 1 } });
    const match = state();
    match.board[idx({ row: 4, col: 4 })] = custom("tower-piece", "tower");
    match.board[idx({ row: 4, col: 7 })] = { id: "target", color: "black", role: "pawn", moved: true };
    match.board[idx({ row: 6, col: 0 })] = { id: "white-mover", color: "white", role: "pawn", moved: true };
    let next = play(match, { from: { row: 6, col: 0 }, to: { row: 5, col: 0 } }, [tower]);
    expect(next.facilityWatches).toEqual(expect.arrayContaining([expect.objectContaining({ towerId: "tower-piece", targetId: "target" })]));
    next = play(next, { from: { row: 4, col: 7 }, to: { row: 3, col: 7 } }, [tower]);
    expect(next.facilityTargets).toEqual(expect.arrayContaining([expect.objectContaining({ towerId: "tower-piece", targetId: "target" })]));
    next.board[idx({ row: 5, col: 4 })] = { id: "scout", color: "white", role: "pawn", moved: true };
    expect(legal(next, { row: 5, col: 4 }, [tower]).some((move) => move.facilityAction === "spotter" && Math.max(Math.abs(move.to.row - 3), Math.abs(move.to.col - 7)) === 1)).toBe(true);
  });

  it("wagon carries a custom Crown and creates an immediate interception", () => {
    const wagon = definition("wagon", { facility: { kind: "wagon" }, patterns: [] });
    const rider = definition("rider", { isCrown: true, patterns: [{ kind: "direction", vectors: [{ dx: 0, dy: -1 }], range: 1, usage: "move" }] });
    const match = state();
    match.board[idx({ row: 4, col: 4 })] = custom("wagon-piece", "wagon");
    match.board[idx({ row: 5, col: 4 })] = custom("rider-piece", "rider");
    match.board[idx({ row: 0, col: 6 })] = { id: "rook", color: "black", role: "rook", moved: true };
    const action = legal(match, { row: 5, col: 4 }, [wagon, rider]).find((move) => move.facilityAction === "wagon" && move.to.row === 4 && move.to.col === 7 && !move.next)!;
    expect(action).toBeDefined();
    expect(action.transportInterceptions).toBeUndefined();
    const transported = play(match, action, [wagon, rider]);
    expect(transported.transportExposure?.options).toEqual(expect.arrayContaining([expect.objectContaining({ enemyId: "rook", to: { row: 4, col: 6 } })]));
    const intercept = legal(transported, { row: 0, col: 6 }, [wagon, rider]).find((move) => move.facilityAction === "intercept")!;
    expect(intercept.to).toEqual({ row: 4, col: 6 });
    const captured = play(transported, intercept, [wagon, rider]);
    expect(captured.board.some((piece) => piece?.id === "rider-piece")).toBe(false);
    expect(captured.winner).toBe("black");
  });

  it("does not allow a standard King or another facility to board a wagon", () => {
    const wagon = definition("wagon", { facility: { kind: "wagon" } });
    const match = state();
    match.board[idx({ row: 4, col: 4 })] = custom("wagon-piece", "wagon");
    match.board[idx({ row: 5, col: 4 })] = { id: "king", color: "white", role: "king", moved: true };
    expect(legal(match, { row: 5, col: 4 }, [wagon]).some((move) => move.facilityAction === "wagon")).toBe(false);
  });
});
