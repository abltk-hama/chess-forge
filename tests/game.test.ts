import { describe, expect, it } from "vitest";
import {
  createMatch,
  inspectRange,
  legal,
  pieceText,
  play,
  pseudo,
  threatened,
} from "../src/domain/game";
import {
  emptySetup,
  idx,
  type Definition,
  type Match,
} from "../src/domain/types";
const crown: Definition = {
  id: "c",
  name: "Crown",
  symbol: "C",
  isCrown: true,
  patterns: [
    {
      kind: "direction",
      vectors: [{ dx: 0, dy: -1 }],
      range: "slide",
      canJump: false,
    },
  ],
};
describe("game", () => {
  it("inspects movement and hypothetical capture squares separately", () => {
    const match = createMatch([], emptySetup(), "classic");
    match.board = Array(64).fill(null);
    match.board[idx({ row: 4, col: 4 })] = {
      id: "r",
      color: "black",
      role: "rook",
      moved: false,
    };
    match.board[idx({ row: 4, col: 6 })] = {
      id: "block",
      color: "black",
      role: "pawn",
      moved: false,
    };

    const range = inspectRange(match, { row: 4, col: 4 }, []);
    expect(
      range.find((mark) => mark.to.row === 4 && mark.to.col === 5),
    ).toMatchObject({
      move: true,
      capture: true,
    });
    expect(
      range.find((mark) => mark.to.row === 4 && mark.to.col === 6),
    ).toMatchObject({
      move: false,
      capture: true,
    });
    expect(range.some((mark) => mark.to.row === 4 && mark.to.col === 7)).toBe(
      false,
    );
  });
  it("uses two-letter labels for standard pieces", () => {
    expect(
      pieceText({ id: "w", color: "white", role: "knight", moved: false }, []),
    ).toBe("KN");
    expect(
      pieceText({ id: "b", color: "black", role: "pawn", moved: false }, []),
    ).toBe("po");
  });
  it("creates symmetric standard board", () => {
    const s = createMatch([], emptySetup(), "classic");
    expect(s.board.filter(Boolean)).toHaveLength(32);
    expect(s.turn).toBe("white");
  });
  it("allows pawn double step", () => {
    const s = createMatch([], emptySetup(), "classic");
    const moves = legal(s, { row: 6, col: 4 }, []);
    expect(moves.some((m) => m.to.row === 4 && m.to.col === 4)).toBe(true);
  });
  it("replaces both matching back-rank slots", () => {
    const setup = { ...emptySetup(), rook: "c" };
    const s = createMatch([crown], setup, "royal-all");
    expect(s.board[idx({ row: 0, col: 0 })]?.role).toBe("custom");
    expect(s.board[idx({ row: 7, col: 7 })]?.role).toBe("custom");
  });
  it("royal-any ends after king capture", () => {
    const s = createMatch([], emptySetup(), "royal-any");
    s.board = Array(64).fill(null);
    s.board[idx({ row: 7, col: 0 })] = {
      id: "w",
      color: "white",
      role: "rook",
      moved: false,
    };
    s.board[idx({ row: 0, col: 0 })] = {
      id: "k",
      color: "black",
      role: "king",
      moved: false,
    };
    const n = play(s, { from: { row: 7, col: 0 }, to: { row: 0, col: 0 } }, []);
    expect(n.winner).toBe("white");
  });
  it("royal-all continues after first target", () => {
    const setup = { ...emptySetup(), queen: "c" },
      s = createMatch([crown], setup, "royal-all");
    s.board = Array(64).fill(null);
    s.board[idx({ row: 7, col: 0 })] = {
      id: "w",
      color: "white",
      role: "rook",
      moved: false,
    };
    s.board[idx({ row: 0, col: 0 })] = {
      id: "k",
      color: "black",
      role: "king",
      moved: false,
    };
    const n = play(s, { from: { row: 7, col: 0 }, to: { row: 0, col: 0 } }, [
      crown,
    ]);
    expect(n.winner).toBeNull();
    expect(n.lost.black).toBe(1);
  });
});

