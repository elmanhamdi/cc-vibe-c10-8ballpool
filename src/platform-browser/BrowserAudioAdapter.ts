import type { GameEvent } from '../world/GameEvents.js';
import type { AssetManifestEntry } from '../assets/AssetTypes.js';
import { AssetManifest } from '../assets/AssetManifest.js';
import { resolveBrowserAssetUrl } from '../assets/resolveBrowserAssetUrl.js';

export type BrowserAudioAdapterOptions = {
  assetBaseUrl?: string;
};

const AUDIO_EXTS = ['ogg', 'mp3', 'wav'] as const;

/** Arka plan seviyesi (GainNode, linear 0–1). */
const BGM_VOLUME = 0.14;
/** Arka plan çalma hızı — Web Audio `playbackRate` ile uygulanır (pitch birlikte değişir). */
const BGM_PLAYBACK_RATE = 0.6;
/** Tek seferlik sesler: motor `volume` × bu katsayı. */
const SFX_MASTER_GAIN = 0.7;

function audioStemAndOrder(entry: AssetManifestEntry): { stem: string; exts: readonly string[] } {
  const stem = entry.browserUrl.replace(/\.(ogg|mp3|wav)$/i, '');
  const declared = entry.browserUrl.match(/\.(ogg|mp3|wav)$/i)?.[1]?.toLowerCase();
  const preferred = declared && AUDIO_EXTS.includes(declared as (typeof AUDIO_EXTS)[number]) ? declared : 'ogg';
  const rest = AUDIO_EXTS.filter((x) => x !== preferred);
  return { stem, exts: [preferred, ...rest] };
}

