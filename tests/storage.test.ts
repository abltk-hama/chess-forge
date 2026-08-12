import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { cost } from "../src/domain/cost";
import {
  formationErrors,
  formationFromSetup,
  formationMode,
} from "../src/domain/formation";
import { parse } from "../src/infrastructure/storage";
describe("storage", () => {
  it("accepts version one", () =>
    expect(
      parse('{"version":1,"definitions":[],"setup":{},"preset":"classic"}')
        .version,
    ).toBe(1));
  it("rejects unknown versions", () =>
    expect(() => parse('{"version":2,"definitions":[]}')).toThrow());
});

it("accepts sixteen definitions and rejects seventeen", () => {
  const make = (count: number) =>
    JSON.stringify({
      version: 1,
      definitions: Array.from({ length: count }, (_, index) => ({
        id: `d${index}`,
        name: `Piece ${index}`,
        symbol: `A${String.fromCharCode(65 + index)}`,
        isCrown: false,
        patterns: [
          {
            kind: "direction",
            vectors: [{ dx: 1, dy: 0 }],
            range: 1,
            usage: "both",
          },
        ],
      })),
      setup: {},
      preset: "classic",
    });
  expect(parse(make(16)).definitions).toHaveLength(16);
  expect(() => parse(make(17))).toThrow();
});

it("loads the balanced sample with valid costs and formation", () => {
  const data = parse(
    readFileSync(resolve("samples/balanced-custom-pieces.json"), "utf8"),
  );

  expect(data.definitions.length).toBeGreaterThanOrEqual(7);
  expect(data.definitions.every((definition) => cost(definition) <= 30)).toBe(
    true,
  );
  expect(
    formationErrors(
      formationFromSetup(data.setup),
      formationMode(data.setup),
      data.definitions,
    ),
  ).toEqual([]);
});
