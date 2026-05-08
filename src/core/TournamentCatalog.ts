import type { AICharacterProfile, DifficultyTier } from '../ai/types.js';

/**
 * Tournament catalog.
 *
 * Each entry differentiates a run on four axes: opponent pool, match count,
 * entry fee, and champion bonus. The mode-select swipe page renders one card
 * per def (plus the fixed Casual card).
 */

export type TournamentTier = 'rookie' | 'pro' | 'elite' | 'grandslam';

export interface TournamentOpponentSlot {
  id: string;
  /** Added to career-step scaling output before clamping. */
  tierOffset?: number;
  minTier?: DifficultyTier;
  maxTier?: DifficultyTier;
  /** If set, bypasses scaling and forces an exact tier. */
  fixedTier?: DifficultyTier;
}

export interface TournamentDef {
  id: TournamentTier;
  name: string;
  tagline: string;
  blurb: string;
  matchCount: number;
  entryFeeCoins: number;
  championBonusCoins: number;
  championBonusXp: number;
  difficulty: 1 | 2 | 3 | 4 | 5;
  /** Slug for CSS theming (`.modeselect-card-${accent}`). */
  accent: string;
  /**
   * Resolves the opponent ids in match order. Implementations may shuffle but
   * must return exactly `matchCount` unique ids drawn from `roster`.
   */
  pickOpponents: (roster: readonly AICharacterProfile[], rng?: () => number) => TournamentOpponentSlot[];
}

/** Plain snapshot exposed to the UI (drops the function-shaped `pickOpponents`). */
export interface TournamentDefView {
  id: TournamentTier;
  name: string;
  tagline: string;
  blurb: string;
  matchCount: number;
  entryFeeCoins: number;
  championBonusCoins: number;
  championBonusXp: number;
  difficulty: number;
  accent: string;
}

export function toTournamentDefView(d: TournamentDef): TournamentDefView {
  return {
    id: d.id,
    name: d.name,
    tagline: d.tagline,
    blurb: d.blurb,
    matchCount: d.matchCount,
    entryFeeCoins: d.entryFeeCoins,
    championBonusCoins: d.championBonusCoins,
    championBonusXp: d.championBonusXp,
    difficulty: d.difficulty,
    accent: d.accent,
  };
}

function shuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function sortedByAccuracy(roster: readonly AICharacterProfile[]): AICharacterProfile[] {
  return [...roster].sort((a, b) => a.accuracy - b.accuracy);
}

function bucketSlice(
  roster: readonly AICharacterProfile[],
  from: number,
  to: number,
): AICharacterProfile[] {
  const sorted = sortedByAccuracy(roster);
  const lo = Math.max(0, Math.min(sorted.length, from));
  const hi = Math.max(lo, Math.min(sorted.length, to));
  return sorted.slice(lo, hi);
}

/** Fallback: take the lowest-accuracy `count` opponents when a slice underflows. */
function fillFromBottom(
  roster: readonly AICharacterProfile[],
  excludeIds: ReadonlySet<string>,
  count: number,
): AICharacterProfile[] {
  const sorted = sortedByAccuracy(roster);
  const out: AICharacterProfile[] = [];
  for (const o of sorted) {
    if (excludeIds.has(o.id)) continue;
    out.push(o);
    if (out.length >= count) break;
  }
  return out;
}

function pickFromBucket(
  bucket: readonly AICharacterProfile[],
  count: number,
  rng: () => number,
): AICharacterProfile[] {
  if (bucket.length <= count) return [...bucket];
  return shuffle(bucket, rng).slice(0, count);
}

function slot(
  id: string,
  cfg?: Pick<TournamentOpponentSlot, 'tierOffset' | 'minTier' | 'maxTier' | 'fixedTier'>,
): TournamentOpponentSlot {
  return {
    id,
    tierOffset: cfg?.tierOffset,
    minTier: cfg?.minTier,
    maxTier: cfg?.maxTier,
    fixedTier: cfg?.fixedTier,
  };
}

