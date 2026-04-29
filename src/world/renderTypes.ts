/** Pure data for 3D presentation — no Three.js or DOM types. */

export interface Vec3Data {
  x: number;
  y: number;
  z: number;
}

export interface QuatData {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface TransformState {
  position: Vec3Data;
  rotation: QuatData;
  scale: Vec3Data;
}

export type WorldObjectLifetime = 'persistent' | 'pooled' | 'oneShot';
export type WorldObjectReplication = 'sharedGameplay' | 'localCosmetic';

export interface WorldObjectState {
  objectId: string;
  templateId: string;
  transform: TransformState;
  visible: boolean;
  lifetime: WorldObjectLifetime;
  replication: WorldObjectReplication;
  /** Physics table-plane velocity (x, y) for rolling visuals; optional. */
  tableVelocity?: { x: number; y: number };
  renderLayer?: string;
  renderOrder?: number;
  tintHex?: string;
  opacity?: number;
  animationId?: string;
  animationTimeSec?: number;
  tags?: readonly string[];
}

export interface CameraState {
  mode: 'fixed' | 'follow' | 'orbit' | 'cinematic';
  position: Vec3Data;
  target?: Vec3Data;
  rotation?: QuatData;
  fovDeg: number;
  near?: number;
  far?: number;
  /** World-space up vector for look-at / camera orientation. */
  up?: Vec3Data;
  shake?: {
    intensity: number;
    remainingSec: number;
  };
}

/** 3D polyline in world units (e.g. aim line, debug overlay). */
export interface PolylineObjectState {
  objectId: string;
  templateId: string;
  points: readonly Vec3Data[];
  colorHex: string;
  opacity: number;
  visible: boolean;
  lifetime: WorldObjectLifetime;
  replication: WorldObjectReplication;
  lineWidth?: number;
}

export interface TableSpaceMeta {
  width: number;
  height: number;
}

export interface RenderWorldState {
  camera: CameraState;
  objects: readonly WorldObjectState[];
  polylines: readonly PolylineObjectState[];
  tableSpace: TableSpaceMeta;
  ambientColorHex?: string;
  /** İsteka üzerinde “çek–vur” el animasyonu — yalnızca ilk break / açılış sahnesi. */
  cuePullHandHint?: boolean;
  /** Oyuncu beyazı sürükleyerek yerleştirirken el ikonu + tarayıcı imleci. */
  cueBallInHandCursorHint?: boolean;
  /** Optional cue id for opponent shot preview. */
  opponentCueId?: string;
  /** Player's currently equipped cue id (used when player is the active shooter). */
  playerCueId?: string;
  /** Cue id of whoever is currently aiming/shooting (player or AI). Renderer uses this to style the cue stick. */
  activeCueId?: string;
}

export type PotHudState =
  | { kind: 'open'; solids: number[]; stripes: number[] }
  | { kind: 'assigned'; player: number[]; ai: number[] };

export interface ProfileHudView {
  coins: number;
  wins: number;
  losses: number;
  winRate: number;
  currentStreak: number;
  bestStreak: number;
  rankName: string;
  rankIndex: number;
  nextRankName: string | null;
  nextRankAtWins: number | null;
  rankProgress01: number;
  ownedCueIds: readonly string[];
  equippedCueId: string;
  equippedCueStats?: { power: number; aim: number; spin: number };
}

/** HUD view model — DOM/XAML adapters bind to this only. */
export interface HudState {
  scoreText: string;
  timerText: string;
  healthPercent: number;
  boostPercent: number;
  visiblePanels: readonly string[];
  prompts: readonly { id: string; text: string; priority: number }[];
  profile?: ProfileHudView;
  coinRewardWin?: number;
  /** 8-ball–specific fields for the browser HUD implementation. */
  eightBall?: {
    phase: string;
    levelIndex: number;
    activePlayer: string;
    turnTime01: number;
    dialogueText: string | null;
    reason: string;
    opponentId: string;
    opponentName: string;
    opponentTier: string;
    opponentAccuracy: number;
    spinX: number;
    spinY: number;
    lastMatchWon: boolean | null;
    pot: PotHudState;
    /** Opponent (left) / player (right) target group or 8-ball phase. */
    potTargetLabelOpponent: string;
    potTargetLabelPlayer: string;
    /** Full group strip (1–7 / 9–15 slots) once solids/stripes are assigned. */
    showPotProgressStrip: boolean;
    /** True if the 8-ball is no longer on the table (pocketed). */
    eightPocketed: boolean;
    rulesOpenTable: boolean;
    playerGroup: 'solid' | 'stripe' | null;
    aiGroup: 'solid' | 'stripe' | null;
    /** Center reaction beat after your shot (portrait + line). */
    opponentReaction: null | {
      text: string;
      /** Stable asset id in AssetManifest (e.g. ui.opponent.tung.reaction.laugh); null = placeholder. */
      portraitAssetId: string | null;
      /** Matches engine TTL so CSS motion can span the whole beat. */
      durationSec: number;
      /** Increments each beat so the HUD can restart CSS animations. */
      beatId: number;
    };
  };
  nextOpponent?: {
    id: string;
    name: string;
    tier: string;
  };
  shop?: {
    catalog: readonly {
      id: string;
      name: string;
      price: number;
      description?: string;
      accent?: string;
      stats?: { power: number; aim: number; spin: number };
    }[];
  };
  /** Oyuncu beyazı sürükleyerek yerleştirirken cursor/ikon ipucu. */
  cueBallInHandCursorHint?: boolean;
}
