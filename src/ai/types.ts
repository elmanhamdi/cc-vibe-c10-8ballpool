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
}
