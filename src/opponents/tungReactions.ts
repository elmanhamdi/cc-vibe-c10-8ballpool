/**
 * Tung reaction art: keys must match `DIALOGUE_BANK` lines exactly (player_miss / player_foul).
 * Asset IDs map to [AssetManifest](src/assets/AssetManifest.ts).
 */
const TUNG_REACTION_ASSET_BY_LINE: Record<string, string> = {
  // player_miss — taunt / mock / confident (bias to harsher tone)
  'Want a free lesson?': 'ui.opponent.tung.reaction.angry',
  'You really tried that angle?': 'ui.opponent.tung.reaction.crazyLaugh',
  'That one was almost harder to miss…': 'ui.opponent.tung.reaction.crazyLaugh',
  'Watch this.': 'ui.opponent.tung.reaction.angry',
  'Warm-up over already?': 'ui.opponent.tung.reaction.laugh',

  // player_foul — rule / cold / harsh / sarcastic
  'Might want to skim the rulebook.': 'ui.opponent.tung.reaction.angry',
  'No contact — my turn.': 'ui.opponent.tung.reaction.angry',
  'Easy. Show the table some respect.': 'ui.opponent.tung.reaction.angry',
  'Bold shot. Bold choice.': 'ui.opponent.tung.reaction.crazyLaugh',
};

export const TUNG_DEFAULT_REACTION_ASSET_ID = 'ui.opponent.tung.reaction.angry';

export function tungReactionPortraitAssetIdForLine(spokenLine: string): string {
  return TUNG_REACTION_ASSET_BY_LINE[spokenLine] ?? TUNG_DEFAULT_REACTION_ASSET_ID;
}
