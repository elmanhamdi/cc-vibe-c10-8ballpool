import type { DifficultyTier } from './types.js';

export interface TierParams {
  /** Aim noise added to final angle (radians). */
  aimNoiseRad: number;
  /** Power jitter (±). */
  powerJitter: number;
  /** Random hard-mistake chance after plan selection. */
  mistakeChance: number;
  /** 0..1 willingness to use spin / english. */
  spinUsage: number;

  /** Bank shot (1-rail) consideration in plan generation. */
  allowBank: boolean;
  /** 2-ball combination consideration. */
  allowCombo: boolean;
  /** 0..1 weight of cue-ball leave (next-shot quality) in scoring. */
  positionPlay: number;
  /** 0..1 willingness to play snooker / safety when no good shot exists. */
  safetyAggression: number;
  /** Safety lookahead simulation depth (0 = simple, 1 = simulate opponent reply). */
  lookaheadDepth: 0 | 1;
}

const TABLE: Record<DifficultyTier, TierParams> = {
  apprentice: {
    aimNoiseRad: 0.038,
    powerJitter: 0.085,
    mistakeChance: 0.09,
    spinUsage: 0.05,
    allowBank: false,
    allowCombo: false,
    positionPlay: 0.0,
    safetyAggression: 0.04,
    lookaheadDepth: 0,
  },
  beginner: {
    aimNoiseRad: 0.028,
    powerJitter: 0.072,
    mistakeChance: 0.065,
    spinUsage: 0.12,
    allowBank: false,
    allowCombo: false,
    positionPlay: 0.15,
    safetyAggression: 0.08,
    lookaheadDepth: 0,
  },
  intermediate: {
    aimNoiseRad: 0.018,
    powerJitter: 0.052,
    mistakeChance: 0.04,
    spinUsage: 0.22,
    allowBank: true,
    allowCombo: false,
    positionPlay: 0.40,
    safetyAggression: 0.14,
    lookaheadDepth: 0,
  },
  skilled: {
    aimNoiseRad: 0.012,
    powerJitter: 0.038,
    mistakeChance: 0.026,
    spinUsage: 0.32,
    allowBank: true,
    allowCombo: true,
    positionPlay: 0.60,
    safetyAggression: 0.2,
    lookaheadDepth: 0,
  },
  advanced: {
    aimNoiseRad: 0.0085,
    powerJitter: 0.027,
    mistakeChance: 0.016,
    spinUsage: 0.46,
    allowBank: true,
    allowCombo: true,
    positionPlay: 0.75,
    safetyAggression: 0.28,
    lookaheadDepth: 1,
  },
  expert: {
    aimNoiseRad: 0.0048,
    powerJitter: 0.018,
    mistakeChance: 0.009,
    spinUsage: 0.58,
    allowBank: true,
    allowCombo: true,
    positionPlay: 0.90,
    safetyAggression: 0.34,
    lookaheadDepth: 1,
  },
  master: {
    aimNoiseRad: 0.0022,
    powerJitter: 0.009,
    mistakeChance: 0.004,
    spinUsage: 0.7,
    allowBank: true,
    allowCombo: true,
    positionPlay: 1.0,
    safetyAggression: 0.4,
    lookaheadDepth: 1,
  },
};

export function tierParams(tier: DifficultyTier): TierParams {
  return TABLE[tier];
}
