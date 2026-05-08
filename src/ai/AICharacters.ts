import type { AICharacterProfile } from './types.js';

/** Ordered career ladder — difficulty ramps with personality variety. */
export const CAREER_OPPONENTS: AICharacterProfile[] = [
  {
    id: 'tungo',
    name: 'Tungo Biliardo',
    tier: 'apprentice',
    personality: 'toxic',
    accuracy: 0.42,
    risk: 0.18,
    pace: 1.05,
    cueId: 'street',
  },
  {
    id: 'gattotto_otto',
    name: 'Gattotto Otto',
    tier: 'apprentice',
    personality: 'funny',
    accuracy: 0.425,
    risk: 0.19,
    pace: 1.045,
    cueId: 'street',
  },
  {
    id: 'torta_tartaruga',
    name: 'Torta Tartaruga',
    tier: 'apprentice',
    personality: 'calm',
    accuracy: 0.43,
    risk: 0.2,
    pace: 1.04,
    cueId: 'classic',
  },
];
