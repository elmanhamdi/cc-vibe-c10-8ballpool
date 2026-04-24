import type { GameEvent } from '../world/GameEvents.js';
import type { AssetManifestEntry } from '../assets/AssetTypes.js';
import { AssetManifest } from '../assets/AssetManifest.js';
import { resolveBrowserAssetUrl } from '../assets/resolveBrowserAssetUrl.js';

export type BrowserAudioAdapterOptions = {
  assetBaseUrl?: string;
};

const AUDIO_EXTS = ['ogg', 'mp3', 'wav'] as const;

function audioStemAndOrder(entry: AssetManifestEntry): { stem: string; exts: readonly string[] } {
  const stem = entry.browserUrl.replace(/\.(ogg|mp3|wav)$/i, '');
  const declared = entry.browserUrl.match(/\.(ogg|mp3|wav)$/i)?.[1]?.toLowerCase();
  const preferred = declared && AUDIO_EXTS.includes(declared as (typeof AUDIO_EXTS)[number]) ? declared : 'ogg';
  const rest = AUDIO_EXTS.filter((x) => x !== preferred);
  return { stem, exts: [preferred, ...rest] };
}

/** Maps core `GameEvent` to browser audio via AssetManifest (guide §10). Tries .ogg / .mp3 / .wav per stem. */
export class BrowserAudioAdapter {
  private readonly assetBaseUrl: string;

  constructor(options?: BrowserAudioAdapterOptions) {
    this.assetBaseUrl = options?.assetBaseUrl ?? '/';
  }

  consume(events: readonly GameEvent[]): void {
    for (const e of events) {
      if (e.type !== 'sound') continue;
      const entry = AssetManifest[e.soundId as keyof typeof AssetManifest];
      if (!entry || entry.kind !== 'audio') continue;
      const vol = Math.max(0, Math.min(1, e.volume ?? 1));
      this.playWithExtensionFallback(entry, vol);
    }
  }

  private playWithExtensionFallback(entry: AssetManifestEntry, volume: number): void {
    const { stem, exts } = audioStemAndOrder(entry);
    const tryAt = (i: number): void => {
      if (i >= exts.length) return;
      const url = resolveBrowserAssetUrl(this.assetBaseUrl, `${stem}.${exts[i]}`);
      const a = new Audio();
      a.volume = volume;
      a.addEventListener(
        'error',
        () => tryAt(i + 1),
        { once: true },
      );
      a.src = url;
      void a.play().catch(() => tryAt(i + 1));
    };
    tryAt(0);
  }
}
