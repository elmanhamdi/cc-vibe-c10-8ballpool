import type { GameEngine } from '../core/GameEngine.js';
import type { GameInputCommand } from '../core/gameContract.js';
import { HUD } from '../ui/HUD.js';

export type BrowserHudAdapterOptions = {
  /** Vite `import.meta.env.BASE_URL` for manifest `browserUrl` resolution. */
  assetBaseUrl?: string;
};

/** Binds DOM HUD to `HudState` and routes chrome actions to input commands. */
export class BrowserHudAdapter {
  private readonly hud: HUD;

  constructor(
    root: HTMLElement,
    engine: GameEngine,
    pushCommand: (c: GameInputCommand) => void,
    options?: BrowserHudAdapterOptions,
  ) {
    const base = options?.assetBaseUrl ?? '/';
    this.hud = new HUD(root, () => engine.getHudState(), pushCommand, base);
  }

  bind(): void {
    this.hud.bindHandlers();
  }

  sync(): void {
    this.hud.syncFromState();
  }
}
