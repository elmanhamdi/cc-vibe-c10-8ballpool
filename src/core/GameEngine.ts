import { Table } from '../physics/Table.js';
import { CollisionSystem, type ShotOutcome } from '../physics/CollisionSystem.js';
import type { PlayerId, GamePhase, GameSnapshot } from './types.js';
import { TurnManager } from '../gameplay/TurnManager.js';
import {
  resolveEightBallRules,
  resolveTurnTimeout,
  kindToGroup,
  isFirstHitLegalForAimPreview,
  type RulesContext,
  type BallMeta,
  type TurnResolution,
} from '../gameplay/RulesEngine.js';
import { AIController, type AIShotPlan } from '../ai/AIController.js';
import { CAREER_OPPONENTS, getOpponentDialogueBehavior } from '../ai/AICharacters.js';
import { evaluateDirectShot, ownTargetsFor, type AIWorldView as EvaluatorWorldView } from '../ai/ShotEvaluator.js';
import { tierParams } from '../ai/DifficultyProfiles.js';
import {
  defaultPortraitReactionAssetId,
  hasPortraitReactionOpponent,
  pickPortraitReactionLine,
  portraitReactionAssetId,
  randomTimeReactionKind,
  type PortraitReactionKind,
} from '../opponents/opponentPortraitReactions.js';
import type { AICharacterProfile, DifficultyTier, OpponentDialogueBehavior } from '../ai/types.js';
import { DialogueManager } from '../systems/DialogueManager.js';
import type { DialogueCategory } from '../systems/dialogueLines.js';
import { computeAimPreview, findFirstRayHitBall } from '../gameplay/AimPreview.js';
import { applyTutorialMidgameLayout } from '../gameplay/tutorialLayout.js';
import type { Game, GameInputCommand, RenderRuntimeHints, ViewportSize } from './gameContract.js';
import type { GameEvent } from '../world/GameEvents.js';
import type {
  HudState,
  PolylineObjectState,
  PotHudState,
  RenderWorldState,
  WorldObjectState,
} from '../world/renderTypes.js';
import { AssetIds } from '../assets/AssetIds.js';
import {
  AI_CAMERA_BLEND_EXP,
  AI_CAMERA_BLEND_EXP_RETURN,
  OPENING_BREAK_CAMERA_BLEND_RETURN_EXP,
  AI_CAMERA_CINEMATIC_CHANCE,
  AI_CAMERA_OPPONENT_YAW_OFFSET_RAD,
  AI_CAMERA_PRESET,
  AI_CAMERA_PRESET_A_AZIMUTH_RAD,
  AI_CAMERA_PRESET_A_POLAR_RAD,
  AI_CAMERA_OPENING_BREAK_LOOK_AT_Z_SCALE,
  AI_CAMERA_OPENING_BREAK_Y_OFFSET,
  AI_CAMERA_PRESET_B_AZIMUTH_RAD,
  AI_CAMERA_PRESET_B_POLAR_RAD,
  CAMERA_FAR,
  CAMERA_FOV_DEG,
  CAMERA_NEAR,
  CAMERA_PLAYER_AZIMUTH_RAD,
  CAMERA_PLAYER_POLAR_RAD,
  CAMERA_TABLE_DISTANCE_SCALE,
  OPPONENT_REACTION_TTL_MIN_SEC,
  OPPONENT_REACTION_TTL_RANDOM_SEC,
  OPPONENT_TUNG_PLACEHOLDER_OFFSET_X,
  OPPONENT_TUNG_PLACEHOLDER_PAST_RAIL_Z,
  OPPONENT_TORTA_TARTARUGA_WORLD_Y_OFFSET_EXTRA,
  OPPONENT_TUNG_WORLD_Y_OFFSET,
  PLAYER_SHOT_CLOCK_SEC,
  AI_THINK_MAX_SEC,
} from './Constants.js';
import { PoolInputState } from './PoolInputState.js';
import { transformAt, uniformScale, vec3 } from '../world/Transform.js';
import type { BallKind } from '../physics/Ball.js';
import type { PlayerProfile, ProfileView } from './Profile.js';
import {
  COIN_REWARD_LOSS,
  COIN_REWARD_WIN,
  computeRank,
  defaultProfile,
  hydrateProfile,
} from './Profile.js';
import {
  XP_REWARD_LOSS,
  XP_REWARD_PER_BALL_POTTED,
  XP_REWARD_WIN,
  accountFromXp,
} from './AccountLevel.js';
import { SHOP_CUE_CATALOG } from './ShopCatalog.js';
import { type TournamentRun, createPendingRun } from './Tournament.js';
import {
  type TournamentDef,
  type TournamentOpponentSlot,
  type TournamentTier,
  findTournament,
  listTournamentViews,
} from './TournamentCatalog.js';
import { Vec2 } from '../physics/Vec2.js';
import { MemoryStorageAdapter, type StorageAdapter } from './StorageAdapter.js';

const PROFILE_STORAGE_KEY = 'vertical-eight-ball.profile.v2';
const TUTORIAL_STORAGE_KEY = 'vertical-eight-ball.tutorial.v1.completed';
const AIM_INTRO_STORAGE_KEY = 'vertical-eight-ball.aimIntro.v1.dismissed';
const DIFFICULTY_TIER_ORDER: readonly DifficultyTier[] = [
  'apprentice',
  'beginner',
  'intermediate',
  'skilled',
  'advanced',
  'expert',
  'master',
];

function difficultyTierIndex(tier: DifficultyTier): number {
  const idx = DIFFICULTY_TIER_ORDER.indexOf(tier);
  return idx < 0 ? 0 : idx;
}

function tierFromIndex(index: number): DifficultyTier {
  const i = Math.max(0, Math.min(DIFFICULTY_TIER_ORDER.length - 1, Math.round(index)));
  return DIFFICULTY_TIER_ORDER[i]!;
}

/** Shortest-path lerp on the circle (radians). */
function lerpAngleRad(from: number, to: number, t: number): number {
  const twoPi = Math.PI * 2;
  let d = to - from;
  d = ((((d + Math.PI) % twoPi) + twoPi) % twoPi) - Math.PI;
  return from + d * t;
}

export type { PotHudState } from '../world/renderTypes.js';

export type GameEngineOptions = {
  table?: Table;
  ballRadius?: number;
  storage?: StorageAdapter;
};

export class GameEngine implements Game {
  phase: GamePhase = 'MainMenu';
  private readonly storage: StorageAdapter;
  readonly table: Table;
  readonly physics: CollisionSystem;
  readonly rulesCtx: RulesContext = {
    openTable: true,
    playerGroup: null,
    aiGroup: null,
  };
  readonly turnClock = new TurnManager({
    playerSeconds: PLAYER_SHOT_CLOCK_SEC,
    aiSeconds: AI_THINK_MAX_SEC,
  });
  ai: AIController;
  readonly dialogue = new DialogueManager();

  levelIndex = 0;
  activePlayer: PlayerId = 'player';
  spinX = 0;
  spinY = 0;

  private aiThink = 0;
  /** AI think duration at start of AITurn (denominator for turnTime01 in snapshot). */
  private aiThinkTotal = 1;
  private pendingAI: AIShotPlan | null = null;
  /** Cue / aim line start angle at beginning of AI think (moves toward `pendingAI.angle`). */
  private aiAimDisplayStart = 0;
  private pressureSent = false;
  private lastHudReason = '';
  /** Set when entering `MatchEnd`. */
  lastMatchWon: boolean | null = null;

  /** 0 = player kadrajı, 1 = tam AI alternatif kadrajı; üstel yumuşatma. */
  private aiCameraBlend = 0;
  private aiCameraBlendTarget = 0;
  /** İlk break öncesi oyuncu turunda kamera preset A (açılış) kadrajında; bir kez biter. */
  private awaitingFirstPlayerBreakShot = true;
  /** Tutorial ilk ekranında açılış kamerasını break mantığından bağımsız kullan. */
  private tutorialOpeningCameraActive = false;
  /** True for the ball simulation that follows the opening break stroke (illegal-break rules). */
  private activeShotIsOpeningBreak = false;
  /** İlk oyuncu vuruşunda blend 1→0 ile üst kadraja yumuşak dönüş (lookAt/Y offset dahil). */
  private openingShotCameraReturnActive = false;
  /** Rakibin bu maçtaki ilk vuruşunda sinematik kadraj (blend→1) uygulanmaz. */
  private awaitingFirstAiShot = true;
  /** Rakip faul etti; oyuncu beyazı sürükleyerek yerleştirecek (isteka gizli). */
  private awaitingBallInHandPlacement = false;
  private ballInHandDragging = false;
  /** AI beyazı taşırken görsel kaydırma (fizik `cue.pos` lerp). */
  private aiCueBallPlacementSlide: {
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    t: number;
  } | null = null;
  private profile: PlayerProfile = defaultProfile();
  /** Active tournament run; null while in casual / main menu. Runtime-only (no persistence). */
  private tournament: TournamentRun | null = null;
  /** Casual mode picks a fresh random opponent per match start. */
  private casualOpponentId: string | null = null;

  /** First-run guided match (mid-game vs Tungo); cleared after completion storage. */
  private tutorialActive = false;
  /** Pulse power bar + drag cursor until the player’s first stroke in the tutorial. */
  private tutorialShootHint = false;
  /** Level-0 career break: scripted ellipse “finger” + overlay until dismissed once (storage). */
  private aimIntroActive = false;
  private aimIntroPhase = 0;
  private aimIntroDemoX = 0;
  private aimIntroDemoY = 0;
  /** Tutorial: aim intro once per match until “Got it” (not persisted). */
  private tutorialAimIntroDismissedThisMatch = false;
  /** Tutorial: oyuncunun attığı vuruş sayısı (ilk atışta nişan kilidi; 2. sıradan itibaren intro). */
  private tutorialPlayerStrokesCompleted = 0;
  /** İlk tutorial atışında `poolInput.aimAngle` sabit tutulur (döndürme yok). */
  private tutorialFirstShotAimLockRad = 0;
  /** Tutorial aim-intro: sweep starts from this aim; demo rotates 120° to the right only (no swing past center to the left). */
  private tutorialAimIntroSweepCenterRad = 0;

  /** Tutorial aim-intro: after the first ball is potted, wait this many seconds before intro can show. */
  private tutorialAimIntroFirstPotHoldSec = 0;
  /** Tutorial: first pocket of the match has started the aim-intro delay (once per match). */
  private tutorialAimIntroFirstPotDelayApplied = false;

  /** Tutorial: “pocket the 8” full-screen step (same HUD shell as aim intro). */
  private tutorialEightBallIntroActive = false;
  private tutorialEightBallIntroDismissedThisMatch = false;

  /** Center “reaction portrait” moment (TTL); cleared with match / dialogue tick cadence. */
  private opponentReaction: {
    text: string;
    ttl: number;
    durationTotal: number;
    beatId: number;
    portraitAssetId: string | null;
  } | null = null;
  private opponentReactionBeatSeq = 0;

  /** Center yellow notice popup (group assigned / foul). */
  private hudNotice: {
    kind: 'group' | 'foul';
    text: string;
    ttl: number;
    durationTotal: number;
    beatId: number;
  } | null = null;
  private hudNoticeBeatSeq = 0;

  /** Portrait-reaction opponents — consecutive pots where the player keeps the table (“scared” beat). */
  private portraitReactionStreak = 0;
  private portraitLastBallReactionUsed = false;
  /** Match-end strip (portrait + line) for opponents with a reaction roster (Tungo, Torta Tartaruga, …). */
  private matchEndOpponentPortrait: { portraitAssetId: string; text: string } | null = null;

  readonly poolInput = new PoolInputState();
  private readonly eventQueue: GameEvent[] = [];

  private readTutorialCompleted(): boolean {
    const raw = this.storage.getItem(TUTORIAL_STORAGE_KEY);
    return raw === '1';
  }

  private writeTutorialCompleted(): void {
    this.storage.setItem(TUTORIAL_STORAGE_KEY, '1');
  }

  private readAimIntroDismissed(): boolean {
    return this.storage.getItem(AIM_INTRO_STORAGE_KEY) === '1';
  }

  private writeAimIntroDismissed(): void {
    this.storage.setItem(AIM_INTRO_STORAGE_KEY, '1');
  }

  /** True while full-screen aim / 8-ball tutorial UI blocks play, or tutorial “wait” after first pot before aim intro. */
  isAimIntroActive(): boolean {
    return (
      this.aimIntroActive ||
      this.tutorialEightBallIntroActive ||
      (this.tutorialActive && this.tutorialAimIntroFirstPotHoldSec > 0)
    );
  }

  /**
   * Freeze the player shot countdown while teaching UI is active, tutorial wait between beats, or blocking dialogue.
   */
  private isPlayerShotClockPaused(): boolean {
    if (this.phase !== 'PlayerTurn') return false;
    if (this.isAimIntroActive()) return true;
    if (!this.tutorialActive) return false;
    return (
      this.tutorialOpeningCameraActive ||
      this.tutorialShootHint ||
      this.opponentReaction != null ||
      this.hudNotice != null ||
      this.dialogue.getBubble() != null
    );
  }

