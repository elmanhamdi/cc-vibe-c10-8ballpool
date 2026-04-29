import type { AssetManifestEntry } from './AssetTypes.js';

export type { AssetKind, AssetManifestEntry } from './AssetTypes.js';

const tableGlb = new URL('../../assets/meshes/Table.glb', import.meta.url).href;

function ballDiffuseEntry(n: number): AssetManifestEntry {
  return {
    id: `tex.ball.${n}`,
    kind: 'texture',
    browserUrl: `textures/balls/${n}.jpg`,
    futureMhsPath: `@Assets/Textures/Ball_${n}`,
    sourceFormat: 'jpg',
    notes: 'Loader tries .jpg/.jpeg/.png and textures/ fallback (no balls subfolder).',
  };
}

const ballDiffuseEntries = Object.fromEntries(
  Array.from({ length: 15 }, (_, i) => {
    const n = i + 1;
    return [`tex.ball.${n}`, ballDiffuseEntry(n)] as const;
  }),
) as Record<string, AssetManifestEntry>;

export const AssetManifest = {
  'env.tableMesh': {
    id: 'env.tableMesh',
    kind: 'model',
    browserUrl: tableGlb,
    futureMhsPath: '@Templates/table.hstf',
    sourceFormat: 'glb',
    unitScale: 1,
    forwardAxis: '+Z',
    upAxis: '+Y',
    pivot: 'custom',
    collision: 'custom',
    notes: 'Imported table mesh; physics bounds authored in Table.ts',
  },

  ...ballDiffuseEntries,

  'tex.ball.cue': {
    id: 'tex.ball.cue',
    kind: 'texture',
    browserUrl: 'textures/balls/cue.jpg',
    futureMhsPath: '@Assets/Textures/Ball_cue',
    sourceFormat: 'jpg',
    notes: 'Cue ball diffuse; same fallback rules as tex.ball.*',
  },
  /** Legacy numbered `0.jpeg` / `0.jpg` cue art under `textures/balls/`. */
  'tex.ball.zeroFallback': {
    id: 'tex.ball.zeroFallback',
    kind: 'texture',
    browserUrl: 'textures/balls/0.jpg',
    futureMhsPath: '@Assets/Textures/Ball_0',
    sourceFormat: 'jpg',
    notes: 'Used only if tex.ball.cue fails to load.',
  },

  'ui.opponent.tung.avatar': {
    id: 'ui.opponent.tung.avatar',
    kind: 'ui',
    browserUrl: 'opponents/tung/hud/tung_avatar.png',
    futureMhsPath: '@UI/Opponents/TungAvatar.png',
    sourceFormat: 'png',
    notes: 'HUD opponent portrait',
  },

  'ui.opponent.tung.reaction.happy': {
    id: 'ui.opponent.tung.reaction.happy',
    kind: 'ui',
    browserUrl: 'opponents/tung/reactions/tung_happy.png',
    futureMhsPath: '@UI/Opponents/TungReactions/Happy.png',
    sourceFormat: 'png',
  },
  'ui.opponent.tung.reaction.crazyLaugh': {
    id: 'ui.opponent.tung.reaction.crazyLaugh',
    kind: 'ui',
    browserUrl: 'opponents/tung/reactions/tung_crazy_laugh.png',
    futureMhsPath: '@UI/Opponents/TungReactions/CrazyLaugh.png',
    sourceFormat: 'png',
  },
  'ui.opponent.tung.reaction.laugh': {
    id: 'ui.opponent.tung.reaction.laugh',
    kind: 'ui',
    browserUrl: 'opponents/tung/reactions/tung_laugh.png',
    futureMhsPath: '@UI/Opponents/TungReactions/Laugh.png',
    sourceFormat: 'png',
  },
  'ui.opponent.tung.reaction.angry': {
    id: 'ui.opponent.tung.reaction.angry',
    kind: 'ui',
    browserUrl: 'opponents/tung/reactions/tung_angry.png',
    futureMhsPath: '@UI/Opponents/TungReactions/Angry.png',
    sourceFormat: 'png',
  },
  'ui.opponent.tung.reaction.sad': {
    id: 'ui.opponent.tung.reaction.sad',
    kind: 'ui',
    browserUrl: 'opponents/tung/reactions/tung_sad.png',
    futureMhsPath: '@UI/Opponents/TungReactions/Sad.png',
    sourceFormat: 'png',
  },
  'ui.opponent.balleeina.avatar': {
    id: 'ui.opponent.balleeina.avatar',
    kind: 'ui',
    browserUrl: 'opponents/balleeina/hud/avatar.png',
    futureMhsPath: '@UI/Opponents/BalleeinaAvatar.png',
    sourceFormat: 'png',
    notes: 'If missing, HUD falls back to generic avatar.',
  },

  'ui.avatar.genericOpponent': {
    id: 'ui.avatar.genericOpponent',
    kind: 'ui',
    browserUrl: 'avatars/opp.svg',
    futureMhsPath: '@UI/Avatars/GenericOpponent.svg',
    sourceFormat: 'svg',
    notes: 'SVG in browser; MHS may swap for raster.',
  },
  'ui.avatar.player': {
    id: 'ui.avatar.player',
    kind: 'ui',
    browserUrl: 'avatars/me.svg',
    futureMhsPath: '@UI/Avatars/Player.svg',
    sourceFormat: 'svg',
    notes: 'SVG in browser',
  },

  'sound.pool.cueStrike': {
    id: 'sound.pool.cueStrike',
    kind: 'audio',
    browserUrl: 'audio/initial_hit.ogg',
    futureMhsPath: '@Assets/Audio/CueStrike',
    sourceFormat: 'ogg',
    notes: 'public/audio/initial_hit.ogg; adapter falls back to .mp3/.wav.',
  },
  'sound.pool.pocket': {
    id: 'sound.pool.pocket',
    kind: 'audio',
    browserUrl: 'audio/ball_interaction.ogg',
    futureMhsPath: '@Assets/Audio/Pocket',
    sourceFormat: 'ogg',
    notes: 'public/audio/ball_interaction.ogg when a ball is pocketed.',
  },
  'sound.pool.ballsSettle': {
    id: 'sound.pool.ballsSettle',
    kind: 'audio',
    browserUrl: 'audio/ball_interaction.ogg',
    futureMhsPath: '@Assets/Audio/BallsSettle',
    sourceFormat: 'ogg',
    notes: 'Same clip as pocket until a dedicated settle asset exists.',
  },
  'sound.pool.ballBall': {
    id: 'sound.pool.ballBall',
    kind: 'audio',
    browserUrl: 'audio/ball_interaction.ogg',
    futureMhsPath: '@Assets/Audio/BallBall',
    sourceFormat: 'ogg',
    notes: 'Ball–ball contact; counted in CollisionSystem, sounds from GameEngine.',
  },
  'sound.ui.bgMatch2': {
    id: 'sound.ui.bgMatch2',
    kind: 'audio',
    browserUrl: 'audio/bg_2.ogg',
    futureMhsPath: '@Assets/Audio/BgMatch2',
    sourceFormat: 'ogg',
    notes: 'Looping in-match BGM (50% vs bg_3 per match).',
  },
  'sound.ui.bgMatch3': {
    id: 'sound.ui.bgMatch3',
    kind: 'audio',
    browserUrl: 'audio/bg_3.ogg',
    futureMhsPath: '@Assets/Audio/BgMatch3',
    sourceFormat: 'ogg',
    notes: 'Looping in-match BGM (50% vs bg_2 per match).',
  },
  'sound.ui.bgBetweenGames': {
    id: 'sound.ui.bgBetweenGames',
    kind: 'audio',
    browserUrl: 'audio/bg_betweengames.ogg',
    futureMhsPath: '@Assets/Audio/BgBetweenGames',
    sourceFormat: 'ogg',
    notes: 'Looping between matches (MatchEnd overlay).',
  },
  'sound.ui.applause': {
    id: 'sound.ui.applause',
    kind: 'audio',
    browserUrl: 'audio/applause.ogg',
    futureMhsPath: '@Assets/Audio/Applause',
    sourceFormat: 'ogg',
    notes: 'One-shot applause on player victory.',
  },
  'sound.ui.phoneRing': {
    id: 'sound.ui.phoneRing',
    kind: 'audio',
    browserUrl: 'audio/phonering.ogg',
    futureMhsPath: '@Assets/Audio/PhoneRing',
    sourceFormat: 'ogg',
    notes: 'Looped while searching for next opponent.',
  },
  'sound.ui.turnBell': {
    id: 'sound.ui.turnBell',
    kind: 'audio',
    browserUrl: 'audio/bell.wav',
    futureMhsPath: '@Assets/Audio/TurnBell',
    sourceFormat: 'wav',
    notes: 'Played when turn passes to the other player.',
  },

  'sound.opponent.tung.taunt1': {
    id: 'sound.opponent.tung.taunt1',
    kind: 'audio',
    browserUrl: 'opponents/tung/audio/tung1.ogg',
    futureMhsPath: '@Assets/Audio/TungTaunt1',
    sourceFormat: 'ogg',
    notes: 'Tung voice line; played when Tung dialogue line is chosen.',
  },
  'sound.opponent.tung.taunt2': {
    id: 'sound.opponent.tung.taunt2',
    kind: 'audio',
    browserUrl: 'opponents/tung/audio/tung2.ogg',
    futureMhsPath: '@Assets/Audio/TungTaunt2',
    sourceFormat: 'ogg',
    notes: 'Tung voice line; played when Tung dialogue line is chosen.',
  },
  'sound.opponent.tung.taunt3': {
    id: 'sound.opponent.tung.taunt3',
    kind: 'audio',
    browserUrl: 'opponents/tung/audio/tung3.ogg',
    futureMhsPath: '@Assets/Audio/TungTaunt3',
    sourceFormat: 'ogg',
    notes: 'Tung voice line; played when Tung dialogue line is chosen.',
  },
} as const satisfies Record<string, AssetManifestEntry>;

export type AssetManifestKey = keyof typeof AssetManifest;
