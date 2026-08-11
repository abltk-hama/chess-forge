import { describe, expect, it } from "vitest";
import { cost, errors, normalize } from "../src/domain/cost";
import type { Definition } from "../src/domain/types";
const make = (partial: Partial<Definition> = {}): Definition => ({
  id: "a",
  name: "Arc",
  symbol: "A",
  isCrown: false,
  patterns: [
    {
      kind: "direction",
      vectors: [{ dx: 1, dy: 0 }],
      range: 1,
      canJump: false,
    },
  ],
  ...partial,
});
describe("cost", () => {
  it("normalizes two-letter symbols and reserves standard abbreviations", () => {
    expect(normalize(make({ symbol: "dr" })).symbol).toBe("DR");
    expect(errors(make({ symbol: "KN" }))).toContain(
      "標準駒の予約記号は使用できません。",
    );
    expect(errors(make({ symbol: "K" }))).not.toContain(
      "標準駒の予約記号は使用できません。",
    );
  });
  it("discounts initial-only movement but not cannon fees", () => {
    const vectors = [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
    ];
    expect(
      cost(
        make({
          patterns: [
            { kind: "direction", vectors, range: "slide", initialOnly: true },
          ],
        }),
      ),
    ).toBe(12);
    expect(
      cost(
        make({
          patterns: [
            {
              kind: "direction",
              vectors,
              range: "slide",
              initialOnly: true,
              cannon: true,
            },
          ],
        }),
      ),
    ).toBe(21);
    expect(
      cost(
        make({
          patterns: [
            { kind: "direction", vectors, range: "slide", cannon: true },
          ],
        }),
      ),
    ).toBe(29);
  });

  it("rejects cannon combined with move-only or free jumping", () => {
    expect(
      errors(
        make({
          patterns: [
            {
              kind: "direction",
              vectors: [{ dx: 1, dy: 0 }],
              range: 3,
              usage: "move",
              cannon: true,
            },
          ],
        }),
      ),
    ).toContain("キャノンは移動専用・飛び越しと併用できません。");
    expect(
      errors(
        make({
          patterns: [
            {
              kind: "direction",
              vectors: [{ dx: 1, dy: 0 }],
              range: 3,
              cannon: true,
              jumpEnemies: true,
            },
          ],
        }),
      ),
    ).toContain("キャノンは移動専用・飛び越しと併用できません。");
  });

  it("discounts move-only and capture-only movement", () => {
    const vectors = [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
    ];
    expect(
      cost(
        make({
          patterns: [{ kind: "direction", vectors, range: 3, usage: "move" }],
        }),
      ),
    ).toBe(6);
    expect(
      cost(
        make({
          patterns: [
            { kind: "direction", vectors, range: 3, usage: "capture" },
          ],
        }),
      ),
    ).toBe(9);
    expect(
      cost(
        make({
          patterns: [
            { kind: "leap", vectors: [{ dx: 2, dy: 1 }], usage: "move" },
          ],
        }),
      ),
    ).toBe(2);
  });

  it("prices ally and enemy jumping with separate range premiums", () => {
    const vectors = [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
    ];
    expect(
      cost(
        make({
          patterns: [
            {
              kind: "direction",
              vectors,
              range: 3,
              jumpAllies: true,
              jumpEnemies: false,
            },
          ],
        }),
      ),
    ).toBe(23);
    expect(
      cost(
        make({
          patterns: [
            {
              kind: "direction",
              vectors,
              range: 3,
              jumpAllies: false,
              jumpEnemies: true,
            },
          ],
        }),
      ),
    ).toBe(29);
    expect(
      cost(
        make({
          patterns: [
            {
              kind: "direction",
              vectors: [{ dx: 1, dy: 0 }],
              range: "slide",
              jumpAllies: true,
              jumpEnemies: true,
            },
          ],
        }),
      ),
    ).toBe(24);
  });

  it("keeps the version one jump cost until a piece is edited", () =>
    expect(
      cost(
        make({
          patterns: [
            {
              kind: "direction",
              vectors: [{ dx: 1, dy: 0 }],
              range: "slide",
              canJump: true,
            },
          ],
        }),
      ),
    ).toBe(20));

  it("prices three sliding directions plus jump at 30", () =>
    expect(
      cost(
        make({
          patterns: [
            {
              kind: "direction",
              vectors: [
                { dx: 1, dy: 0 },
                { dx: -1, dy: 0 },
                { dx: 0, dy: 1 },
              ],
              range: "slide",
              canJump: true,
            },
          ],
        }),
      ),
    ).toBe(30));
  it("prices step3, jump and one leap at 30", () =>
    expect(
      cost(
        make({
          patterns: [
            {
              kind: "direction",
              vectors: [
                { dx: 1, dy: 0 },
                { dx: -1, dy: 0 },
                { dx: 0, dy: 1 },
              ],
              range: 3,
              canJump: true,
            },
            { kind: "leap", vectors: [{ dx: 2, dy: 1 }] },
          ],
        }),
      ),
    ).toBe(30));
  it("rejects over budget and duplicate symbols", () => {
    const d = make({
      id: "b",
      patterns: [
        {
          kind: "direction",
          vectors: [
            { dx: 1, dy: 0 },
            { dx: -1, dy: 0 },
            { dx: 0, dy: 1 },
            { dx: 0, dy: -1 },
          ],
          range: "slide",
          canJump: true,
        },
      ],
    });
    expect(errors(d, [make()])).toHaveLength(2);
  });
});

it("rejects more than four movement sets", () => {
  const pattern = {
    kind: "direction" as const,
    vectors: [{ dx: 1, dy: 0 }],
    range: 1 as const,
    canJump: false,
  };
  expect(errors(make({ patterns: Array(5).fill(pattern) }))).toContain(
    "移動セットは1～4個です。",
  );
});
