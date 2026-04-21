export type DialogueCategory =
  | 'player_miss'
  | 'player_foul'
  | 'ai_good_shot'
  | 'pressure'
  | 'player_nice'
  | 'silent_beat';

export interface WeightedLine {
  text: string;
  weight: number;
}

export const DIALOGUE_BANK: Record<DialogueCategory, WeightedLine[]> = {
  player_miss: [
    { text: 'Want a free lesson?', weight: 1 },
    { text: 'You really tried that angle?', weight: 1.1 },
    { text: 'That one was almost harder to miss…', weight: 0.9 },
    { text: 'Watch this.', weight: 1 },
    { text: 'Warm-up over already?', weight: 0.8 },
  ],
  player_foul: [
    { text: 'Might want to skim the rulebook.', weight: 1 },
    { text: 'No contact — my turn.', weight: 1.1 },
    { text: 'Easy. Show the table some respect.', weight: 0.9 },
    { text: 'Bold shot. Bold choice.', weight: 0.85 },
  ],
  ai_good_shot: [
    { text: 'Nice shot — I’m taking notes.', weight: 1 },
    { text: 'Dead center.', weight: 0.9 },
    { text: 'You found the rhythm.', weight: 0.85 },
  ],
  pressure: [
    { text: 'Clock’s running down…', weight: 1 },
    { text: 'Final seconds — stay focused.', weight: 0.9 },
    { text: 'Slow is smooth, smooth is fast.', weight: 0.8 },
  ],
  player_nice: [
    { text: 'Good hand.', weight: 1 },
    { text: 'Clean pot.', weight: 0.9 },
  ],
  silent_beat: [{ text: '…', weight: 1 }],
};
