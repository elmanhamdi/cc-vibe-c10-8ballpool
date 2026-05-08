/**
 * Gattotto Otto — `public/opponents/gattotto_otto/reactions/` (same trigger set as Tungo / Torta).
 */

import type { PortraitLineKey, TungoReactionKind } from './tungoReactions.js';

export const GATTOTTO_OTTO_DEFAULT_REACTION_ASSET_ID = 'ui.opponent.gattotto_otto.reaction.smile';

const ASSET_BY_KIND: Record<TungoReactionKind, string> = {
  ball: 'ui.opponent.gattotto_otto.reaction.ball',
  cry: 'ui.opponent.gattotto_otto.reaction.cry',
  lastBall: 'ui.opponent.gattotto_otto.reaction.lastBall',
  laught: 'ui.opponent.gattotto_otto.reaction.laught',
  scary: 'ui.opponent.gattotto_otto.reaction.scary',
  smile: 'ui.opponent.gattotto_otto.reaction.smile',
  time: 'ui.opponent.gattotto_otto.reaction.time',
  time2: 'ui.opponent.gattotto_otto.reaction.time2',
};

const LINES: Record<PortraitLineKey, readonly string[]> = {
  ball: ['OH! THE BALL ESCAPED!', 'PAWS MISSED IT...', 'HEY TABLE, BE NICE!'],
  cry: ['AWW... GOOD GAME.', 'YOU DID GREAT, REALLY.', 'I AM SAD BUT PROUD.'],
  lastBall: ['EIGHT BALL! SCARY TIME!', 'LAST SHOT... BE BRAVE.', 'OKAY, CLAWS READY.'],
  laught: ['HEHE, THAT MISSED!', 'OOPS FOR YOU.', 'I SHOULD NOT LAUGH... BUT I DID.'],
  scary: ['WOW, YOU ARE SO GOOD.', 'HEY! STOP BEING AMAZING!', 'I AM IMPRESSED... AND MAD.'],
  smile: ['THAT SHOT WAS LOVELY.', 'NICE ONE! I CLAP.', 'AWW, BEAUTIFUL POT.'],
  time: ['TIMER IS YELLING!', 'CLOCK SAYS HURRY!', 'MOVE MOVE MOVE!'],
  time2: ['STILL AIMING?', 'AIM OR NAP TIME.', 'I AM LOSING PATIENCE... A LITTLE.'],
};

export function gattottoOttoReactionAssetId(kind: TungoReactionKind): string {
  return ASSET_BY_KIND[kind];
}

export function pickGattottoOttoLine(key: PortraitLineKey): string {
  const lines = LINES[key];
  return lines[Math.floor(Math.random() * lines.length)]!;
}