it("separates ally and enemy jumping", () => {
  const definition: Definition = {
    id: "j",
    name: "Jumper",
    symbol: "J",
    isCrown: false,
    patterns: [
      {
        kind: "direction",
        vectors: [{ dx: 1, dy: 0 }],
        range: 3,
        jumpAllies: true,
        jumpEnemies: false,
      },
    ],
  };
  const match = createMatch([], emptySetup(), "royal-any") as Match;
  match.board = Array(64).fill(null);
  match.board[idx({ row: 4, col: 1 })] = {
    id: "j1",
    color: "white",
    role: "custom",
    definitionId: "j",
    moved: false,
  };
  match.board[idx({ row: 4, col: 2 })] = {
    id: "a",
    color: "white",
    role: "pawn",
    moved: false,
  };
  expect(
    pseudo(match, { row: 4, col: 1 }, [definition]).some(
      (move) => move.to.col === 3,
    ),
  ).toBe(true);
  match.board[idx({ row: 4, col: 2 })] = {
    id: "e",
    color: "black",
    role: "pawn",
    moved: false,
  };
  expect(
    pseudo(match, { row: 4, col: 1 }, [definition]).some(
      (move) => move.to.col === 3,
    ),
  ).toBe(false);
  definition.patterns = [
    {
      kind: "direction",
      vectors: [{ dx: 1, dy: 0 }],
      range: 3,
      jumpAllies: false,
      jumpEnemies: true,
    },
  ];
  expect(
    pseudo(match, { row: 4, col: 1 }, [definition]).some(
      (move) => move.to.col === 3,
    ),
  ).toBe(true);
});

it("limits the number of allied pieces crossed by a direction", () => {
  const definition: Definition = {
    id: "limited",
    name: "Limited",
    symbol: "LI",
    isCrown: false,
    patterns: [
      {
        kind: "direction",
        vectors: [{ dx: 1, dy: 0 }],
        range: "slide",
        jumpAllies: 1,
      },
    ],
  };
  const match = createMatch([], emptySetup(), "royal-any");
  match.board = Array(64).fill(null);
  match.board[idx({ row: 4, col: 0 })] = {
    id: "l",
    color: "white",
    role: "custom",
    definitionId: "limited",
    moved: false,
  };
  for (const col of [1, 3])
    match.board[idx({ row: 4, col })] = {
      id: `a${col}`,
      color: "white",
      role: "pawn",
      moved: false,
    };
  const moves = pseudo(match, { row: 4, col: 0 }, [definition]);
  expect(moves.some((move) => move.to.col === 2)).toBe(true);
  expect(moves.some((move) => move.to.col === 4)).toBe(false);
});

it("separates move-only and capture-only destinations", () => {
  const definition: Definition = {
    id: "u",
    name: "Usage",
    symbol: "U",
    isCrown: false,
    patterns: [
      {
        kind: "direction",
        vectors: [
          { dx: 1, dy: 0 },
          { dx: -1, dy: 0 },
        ],
        range: 1,
        usage: "move",
      },
    ],
  };
  const match = createMatch([], emptySetup(), "royal-any");
  match.board = Array(64).fill(null);
  match.board[idx({ row: 4, col: 4 })] = {
    id: "u1",
    color: "white",
    role: "custom",
    definitionId: "u",
    moved: false,
  };
  match.board[idx({ row: 4, col: 5 })] = {
    id: "e",
    color: "black",
    role: "pawn",
    moved: false,
  };
  let moves = pseudo(match, { row: 4, col: 4 }, [definition]);
  expect(moves.some((move) => move.to.col === 3)).toBe(true);
  expect(moves.some((move) => move.to.col === 5)).toBe(false);
  definition.patterns[0].usage = "capture";
  moves = pseudo(match, { row: 4, col: 4 }, [definition]);
  expect(moves.some((move) => move.to.col === 3)).toBe(false);
  expect(moves.some((move) => move.to.col === 5)).toBe(true);
});

it("requires exactly one screen for cannon capture", () => {
  const definition: Definition = {
    id: "cannon",
    name: "Cannon",
    symbol: "C",
    isCrown: false,
    patterns: [
      {
        kind: "direction",
        vectors: [{ dx: 1, dy: 0 }],
        range: "slide",
        cannon: true,
      },
    ],
  };
  const match = createMatch([], emptySetup(), "royal-any");
  match.board = Array(64).fill(null);
  match.board[idx({ row: 4, col: 0 })] = {
    id: "c",
    color: "white",
    role: "custom",
    definitionId: "cannon",
    moved: false,
  };
  match.board[idx({ row: 4, col: 2 })] = {
    id: "screen",
    color: "white",
    role: "pawn",
    moved: false,
  };
  match.board[idx({ row: 4, col: 5 })] = {
    id: "target",
    color: "black",
    role: "queen",
    moved: false,
  };
  let moves = pseudo(match, { row: 4, col: 0 }, [definition]);
  expect(moves.some((move) => move.to.col === 1)).toBe(true);
  expect(moves.some((move) => move.to.col === 5)).toBe(true);
  expect(moves.some((move) => move.to.col === 3)).toBe(false);
  match.board[idx({ row: 4, col: 2 })] = null;
  moves = pseudo(match, { row: 4, col: 0 }, [definition]);
  expect(moves.some((move) => move.to.col === 5)).toBe(false);
});

