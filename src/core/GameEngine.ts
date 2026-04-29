import { Table } from '../physics/Table.js';
import { CollisionSystem, type ShotOutcome } from '../physics/CollisionSystem.js';
import type { PlayerId, GamePhase, GameSnapshot } from './types.js';
import { TurnManager } from '../gameplay/TurnManager.js';
import {
  resolveEightBallRules,
  resolveTurnTimeout,
  kindToGroup,
  type RulesContext,
  type BallMeta,
  type TurnResolution,
} from '../gameplay/RulesEngine.js';
import { AIController, type AIShotPlan } from '../ai/AIController.js';
import { CAREER_OPPONENTS } from '../ai/AICharacters.js';
import { TUNG_DEFAULT_REACTION_ASSET_ID, tungReactionPortraitAssetIdForLine } from '../opponents/tungReactions.js';
import type { AICharacterProfile } from '../ai/types.js';
import { DialogueManager } from '../systems/DialogueManager.js';
import type { DialogueCategory } from '../systems/dialogueLines.js';
import { computeAimPreview } from '../gameplay/AimPreview.js';
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
  OPPONENT_TUNG_WORLD_Y_OFFSET,
} from './Constants.js';
import { PoolInputState } from './PoolInputState.js';
import { transformAt, uniformScale, vec3 } from '../world/Transform.js';
import type { BallKind } from '../physics/Ball.js';
import type { PlayerProfile, ProfileView } from './Profile.js';
import { COIN_REWARD_WIN, computeRank, defaultProfile, hydrateProfile } from './Profile.js';
import { SHOP_CUE_CATALOG } from './ShopCatalog.js';
import { Vec2 } from '../physics/Vec2.js';

const PROFILE_STORAGE_KEY = 'vertical-eight-ball.profile.v1';

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
};

export class GameEngine implements Game {
  phase: GamePhase = 'MainMenu';
  readonly table: Table;
  readonly physics: CollisionSystem;
  readonly rulesCtx: RulesContext = {
    openTable: true,
    playerGroup: null,
    aiGroup: null,
  };
  readonly turnClock = new TurnManager({ playerSeconds: 16, aiSeconds: 22 });
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

  /** Center “reaction portrait” moment (TTL); cleared with match / dialogue tick cadence. */
  private opponentReaction: {
    text: string;
    ttl: number;
    durationTotal: number;
    beatId: number;
    portraitAssetId: string | null;
  } | null = null;
  private opponentReactionBeatSeq = 0;

  readonly poolInput = new PoolInputState();
  private readonly eventQueue: GameEvent[] = [];

