/** Stable logical asset / template IDs (guide §5). */

export const AssetIds = {
  tableMesh: 'env.tableMesh',
  ballCue: 'ball.cue',
  ballEight: 'ball.eight',
  ballSolid: (n: number) => `ball.solid.${n}` as const,
  ballStripe: (n: number) => `ball.stripe.${n}` as const,
  cueStick: 'vfx.cueStick',
  /** Demo finger cursor on table during first-break aim intro. */
  aimIntroFinger: 'vfx.aimIntroFinger',
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
  /** Center reaction beat one-shots (`public/audio/Reaction_{1,2,3}.wav`). */
  soundReaction1: 'sound.ui.reaction1',
  soundReaction2: 'sound.ui.reaction2',
  soundReaction3: 'sound.ui.reaction3',
  /** HUD button click (`public/audio/Click.wav`). */
  soundUiClick: 'sound.ui.click',
  /** Tungo — idle FBX behind table rail. */
  opponentTungPlaceholder: 'char.tungPlaceholder',
  /** Torta Tartaruga — idle FBX behind table rail. */
  opponentTortaPlaceholder: 'char.tortaPlaceholder',
  /** Gattotto Otto — idle FBX behind table rail. */
  opponentGattottoPlaceholder: 'char.gattottoPlaceholder',
} as const;
