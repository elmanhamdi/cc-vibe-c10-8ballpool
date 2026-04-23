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
import { tungReactionPortraitUrlForLine } from '../opponents/tungReactions.js';
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
  AI_CAMERA_CINEMATIC_CHANCE,
  AI_CAMERA_OPPONENT_YAW_OFFSET_RAD,
  AI_CAMERA_PRESET,
  AI_CAMERA_PRESET_A_AZIMUTH_RAD,
  AI_CAMERA_PRESET_A_POLAR_RAD,
  AI_CAMERA_PRESET_B_AZIMUTH_RAD,
  AI_CAMERA_PRESET_B_POLAR_RAD,
  CAMERA_FAR,
  CAMERA_FOV_DEG,
  CAMERA_NEAR,
  CAMERA_PLAYER_AZIMUTH_RAD,
  CAMERA_PLAYER_POLAR_RAD,
  CAMERA_TABLE_DISTANCE_SCALE,
} from './Constants.js';
import { PoolInputState } from './PoolInputState.js';
import { transformAt, uniformScale, vec3 } from '../world/Transform.js';
import type { BallKind } from '../physics/Ball.js';

/** Shortest-path lerp on the circle (radians). */
function lerpAngleRad(from: number, to: number, t: number): number {
  const twoPi = Math.PI * 2;
  let d = to - from;
  d = ((((d + Math.PI) % twoPi) + twoPi) % twoPi) - Math.PI;
  return from + d * t;
}

export type { PotHudState } from '../world/renderTypes.js';

export class GameEngine implements Game {
  phase: GamePhase = 'MainMenu';
  readonly table = new Table();
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

  /** Center “reaction portrait” moment (TTL); cleared with match / dialogue tick cadence. */
  private opponentReaction: {
    text: string;
    ttl: number;
    durationTotal: number;
    beatId: number;
    portraitSrc: string | null;
  } | null = null;
  private opponentReactionBeatSeq = 0;

  readonly poolInput = new PoolInputState();
  private readonly eventQueue: GameEvent[] = [];

  constructor(ballRadius = 9) {
    this.physics = new CollisionSystem(this.table, ballRadius);
    this.ai = new AIController(CAREER_OPPONENTS[0]!);
    this.beginCareer(0);
  }

  reset(seed?: number): void {
    void seed;
    this.beginCareer(this.levelIndex);
  }

  drainEvents(): GameEvent[] {
    const out = this.eventQueue.slice();
    this.eventQueue.length = 0;
    return out;
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
    this.aiCameraBlend = 0;
    this.aiCameraBlendTarget = 0;
  }

  /** After a win, advance the ladder. */
  bumpLevelAfterVictory(): void {
    this.levelIndex = Math.min(this.levelIndex + 1, CAREER_OPPONENTS.length - 1);
  }

  private requestPlayerShot(angle: number, power01: number, spinX: number, spinY: number): boolean {
    if (this.phase !== 'PlayerTurn') return false;
    if (!this.physics.cue.active) return false;
    this.physics.applyShot(angle, power01, spinX, spinY);
    this.physics.beginShot();
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
    this.pendingAI = null;
    this.physics.applyShot(plan.angle, plan.power01, plan.spinX, plan.spinY);
    this.physics.beginShot();
    this.phase = 'BallSimulation';
    this.aiThink = 0;
  }

