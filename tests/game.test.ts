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