it("removes initial-only movement after the piece moves", () => {
  const definition: Definition = {
    id: "initial",
    name: "Initial",
    symbol: "I",
    isCrown: false,
    patterns: [
      {
        kind: "direction",
        vectors: [{ dx: 1, dy: 0 }],
        range: 3,
        initialOnly: true,
      },
    ],
  };
  const match = createMatch([], emptySetup(), "royal-any");
  match.board = Array(64).fill(null);
  match.board[idx({ row: 4, col: 3 })] = {
    id: "i",
    color: "white",
    role: "custom",
    definitionId: "initial",
    moved: false,
  };
  expect(pseudo(match, { row: 4, col: 3 }, [definition])).not.toHaveLength(0);
  match.board[idx({ row: 4, col: 3 })]!.moved = true;
  expect(pseudo(match, { row: 4, col: 3 }, [definition])).toHaveLength(0);
});

it("captures at range without moving the archer", () => {
  const definition: Definition = {
    id: "archer",
    name: "Archer",
    symbol: "AR",
    isCrown: false,
    patterns: [
      {
        kind: "leap",
        vectors: [{ dx: 2, dy: 0 }],
        usage: "stationary",
      },
    ],
  };
  const match = createMatch([], emptySetup(), "royal-any");
  match.board = Array(64).fill(null);
  match.board[idx({ row: 4, col: 2 })] = {
    id: "a",
    color: "white",
    role: "custom",
    definitionId: "archer",
    moved: false,
  };
  match.board[idx({ row: 4, col: 4 })] = {
    id: "e",
    color: "black",
    role: "rook",
    moved: false,
  };
  const action = legal(match, { row: 4, col: 2 }, [definition])[0];
  expect(action.stationary).toBe(true);
  const next = play(match, action, [definition]);
  expect(next.board[idx({ row: 4, col: 2 })]?.id).toBe("a");
  expect(next.board[idx({ row: 4, col: 4 })]).toBeNull();
});

it("combines two movement phases and limits the turn to one capture", () => {
  const definition: Definition = {
    id: "runner",
    name: "Runner",
    symbol: "RU",
    isCrown: false,
    patterns: [
      {
        kind: "leap",
        vectors: [{ dx: 1, dy: 0 }],
        phase: 1,
      },
      {
        kind: "leap",
        vectors: [{ dx: 0, dy: 1 }],
        phase: 2,
      },
    ],
  };
  const match = createMatch([], emptySetup(), "royal-any");
  match.board = Array(64).fill(null);
  match.board[idx({ row: 4, col: 2 })] = {
    id: "r",
    color: "white",
    role: "custom",
    definitionId: "runner",
    moved: false,
  };
  match.board[idx({ row: 4, col: 3 })] = {
    id: "e1",
    color: "black",
    role: "pawn",
    moved: false,
  };
  match.board[idx({ row: 5, col: 3 })] = {
    id: "e2",
    color: "black",
    role: "pawn",
    moved: false,
  };
  const actions = legal(match, { row: 4, col: 2 }, [definition]);
  expect(actions.some((action) => !action.next)).toBe(true);
  expect(actions.some((action) => action.next)).toBe(false);
  match.board[idx({ row: 4, col: 3 })] = null;
  match.board[idx({ row: 5, col: 3 })] = null;
  const combined = legal(match, { row: 4, col: 2 }, [definition]).find(
    (action) => action.next,
  )!;
  const next = play(match, combined, [definition]);
  expect(next.board[idx({ row: 5, col: 3 })]?.id).toBe("r");
});

