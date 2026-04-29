import type { DifficultyTier } from './types.js';

export interface TierParams {
  aimNoiseRad: number;
  powerJitter: number;
  mistakeChance: number;
  spinUsage: number;
}

const TABLE: Record<DifficultyTier, TierParams> = {
  apprentice: { aimNoiseRad: 0.14, powerJitter: 0.18, mistakeChance: 0.28, spinUsage: 0.04 },
  beginner: { aimNoiseRad: 0.1, powerJitter: 0.15, mistakeChance: 0.2, spinUsage: 0.1 },
  intermediate: { aimNoiseRad: 0.07, powerJitter: 0.11, mistakeChance: 0.13, spinUsage: 0.2 },
  skilled: { aimNoiseRad: 0.05, powerJitter: 0.08, mistakeChance: 0.09, spinUsage: 0.3 },
  advanced: { aimNoiseRad: 0.035, powerJitter: 0.06, mistakeChance: 0.06, spinUsage: 0.42 },
  expert: { aimNoiseRad: 0.022, powerJitter: 0.04, mistakeChance: 0.035, spinUsage: 0.54 },
  master: { aimNoiseRad: 0.012, powerJitter: 0.025, mistakeChance: 0.018, spinUsage: 0.65 },
};

export function tierParams(tier: DifficultyTier): TierParams {
  return TABLE[tier];
}
