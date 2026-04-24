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
} as const satisfies Record<string, AssetManifestEntry>;

export type AssetManifestKey = keyof typeof AssetManifest;
