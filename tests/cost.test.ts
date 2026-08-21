import { describe, expect, it } from "vitest";
import {
  cost,
  errors,
  evolvedDefinition,
  normalize,
  prepareDefinitionForEditing,
  summonedDefinition,
} from "../src/domain/cost";
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
    ).toBe(19);
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
    ).toBe(28);
    expect(
      cost(
        make({
          patterns: [
            { kind: "direction", vectors, range: "slide", cannon: true },
          ],
        }),
      ),
    ).toBe(36);
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
    ).toBe(11);
    expect(
      cost(
        make({
          patterns: [
            { kind: "direction", vectors, range: 3, usage: "capture" },
          ],
        }),
      ),
    ).toBe(11);
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

  it("prices stationary capture and second-phase movement", () => {
    expect(
      cost(
        make({
          patterns: [
            {
              kind: "leap",
              vectors: [{ dx: 2, dy: 1 }],
              usage: "stationary",
            },
          ],
        }),
      ),
    ).toBe(3);
    expect(
      cost(
        make({
          patterns: [
            {
              kind: "direction",
              vectors: [{ dx: 1, dy: 0 }],
              range: 3,
              usage: "move",
              phase: 2,
            },
          ],
        }),
      ),
    ).toBe(9);
  });

  it("discounts each normal second-move direction by one but keeps the base fee", () => {
    expect(
      cost(
        make({
          patterns: [
            {
              kind: "direction",
              vectors: [{ dx: 0, dy: -1 }, { dx: 1, dy: 0 }],
              range: 2,
              usage: "move",
              phase: 2,
            },
          ],
        }),
      ),
    ).toBe(8);
  });

  it("prices movement squares, distance, and crossing limits", () => {
    expect(
      cost(
        make({
          patterns: [
            {
              kind: "direction",
              vectors: [
                { dx: -1, dy: -1 },
                { dx: 0, dy: -1 },
                { dx: 1, dy: -1 },
              ],
              range: 2,
            },
            {
              kind: "direction",
              vectors: [
                { dx: -1, dy: 0 },
                { dx: 1, dy: 0 },
                { dx: 0, dy: 1 },
              ],
              range: 1,
            },
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
              vectors: [{ dx: 1, dy: 0 }],
              range: 3,
              jumpAllies: 1,
              jumpEnemies: 2,
            },
          ],
        }),
      ),
    ).toBe(14);
  });

  it("prices slide once per piece plus each relative direction", () => {
    const slide = (
      vectors: Array<{ dx: number; dy: number }>,
      phase?: 1 | 2,
    ) => ({
      kind: "direction" as const,
      vectors,
      range: "slide" as const,
      usage: "both" as const,
      phase,
    });
    expect(
      cost(
        make({
          patterns: [
            slide([
              { dx: 0, dy: -1 },
              { dx: 0, dy: 1 },
              { dx: -1, dy: 0 },
              { dx: 1, dy: 0 },
            ]),
          ],
        }),
      ),
    ).toBe(27);
    expect(
      cost(
        make({
          patterns: [
            slide([
              { dx: -1, dy: -1 },
              { dx: 1, dy: -1 },
              { dx: -1, dy: 1 },
              { dx: 1, dy: 1 },
            ]),
          ],
        }),
      ),
    ).toBe(26);
    expect(
      cost(
        make({
          patterns: [
            slide([{ dx: 0, dy: -1 }]),
            {
              kind: "direction",
              vectors: [
                { dx: -1, dy: 0 },
                { dx: 1, dy: 0 },
                { dx: 0, dy: 1 },
              ],
              range: 1,
              usage: "both",
            },
          ],
        }),
      ),
    ).toBe(16);
    expect(
      cost(
        make({
          patterns: [slide([{ dx: 0, dy: -1 }]), slide([{ dx: 0, dy: 1 }], 2)],
        }),
      ),
    ).toBe(17);
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

  it("uses canonical jump values after editing regardless of update order", () => {
    const legacy = make({
      patterns: [
        {
          kind: "direction",
          vectors: [{ dx: 1, dy: 0 }],
          range: "slide",
          canJump: true,
        },
      ],
      transformation: {
        condition: { kind: "captures", subject: "self", threshold: 1 },
        name: "Next",
        symbol: "NX",
        patterns: [
          {
            kind: "direction",
            vectors: [{ dx: 0, dy: -1 }],
            range: 2,
            jumpAllies: false,
            jumpEnemies: true,
          },
        ],
      },
    });
    expect(cost(legacy)).toBe(20);

    const edited = prepareDefinitionForEditing(legacy);
    expect(edited.patterns[0]).toMatchObject({
      jumpAllies: 2,
      jumpEnemies: 2,
    });
    expect(edited.patterns[0]).not.toHaveProperty("canJump");
    expect(edited.transformation?.patterns[0]).toMatchObject({
      jumpAllies: 0,
      jumpEnemies: 2,
    });

    const pattern = edited.patterns[0];
    if (pattern.kind !== "direction") throw new Error("direction expected");
    const alliesFirst = {
      ...edited,
      patterns: [{ ...pattern, jumpAllies: 1, jumpEnemies: 0 as const }],
    };
    const enemiesFirst = {
      ...edited,
      patterns: [{ ...pattern, jumpEnemies: 0 as const, jumpAllies: 1 }],
    };
    expect(cost(alliesFirst)).toBe(cost(enemiesFirst));
  });

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


it("does not inherit rebirth costs into summoned or split-derived pieces", () => {
  const definition = make({
    rebirth: { splitAllowed: true },
    summoning: {
      timing: "split",
      condition: { kind: "captures", subject: "self", threshold: 1 },
      range: "adjacent",
      name: "Shard",
      symbol: "SH",
      patterns: [{ kind: "direction", vectors: [{ dx: 1, dy: 0 }], range: 1 }],
    },
  });
  const derived = summonedDefinition(definition);
  expect(derived.rebirth).toBeUndefined();
  expect(cost(derived)).toBe(cost(make({ name: "Shard", symbol: "SH" })));
});

describe("direction cost wallet", () => {
  const direction = (vectors: Array<{ dx: number; dy: number }>, range: 1 | 2 | 3 | "slide", usage: "both" | "move" | "capture" | "stationary" = "both") => ({ kind: "direction" as const, vectors, range, usage });
  const orthogonal = [{ dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }];
  const diagonal = [{ dx: 1, dy: -1 }, { dx: 1, dy: 1 }, { dx: -1, dy: 1 }, { dx: -1, dy: -1 }];
  it("prices R1, R2, R3 and Slide benchmarks", () => {
    expect(cost(make({ patterns: [direction(orthogonal.slice(0, 1), 1)] }))).toBe(1);
    expect(cost(make({ patterns: [direction([...orthogonal, ...diagonal], 1)] }))).toBe(8);
    expect(cost(make({ patterns: [direction(diagonal, 2)] }))).toBe(10);
    expect(cost(make({ patterns: [direction(orthogonal, 2)] }))).toBe(11);
    expect(cost(make({ patterns: [direction(orthogonal, 3)] }))).toBe(18);
    expect(cost(make({ patterns: [direction(diagonal, "slide")] }))).toBe(26);
    expect(cost(make({ patterns: [direction(orthogonal, "slide")] }))).toBe(27);
  });
  it("prices mixed ranges without charging multiple range bases", () => {
    expect(cost(make({ patterns: [direction([{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }], 3), direction([{ dx: -1, dy: 0 }, { dx: 1, dy: 0 }], 2)] }))).toBe(14);
    expect(cost(make({ patterns: [direction([{ dx: 0, dy: -1 }], "slide"), direction([{ dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }], 1)] }))).toBe(16);
    expect(cost(make({ patterns: [direction([{ dx: 0, dy: -1 }], "slide"), direction([{ dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }], 2)] }))).toBe(19);
    expect(cost(make({ patterns: [direction([{ dx: 0, dy: -1 }], "slide"), direction([{ dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }], 3)] }))).toBe(25);
  });
  it("charges usage only when the wallet is insufficient", () => {
    const r2 = [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];
    expect(cost(make({ patterns: [direction(r2, 2, "move")] }))).toBe(11);
    expect(cost(make({ patterns: [direction(r2, 2, "capture")] }))).toBe(11);
    expect(cost(make({ patterns: [direction(r2, 2, "stationary")] }))).toBe(11);
    expect(cost(make({ patterns: [direction(r2, 2, "both")] }))).toBe(11);
    const slide = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }];
    expect(cost(make({ patterns: [direction(slide, "slide", "move")] }))).toBe(19);
    expect(cost(make({ patterns: [direction(slide, "slide", "capture")] }))).toBe(23);
    expect(cost(make({ patterns: [direction(slide, "slide", "stationary")] }))).toBe(23);
    expect(cost(make({ patterns: [direction(slide, "slide", "both")] }))).toBe(27);
  });
});

