export type GamePhase =
  | 'MainMenu'
  | 'MatchStart'
  | 'PlayerTurn'
  | 'AITurn'
  | 'BallSimulation'
  | 'TurnEnd'
  | 'MatchEnd';

export type PlayerId = 'player' | 'ai';

export interface GameSnapshot {
  phase: GamePhase;
  levelIndex: number;
  activePlayer: PlayerId;
  /** 0–1 time left: shot clock on PlayerTurn, think time on AITurn; 1 in other phases */
  turnTime01: number;
  dialogue: { text: string; side: 'player' | 'ai' } | null;
}
