export type DifficultyTier =
  | 'apprentice'
  | 'beginner'
  | 'intermediate'
  | 'skilled'
  | 'advanced'
  | 'expert'
  | 'master';

export type PersonalityKind = 'toxic' | 'calm' | 'funny' | 'silent';

export interface AICharacterProfile {
  id: string;
  name: string;
  tier: DifficultyTier;
  personality: PersonalityKind;
  /** 0–1 baseline potting accuracy. */
  accuracy: number;
  /** 0–1 willingness to try hard cut shots / power. */
  risk: number;
  /** Multiplier on thinking delay (lower = faster). */
  pace: number;
  /** Cue id from shared catalog. */
  cueId?: string;
}

/**
 * Opponent's non-physics behavior in moment-to-moment match flow.
 * Keep this data-driven so new characters can be added without engine edits.
 */
export interface OpponentDialogueBehavior {
  silenceChance: number;
  tauntChance: number;
  praiseChance: number;
  aiGoodShotChance: number;
  timeoutReactionChance: number;
  noBallHitReactionChance: number;
  foulReactionChance: number;
  missReactionChance: number;
}

/** Single-source character record for quick future additions. */
export interface AICharacterDefinition {
  profile: AICharacterProfile;
  behavior?: Partial<OpponentDialogueBehavior>;
}
