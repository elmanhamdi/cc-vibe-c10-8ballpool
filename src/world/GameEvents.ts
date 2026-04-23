import type { Vec3Data } from './renderTypes.js';

/** Platform-neutral events emitted by core for audio, UI, persistence (guide §10). */
export type GameEvent =
  | { type: 'sound'; soundId: string; volume?: number; position?: Vec3Data }
  | { type: 'music'; musicId: string; action: 'start' | 'stop' | 'fade' }
  | { type: 'hud'; id: string; value?: string | number | boolean }
  | { type: 'persistence'; action: 'save' | 'load' | 'submitScore' };
