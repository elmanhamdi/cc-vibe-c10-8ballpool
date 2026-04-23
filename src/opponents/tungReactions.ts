/**
 * Tung reaction art: keys must match `DIALOGUE_BANK` lines exactly (player_miss / player_foul).
 * Files live under `public/opponents/tung/reactions/`.
 */
const TUNG_REACTION_FILE_BY_LINE: Record<string, string> = {
  // player_miss — taunt / mock / confident
  'Want a free lesson?': 'tung_happy.png',
  'You really tried that angle?': 'tung_crazy_laugh.png',
  'That one was almost harder to miss…': 'tung_laugh.png',
  'Watch this.': 'tung_angry.png',
  'Warm-up over already?': 'tung_laugh.png',

  // player_foul — rule / cold / harsh / sarcastic
  'Might want to skim the rulebook.': 'tung_happy.png',
  'No contact — my turn.': 'tung_sad.png',
  'Easy. Show the table some respect.': 'tung_angry.png',
  'Bold shot. Bold choice.': 'tung_crazy_laugh.png',
};

export function tungReactionPortraitUrlForLine(baseUrl: string, spokenLine: string): string {
  const dir = `${baseUrl}opponents/tung/reactions/`;
  const file = TUNG_REACTION_FILE_BY_LINE[spokenLine] ?? 'tung_laugh.png';
  return `${dir}${file}`;
}
