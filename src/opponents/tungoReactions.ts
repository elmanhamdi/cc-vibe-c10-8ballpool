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
    'AIR SHOT!',
    'HIT SOMETHING!',
    'TOTAL WHIFF.',
  ],
  cry: [
    'NOT CRYING!',
    'MY LEGEND…',
    'TAKE THE WIN.',
  ],
  lastBall: [
    'EIGHT ON THE LINE.',
    'NO EXCUSES.',
    'BIG SHOT.',
  ],
  laught: [
    'NICE ANGLE.',
    'HA! MISSED.',
    'WAY OFF.',
  ],
  scary: [
    'YOU A PRO?',
    'STOP IT!',
    'TOO GOOD…',
  ],
  smile: [
    'NICE TRY.',
    'KEEP TRYING.',
    'THANKS!',
  ],
  time: [
    'TICK-TOCK.',
    'TIME’S UP!',
    'TOO SLOW.',
  ],
  time2: [
    'STILL AIMING?',
    'CLOCK’S DEAD.',
    'HURRY UP!',
  ],
} as const;

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
