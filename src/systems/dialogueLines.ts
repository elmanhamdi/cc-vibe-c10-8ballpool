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

export type OpponentDialogueId = 'tungo' | 'torta_tartaruga' | 'gattotto_otto' | 'default';

export type DialogueBank = Record<DialogueCategory, WeightedLine[]>;

const DEFAULT_DIALOGUE_BANK: DialogueBank = {
  player_miss: [
    { text: 'Want a free lesson?', weight: 1 },
    { text: 'Watch this.', weight: 1 },
    { text: 'Warm-up over already?', weight: 0.8 },
  ],
  player_foul: [
    { text: 'No contact — my turn.', weight: 1.1 },
    { text: 'Easy. Show the table some respect.', weight: 0.9 },
    { text: 'Bold shot. Bold choice.', weight: 0.85 },
  ],
  ai_good_shot: [
    { text: 'That was clean.', weight: 1 },
    { text: 'I liked that cue control.', weight: 0.9 },
  ],
  pressure: [
    { text: 'Clock’s running down…', weight: 1 },
    { text: 'Final seconds — stay focused.', weight: 0.9 },
    { text: 'Slow is smooth, smooth is fast.', weight: 0.8 },
  ],
  player_nice: [
    { text: 'Nice pot.', weight: 1 },
    { text: 'Good hand.', weight: 0.9 },
  ],
  silent_beat: [{ text: '…', weight: 1 }],
};

export const DIALOGUE_BANK_BY_OPPONENT: Record<OpponentDialogueId, DialogueBank> = {
  tungo: {
    player_miss: [
      { text: 'That angle was comedy gold.', weight: 1.1 },
      { text: 'Did you call a miss on purpose?', weight: 1 },
      { text: 'You left me a free table. Thanks.', weight: 0.9 },
    ],
    player_foul: [
      { text: 'Rules are hard, huh?', weight: 1 },
      { text: 'No hit? That is rookie work.', weight: 1.1 },
      { text: 'Foul. I will take that gift.', weight: 0.9 },
    ],
    ai_good_shot: [
      { text: 'Boom. That is how it is done.', weight: 1 },
      { text: 'Try to keep up with me.', weight: 0.95 },
      { text: 'I run this table.', weight: 0.85 },
    ],
    pressure: [
      { text: 'Clock is bleeding. Shoot.', weight: 1 },
      { text: 'Tick-tock, hero.', weight: 1.05 },
      { text: 'You freeze, I finish.', weight: 0.8 },
    ],
    player_nice: [
      { text: 'Okay, that was sharp.', weight: 1 },
      { text: 'Good pot. Do it again.', weight: 0.9 },
      { text: 'Not bad. You woke up.', weight: 0.75 },
    ],
    silent_beat: [{ text: '…', weight: 1 }],
  },
  torta_tartaruga: {
    player_miss: [
      { text: 'Patience beats force.', weight: 1 },
      { text: 'You rushed that line.', weight: 1.05 },
      { text: 'Reset, breathe, and aim again.', weight: 0.85 },
    ],
    player_foul: [
      { text: 'That contact was illegal.', weight: 1.1 },
      { text: 'Foul called. Stay disciplined.', weight: 1 },
      { text: 'Control first, power second.', weight: 0.8 },
    ],
    ai_good_shot: [
      { text: 'Solid execution from me.', weight: 1 },
      { text: 'Textbook position play.', weight: 0.95 },
      { text: 'Clean and efficient.', weight: 0.9 },
    ],
    pressure: [
      { text: 'Time is part of the shot.', weight: 1 },
      { text: 'Stay calm and commit.', weight: 0.95 },
      { text: 'Read the table, then fire.', weight: 0.8 },
    ],
    player_nice: [
      { text: 'Well played.', weight: 1.1 },
      { text: 'Good shot. Respect.', weight: 1 },
      { text: 'Nice touch on that cue ball.', weight: 0.8 },
    ],
    silent_beat: [{ text: '…', weight: 1 }],
  },
  gattotto_otto: {
    player_miss: [
      { text: 'Oopsie... that one ran away.', weight: 1 },
      { text: 'I think the ball got shy.', weight: 0.95 },
      { text: 'Missed it! I still believe in you.', weight: 0.75 },
    ],
    player_foul: [
      { text: 'Uh-oh, foul time.', weight: 1 },
      { text: 'Hey! Rules are important!', weight: 0.95 },
      { text: 'No hit? That made me grumpy.', weight: 0.85 },
    ],
    ai_good_shot: [
      { text: 'Yay, that was pretty!', weight: 1 },
      { text: 'I did a smart shot! I think!', weight: 0.9 },
      { text: 'Hehe, that one was sneaky.', weight: 0.8 },
    ],
    pressure: [
      { text: 'Timer is scary... go now!', weight: 1 },
      { text: 'Please shoot before it beeps!', weight: 0.95 },
      { text: 'Hurry-hurry, paws are sweating!', weight: 0.8 },
    ],
    player_nice: [
      { text: 'Aww, that was lovely.', weight: 1.1 },
      { text: 'Great shot! I clap for you.', weight: 1 },
      { text: 'Nice one... I am a tiny bit mad.', weight: 0.7 },
    ],
    silent_beat: [{ text: '…', weight: 1 }],
  },
  default: DEFAULT_DIALOGUE_BANK,
};

export function dialogueLinesFor(category: DialogueCategory, opponentId?: string): WeightedLine[] {
  if (!opponentId) return DEFAULT_DIALOGUE_BANK[category];
  const byOpponent = DIALOGUE_BANK_BY_OPPONENT[opponentId as OpponentDialogueId];
  if (!byOpponent) return DEFAULT_DIALOGUE_BANK[category];
  return byOpponent[category] ?? DEFAULT_DIALOGUE_BANK[category];
}