  private dismissAimIntro(): void {
    if (!this.aimIntroActive) return;
    const wasTutorial = this.tutorialActive;
    this.aimIntroActive = false;
    if (wasTutorial) {
      this.tutorialAimIntroDismissedThisMatch = true;
      this.syncTutorialInitialAimTowardFirstTargetBall();
    } else {
      this.writeAimIntroDismissed();
    }
    this.refreshTutorialEightBallIntroEligibility();
  }

  private dismissTutorialEightBallIntro(): void {
    if (!this.tutorialEightBallIntroActive) return;
    this.tutorialEightBallIntroActive = false;
    this.tutorialEightBallIntroDismissedThisMatch = true;
  }

  /** After aim intro / turn changes, show tutorial “pocket the 8” overlay when appropriate. */
  private refreshTutorialEightBallIntroEligibility(): void {
    if (!this.tutorialActive) {
      this.tutorialEightBallIntroActive = false;
      return;
    }
    this.tutorialEightBallIntroActive =
      this.phase === 'PlayerTurn' &&
      this.activePlayer === 'player' &&
      this.physics.cue.active &&
      !this.awaitingBallInHandPlacement &&
      !this.tutorialEightBallIntroDismissedThisMatch &&
      !this.aimIntroActive &&
      this.playerIsOnEightBallOnly();
  }

  /**
   * Aim-intro hand on felt: farther along the aim line than the cue tip, offset to the cue’s right
   * (perpendicular to aim in table space).
   */
  private aimIntroFingerTablePos(cue: { pos: { x: number; y: number }; radius: number }, aimRad: number): {
    x: number;
    y: number;
  } {
    const reach = cue.radius * 8.1;
    const side = cue.radius * 2.55;
    const c = Math.cos(aimRad);
    const s = Math.sin(aimRad);
    return {
      x: cue.pos.x + reach * c + side * s,
      y: cue.pos.y + reach * s - side * c,
    };
  }

  private initAimIntroDemoPose(): void {
    this.aimIntroPhase = 0;
    const cue = this.physics.cue;
    if (this.tutorialActive) {
      this.syncTutorialInitialAimTowardFirstTargetBall();
      this.tutorialAimIntroSweepCenterRad = this.poolInput.aimAngle;
      this.aimIntroPhase = -Math.PI / 2;
      const theta = this.tutorialAimIntroSweepCenterRad;
      const f = this.aimIntroFingerTablePos(cue, theta);
      this.aimIntroDemoX = f.x;
      this.aimIntroDemoY = f.y;
      this.poolInput.aimAngle = theta;
      return;
    }
    const rx = cue.radius * 5.4;
    const ry = cue.radius * 3.65;
    const px = cue.pos.x + rx;
    const py = cue.pos.y;
    const theta = Math.atan2(py - cue.pos.y, px - cue.pos.x);
    const f = this.aimIntroFingerTablePos(cue, theta);
    this.aimIntroDemoX = f.x;
    this.aimIntroDemoY = f.y;
    this.poolInput.aimAngle = theta;
  }

  /**
   * Tutorial: no intro on first shot (aim locked); after first stroke, aim intro once per match (sweep demo).
   * Career level 0 first break: once per device until dismissed (ellipse demo).
   */
  private refreshAimIntroEligibility(): void {
    const was = this.aimIntroActive;
    let eligible = false;
    if (this.tutorialActive) {
      eligible =
        this.phase === 'PlayerTurn' &&
        this.physics.cue.active &&
        !this.awaitingBallInHandPlacement &&
        !this.tutorialAimIntroDismissedThisMatch &&
        this.tutorialPlayerStrokesCompleted >= 1 &&
        this.tutorialAimIntroFirstPotHoldSec <= 0 &&
        !this.tutorialEightBallIntroActive;
    } else {
      eligible =
        this.phase === 'PlayerTurn' &&
        this.levelIndex === 0 &&
        this.tournament == null &&
        this.awaitingFirstPlayerBreakShot &&
        this.physics.cue.active &&
        !this.readAimIntroDismissed();
    }
    this.aimIntroActive = eligible;
    if (eligible && !was) this.initAimIntroDemoPose();
  }

  private tickAimIntroDemo(dt: number): void {
    if (!this.aimIntroActive || this.phase !== 'PlayerTurn') return;
    const cue = this.physics.cue;
    if (!cue.active) return;
    if (this.tutorialActive) {
      this.aimIntroPhase += dt * 1.05;
      /** 120° total, only clockwise from center (no excursion left of initial aim). */
      const sweepRad = (120 * Math.PI) / 180;
      const t = 0.5 + 0.5 * Math.sin(this.aimIntroPhase);
      const theta = this.tutorialAimIntroSweepCenterRad + sweepRad * t;
      const f = this.aimIntroFingerTablePos(cue, theta);
      this.aimIntroDemoX = f.x;
      this.aimIntroDemoY = f.y;
      this.poolInput.aimAngle = theta;
      return;
    }
    this.aimIntroPhase += dt * 0.95;
    const u = this.aimIntroPhase;
    const rx = cue.radius * 5.4;
    const ry = cue.radius * 3.65;
    const px = cue.pos.x + rx * Math.cos(u);
    const py = cue.pos.y + ry * Math.sin(u);
    const theta = Math.atan2(py - cue.pos.y, px - cue.pos.x);
    const f = this.aimIntroFingerTablePos(cue, theta);
    this.aimIntroDemoX = f.x;
    this.aimIntroDemoY = f.y;
    this.poolInput.aimAngle = theta;
  }

  private filterAimIntroPoolCommands(commands: readonly GameInputCommand[]): GameInputCommand[] {
    if (!this.isAimIntroActive()) return [...commands];
    const out: GameInputCommand[] = [];
    for (const c of commands) {
      if (c.type === 'pointer.table' || c.type === 'power.drag' || c.type === 'spin.set') continue;
      out.push(c);
    }
    return out;
  }

  private resetPlayerSpin(): void {
    this.spinX = 0;
    this.spinY = 0;
  }

  constructor(options?: GameEngineOptions) {
    this.storage = options?.storage ?? new MemoryStorageAdapter();
    const ballRadius = options?.ballRadius ?? 8.1;
    this.table = options?.table ?? new Table();
    this.physics = new CollisionSystem(this.table, ballRadius);
    this.ai = new AIController(CAREER_OPPONENTS[0]!);
    this.profile = this.loadProfileFromStorage();
    this.ensureEquippedStats();
    if (!this.readTutorialCompleted()) {
      this.beginTutorialMatch();
    } else {
      /**
       * Initialize physics + AI for the first match so the table renders behind the menu,
       * then drop back to `MainMenu` so the new hub UI is the entry point. Pressing PLAY
       * (`menu.play`) will re-run `beginCareer` to flip the phase into `PlayerTurn`.
       */
      this.beginCareer(0);
      this.phase = 'MainMenu';
      this.turnClock.stop();
      /** Replace the match BGM queued by `beginCareer` with the menu (between-games) loop. */
      this.eventQueue.length = 0;
      this.pushMusicStart(AssetIds.musicBgBetweenGames);
    }
  }

  reset(seed?: number): void {
    void seed;
    this.ensureEquippedStats();
    this.beginCareer(this.levelIndex);
  }

  drainEvents(): GameEvent[] {
    const out = this.eventQueue.slice();
    this.eventQueue.length = 0;
    return out;
  }

  private pushSound(soundId: string, volume?: number): void {
    this.eventQueue.push({ type: 'sound', soundId, volume });
  }

  private pushMusicStart(musicId: string): void {
    this.eventQueue.push({ type: 'music', musicId, action: 'start' });
  }

  private loadProfileFromStorage(): PlayerProfile {
    try {
      const raw = this.storage.getItem(PROFILE_STORAGE_KEY);
      if (!raw) return defaultProfile();
      const parsed = JSON.parse(raw) as unknown;
      return hydrateProfile(parsed);
    } catch {
      return defaultProfile();
    }
  }

