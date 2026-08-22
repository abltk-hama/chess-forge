export type Color = "white" | "black";
export type Role =
  | "king"
  | "queen"
  | "rook"
  | "bishop"
  | "knight"
  | "pawn"
  | "raptor"
  | "crow"
  | "demon"
  | "hound"
  | "boar"
  | "piglet"
  | "custom";
export type Preset = "classic" | "royal-any" | "royal-all";
export type Range = 1 | 2 | 3 | "slide";
export type Usage = "both" | "move" | "capture" | "stationary";
export type EvolutionCondition =
  | { kind: "captures"; subject: "self" | "allies"; threshold: number }
  | { kind: "losses"; threshold: number }
  | { kind: "territory"; subject: "self" | "king"; depth: 1 | 2 | 3 }
  | {
      kind: "evolutions";
      side: "ally" | "enemy";
      threshold: number;
    }
  | {
      kind: "nearbyEnemies";
      center: "self" | "king";
      radius: 1 | 2 | 3;
      threshold: number;
    };
export interface GrowthUnlock {
  range?: Range;
  capture?: boolean;
  stationary?: boolean;
  cannon?: boolean;
  jumpAllies?: 0 | 1 | 2;
  jumpEnemies?: 0 | 1 | 2;
  /** Fixed-leap destinations after this stage. Same-size relocation is free. */
  vectors?: Vec[];
  /** 連鎖移動の最大連鎖数。4は成長後のみ解放できる。 */
  maxChains?: 2 | 3 | 4;
}
export interface GrowthStage {
  condition: EvolutionCondition;
  unlockCrown?: boolean;
  unlocks: Record<number, GrowthUnlock>;
  localSwap?: boolean;
  globalSwap?: boolean;
  /** 零体の寿命をこの段階で回復する手番数。 */
  zeroRecovery?: 0 | 1 | 2;
  /** 第2段階限定。零体の寿命制限を解除する。 */
  overcomeZero?: boolean;
  /** この段階到達時に鷲狩を一度だけ発動する。 */
  eagleHunt?: boolean;
  demonContract?: boolean;
  dogHunt?: boolean;
  watchRadius?: 2;
}
export interface Growth {
  condition: EvolutionCondition;
  unlockCrown?: boolean;
  unlocks: Record<number, GrowthUnlock>;
  localSwap?: boolean;
  globalSwap?: boolean;
  /** Cumulative snapshots. The editor currently supports at most two stages. */
  stages?: GrowthStage[];
}
export interface Transformation {
  condition: EvolutionCondition;
  name: string;
  symbol: string;
  patterns: Pattern[];
  localSwap?: boolean;
  globalSwap?: boolean;
  eagleHunt?: boolean;
  demonContract?: boolean;
  dogHunt?: boolean;
}
export interface Summoning {
  condition: EvolutionCondition;
  timing: "summon" | "inherit" | "split";
  range: "adjacent" | "movement";
  name: string;
  symbol: string;
  patterns: Pattern[];
  /** 通常召喚・分裂で派生駒へ個別付与する駒全体能力。零体等は対象外。 */
  abilities?: {
    dark?: boolean;
    barrier?: boolean;
    deathbind?: boolean;
    devotion?: boolean;
    seal?: boolean;
  };
}
export type GameMode = "local" | "ai" | "ai-ai";
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
  evolvedInitialOnly?: boolean;
  evolutionOnly?: boolean;
  secondTrigger?: "normal" | "after-capture" | "flight";
  phase?: 1 | 2;
  cannon?: boolean;
  /** Runtime-only marker is omitted from saved definitions. */
  growthCannon?: boolean;
  /** Runtime-only: paired movement whose price is represented by stationary capture. */
  growthStationaryBase?: boolean;
  jumpAllies?: 0 | 1 | 2 | boolean;
  jumpEnemies?: 0 | 1 | 2 | boolean;
  /** Version 1 compatibility. New definitions use jumpAllies/jumpEnemies. */
  canJump?: boolean;
  /** 指定数まで敵を通過でき、通過後の空きマスへ着地して対象1体を捕獲できる。 */
  passEnemies?: 0 | 1 | 2;
  /** 2体すり抜け時の捕獲対象。未指定のlegacy値は先頭扱い。 */
  passCapture?: "first" | "last";
  /** 最遠の合法マスにしか止まれない。 */
  charge?: boolean;
  /** 捕獲後に逆方向へ1マス反動する。 */
  recoil?: boolean;
}
export interface Leap {
  kind: "leap";
  vectors: Vec[];
  usage?: Usage;
  initialOnly?: boolean;
  evolvedInitialOnly?: boolean;
  evolutionOnly?: boolean;
  secondTrigger?: "normal" | "after-capture" | "flight";
  phase?: 1 | 2;
  /** Runtime-only: paired movement whose price is represented by stationary capture. */
  growthStationaryBase?: boolean;
  /** 固定跳躍の射程から逃げた敵を追跡する。通常形態では移動専用セットのみ設定可能。 */
  tracking?: { duration: 1 | 2 };
}
export interface Chain {
  kind: "chain";
  /** 駒から見た前後左右。斜め方向は使用しない。 */
  vectors: Vec[];
  maxChains: 2 | 3 | 4;
  usage?: Usage;
  initialOnly?: boolean;
  evolvedInitialOnly?: boolean;
  evolutionOnly?: boolean;
  /** Chainは常に第1移動。互換データの検証用に保持する。 */
  secondTrigger?: "normal" | "after-capture" | "flight";
  phase?: 1 | 2;
  growthStationaryBase?: boolean;
}
export interface Advance {
  kind: "advance";
  vectors: Vec[];
  usage?: Usage;
  runup: 1 | 2;
  /** 1以上の任意整数。盤外になる距離は合法手生成時に除外する。 */
  jump: number;
  /** 1は基準着地点のみ、3は進行方向上のD-1/D/D+1。 */
  width: 1 | 3;
  initialOnly?: boolean;
  evolvedInitialOnly?: boolean;
  evolutionOnly?: boolean;
  secondTrigger?: "normal" | "after-capture" | "flight";
  phase?: 1 | 2;
  growthStationaryBase?: boolean;
}
export type Pattern = Direction | Leap | Chain | Advance;
export interface Definition {
  id: string;
  name: string;
  symbol: string;
  patterns: Pattern[];
  isCrown: boolean;
  growth?: Growth;
  transformation?: Transformation;
  summoning?: Summoning;
  dark?: boolean;
  zeroBody?: boolean;
  barrier?: boolean;
  deathbind?: boolean;
  rebirth?: {
    splitAllowed?: boolean;
    /** 強化再生の対象移動セット。 */
    enhancedPattern?: number;
    /** 強化再生が有効になる進化状態。 */
    enhancedAt?: "transformation" | 1 | 2;
    /** GrowthUnlock と同形式の再生後強化差分。 */
    enhancement?: GrowthUnlock;
  };
  devotion?: boolean;
  /** Version 1 compatibility: legacy definition-wide tracking. */
  tracking?: boolean;
  seal?: boolean;
  eagleHunt?: boolean;
  eagleTraining?: "coordination" | "hunting" | "support";
  demonContract?: boolean;
  dogHunt?: boolean;
  dogTraining?: "hunting" | "coordination" | "scouting";
  facility?: { kind: "fortress" } | { kind: "watchtower"; directions: "orthogonal" | "diagonal"; radius?: 1 | 2 } | { kind: "wagon" };
}
export interface Piece {
  id: string;
  color: Color;
  role: Role;
  definitionId?: string;
  moved: boolean;
  evolved?: boolean;
  growthStage?: 0 | 1 | 2;
  evolvedMoved?: boolean;
  globalSwapUsed?: boolean;
  captures?: number;
  reachedEnemyDepth?: number;
  summoned?: boolean;
  zeroTurns?: number;
  rebirthUsed?: boolean;
  rebirthPending?: boolean;
  /** 強化再生を一度成立させた個体。 */
  rebirthEnhanced?: boolean;
  sealedUntil?: number;
  raptorId?: string;
  eagleOwnerId?: string;
  eagleHuntUsed?: boolean;
  demonContractUsed?: boolean;
  dogHuntUsed?: boolean;
  dogOwnerId?: string;
  dogTraining?: "hunting" | "coordination" | "scouting";
  dogHuntId?: string;
  boarId?: string;
  boarCaptures?: number;
  eagleTraining?: "coordination" | "hunting" | "support";
  contractName?: string;
  demonTurns?: number;
  demonCompensation?: boolean;
}
export interface Move {
  from: Pos;
  to: Pos;
  stationary?: boolean;
  next?: Move;
  castle?: "king" | "queen";
  enPassant?: boolean;
  promotion?: boolean;
  transit?: boolean;
  swap?: "local" | "global" | "devotion";
  /** Forced landing square after a recoil capture. */
  recoilTo?: Pos;
  /** Enemy removed while landing beyond it with pass-through capture. */
  passCaptureAt?: Pos;
  /** 連鎖移動を構成する順序付きの短距離移動。 */
  chain?: Move[];
  /** 捕獲後の強制連鎖が残っており、この経路では終了できない。 */
  chainRequired?: boolean;
  facilityAction?: "spotter" | "wagon" | "intercept";
  wagonRoute?: Pos[];
  capturePieceId?: string;
  transportInterceptions?: { enemyId: string; to: Pos }[];
  sourceRange?: Range;
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
  pendingSummon?: { owner: Color; definitionId: string; origin: Pos; remaining: number; candidates: Pos[] };
  pendingRebirth?: { owner: Color; piece: Piece; origin: Pos; candidates: Pos[] };
  pendingContract?: { kind: "raptor" | "crow" | "demon-own" | "demon-foe" | "hound" | "boar" | "piglet"; owner: Color; contractorId?: string; training?: "coordination" | "hunting" | "support" | "scouting"; huntId?: string; origin: Pos; candidates: Pos[]; nextCandidates?: Pos[]; followupDemon?: boolean };
  sealTurn?: number;
  ply?: number;
  /** Version 1 compatibility: ID of the piece that moved on the immediately preceding turn. */
  lastMovedPieceId?: string;
  /** 追跡持ちが自手番終了時に射程内で監視した敵。 */
  trackingWatches?: { trackerId: string; patternIndex: number; targetId: string; duration: 1 | 2 }[];
  /** 監視対象が射程外へ逃げたことで成立した追跡対象。remaining は使用可能な自手番数。 */
  trackingTargets?: { trackerId: string; targetId: string; remaining: 1 | 2 }[];
  facilityWatches?: { towerId: string; targetId: string; directions: "orthogonal" | "diagonal" }[];
  facilityTargets?: { towerId: string; targetId: string; remaining: 1 }[];
  transportExposure?: { passengerId: string; owner: Color; options: { enemyId: string; to: Pos }[] };
  /** 犬猟専用の近接追跡。shared は索敵結果が契約者へ共有済みであることを表す。 */
  dogTracks?: { huntId: string; houndId: string; ownerId: string; targetId: string; shared: boolean; remaining?: 1 }[];
  /** 連携型の監視開始位置。相手手番で対象が動いた時だけ追跡対象へ昇格する。 */
  dogWatches?: { huntId: string; houndId: string; ownerId: string; targetId: string; row: number; col: number }[];
  stats?: Record<
    Color,
    { captures: number; losses: number; evolutions: number; kingDepth: number }
  >;
}
export interface SaveData {
  version: 1;
  definitions: Definition[];
  setup: Setup;
  preset: Preset;
}
export interface SuspendedMatchData {
  version: 1;
  match: Match;
  definitions: Definition[];
  mode: GameMode;
  difficulty: AIDifficulty;
  savedAt: string;
}
export interface PieceSimulationStat {
  key: string;
  label: string;
  appearances: number;
  generated: number;
  captures: number;
  losses: number;
  survivors: number;
  checks: number;
  mates: number;
  evolutions: number;
  summons: number;
}
export interface SimulationGameResult {
  winner: Color | null;
  draw: boolean;
  plies: number;
  reason: string;
  seed: number;
  history: string[];
}
export interface SimulationResult {
  id: string;
  createdAt: string;
  gamesRequested: number;
  gamesCompleted: number;
  whiteDifficulty: AIDifficulty;
  blackDifficulty: AIDifficulty;
  maxPlies: number;
  thinkTimeMs?: 10 | 25 | 100;
  whiteWins: number;
  blackWins: number;
  draws: number;
  games: SimulationGameResult[];
  pieces: PieceSimulationStat[];
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
