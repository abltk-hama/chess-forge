import { describe, expect, it } from "vitest";
import { legal, placeContract } from "../src/domain/game";
import type { Match, Piece } from "../src/domain/types";

const emptyMatch = (): Match => ({
  board: Array(64).fill(null), turn: "white", preset: "royal-any", enPassant: null,
  lost: { white: 0, black: 0 }, targets: { white: 1, black: 1 }, history: [], winner: null, draw: false, message: "",
});
const put = (m: Match, row: number, col: number, p: Piece) => { m.board[row * 8 + col] = p; };

describe("contract pieces", () => {
  it("places a raptor then requires the paired crow", () => {
    const m = emptyMatch();
    put(m, 4, 4, { id: "owner", color: "white", role: "custom", definitionId: "x", moved: false });
    m.pendingContract = { kind: "raptor", owner: "white", contractorId: "owner", training: "coordination", origin: { row: 4, col: 4 }, candidates: [{ row: 3, col: 4 }], nextCandidates: [{ row: 1, col: 1 }] };
    const afterRaptor = placeContract(m, { row: 3, col: 4 });
    expect(afterRaptor.board[3 * 8 + 4]?.role).toBe("raptor");
    expect(afterRaptor.pendingContract?.kind).toBe("crow");
    const afterCrow = placeContract(afterRaptor, { row: 1, col: 1 });
    expect(afterCrow.board[1 * 8 + 1]?.role).toBe("crow");
    expect(afterCrow.pendingContract).toBeUndefined();
  });

  it("demon can move twice but cannot capture twice", () => {
    const m = emptyMatch();
    put(m, 4, 4, { id: "dm", color: "white", role: "demon", moved: false, demonTurns: 4, demonCompensation: true });
    put(m, 3, 4, { id: "e1", color: "black", role: "pawn", moved: true });
    put(m, 2, 4, { id: "e2", color: "black", role: "pawn", moved: true });
    const moves = legal(m, { row: 4, col: 4 }, []);
    expect(moves.some((x) => x.to.row === 3 && x.to.col === 4)).toBe(true);
    expect(moves.some((x) => x.to.row === 3 && x.to.col === 4 && x.next?.to.row === 2 && x.next.to.col === 4)).toBe(false);
    expect(moves.some((x) => x.next && !m.board[x.next.to.row * 8 + x.next.to.col])).toBe(true);
  });

  it("support raptor only stationary-captures same-color squares around its owner", () => {
    const m = emptyMatch();
    put(m, 4, 4, { id: "owner", color: "white", role: "custom", definitionId: "x", moved: false });
    put(m, 0, 0, { id: "ra", color: "white", role: "raptor", moved: false, eagleOwnerId: "owner", eagleTraining: "support" });
    put(m, 4, 6, { id: "same", color: "black", role: "pawn", moved: true }); // even square, same as 0,0
    put(m, 3, 3, { id: "other", color: "black", role: "pawn", moved: true }); // even too; owner diagonal
    const moves = legal(m, { row: 0, col: 0 }, []);
    expect(moves.some((x) => x.stationary && x.to.row === 4 && x.to.col === 6)).toBe(true);
  });
});