  private saveProfileToStorage(): void {
    try {
      this.storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(this.profile));
    } catch {
      /* ignore */
    }
  }

  private profileView(): ProfileView {
    const p = this.profile;
    const rank = computeRank(p.wins);
    const total = p.wins + p.losses;
    const winRate = total > 0 ? p.wins / total : 0;
    return {
      ...p,
      rank,
      winRate,
    };
  }

  private findCue(cueId: string) {
    return SHOP_CUE_CATALOG.find((c) => c.id === cueId);
  }

  private buyCue(cueId: string): boolean {
    const item = this.findCue(cueId);
    if (!item) return false;
    const p = this.profile;
    if (p.ownedCueIds.includes(cueId)) return false;
    if (p.coins < item.price) return false;
    p.coins -= item.price;
    p.ownedCueIds.push(cueId);
    this.saveProfileToStorage();
    return true;
  }

  /** Debug helper: grant coins immediately. */
  debugGrantCoins(amount: number): void {
    const p = this.profile;
    p.coins = Math.max(0, p.coins + Math.floor(amount));
    this.saveProfileToStorage();
  }

  /**
   * Debug helper: wipe ALL persistent player data — profile (coins, wins,
   * losses, owned cues, XP), tutorial / aim-intro completion flags, and any
   * caller-managed counters that match a list of well-known prefixes. Drops
   * back to the first-launch flow (tutorial match) so the next frame is a
   * clean start identical to a brand-new install. Table layout is preserved.
   */
  debugWipePlayerData(extraKeysToRemove: readonly string[] = []): void {
    /** Drop persistent player data. Table layout (`poolTableLayoutJson`) is
     *  intentionally not touched so the local dev workspace stays usable. */
    const knownKeys: readonly string[] = [
      PROFILE_STORAGE_KEY,
      TUTORIAL_STORAGE_KEY,
      AIM_INTRO_STORAGE_KEY,
      'vertical-eight-ball.leaderboard.v1',
    ];
    for (const k of knownKeys) this.storage.removeItem(k);
    for (const k of extraKeysToRemove) this.storage.removeItem(k);

    /** Reset in-memory match state so nothing lingering keeps the old run. */
    this.opponentReaction = null;
    this.hudNotice = null;
    this.matchEndOpponentPortrait = null;
    this.pendingAI = null;
    this.aiCueBallPlacementSlide = null;
    this.dialogue.clearBubble();
    this.eventQueue.length = 0;
    this.tournament = null;
    this.casualOpponentId = null;
    this.tutorialAimIntroDismissedThisMatch = false;
    this.tutorialAimIntroFirstPotHoldSec = 0;
    this.tutorialAimIntroFirstPotDelayApplied = false;
    this.tutorialEightBallIntroDismissedThisMatch = false;
    this.tutorialEightBallIntroActive = false;
    this.tutorialPlayerStrokesCompleted = 0;
    this.aimIntroActive = false;
    this.tutorialActive = false;
    this.tutorialShootHint = false;

    /** Reload from (now empty) storage → default profile, then enter the
     *  first-launch flow (tutorial vs. tungo). */
    this.profile = this.loadProfileFromStorage();
    this.ensureEquippedStats();
    this.saveProfileToStorage();
    this.beginTutorialMatch();
  }

  /** Debug helper: own all cues and equip the priciest one. */
  debugOwnAllCues(): void {
    const p = this.profile;
    for (const cue of SHOP_CUE_CATALOG) {
      if (!p.ownedCueIds.includes(cue.id)) {
        p.ownedCueIds.push(cue.id);
      }
    }
    const richest = [...SHOP_CUE_CATALOG].sort((a, b) => b.price - a.price)[0];
    if (richest) {
      p.equippedCueId = richest.id;
      p.equippedCueStats = richest.stats ? { ...richest.stats } : undefined;
    }
    this.saveProfileToStorage();
  }

  private equipCue(cueId: string): boolean {
    const p = this.profile;
    if (!p.ownedCueIds.includes(cueId)) return false;
    p.equippedCueId = cueId;
    // cache equipped stats for quick read; fallback to classic stats when missing
    const stats = this.findCue(cueId)?.stats ?? this.findCue('classic')?.stats;
    p.equippedCueStats = stats ? { ...stats } : undefined;
    this.saveProfileToStorage();
    return true;
  }

  private ensureEquippedStats(): void {
    const p = this.profile;
    const stats = this.findCue(p.equippedCueId)?.stats ?? this.findCue('classic')?.stats;
    p.equippedCueStats = stats ? { ...stats } : undefined;
  }

  private applyMatchResult(res: TurnResolution): void {
    const playerWon = res.playerWon === true;
    const playerLost = res.playerLost === true;
    if (!playerWon && !playerLost) return;
    const p = this.profile;
    /**
     * Tournament rounds do not pay out per-match coins or XP — the only
     * payout is the championship bonus when the player clears the bracket.
     * Casual matches keep their per-match rewards intact.
     */
    const isTournamentMatch = this.tournament?.status === 'active';
    if (playerWon) {
      if (!isTournamentMatch) {
        p.coins += COIN_REWARD_WIN;
      }
      p.wins += 1;
      p.currentStreak += 1;
      if (p.currentStreak > p.bestStreak) p.bestStreak = p.currentStreak;
      /** Tournament wins do not advance the casual ladder; only casual ones do. */
      if (!isTournamentMatch && this.levelIndex > p.highestLevelIndex) {
        p.highestLevelIndex = this.levelIndex;
      }
    } else if (playerLost) {
      p.losses += 1;
      p.currentStreak = 0;
      if (!isTournamentMatch) {
        p.coins += COIN_REWARD_LOSS;
      }
    }
    if (!isTournamentMatch) {
      p.xp = Math.max(0, p.xp + this.computeMatchXp(playerWon));
    }
    /** Tournament championship bonus is the only tournament payout (final round only). */
    const bonus = this.applyTournamentResult(playerWon);
    if (bonus.coinBonus > 0) p.coins += bonus.coinBonus;
    if (bonus.xpBonus > 0) p.xp = Math.max(0, p.xp + bonus.xpBonus);
    this.saveProfileToStorage();
  }

  /** XP earned from the just-finished match (called from `applyMatchResult`). */
  private computeMatchXp(playerWon: boolean): number {
    const base = playerWon ? XP_REWARD_WIN : XP_REWARD_LOSS;
    const pot = this.getPotHudState();
    let pottedByPlayer = 0;
    if (pot.kind === 'open') {
      const g = this.rulesCtx.playerGroup;
      pottedByPlayer = g === 'stripe' ? pot.stripes.length : pot.solids.length;
    } else {
      pottedByPlayer = pot.player.length;
    }
    return base + Math.max(0, pottedByPlayer) * XP_REWARD_PER_BALL_POTTED;
  }

  /** Oyuncu beyaz yerleştirirken canvas `cursor` için (main loop). */
  isAwaitingPlayerBallInHand(): boolean {
    return this.awaitingBallInHandPlacement && this.phase === 'PlayerTurn' && this.physics.cue.active;
  }

  private pickRandomMatchBgmId(): string {
    return Math.random() < 0.5 ? AssetIds.musicBgMatch2 : AssetIds.musicBgMatch3;
  }

  private pickRandomCasualOpponentId(): string {
    const idx = Math.floor(Math.random() * CAREER_OPPONENTS.length);
    return CAREER_OPPONENTS[Math.max(0, Math.min(idx, CAREER_OPPONENTS.length - 1))]!.id;
  }

  private getCareerStepStrength(): number {
    return Math.max(this.levelIndex, this.profile.highestLevelIndex);
  }

  private scaleOpponentTier(
    baseTier: DifficultyTier,
    opts?: Pick<TournamentOpponentSlot, 'tierOffset' | 'minTier' | 'maxTier' | 'fixedTier'>,
  ): DifficultyTier {
    if (opts?.fixedTier) return opts.fixedTier;
    const careerBoost = Math.max(0, this.getCareerStepStrength());
    const offset = opts?.tierOffset ?? 0;
    const baseIdx = difficultyTierIndex(baseTier);
    const minIdx = opts?.minTier ? difficultyTierIndex(opts.minTier) : 0;
    const maxIdx = opts?.maxTier ? difficultyTierIndex(opts.maxTier) : DIFFICULTY_TIER_ORDER.length - 1;
    const scaled = baseIdx + careerBoost + offset;
    const clamped = Math.max(minIdx, Math.min(maxIdx, scaled));
    return tierFromIndex(clamped);
  }

  private findBaseOpponentById(id: string): AICharacterProfile | undefined {
    return CAREER_OPPONENTS.find((o) => o.id === id);
  }

  private resolveCurrentTournamentSlot(): TournamentOpponentSlot | null {
    const t = this.tournament;
    if (!t || t.status !== 'active') return null;
    return t.opponents[t.currentRound] ?? null;
  }

  private resolveOpponentFromSlot(slot: TournamentOpponentSlot): AICharacterProfile | null {
    const base = this.findBaseOpponentById(slot.id);
    if (!base) return null;
    return {
      ...base,
      tier: this.scaleOpponentTier(base.tier, slot),
    };
  }

  private resolveCasualOpponentById(id: string): AICharacterProfile | null {
    const base = this.findBaseOpponentById(id);
    if (!base) return null;
    return {
      ...base,
      tier: this.scaleOpponentTier(base.tier),
    };
  }

  getOpponent(): AICharacterProfile {
    const tournamentSlot = this.resolveCurrentTournamentSlot();
    if (tournamentSlot) {
      const resolved = this.resolveOpponentFromSlot(tournamentSlot);
      if (resolved) return resolved;
    }
    if (this.casualOpponentId) {
      const resolved = this.resolveCasualOpponentById(this.casualOpponentId);
      if (resolved) return resolved;
    }
    const fallback = CAREER_OPPONENTS[Math.min(this.levelIndex, CAREER_OPPONENTS.length - 1)]!;
    return {
      ...fallback,
      tier: this.scaleOpponentTier(fallback.tier),
    };
  }

  /** Planned shot (angle + power) for drawing the cue during `AITurn`. */
  private getAiCuePreview(): AIShotPlan | null {
    if (this.phase !== 'AITurn' || !this.pendingAI) return null;
    const p = this.pendingAI;
    const rawT = 1 - this.aiThink / this.aiThinkTotal;
    const t = Math.max(0, Math.min(1, Number.isFinite(rawT) ? rawT : 1));
    const smooth = t * t * (3 - 2 * t);
    const angle = lerpAngleRad(this.aiAimDisplayStart, p.angle, smooth);
    return { ...p, angle };
  }

  beginCareer(levelIndex: number): void {
    this.levelIndex = Math.max(0, Math.min(levelIndex, CAREER_OPPONENTS.length - 1));
    if (this.tournament && this.tournament.status === 'active') {
      this.casualOpponentId = null;
    } else {
      this.casualOpponentId = this.pickRandomCasualOpponentId();
    }
    const opp = this.getOpponent();
    this.ai.setProfile(opp);
    this.rulesCtx.openTable = true;
    this.rulesCtx.playerGroup = null;
    this.rulesCtx.aiGroup = null;
    this.physics.resetRack();
    this.physics.placeCueBallForBreak();
    this.activePlayer = 'player';
    this.resetPlayerSpin();
    this.turnClock.beginTurn('player');
    this.dialogue.clearBubble();
    this.opponentReaction = null;
    this.hudNotice = null;
    this.portraitReactionStreak = 0;
    this.portraitLastBallReactionUsed = false;
    this.matchEndOpponentPortrait = null;
    this.pressureSent = false;
    this.pendingAI = null;
    this.phase = 'PlayerTurn';
    this.lastHudReason = `${opp.name} — ${opp.tier}`;
    this.lastMatchWon = null;
    this.poolInput.resetStroke();
    this.poolInput.aimDragging = false;
    this.awaitingFirstPlayerBreakShot = true;
    this.tutorialOpeningCameraActive = false;
    this.awaitingFirstAiShot = true;
    this.awaitingBallInHandPlacement = false;
    this.ballInHandDragging = false;
    this.aiCueBallPlacementSlide = null;
    this.activeShotIsOpeningBreak = false;
    this.openingShotCameraReturnActive = false;
    this.aiCameraBlend = 0;
    this.aiCameraBlendTarget = 0;
    this.pushMusicStart(this.pickRandomMatchBgmId());
    this.refreshAimIntroEligibility();
    this.refreshTutorialEightBallIntroEligibility();
  }

  /**
   * First launch: mid-game 8-ball vs Tungo, groups assigned, few balls for a short teaching run.
   * Skips the main menu until the match is left via the normal end card (then `writeTutorialCompleted`).
   */
  private beginTutorialMatch(): void {
    this.tutorialAimIntroDismissedThisMatch = false;
    this.tutorialAimIntroFirstPotHoldSec = 0;
    this.tutorialAimIntroFirstPotDelayApplied = false;
    this.tutorialEightBallIntroDismissedThisMatch = false;
    this.tutorialEightBallIntroActive = false;
    this.tutorialPlayerStrokesCompleted = 0;
    this.tutorialActive = true;
    this.tutorialShootHint = true;
    this.levelIndex = 0;
    this.tournament = null;
    this.casualOpponentId = 'tungo';
    const opp = this.getOpponent();
    this.ai.setProfile(opp);
    this.rulesCtx.openTable = false;
    this.rulesCtx.playerGroup = 'solid';
    this.rulesCtx.aiGroup = 'stripe';
    this.physics.resetRack();
    applyTutorialMidgameLayout(this.table, this.physics);
    this.activePlayer = 'player';
    this.resetPlayerSpin();
    this.turnClock.beginTurn('player');
    this.dialogue.clearBubble();
    this.opponentReaction = null;
    this.hudNotice = null;
    this.portraitReactionStreak = 0;
    this.portraitLastBallReactionUsed = false;
    this.matchEndOpponentPortrait = null;
    this.pressureSent = false;
    this.pendingAI = null;
    this.lastHudReason = `${opp.name} — ${opp.tier}`;
    this.lastMatchWon = null;
    this.poolInput.resetStroke();
    this.poolInput.aimDragging = false;
    this.awaitingFirstPlayerBreakShot = false;
    this.tutorialOpeningCameraActive = true;
    this.awaitingFirstAiShot = true;
    this.awaitingBallInHandPlacement = false;
    this.ballInHandDragging = false;
    this.aiCueBallPlacementSlide = null;
    this.activeShotIsOpeningBreak = false;
    this.openingShotCameraReturnActive = false;
    this.aiCameraBlend = 0;
    this.aiCameraBlendTarget = 0;
    this.phase = 'PlayerTurn';
    this.eventQueue.length = 0;
    this.syncTutorialInitialAimTowardFirstTargetBall();
    this.tutorialFirstShotAimLockRad = this.poolInput.aimAngle;
    this.pushMusicStart(this.pickRandomMatchBgmId());
    this.refreshAimIntroEligibility();
    this.refreshTutorialEightBallIntroEligibility();
  }

  /** Aim the cue at solid 1 before the player moves — tutorial intro line. */
  private syncTutorialInitialAimTowardFirstTargetBall(): void {
    const cue = this.physics.cue;
    const target = this.physics.balls.find((b) => b.number === 1 && b.active);
    if (!cue.active || !target) return;
    const dx = target.pos.x - cue.pos.x;
    const dy = target.pos.y - cue.pos.y;
    if (dx * dx + dy * dy < 8) return;
    this.poolInput.aimAngle = Math.atan2(dy, dx);
  }

  /** After a casual career win, advance the ladder. Tournament wins do **not** bump. */
  bumpLevelAfterVictory(): void {
    if (this.tournament && this.tournament.status === 'active') return;
    this.levelIndex = Math.min(this.levelIndex + 1, CAREER_OPPONENTS.length - 1);
  }

  /**
   * Initialize a new tournament run for the given catalog id. Returns true on
   * success. Fails silently when:
   *   - the id does not exist in the catalog,
   *   - the player can't afford the entry fee, or
   *   - the picker can't produce enough opponents.
   *
   * The run starts with no match in progress; the bracket overlay is shown
   * first and the player presses "Start Match" (`tournament.advance`) to begin
   * round 0. Career `levelIndex` is preserved.
   */
  beginTournament(defId: TournamentTier): boolean {
    const def = findTournament(defId);
    if (!def) return false;
    if (this.profile.coins < def.entryFeeCoins) return false;
    const opponentSlots = def.pickOpponents(CAREER_OPPONENTS);
    if (opponentSlots.length < def.matchCount) return false;
    /** Deduct entry fee up front; refunds are not granted on forfeit/elimination. */
    if (def.entryFeeCoins > 0) {
      this.profile.coins -= def.entryFeeCoins;
      this.saveProfileToStorage();
    }
    this.tournament = createPendingRun(defId, opponentSlots.slice(0, def.matchCount));
    /** Stay in the menu phase so the bracket overlay can introduce the run. */
    this.phase = 'MainMenu';
    this.turnClock.stop();
    return true;
  }

  /** Begin the next pending round of the active tournament. */
  private advanceTournament(): void {
    if (!this.tournament || this.tournament.status !== 'active') return;
    if (this.tournament.currentRound >= this.tournament.opponents.length) return;
    /** beginCareer reads `getOpponent()` which now returns the tournament slot. */
    this.beginCareer(this.levelIndex);
  }

  private getActiveTournamentDef(): TournamentDef | undefined {
    if (!this.tournament) return undefined;
    return findTournament(this.tournament.defId);
  }

  /**
   * After a settled match, update tournament bookkeeping. Returns the bonus
   * XP/coin awarded if the player just won the championship.
   */
  private applyTournamentResult(playerWon: boolean): { coinBonus: number; xpBonus: number } {
    const t = this.tournament;
    if (!t || t.status !== 'active') return { coinBonus: 0, xpBonus: 0 };
    const round = t.currentRound;
    if (!playerWon) {
      t.record[round] = 'lost';
      t.status = 'lost';
      return { coinBonus: 0, xpBonus: 0 };
    }
    t.record[round] = 'won';
    t.currentRound = round + 1;
    if (t.currentRound >= t.opponents.length) {
      t.status = 'won';
      const def = this.getActiveTournamentDef();
      return {
        coinBonus: def?.championBonusCoins ?? 0,
        xpBonus: def?.championBonusXp ?? 0,
      };
    }
    return { coinBonus: 0, xpBonus: 0 };
  }

  private requestPlayerShot(angle: number, power01: number, spinX: number, spinY: number): boolean {
    if (this.phase !== 'PlayerTurn') return false;
    if (this.isAimIntroActive()) return false;
    if (!this.physics.cue.active) return false;
    const cueStats = this.findCue(this.profile.equippedCueId)?.stats ?? { power: 1, aim: 1, spin: 1 };
    const isOpeningBreak = this.awaitingFirstPlayerBreakShot;
    const isTutorialOpeningShot = this.tutorialOpeningCameraActive;
    if (this.tutorialShootHint) this.tutorialShootHint = false;
    let p = Math.max(0.1, Math.min(1, power01 * cueStats.power));
    /** Opening break: modest boost so mid-slider still splits (was 1.2x + 0.08). */
    if (isOpeningBreak) {
      p = Math.min(1, p * 1.06 + 0.045);
    }
    /** Continuous spin — no preset snap; physics still picks nearest preset for risk tuning in `CollisionSystem`. */
    spinX = Math.max(-1, Math.min(1, spinX * cueStats.spin));
    spinY = Math.max(-1, Math.min(1, spinY * cueStats.spin));
    this.activeShotIsOpeningBreak = isOpeningBreak;
    if (isTutorialOpeningShot) {
      this.tutorialOpeningCameraActive = false;
      this.aiCameraBlend = 1;
      this.aiCameraBlendTarget = 0;
      this.openingShotCameraReturnActive = true;
    }
    if (isOpeningBreak) {
      this.awaitingFirstPlayerBreakShot = false;
      this.aiCameraBlend = 1;
      this.aiCameraBlendTarget = 0;
      this.openingShotCameraReturnActive = true;
    }
    if (this.tutorialActive) {
      this.tutorialPlayerStrokesCompleted += 1;
    }
    this.physics.applyShot(angle, p, spinX, spinY);
    this.resetPlayerSpin();
    this.physics.beginShot();
    this.pushSound(AssetIds.soundCueStrike, 0.55);
    this.phase = 'BallSimulation';
    this.turnClock.stop();
    return true;
  }

  private fireAIShot(): void {
    const plan =
      this.pendingAI ??
      this.ai.compute({
        table: this.table,
        balls: this.physics.balls,
        cue: this.physics.cue,
        rules: this.rulesCtx,
      });
    // attach opponent cue id for rendering preview + apply cue stats
    const opp = this.getOpponent();
    const cueStats = this.findCue(opp.cueId ?? '')?.stats ?? { power: 1, aim: 1, spin: 1 };
    plan.cueId = opp.cueId;
    plan.power01 = Math.max(0.18, Math.min(1, plan.power01 * cueStats.power));
    plan.spinX = Math.max(-1, Math.min(1, plan.spinX * cueStats.spin));
    plan.spinY = Math.max(-1, Math.min(1, plan.spinY * cueStats.spin));
    this.pendingAI = null;
    this.activeShotIsOpeningBreak = false;
    if (this.awaitingFirstAiShot) this.awaitingFirstAiShot = false;
    this.physics.applyShot(plan.angle, plan.power01, plan.spinX, plan.spinY);
    this.physics.beginShot();
    this.pushSound(AssetIds.soundCueStrike, 0.55);
    this.phase = 'BallSimulation';
    this.aiThink = 0;
  }

  update(dt: number, commands: readonly GameInputCommand[] = []): void {
    this.applyMenuCommands(commands);

    if (this.tutorialActive && this.tutorialAimIntroFirstPotHoldSec > 0) {
      const prev = this.tutorialAimIntroFirstPotHoldSec;
      this.tutorialAimIntroFirstPotHoldSec = Math.max(0, prev - dt);
      if (prev > 0 && this.tutorialAimIntroFirstPotHoldSec <= 0) {
        this.refreshAimIntroEligibility();
      }
    }

    const commandsForPool = this.filterAimIntroPoolCommands(this.filterBallInHandPointerCommands(commands));

    this.poolInput.applyCommands(commandsForPool, {
      phaseIsPlayerTurn:
        this.phase === 'PlayerTurn' && !this.opponentReaction && !this.awaitingBallInHandPlacement,
      cueActive: this.physics.cue.active,
      cueX: this.physics.cue.pos.x,
      cueY: this.physics.cue.pos.y,
      cueRadius: this.physics.cue.radius,
      spinSetter: (nx, ny) => {
        if (this.phase !== 'PlayerTurn' || !this.physics.cue.active || this.awaitingBallInHandPlacement) {
          return;
        }
        const x = Math.max(-1, Math.min(1, nx));
        const y = Math.max(-1, Math.min(1, ny));
        const m = Math.hypot(x, y);
        if (m > 1e-6 && m > 1) {
          this.spinX = x / m;
          this.spinY = y / m;
          return;
        }
        this.spinX = x;
        this.spinY = y;
      },
      requestShot: (angle, power, sx, sy) => {
        void this.requestPlayerShot(angle, power, sx, sy);
      },
      getSpin: () => ({ x: this.spinX, y: this.spinY }),
    });

    if (this.tutorialActive && this.tutorialAimIntroFirstPotHoldSec > 0) {
      this.poolInput.aimDragging = false;
      this.poolInput.resetStroke();
    }

    if (
      this.tutorialActive &&
      this.tutorialPlayerStrokesCompleted === 0 &&
      this.phase === 'PlayerTurn' &&
      !this.awaitingBallInHandPlacement &&
      !this.opponentReaction
    ) {
      this.poolInput.aimAngle = this.tutorialFirstShotAimLockRad;
    }

    this.tickAimIntroDemo(dt);

    this.dialogue.tick(dt);
    if (this.opponentReaction) {
      this.opponentReaction.ttl -= dt;
      if (this.opponentReaction.ttl <= 0) this.opponentReaction = null;
    }
    if (this.hudNotice) {
      this.hudNotice.ttl -= dt;
      if (this.hudNotice.ttl <= 0) this.hudNotice = null;
    }

    if (this.phase !== 'MainMenu' && this.phase !== 'MatchEnd') {
      this.tickAiCameraBlend(dt);
    }

    if (this.phase === 'MainMenu' || this.phase === 'MatchEnd') return;

    if (this.phase === 'PlayerTurn') {
      if (!this.isPlayerShotClockPaused()) {
        const lowTime = this.turnClock.progress01() < 0.22;
        if (lowTime && !this.pressureSent && !this.awaitingBallInHandPlacement) {
          void this.tryDialogue('pressure', this.getOpponent());
          this.pressureSent = true;
        }
        if (this.turnClock.tick(dt)) {
          const shooter: PlayerId = 'player';
          this.resolveTurn(resolveTurnTimeout(shooter), shooter, undefined);
        }
      }
      return;
    }

    if (this.phase === 'AITurn') {
      if (this.aiCueBallPlacementSlide) {
        this.tickAiCueBallPlacementSlide(dt);
        if (this.aiCueBallPlacementSlide) {
          return;
        }
      }
      // Hold AI shot until opponent reaction beat ends; camera blend still ticks earlier in `update`.
      if (!this.opponentReaction) {
        this.aiThink -= dt;
        if (this.aiThink <= 0) this.fireAIShot();
      }
      return;
    }

    if (this.phase === 'BallSimulation') {
      const done = this.physics.stepFrame(dt);
      const ballHits = this.physics.getBallBallHitsThisFrame();
      /** Yoğun kırışta alt-adımlarda çok sayıda temas olabilir; HTMLAudio yerine Web Audio ile çoklu çalma destekleniyor. */
      const maxHitsPerFrame = 24;
      for (let i = 0; i < Math.min(ballHits, maxHitsPerFrame); i++) {
        this.pushSound(AssetIds.soundBallBall, 0.38);
      }
      if (done) {
        const shot = this.physics.snapshotOutcome();
        const shooter = this.activePlayer;
        const isBreakShot = this.activeShotIsOpeningBreak;
        this.activeShotIsOpeningBreak = false;
        this.resolveTurn(
          resolveEightBallRules({
            ctx: this.rulesCtx,
            shooter,
            shot,
            balls: this.collectBallMeta(),
            isBreakShot,
          }),
          shooter,
          shot,
        );
      }
    }
  }

  private tickAiCueBallPlacementSlide(dt: number): void {
    const s = this.aiCueBallPlacementSlide;
    if (!s) return;
    const durationSec = 0.52;
    s.t += dt / durationSec;
    const u = Math.min(1, s.t);
    const k = 1 - (1 - u) ** 3;
    const cx = s.fromX + (s.toX - s.fromX) * k;
    const cy = s.fromY + (s.toY - s.fromY) * k;
    this.physics.cue.pos.set(cx, cy);
    this.physics.cue.vel.set(0, 0);
    this.physics.cue.english.set(0, 0);
    this.physics.cue.active = true;
    if (u >= 1) {
      this.physics.cue.pos.set(s.toX, s.toY);
      this.aiCueBallPlacementSlide = null;
    }
  }

  private collectBallMeta(): BallMeta[] {
    return this.physics.balls.map((b) => ({
      id: b.id,
      number: b.number,
      kind: b.kind,
      active: b.active,
    }));
  }

  private pickAiLegalTargetsForScoring(view: EvaluatorWorldView) {
    const out: (typeof view.balls)[number][] = [];
    const aiGroup = view.rules.aiGroup;
    const groupRemaining = (g: 'solid' | 'stripe') =>
      view.balls.some((b) => b.active && kindToGroup(b.kind) === g);
    const aiNeedsEight = aiGroup && !groupRemaining(aiGroup);

    for (const b of view.balls) {
      if (!b.active || b.kind === 'cue') continue;
      if (b.kind === 'eight') {
        if (aiNeedsEight) out.push(b);
        continue;
      }
      if (view.rules.openTable) {
        out.push(b);
        continue;
      }
      if (aiGroup && kindToGroup(b.kind) === aiGroup) out.push(b);
    }
    if (!out.length) {
      const avoidEightOpen =
        view.rules.openTable &&
        view.balls.some((x) => x.active && (x.kind === 'solid' || x.kind === 'stripe'));
      for (const b of view.balls) {
        if (!b.active || b.kind === 'cue') continue;
        if (avoidEightOpen && b.kind === 'eight') continue;
        out.push(b);
      }
    }
    return out;
  }

  /**
   * Ball-in-hand pozisyon puanı: AI için en iyi direct pot + leave kombinasyonu.
   * Yüksek skor = daha avantajlı yerleşim.
   */
  private scoreAiCueBallInHandPosition(x: number, y: number): number {
    const cue = this.physics.cue;
    const ox = cue.pos.x;
    const oy = cue.pos.y;
    const ovx = cue.vel.x;
    const ovy = cue.vel.y;
    const oex = cue.english.x;
    const oey = cue.english.y;

    cue.pos.set(x, y);
    cue.vel.set(0, 0);
    cue.english.set(0, 0);

    const view: EvaluatorWorldView = {
      table: this.table,
      balls: this.physics.balls,
      cue: this.physics.cue,
      rules: this.rulesCtx,
    };
    const ownTargets = ownTargetsFor(view);
    const legalTargets = this.pickAiLegalTargetsForScoring(view);
    const tier = tierParams(this.getOpponent().tier);

    let best = -Infinity;
    for (const obj of legalTargets) {
      for (const pk of this.table.pockets) {
        const cand = evaluateDirectShot(view, obj, pk, tier, ownTargets);
        if (!cand) continue;
        const s = cand.totalScore + cand.potProb * 0.85;
        if (s > best) best = s;
      }
    }

    cue.pos.set(ox, oy);
    cue.vel.set(ovx, ovy);
    cue.english.set(oex, oey);

    if (best > -Infinity) return best;
    /** Hiç direct yoksa tamamen rastgele değil: masa ortasına yakınlık bonusu. */
    const cx = this.table.width * 0.5;
    const cy = this.table.height * 0.5;
    const d = Math.hypot(x - cx, y - cy);
    return -0.15 - d / 1200;
  }

  private resolveTurn(res: TurnResolution, shooter: PlayerId, shot?: ShotOutcome): void {
    if (this.awaitingFirstPlayerBreakShot && this.phase === 'PlayerTurn' && shot === undefined) {
      this.awaitingFirstPlayerBreakShot = false;
      this.aiCameraBlend = 0;
      this.aiCameraBlendTarget = 0;
      this.openingShotCameraReturnActive = false;
    }
    if (shot) {
      this.pushSound(AssetIds.soundBallsSettle, 0.22);
      if (shot.potted.length > 0) {
        this.pushSound(AssetIds.soundPocket, 0.42);
        setTimeout(() => this.pushSound(AssetIds.soundPocket, 0.22), 320);
      }
    }
    if (
      shot &&
      this.tutorialActive &&
      shot.potted.length > 0 &&
      !this.tutorialAimIntroFirstPotDelayApplied
    ) {
      this.tutorialAimIntroFirstPotDelayApplied = true;
      this.tutorialAimIntroFirstPotHoldSec = 2 + Math.random();
    }
    this.lastHudReason = res.reason;
    this.maybeTaunt(res, shooter, shot);
    this.emitTurnNotices(res);

    const streakOpp = this.getOpponent();
    if (
      hasPortraitReactionOpponent(streakOpp.id) &&
      shooter === 'player' &&
      !res.playerWon &&
      !res.playerLost
    ) {
      this.updatePortraitReactionStreakAfterMaybeTaunt(res);
    }

    if (res.respawnCueInKitchen) {
      this.physics.placeCueBallInKitchen();
    }

    if (res.playerWon || res.playerLost) {
      const endOpp = this.getOpponent();
      /**
       * Match-end portrait strip: cry art when they lose, laugh when you lose.
       */
      if (hasPortraitReactionOpponent(endOpp.id)) {
        if (res.playerWon) {
          this.matchEndOpponentPortrait = {
            portraitAssetId: portraitReactionAssetId(endOpp.id, 'cry'),
            text: pickPortraitReactionLine(endOpp.id, 'cry'),
          };
        } else {
          this.matchEndOpponentPortrait = {
            portraitAssetId: portraitReactionAssetId(endOpp.id, 'laught'),
            text: pickPortraitReactionLine(endOpp.id, 'laught'),
          };
        }
      } else {
        this.matchEndOpponentPortrait = null;
      }
      this.phase = 'MatchEnd';
      this.turnClock.stop();
      this.pendingAI = null;
      this.lastMatchWon = res.playerWon;
      this.aiCameraBlendTarget = 0;
      this.openingShotCameraReturnActive = false;
      this.awaitingBallInHandPlacement = false;
      this.ballInHandDragging = false;
      this.aiCueBallPlacementSlide = null;
      this.applyMatchResult(res);
      if (res.playerWon) this.pushSound(AssetIds.soundApplause, 0.6);
      this.opponentReaction = null;
      this.pushMusicStart(AssetIds.musicBgBetweenGames);
      return;
    }

    if (res.nextTurn !== shooter) {
      this.pushSound(AssetIds.soundTurnBell, 0.52);
    }

    this.activePlayer = res.nextTurn;
    if (this.activePlayer !== 'player') {
      this.openingShotCameraReturnActive = false;
    }
    this.pressureSent = false;

    const foulBallInHand =
      res.foul !== 'none' && !res.playerWon && !res.playerLost;
    this.ballInHandDragging = false;

    if (this.activePlayer === 'player') {
      this.phase = 'PlayerTurn';
      this.turnClock.beginTurn('player');
      this.pendingAI = null;
      this.aiCameraBlendTarget = 0;
      this.resetPlayerSpin();
      this.awaitingBallInHandPlacement = foulBallInHand;
    } else {
      this.phase = 'AITurn';
      this.turnClock.stop();
      this.awaitingBallInHandPlacement = false;
      if (foulBallInHand) {
        const fromX = this.physics.cue.pos.x;
        const fromY = this.physics.cue.pos.y;
        const target = new Vec2();
        if (
          this.physics.tryPickBestCueHandPosForAi(
            target,
            (pos) => this.scoreAiCueBallInHandPosition(pos.x, pos.y),
          )
        ) {
          this.aiCueBallPlacementSlide = {
            fromX,
            fromY,
            toX: target.x,
            toY: target.y,
            t: 0,
          };
          /**
           * Planı doğru pozisyondan hesapla: aksi halde AI slide öncesi eski cue konumuna göre
           * düşünür ve güçlü fırsatları kaçırır.
           */
          this.physics.cue.pos.set(target.x, target.y);
          this.physics.cue.vel.set(0, 0);
          this.physics.cue.english.set(0, 0);
        } else {
          this.physics.placeCueBallInKitchen();
        }
      }
      const plan = this.ai.compute({
        table: this.table,
        balls: this.physics.balls,
        cue: this.physics.cue,
        rules: this.rulesCtx,
      });
      this.pendingAI = plan;
      this.aiAimDisplayStart = plan.angle + (Math.random() - 0.5) * 0.52;
      const thinkSec = Math.min(AI_THINK_MAX_SEC, plan.thinkMs / 1000);
      this.aiThinkTotal = Math.max(0.001, thinkSec);
      this.aiThink = thinkSec;
      this.aiCameraBlendTarget =
        this.awaitingFirstAiShot || Math.random() >= AI_CAMERA_CINEMATIC_CHANCE ? 0 : 1;
    }

    if (
      hasPortraitReactionOpponent(this.getOpponent().id) &&
      this.phase === 'PlayerTurn' &&
      this.activePlayer === 'player'
    ) {
      this.maybePortraitLastBallReactionOnPlayerTurnStart();
    }

    this.refreshAimIntroEligibility();
    this.refreshTutorialEightBallIntroEligibility();
  }

  private playerIsOnEightBallOnly(): boolean {
    const ctx = this.rulesCtx;
    if (ctx.openTable || ctx.playerGroup == null) return false;
    const g = ctx.playerGroup;
    const hasOwnGroupBall = this.physics.balls.some(
      (b) => b.active && kindToGroup(b.kind) === g,
    );
    if (hasOwnGroupBall) return false;
    return this.physics.balls.some((b) => b.active && b.kind === 'eight');
  }

  /** First time per rack the player aims with only the 8 left to legally shoot (once per match). */
  private maybePortraitLastBallReactionOnPlayerTurnStart(): void {
    if (this.aimIntroActive || this.tutorialEightBallIntroActive) return;
    if (this.opponentReaction) return;
    if (this.portraitLastBallReactionUsed) return;
    if (!this.playerIsOnEightBallOnly()) return;
    const oid = this.getOpponent().id;
    const text = pickPortraitReactionLine(oid, 'lastBall');
    this.schedulePortraitReaction('lastBall', text, { force: true });
    this.portraitLastBallReactionUsed = true;
  }

  private updatePortraitReactionStreakAfterMaybeTaunt(res: TurnResolution): void {
    if (res.playerWon || res.playerLost) return;
    if (res.foul !== 'none' || !res.continueWithSamePlayer) {
      this.portraitReactionStreak = 0;
      return;
    }
    this.portraitReactionStreak += 1;
    if (this.opponentReaction || this.portraitReactionStreak !== 2) return;
    if (Math.random() > 0.42) return;
    const oid = this.getOpponent().id;
    const text = pickPortraitReactionLine(oid, 'scary');
    this.schedulePortraitReaction('scary', text, { force: true });
  }

  private portraitReactionRollProbability(badShot: boolean): number {
    const endgameLow = this.countActiveTableBallsExcludingCue() <= 2;
    if (badShot && endgameLow) return 0.52;
    if (badShot) return 0.36;
    return 0.18;
  }

  private schedulePortraitReaction(
    kind: PortraitReactionKind,
    text: string,
    opts: { force?: boolean; reactionProb?: number },
  ): void {
    const oid = this.getOpponent().id;
    if (!hasPortraitReactionOpponent(oid)) return;
    if (this.aimIntroActive || this.tutorialEightBallIntroActive) return;
    if (this.opponentReaction) return;
    const p = opts.force ? 1 : (opts.reactionProb ?? 0.36);
    if (Math.random() > p) return;

    const ttl = OPPONENT_REACTION_TTL_MIN_SEC + Math.random() * OPPONENT_REACTION_TTL_RANDOM_SEC;
    this.opponentReactionBeatSeq += 1;
    const portraitAssetId = portraitReactionAssetId(oid, kind);
    this.opponentReaction = {
      text,
      ttl,
      durationTotal: ttl,
      beatId: this.opponentReactionBeatSeq,
      portraitAssetId,
    };
    this.dialogue.clearBubble();
    this.dialogue.alignBubbleTtl(ttl);
    this.playRandomReactionSound();
  }

  private maybeTauntPortraitOpponent(
    res: TurnResolution,
    shooter: PlayerId,
    shot: ShotOutcome | undefined,
    behavior: OpponentDialogueBehavior,
  ): void {
    const opp = this.getOpponent();
    const oid = opp.id;

    if (shooter === 'ai' && res.foul === 'none' && res.continueWithSamePlayer) {
      if (Math.random() < behavior.aiGoodShotChance) {
        void this.tryDialogue('ai_good_shot', opp, behavior.silenceChance);
      }
      return;
    }

    if (shooter !== 'player') return;

    if (
      res.foul === 'none' &&
      res.continueWithSamePlayer &&
      shot &&
      shot.potted.length > 0 &&
      Math.random() < behavior.praiseChance
    ) {
      void this.tryDialogue('player_nice', opp, behavior.silenceChance * 0.35);
      const praiseLine = pickPortraitReactionLine(oid, 'smile');
      this.schedulePortraitReaction('smile', praiseLine, { reactionProb: 0.26 });
      return;
    }

    if (res.foul !== 'none') {
      if (res.foul === 'turn_timeout') {
        if (Math.random() < behavior.timeoutReactionChance) {
          const tk = randomTimeReactionKind();
          const lineKey = tk === 'time' ? 'time' : 'time2';
          const text = pickPortraitReactionLine(oid, lineKey);
          this.schedulePortraitReaction(tk, text, { force: true });
        }
        return;
      }
      if (res.foul === 'no_ball_hit') {
        if (Math.random() < behavior.noBallHitReactionChance) {
          const text = pickPortraitReactionLine(oid, 'ball');
          this.schedulePortraitReaction('ball', text, { force: true });
        }
        return;
      }
      if (Math.random() > behavior.tauntChance) return;
      if (Math.random() < behavior.silenceChance) return;
      const text = pickPortraitReactionLine(oid, 'smile');
      const rp = this.portraitReactionRollProbability(true) * behavior.foulReactionChance;
      this.schedulePortraitReaction('smile', text, { reactionProb: rp });
      void this.tryDialogue('player_foul', opp, behavior.silenceChance);
      return;
    }

    if (
      !res.continueWithSamePlayer &&
      res.nextTurn === 'ai' &&
      shot &&
      shot.potted.length === 0
    ) {
      if (Math.random() > behavior.tauntChance) return;
      if (Math.random() < behavior.silenceChance) return;
      const text = pickPortraitReactionLine(oid, 'laught');
      const rp = this.portraitReactionRollProbability(true) * behavior.missReactionChance;
      this.schedulePortraitReaction('laught', text, { reactionProb: rp });
      void this.tryDialogue('player_miss', opp, behavior.silenceChance);
    }
  }

  private tickAiCameraBlend(dt: number): void {
    const target = this.aiCameraBlendTarget;
    let k = target < this.aiCameraBlend ? AI_CAMERA_BLEND_EXP_RETURN : AI_CAMERA_BLEND_EXP;
    if (this.openingShotCameraReturnActive && target < this.aiCameraBlend) {
      k = OPENING_BREAK_CAMERA_BLEND_RETURN_EXP;
    }
    const a = 1 - Math.exp(-k * Math.max(0, dt));
    this.aiCameraBlend += (target - this.aiCameraBlend) * a;
    if (Math.abs(this.aiCameraBlend - target) < 0.002) this.aiCameraBlend = target;
    if (this.openingShotCameraReturnActive && this.aiCameraBlend <= 0.002) {
      this.openingShotCameraReturnActive = false;
    }
  }

  /** Sarı pop-up bildirim — grup atanması veya faul olduğunda kısa bir süre gösterilir. */
  private pushHudNotice(kind: 'group' | 'foul', text: string, durationSec = 1.85): void {
    this.hudNoticeBeatSeq += 1;
    this.hudNotice = {
      kind,
      text,
      ttl: durationSec,
      durationTotal: durationSec,
      beatId: this.hudNoticeBeatSeq,
    };
  }

  /** Tur sonucu üzerinden grup atama / faul popup'larını yayınlar. */
  private emitTurnNotices(res: TurnResolution): void {
    if (res.playerWon || res.playerLost) return;
    if (res.assignedGroup) {
      const playerGroup = res.assignedGroup.player;
      const text = playerGroup === 'solid' ? "YOU'RE SOLIDS" : "YOU'RE STRIPES";
      this.pushHudNotice('group', text, 2.1);
      return;
    }
    if (res.foul !== 'none') {
      this.pushHudNotice('foul', 'FOUL!', 1.7);
    }
  }

  private maybeTaunt(res: TurnResolution, shooter: PlayerId, shot?: ShotOutcome): void {
    const opp = this.getOpponent();
    const behavior = getOpponentDialogueBehavior(opp.id);

    if (res.playerWon || res.playerLost) return;

    if (hasPortraitReactionOpponent(opp.id)) {
      this.maybeTauntPortraitOpponent(res, shooter, shot, behavior);
      return;
    }

    if (
      shooter === 'player' &&
      res.foul === 'none' &&
      res.continueWithSamePlayer &&
      shot &&
      shot.potted.length > 0 &&
      Math.random() < behavior.praiseChance
    ) {
      void this.tryDialogue('player_nice', opp, behavior.silenceChance * 0.35);
      return;
    }

    if (shooter === 'player' && res.foul !== 'none') {
      if (Math.random() > behavior.tauntChance) return;
      const sc = res.foul === 'turn_timeout' ? behavior.silenceChance * 0.45 : behavior.silenceChance;
      const spoken = this.tryDialogue('player_foul', opp, sc);
      this.maybeScheduleOpponentReaction(spoken, res, shooter, shot);
      return;
    }

    if (
      shooter === 'player' &&
      res.foul === 'none' &&
      !res.continueWithSamePlayer &&
      res.nextTurn === 'ai' &&
      shot &&
      shot.potted.length === 0
    ) {
      if (Math.random() > behavior.tauntChance) return;
      const spoken = this.tryDialogue('player_miss', opp, behavior.silenceChance);
      this.maybeScheduleOpponentReaction(spoken, res, shooter, shot);
    }

    if (
      shooter === 'ai' &&
      res.foul === 'none' &&
      res.continueWithSamePlayer &&
      Math.random() < behavior.aiGoodShotChance
    ) {
      void this.tryDialogue('ai_good_shot', opp, behavior.silenceChance);
    }
  }

  private countActiveTableBallsExcludingCue(): number {
    return this.physics.balls.filter((b) => b.active && b.kind !== 'cue').length;
  }

  /**
   * After your shot, sometimes show a center “reaction portrait” + the same taunt line.
   * Random, only on critical beats: bad outcome or very few balls left on the table.
   */
  private maybeScheduleOpponentReaction(
    spoken: string | null,
    res: TurnResolution,
    shooter: PlayerId,
    shot: ShotOutcome | undefined,
  ): void {
    if (!spoken || shooter !== 'player') return;

    const foulBad = res.foul !== 'none';
    const dryMiss =
      res.foul === 'none' &&
      !res.continueWithSamePlayer &&
      res.nextTurn === 'ai' &&
      shot != null &&
      shot.potted.length === 0;
    const badShot = foulBad || dryMiss;
    const endgameLow = this.countActiveTableBallsExcludingCue() <= 2;
    if (!badShot && !endgameLow) return;

    let p = 0.32;
    if (badShot && endgameLow) p = 0.52;
    else if (badShot) p = 0.36;
    else p = 0.18;

    if (Math.random() > p) return;
    /** Reaction portrait + text on screen; AI waits until this elapses. */
    const ttl = OPPONENT_REACTION_TTL_MIN_SEC + Math.random() * OPPONENT_REACTION_TTL_RANDOM_SEC;
    this.opponentReactionBeatSeq += 1;
    this.opponentReaction = {
      text: spoken,
      ttl,
      durationTotal: ttl,
      beatId: this.opponentReactionBeatSeq,
      portraitAssetId: null,
    };
    this.dialogue.alignBubbleTtl(ttl);
    this.playRandomReactionSound();
  }

  private tryDialogue(cat: DialogueCategory, opp: AICharacterProfile, silentChance?: number): string | null {
    return this.dialogue.trySpeak(cat, {
      personalitySilentChance: silentChance,
      opponentId: opp.id,
    });
  }

  /** One of `public/audio/Reaction_{1,2,3}.wav` when the center portrait reaction is shown. */
  private playRandomReactionSound(): void {
    const clips = [AssetIds.soundReaction1, AssetIds.soundReaction2, AssetIds.soundReaction3] as const;
    const pick = clips[Math.floor(Math.random() * clips.length)]!;
    this.pushSound(pick, 0.88);
  }

  getSnapshot(): GameSnapshot {
    return {
      phase: this.phase,
      levelIndex: this.levelIndex,
      activePlayer: this.activePlayer,
      turnTime01:
        this.phase === 'PlayerTurn'
          ? this.turnClock.progress01()
          : this.phase === 'AITurn'
            ? Math.max(0, Math.min(1, this.aiThink / this.aiThinkTotal))
            : 1,
      dialogue: (() => {
        const b = this.dialogue.getBubble();
        return b ? { text: b.text, side: 'ai' as const } : null;
      })(),
    };
  }

  getHudMeta(): { reason: string; opponent: AICharacterProfile; groups: RulesContext } {
    return { reason: this.lastHudReason, opponent: this.getOpponent(), groups: this.rulesCtx };
  }

  /** Potted object balls for HUD chips (excludes 8; eight is endgame). */
  /** Pot strip row labels: empty until groups are chosen; then spaces only (icons carry meaning). */
  private getPotTargetLabels(): { opponent: string; player: string } {
    const ctx = this.rulesCtx;

    if (ctx.openTable || ctx.playerGroup == null || ctx.aiGroup == null) {
      return { opponent: '', player: '' };
    }
    const potLabelSpacer = '    ';
    return { opponent: potLabelSpacer, player: potLabelSpacer };
  }

  getPotHudState(): PotHudState {
    const potted = this.physics.balls.filter(
      (b) => !b.active && b.kind !== 'cue' && b.kind !== 'eight',
    );
    const sortN = (a: number, b: number) => a - b;
    const ctx = this.rulesCtx;
    if (ctx.openTable || !ctx.playerGroup || !ctx.aiGroup) {
      const solids = potted
        .filter((b) => b.kind === 'solid')
        .map((b) => b.number)
        .sort(sortN);
      const stripes = potted
        .filter((b) => b.kind === 'stripe')
        .map((b) => b.number)
        .sort(sortN);
      return { kind: 'open', solids, stripes };
    }
    const pg = ctx.playerGroup;
    const ag = ctx.aiGroup;
    const player = potted
      .filter((b) => kindToGroup(b.kind) === pg)
      .map((b) => b.number)
      .sort(sortN);
    const ai = potted
      .filter((b) => kindToGroup(b.kind) === ag)
      .map((b) => b.number)
      .sort(sortN);
    return { kind: 'assigned', player, ai };
  }

  getHudState(): HudState {
    const snap = this.getSnapshot();
    const meta = this.getHudMeta();
    const pot = this.getPotHudState();
    const potTargets = this.getPotTargetLabels();
    const eightPocketed = !this.physics.balls.some((b) => b.kind === 'eight' && b.active);
    const profile = this.profileView();
    const prompts: { id: string; text: string; priority: number }[] = [];
    if (this.awaitingBallInHandPlacement && this.phase === 'PlayerTurn') {
      prompts.push({
        id: 'ball_in_hand',
        text: 'Drag the cue ball to place it — then shoot.',
        priority: 2,
      });
    }
    if (snap.dialogue != null) {
      prompts.push({ id: 'dialogue', text: snap.dialogue.text, priority: 1 });
    }

    const panels: string[] = [];
    if (snap.phase === 'MainMenu') panels.push('menu');
    if (snap.phase === 'MatchEnd') panels.push('end');
    if (snap.phase !== 'MainMenu' && snap.phase !== 'MatchEnd') panels.push('hud');

    const nextOpponentProfile =
      CAREER_OPPONENTS[
        Math.min(this.levelIndex + 1, CAREER_OPPONENTS.length - 1)
      ];

    return {
      scoreText: meta.reason,
      timerText: '',
      healthPercent: 0,
      boostPercent: 0,
      visiblePanels: panels,
      prompts,
      /**
       * Tournaments don't pay per-match — only the championship bonus.
       * Reflect this in the HUD so the end-card reward chip reads `+0`
       * for mid-tournament wins and the breakdown stays honest.
       */
      coinRewardWin: this.tournament != null ? 0 : COIN_REWARD_WIN,
      coinRewardLoss: this.tournament != null ? 0 : COIN_REWARD_LOSS,
      profile: (() => {
        const acct = accountFromXp(profile.xp);
        return {
          coins: profile.coins,
          wins: profile.wins,
          losses: profile.losses,
          winRate: profile.winRate,
          currentStreak: profile.currentStreak,
          bestStreak: profile.bestStreak,
          rankName: profile.rank.name,
          rankIndex: profile.rank.index,
          nextRankName: profile.rank.nextName,
          nextRankAtWins: profile.rank.nextAtWins,
          rankProgress01: profile.rank.progress01,
          ownedCueIds: profile.ownedCueIds,
          equippedCueId: profile.equippedCueId,
          equippedCueStats: this.profile.equippedCueStats,
          xp: profile.xp,
          accountLevel: acct.level,
          xpInLevel: acct.xpInLevel,
          xpToNextLevel: acct.xpToNextLevel,
          accountProgress01: acct.progress01,
          highestLevelIndex: profile.highestLevelIndex,
        };
      })(),
      shop: {
        catalog: SHOP_CUE_CATALOG,
      },
      tournament: this.tournament
        ? (() => {
            const t = this.tournament!;
            const def = findTournament(t.defId);
            const opponentMeta = t.opponents.map((slot) => {
              const profile = CAREER_OPPONENTS.find((o) => o.id === slot.id);
              const tier = profile
                ? this.scaleOpponentTier(profile.tier, slot)
                : slot.fixedTier ?? slot.minTier ?? 'apprentice';
              return {
                id: slot.id,
                name: profile?.name ?? slot.id,
                tier,
              };
            });
            return {
              active: t.status === 'active',
              currentRound: t.currentRound,
              size: t.opponents.length,
              opponents: opponentMeta,
              record: t.record.slice(),
              status: t.status,
              defId: t.defId,
              defName: def?.name ?? t.defId,
              defAccent: def?.accent ?? t.defId,
              entryFeeCoins: def?.entryFeeCoins ?? 0,
              championBonusCoins: def?.championBonusCoins ?? 0,
              championBonusXp: def?.championBonusXp ?? 0,
            };
          })()
        : undefined,
      tournamentCatalog: listTournamentViews(),
      nextOpponent:
        nextOpponentProfile != null
          ? {
              id: nextOpponentProfile.id,
              name: nextOpponentProfile.name,
              tier: nextOpponentProfile.tier,
            }
          : undefined,
      eightBall: {
        phase: snap.phase,
        levelIndex: snap.levelIndex,
        activePlayer: snap.activePlayer,
        turnTime01: snap.turnTime01,
        dialogueText: snap.dialogue?.text ?? null,
        reason: meta.reason,
        opponentId: meta.opponent.id,
        opponentName: meta.opponent.name,
        opponentTier: meta.opponent.tier,
        opponentAccuracy: meta.opponent.accuracy,
        spinX: this.spinX,
        spinY: this.spinY,
        lastMatchWon: this.lastMatchWon,
        pot,
        potTargetLabelOpponent: potTargets.opponent,
        potTargetLabelPlayer: potTargets.player,
        showPotProgressStrip: snap.phase !== 'MainMenu' && snap.phase !== 'MatchEnd',
        eightPocketed,
        rulesOpenTable: meta.groups.openTable,
        playerGroup: meta.groups.playerGroup,
        aiGroup: meta.groups.aiGroup,
        opponentReaction: this.opponentReaction
          ? {
              text: this.opponentReaction.text,
              portraitAssetId: this.opponentReaction.portraitAssetId,
              durationSec: this.opponentReaction.durationTotal,
              beatId: this.opponentReaction.beatId,
            }
          : null,
        powerBarHint:
          this.awaitingFirstPlayerBreakShot &&
          this.activePlayer === 'player' &&
          snap.phase === 'PlayerTurn' &&
          !this.opponentReaction &&
          !this.awaitingBallInHandPlacement &&
          this.physics.cue.active &&
          !this.isAimIntroActive(),
        tutorialShootHint:
          this.tutorialShootHint &&
          this.tutorialActive &&
          this.activePlayer === 'player' &&
          snap.phase === 'PlayerTurn' &&
          !this.opponentReaction &&
          !this.awaitingBallInHandPlacement &&
          this.physics.cue.active &&
          !this.isAimIntroActive(),
        tutorialActive: this.tutorialActive,
        powerBarPull01:
          snap.phase === 'PlayerTurn' &&
          this.activePlayer === 'player' &&
          !this.opponentReaction &&
          !this.awaitingBallInHandPlacement &&
          this.physics.cue.active &&
          !this.isAimIntroActive() &&
          this.poolInput.strokeMode === 'charge'
            ? this.poolInput.getChargeVisual()
            : 0,
        matchEndOpponentPortrait:
          snap.phase === 'MatchEnd' ? this.matchEndOpponentPortrait : null,
        hudNotice: this.hudNotice
          ? {
              kind: this.hudNotice.kind,
              text: this.hudNotice.text,
              beatId: this.hudNotice.beatId,
              durationSec: this.hudNotice.durationTotal,
            }
          : null,
        aimIntro:
          this.aimIntroActive &&
          snap.phase === 'PlayerTurn' &&
          !this.awaitingBallInHandPlacement &&
          this.physics.cue.active
            ? this.tutorialActive
              ? {
                  visible: true,
                  title: 'Aim your shot',
                  body: 'Drag on the table to turn the cue. The hand is a hint—the cue follows.',
                  confirmLabel: 'Got it',
                }
              : {
                  visible: true,
                  title: 'How to aim',
                  body: 'Drag on the table around the cue ball. Tap Got it to continue.',
                  confirmLabel: 'Got it',
                }
            : undefined,
        eightBallIntro:
          this.tutorialEightBallIntroActive &&
          this.tutorialActive &&
          snap.phase === 'PlayerTurn' &&
          this.activePlayer === 'player' &&
          !this.awaitingBallInHandPlacement &&
          this.physics.cue.active
            ? {
                visible: true,
                title: 'Pocket the 8',
                body:
                  'Your group is cleared. Aim by dragging on the table—line the 8 toward the pocket you want, then shoot from the power bar.',
                confirmLabel: 'Got it',
              }
            : undefined,
      },
      cueBallInHandCursorHint:
        this.awaitingBallInHandPlacement && this.phase === 'PlayerTurn' && this.physics.cue.active,
    };
  }

  /** F tuşu overlay — rakip / sinematik kamera parametreleri. */
  getOpponentCameraDebug(viewport: ViewportSize, hints?: RenderRuntimeHints) {
    const c = this.computeCameraFraming(viewport, hints);
    const d = (r: number) => (r * 180) / Math.PI;
    return {
      phase: this.phase,
      activePlayer: this.activePlayer,
      useOpponentFraming: c.useAiShotCamera,
      cinematicBlend: c.blend,
      cinematicBlendTarget: this.aiCameraBlendTarget,
      preset: AI_CAMERA_PRESET,
      playerPolarDeg: d(CAMERA_PLAYER_POLAR_RAD),
      playerAzimuthDeg: d(CAMERA_PLAYER_AZIMUTH_RAD),
      aiPolarDeg: d(c.aiPolar),
      aiAzimuthDeg: d(c.aiAzimuth),
      finalPolarDeg: d(c.polar),
      finalAzimuthDeg: d(c.azimuth),
      yawMix: c.yawMix,
      yawExtraDeg: d(c.yawExtra),
      dist: Math.round(c.dist * 10) / 10,
      camPos: { x: Math.round(c.camPos.x), y: Math.round(c.camPos.y), z: Math.round(c.camPos.z) },
      aimY: Math.round(c.aimY * 100) / 100,
    };
  }

  private computeCameraFraming(viewport: ViewportSize, hints?: RenderRuntimeHints): {
    dist: number;
    aimY: number;
    lookAtZ: number;
    useAiShotCamera: boolean;
    blend: number;
    aiPolar: number;
    aiAzimuth: number;
    polar: number;
    azimuth: number;
    yawMix: number;
    yawExtra: number;
    camPos: ReturnType<typeof vec3>;
  } {
    const t = this.table;
    const tw = t.width;
    const th = t.height;
    const cue = this.physics.cue;
    const aspect = Math.max(0.2, Math.min(3, viewport.widthPx / Math.max(1, viewport.heightPx)));
    const base = Math.max(tw, th);
    const dist = base * (1.95 + 0.55 * (1 / aspect - 1)) * CAMERA_TABLE_DISTANCE_SCALE;
    const aimY = cue.radius + 0.15;
    const useAiShotCamera =
      this.activePlayer === 'ai' && (this.phase === 'AITurn' || this.phase === 'BallSimulation');
    const debugOppShotCam =
      hints?.debugOpponentShotCamera === true &&
      (this.phase === 'PlayerTurn' || this.phase === 'AITurn' || this.phase === 'BallSimulation');
    /** Oyuncu turunda da `aiCameraBlend` işler; böylece rakip kadrajından yumuşak dönüş olur. */
    /** O tuşu: tam sinematik rakip kadrajı (normal oyunda `aiCameraBlend === 1` anına denk). */
    /** Maç başı: break öncesi ilk oyuncu turunda preset A kadrajı (blend 1). */
    const openingIntroCameraActive =
      (this.awaitingFirstPlayerBreakShot || this.tutorialOpeningCameraActive) &&
      this.activePlayer === 'player' &&
      this.phase === 'PlayerTurn';
    const blend = debugOppShotCam
      ? 1
      : openingIntroCameraActive
        ? 1
        : this.aiCameraBlend;
    const aiPolar =
      AI_CAMERA_PRESET === 'b' ? AI_CAMERA_PRESET_B_POLAR_RAD : AI_CAMERA_PRESET_A_POLAR_RAD;
    const aiAzimuth =
      AI_CAMERA_PRESET === 'b' ? AI_CAMERA_PRESET_B_AZIMUTH_RAD : AI_CAMERA_PRESET_A_AZIMUTH_RAD;
    const polar =
      CAMERA_PLAYER_POLAR_RAD + (aiPolar - CAMERA_PLAYER_POLAR_RAD) * blend;
    const yawMix = 0.28 + 0.72 * blend;
    const yawExtra = AI_CAMERA_OPPONENT_YAW_OFFSET_RAD * yawMix;
    const azimuth = lerpAngleRad(CAMERA_PLAYER_AZIMUTH_RAD, aiAzimuth, blend) + yawExtra;
    const sp = Math.sin(polar);
    const cp = Math.cos(polar);
    const ca = Math.cos(azimuth);
    const sa = Math.sin(azimuth);
    const openingDecorT = openingIntroCameraActive
        ? 1
        : this.openingShotCameraReturnActive && this.activePlayer === 'player'
          ? this.aiCameraBlend
          : 0;
    const yLift = openingDecorT > 0 ? AI_CAMERA_OPENING_BREAK_Y_OFFSET * openingDecorT : 0;
    const lookAtZ =
      openingDecorT > 0 ? -(th * 0.5) * AI_CAMERA_OPENING_BREAK_LOOK_AT_Z_SCALE * openingDecorT : 0;
    const camPos = vec3(dist * sp * ca, dist * cp + yLift, dist * sp * sa);
    return {
      dist,
      aimY,
      lookAtZ,
      useAiShotCamera,
      blend,
      aiPolar,
      aiAzimuth,
      polar,
      azimuth,
      yawMix,
      yawExtra,
      camPos,
    };
  }

  getRenderWorldState(viewport: ViewportSize, hints: RenderRuntimeHints): RenderWorldState {
    const t = this.table;
    const tw = t.width;
    const th = t.height;
    const cue = this.physics.cue;
    const camFr = this.computeCameraFraming(viewport, hints);
    const { aimY, camPos, lookAtZ } = camFr;
    const camera: RenderWorldState['camera'] = {
      mode: 'fixed',
      position: camPos,
      target: vec3(0, aimY, lookAtZ),
      fovDeg: CAMERA_FOV_DEG,
      near: CAMERA_NEAR,
      far: CAMERA_FAR,
      up: vec3(0, 0, -1),
    };

    const objects: WorldObjectState[] = [];
    const pg = this.rulesCtx.playerGroup;
    const highlightOwn =
      this.tutorialActive &&
      this.phase === 'PlayerTurn' &&
      !this.awaitingBallInHandPlacement &&
      !this.opponentReaction &&
      pg != null;

    for (const b of this.physics.balls) {
      const r = b.radius;
      const pos = vec3(b.pos.x - tw / 2, r + 0.15, b.pos.y - th / 2);
      const grp = kindToGroup(b.kind);
      const tags: readonly string[] | undefined = (() => {
        if (!highlightOwn || grp == null || grp !== pg) return undefined;
        if (b.number === 1) return ['tutorialHighlight', 'tutorialHL:red'];
        if (b.number === 3) return ['tutorialHighlight', 'tutorialHL:orange'];
        return ['tutorialHighlight'];
      })();
      objects.push({
        objectId: `ball.${b.id}`,
        templateId: ballTemplateId(b.kind, b.number),
        transform: transformAt(pos, uniformScale(r)),
        visible: b.active,
        lifetime: 'persistent',
        replication: 'sharedGameplay',
        renderLayer: 'world',
        tableVelocity: { x: b.vel.x, y: b.vel.y },
        tags,
      });
    }

    const opponentId = this.getOpponent().id;
    if (this.phase !== 'MainMenu' && this.phase !== 'MatchEnd') {
      const feltY = cue.radius + 0.15 + OPPONENT_TUNG_WORLD_Y_OFFSET;
      /** New FBX rigs sit visually forward; push them deeper behind the top rail. */
      const extraBackZ =
        opponentId === 'gattotto_otto' ? 120 : opponentId === 'torta_tartaruga' ? 96 : 0;
      const tz = -(th * 0.5) - OPPONENT_TUNG_PLACEHOLDER_PAST_RAIL_Z - extraBackZ;
      if (opponentId === 'tungo') {
        objects.push({
          objectId: 'opponent.tungPlaceholder',
          templateId: AssetIds.opponentTungPlaceholder,
          transform: transformAt(vec3(OPPONENT_TUNG_PLACEHOLDER_OFFSET_X, feltY, tz), uniformScale(1)),
          visible: true,
          lifetime: 'persistent',
          replication: 'localCosmetic',
          renderLayer: 'world',
        });
      } else if (opponentId === 'gattotto_otto') {
        objects.push({
          objectId: 'opponent.gattottoPlaceholder',
          templateId: AssetIds.opponentGattottoPlaceholder,
          transform: transformAt(vec3(OPPONENT_TUNG_PLACEHOLDER_OFFSET_X, feltY, tz), uniformScale(1)),
          visible: true,
          lifetime: 'persistent',
          replication: 'localCosmetic',
          renderLayer: 'world',
        });
      } else if (opponentId === 'torta_tartaruga') {
        const tortaFeltY = feltY + OPPONENT_TORTA_TARTARUGA_WORLD_Y_OFFSET_EXTRA;
        objects.push({
          objectId: 'opponent.tortaPlaceholder',
          templateId: AssetIds.opponentTortaPlaceholder,
          transform: transformAt(vec3(OPPONENT_TUNG_PLACEHOLDER_OFFSET_X, tortaFeltY, tz), uniformScale(1)),
          visible: true,
          lifetime: 'persistent',
          replication: 'localCosmetic',
          renderLayer: 'world',
        });
      }
    }

    const aiPlan = this.phase === 'AITurn' && cue.active ? this.getAiCuePreview() : null;
    const aimVis = this.poolInput.getStrokeAimForRender();
    const effectiveAim = aiPlan ? aiPlan.angle : aimVis;
    const chargePull = aiPlan
      ? Math.max(0, Math.min(1, aiPlan.power01 * 0.92))
      : Math.max(0, Math.min(1, this.poolInput.strokeMode === 'charge' ? this.poolInput.charge01 : 0));

    const showAim =
      cue.active &&
      this.phase !== 'BallSimulation' &&
      !this.awaitingBallInHandPlacement &&
      ((this.phase === 'PlayerTurn') || (this.phase === 'AITurn' && aiPlan != null));
    const showCue = showAim;

    const cueStickY = cue.radius + 0.2;
    const bx = cue.pos.x - tw / 2;
    const bz = cue.pos.y - th / 2;
    const by = cueStickY;
    const dirx = Math.cos(effectiveAim);
    const dirz = Math.sin(effectiveAim);
    const pull = chargePull * 125;
    const shaftLen = 292;
    /**
     * Visual stick has ferrule (6) + leather tip (14) past the shaft top.
     * Push the stick back by that amount + a small breathing gap so the tip
     * kisses the cue ball instead of clipping into it at idle aim.
     */
    const CUE_TIP_OVERHANG = 20;
    const CUE_IDLE_GAP = 4;
    /**
     * Imported cue mesh tip sits slightly farther along +Y than the old procedural stack;
     * without extra back-offset the stick reads as inside the cue ball at idle aim.
     */
    const CUE_STICK_EXTRA_BACK_OFFSET = 45;
    const centerDist =
      cue.radius +
      shaftLen * 0.5 +
      CUE_TIP_OVERHANG +
      CUE_IDLE_GAP +
      CUE_STICK_EXTRA_BACK_OFFSET +
      pull;
    const cx = bx - dirx * centerDist;
    const cz = bz - dirz * centerDist;

    const stickQuat = cueStickQuatFromDirection(dirx, dirz);
    objects.push({
      objectId: 'cue.stick',
      templateId: AssetIds.cueStick,
      transform: {
        position: vec3(cx, by, cz),
        rotation: stickQuat,
        scale: uniformScale(1),
      },
      visible: showCue,
      lifetime: 'persistent',
      replication: 'localCosmetic',
      renderLayer: 'vfx',
    });

    if (this.aimIntroActive && cue.active && this.phase === 'PlayerTurn') {
      const aimYHint = cue.radius + 0.2;
      const wx = this.aimIntroDemoX - tw / 2;
      const wz = this.aimIntroDemoY - th / 2;
      objects.push({
        objectId: 'aimIntro.demoCursor',
        templateId: AssetIds.aimIntroFinger,
        /** Sprite scales in scene units; keep group scale at 1. */
        transform: transformAt(vec3(wx, aimYHint, wz), uniformScale(1)),
        visible: true,
        lifetime: 'persistent',
        replication: 'localCosmetic',
        renderLayer: 'vfx',
      });
    }

    const polylines: PolylineObjectState[] = [];
    if (showAim) {
      const preview = computeAimPreview(this.physics.balls, cue, effectiveAim, this.rulesCtx);
      const lineY = cue.radius + 0.2;
      polylines.push(
        segmentToPolyline(
          'line.aim.main',
          AssetIds.lineAim,
          preview.cueToHit,
          lineY,
          tw,
          th,
          aiPlan ? 0xb8e8ff : 0xffffff,
          aiPlan ? 0.5 : 0.42,
        ),
      );
      const hasGhost = preview.objectGhost != null && preview.cueGhost != null;
      if (hasGhost) {
        const gObj = aiPlan ? 0xffcc88 : 0xffdd88;
        const gCue = aiPlan ? 0xb8e8ff : 0xffffff;
        polylines.push(
          segmentToPolyline(
            'line.ghost.object',
            AssetIds.lineGhostObject,
            preview.objectGhost!,
            lineY,
            tw,
            th,
            gObj,
            0.55,
          ),
          segmentToPolyline(
            'line.ghost.cue',
            AssetIds.lineGhostCue,
            preview.cueGhost!,
            lineY,
            tw,
            th,
            gCue,
            0.38,
          ),
        );
      }
      if (preview.cueImpactPoint) {
        polylines.push(
          contactRingPolyline(
            'line.aim.contactRing',
            AssetIds.lineGhostCue,
            preview.cueImpactPoint.x,
            preview.cueImpactPoint.y,
            cue.radius,
            lineY,
            tw,
            th,
            aiPlan ? '#cbefff' : '#ffffff',
            aiPlan ? 0.52 : 0.6,
          ),
        );
      }

      if (this.tutorialActive && this.phase === 'PlayerTurn' && !aiPlan && !this.opponentReaction) {
        const first = findFirstRayHitBall(this.physics.balls, cue, effectiveAim, this.rulesCtx);
        const meta: BallMeta[] = this.physics.balls.map((bb) => ({
          id: bb.id,
          number: bb.number,
          kind: bb.kind,
          active: bb.active,
        }));
        if (
          first &&
          !isFirstHitLegalForAimPreview(this.rulesCtx, 'player', first, meta)
        ) {
          polylines.push(
            ...tutorialIllegalFirstHitXPolylines(preview.cueToHit.x1, preview.cueToHit.y1, tw, th, lineY),
          );
        }
      }
    }

    if (hints.physicsDebugVisible) {
      polylines.push(...buildPhysicsDebugLines(t, tw, th, cue.radius));
    }

    /** Power lives in HUD slider; no 3D “pull on cue” hand sprite. */
    const cuePullHandHint = false;

    const cueBallInHandCursorHint =
      this.awaitingBallInHandPlacement && this.phase === 'PlayerTurn' && this.physics.cue.active;

    return {
      camera,
      objects,
      polylines,
      tableSpace: { width: tw, height: th },
      ambientColorHex: '#0b0f14',
      cuePullHandHint,
      cueBallInHandCursorHint,
      opponentCueId: this.getOpponent().cueId,
      playerCueId: this.profile.equippedCueId,
      activeCueId:
        this.activePlayer === 'player'
          ? this.profile.equippedCueId
          : this.getOpponent().cueId,
    };
  }

  /**
   * Faul sonrası ball-in-hand: beyaz üzerinden sürükle–bırak; pointer olayları `PoolInputState`’e gitmez.
   */
  private filterBallInHandPointerCommands(
    commands: readonly GameInputCommand[],
  ): GameInputCommand[] {
    if (!this.awaitingBallInHandPlacement || this.phase !== 'PlayerTurn' || !this.physics.cue.active) {
      return [...commands];
    }
    const out: GameInputCommand[] = [];
    const pickupR = this.physics.cue.radius * 2.85;
    for (const c of commands) {
      if (c.type !== 'pointer.table') {
        out.push(c);
        continue;
      }
      const { phase, tableX, tableY } = c;
      if (phase === 'down') {
        const dx = tableX - this.physics.cue.pos.x;
        const dy = tableY - this.physics.cue.pos.y;
        if (dx * dx + dy * dy <= pickupR * pickupR) {
          this.ballInHandDragging = true;
        } else {
          /** Boş alana tık: beyazı taşımadan onay (ör. mutfak konumu uygunsa). */
          this.awaitingBallInHandPlacement = false;
          this.refreshAimIntroEligibility();
        }
        continue;
      }
      if (phase === 'move' && this.ballInHandDragging) {
        this.physics.moveCueBallForBallInHand(tableX, tableY);
        continue;
      }
      if (phase === 'up') {
        if (this.ballInHandDragging) {
          this.physics.moveCueBallForBallInHand(tableX, tableY);
          this.ballInHandDragging = false;
          this.awaitingBallInHandPlacement = false;
          this.refreshAimIntroEligibility();
        }
        continue;
      }
      if (phase === 'cancel') {
        this.ballInHandDragging = false;
        continue;
      }
    }
    return out;
  }

  private applyMenuCommands(commands: readonly GameInputCommand[]): void {
    for (const c of commands) {
      if (c.type === 'aimIntro.dismiss') {
        this.dismissAimIntro();
        continue;
      }
      if (c.type === 'tutorialEightIntro.dismiss') {
        this.dismissTutorialEightBallIntro();
        continue;
      }
      if (c.type === 'menu.restart') {
        if (this.tutorialActive) {
          this.writeTutorialCompleted();
          this.tutorialActive = false;
          this.tutorialShootHint = false;
        }
        /** Tournament mode never offers a Rematch from the end-card, so this is always casual. */
        this.beginCareer(this.levelIndex);
      } else if (c.type === 'menu.next') {
        if (this.tutorialActive) {
          this.writeTutorialCompleted();
          this.tutorialActive = false;
          this.tutorialShootHint = false;
        }
        if (this.tournament && this.tournament.status === 'active') {
          /** Tournament wins flow through bracket overlay → `tournament.advance`; ignore here. */
          continue;
        }
        this.bumpLevelAfterVictory();
        this.beginCareer(this.levelIndex);
      } else if (c.type === 'menu.home') {
        if (this.tutorialActive) {
          this.writeTutorialCompleted();
          this.tutorialActive = false;
          this.tutorialShootHint = false;
        }
        this.beginCareer(this.levelIndex);
      } else if (c.type === 'menu.play' || c.type === 'menu.startCasual') {
        if (this.phase === 'MainMenu') {
          this.tournament = null;
          this.beginCareer(this.levelIndex);
        }
      } else if (c.type === 'menu.startTournament') {
        if (this.phase === 'MainMenu') {
          this.beginTournament(c.tournamentId as TournamentTier);
        }
      } else if (c.type === 'tournament.advance') {
        this.advanceTournament();
      } else if (c.type === 'tournament.exit') {
        /** End-card uses `tournament.exit` like home — must also finish first-run tutorial or `tutorialActive` sticks forever. */
        if (this.tutorialActive) {
          this.writeTutorialCompleted();
          this.tutorialActive = false;
          this.tutorialShootHint = false;
        }
        this.tournament = null;
        this.phase = 'MainMenu';
        this.aimIntroActive = false;
        this.tutorialEightBallIntroActive = false;
        this.turnClock.stop();
        this.eventQueue.length = 0;
        this.pushMusicStart(AssetIds.musicBgBetweenGames);
      } else if (c.type === 'shop.buyCue') {
        this.buyCue(c.cueId);
      } else if (c.type === 'shop.equipCue') {
        this.equipCue(c.cueId);
      }
    }
  }

  /** Debug: immediately show a reaction beat (portrait + line). */
  debugShowReaction(): void {
    if (this.phase === 'MatchEnd') return;
    const ttl = OPPONENT_REACTION_TTL_MIN_SEC + Math.random() * OPPONENT_REACTION_TTL_RANDOM_SEC;
    this.opponentReactionBeatSeq += 1;
    const opp = this.getOpponent();
    const portraitAssetId = defaultPortraitReactionAssetId(opp.id);
    this.opponentReaction = {
      text: 'Debug reaction',
      ttl,
      durationTotal: ttl,
      beatId: this.opponentReactionBeatSeq,
      portraitAssetId,
    };
    this.dialogue.clearBubble();
    this.dialogue.alignBubbleTtl(ttl);
    this.playRandomReactionSound();
  }

  /** Debug: end match immediately as win/lose for the player. */
  debugForceMatchEnd(playerWins: boolean): void {
    if (this.phase === 'MatchEnd') return;
    const res: TurnResolution = {
      nextTurn: 'player',
      continueWithSamePlayer: false,
      foul: 'none',
      playerWon: playerWins,
      playerLost: !playerWins,
      reason: playerWins ? 'Debug win' : 'Debug loss',
      respawnCueInKitchen: false,
      assignedGroup: null,
    };
    this.resolveTurn(res, 'player', undefined);
  }
}

