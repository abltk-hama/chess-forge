import { describe, expect, it } from "vitest";
import { definitionCost, errors, growthCost } from "../src/domain/cost";
import { createMatch, isRoyal, play, pseudo } from "../src/domain/game";
import { emptySetup, idx } from "../src/domain/types";
import type { Definition, Match, Piece } from "../src/domain/types";

const growing = (
  unlocks: NonNullable<Definition["growth"]>["unlocks"],
  unlockCrown = false,
): Definition => ({
  id: "grow",
  name: "Grower",
  symbol: "GR",
  isCrown: false,
  patterns: [
    {
      kind: "direction",
      vectors: [{ dx: 0, dy: -1 }],
      range: 3,
      usage: "move",
    },
  ],
  growth: {
    condition: { kind: "captures", subject: "self", threshold: 1 },
    unlockCrown,
    unlocks,
  },
});

const piece = (overrides: Partial<Piece> = {}): Piece => ({
  id: "g",
  color: "white",
  role: "custom",
  definitionId: "grow",
  moved: false,
  ...overrides,
});

const matchWith = (definition: Definition): Match => {
  const match = createMatch([definition], emptySetup(), "royal-any");
  match.board = Array(64).fill(null);
  match.board[idx({ row: 7, col: 4 })] = {
    id: "wk",
    color: "white",
    role: "king",
    moved: false,
  };
  match.board[idx({ row: 0, col: 4 })] = {
    id: "bk",
    color: "black",
    role: "king",
    moved: false,
  };
  match.board[idx({ row: 4, col: 3 })] = piece();
  return match;
};

