import { describe, expect, it } from "vitest";
import { createMatch, legal, play, threatened } from "../src/domain/game";
import { emptySetup, idx, type Definition, type Match, type Piece } from "../src/domain/types";

const piece = (values: Partial<Piece> = {}): Piece => ({
  id: "hero", color: "white", role: "custom", definitionId: "hero", moved: true,
  evolved: true, evolvedMoved: false, ...values,
});
const match = (): Match => {
  const value = createMatch([], emptySetup(), "royal-any");
  value.board = Array(64).fill(null);
  value.turn = "white";
  return value;
};
const base = (patterns: Definition["patterns"], abilities = {}): Definition => ({
  id: "hero", name: "Hero", symbol: "HE", isCrown: false, patterns,
  growth: { condition: { kind: "captures", subject: "self", threshold: 1 }, unlocks: {}, ...abilities },
});

describe("evolution-only movement abilities", () => {
  it("keeps a normal second move non-capturing and stops after a first capture", () => {
    const definition: Definition = {
      id: "hero", name: "Hero", symbol: "HE", isCrown: false,
      patterns: [
        { kind: "leap", vectors: [{ dx: 1, dy: 0 }] },
        { kind: "leap", vectors: [{ dx: 1, dy: 0 }], usage: "both", phase: 2 },
      ],
    };
    const state = match();
    state.board[idx({ row: 4, col: 1 })] = piece({ evolved: false });
    state.board[idx({ row: 4, col: 3 })] = { id: "second-target", color: "black", role: "pawn", moved: true };
    expect(legal(state, { row: 4, col: 1 }, [definition]).some((move) => move.next?.to.col === 3)).toBe(false);
    state.board[idx({ row: 4, col: 2 })] = { id: "first-target", color: "black", role: "pawn", moved: true };
    expect(legal(state, { row: 4, col: 1 }, [definition]).filter((move) => move.to.col === 2).every((move) => !move.next)).toBe(true);
  });

  it("unlocks capture on a normal second move after growth", () => {
    const definition = base([
      { kind: "leap", vectors: [{ dx: 1, dy: 0 }] },
      { kind: "leap", vectors: [{ dx: 1, dy: 0 }], usage: "move", phase: 2 },
    ], { unlocks: { 1: { capture: true } } });
    const state = match();
    state.board[idx({ row: 4, col: 1 })] = piece();
    state.board[idx({ row: 4, col: 3 })] = { id: "target", color: "black", role: "pawn", moved: true };
    expect(legal(state, { row: 4, col: 1 }, [definition]).some((move) => move.next?.to.col === 3)).toBe(true);
  });

  it("allows a transformed piece to use capture-only second movement", () => {
    const definition: Definition = {
      id: "hero", name: "Hero", symbol: "HE", isCrown: false,
      patterns: [{ kind: "leap", vectors: [{ dx: 0, dy: 1 }] }],
      transformation: {
        condition: { kind: "captures", subject: "self", threshold: 1 },
        name: "Changed", symbol: "CH",
        patterns: [
          { kind: "leap", vectors: [{ dx: 1, dy: 0 }] },
          { kind: "leap", vectors: [{ dx: 1, dy: 0 }], usage: "capture", phase: 2 },
        ],
      },
    };
    const state = match();
    state.board[idx({ row: 4, col: 1 })] = piece();
    state.board[idx({ row: 4, col: 3 })] = { id: "target", color: "black", role: "pawn", moved: true };
    expect(legal(state, { row: 4, col: 1 }, [definition]).some((move) => move.next?.to.col === 3)).toBe(true);
  });

  it("offers discounted second movement only after a capture", () => {
    const definition = base([
      { kind: "leap", vectors: [{ dx: 1, dy: 0 }] },
      { kind: "leap", vectors: [{ dx: 0, dy: 1 }], usage: "move", phase: 2, evolutionOnly: true, secondTrigger: "after-capture" },
    ]);
    const state = match();
    state.board[idx({ row: 4, col: 2 })] = piece();
    expect(legal(state, { row: 4, col: 2 }, [definition]).some((move) => move.next)).toBe(false);
    state.board[idx({ row: 4, col: 3 })] = { id: "enemy", color: "black", role: "pawn", moved: true };
    const action = legal(state, { row: 4, col: 2 }, [definition]).find((move) => move.next)!;
    expect(action.next?.to).toEqual({ row: 5, col: 3 });
  });

  it("uses an occupied leap endpoint as a flight anchor without capturing it", () => {
    const definition = base([
      { kind: "leap", vectors: [{ dx: 1, dy: 0 }] },
      { kind: "direction", vectors: [{ dx: 1, dy: 0 }], range: 3, phase: 2, evolutionOnly: true, secondTrigger: "flight" },
    ]);
    const state = match();
    state.board[idx({ row: 4, col: 1 })] = piece();
    state.board[idx({ row: 4, col: 2 })] = { id: "anchor", color: "black", role: "pawn", moved: true };
    state.board[idx({ row: 4, col: 3 })] = { id: "block", color: "white", role: "pawn", moved: true };
    state.board[idx({ row: 4, col: 5 })] = { id: "target", color: "black", role: "pawn", moved: true };
    const action = legal(state, { row: 4, col: 1 }, [definition]).find((move) => move.transit && move.next?.to.col === 5)!;
    const next = play(state, action, [definition]);
    expect(next.board[idx({ row: 4, col: 2 })]?.id).toBe("anchor");
    expect(next.board[idx({ row: 4, col: 3 })]?.id).toBe("block");
    expect(next.board[idx({ row: 4, col: 5 })]?.id).toBe("hero");
    expect(next.board.find((item) => item?.id === "target")).toBeUndefined();
    expect(threatened(state, { row: 4, col: 5 }, "white", [definition])).toBe(true);
  });

  it("uses an occupied advance landing as a flight anchor without capturing it", () => {
    const definition = base([
      { kind: "advance", vectors: [{ dx: 1, dy: 0 }], usage: "both", runup: 1, jump: 2, width: 1 },
      { kind: "direction", vectors: [{ dx: 1, dy: 0 }], range: 2, phase: 2, evolutionOnly: true, secondTrigger: "flight" },
    ]);
    const state = match();
    state.board[idx({ row: 4, col: 1 })] = piece();
    state.board[idx({ row: 4, col: 4 })] = { id: "anchor", color: "black", role: "pawn", moved: true };
    const action = legal(state, { row: 4, col: 1 }, [definition]).find((move) => move.transit && move.next?.to.col === 6)!;
    const next = play(state, action, [definition]);
    expect(next.board[idx({ row: 4, col: 4 })]?.id).toBe("anchor");
    expect(next.board[idx({ row: 4, col: 6 })]?.id).toBe("hero");
  });

  it("allows local and once-per-piece global swaps", () => {
    const definition = base([{ kind: "direction", vectors: [{ dx: 1, dy: 0 }], range: 1 }], { localSwap: true, globalSwap: true });
    const state = match();
    state.board[idx({ row: 4, col: 2 })] = piece();
    state.board[idx({ row: 4, col: 3 })] = { id: "near", color: "white", role: "pawn", moved: false };
    state.board[idx({ row: 0, col: 0 })] = { id: "far", color: "white", role: "rook", moved: false };
    const actions = legal(state, { row: 4, col: 2 }, [definition]);
    expect(actions.some((move) => move.swap === "local" && move.to.col === 3)).toBe(true);
    const global = actions.find((move) => move.swap === "global" && move.to.row === 0)!;
    const next = play(state, global, [definition]);
    expect(next.board[idx({ row: 0, col: 0 })]?.id).toBe("hero");
    expect(next.board[idx({ row: 0, col: 0 })]?.globalSwapUsed).toBe(true);
    next.turn = "white";
    expect(legal(next, { row: 0, col: 0 }, [definition]).some((move) => move.swap === "global")).toBe(false);
  });

  it("consumes evolution-initial movement permission after any move", () => {
    const definition = base([
      { kind: "leap", vectors: [{ dx: 2, dy: 0 }], evolvedInitialOnly: true, evolutionOnly: true },
      { kind: "leap", vectors: [{ dx: 1, dy: 0 }] },
    ]);
    const state = match();
    state.board[idx({ row: 4, col: 2 })] = piece();
    expect(legal(state, { row: 4, col: 2 }, [definition]).some((move) => move.to.col === 4)).toBe(true);
    const ordinary = legal(state, { row: 4, col: 2 }, [definition]).find((move) => move.to.col === 3)!;
    const next = play(state, ordinary, [definition]);
    next.turn = "white";
    expect(legal(next, { row: 4, col: 3 }, [definition]).some((move) => move.to.col === 5)).toBe(false);
  });
});
