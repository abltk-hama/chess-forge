import { describe, expect, it } from "vitest";
import {
  boardDraftErrors,
  boardDraftFromSetup,
  boardDraftWarnings,
  createMatchFromDraft,
  emptyBoardDraft,
} from "../src/domain/boardEditor";
import { emptySetup } from "../src/domain/types";
import type { Definition } from "../src/domain/types";

const crown: Definition = {
  id: "crown",
  name: "Crown",
  symbol: "CR",
  isCrown: true,
  patterns: [],
};

describe("board editor", () => {
  it("creates an editable draft from the current formation", () => {
    const draft = boardDraftFromSetup([], emptySetup(), "classic");
    expect(draft.filter(Boolean)).toHaveLength(32);
    expect(draft.every((piece) => !piece?.moved)).toBe(true);
  });

  it("requires exactly one king for each side", () => {
    const draft = emptyBoardDraft();
    expect(boardDraftErrors(draft, [], "classic")).toEqual([
      "白Kingを1体配置してください。",
      "黒Kingを1体配置してください。",
    ]);
  });

  it("keeps edited movement state and calculates asymmetric royal targets", () => {
    const draft = emptyBoardDraft();
    draft[60] = { color: "white", role: "king", moved: true };
    draft[4] = { color: "black", role: "king", moved: false };
    draft[40] = {
      color: "white",
      role: "custom",
      definitionId: crown.id,
      moved: false,
    };
    draft[16] = {
      color: "black",
      role: "custom",
      definitionId: crown.id,
      moved: true,
    };
    draft[17] = {
      color: "black",
      role: "custom",
      definitionId: crown.id,
      moved: false,
    };

    const match = createMatchFromDraft(
      draft,
      [crown],
      "royal-any",
      "black",
    );
    expect(match.targets).toEqual({ white: 2, black: 3 });
    expect(match.turn).toBe("black");
    expect(match.board[60]?.moved).toBe(true);
    expect(new Set(match.board.filter(Boolean).map((piece) => piece!.id)).size).toBe(
      5,
    );
  });

  it("rejects two crowns on one side in royal-all", () => {
    const draft = emptyBoardDraft();
    draft[60] = { color: "white", role: "king", moved: false };
    draft[4] = { color: "black", role: "king", moved: false };
    draft[40] = {
      color: "white",
      role: "custom",
      definitionId: crown.id,
      moved: false,
    };
    draft[41] = { ...draft[40]! };
    expect(boardDraftErrors(draft, [crown], "royal-all")).toContain(
      "Royal Hunt ALLでは白Crownは1体までです。",
    );
  });

  it("warns but permits unusual pawn placement", () => {
    const draft = emptyBoardDraft();
    draft[60] = { color: "white", role: "king", moved: false };
    draft[4] = { color: "black", role: "king", moved: false };
    draft[0] = { color: "black", role: "pawn", moved: false };
    expect(boardDraftWarnings(draft, [], "classic", "white")).toContain(
      "最終段にPawnが配置されています。",
    );
  });
});