it("treats a second-phase capture as a threat", () => {
  const definition: Definition = {
    id: "fork",
    name: "Fork",
    symbol: "FO",
    isCrown: false,
    patterns: [
      {
        kind: "leap",
        vectors: [{ dx: 1, dy: 0 }],
        usage: "move",
        phase: 1,
      },
      {
        kind: "leap",
        vectors: [{ dx: 0, dy: 1 }],
        usage: "move",
        phase: 2,
      },
    ],
    growth: {
      condition: { kind: "captures", subject: "self", threshold: 1 },
      unlocks: { 1: { capture: true } },
    },
  };
  const match = createMatch([], emptySetup(), "classic");
  match.board = Array(64).fill(null);
  match.board[idx({ row: 4, col: 2 })] = {
    id: "f",
    color: "white",
    role: "custom",
    definitionId: "fork",
    moved: false,
    evolved: true,
  };
  match.board[idx({ row: 5, col: 3 })] = {
    id: "k",
    color: "black",
    role: "king",
    moved: false,
  };
  expect(threatened(match, { row: 5, col: 3 }, "white", [definition])).toBe(
    true,
  );
});

describe("new movement abilities", () => {
  const customMatch = (definition: Definition): Match => ({
    ...createMatch([definition], emptySetup(), "royal-any"),
    board: Array(64).fill(null),
    turn: "white",
  });

  it("hound chain allows a right angle but rejects an immediate reverse", () => {
    const s = customMatch({ id: "unused", name: "Unused", symbol: "UN", isCrown: false, patterns: [{ kind: "direction", vectors: [{ dx: 1, dy: 0 }], range: 1 }] });
    s.board[idx({ row: 4, col: 4 })] = { id: "dog", color: "white", role: "hound", moved: false, dogTraining: "coordination" };
    const chains = legal(s, { row: 4, col: 4 }, []);
    expect(chains.some((move) => move.chain?.length === 2 && move.chain[0].to.col === 5 && move.chain[1].to.row === 3 && move.chain[1].to.col === 5)).toBe(true);
    expect(chains.some((move) => move.chain?.length === 2 && move.chain[0].to.col === 5 && move.chain[1].to.col === 4)).toBe(false);
  });

  it("custom chain movement supports early stop, same direction and right turns", () => {
    const definition: Definition = { id: "chain", name: "Chain", symbol: "CH", isCrown: false, patterns: [{ kind: "chain", vectors: [{ dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }], maxChains: 3, usage: "both" }] };
    const s = customMatch(definition);
    s.board[idx({ row: 4, col: 4 })] = { id: "chain-piece", color: "white", role: "custom", definitionId: definition.id, moved: false };
    const moves = legal(s, { row: 4, col: 4 }, [definition]);
    expect(moves.some((move) => move.chain?.length === 1)).toBe(true);
    expect(moves.some((move) => move.chain?.length === 3 && move.chain.every((step) => step.to.col === 4))).toBe(true);
    expect(moves.some((move) => move.chain?.length === 2 && move.chain[0].to.row === 3 && move.chain[1].to.col === 5)).toBe(true);
    expect(moves.some((move) => move.chain?.length === 2 && move.chain[0].to.row === 3 && move.chain[1].to.row === 4)).toBe(false);
  });

  it("custom chain movement stops on capture and move-only chains cannot capture", () => {
    const both: Definition = { id: "chain-both", name: "Chain Both", symbol: "CB", isCrown: false, patterns: [{ kind: "chain", vectors: [{ dx: 0, dy: -1 }], maxChains: 3, usage: "both" }] };
    const s = customMatch(both);
    s.board[idx({ row: 5, col: 4 })] = { id: "chain-piece", color: "white", role: "custom", definitionId: both.id, moved: false };
    s.board[idx({ row: 3, col: 4 })] = { id: "target", color: "black", role: "pawn", moved: false };
    const captures = legal(s, { row: 5, col: 4 }, [both]).filter((move) => move.chain?.some((step) => step.to.row === 3 && step.to.col === 4));
    expect(captures.some((move) => move.chain?.length === 2)).toBe(true);
    expect(captures.some((move) => (move.chain?.length ?? 0) > 2)).toBe(false);
    const moveOnly: Definition = { ...both, id: "chain-move", patterns: [{ ...both.patterns[0], usage: "move" }] };
    s.board[idx({ row: 5, col: 4 })] = { id: "chain-piece", color: "white", role: "custom", definitionId: moveOnly.id, moved: false };
    expect(legal(s, { row: 5, col: 4 }, [moveOnly]).some((move) => move.chain?.some((step) => step.to.row === 3 && step.to.col === 4))).toBe(false);
  });

  it("advance requires clear runup but ignores pieces in the jump segment", () => {
    const definition: Definition = { id: "advance", name: "Advance", symbol: "AD", isCrown: false, patterns: [{ kind: "advance", vectors: [{ dx: 0, dy: -1 }], usage: "move", runup: 2, jump: 3, width: 1 }] };
    const s = customMatch(definition);
    s.board[idx({ row: 7, col: 3 })] = { id: "p", color: "white", role: "custom", definitionId: definition.id, moved: false };
    s.board[idx({ row: 4, col: 3 })] = { id: "ignored", color: "black", role: "pawn", moved: false };
    expect(legal(s, { row: 7, col: 3 }, [definition]).some((move) => move.to.row === 2)).toBe(true);
    s.board[idx({ row: 6, col: 3 })] = { id: "block", color: "white", role: "pawn", moved: false };
    expect(legal(s, { row: 7, col: 3 }, [definition]).some((move) => move.to.row === 2)).toBe(false);
  });

  it("advance width three filters runup overlap and applies every Usage", () => {
    const definition: Definition = { id: "advance-width", name: "Advance", symbol: "AW", isCrown: false, patterns: [{ kind: "advance", vectors: [{ dx: 0, dy: -1 }], usage: "both", runup: 1, jump: 1, width: 3 }] };
    const s = customMatch(definition);
    s.board[idx({ row: 6, col: 3 })] = { id: "p", color: "white", role: "custom", definitionId: definition.id, moved: false };
    s.board[idx({ row: 3, col: 3 })] = { id: "target", color: "black", role: "pawn", moved: false };
    const moves = legal(s, { row: 6, col: 3 }, [definition]);
    expect(moves.some((move) => move.to.row === 5)).toBe(false);
    expect(moves.some((move) => move.to.row === 4)).toBe(true);
    expect(moves.some((move) => move.to.row === 3)).toBe(true);

    for (const usage of ["move", "capture", "stationary", "both"] as const) {
      const d: Definition = { ...definition, patterns: [{ ...definition.patterns[0], usage, width: 1, jump: 2 }] };
      const state = customMatch(d);
      state.board[idx({ row: 6, col: 3 })] = { id: "p", color: "white", role: "custom", definitionId: d.id, moved: false };
      state.board[idx({ row: 3, col: 3 })] = { id: "enemy", color: "black", role: "pawn", moved: false };
      const action = legal(state, { row: 6, col: 3 }, [d]).find((move) => move.to.row === 3);
      expect(!!action).toBe(usage !== "move");
      expect(!!action?.stationary).toBe(usage === "stationary");
    }
  });

  it("hunting hound requires an exit after a fourth-chain capture when one is available", () => {
    const s = customMatch({ id: "unused", name: "Unused", symbol: "UN", isCrown: false, patterns: [{ kind: "direction", vectors: [{ dx: 1, dy: 0 }], range: 1 }] });
    s.board[idx({ row: 4, col: 1 })] = { id: "dog", color: "white", role: "hound", moved: false, dogTraining: "hunting" };
    s.board[idx({ row: 4, col: 5 })] = { id: "target", color: "black", role: "pawn", moved: false };
    const moves = legal(s, { row: 4, col: 1 }, []);
    const fourthCaptures = moves.filter((move) => move.chain?.[3]?.to.row === 4 && move.chain[3].to.col === 5);
    expect(fourthCaptures.length).toBeGreaterThan(0);
    expect(fourthCaptures.every((move) => move.chain?.length === 5)).toBe(true);
  });

  it("rejects a hound chain whose final special step exposes its king", () => {
    const s = customMatch({ id: "unused", name: "Unused", symbol: "UN", isCrown: false, patterns: [{ kind: "direction", vectors: [{ dx: 1, dy: 0 }], range: 1 }] });
    s.preset = "classic";
    s.board[idx({ row: 7, col: 4 })] = { id: "king", color: "white", role: "king", moved: false };
    s.board[idx({ row: 6, col: 4 })] = { id: "dog", color: "white", role: "hound", moved: false, dogTraining: "hunting" };
    s.board[idx({ row: 0, col: 4 })] = { id: "rook", color: "black", role: "rook", moved: false };
    const moves = legal(s, { row: 6, col: 4 }, []);
    expect(moves.some((move) => move.chain?.[0]?.to.col !== 4)).toBe(false);
  });

  it("pass-through can either leave or capture a passed enemy while landing beyond it", () => {
    const definition: Definition = { id: "pass", name: "Pass", symbol: "PS", isCrown: false, patterns: [{ kind: "direction", vectors: [{ dx: 0, dy: -1 }], range: "slide", passEnemies: 1 }] };
    const s = customMatch(definition);
    s.board[idx({ row: 6, col: 3 })] = { id: "p", color: "white", role: "custom", definitionId: definition.id, moved: false };
    s.board[idx({ row: 4, col: 3 })] = { id: "e1", color: "black", role: "pawn", moved: false };
    const moves = legal(s, { row: 6, col: 3 }, [definition]).filter((m) => m.to.row === 3 && m.to.col === 3);
    expect(moves.some((m) => !m.passCaptureAt)).toBe(true);
    const capture = moves.find((m) => m.passCaptureAt);
    expect(capture?.passCaptureAt).toEqual({ row: 4, col: 3 });
    const after = play(s, capture!, [definition]);
    expect(after.board[idx({ row: 4, col: 3 })]).toBeNull();
    expect(after.board[idx({ row: 3, col: 3 })]?.id).toBe("p");
  });

  it("pass-through directions cannot capture by landing on an enemy square", () => {
    const definition: Definition = { id: "pass-no-normal", name: "Pass", symbol: "PN", isCrown: false, patterns: [{ kind: "direction", vectors: [{ dx: 0, dy: -1 }], range: "slide", passEnemies: 1 }] };
    const s = customMatch(definition);
    s.board[idx({ row: 6, col: 3 })] = { id: "p", color: "white", role: "custom", definitionId: definition.id, moved: false };
    s.board[idx({ row: 4, col: 3 })] = { id: "e1", color: "black", role: "pawn", moved: false };
    s.board[idx({ row: 2, col: 3 })] = { id: "e2", color: "black", role: "pawn", moved: false };
    const moves = legal(s, { row: 6, col: 3 }, [definition]);
    expect(moves.some((m) => m.to.row === 4 && m.to.col === 3)).toBe(false);
    expect(moves.some((m) => m.to.row === 2 && m.to.col === 3)).toBe(false);
    expect(moves.some((m) => m.to.row === 3 && m.to.col === 3 && m.passCaptureAt?.row === 4)).toBe(true);
  });

  it("two-enemy pass-through captures first or last according to the definition", () => {
    const make = (passCapture: "first" | "last"): Definition => ({ id: `pass-${passCapture}`, name: "Pass2", symbol: "P2", isCrown: false, patterns: [{ kind: "direction", vectors: [{ dx: 0, dy: -1 }], range: "slide", passEnemies: 2, passCapture }] });
    for (const mode of ["first", "last"] as const) {
      const definition = make(mode), s = customMatch(definition);
      s.board[idx({ row: 6, col: 3 })] = { id: "p", color: "white", role: "custom", definitionId: definition.id, moved: false };
      s.board[idx({ row: 4, col: 3 })] = { id: "e1", color: "black", role: "pawn", moved: false };
      s.board[idx({ row: 3, col: 3 })] = { id: "e2", color: "black", role: "pawn", moved: false };
      const capture = legal(s, { row: 6, col: 3 }, [definition]).find((m) => m.to.row === 2 && m.passCaptureAt);
      expect(capture?.passCaptureAt).toEqual(mode === "first" ? { row: 4, col: 3 } : { row: 3, col: 3 });
      const after = play(s, capture!, [definition]);
      expect(after.board.filter((piece) => piece?.color === "black")).toHaveLength(1);
    }
  });

  it("pass-through capture needs an empty landing square beyond the target", () => {
    const definition: Definition = { id: "pass-edge", name: "Pass", symbol: "PE", isCrown: false, patterns: [{ kind: "direction", vectors: [{ dx: 0, dy: -1 }], range: "slide", passEnemies: 1 }] };
    const s = customMatch(definition);
    s.board[idx({ row: 1, col: 3 })] = { id: "p", color: "white", role: "custom", definitionId: definition.id, moved: false };
    s.board[idx({ row: 0, col: 3 })] = { id: "e", color: "black", role: "king", moved: false };
    expect(legal(s, { row: 1, col: 3 }, [definition]).some((m) => m.passCaptureAt)).toBe(false);
    expect(threatened(s, { row: 0, col: 3 }, "white", [definition])).toBe(false);
  });

  it("recoil capture is legal only when the forced landing square is empty", () => {
    const definition: Definition = { id: "recoil", name: "Recoil", symbol: "RC", isCrown: false, patterns: [{ kind: "direction", vectors: [{ dx: 0, dy: -1 }], range: 3, recoil: true }] };
    const s = customMatch(definition);
    s.board[idx({ row: 6, col: 3 })] = { id: "p", color: "white", role: "custom", definitionId: definition.id, moved: false };
    s.board[idx({ row: 3, col: 3 })] = { id: "e", color: "black", role: "pawn", moved: false };
    let move = legal(s, { row: 6, col: 3 }, [definition]).find((m) => m.to.row === 3 && m.to.col === 3);
    expect(move?.recoilTo).toEqual({ row: 4, col: 3 });
    const after = play(s, move!, [definition]);
    expect(after.board[idx({ row: 4, col: 3 })]?.id).toBe("p");
    expect(after.board[idx({ row: 3, col: 3 })]).toBeNull();

    const blocked = customMatch(definition);
    blocked.board[idx({ row: 6, col: 3 })] = { id: "p", color: "white", role: "custom", definitionId: definition.id, moved: false };
    blocked.board[idx({ row: 4, col: 3 })] = { id: "b", color: "white", role: "pawn", moved: false };
    blocked.board[idx({ row: 3, col: 3 })] = { id: "e", color: "black", role: "pawn", moved: false };
    move = legal(blocked, { row: 6, col: 3 }, [definition]).find((m) => m.to.row === 3 && m.to.col === 3);
    expect(move).toBeUndefined();
  });

  it("dark blocks long-range and stationary captures after evolution", () => {
    const dark: Definition = { id: "dark", name: "Dark", symbol: "DK", isCrown: false, dark: true, patterns: [{ kind: "direction", vectors: [{ dx: 0, dy: -1 }], range: 1 }] };
    const attacker: Definition = { id: "a", name: "Attacker", symbol: "AT", isCrown: false, patterns: [{ kind: "direction", vectors: [{ dx: 0, dy: -1 }], range: "slide" }] };
    const s = customMatch(attacker);
    s.board[idx({ row: 6, col: 3 })] = { id: "a", color: "white", role: "custom", definitionId: attacker.id, moved: false };
    s.board[idx({ row: 2, col: 3 })] = { id: "d", color: "black", role: "custom", definitionId: dark.id, moved: false, evolved: true };
    expect(legal(s, { row: 6, col: 3 }, [attacker, dark]).some((m) => m.to.row === 2 && m.to.col === 3)).toBe(false);
  });

  it("zeroBody lifetime decreases at every owner turn end even when another piece moves", () => {
    const zero: Definition = { id: "zero", name: "Zero", symbol: "ZR", isCrown: false, zeroBody: true, patterns: [{ kind: "direction", vectors: [{ dx: 0, dy: -1 }], range: 1 }] };
    const s = customMatch(zero);
    s.board[idx({ row: 5, col: 0 })] = { id: "z", color: "white", role: "custom", definitionId: zero.id, moved: false, zeroTurns: 3 };
    s.board[idx({ row: 6, col: 7 })] = { id: "r", color: "white", role: "rook", moved: false };
    const move = legal(s, { row: 6, col: 7 }, [zero]).find((m) => m.to.row === 5 && m.to.col === 7)!;
    const after = play(s, move, [zero]);
    expect(after.board.find((piece) => piece?.id === "z")?.zeroTurns).toBe(2);
  });

  it("barrier blocks directional jumping but not fixed leaps", () => {
    const mover: Definition = { id: "m", name: "Mover", symbol: "M", isCrown: false, patterns: [
      { kind: "direction", vectors: [{ dx: 1, dy: 0 }], range: 3, jumpEnemies: 2 },
      { kind: "leap", vectors: [{ dx: 2, dy: 0 }], usage: "capture" },
    ] };
    const barrier: Definition = { id: "b", name: "Barrier", symbol: "B", isCrown: false, barrier: true, patterns: [{ kind: "direction", vectors: [], range: 1 }] };
    const match = createMatch([], emptySetup(), "royal-any");
    match.board = Array(64).fill(null); match.turn = "white";
    match.board[idx({ row: 4, col: 2 })] = { id: "m1", color: "white", role: "custom", definitionId: "m", moved: false };
    match.board[idx({ row: 4, col: 3 })] = { id: "b1", color: "black", role: "custom", definitionId: "b", moved: false };
    match.board[idx({ row: 4, col: 4 })] = { id: "x", color: "black", role: "pawn", moved: false };
    const moves = legal(match, { row: 4, col: 2 }, [mover, barrier]);
    expect(moves.some((move) => move.to.col === 4)).toBe(true); // fixed Leap remains valid
    expect(moves.some((move) => move.to.col === 5)).toBe(false); // Direction cannot pass barrier
  });

  it("tracking watches a leap target and captures it after it escapes within three squares", () => {
    const tracker: Definition = { id: "t", name: "Tracker", symbol: "T", isCrown: false, patterns: [
      { kind: "leap", vectors: [{ dx: 2, dy: 0 }], usage: "move", tracking: { duration: 1 } },
    ] };
    const match = createMatch([], emptySetup(), "royal-any");
    match.board = Array(64).fill(null); match.turn = "white";
    match.board[idx({ row: 4, col: 2 })] = { id: "tracker", color: "white", role: "custom", definitionId: "t", moved: false };
    match.board[idx({ row: 4, col: 4 })] = { id: "target", color: "black", role: "pawn", moved: false };
    match.board[idx({ row: 7, col: 7 })] = { id: "white-mover", color: "white", role: "rook", moved: false };
    let after = play(match, { from: { row: 7, col: 7 }, to: { row: 7, col: 6 } }, [tracker]);
    expect(after.trackingWatches?.some((item) => item.trackerId === "tracker" && item.targetId === "target")).toBe(true);
    after = play(after, { from: { row: 4, col: 4 }, to: { row: 5, col: 4 } }, [tracker]);
    expect(after.trackingTargets?.some((item) => item.trackerId === "tracker" && item.targetId === "target" && item.remaining === 1)).toBe(true);
    expect(legal(after, { row: 4, col: 2 }, [tracker]).some((move) => move.to.row === 5 && move.to.col === 4)).toBe(true);
  });

  it("tracking does not target Royal pieces", () => {
    const tracker: Definition = { id: "t", name: "Tracker", symbol: "T", isCrown: false, patterns: [
      { kind: "leap", vectors: [{ dx: 2, dy: 0 }], usage: "move", tracking: { duration: 1 } },
    ] };
    const match = createMatch([], emptySetup(), "royal-any");
    match.board = Array(64).fill(null); match.turn = "white";
    match.board[idx({ row: 4, col: 2 })] = { id: "tracker", color: "white", role: "custom", definitionId: "t", moved: false };
    match.board[idx({ row: 4, col: 4 })] = { id: "king", color: "black", role: "king", moved: false };
    match.board[idx({ row: 7, col: 7 })] = { id: "white-mover", color: "white", role: "rook", moved: false };
    const after = play(match, { from: { row: 7, col: 7 }, to: { row: 7, col: 6 } }, [tracker]);
    expect(after.trackingWatches?.some((item) => item.targetId === "king")).toBe(false);
  });

  it("devotion swaps an evolved piece with a checked royal when the swap removes the attack", () => {
    const devotee: Definition = { id: "d", name: "Devotee", symbol: "D", isCrown: false, devotion: true, transformation: { condition: { kind: "captures", subject: "self", threshold: 1 }, name: "D2", symbol: "D2", patterns: [{ kind: "direction", vectors: [], range: 1 }] }, patterns: [{ kind: "direction", vectors: [], range: 1 }] };
    const match = createMatch([], emptySetup(), "royal-any");
    match.board = Array(64).fill(null); match.turn = "white";
    match.board[idx({ row: 7, col: 4 })] = { id: "king", color: "white", role: "king", moved: false };
    match.board[idx({ row: 7, col: 3 })] = { id: "dev", color: "white", role: "custom", definitionId: "d", moved: true, evolved: true };
    match.board[idx({ row: 0, col: 4 })] = { id: "rook", color: "black", role: "rook", moved: true };
    const moves = legal(match, { row: 7, col: 3 }, [devotee]);
    expect(moves.some((move) => move.swap === "devotion" && move.to.row === 7 && move.to.col === 4)).toBe(true);
  });
});
