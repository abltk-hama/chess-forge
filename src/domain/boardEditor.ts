import { createMatch, threatened } from "./game";
import type {
  Color,
  Definition,
  Match,
  Piece,
  Preset,
  Setup,
} from "./types";

export type DraftPiece = Omit<Piece, "id">;
export type BoardDraft = (DraftPiece | null)[];

export const emptyBoardDraft = (): BoardDraft => Array(64).fill(null);

export function boardDraftFromSetup(
  definitions: Definition[],
  setup: Setup,
  preset: Preset,
): BoardDraft {
  return createMatch(definitions, setup, preset).board.map((piece) =>
    piece
      ? {
          color: piece.color,
          role: piece.role,
          definitionId: piece.definitionId,
          moved: false,
          evolved: false,
          captures: 0,
          reachedEnemyDepth: 8,
        }
      : null,
  );
}

const isCrown = (piece: DraftPiece, definitions: Definition[]) =>
  piece.role === "custom" &&
  (() => {
    const definition = definitions.find(
      (item) => item.id === piece.definitionId,
    );
    return definition?.isCrown || (piece.evolved && definition?.growth?.unlockCrown);
  })();
const isPotentialCrown = (piece: DraftPiece, definitions: Definition[]) => {
  const definition =
    piece.role === "custom"
      ? definitions.find((item) => item.id === piece.definitionId)
      : undefined;
  return !!(definition?.isCrown || definition?.growth?.unlockCrown);
};

function count(
  draft: BoardDraft,
  color: Color,
  predicate: (piece: DraftPiece) => boolean,
) {
  return draft.filter(
    (piece): piece is DraftPiece =>
      piece?.color === color && predicate(piece),
  ).length;
}

export function boardDraftErrors(
  draft: BoardDraft,
  definitions: Definition[],
  preset: Preset,
) {
  const errors: string[] = [];
  if (draft.length !== 64) return ["盤面データは64マス必要です。"];
  const definitionIds = new Set(definitions.map((definition) => definition.id));
  for (const color of ["white", "black"] as Color[]) {
    const label = color === "white" ? "白" : "黒";
    if (count(draft, color, (piece) => piece.role === "king") !== 1)
      errors.push(`${label}Kingを1体配置してください。`);
    if (
      preset === "royal-all" &&
      count(draft, color, (piece) => isPotentialCrown(piece, definitions)) >= 2
    )
      errors.push(`Royal Hunt ALLでは${label}Crownは1体までです。`);
  }
  if (
    draft.some(
      (piece) =>
        piece?.role === "custom" &&
        (!piece.definitionId || !definitionIds.has(piece.definitionId)),
    )
  )
    errors.push("存在しないオリジナル駒が配置されています。");
  return [...new Set(errors)];
}

export function createMatchFromDraft(
  draft: BoardDraft,
  definitions: Definition[],
  preset: Preset,
  turn: Color,
): Match {
  const issues = boardDraftErrors(draft, definitions, preset);
  if (issues.length) throw new Error(issues.join("\n"));
  const board = draft.map((piece, index) =>
    piece ? { ...piece, id: `e${index}` } : null,
  );
  const targets = { white: 1, black: 1 };
  for (const color of ["white", "black"] as Color[])
    targets[color] += count(
      draft,
      color,
      (piece) => !!isCrown(piece, definitions),
    );
  return {
    board,
    turn,
    preset,
    enPassant: null,
    lost: { white: 0, black: 0 },
    targets,
    history: [],
    winner: null,
    draw: false,
    message: `${turn === "white" ? "白" : "黒"}の手番です。`,
    stats: {
      white: {
        captures: 0,
        losses: 0,
        evolutions: 0,
        kingDepth: 8,
      },
      black: {
        captures: 0,
        losses: 0,
        evolutions: 0,
        kingDepth: 8,
      },
    },
  };
}

export function boardDraftWarnings(
  draft: BoardDraft,
  definitions: Definition[],
  preset: Preset,
  turn: Color,
) {
  if (boardDraftErrors(draft, definitions, preset).length) return [];
  const warnings: string[] = [];
  if (
    draft.some(
      (piece, index) =>
        piece?.role === "pawn" &&
        (Math.floor(index / 8) === 0 || Math.floor(index / 8) === 7),
    )
  )
    warnings.push("最終段にPawnが配置されています。");
  const match = createMatchFromDraft(draft, definitions, preset, turn);
  const kingIndex = draft.findIndex(
    (piece) => piece?.role === "king" && piece.color === turn,
  );
  if (
    threatened(
      match,
      { row: Math.floor(kingIndex / 8), col: kingIndex % 8 },
      turn === "white" ? "black" : "white",
      definitions,
    )
  )
    warnings.push("手番側のKingが攻撃されている局面から始まります。");
  return warnings;
}
