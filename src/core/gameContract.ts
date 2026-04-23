import type { GameEvent } from '../world/GameEvents.js';
import type { HudState, RenderWorldState } from '../world/renderTypes.js';

/** Normalized input — no DOM fields (guide §8). */
export type GameInputCommand =
  | { type: 'menu.restart' }
  | { type: 'menu.next' }
  | { type: 'menu.home' }
  | { type: 'spin.set'; nx: number; ny: number }
  | {
      type: 'pointer.table';
      phase: 'down' | 'move' | 'up' | 'cancel';
      tableX: number;
      tableY: number;
    };

export interface ViewportSize {
  widthPx: number;
  heightPx: number;
}

export interface RenderRuntimeHints {
  /** Physics debug overlay (URL `?debug` or local toggle from platform). */
  physicsDebugVisible: boolean;
}

export interface Game {
  update(dtSec: number, commands: readonly GameInputCommand[]): void;
  getRenderWorldState(viewport: ViewportSize, hints: RenderRuntimeHints): RenderWorldState;
  getHudState(): HudState;
  drainEvents(): GameEvent[];
  reset(seed?: number): void;
}
