export type GamePhase =
  | 'MainMenu'
  | 'MatchStart'
  | 'PlayerTurn'
  | 'AITurn'
  | 'BallSimulation'
  | 'TurnEnd'
  | 'MatchEnd';

export type PlayerId = 'player' | 'ai';

/**
 * Authoritative gameplay state boundary for portability.
 * Rendering/UI adapters should consume projections derived from this state.
 */
export interface GameState {
  phase: GamePhase;
  levelIndex: number;
  activePlayer: PlayerId;
  spin: { x: number; y: number };
  rules: {
    openTable: boolean;
    playerGroup: 'solid' | 'stripe' | null;
    aiGroup: 'solid' | 'stripe' | null;
  };
  tutorial: {
    active: boolean;
    aimIntroActive: boolean;
    eightBallIntroActive: boolean;
    awaitingBallInHandPlacement: boolean;
  };
  tournament: null | {
    active: boolean;
    currentRound: number;
    size: number;
    status: 'active' | 'won' | 'lost';
    defId: string;
  };
}

export interface GameSnapshot {
  phase: GamePhase;
  levelIndex: number;
  activePlayer: PlayerId;
  /** 0–1 time left: shot clock on PlayerTurn, think time on AITurn; 1 in other phases */
  turnTime01: number;
  dialogue: { text: string; side: 'player' | 'ai' } | null;
}
