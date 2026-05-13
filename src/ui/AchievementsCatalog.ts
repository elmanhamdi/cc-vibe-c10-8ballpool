import type { ProfileHudView } from '../world/renderTypes.js';

/**
 * Achievement system — small, predicate-based catalog evaluated against the
 * current profile snapshot. Adding a new milestone is a single entry; no engine
 * changes needed.
 *
 * `progress01` is optional: when present, locked rows show a thin progress bar.
 */
export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  /** CSS-class hint that drives the round badge visual (no SVG needed). */
  iconKind:
    | 'trophy'
    | 'medal'
    | 'star'
    | 'flame'
    | 'rank'
    | 'cue'
    | 'crown'
    | 'target'
    | 'coin';
  /** Reward shown in the modal (visual only — XP is awarded by matches). */
  rewardLabel?: string;
  unlocked: (p: ProfileHudView) => boolean;
  /** 0..1 progress for locked rows. Omit for binary predicates. */
  progress01?: (p: ProfileHudView) => number;
}

function pct(value: number, target: number): number {
  if (target <= 0) return 1;
  return Math.max(0, Math.min(1, value / target));
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  {
    id: 'first-win',
    name: 'First Win',
    desc: 'Win your first match.',
    iconKind: 'star',
    rewardLabel: '+25 XP',
    unlocked: (p) => p.wins >= 1,
    progress01: (p) => pct(p.wins, 1),
  },
  {
    id: 'wins-10',
    name: 'Pool Regular',
    desc: 'Reach 10 wins vs Brainrots.',
    iconKind: 'trophy',
    rewardLabel: '+50 XP',
    unlocked: (p) => p.wins >= 10,
    progress01: (p) => pct(p.wins, 10),
  },
  {
    id: 'wins-25',
    name: 'Pool Pro',
    desc: 'Reach 25 wins vs Brainrots.',
    iconKind: 'crown',
    rewardLabel: '+150 XP',
    unlocked: (p) => p.wins >= 25,
    progress01: (p) => pct(p.wins, 25),
  },
  {
    id: 'streak-5',
    name: 'Hot Streak',
    desc: 'Win 5 matches in a row.',
    iconKind: 'flame',
    rewardLabel: '+75 XP',
    unlocked: (p) => p.bestStreak >= 5,
    progress01: (p) => pct(p.bestStreak, 5),
  },
  {
    id: 'rank-silver',
    name: 'Silver Reached',
    desc: 'Climb to the Silver rank.',
    iconKind: 'rank',
    rewardLabel: '+50 XP',
    unlocked: (p) => p.rankIndex >= 1,
  },
  {
    id: 'rank-gold',
    name: 'Gold Reached',
    desc: 'Climb to the Gold rank.',
    iconKind: 'rank',
    rewardLabel: '+100 XP',
    unlocked: (p) => p.rankIndex >= 2,
  },
  {
    id: 'rank-diamond',
    name: 'Diamond Tier',
    desc: 'Reach the highest rank — Diamond.',
    iconKind: 'rank',
    rewardLabel: '+250 XP',
    unlocked: (p) => p.rankIndex >= 4,
  },
  {
    id: 'cue-collector',
    name: 'Cue Collector',
    desc: 'Own 3 different cues.',
    iconKind: 'cue',
    rewardLabel: '+50 XP',
    unlocked: (p) => p.ownedCueIds.length >= 3,
    progress01: (p) => pct(p.ownedCueIds.length, 3),
  },
  {
    id: 'cue-connoisseur',
    name: 'Cue Connoisseur',
    desc: 'Own all cues in the shop.',
    iconKind: 'cue',
    rewardLabel: '+200 XP',
    unlocked: (p) => p.ownedCueIds.length >= 4,
    progress01: (p) => pct(p.ownedCueIds.length, 4),
  },
  {
    id: 'brainrot-slayer',
    name: 'Brainrot Slayer',
    desc: 'Defeat your first Brainrot opponent.',
    iconKind: 'target',
    rewardLabel: '+50 XP',
    unlocked: (p) => p.highestLevelIndex >= 1,
  },
  {
    id: 'brainrot-master',
    name: 'Master of Brainrots',
    desc: 'Climb to the top of the Brainrots ladder.',
    iconKind: 'crown',
    rewardLabel: '+500 XP',
    unlocked: (p) => p.highestLevelIndex >= 7,
    progress01: (p) => pct(p.highestLevelIndex, 7),
  },
  {
    id: 'rich-hustler',
    name: 'Rich Hustler',
    desc: 'Save up 1,000 coins.',
    iconKind: 'coin',
    rewardLabel: '+75 XP',
    unlocked: (p) => p.coins >= 1000,
    progress01: (p) => pct(p.coins, 1000),
  },
];

export interface AchievementRow {
  def: AchievementDef;
  unlocked: boolean;
  progress01: number;
}

export function evaluateAchievements(p: ProfileHudView): AchievementRow[] {
  return ACHIEVEMENTS.map((def) => {
    const unlocked = def.unlocked(p);
    const progress01 = unlocked ? 1 : def.progress01?.(p) ?? 0;
    return { def, unlocked, progress01 };
  });
}