function ballTemplateId(kind: BallKind, num: number): string {
  if (kind === 'cue') return AssetIds.ballCue;
  if (kind === 'eight') return AssetIds.ballEight;
  if (kind === 'solid') return AssetIds.ballSolid(num);
  return AssetIds.ballStripe(num);
}

/** Cylinder along +Y mapped to aim direction in XZ. */
function cueStickQuatFromDirection(dirx: number, dirz: number): import('../world/renderTypes.js').QuatData {
  const dx = dirx;
  const dy = 0;
  const dz = dirz;
  const len = Math.hypot(dx, dy, dz) || 1;
  const x = dx / len;
  const y = dy / len;
  const z = dz / len;
  const fromx = 0;
  const fromy = 1;
  const fromz = 0;
  const dot = fromx * x + fromy * y + fromz * z;
  if (dot > 0.9999) {
    return { x: 0, y: 0, z: 0, w: 1 };
  }
  if (dot < -0.9999) {
    return { x: 1, y: 0, z: 0, w: 0 };
  }
  const cx = fromy * z - fromz * y;
  const cy = fromz * x - fromx * z;
  const cz = fromx * y - fromy * x;
  const s = Math.sqrt((1 + dot) * 2);
  const inv = 1 / s;
  return { x: cx * inv, y: cy * inv, z: cz * inv, w: s * 0.5 };
}

