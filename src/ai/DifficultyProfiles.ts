import type { DifficultyTier } from './types.js';

export interface TierParams {
  aimNoiseRad: number;
  powerJitter: number;
  mistakeChance: number;
  spinUsage: number;
}

const TABLE: Record<DifficultyTier, TierParams> = {
  apprentice: { aimNoiseRad: 0.16, powerJitter: 0.22, mistakeChance: 0.35, spinUsage: 0.05 },
  beginner: { aimNoiseRad: 0.11, powerJitter: 0.16, mistakeChance: 0.22, spinUsage: 0.12 },
  intermediate: { aimNoiseRad: 0.075, powerJitter: 0.12, mistakeChance: 0.14, spinUsage: 0.22 },
  skilled: { aimNoiseRad: 0.05, powerJitter: 0.09, mistakeChance: 0.09, spinUsage: 0.32 },
  advanced: { aimNoiseRad: 0.035, powerJitter: 0.06, mistakeChance: 0.06, spinUsage: 0.42 },
  expert: { aimNoiseRad: 0.022, powerJitter: 0.04, mistakeChance: 0.035, spinUsage: 0.52 },
  master: { aimNoiseRad: 0.012, powerJitter: 0.025, mistakeChance: 0.018, spinUsage: 0.62 },
};

export function tierParams(tier: DifficultyTier): TierParams {
  return TABLE[tier];
}
