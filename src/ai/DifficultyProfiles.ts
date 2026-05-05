import type { DifficultyTier } from './types.js';

export interface TierParams {
  aimNoiseRad: number;
  powerJitter: number;
  mistakeChance: number;
  spinUsage: number;
}

const TABLE: Record<DifficultyTier, TierParams> = {
  apprentice: { aimNoiseRad: 0.075, powerJitter: 0.126, mistakeChance: 0.14, spinUsage: 0.04 },
  beginner: { aimNoiseRad: 0.05, powerJitter: 0.105, mistakeChance: 0.1, spinUsage: 0.1 },
  intermediate: { aimNoiseRad: 0.035, powerJitter: 0.077, mistakeChance: 0.065, spinUsage: 0.2 },
  skilled: { aimNoiseRad: 0.025, powerJitter: 0.056, mistakeChance: 0.045, spinUsage: 0.3 },
  advanced: { aimNoiseRad: 0.018, powerJitter: 0.042, mistakeChance: 0.03, spinUsage: 0.42 },
  expert: { aimNoiseRad: 0.011, powerJitter: 0.028, mistakeChance: 0.018, spinUsage: 0.54 },
  master: { aimNoiseRad: 0.006, powerJitter: 0.018, mistakeChance: 0.008, spinUsage: 0.65 },
};

export function tierParams(tier: DifficultyTier): TierParams {
  return TABLE[tier];
}
