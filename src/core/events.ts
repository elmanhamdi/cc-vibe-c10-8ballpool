import type { PlayerId } from './types.js';

export type GameEvent =
  | { type: 'MENU_START'; levelIndex: number }
  | { type: 'SHOT_REQUESTED'; by: PlayerId; aimAngle: number; power01: number; spinX: number; spinY: number }
  | { type: 'SIMULATION_COMPLETE' }
  | { type: 'TURN_RESOLVED' }
  | { type: 'RETURN_MENU' };
