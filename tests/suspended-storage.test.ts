// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { createMatch } from "../src/domain/game";
import { emptySetup } from "../src/domain/types";
import {
  clearMatch,
  loadMatch,
  saveMatch,
} from "../src/infrastructure/storage";

describe("suspended match storage", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips one match and clears it", () => {
    const data = {
      version: 1 as const,
      match: createMatch([], emptySetup(), "classic"),
      definitions: [],
      mode: "ai" as const,
      difficulty: "hard" as const,
      savedAt: "2026-08-13T00:00:00.000Z",
    };
    saveMatch(data);
    expect(loadMatch()).toEqual(data);
    clearMatch();
    expect(loadMatch()).toBeNull();
  });

  it("rejects a broken match", () => {
    localStorage.setItem(
      "custom-piece-chess:match:v1",
      JSON.stringify({
        version: 1,
        match: { board: [] },
        definitions: [],
        mode: "local",
        difficulty: "easy",
        savedAt: "invalid",
      }),
    );
    expect(() => loadMatch()).toThrow("対局保存データが壊れています。");
  });
});