function tutorialIllegalFirstHitXPolylines(
  cx: number,
  cy: number,
  tw: number,
  th: number,
  lineY: number,
): PolylineObjectState[] {
  const s = 14;
  const hex = '#ff2233';
  const mk = (objectId: string, x0: number, y0: number, x1: number, y1: number): PolylineObjectState => ({
    objectId,
    templateId: AssetIds.lineGhostObject,
    points: [
      vec3(x0 - tw / 2, lineY, y0 - th / 2),
      vec3(x1 - tw / 2, lineY, y1 - th / 2),
    ],
    colorHex: hex,
    opacity: 0.92,
    visible: true,
    lifetime: 'persistent',
    replication: 'localCosmetic',
  });
  return [
    mk('tutorial.illegal.x.0', cx - s, cy - s, cx + s, cy + s),
    mk('tutorial.illegal.x.1', cx - s, cy + s, cx + s, cy - s),
  ];
}

function segmentToPolyline(
  objectId: string,
  templateId: string,
  seg: import('../gameplay/AimPreview.js').Segment2D,
  y: number,
  tw: number,
  th: number,
  colorHex: number,
  opacity: number,
): PolylineObjectState {
  const hex = `#${colorHex.toString(16).padStart(6, '0')}`;
  return {
    objectId,
    templateId,
    points: [
      vec3(seg.x0 - tw / 2, y, seg.y0 - th / 2),
      vec3(seg.x1 - tw / 2, y, seg.y1 - th / 2),
    ],
    colorHex: hex,
    opacity,
    visible: true,
    lifetime: 'oneShot',
    replication: 'localCosmetic',
  };
}

