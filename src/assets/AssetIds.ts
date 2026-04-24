/** Stable logical asset / template IDs (guide §5). */

export const AssetIds = {
  tableMesh: 'env.tableMesh',
  ballCue: 'ball.cue',
  ballEight: 'ball.eight',
  ballSolid: (n: number) => `ball.solid.${n}` as const,
  ballStripe: (n: number) => `ball.stripe.${n}` as const,
  cueStick: 'vfx.cueStick',
  lineAim: 'line.aim',
  lineGhostObject: 'line.ghostObject',
  lineGhostCue: 'line.ghostCue',
  /** Diffuse map manifest keys under `tex.ball.*` (see AssetManifest). */
  texBall: (n: number) => `tex.ball.${n}` as const,
  texBallCue: 'tex.ball.cue',
  texBallZeroFallback: 'tex.ball.zeroFallback',
  soundCueStrike: 'sound.pool.cueStrike',
  soundPocket: 'sound.pool.pocket',
  soundBallsSettle: 'sound.pool.ballsSettle',
  soundBallBall: 'sound.pool.ballBall',
} as const;
