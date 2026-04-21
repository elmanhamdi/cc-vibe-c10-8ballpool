export type {
  BallGroup,
  RulesContext,
  FoulKind,
  TurnResolution,
  BallMeta,
} from './rules.types.js';

export { kindToGroup, resolveEightBallRules } from './rules.types.js';

import type { PlayerId } from '../core/types.js';
import type { TurnResolution } from './rules.types.js';

/** Player ran out of shot time — treat as miss / foul without cue movement. */
export function resolveTurnTimeout(shooter: PlayerId): TurnResolution {
  const opponent: PlayerId = shooter === 'player' ? 'ai' : 'player';
  return {
    nextTurn: opponent,
    continueWithSamePlayer: false,
    foul: 'turn_timeout',
    playerWon: false,
    playerLost: false,
    reason: 'Time’s up — opponent’s turn.',
    respawnCueInKitchen: false,
    assignedGroup: null,
  };
}