  update(dt: number, commands: readonly GameInputCommand[] = []): void {
    this.applyMenuCommands(commands);

    this.poolInput.applyCommands(commands, {
      phaseIsPlayerTurn: this.phase === 'PlayerTurn' && !this.opponentReaction,
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
      if (lowTime && !this.pressureSent) {
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
      // Hold AI shot until opponent reaction beat ends; camera blend still ticks earlier in `update`.
      if (!this.opponentReaction) {
        this.aiThink -= dt;
        if (this.aiThink <= 0) this.fireAIShot();
      }
      return;
    }

    if (this.phase === 'BallSimulation') {
      const done = this.physics.stepFrame(dt);
      if (done) {
        const shot = this.physics.snapshotOutcome();
        const shooter = this.activePlayer;
        this.resolveTurn(
          resolveEightBallRules({
            ctx: this.rulesCtx,
            shooter,
            shot,
            balls: this.collectBallMeta(),
          }),
          shooter,
          shot,
        );
      }
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
      this.opponentReaction = null;
      return;
    }

    this.activePlayer = res.nextTurn;
    this.pressureSent = false;

    if (this.activePlayer === 'player') {
      this.phase = 'PlayerTurn';
      this.turnClock.beginTurn('player');
      this.pendingAI = null;
      this.aiCameraBlendTarget = 0;
    } else {
      this.phase = 'AITurn';
      this.turnClock.stop();
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
      this.aiCameraBlendTarget = Math.random() < AI_CAMERA_CINEMATIC_CHANCE ? 1 : 0;
    }
  }

  private tickAiCameraBlend(dt: number): void {
    const target = this.aiCameraBlendTarget;
    const k = target < this.aiCameraBlend ? AI_CAMERA_BLEND_EXP_RETURN : AI_CAMERA_BLEND_EXP;
    const a = 1 - Math.exp(-k * Math.max(0, dt));
    this.aiCameraBlend += (target - this.aiCameraBlend) * a;
    if (Math.abs(this.aiCameraBlend - target) < 0.002) this.aiCameraBlend = target;
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
    const ttl = 4.9 + Math.random() * 2.1;
    this.opponentReactionBeatSeq += 1;
    const opp = this.getOpponent();
    const portraitSrc =
      opp.id === 'tung' ? tungReactionPortraitUrlForLine(import.meta.env.BASE_URL, spoken) : null;
    this.opponentReaction = {
      text: spoken,
      ttl,
      durationTotal: ttl,
      beatId: this.opponentReactionBeatSeq,
      portraitSrc,
    };
    this.dialogue.alignBubbleTtl(ttl);
  }

  private tryDialogue(cat: DialogueCategory, opp: AICharacterProfile, silentChance?: number): string | null {
    return this.dialogue.trySpeak(cat, {
      personalitySilentChance: silentChance,
    });
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
  /** Short English labels above each player pot strip; "-" until groups are chosen. */
  private getPotTargetLabels(): { opponent: string; player: string } {
    const balls = this.physics.balls;
    const ctx = this.rulesCtx;
    const remainingInGroup = (g: 'solid' | 'stripe') =>
      balls.some((b) => b.active && kindToGroup(b.kind) === g);

    if (ctx.openTable || ctx.playerGroup == null || ctx.aiGroup == null) {
      return { opponent: '-', player: '-' };
    }
    const opp =
      remainingInGroup(ctx.aiGroup)
        ? ctx.aiGroup === 'solid'
          ? 'Solids (1-7)'
          : 'Stripes (9-15)'
        : '8 ball';
    const pl =
      remainingInGroup(ctx.playerGroup)
        ? ctx.playerGroup === 'solid'
          ? 'Solids (1-7)'
          : 'Stripes (9-15)'
        : '8 ball';
    return { opponent: opp, player: pl };
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
    const prompts =
      snap.dialogue != null
        ? [{ id: 'dialogue', text: snap.dialogue.text, priority: 1 }]
        : ([] as const);

    const panels: string[] = [];
    if (snap.phase === 'MainMenu') panels.push('menu');
    if (snap.phase === 'MatchEnd') panels.push('end');
    if (snap.phase !== 'MainMenu' && snap.phase !== 'MatchEnd') panels.push('hud');

    return {
      scoreText: meta.reason,
      timerText: '',
      healthPercent: 0,
      boostPercent: 0,
      visiblePanels: panels,
      prompts,
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
              portraitSrc: this.opponentReaction.portraitSrc,
              durationSec: this.opponentReaction.durationTotal,
              beatId: this.opponentReaction.beatId,
            }
          : null,
      },
    };
  }

  /** F tuşu overlay — rakip / sinematik kamera parametreleri. */
  getOpponentCameraDebug(viewport: ViewportSize) {
    const c = this.computeCameraFraming(viewport);
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

  private computeCameraFraming(viewport: ViewportSize): {
    dist: number;
    aimY: number;
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
    /** Oyuncu turunda da `aiCameraBlend` işler; böylece rakip kadrajından yumuşak dönüş olur. */
    const blend = this.aiCameraBlend;
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
    const camPos = vec3(dist * sp * ca, dist * cp, dist * sp * sa);
    return {
      dist,
      aimY,
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
    const camFr = this.computeCameraFraming(viewport);
    const { aimY, camPos } = camFr;
    const camera: RenderWorldState['camera'] = {
      mode: 'fixed',
      position: camPos,
      target: vec3(0, aimY, 0),
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

    const aiPlan = this.phase === 'AITurn' && cue.active ? this.getAiCuePreview() : null;
    const aimVis = this.poolInput.getStrokeAimForRender();
    const effectiveAim = aiPlan ? aiPlan.angle : aimVis;
    const chargePull = aiPlan
      ? Math.max(0, Math.min(1, aiPlan.power01 * 0.92))
      : Math.max(0, Math.min(1, this.poolInput.strokeMode === 'charge' ? this.poolInput.charge01 : 0));

    const showAim =
      cue.active &&
      this.phase !== 'BallSimulation' &&
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
      const preview = computeAimPreview(this.physics.balls, cue, effectiveAim);
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

    return {
      camera,
      objects,
      polylines,
      tableSpace: { width: tw, height: th },
      ambientColorHex: '#0b0f14',
    };
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
      }
    }
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

function buildPhysicsDebugLines(
  t: Table,
  tw: number,
  th: number,
  ballR: number,
): PolylineObjectState[] {
  const py = 0.12;
  const pyMouth = 0.135;
  const pyPot = 0.15;
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

  const cushionVerts: import('../world/renderTypes.js').Vec3Data[] = [];
  for (const seg of t.cushions) {
    cushionVerts.push(
      vec3(seg.ax - tw * 0.5, py, seg.ay - th * 0.5),
      vec3(seg.bx - tw * 0.5, py, seg.by - th * 0.5),
    );
  }
  pushSeg(cushionVerts, 0xff44ee, 'cush');

  const throatVerts: import('../world/renderTypes.js').Vec3Data[] = [];
  const pushW = (px: number, pz: number, yv: number): void => {
    throatVerts.push(vec3(px - tw * 0.5, yv, pz - th * 0.5));
  };
  const innerL = t.playableMinX;
  const innerR = t.playableMaxX;
  const innerT = t.playableMinY;
  const innerB = t.playableMaxY;
  const cy = (innerT + innerB) * 0.5;
  const ca = t.cushionCornerAlong;
  const mh = t.cushionMidHalf;
  const sc = t.cushionSideCorner;
  const throatLine = (ax: number, ay: number, bx: number, by: number): void => {
    pushW(ax, ay, pyMouth);
    pushW(bx, by, pyMouth);
  };
  throatLine(innerL + ca, innerT, innerL, innerT + sc);
  throatLine(innerR - ca, innerT, innerR, innerT + sc);
  throatLine(innerL + ca, innerB, innerL, innerB - sc);
  throatLine(innerR - ca, innerB, innerR, innerB - sc);
  throatLine(innerL, cy - mh, innerL, cy + mh);
  throatLine(innerR, cy - mh, innerR, cy + mh);
  for (let i = 0; i + 1 < throatVerts.length; i += 2) {
    pushSeg([throatVerts[i]!, throatVerts[i + 1]!], 0x66ff66, 'throat');
  }

  const pocketSegs = 40;
  for (const pocket of t.pockets) {
    const ring: import('../world/renderTypes.js').Vec3Data[] = [];
    for (let i = 0; i <= pocketSegs; i++) {
      const a = (i / pocketSegs) * Math.PI * 2;
      const x = pocket.pos.x + Math.cos(a) * pocket.radius;
      const z = pocket.pos.y + Math.sin(a) * pocket.radius;
      ring.push(vec3(x - tw * 0.5, py, z - th * 0.5));
    }
    for (let i = 0; i < pocketSegs; i++) {
      pushSeg([ring[i]!, ring[i + 1]!], 0xffaa22, 'pocket');
    }
    const potR = Math.max(0.5, pocket.radius - ballR * 0.35);
    const innerRing: import('../world/renderTypes.js').Vec3Data[] = [];
    for (let i = 0; i <= pocketSegs; i++) {
      const ang = (i / pocketSegs) * Math.PI * 2;
      const x2 = pocket.pos.x + Math.cos(ang) * potR;
      const z2 = pocket.pos.y + Math.sin(ang) * potR;
      innerRing.push(vec3(x2 - tw * 0.5, pyPot, z2 - th * 0.5));
    }
    for (let i = 0; i < pocketSegs; i++) {
      pushSeg([innerRing[i]!, innerRing[i + 1]!], 0x00ffcc, 'pocketInner');
    }
  }

  const playLoop = [
    vec3(t.playableMinX - tw * 0.5, py, t.playableMinY - th * 0.5),
    vec3(t.playableMaxX - tw * 0.5, py, t.playableMinY - th * 0.5),
    vec3(t.playableMaxX - tw * 0.5, py, t.playableMaxY - th * 0.5),
    vec3(t.playableMinX - tw * 0.5, py, t.playableMaxY - th * 0.5),
    vec3(t.playableMinX - tw * 0.5, py, t.playableMinY - th * 0.5),
  ];
  for (let i = 0; i < playLoop.length - 1; i++) {
    pushSeg([playLoop[i]!, playLoop[i + 1]!], 0x44ffee, 'play');
  }

  const outerLoop = [
    vec3(-tw * 0.5, py, -th * 0.5),
    vec3(tw * 0.5, py, -th * 0.5),
    vec3(tw * 0.5, py, th * 0.5),
    vec3(-tw * 0.5, py, th * 0.5),
    vec3(-tw * 0.5, py, -th * 0.5),
  ];
  for (let i = 0; i < outerLoop.length - 1; i++) {
    out.push({
      objectId: `debug.phys.outer.${i}`,
      templateId: 'debug.line',
      points: [outerLoop[i]!, outerLoop[i + 1]!],
      colorHex: '#ffffff',
      opacity: 0.35,
      visible: true,
      lifetime: 'oneShot',
      replication: 'localCosmetic',
    });
  }

  return out;
}