describe("growth", () => {
  it("prices two cumulative stages from each preceding gap", () => {
    const definition: Definition = {
      ...growing({}),
      patterns: [{ kind: "direction", vectors: [{ dx: 0, dy: -1 }], range: 1, usage: "move" }],
      growth: {
        condition: { kind: "captures", subject: "allies", threshold: 2 },
        unlocks: {},
        stages: [
          { condition: { kind: "captures", subject: "allies", threshold: 2 }, unlocks: { 0: { range: 2, capture: true } } },
          { condition: { kind: "captures", subject: "allies", threshold: 6 }, unlocks: { 0: { range: "slide", capture: true } } },
        ],
      },
    };
    const pricing = growthCost(definition);
    expect(pricing.stages).toHaveLength(2);
    expect(pricing.stages[0].discount).toBe(Math.floor(pricing.stages[0].gap * 0.2));
    expect(pricing.stages[1].discount).toBe(Math.floor(pricing.stages[1].gap * 0.6));
    expect(pricing.total).toBe(pricing.base + pricing.stages[0].charge + pricing.stages[1].charge);
    expect(errors(definition)).toEqual([]);
  });

  it("unlocks both stages when a shared condition crosses both thresholds", () => {
    const definition: Definition = {
      ...growing({}),
      patterns: [{ kind: "leap", vectors: [{ dx: 0, dy: -1 }], usage: "both" }],
      growth: {
        condition: { kind: "captures", subject: "allies", threshold: 1 },
        unlocks: {},
        stages: [
          { condition: { kind: "captures", subject: "allies", threshold: 1 }, unlocks: { 0: { vectors: [{ dx: 1, dy: -1 }] } } },
          { condition: { kind: "captures", subject: "allies", threshold: 2 }, unlocks: { 0: { vectors: [{ dx: 2, dy: -1 }] } } },
        ],
      },
    };
    let match = matchWith(definition);
    match.stats!.white.captures = 1;
    match.board[idx({ row: 3, col: 3 })] = { id: "enemy", color: "black", role: "pawn", moved: true };
    match = play(match, { from: { row: 4, col: 3 }, to: { row: 3, col: 3 } }, [definition]);
    expect(match.board.find((item) => item?.id === "g")?.growthStage).toBe(2);
  });

  it("does not charge for relocating the same number of leap targets", () => {
    const definition: Definition = {
      ...growing({}),
      patterns: [{ kind: "leap", vectors: [{ dx: 0, dy: -2 }], usage: "both" }],
      growth: {
        condition: { kind: "captures", subject: "self", threshold: 1 },
        unlocks: { 0: { vectors: [{ dx: 2, dy: -1 }] } },
      },
    };
    expect(growthCost(definition).stages[0].gap).toBe(0);
  });

  it("allows jumping when the same growth stage extends a one-square move", () => {
    const definition: Definition = {
      ...growing({}),
      patterns: [{ kind: "direction", vectors: [{ dx: 0, dy: -1 }], range: 1, usage: "move" }],
      growth: {
        condition: { kind: "captures", subject: "self", threshold: 1 },
        unlocks: { 0: { range: 2, jumpAllies: 1 } },
      },
    };
    expect(errors(definition)).toEqual([]);
    const state = matchWith(definition);
    state.board[idx({ row: 4, col: 3 })] = piece({ evolved: true, growthStage: 1 });
    state.board[idx({ row: 3, col: 3 })] = { id: "ally", color: "white", role: "pawn", moved: true };
    expect(pseudo(state, { row: 4, col: 3 }, [definition])).toEqual(
      expect.arrayContaining([expect.objectContaining({ to: { row: 2, col: 3 } })]),
    );
  });

  it("discounts the difference between base and unlocked abilities", () => {
    const definition = growing({ 0: { capture: true } });
    const pricing = growthCost(definition);
    expect(pricing.base).toBeLessThan(pricing.total);
    expect(pricing.premium).toBe(
      Math.max(
        1,
        Math.ceil(
          (definitionCost({
            ...definition,
            growth: undefined,
            patterns: [{ ...definition.patterns[0], usage: "both" }],
          }) -
            pricing.base) *
            0.85,
        ),
      ),
    );
    expect(errors(definition)).toEqual([]);
  });

  it("unlocks normal capture after the piece captures once", () => {
    const definition = growing({ 0: { capture: true } });
    let match = matchWith(definition);
    match.board[idx({ row: 3, col: 3 })] = {
      id: "enemy",
      color: "black",
      role: "pawn",
      moved: true,
    };
    expect(pseudo(match, { row: 4, col: 3 }, [definition])).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ to: { row: 3, col: 3 } })]),
    );
    definition.patterns[0] = {
      kind: "leap",
      vectors: [{ dx: 1, dy: -1 }],
      usage: "both",
    };
    match.board[idx({ row: 3, col: 4 })] = {
      id: "enemy2",
      color: "black",
      role: "pawn",
      moved: true,
    };
    match = play(
      match,
      { from: { row: 4, col: 3 }, to: { row: 3, col: 4 } },
      [definition],
    );
    expect(match.board[idx({ row: 3, col: 4 })]?.evolved).toBe(true);
  });

  it("unlocks stationary capture", () => {
    const definition = growing({ 0: { stationary: true } });
    const match = matchWith(definition);
    match.board[idx({ row: 2, col: 3 })] = {
      id: "enemy",
      color: "black",
      role: "pawn",
      moved: true,
    };
    match.board[idx({ row: 4, col: 3 })] = piece({ evolved: true });
    expect(
      pseudo(match, { row: 4, col: 3 }, [definition]).find(
        (move) => move.to.row === 2 && move.to.col === 3,
      )?.stationary,
    ).toBe(true);
    expect(pseudo(match, { row: 4, col: 3 }, [definition])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ to: { row: 3, col: 3 } }),
      ]),
    );
  });

  it("does not count a stationary capture target as territory reached", () => {
    const definition: Definition = {
      ...growing({ 0: { stationary: true } }),
      growth: {
        condition: { kind: "territory", subject: "self", depth: 3 },
        unlocks: { 0: { stationary: true } },
      },
    };
    let match = matchWith(definition);
    match.board[idx({ row: 2, col: 3 })] = {
      id: "enemy",
      color: "black",
      role: "pawn",
      moved: true,
    };
    match.board[idx({ row: 4, col: 3 })] = piece({ evolved: true });
    match = play(
      match,
      {
        from: { row: 4, col: 3 },
        to: { row: 2, col: 3 },
        stationary: true,
      },
      [definition],
    );
    expect(match.board[idx({ row: 4, col: 3 })]?.reachedEnemyDepth).toBe(5);
  });

  it("unlocks jumping and additive cannon capture", () => {
    const jumping = growing({ 0: { jumpAllies: 1 } });
    let match = matchWith(jumping);
    match.board[idx({ row: 4, col: 3 })] = piece({ evolved: true });
    match.board[idx({ row: 3, col: 3 })] = {
      id: "ally",
      color: "white",
      role: "pawn",
      moved: true,
    };
    expect(pseudo(match, { row: 4, col: 3 }, [jumping])).toEqual(
      expect.arrayContaining([expect.objectContaining({ to: { row: 2, col: 3 } })]),
    );

    const cannon = growing({ 0: { cannon: true } });
    match = matchWith(cannon);
    match.board[idx({ row: 4, col: 3 })] = piece({ evolved: true });
    match.board[idx({ row: 3, col: 3 })] = {
      id: "screen",
      color: "white",
      role: "pawn",
      moved: true,
    };
    match.board[idx({ row: 2, col: 3 })] = {
      id: "target",
      color: "black",
      role: "pawn",
      moved: true,
    };
    expect(pseudo(match, { row: 4, col: 3 }, [cannon])).toEqual(
      expect.arrayContaining([expect.objectContaining({ to: { row: 2, col: 3 } })]),
    );
  });

  it("makes the piece royal only after crown growth", () => {
    const definition = growing({}, true);
    expect(isRoyal(piece(), [definition])).toBe(false);
    expect(isRoyal(piece({ evolved: true }), [definition])).toBe(true);
  });

  it("adds a royal-all target when crown growth occurs", () => {
    const definition = growing({}, true);
    let match = matchWith(definition);
    match.preset = "royal-all";
    match.board[idx({ row: 3, col: 4 })] = {
      id: "enemy",
      color: "black",
      role: "pawn",
      moved: true,
    };
    definition.patterns[0] = {
      kind: "leap",
      vectors: [{ dx: 1, dy: -1 }],
      usage: "both",
    };
    match = play(
      match,
      { from: { row: 4, col: 3 }, to: { row: 3, col: 4 } },
      [definition],
    );
    expect(match.targets.white).toBe(2);
  });

  it("does not chain ally-evolution conditions in the same evaluation", () => {
    const trigger: Definition = {
      ...growing({ 0: { capture: true } }),
      id: "trigger",
      symbol: "TR",
      growth: {
        condition: { kind: "captures", subject: "allies", threshold: 1 },
        unlocks: { 0: { capture: true } },
      },
    };
    const follower: Definition = {
      ...trigger,
      id: "follower",
      symbol: "FL",
      growth: {
        condition: { kind: "evolutions", side: "ally", threshold: 1 },
        unlocks: { 0: { capture: true } },
      },
    };
    let match = matchWith(trigger);
    match.board[idx({ row: 4, col: 3 })] = {
      ...piece(),
      definitionId: trigger.id,
    };
    match.board[idx({ row: 5, col: 5 })] = {
      ...piece({ id: "f" }),
      definitionId: follower.id,
    };
    match.board[idx({ row: 3, col: 3 })] = {
      id: "enemy",
      color: "black",
      role: "pawn",
      moved: true,
    };
    trigger.patterns[0] = {
      kind: "leap",
      vectors: [{ dx: 0, dy: -1 }],
      usage: "both",
    };
    match = play(
      match,
      { from: { row: 4, col: 3 }, to: { row: 3, col: 3 } },
      [trigger, follower],
    );
    expect(match.board.find((item) => item?.id === "g")?.evolved).toBe(true);
    expect(match.board.find((item) => item?.id === "f")?.evolved).not.toBe(true);
  });
});
