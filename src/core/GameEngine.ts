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
import type { AICharacterProfile } from '../ai/types.js';
import { DialogueManager } from '../systems/DialogueManager.js';
import type { DialogueCategory } from '../systems/dialogueLines.js';

export type PotHudState =
  | { kind: 'open'; solids: number[]; stripes: number[] }
  | { kind: 'assigned'; player: number[]; ai: number[] };

export class GameEngine {
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
  private pressureSent = false;
  private lastHudReason = '';
  /** Set when entering `MatchEnd`. */
  lastMatchWon: boolean | null = null;

  constructor(ballRadius = 9) {
    this.physics = new CollisionSystem(this.table, ballRadius);
    this.ai = new AIController(CAREER_OPPONENTS[0]!);
    this.beginCareer(0);
  }

  getOpponent(): AICharacterProfile {
    return CAREER_OPPONENTS[Math.min(this.levelIndex, CAREER_OPPONENTS.length - 1)]!;
  }

  /** Planned shot (angle + power) for drawing the cue during `AITurn`. */
  getAiCuePreview(): AIShotPlan | null {
    if (this.phase !== 'AITurn') return null;
    return this.pendingAI;
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
    this.pressureSent = false;
    this.pendingAI = null;
    this.phase = 'PlayerTurn';
    this.lastHudReason = `${opp.name} — ${opp.tier}`;
    this.lastMatchWon = null;
  }

  /** After a win, advance the ladder. */
  bumpLevelAfterVictory(): void {
    this.levelIndex = Math.min(this.levelIndex + 1, CAREER_OPPONENTS.length - 1);
  }

  requestPlayerShot(angle: number, power01: number, spinX: number, spinY: number): boolean {
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

  update(dt: number): void {
    this.dialogue.tick(dt);

    if (this.phase === 'MainMenu' || this.phase === 'MatchEnd') return;

    if (this.phase === 'PlayerTurn') {
      const lowTime = this.turnClock.progress01() < 0.22;
      if (lowTime && !this.pressureSent) {
        this.tryDialogue('pressure', this.getOpponent());
        this.pressureSent = true;
      }
      if (this.turnClock.tick(dt)) {
        const shooter: PlayerId = 'player';
        this.resolveTurn(resolveTurnTimeout(shooter), shooter, undefined);
      }
      return;
    }

    if (this.phase === 'AITurn') {
      this.aiThink -= dt;
      if (this.aiThink <= 0) this.fireAIShot();
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
      return;
    }

    this.activePlayer = res.nextTurn;
    this.pressureSent = false;

    if (this.activePlayer === 'player') {
      this.phase = 'PlayerTurn';
      this.turnClock.beginTurn('player');
      this.pendingAI = null;
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
      const thinkSec = plan.thinkMs / 1000;
      this.aiThinkTotal = Math.max(0.001, thinkSec);
      this.aiThink = thinkSec;
    }
  }

  private maybeTaunt(res: TurnResolution, shooter: PlayerId, shot?: ShotOutcome): void {
    const opp = this.getOpponent();
    const silentChance = opp.personality === 'silent' ? 0.55 : opp.personality === 'calm' ? 0.18 : 0.08;

    if (res.foul === 'scratch' || res.foul === 'wrong_ball_first' || res.foul === 'no_ball_hit') {
      if (shooter === 'player') this.tryDialogue('player_foul', opp, silentChance);
      return;
    }
    if (res.foul === 'turn_timeout') {
      if (shooter === 'player') this.tryDialogue('player_foul', opp, silentChance * 0.45);
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
      this.tryDialogue('player_miss', opp, silentChance);
    }

    if (shooter === 'ai' && res.foul === 'none' && res.continueWithSamePlayer) {
      this.tryDialogue('ai_good_shot', opp, silentChance);
    }
  }

  private tryDialogue(cat: DialogueCategory, opp: AICharacterProfile, silentChance?: number): void {
    this.dialogue.trySpeak(cat, {
      personalitySilentChance: silentChance,
    });
    void opp;
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
}
