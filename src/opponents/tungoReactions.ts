/**
 * Tungo reaction art + on-screen lines (`public/opponents/tungo/reactions`, `AssetManifest`). SFX: `public/audio/Reaction_*.wav`.
 */

export type TungoReactionKind =
  | 'ball'
  | 'cry'
  | 'lastBall'
  | 'laught'
  | 'scary'
  | 'smile'
  | 'time'
  | 'time2';

export const TUNGO_DEFAULT_REACTION_ASSET_ID = 'ui.opponent.tungo.reaction.smile';

const ASSET_BY_KIND: Record<TungoReactionKind, string> = {
  ball: 'ui.opponent.tungo.reaction.ball',
  cry: 'ui.opponent.tungo.reaction.cry',
  lastBall: 'ui.opponent.tungo.reaction.lastBall',
  laught: 'ui.opponent.tungo.reaction.laught',
  scary: 'ui.opponent.tungo.reaction.scary',
  smile: 'ui.opponent.tungo.reaction.smile',
  time: 'ui.opponent.tungo.reaction.time',
  time2: 'ui.opponent.tungo.reaction.time2',
};

export const TUNGO_LINES = {
  ball: [
    'YOU MISS THE WHOLE TABLE?',
    'HIT A BALL, ANY BALL.',
    'THAT WAS A CLEAN WHIFF.',
  ],
  cry: [
    'WHATEVER. YOU GOT LUCKY.',
    'I WILL REMEMBER THIS.',
    'ENJOY IT WHILE IT LASTS.',
  ],
  lastBall: [
    'EIGHT BALL. NO HIDING.',
    'PUT UP OR PACK UP.',
    'THIS SHOT DECIDES IT.',
  ],
  laught: [
    'HA. THAT ANGLE WAS TRASH.',
    'YOU MISSED BIG.',
    'I SAW THAT COMING.',
  ],
  scary: [
    'OKAY... THAT WAS TOUGH.',
    'YOU ARE HEATING UP.',
    'HMM. MAYBE YOU CAN PLAY.',
  ],
  smile: [
    'FINE. NICE SHOT.',
    'GOOD POT. STAY SHARP.',
    'NOT BAD... KEEP IT UP.',
  ],
  time: [
    'TICK-TOCK, CHAMP.',
    'TIME’S DONE.',
    'YOU PLAY IN SLOW MOTION?',
  ],
  time2: [
    'STILL THINKING?',
    'CLOCK JUST DIED.',
    'MOVE IT.',
  ],
} as const;

export type PortraitLineKey = keyof typeof TUNGO_LINES;

export function tungoReactionAssetId(kind: TungoReactionKind): string {
  return ASSET_BY_KIND[kind];
}

export function pickTungoLine(key: keyof typeof TUNGO_LINES): string {
  const lines = TUNGO_LINES[key];
  return lines[Math.floor(Math.random() * lines.length)]!;
}

export function randomTimeReactionKind(): TungoReactionKind {
  return Math.random() < 0.5 ? 'time' : 'time2';
}
