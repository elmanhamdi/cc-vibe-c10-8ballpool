import type { GameEngine } from '../core/GameEngine.js';
import type { GameInputCommand } from '../core/gameContract.js';
import { HUD } from '../ui/HUD.js';

/** Binds DOM HUD to `HudState` and routes chrome actions to input commands. */
export class BrowserHudAdapter {
  private readonly hud: HUD;

  constructor(root: HTMLElement, engine: GameEngine, pushCommand: (c: GameInputCommand) => void) {
    this.hud = new HUD(root, () => engine.getHudState(), pushCommand);
  }

  bind(): void {
    this.hud.bindHandlers();
  }

  sync(): void {
    this.hud.syncFromState();
  }
}
