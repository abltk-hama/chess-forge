import { describe, expect, it } from "vitest";
import { runSimulation } from "../src/domain/simulation";
import { emptySetup } from "../src/domain/types";

describe("AI balance simulation", () => {
  it("runs deterministic games up to the ply cap and aggregates piece stats", () => {
    const options = { games: 2, whiteDifficulty: "easy" as const, blackDifficulty: "easy" as const, maxPlies: 8, seed: 42, thinkTimeMs: 10 as const };
    const first = runSimulation([], emptySetup(), "classic", options);
    const second = runSimulation([], emptySetup(), "classic", options);
    expect(first.gamesCompleted).toBe(2);
    expect(first.games.every((game) => game.plies <= 8)).toBe(true);
    expect(first.whiteWins + first.blackWins + first.draws).toBe(2);
    expect(first.games.map((game) => game.history)).toEqual(second.games.map((game) => game.history));
    expect(first.pieces.some((stat) => stat.key === "pawn" && stat.appearances > 0)).toBe(true);
    expect(first.thinkTimeMs).toBe(10);
  });
});
