import type { BallKind } from '../physics/Ball.js';
import type { PlayerId } from '../core/types.js';
import type { ShotOutcome } from '../physics/CollisionSystem.js';

export type BallGroup = 'solid' | 'stripe';

export interface RulesContext {
  openTable: boolean;
  playerGroup: BallGroup | null;
  aiGroup: BallGroup | null;
}

export type FoulKind =
  | 'none'
  | 'scratch'
  | 'wrong_ball_first'
  | 'no_rail_contact'
  | 'no_ball_hit'
  | 'eight_early'
  | 'illegal_break'
  | 'turn_timeout';

export interface TurnResolution {
  nextTurn: PlayerId;
  continueWithSamePlayer: boolean;
  foul: FoulKind;
  playerWon: boolean;
  playerLost: boolean;
  reason: string;
  /** If true, re-spot cue in kitchen (after scratch / some fouls). */
  respawnCueInKitchen: boolean;
  /** Groups assigned this shot (for dialogue / UI). */
  assignedGroup: { player: BallGroup; ai: BallGroup } | null;
}

export interface BallMeta {
  id: number;
  number: number;
  kind: BallKind;
  active: boolean;
}

export function kindToGroup(kind: BallKind): BallGroup | null {
  if (kind === 'solid') return 'solid';
  if (kind === 'stripe') return 'stripe';
  return null;
}

function anyActiveSolidOrStripe(balls: BallMeta[]): boolean {
  return balls.some((b) => b.active && (b.kind === 'solid' || b.kind === 'stripe'));
}

/** True when the shooter may legally make first contact with the 8 (run-out phase). */
function shooterMayContactEightFirst(ctx: RulesContext, shooter: PlayerId, balls: BallMeta[]): boolean {
  const own = shooter === 'player' ? ctx.playerGroup : ctx.aiGroup;
  if (!own) return !anyActiveSolidOrStripe(balls);
  const ownRemaining = balls.some((b) => b.active && kindToGroup(b.kind) === own);
  return !ownRemaining;
}

export function resolveEightBallRules(input: {
  ctx: RulesContext;
  shooter: PlayerId;
  shot: ShotOutcome;
  balls: BallMeta[];
  /** Opening break shot (player’s first stroke of the rack). */
  isBreakShot?: boolean;
}): TurnResolution {
  const { ctx, shooter, shot, balls, isBreakShot = false } = input;
  const opponent: PlayerId = shooter === 'player' ? 'ai' : 'player';

  const defaultLoss = (reason: string): TurnResolution => ({
    nextTurn: opponent,
    continueWithSamePlayer: false,
    foul: 'none',
    playerWon: false,
    playerLost: true,
    reason,
    respawnCueInKitchen: false,
    assignedGroup: null,
  });

  const defaultWin = (reason: string): TurnResolution => ({
    nextTurn: opponent,
    continueWithSamePlayer: false,
    foul: 'none',
    playerWon: true,
    playerLost: false,
    reason,
    respawnCueInKitchen: false,
    assignedGroup: null,
  });

  const shooterGroup = shooter === 'player' ? ctx.playerGroup : ctx.aiGroup;
  const ownGroup = shooterGroup;

  const firstHit = shot.firstHitId != null ? balls.find((b) => b.id === shot.firstHitId) : null;

  const pottedMeta = shot.potted
    .map((p) => balls.find((b) => b.id === p.id))
    .filter((b): b is BallMeta => !!b);

  const eightPotted = pottedMeta.some((b) => b.kind === 'eight');
  const cuePotted = shot.scratched;

  const remaining = (g: BallGroup) =>
    balls.some((b) => b.active && kindToGroup(b.kind) === g);

  const shooterOwnRemaining = ownGroup ? remaining(ownGroup) : true;
  const shooterNeedsEight = ownGroup && !shooterOwnRemaining;

  const hadObjectBallPotted = pottedMeta.some(
    (b) => b.kind === 'solid' || b.kind === 'stripe' || b.kind === 'eight',
  );

  /** Illegal 8 contact / pocket timing (simplified). */
  if (eightPotted) {
    if (ctx.openTable) {
      return shooter === 'player'
        ? defaultLoss('You pocketed the 8 on an open table — you lose.')
        : defaultWin('Opponent pocketed the 8 on an open table — you win.');
    }
    if (cuePotted) {
      return shooter === 'player'
        ? defaultLoss('Cue ball and the 8 went together — you lose.')
        : defaultWin('Opponent scratched on the 8 — you win.');
    }
    if (!shooterNeedsEight) {
      return shooter === 'player'
        ? defaultLoss('You pocketed the 8 before clearing your group.')
        : defaultWin('Opponent pocketed the 8 too early — you win.');
    }
    if (shooter === 'player') return defaultWin('You legally pocketed the 8 — you win!');
    return defaultLoss('Opponent legally pocketed the 8 — you lose.');
  }

  if (cuePotted) {
    /** Açık masada hem beyaz hem renkli düşerse: gruplar pota göre belli olur, sıra yine rakibe (scratch). */
    const assignedOnScratch =
      ctx.openTable ? tryAssignOpenTableFromPotted(ctx, shooter, shot, balls, pottedMeta) : null;
    return {
      nextTurn: opponent,
      continueWithSamePlayer: false,
      foul: 'scratch',
      playerWon: false,
      playerLost: false,
      reason: assignedOnScratch
        ? 'Cue ball pocketed — scratch. Groups are set from balls that dropped.'
        : 'Cue ball pocketed — scratch.',
      respawnCueInKitchen: true,
      assignedGroup: assignedOnScratch,
    };
  }

  let foul: FoulKind = 'none';
  if (!shot.anyBallMoved) {
    foul = 'no_ball_hit';
  } else if (!firstHit) {
    foul = 'no_ball_hit';
  } else if (firstHit.kind === 'eight' && !shooterMayContactEightFirst(ctx, shooter, balls)) {
    foul = 'eight_early';
  } else if (!ctx.openTable && ownGroup) {
    const g = kindToGroup(firstHit.kind);
    if (g && g !== ownGroup) foul = 'wrong_ball_first';
  } else if (
    !hadObjectBallPotted &&
    shot.firstHitId != null &&
    !shot.railAfterFirstContact &&
    /** Açılış + açık masa: sıyırarak bir renkli/stripe’e değmek yeterli; “bant sonrası” şartı uygulanmaz. */
    !(isBreakShot && ctx.openTable)
  ) {
    foul = 'no_rail_contact';
  }

  if (foul !== 'none') {
    return {
      nextTurn: opponent,
      continueWithSamePlayer: false,
      foul,
      playerWon: false,
      playerLost: false,
      reason: foulMessage(foul),
      respawnCueInKitchen: false,
      assignedGroup: null,
    };
  }

  const assign = assignIfNeeded(ctx, shooter, shot, balls, pottedMeta, false);
  /** `assignIfNeeded` ctx’yi güncellediği için vuruş sonrası grubu ctx’ten oku (önceki ownGroup null kalabiliyordu). */
  const shooterGroupNow = shooter === 'player' ? ctx.playerGroup : ctx.aiGroup;
  let continueTurn = false;

  if (ctx.openTable) {
    const legallyPottedGroupBall = pottedMeta.find((b) => b.kind === 'solid' || b.kind === 'stripe');
    if (legallyPottedGroupBall) {
      continueTurn = true;
    }
  } else if (shooterGroupNow) {
    continueTurn = pottedMeta.some((b) => kindToGroup(b.kind) === shooterGroupNow);
  }

  return {
    nextTurn: continueTurn ? shooter : opponent,
    continueWithSamePlayer: continueTurn,
    foul: 'none',
    playerWon: false,
    playerLost: false,
    reason: continueTurn ? 'Good shot — your turn again.' : 'Opponent’s turn.',
    respawnCueInKitchen: false,
    assignedGroup: assign,
  };
}

