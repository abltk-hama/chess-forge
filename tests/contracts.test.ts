import { describe, expect, it } from "vitest";
import { legal, placeContract, play } from "../src/domain/game";
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

  it("places the hound, boar and piglet as one dog-hunt contract", () => {
    const m = emptyMatch();
    m.pendingContract = { kind: "hound", owner: "white", contractorId: "owner", huntId: "hunt-1", training: "hunting", origin: { row: 4, col: 4 }, candidates: [{ row: 3, col: 4 }] };
    const hound = placeContract(m, { row: 3, col: 4 });
    expect(hound.board[3 * 8 + 4]?.role).toBe("hound");
    const boar = placeContract(hound, hound.pendingContract!.candidates[0]);
    expect(boar.pendingContract?.kind).toBe("piglet");
    const piglet = placeContract(boar, boar.pendingContract!.candidates[0]);
    expect(piglet.pendingContract).toBeUndefined();
    expect(piglet.board.filter((piece) => piece?.dogHuntId === "hunt-1").map((piece) => piece?.role).sort()).toEqual(["boar", "hound", "piglet"]);
  });

  it("offers boar and piglet only in the recipient's three home ranks", () => {
    const m = emptyMatch();
    m.pendingContract = { kind: "hound", owner: "white", contractorId: "owner", huntId: "hunt-home", training: "hunting", origin: { row: 4, col: 4 }, candidates: [{ row: 3, col: 4 }] };
    const hound = placeContract(m, { row: 3, col: 4 });
    expect(hound.pendingContract?.owner).toBe("black");
    expect(hound.pendingContract?.candidates.every((pos) => pos.row <= 2)).toBe(true);
    const boar = placeContract(hound, hound.pendingContract!.candidates[0]);
    expect(boar.pendingContract?.kind).toBe("piglet");
    expect(boar.pendingContract?.candidates.every((pos) => pos.row <= 2)).toBe(true);
  });

  it("boar faces toward the opponent: black diagonals point down", () => {
    const m = emptyMatch();
    m.turn = "black";
    put(m, 3, 3, { id: "boar", color: "black", role: "boar", moved: false });
    const moves = legal(m, { row: 3, col: 3 }, []);
    expect(moves.some((move) => move.to.row === 6 && move.to.col === 0)).toBe(true);
    expect(moves.some((move) => move.to.row === 0 && move.to.col === 0)).toBe(false);
  });

  it("coordination hound watches then tracks only a target that moves", () => {
    const m = emptyMatch();
    put(m, 4, 4, { id: "owner", color: "white", role: "custom", definitionId: "x", moved: false });
    put(m, 4, 2, { id: "hound", color: "white", role: "hound", moved: false, dogOwnerId: "owner", dogTraining: "coordination", dogHuntId: "hunt" });
    put(m, 4, 5, { id: "target", color: "black", role: "pawn", moved: false });
    put(m, 7, 7, { id: "wm", color: "white", role: "rook", moved: false });
    let next = play(m, { from: { row: 7, col: 7 }, to: { row: 7, col: 6 } }, []);
    expect(next.dogWatches?.some((watch) => watch.targetId === "target")).toBe(true);
    next = play(next, { from: { row: 4, col: 5 }, to: { row: 5, col: 5 } }, []);
    expect(next.dogTracks?.some((track) => track.targetId === "target" && track.remaining === 1)).toBe(true);
  });

  it("coordination hound does not track a watched target that stays put", () => {
    const m = emptyMatch();
    put(m, 4, 4, { id: "owner", color: "white", role: "custom", definitionId: "x", moved: false });
    put(m, 4, 2, { id: "hound", color: "white", role: "hound", moved: false, dogOwnerId: "owner", dogTraining: "coordination", dogHuntId: "hunt" });
    put(m, 4, 5, { id: "target", color: "black", role: "pawn", moved: false });
    put(m, 7, 7, { id: "wm", color: "white", role: "rook", moved: false });
    put(m, 0, 0, { id: "bm", color: "black", role: "rook", moved: false });
    let next = play(m, { from: { row: 7, col: 7 }, to: { row: 7, col: 6 } }, []);
    next = play(next, { from: { row: 0, col: 0 }, to: { row: 0, col: 1 } }, []);
    expect(next.dogTracks?.some((track) => track.targetId === "target" && track.remaining === 1)).toBe(false);
  });

  it("scouting hound shares a nearby discovered target with its owner", () => {
    const definition = { id: "owner-def", name: "Owner", symbol: "OW", isCrown: false, patterns: [{ kind: "direction" as const, vectors: [{ dx: 1, dy: 0 }], range: 1 as const }] };
    const m = emptyMatch();
    put(m, 4, 4, { id: "owner", color: "white", role: "custom", definitionId: definition.id, moved: false });
    put(m, 4, 2, { id: "hound", color: "white", role: "hound", moved: false, dogOwnerId: "owner", dogTraining: "scouting", dogHuntId: "hunt" });
    put(m, 3, 2, { id: "target", color: "black", role: "pawn", moved: false });
    const next = play(m, { from: { row: 4, col: 2 }, to: { row: 4, col: 3 }, chain: [{ from: { row: 4, col: 2 }, to: { row: 4, col: 3 } }] }, [definition]);
    expect(next.dogTracks?.some((track) => track.targetId === "target" && track.shared)).toBe(true);
  });

  it("scouting shared target can be captured stationary by the owner", () => {
    const definition = { id: "owner-def", name: "Owner", symbol: "OW", isCrown: false, patterns: [{ kind: "direction" as const, vectors: [{ dx: 1, dy: 0 }], range: 1 as const }] };
    const m = emptyMatch();
    put(m, 4, 4, { id: "owner", color: "white", role: "custom", definitionId: definition.id, moved: false });
    put(m, 4, 2, { id: "hound", color: "white", role: "hound", moved: false, dogOwnerId: "owner", dogTraining: "scouting", dogHuntId: "hunt" });
    put(m, 3, 2, { id: "target", color: "black", role: "pawn", moved: false });
    m.dogTracks = [{ huntId: "hunt", houndId: "hound", ownerId: "owner", targetId: "target", shared: true }];
    expect(legal(m, { row: 4, col: 4 }, [definition]).some((move) => move.stationary && move.to.row === 3 && move.to.col === 2)).toBe(true);
  });

  it("drops scouting discoveries that are more than two squares from the hound at turn end", () => {
    const m = emptyMatch();
    put(m, 4, 4, { id: "owner", color: "white", role: "custom", definitionId: "x", moved: false });
    put(m, 4, 0, { id: "hound", color: "white", role: "hound", moved: false, dogOwnerId: "owner", dogTraining: "scouting", dogHuntId: "hunt" });
    put(m, 3, 0, { id: "target", color: "black", role: "pawn", moved: false });
    const chain = [
      { from: { row: 4, col: 0 }, to: { row: 4, col: 1 } },
      { from: { row: 4, col: 1 }, to: { row: 4, col: 2 } },
      { from: { row: 4, col: 2 }, to: { row: 4, col: 3 } },
    ];
    const next = play(m, { from: chain[0].from, to: chain[0].to, chain }, []);
    expect(next.dogTracks?.some((track) => track.targetId === "target")).toBe(false);
  });

  it("keeps at most two scouting targets", () => {
    const m = emptyMatch();
    put(m, 4, 4, { id: "owner", color: "white", role: "custom", definitionId: "x", moved: false });
    put(m, 4, 2, { id: "hound", color: "white", role: "hound", moved: false, dogOwnerId: "owner", dogTraining: "scouting", dogHuntId: "hunt" });
    put(m, 2, 3, { id: "target-1", color: "black", role: "pawn", moved: false });
    put(m, 3, 3, { id: "target-2", color: "black", role: "pawn", moved: false });
    put(m, 5, 3, { id: "target-3", color: "black", role: "pawn", moved: false });
    const next = play(m, { from: { row: 4, col: 2 }, to: { row: 4, col: 3 }, chain: [{ from: { row: 4, col: 2 }, to: { row: 4, col: 3 } }] }, []);
    expect(next.dogTracks?.filter((track) => track.houndId === "hound")).toHaveLength(2);
  });

  it("resets coordination tracks at the end of the hound side's next turn", () => {
    const m = emptyMatch();
    put(m, 4, 4, { id: "owner", color: "white", role: "custom", definitionId: "x", moved: false });
    put(m, 4, 2, { id: "hound", color: "white", role: "hound", moved: false, dogOwnerId: "owner", dogTraining: "coordination", dogHuntId: "hunt" });
    put(m, 5, 5, { id: "target", color: "black", role: "pawn", moved: false });
    put(m, 7, 7, { id: "wm", color: "white", role: "rook", moved: false });
    put(m, 0, 0, { id: "bm", color: "black", role: "rook", moved: false });
    let next = play(m, { from: { row: 7, col: 7 }, to: { row: 7, col: 6 } }, []);
    next = play(next, { from: { row: 5, col: 5 }, to: { row: 5, col: 4 } }, []);
    expect(next.dogTracks?.some((track) => track.targetId === "target")).toBe(true);
    next = play(next, { from: { row: 7, col: 6 }, to: { row: 7, col: 7 } }, []);
    expect(next.dogTracks?.some((track) => track.houndId === "hound")).toBe(false);
    expect(next.dogWatches?.some((watch) => watch.houndId === "hound")).toBe(true);
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
