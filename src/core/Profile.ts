export type RankId = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';

export interface RankDef {
  id: RankId;
  name: string;
  minWins: number;
}

export interface PlayerProfile {
  coins: number;
  wins: number;
  losses: number;
  currentStreak: number;
  bestStreak: number;
  ownedCueIds: string[];
  equippedCueId: string;
  /** Cached cue stats for the equipped cue to avoid lookups on load. */
  equippedCueStats?: {
    power: number;
    aim: number;
    spin: number;
  };
}

export interface RankSnapshot {
  id: RankId;
  name: string;
  index: number;
  nextName: string | null;
  nextAtWins: number | null;
  progress01: number;
}

export interface ProfileView extends PlayerProfile {
  rank: RankSnapshot;
  winRate: number;
}

export const COIN_REWARD_WIN = 50;

export const RANKS: RankDef[] = [
  { id: 'bronze', name: 'Bronze', minWins: 0 },
  { id: 'silver', name: 'Silver', minWins: 5 },
  { id: 'gold', name: 'Gold', minWins: 12 },
  { id: 'platinum', name: 'Platinum', minWins: 22 },
  { id: 'diamond', name: 'Diamond', minWins: 35 },
];

export function defaultProfile(): PlayerProfile {
  return {
    coins: 300,
    wins: 0,
    losses: 0,
    currentStreak: 0,
    bestStreak: 0,
    ownedCueIds: ['classic'],
    equippedCueId: 'classic',
    equippedCueStats: undefined,
  };
}

export function computeRank(wins: number): RankSnapshot {
  const ladder = RANKS;
  let idx = 0;
  for (let i = ladder.length - 1; i >= 0; i--) {
    if (wins >= ladder[i]!.minWins) {
      idx = i;
      break;
    }
  }
  const current = ladder[idx]!;
  const next = ladder[idx + 1] ?? null;
  const progress01 =
    next == null
      ? 1
      : Math.max(0, Math.min(1, (wins - current.minWins) / Math.max(1, next.minWins - current.minWins)));
  return {
    id: current.id,
    name: current.name,
    index: idx,
    nextName: next?.name ?? null,
    nextAtWins: next?.minWins ?? null,
    progress01,
  };
}

export function hydrateProfile(raw: unknown): PlayerProfile {
  const base = defaultProfile();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const str = (v: unknown): string => (typeof v === 'string' && v.trim().length > 0 ? v : '');
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.map(str).filter((s) => s.length > 0) : [];
  const owned = arr(r.ownedCueIds);
  const equipped = str(r.equippedCueId);
  return {
    coins: Math.max(base.coins, clampNonNegative(num(r.coins))),
    wins: clampNonNegative(num(r.wins)),
    losses: clampNonNegative(num(r.losses)),
    currentStreak: clampNonNegative(num(r.currentStreak)),
    bestStreak: clampNonNegative(num(r.bestStreak)),
    ownedCueIds: owned.length > 0 ? owned : base.ownedCueIds,
    equippedCueId: equipped || (owned.length > 0 ? owned[0]! : base.equippedCueId),
    equippedCueStats: undefined,
  };
}

function clampNonNegative(n: number): number {
  return Math.max(0, Math.floor(n));
}