  constructor(options?: GameEngineOptions) {
    const ballRadius = options?.ballRadius ?? 9;
    this.table = options?.table ?? new Table();
    this.physics = new CollisionSystem(this.table, ballRadius);
    this.ai = new AIController(CAREER_OPPONENTS[0]!);
    this.profile = this.loadProfileFromStorage();
    this.ensureEquippedStats();
    this.beginCareer(0);
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
      if (typeof localStorage === 'undefined') return defaultProfile();
      const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
      if (!raw) return defaultProfile();
      const parsed = JSON.parse(raw) as unknown;
      return hydrateProfile(parsed);
    } catch {
      return defaultProfile();
    }
  }

  private saveProfileToStorage(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(this.profile));
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
    if (playerWon) {
      p.coins += COIN_REWARD_WIN;
      p.wins += 1;
      p.currentStreak += 1;
      if (p.currentStreak > p.bestStreak) p.bestStreak = p.currentStreak;
    } else if (playerLost) {
      p.losses += 1;
      p.currentStreak = 0;
    }
    this.saveProfileToStorage();
  }

  /** Oyuncu beyaz yerleştirirken canvas `cursor` için (main loop). */
  isAwaitingPlayerBallInHand(): boolean {
    return this.awaitingBallInHandPlacement && this.phase === 'PlayerTurn' && this.physics.cue.active;
  }

  private pickRandomMatchBgmId(): string {
    return Math.random() < 0.5 ? AssetIds.musicBgMatch2 : AssetIds.musicBgMatch3;
  }

  getOpponent(): AICharacterProfile {
    return CAREER_OPPONENTS[Math.min(this.levelIndex, CAREER_OPPONENTS.length - 1)]!;
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
    const opp = this.getOpponent();
    this.ai.setProfile(opp);
    this.rulesCtx.openTable = true;
    this.rulesCtx.playerGroup = null;
    this.rulesCtx.aiGroup = null;
    this.physics.resetRack();
    this.physics.placeCueBallForBreak();
    this.activePlayer = 'player';
    this.turnClock.beginTurn('player');
    this.dialogue.clearBubble();
    this.opponentReaction = null;
    this.pressureSent = false;
    this.pendingAI = null;
    this.phase = 'PlayerTurn';
    this.lastHudReason = `${opp.name} — ${opp.tier}`;
    this.lastMatchWon = null;
    this.poolInput.resetStroke();
    this.poolInput.aimDragging = false;
    this.awaitingFirstPlayerBreakShot = true;
    this.awaitingFirstAiShot = true;
    this.awaitingBallInHandPlacement = false;
    this.ballInHandDragging = false;
    this.aiCueBallPlacementSlide = null;
    this.activeShotIsOpeningBreak = false;
    this.openingShotCameraReturnActive = false;
    this.aiCameraBlend = 0;
    this.aiCameraBlendTarget = 0;
    this.pushMusicStart(this.pickRandomMatchBgmId());
  }

  /** After a win, advance the ladder. */
  bumpLevelAfterVictory(): void {
    this.levelIndex = Math.min(this.levelIndex + 1, CAREER_OPPONENTS.length - 1);
  }

  private requestPlayerShot(angle: number, power01: number, spinX: number, spinY: number): boolean {
    if (this.phase !== 'PlayerTurn') return false;
    if (!this.physics.cue.active) return false;
    const cueStats = this.findCue(this.profile.equippedCueId)?.stats ?? { power: 1, aim: 1, spin: 1 };
    power01 = Math.max(0.1, Math.min(1, power01 * cueStats.power));
    spinX = Math.max(-1, Math.min(1, spinX * cueStats.spin));
    spinY = Math.max(-1, Math.min(1, spinY * cueStats.spin));
    this.activeShotIsOpeningBreak = this.awaitingFirstPlayerBreakShot;
    if (this.awaitingFirstPlayerBreakShot) {
      this.awaitingFirstPlayerBreakShot = false;
      this.aiCameraBlend = 1;
      this.aiCameraBlendTarget = 0;
      this.openingShotCameraReturnActive = true;
    }
    this.physics.applyShot(angle, power01, spinX, spinY);
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

    const commandsForPool = this.filterBallInHandPointerCommands(commands);

    this.poolInput.applyCommands(commandsForPool, {
      phaseIsPlayerTurn:
        this.phase === 'PlayerTurn' && !this.opponentReaction && !this.awaitingBallInHandPlacement,
      cueActive: this.physics.cue.active,
      cueX: this.physics.cue.pos.x,
      cueY: this.physics.cue.pos.y,
      cueRadius: this.physics.cue.radius,
      spinSetter: (nx, ny) => {
        this.spinX = nx;
        this.spinY = ny;
      },
      requestShot: (angle, power, sx, sy) => {
        void this.requestPlayerShot(angle, power, sx, sy);
      },
      getSpin: () => ({ x: this.spinX, y: this.spinY }),
    });

    this.dialogue.tick(dt);
    if (this.opponentReaction) {
      this.opponentReaction.ttl -= dt;
      if (this.opponentReaction.ttl <= 0) this.opponentReaction = null;
    }

    if (this.phase !== 'MainMenu' && this.phase !== 'MatchEnd') {
      this.tickAiCameraBlend(dt);
    }

    if (this.phase === 'MainMenu' || this.phase === 'MatchEnd') return;

    if (this.phase === 'PlayerTurn') {
      const lowTime = this.turnClock.progress01() < 0.22;
      if (lowTime && !this.pressureSent && !this.awaitingBallInHandPlacement) {
        void this.tryDialogue('pressure', this.getOpponent());
        this.pressureSent = true;
      }
      if (this.turnClock.tick(dt)) {
        const shooter: PlayerId = 'player';
        this.resolveTurn(resolveTurnTimeout(shooter), shooter, undefined);
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
      const maxHitsPerFrame = 8;
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

  private resolveTurn(res: TurnResolution, shooter: PlayerId, shot?: ShotOutcome): void {
    if (this.awaitingFirstPlayerBreakShot && this.phase === 'PlayerTurn' && shot === undefined) {
      this.awaitingFirstPlayerBreakShot = false;
      this.aiCameraBlend = 0;
      this.aiCameraBlendTarget = 0;
      this.openingShotCameraReturnActive = false;
    }
    if (shot) {
      this.pushSound(AssetIds.soundBallsSettle, 0.22);
      if (shot.potted.length > 0) this.pushSound(AssetIds.soundPocket, 0.45);
    }
    this.lastHudReason = res.reason;
    this.maybeTaunt(res, shooter, shot);

    if (res.respawnCueInKitchen) {
      this.physics.placeCueBallInKitchen();
    }

    if (res.playerWon || res.playerLost) {
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
      this.awaitingBallInHandPlacement = foulBallInHand;
    } else {
      this.phase = 'AITurn';
      this.turnClock.stop();
      this.awaitingBallInHandPlacement = false;
      if (foulBallInHand) {
        const fromX = this.physics.cue.pos.x;
        const fromY = this.physics.cue.pos.y;
        const target = new Vec2();
        if (this.physics.tryPickRandomLegalCueHandPosForAi(target)) {
          this.aiCueBallPlacementSlide = {
            fromX,
            fromY,
            toX: target.x,
            toY: target.y,
            t: 0,
          };
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
      const thinkSec = plan.thinkMs / 1000;
      this.aiThinkTotal = Math.max(0.001, thinkSec);
      this.aiThink = thinkSec;
      this.aiCameraBlendTarget =
        this.awaitingFirstAiShot || Math.random() >= AI_CAMERA_CINEMATIC_CHANCE ? 0 : 1;
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

  private maybeTaunt(res: TurnResolution, shooter: PlayerId, shot?: ShotOutcome): void {
    const opp = this.getOpponent();
    const silentChance = opp.personality === 'silent' ? 0.55 : opp.personality === 'calm' ? 0.18 : 0.08;

    if (res.playerWon || res.playerLost) return;

    if (shooter === 'player' && res.foul !== 'none') {
      const sc = res.foul === 'turn_timeout' ? silentChance * 0.45 : silentChance;
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
      const spoken = this.tryDialogue('player_miss', opp, silentChance);
      this.maybeScheduleOpponentReaction(spoken, res, shooter, shot);
    }

    if (shooter === 'ai' && res.foul === 'none' && res.continueWithSamePlayer) {
      void this.tryDialogue('ai_good_shot', opp, silentChance);
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
    const opp = this.getOpponent();
    const portraitAssetId = opp.id === 'tung' ? tungReactionPortraitAssetIdForLine(spoken) : null;
    this.opponentReaction = {
      text: spoken,
      ttl,
      durationTotal: ttl,
      beatId: this.opponentReactionBeatSeq,
      portraitAssetId,
    };
    this.dialogue.alignBubbleTtl(ttl);
    if (opp.id === 'tung' && portraitAssetId != null) {
      this.playRandomTungTauntSound();
    }
  }

  private tryDialogue(cat: DialogueCategory, opp: AICharacterProfile, silentChance?: number): string | null {
    return this.dialogue.trySpeak(cat, {
      personalitySilentChance: silentChance,
    });
  }

  /** One of `public/opponents/tung/audio/tung{1,2,3}.ogg` when the center portrait reaction is shown. */
  private playRandomTungTauntSound(): void {
    const clips = [
      AssetIds.soundTungTaunt1,
      AssetIds.soundTungTaunt2,
      AssetIds.soundTungTaunt3,
    ] as const;
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
      coinRewardWin: COIN_REWARD_WIN,
      profile: {
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
      },
      shop: {
        catalog: SHOP_CUE_CATALOG,
      },
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
        showPotProgressStrip:
          !meta.groups.openTable &&
          meta.groups.playerGroup != null &&
          meta.groups.aiGroup != null,
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
    const blend = debugOppShotCam
      ? 1
      : this.awaitingFirstPlayerBreakShot &&
          this.activePlayer === 'player' &&
          this.phase === 'PlayerTurn'
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
    const openingDecorT =
      this.awaitingFirstPlayerBreakShot &&
      this.activePlayer === 'player' &&
      this.phase === 'PlayerTurn'
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
    for (const b of this.physics.balls) {
      const r = b.radius;
      const pos = vec3(b.pos.x - tw / 2, r + 0.15, b.pos.y - th / 2);
      objects.push({
        objectId: `ball.${b.id}`,
        templateId: ballTemplateId(b.kind, b.number),
        transform: transformAt(pos, uniformScale(r)),
        visible: b.active,
        lifetime: 'persistent',
        replication: 'sharedGameplay',
        renderLayer: 'world',
        tableVelocity: { x: b.vel.x, y: b.vel.y },
      });
    }

    const opponentId = this.getOpponent().id;
    if (this.phase !== 'MainMenu' && this.phase !== 'MatchEnd' && opponentId === 'tung') {
      const feltY = cue.radius + 0.15 + OPPONENT_TUNG_WORLD_Y_OFFSET;
      const tz = -(th * 0.5) - OPPONENT_TUNG_PLACEHOLDER_PAST_RAIL_Z;
      objects.push({
        objectId: 'opponent.tungPlaceholder',
        templateId: AssetIds.opponentTungPlaceholder,
        transform: transformAt(vec3(OPPONENT_TUNG_PLACEHOLDER_OFFSET_X, feltY, tz), uniformScale(1)),
        visible: true,
        lifetime: 'persistent',
        replication: 'localCosmetic',
        renderLayer: 'world',
      });
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
    const centerDist = cue.radius + shaftLen * 0.5 + pull;
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
    }

    if (hints.physicsDebugVisible) {
      polylines.push(...buildPhysicsDebugLines(t, tw, th, cue.radius));
    }

    const cuePullHandHint =
      this.awaitingFirstPlayerBreakShot &&
      this.activePlayer === 'player' &&
      this.phase === 'PlayerTurn' &&
      !this.opponentReaction &&
      !this.awaitingBallInHandPlacement &&
      showCue &&
      this.poolInput.strokeMode !== 'charge';

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
      if (c.type === 'menu.restart') {
        this.beginCareer(this.levelIndex);
      } else if (c.type === 'menu.next') {
        this.bumpLevelAfterVictory();
        this.beginCareer(this.levelIndex);
      } else if (c.type === 'menu.home') {
        this.beginCareer(this.levelIndex);
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
    const ttl = OPPONENT_REACTION_TTL_MIN_SEC + Math.random() * Math.max(0.01, OPPONENT_REACTION_TTL_RANDOM_SEC);
    this.opponentReactionBeatSeq += 1;
    const opp = this.getOpponent();
    const portraitAssetId = opp.id === 'tung' ? TUNG_DEFAULT_REACTION_ASSET_ID : null;
    this.opponentReaction = {
      text: 'Debug reaction',
      ttl,
      durationTotal: ttl,
      beatId: this.opponentReactionBeatSeq,
      portraitAssetId,
    };
    this.dialogue.clearBubble();
    this.dialogue.alignBubbleTtl(ttl);
    if (opp.id === 'tung' && portraitAssetId != null) {
      this.playRandomTungTauntSound();
    }
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
