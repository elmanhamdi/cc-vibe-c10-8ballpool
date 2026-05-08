/**
 * Torta Tartaruga — reaction art under `public/opponents/torta_tartaruga/reactions/`.
 * Same trigger kinds as Tungo (`TungoReactionKind`) so `GameEngine` can share one code path.
 */

import type { PortraitLineKey, TungoReactionKind } from './tungoReactions.js';

export const TORTA_TARTARUGA_DEFAULT_REACTION_ASSET_ID = 'ui.opponent.torta_tartaruga.reaction.smile';

const ASSET_BY_KIND: Record<TungoReactionKind, string> = {
  ball: 'ui.opponent.torta_tartaruga.reaction.ball',
  cry: 'ui.opponent.torta_tartaruga.reaction.cry',
  lastBall: 'ui.opponent.torta_tartaruga.reaction.lastBall',
  laught: 'ui.opponent.torta_tartaruga.reaction.laught',
  scary: 'ui.opponent.torta_tartaruga.reaction.scary',
  smile: 'ui.opponent.torta_tartaruga.reaction.smile',
  time: 'ui.opponent.torta_tartaruga.reaction.time',
  time2: 'ui.opponent.torta_tartaruga.reaction.time2',
};

/** On-screen quips (Italian dessert / “turtle cake” energy, English UI). */
const TORTA_LINES: Record<PortraitLineKey, readonly string[]> = {
  ball: ['NO CONTACT. RESET YOUR FORM.', 'YOU LOST THE LINE.', 'TECHNIQUE FIRST.'],
  cry: ['WELL EARNED. I ACCEPT THAT.', 'YOU OUTPLAYED ME THIS ROUND.', 'GOOD FINISH.'],
  lastBall: ['EIGHT BALL. EXECUTE CLEANLY.', 'FINAL SHOT. NO RUSH.', 'PRECISION NOW.'],
  laught: ['RUSHED SHOT, RUSHED RESULT.', 'THAT MISS WAS FORCED.', 'YOU GAVE UP THE TABLE.'],
  scary: ['EXCELLENT RHYTHM.', 'YOU ARE IN CONTROL.', 'VERY SHARP PLAY.'],
  smile: ['WELL PLAYED.', 'CLEAN POT. RESPECT.', 'GOOD TOUCH ON THAT SHOT.'],
  time: ['CLOCK MATTERS.', 'COMMIT TO THE SHOT.', 'STAY COMPOSED.'],
  time2: ['STILL STUDYING?', 'READ, BREATHE, SHOOT.', 'THE WINDOW IS CLOSING.'],
};

export function tortaTartarugaReactionAssetId(kind: TungoReactionKind): string {
  return ASSET_BY_KIND[kind];
}

export function pickTortaTartarugaLine(key: PortraitLineKey): string {
  const lines = TORTA_LINES[key];
  return lines[Math.floor(Math.random() * lines.length)]!;
}
