/**
 * Account level (XP) curve.
 *
 * Each level requires a fixed amount of XP that grows linearly with the level
 * index, so early levels feel quick (matching the reference "119 / 150 EXP" feel)
 * and later levels are progressively grindier.
 *
 *   xpForLevel(n) = 150 + 50 * (n - 1)
 *
 * Cumulative thresholds:
 *   L1 starts at 0 XP, L2 at 150, L3 at 350, L4 at 600, L5 at 900, ...
 */

const FIRST_LEVEL_XP = 150;
const PER_LEVEL_INCREMENT = 50;

export interface AccountLevelInfo {
  /** 1-based level (L1 means brand new account). */
  level: number;
  /** XP earned within the current level. */
  xpInLevel: number;
  /** XP required to fill the current level. */
  xpToNextLevel: number;
  /** 0..1 progress to next level. */
  progress01: number;
}

/** XP threshold (cumulative) at which the player reaches `level`. Level 1 = 0. */
export function thresholdForLevel(level: number): number {
  if (level <= 1) return 0;
  // Sum of arithmetic series: FIRST_LEVEL_XP * (n-1) + PER_LEVEL_INCREMENT * (n-2)*(n-1)/2
  const n = Math.floor(level) - 1;
  return FIRST_LEVEL_XP * n + PER_LEVEL_INCREMENT * ((n * (n - 1)) / 2);
}

/** XP required to *fill* the given level (L1 → 150, L2 → 200, …). */
export function xpForLevel(level: number): number {
  if (level < 1) return FIRST_LEVEL_XP;
  return FIRST_LEVEL_XP + PER_LEVEL_INCREMENT * (Math.floor(level) - 1);
}

export function accountFromXp(totalXp: number): AccountLevelInfo {
  const xp = Math.max(0, Math.floor(totalXp));
  let level = 1;
  let consumed = 0;
  // Cap iteration to keep this O(n) in level (worst case ~1000s).
  while (true) {
    const need = xpForLevel(level);
    if (xp - consumed < need) break;
    consumed += need;
    level += 1;
    if (level > 9999) break;
  }
  const xpInLevel = xp - consumed;
  const xpToNextLevel = xpForLevel(level);
  const progress01 = Math.max(0, Math.min(1, xpInLevel / Math.max(1, xpToNextLevel)));
  return { level, xpInLevel, xpToNextLevel, progress01 };
}

/** XP awarded for a finished match; mirrors the menu plan. */
export const XP_REWARD_WIN = 60;
export const XP_REWARD_LOSS = 15;
export const XP_REWARD_PER_BALL_POTTED = 5;
