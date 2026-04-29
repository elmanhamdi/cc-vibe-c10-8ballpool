import type { GameEngine } from '../core/GameEngine.js';
import type { GameInputCommand } from '../core/gameContract.js';
import { HUD } from '../ui/HUD.js';

export type BrowserHudAdapterOptions = {
  /** Vite `import.meta.env.BASE_URL` for manifest `browserUrl` resolution. */
  assetBaseUrl?: string;
  /** Toggles music/sfx mute state; returns new muted flag. */
  toggleSound?: () => boolean;
  /** Returns current mute state for initial icon sync. */
  isSoundMuted?: () => boolean;
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
    this.hud = new HUD(root, () => engine.getHudState(), pushCommand, base, {
      toggleSound: options?.toggleSound,
      isSoundMuted: options?.isSoundMuted,
    });
  }

  bind(): void {
    this.hud.bindHandlers();
  }

  sync(): void {
    this.hud.syncFromState();
  }
}
