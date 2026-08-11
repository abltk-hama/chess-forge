import { describe, expect, it } from "vitest";
import { createMatch } from "../src/domain/game";
import {
  crownCount,
  formationErrors,
  formationFromSetup,
} from "../src/domain/formation";
import { emptySetup, idx, type Definition } from "../src/domain/types";

const definition = (
  id: string,
  directions: number,
  options: Partial<Definition> = {},
): Definition => ({
  id,
  name: id,
  symbol: id.slice(0, 2).toUpperCase(),
  isCrown: false,
  patterns: [
    {
      kind: "direction",
      vectors: Array.from({ length: directions }, (_, index) => ({
        dx: index + 1,
        dy: 0,
      })),
      range: "slide",
    },
  ],
  ...options,
});

describe("formation", () => {
  it("migrates the legacy role setup into sixteen slots", () => {
    const formation = formationFromSetup({
      rook: "r",
      knight: "n",
      bishop: "b",
      queen: "q",
    });
    expect(formation).toEqual([
      "r",
      "n",
      "b",
      "q",
      null,
      "b",
      "n",
      "r",
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it("enforces balanced slot and pawn limits", () => {
    const low = definition("lo", 3);
    const high = definition("hi", 4);
    const formation = Array<string | null>(16).fill(null);
    formation[8] = low.id;
    formation[9] = low.id;
    expect(formationErrors(formation, "balanced", [low, high])).toEqual([]);
    formation[8] = high.id;
    expect(formationErrors(formation, "balanced", [low, high])).toContain(
      "16～20点の駒をPawn枠へ置く場合、変更は1か所までです。",
    );
    formation[9] = null;
    formation[0] = definition("over", 5).id;
    expect(
      formationErrors(formation, "balanced", [
        low,
        high,
        definition("over", 5),
      ]),
    ).toContain("rook枠のコスト上限を超えています。");
  });

  it("allows multiple crowns only in free formation", () => {
    const crown = definition("cr", 1, { isCrown: true });
    const formation = Array<string | null>(16).fill(null);
    formation[0] = crown.id;
    formation[1] = crown.id;
    expect(formationErrors(formation, "balanced", [crown])).not.toEqual([]);
    expect(formationErrors(formation, "free", [crown])).toEqual([]);
    expect(crownCount(formation, [crown])).toBe(2);
  });

  it("places individual back-rank and pawn replacements symmetrically", () => {
    const custom = definition("cu", 1);
    const crown = definition("cr", 1, { isCrown: true });
    const formation = Array<string | null>(16).fill(null);
    formation[0] = custom.id;
    formation[8] = custom.id;
    formation[1] = crown.id;
    formation[2] = crown.id;
    const match = createMatch(
      [custom, crown],
      { ...emptySetup(), mode: "free", formation },
      "royal-all",
    );
    expect(match.board[idx({ row: 0, col: 0 })]?.role).toBe("custom");
    expect(match.board[idx({ row: 1, col: 0 })]?.role).toBe("custom");
    expect(match.board[idx({ row: 7, col: 0 })]?.role).toBe("custom");
    expect(match.board[idx({ row: 6, col: 0 })]?.role).toBe("custom");
    expect(match.targets).toEqual({ white: 3, black: 3 });
  });
});