function foulMessage(f: FoulKind): string {
  switch (f) {
    case 'wrong_ball_first':
      return 'You must hit your own group first.';
    case 'no_ball_hit':
      return 'No ball contacted — foul.';
    case 'scratch':
      return 'Scratch.';
    case 'eight_early':
      return 'Illegal contact with the 8 — foul.';
    case 'no_rail_contact':
      return 'No rail after contact — foul.';
    case 'illegal_break':
      return 'Illegal break — pot a ball or drive four balls to a rail.';
    default:
      return 'Foul.';
  }
}

/**
 * Açık masada potlanan solid/stripe’lara göre grupları ata (WPA: aynı anda birden fazlaysa en düşük numara).
 * `ctx.openTable === true` ve uygun vuruş koşulları yoksa `null`.
 */
function tryAssignOpenTableFromPotted(
  ctx: RulesContext,
  shooter: PlayerId,
  shot: ShotOutcome,
  balls: BallMeta[],
  pottedMeta: BallMeta[],
): { player: BallGroup; ai: BallGroup } | null {
  if (!ctx.openTable) return null;
  if (!shot.anyBallMoved || !shot.firstHitId) return null;

  const first = balls.find((b) => b.id === shot.firstHitId);
  if (!first || first.kind === 'cue') return null;

  const groupBalls = pottedMeta.filter((b) => b.kind === 'solid' || b.kind === 'stripe');
  if (!groupBalls.length) return null;
  let pottedGroupBall = groupBalls[0]!;
  for (const b of groupBalls) {
    if (b.number < pottedGroupBall.number) pottedGroupBall = b;
  }

  const group = kindToGroup(pottedGroupBall.kind);
  if (!group) return null;

  ctx.openTable = false;
  if (shooter === 'player') {
    ctx.playerGroup = group;
    ctx.aiGroup = group === 'solid' ? 'stripe' : 'solid';
  } else {
    ctx.aiGroup = group;
    ctx.playerGroup = group === 'solid' ? 'stripe' : 'solid';
  }
  return { player: ctx.playerGroup!, ai: ctx.aiGroup! };
}

function assignIfNeeded(
  ctx: RulesContext,
  shooter: PlayerId,
  shot: ShotOutcome,
  balls: BallMeta[],
  pottedMeta: BallMeta[],
  scratched: boolean,
): { player: BallGroup; ai: BallGroup } | null {
  if (!ctx.openTable || scratched) return null;
  return tryAssignOpenTableFromPotted(ctx, shooter, shot, balls, pottedMeta);
}
