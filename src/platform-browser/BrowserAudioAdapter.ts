import type { GameEvent } from '../world/GameEvents.js';

/** Maps core `GameEvent` to browser audio (stub until sound assets exist). */
export class BrowserAudioAdapter {
  consume(events: readonly GameEvent[]): void {
    for (const e of events) {
      if (e.type === 'sound') {
        /* e.g. new Audio(AssetManifest[e.soundId].browserUrl).play() */
        void e.soundId;
      }
      void e;
    }
  }
}
