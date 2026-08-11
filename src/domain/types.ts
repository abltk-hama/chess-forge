export type Color = "white" | "black";
export type Role =
  "king" | "queen" | "rook" | "bishop" | "knight" | "pawn" | "custom";
export type Preset = "classic" | "royal-any" | "royal-all";
export type Range = 1 | 2 | 3 | "slide";
export type Usage = "both" | "move" | "capture";
export type GameMode = "local" | "ai";
export type AIDifficulty = "easy" | "normal" | "hard";
export type FormationMode = "balanced" | "free";
export interface Pos {
  row: number;
  col: number;
}
export interface Vec {
  dx: number;
  dy: number;
}
export interface Direction {
  kind: "direction";
  vectors: Vec[];
  range: Range;
  usage?: Usage;
  initialOnly?: boolean;
  cannon?: boolean;
  jumpAllies?: boolean;
  jumpEnemies?: boolean;
  /** Version 1 compatibility. New definitions use jumpAllies/jumpEnemies. */
  canJump?: boolean;
}
export interface Leap {
  kind: "leap";
  vectors: Vec[];
  usage?: Usage;
  initialOnly?: boolean;
}
export type Pattern = Direction | Leap;
export interface Definition {
  id: string;
  name: string;
  symbol: string;
  patterns: Pattern[];
  isCrown: boolean;
}
export interface Piece {
  id: string;
  color: Color;
  role: Role;
  definitionId?: string;
  moved: boolean;
}
export interface Move {
  from: Pos;
  to: Pos;
  castle?: "king" | "queen";
  enPassant?: boolean;
  promotion?: boolean;
}
export interface Setup {
  rook: string | null;
  knight: string | null;
  bishop: string | null;
  queen: string | null;
  mode?: FormationMode;
  formation?: (string | null)[];
}
export interface Match {
  board: (Piece | null)[];
  turn: Color;
  preset: Preset;
  enPassant: Pos | null;
  lost: Record<Color, number>;
  targets: Record<Color, number>;
  history: string[];
  winner: Color | null;
  draw: boolean;
  message: string;
}
export interface SaveData {
  version: 1;
  definitions: Definition[];
  setup: Setup;
  preset: Preset;
}
export const directions: Vec[] = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 1, dy: 1 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 1 },
  { dx: -1, dy: 0 },
  { dx: -1, dy: -1 },
];
export const emptySetup = (): Setup => ({
  rook: null,
  knight: null,
  bishop: null,
  queen: null,
});
export const other = (c: Color): Color => (c === "white" ? "black" : "white");
export const idx = (p: Pos) => p.row * 8 + p.col;
export const inside = (p: Pos) =>
  p.row >= 0 && p.row < 8 && p.col >= 0 && p.col < 8;
