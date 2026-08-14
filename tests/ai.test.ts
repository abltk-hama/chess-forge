import { describe, expect, it } from "vitest";
import { chooseMove, evaluate, evaluateBreakdown, pieceValue } from "../src/domain/ai";
import { allLegal, createMatch } from "../src/domain/game";
import { emptySetup, idx, type Definition, type Match } from "../src/domain/types";

describe("AI", () => {
  it("enumerates the twenty opening moves", () => {
    const match = createMatch([], emptySetup(), "classic");
    expect(allLegal(match, [])).toHaveLength(20);
  });

  it("returns legal moves at every difficulty", () => {
    const match = {
      ...createMatch([], emptySetup(), "classic"),
      turn: "black" as const,
    };
    const legal = allLegal(match, []);
    for (const difficulty of ["easy", "normal", "hard"] as const) {
      const move = chooseMove(match, [], difficulty, () => 0);
      expect(legal).toContainEqual(move);
    }
  }, 5_000);

  it("normal AI takes a high-value exposed piece", () => {
    const match = createMatch([], emptySetup(), "royal-any") as Match;
    match.turn = "black";
    match.board = Array(64).fill(null);
    match.board[idx({ row: 0, col: 0 })] = {
      id: "black-rook",
      color: "black",
      role: "rook",
      moved: false,
    };
    match.board[idx({ row: 0, col: 3 })] = {
      id: "white-queen",
      color: "white",
      role: "queen",
      moved: false,
    };
    expect(chooseMove(match, [], "normal")?.to).toEqual({ row: 0, col: 3 });
  });

  it("scores terminal results above positional values", () => {
    const match = createMatch([], emptySetup(), "classic");
    expect(evaluate({ ...match, winner: "black" }, [])).toBeGreaterThan(
      900_000,
    );
    expect(evaluate({ ...match, winner: "white" }, [])).toBeLessThan(-900_000);
    expect(evaluate({ ...match, draw: true }, [])).toBe(0);
  });

  it("values the current growth stage and adds progress expectation separately", () => {
    const definition: Definition = {
      id: "grow", name: "Grow", symbol: "GR", isCrown: false,
      patterns: [{ kind: "direction", vectors: [{ dx: 0, dy: -1 }], range: 1, usage: "move" }],
      growth: {
        condition: { kind: "captures", subject: "self", threshold: 2 },
        unlocks: { 0: { range: "slide", capture: true } },
      },
    };
    const before = { id: "g", color: "black" as const, role: "custom" as const, definitionId: "grow", moved: false, captures: 1 };
    const after = { ...before, evolved: true, growthStage: 1 as const };
    expect(pieceValue(after, [definition])).toBeGreaterThan(pieceValue(before, [definition]));
    const match = createMatch([], emptySetup(), "royal-any") as Match;
    match.board = Array(64).fill(null);
    match.board[idx({ row: 3, col: 3 })] = before;
    expect(evaluateBreakdown(match, [definition]).evolution).toBeGreaterThan(0);
  });

  it("recognizes a currently usable stationary capture ability", () => {
    const definition: Definition = {
      id: "archer", name: "Archer", symbol: "AR", isCrown: false,
      patterns: [{ kind: "direction", vectors: [{ dx: 1, dy: 0 }], range: 2, usage: "move" }],
      growth: {
        condition: { kind: "captures", subject: "self", threshold: 1 },
        unlocks: { 0: { stationary: true } },
      },
    };
    const match = createMatch([], emptySetup(), "royal-any") as Match;
    match.board = Array(64).fill(null);
    match.board[idx({ row: 3, col: 2 })] = { id: "a", color: "black", role: "custom", definitionId: "archer", moved: true, evolved: true, growthStage: 1 };
    match.board[idx({ row: 3, col: 4 })] = { id: "target", color: "white", role: "rook", moved: true };
    expect(evaluateBreakdown(match, [definition]).abilities).toBeGreaterThanOrEqual(20);
  });

  it("normal white AI minimizes the evaluation and takes an exposed queen", () => {
    const match = createMatch([], emptySetup(), "royal-any") as Match;
    match.turn = "white";
    match.board = Array(64).fill(null);
    match.board[idx({ row: 7, col: 0 })] = { id: "white-rook", color: "white", role: "rook", moved: false };
    match.board[idx({ row: 7, col: 3 })] = { id: "black-queen", color: "black", role: "queen", moved: false };
    expect(chooseMove(match, [], "normal")?.to).toEqual({ row: 7, col: 3 });
  });
});
