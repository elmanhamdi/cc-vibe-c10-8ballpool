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
} as const;