describe("chain movement pricing", () => {
  const chain = (directionCount: number, maxChains: 2 | 3 | 4, usage: "move" | "both" = "move") => ({
    kind: "chain" as const,
    vectors: [{ dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }].slice(0, directionCount),
    maxChains,
    usage,
  });

  it("uses direction count times the triangular chain count plus usage", () => {
    expect(cost(make({ patterns: [chain(2, 2)] }))).toBe(6);
    expect(cost(make({ patterns: [chain(2, 2, "both")] }))).toBe(6);
    expect(cost(make({ patterns: [chain(4, 3, "both")] }))).toBe(24);
  });

  it("halves initial-only chain movement with rounding up", () => {
    expect(cost(make({ patterns: [{ ...chain(4, 3, "both"), initialOnly: true }] }))).toBe(12);
  });

  it("prices transformed chain movement using one fewer chain", () => {
    expect(cost(make({ patterns: [chain(4, 4, "both")] }), true)).toBe(24);
    expect(cost(make({ patterns: [chain(2, 2, "both")] }), true)).toBe(2);
  });

  it("pays two usage points per actual chain from the shared wallet", () => {
    const slide = { kind: "direction" as const, vectors: [{ dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }], range: "slide" as const, usage: "move" as const };
    expect(cost(make({ patterns: [slide, chain(1, 3, "both")] }))).toBe(31);
  });

  it("allows growth to unlock capture for a move-only chain", () => {
    const definition = make({ patterns: [chain(2, 3)], growth: { condition: { kind: "captures", subject: "self", threshold: 1 }, unlocks: { 0: { capture: true, maxChains: 4 } } } });
    const evolved = evolvedDefinition(definition);
    expect(evolved.patterns[0].usage).toBe("both");
    expect(evolved.patterns[0].kind === "chain" && evolved.patterns[0].maxChains).toBe(4);
    expect(errors(definition)).not.toContain("連鎖移動には捕獲・静止捕獲を成長解放できません。");
  });

  it("rejects unsupported usage, second phase and normal four-chain definitions", () => {
    expect(errors(make({ patterns: [{ ...chain(1, 2), usage: "capture" }] }))).toContain("連鎖移動は移動専用または移動・捕獲だけ設定できます。");
    expect(errors(make({ patterns: [{ ...chain(1, 2), phase: 2 }] }))).toContain("連鎖移動は2回目移動・捕獲後移動・飛翔に設定できません。");
    expect(errors(make({ patterns: [chain(1, 4)] }))).toContain("4連鎖は成長・変身後限定です。");
  });
});
