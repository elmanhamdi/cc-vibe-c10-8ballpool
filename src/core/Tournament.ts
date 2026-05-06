import type { TournamentTier } from './TournamentCatalog.js';

/**
 * Tournament run state — runtime only (no persistence in v1).
 *
 * The active definition (`defId`) drives both the opponent draw and the reward
 * bookkeeping (per-def champion bonus, entry fee, match count).
 */

export type TournamentSlotStatus = 'pending' | 'won' | 'lost';
export type TournamentStatus = 'active' | 'won' | 'lost';

export interface TournamentRun {
  /** Catalog id this run belongs to. */
  defId: TournamentTier;
  /** Resolved opponent ids in match order; length === def.matchCount. */
  opponents: string[];
  /** Index of the next match to play (0..opponents.length). */
  currentRound: number;
  /** Per-match outcome; pending until played. */
  record: TournamentSlotStatus[];
  status: TournamentStatus;
}

export function createPendingRun(
  defId: TournamentTier,
  opponents: string[],
): TournamentRun {
  return {
    defId,
    opponents,
    currentRound: 0,
    record: opponents.map(() => 'pending' as TournamentSlotStatus),
    status: 'active',
  };
}