export const TOURNAMENT_CATALOG: readonly TournamentDef[] = [
  {
    id: 'rookie',
    name: 'Rookie Cup',
    tagline: 'Quick warm-up',
    blurb: '3 short matches against the apprentice tier. A safe place to test your cue.',
    matchCount: 3,
    entryFeeCoins: 50,
    championBonusCoins: 200,
    championBonusXp: 120,
    difficulty: 1,
    accent: 'rookie',
    pickOpponents: (roster, rng = Math.random) => {
      const slice = bucketSlice(roster, 0, 3);
      let chosen = pickFromBucket(slice, 3, rng);
      if (chosen.length < 3) {
        const exclude = new Set(chosen.map((o) => o.id));
        chosen = chosen.concat(fillFromBottom(roster, exclude, 3 - chosen.length));
      }
      const ids = chosen.map((o) => o.id);
      return ids.map((id, idx) =>
        slot(id, {
          tierOffset: idx === 0 ? -2 : idx === 1 ? -1 : 0,
          minTier: 'apprentice',
          maxTier: 'advanced',
        }),
      );
    },
  },
  {
    id: 'pro',
    name: 'Pro Series',
    tagline: 'Balanced gauntlet',
    blurb: '3 matches across the roster bands. A compact classic loop.',
    matchCount: 3,
    entryFeeCoins: 150,
    championBonusCoins: 300,
    championBonusXp: 250,
    difficulty: 2,
    accent: 'pro',
    pickOpponents: (roster, rng = Math.random) => {
      const sorted = sortedByAccuracy(roster);
      if (sorted.length <= 3) {
        return sorted.map((o, idx) =>
          slot(o.id, {
            tierOffset: idx - 1,
            minTier: 'beginner',
            maxTier: 'expert',
          }),
        );
      }
      const buckets = 3;
      const size = sorted.length / buckets;
      const out: TournamentOpponentSlot[] = [];
      for (let i = 0; i < buckets; i++) {
        const start = Math.floor(i * size);
        const end = Math.floor((i + 1) * size);
        const bucket = sorted.slice(start, end);
        if (bucket.length === 0) continue;
        const idx = Math.min(bucket.length - 1, Math.floor(rng() * bucket.length));
        out.push(
          slot(bucket[idx]!.id, {
            tierOffset: i - 1,
            minTier: 'beginner',
            maxTier: 'expert',
          }),
        );
      }
      return out;
    },
  },
  {
    id: 'elite',
    name: 'Elite Brawl',
    tagline: 'Skilled to expert',
    blurb: '3 tougher matches with no warm-ups.',
    matchCount: 3,
    entryFeeCoins: 400,
    championBonusCoins: 500,
    championBonusXp: 500,
    difficulty: 4,
    accent: 'elite',
    pickOpponents: (roster, rng = Math.random) => {
      const slice = bucketSlice(roster, 3, 7);
      let chosen = pickFromBucket(slice, 3, rng);
      if (chosen.length < 3) {
        const exclude = new Set(chosen.map((o) => o.id));
        chosen = chosen.concat(fillFromBottom(roster, exclude, 3 - chosen.length));
      }
      const ids = chosen.map((o) => o.id);
      return ids.map((id, idx) =>
        slot(id, {
          tierOffset: idx,
          minTier: 'intermediate',
          maxTier: 'master',
        }),
      );
    },
  },
  {
    id: 'grandslam',
    name: 'Grand Slam',
    tagline: 'The masters tour',
    blurb: 'Three ascending matches ending in the toughest duel. Win all three for the grand prize.',
    matchCount: 3,
    entryFeeCoins: 1000,
    championBonusCoins: 1000,
    championBonusXp: 1000,
    difficulty: 5,
    accent: 'grandslam',
    pickOpponents: (roster) => {
      /** Fixed escalating slope so M4 is always the master/expert end of the roster. */
      const slice = bucketSlice(roster, 4, 8);
      let chosen = slice;
      if (chosen.length < 3) {
        const exclude = new Set(chosen.map((o) => o.id));
        chosen = chosen.concat(fillFromBottom(roster, exclude, 3 - chosen.length));
      }
      const ids = chosen.map((o) => o.id);
      return ids.map((id, idx) =>
        slot(id, {
          tierOffset: idx + 1,
          minTier: 'advanced',
          maxTier: 'master',
        }),
      );
    },
  },
];

const BY_ID = new Map<TournamentTier, TournamentDef>(
  TOURNAMENT_CATALOG.map((d) => [d.id, d]),
);

export function findTournament(id: string): TournamentDef | undefined {
  return BY_ID.get(id as TournamentTier);
}

export function listTournamentViews(): readonly TournamentDefView[] {
  return TOURNAMENT_CATALOG.map(toTournamentDefView);
}