function contactRingPolyline(
  objectId: string,
  templateId: string,
  cx: number,
  cy: number,
  radius: number,
  y: number,
  tw: number,
  th: number,
  colorHex: string,
  opacity: number,
): PolylineObjectState {
  const points: ReturnType<typeof vec3>[] = [];
  const steps = 24;
  const r = Math.max(2, radius * 0.98);
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    points.push(vec3(px - tw / 2, y, py - th / 2));
  }
  return {
    objectId,
    templateId,
    points,
    colorHex,
    opacity,
    visible: true,
    lifetime: 'oneShot',
    replication: 'localCosmetic',
    lineWidth: 2.1,
  };
}

/** Topun geçemeyeceği her segment (rail + cep dış duvar + cep–bant köprü çizgileri). */
const DEBUG_CUSHION_BLOCK = 0xff2222;

function buildPhysicsDebugLines(
  t: Table,
  tw: number,
  th: number,
  ballR: number,
): PolylineObjectState[] {
  const py = 0.12;
  const out: PolylineObjectState[] = [];
  let idx = 0;

  const pushSeg = (points: import('../world/renderTypes.js').Vec3Data[], color: number, id: string): void => {
    for (let i = 0; i + 1 < points.length; i += 2) {
      out.push({
        objectId: `debug.phys.${id}.${idx++}`,
        templateId: 'debug.line',
        points: [points[i]!, points[i + 1]!],
        colorHex: `#${color.toString(16).padStart(6, '0')}`,
        opacity: 1,
        visible: true,
        lifetime: 'oneShot',
        replication: 'localCosmetic',
      });
    }
  };

  const blockVerts: import('../world/renderTypes.js').Vec3Data[] = [];
  for (const seg of t.cushions) {
    const p0 = vec3(seg.ax - tw * 0.5, py, seg.ay - th * 0.5);
    const p1 = vec3(seg.bx - tw * 0.5, py, seg.by - th * 0.5);
    blockVerts.push(p0, p1);
  }
  pushSeg(blockVerts, DEBUG_CUSHION_BLOCK, 'cushBlock');

  return out;
}
