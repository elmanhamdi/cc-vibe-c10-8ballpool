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
  /** Sıra rakibe / oyuncuya geçtiğinde (tek seferlik). */
  soundTurnBell: 'sound.ui.turnBell',
  /** Maç içi BGM — `GameEngine` her oyunda `bg_2` / `bg_3` arasından rastgele (`music` olayı, loop). */
  musicBgMatch2: 'sound.ui.bgMatch2',
  musicBgMatch3: 'sound.ui.bgMatch3',
  /** Maç sonu / oyunlar arası ekran (loop). */
  musicBgBetweenGames: 'sound.ui.bgBetweenGames',
  /** Win applause one-shot. */
  soundApplause: 'sound.ui.applause',
  /** Next-match ringing cue (looped in HUD popup). */
  soundPhoneRing: 'sound.ui.phoneRing',
  /** Tung taunt VO (`public/opponents/tung/audio/tung*.ogg`). */
  soundTungTaunt1: 'sound.opponent.tung.taunt1',
  soundTungTaunt2: 'sound.opponent.tung.taunt2',
  soundTungTaunt3: 'sound.opponent.tung.taunt3',
  /** Geçici silüet; sonra FBX ile değiştirilecek. */
  opponentTungPlaceholder: 'char.tungPlaceholder',
} as const;
