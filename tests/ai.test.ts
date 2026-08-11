import { describe, expect, it } from "vitest";
import { chooseMove, evaluate } from "../src/domain/ai";
import { allLegal, createMatch } from "../src/domain/game";
import { emptySetup, idx, type Match } from "../src/domain/types";

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
});
