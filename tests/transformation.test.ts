import { describe, expect, it } from "vitest";
import {
  errors,
  transformationLimit,
  transformedDefinition,
} from "../src/domain/cost";
import { createMatch, isRoyal, pieceText, play, pseudo } from "../src/domain/game";
import { emptySetup, idx } from "../src/domain/types";
import type { Definition, Match, Piece } from "../src/domain/types";

const transformer: Definition = {
  id: "transformer",
  name: "Runner",
  symbol: "RU",
  isCrown: false,
  patterns: [
    {
      kind: "leap",
      vectors: [{ dx: 1, dy: -1 }],
      usage: "both",
    },
  ],
  transformation: {
    condition: { kind: "captures", subject: "self", threshold: 1 },
    name: "Slider",
    symbol: "SL",
    patterns: [
      {
        kind: "direction",
        vectors: [{ dx: 0, dy: -1 }],
        range: "slide",
        usage: "both",
        initialOnly: true,
      },
    ],
  },
};

const customPiece = (overrides: Partial<Piece> = {}): Piece => ({
  id: "t",
  color: "white",
  role: "custom",
  definitionId: transformer.id,
  moved: true,
  captures: 2,
  reachedEnemyDepth: 5,
  ...overrides,
});

function position(definition = transformer): Match {
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
  match.board[idx({ row: 4, col: 3 })] = customPiece();
  match.board[idx({ row: 3, col: 4 })] = {
    id: "enemy",
    color: "black",
    role: "pawn",
    moved: true,
  };
  return match;
}

describe("transformation", () => {
  it("validates the transformed form and condition-dependent limit", () => {
    expect(errors(transformer)).toEqual([]);
    expect(transformationLimit(transformer)).toBe(24);
    expect(transformedDefinition(transformer).symbol).toBe("SL");
  });

  it("rejects reserved or duplicate transformed symbols", () => {
    const invalid = structuredClone(transformer);
    invalid.transformation!.symbol = "KI";
    expect(errors(invalid)).toContain(
      "変身後記号に標準駒の予約記号は使用できません。",
    );
    const other = { ...transformer, id: "other", symbol: "OT" };
    expect(errors(transformer, [transformer, other])).toContain(
      "変身後記号が重複しています。",
    );
  });

  it("transforms after the full move and resets moved state", () => {
    let match = position();
    match = play(
      match,
      { from: { row: 4, col: 3 }, to: { row: 3, col: 4 } },
      [transformer],
    );
    const transformed = match.board[idx({ row: 3, col: 4 })]!;
    expect(transformed.evolved).toBe(true);
    expect(transformed.moved).toBe(false);
    expect(transformed.captures).toBe(3);
    expect(transformed.reachedEnemyDepth).toBe(4);
    expect(pieceText(transformed, [transformer])).toBe("SL");
  });

  it("uses transformed movement and its initial-only state", () => {
    const match = position();
    match.board[idx({ row: 4, col: 3 })] = customPiece({
      evolved: true,
      moved: false,
    });
    expect(pseudo(match, { row: 4, col: 3 }, [transformer])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ to: { row: 3, col: 3 } }),
      ]),
    );
    match.board[idx({ row: 4, col: 3 })] = customPiece({
      evolved: true,
      moved: true,
    });
    expect(pseudo(match, { row: 4, col: 3 }, [transformer])).toEqual([]);
  });

  it("keeps crown status unchanged across transformation", () => {
    const crownTransformer = { ...transformer, isCrown: true };
    expect(isRoyal(customPiece(), [crownTransformer])).toBe(true);
    expect(
      isRoyal(customPiece({ evolved: true }), [crownTransformer]),
    ).toBe(true);
    expect(isRoyal(customPiece({ evolved: true }), [transformer])).toBe(false);
  });
});
