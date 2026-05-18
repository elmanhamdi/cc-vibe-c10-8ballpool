import type { GameEvent } from '../world/GameEvents.js';
import type { HudState, RenderWorldState } from '../world/renderTypes.js';
import type { GameSnapshot, GameState } from './types.js';

/** Normalized input — no DOM fields (guide §8). */
export type GameInputCommand =
  | { type: 'menu.restart' }
  | { type: 'menu.next' }
  | { type: 'menu.home' }
  /** Big PLAY button on the main menu — kept as alias for `menu.startCasual`. */
  | { type: 'menu.play' }
  /** Mode-select Casual card → start career match (same as `menu.play`). */
  | { type: 'menu.startCasual' }
  /** Mode-select Tournament card → initialize a new tournament run for a specific catalog id. */
  | { type: 'menu.startTournament'; tournamentId: string }
  /** Bracket overlay "Start Match N" button → start the current round's match. */
  | { type: 'tournament.advance' }
  /** Champion / Eliminated → discard active tournament and return to menu. */
  | { type: 'tournament.exit' }
  | { type: 'shop.buyCue'; cueId: string }
  | { type: 'shop.equipCue'; cueId: string }
  /** First career break: dismiss “how to aim” overlay (see `HudState.eightBall.aimIntro`). */
  | { type: 'aimIntro.dismiss' }
  /** Tutorial: dismiss “pocket the 8” overlay (`HudState.eightBall.eightBallIntro`). */
  | { type: 'tutorialEightIntro.dismiss' }
  | { type: 'ballInHand.confirm' }
  | { type: 'spin.set'; nx: number; ny: number }
  | {
      type: 'pointer.table';
      phase: 'down' | 'move' | 'up' | 'cancel';
      tableX: number;
      tableY: number;
    }
  /** Right-edge HUD power slider: 0 = top (weak / cancel), 1 = bottom (full). */
  | {
      type: 'power.drag';
      phase: 'down' | 'move' | 'up' | 'cancel';
      value01: number;
    };

export interface ViewportSize {
  widthPx: number;
  heightPx: number;
}

export interface RenderRuntimeHints {
  /** Physics debug overlay (URL `?debug` or local toggle from platform). */
  physicsDebugVisible: boolean;
  /** Dev: `TableMeshDebugToggle` (T) — masa 3D grubunu gizle. */
  debugHideTableMesh: boolean;
  /** Dev: `OpponentShotCameraToggle` (O) — rakip sinematik vuruş kadrajını önizle. */
  debugOpponentShotCamera: boolean;
}

export interface Game {
  update(dtSec: number, commands: readonly GameInputCommand[]): void;
  /** Authoritative game state boundary used to derive snapshots/hud/render state. */
  getGameState(): GameState;
  /** Authoritative runtime snapshot for portability/debug tooling. */
  getSnapshot(): GameSnapshot;
  getRenderWorldState(viewport: ViewportSize, hints: RenderRuntimeHints): RenderWorldState;
  getHudState(): HudState;
  drainEvents(): GameEvent[];
  reset(seed?: number): void;
}