function getAudioContextConstructor(): typeof AudioContext | null {
  const w = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/**
 * Maps core `GameEvent` to browser audio via AssetManifest (guide §10).
 * BGM: Web Audio buffer + loop + `playbackRate` (HTMLMediaElement rate is unreliable).
 * SFX: short `HTMLAudioElement` clips.
 */
export class BrowserAudioAdapter {
  private readonly assetBaseUrl: string;
  private bgmCtx: AudioContext | null = null;
  private bgmGain: GainNode | null = null;
  private bgmSource: AudioBufferSourceNode | null = null;
  private bgmMusicId: string | null = null;
  private bgmLoadGen = 0;
  /** Yalnızca `AudioContext` yoksa BGM için kullanılır. */
  private bgmHtmlFallback: HTMLAudioElement | null = null;
  private muted = false;

  constructor(options?: BrowserAudioAdapterOptions) {
    this.assetBaseUrl = options?.assetBaseUrl ?? '/';
  }

  /**
   * Tarayıcı autoplay politikası yüzünden ilk `play()` başarısız olabilir;
   * ilk kullanıcı dokunuşunda burayı çağırın.
   */
  resumeBackgroundMusicIfNeeded(): void {
    if (this.muted) return;
    void this.bgmCtx?.resume().catch(() => {});
    const h = this.bgmHtmlFallback;
    if (h?.paused) void h.play().catch(() => {});
  }

  isMuted(): boolean {
    return this.muted;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.muted) {
      void this.bgmCtx?.suspend().catch(() => {});
      this.bgmHtmlFallback?.pause();
    } else {
      if (!this.bgmSource && !this.bgmHtmlFallback && this.bgmMusicId) {
        this.ensureBackgroundMusicLoop(this.bgmMusicId);
      }
      void this.bgmCtx?.resume().catch(() => {});
      const h = this.bgmHtmlFallback;
      if (h?.paused) void h.play().catch(() => {});
    }
    return this.muted;
  }

  consume(events: readonly GameEvent[]): void {
    for (const e of events) {
      if (e.type === 'music') {
        if (e.action === 'start') this.ensureBackgroundMusicLoop(e.musicId);
        continue;
      }
      if (e.type !== 'sound') continue;
      if (this.muted) continue;
      const entry = AssetManifest[e.soundId as keyof typeof AssetManifest];
      if (!entry || entry.kind !== 'audio') continue;
      const vol = Math.max(0, Math.min(1, (e.volume ?? 1) * SFX_MASTER_GAIN));
      this.playWithExtensionFallback(entry, vol);
    }
  }

  private getOrCreateBgmContext(): AudioContext {
    if (this.bgmCtx && this.bgmCtx.state !== 'closed') return this.bgmCtx;
    const Ctor = getAudioContextConstructor();
    if (!Ctor) {
      throw new Error('AudioContext not available');
    }
    this.bgmCtx = new Ctor();
    this.bgmGain = this.bgmCtx.createGain();
    this.bgmGain.gain.value = BGM_VOLUME;
    this.bgmGain.connect(this.bgmCtx.destination);
    return this.bgmCtx;
  }

  private stopBgmSource(): void {
    if (!this.bgmSource) return;
    try {
      this.bgmSource.stop(0);
    } catch {
      /* already stopped */
    }
    try {
      this.bgmSource.disconnect();
    } catch {
      /* */
    }
    this.bgmSource = null;
  }

  private ensureBackgroundMusicLoop(musicId: string): void {
    if (this.muted) {
      const prev = this.bgmMusicId;
      this.bgmMusicId = musicId;
      if (prev !== musicId) {
        this.stopBgmSource();
        this.bgmHtmlFallback?.pause();
        this.bgmHtmlFallback = null;
      }
      void this.bgmCtx?.suspend().catch(() => {});
      this.bgmHtmlFallback?.pause();
      return;
    }

    const Ctor = getAudioContextConstructor();
    if (!Ctor) {
      this.bgmHtmlFallback?.pause();
      this.bgmHtmlFallback = null;
      this.ensureBackgroundMusicLoopHtmlFallback(musicId);
      return;
    }

    this.bgmHtmlFallback?.pause();
    this.bgmHtmlFallback = null;

    if (this.bgmMusicId === musicId && this.bgmSource) {
      void this.bgmCtx?.resume().catch(() => {});
      return;
    }

    this.bgmLoadGen += 1;
    const gen = this.bgmLoadGen;
    this.stopBgmSource();
    this.bgmMusicId = null;

    const entry = AssetManifest[musicId as keyof typeof AssetManifest];
    if (!entry || entry.kind !== 'audio') return;

    void this.loadAndPlayBgmWebAudio(musicId, gen, entry);
  }

  private async loadAndPlayBgmWebAudio(
    musicId: string,
    gen: number,
    entry: AssetManifestEntry,
  ): Promise<void> {
    const { stem, exts } = audioStemAndOrder(entry);
    for (let i = 0; i < exts.length; i++) {
      const url = resolveBrowserAssetUrl(this.assetBaseUrl, `${stem}.${exts[i]}`);
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const ab = await res.arrayBuffer();
        if (gen !== this.bgmLoadGen || this.muted) return;

        let ctx: AudioContext;
        try {
          ctx = this.getOrCreateBgmContext();
        } catch {
          this.bgmHtmlFallback?.pause();
          this.bgmHtmlFallback = null;
          this.ensureBackgroundMusicLoopHtmlFallback(musicId);
          return;
        }

        await ctx.resume().catch(() => {});
        const buf = await ctx.decodeAudioData(ab.slice(0));
        if (gen !== this.bgmLoadGen || this.muted) return;

        this.stopBgmSource();
        if (!this.bgmGain) return;

        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.playbackRate.value = BGM_PLAYBACK_RATE;
        src.connect(this.bgmGain);
        src.start(0);
        this.bgmSource = src;
        this.bgmMusicId = musicId;
        await ctx.resume().catch(() => {});
        return;
      } catch {
        continue;
      }
    }
    console.warn('[BrowserAudioAdapter] BGM decode/load failed:', musicId);
  }

  /** Yalnızca `AudioContext` yoksa veya oluşturulamazsa. */
  private ensureBackgroundMusicLoopHtmlFallback(musicId: string): void {
    if (this.muted) {
      this.bgmMusicId = musicId;
      return;
    }
    const entry = AssetManifest[musicId as keyof typeof AssetManifest];
    if (!entry || entry.kind !== 'audio') return;
    const { stem, exts } = audioStemAndOrder(entry);
    const tryAt = (i: number): void => {
      if (i >= exts.length) return;
      const url = resolveBrowserAssetUrl(this.assetBaseUrl, `${stem}.${exts[i]}`);
      const a = new Audio();
      a.loop = true;
      a.volume = BGM_VOLUME;
      const applyRate = () => {
        a.playbackRate = BGM_PLAYBACK_RATE;
      };
      applyRate();
      a.addEventListener('loadeddata', applyRate, { once: true });
      a.addEventListener('canplay', applyRate, { once: true });
      a.addEventListener(
        'error',
        () => tryAt(i + 1),
        { once: true },
      );
      a.src = url;
      void a
        .play()
        .then(() => {
          this.bgmHtmlFallback = a;
          this.bgmMusicId = musicId;
        })
        .catch((err: unknown) => {
          const name = err && typeof err === 'object' && 'name' in err ? String((err as Error).name) : '';
          if (name === 'NotAllowedError') {
            this.bgmHtmlFallback = a;
            this.bgmMusicId = musicId;
            return;
          }
          tryAt(i + 1);
        });
    };
    tryAt(0);
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
