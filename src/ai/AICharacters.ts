import type {
  AICharacterDefinition,
  AICharacterProfile,
  OpponentDialogueBehavior,
} from './types.js';

export const DEFAULT_DIALOGUE_BEHAVIOR: OpponentDialogueBehavior = {
  silenceChance: 0.16,
  tauntChance: 0.5,
  praiseChance: 0.3,
  aiGoodShotChance: 0.42,
  timeoutReactionChance: 0.7,
  noBallHitReactionChance: 0.58,
  foulReactionChance: 0.34,
  missReactionChance: 0.34,
};

/**
 * Add future opponents only here.
 * Engine uses this as single source for profile + behavior traits.
 */
export const CHARACTER_DEFINITIONS: readonly AICharacterDefinition[] = [
  {
    profile: {
      id: 'tungo',
      name: 'Tungo Biliardo',
      tier: 'apprentice',
      personality: 'toxic',
      accuracy: 0.42,
      risk: 0.18,
      pace: 1.05,
      cueId: 'street',
    },
    behavior: {
      silenceChance: 0.07,
      tauntChance: 0.76,
      praiseChance: 0.2,
      aiGoodShotChance: 0.68,
      timeoutReactionChance: 0.9,
      noBallHitReactionChance: 0.82,
      foulReactionChance: 0.52,
      missReactionChance: 0.56,
    },
  },
  {
    profile: {
      id: 'gattotto_otto',
      name: 'Gattotto Otto',
      tier: 'apprentice',
      personality: 'funny',
      accuracy: 0.425,
      risk: 0.19,
      pace: 1.045,
      cueId: 'street',
    },
    behavior: {
      silenceChance: 0.14,
      tauntChance: 0.44,
      praiseChance: 0.58,
      aiGoodShotChance: 0.34,
      timeoutReactionChance: 0.7,
      noBallHitReactionChance: 0.6,
      foulReactionChance: 0.28,
      missReactionChance: 0.3,
    },
  },
  {
    profile: {
      id: 'torta_tartaruga',
      name: 'Torta Tartaruga',
      tier: 'apprentice',
      personality: 'calm',
      accuracy: 0.43,
      risk: 0.2,
      pace: 1.04,
      cueId: 'classic',
    },
    behavior: {
      silenceChance: 0.2,
      tauntChance: 0.35,
      praiseChance: 0.52,
      aiGoodShotChance: 0.38,
      timeoutReactionChance: 0.62,
      noBallHitReactionChance: 0.5,
      foulReactionChance: 0.25,
      missReactionChance: 0.22,
    },
  },
];

/** Ordered career ladder for gameplay systems expecting plain AI profiles. */
export const CAREER_OPPONENTS: AICharacterProfile[] = CHARACTER_DEFINITIONS.map((x) => x.profile);

const DEF_BY_ID = new Map(CHARACTER_DEFINITIONS.map((x) => [x.profile.id, x] as const));

export function getCharacterDefinitionById(id: string): AICharacterDefinition | null {
  return DEF_BY_ID.get(id) ?? null;
}

export function getOpponentDialogueBehavior(id: string): OpponentDialogueBehavior {
  const found = DEF_BY_ID.get(id)?.behavior;
  if (!found) return DEFAULT_DIALOGUE_BEHAVIOR;
  return { ...DEFAULT_DIALOGUE_BEHAVIOR, ...found };
}
