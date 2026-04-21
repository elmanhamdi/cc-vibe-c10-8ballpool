import type { PlayerId } from '../core/types.js';

export interface TurnClockConfig {
  playerSeconds: number;
  aiSeconds: number;
}

export class TurnManager {
  private remaining = 0;
  private active: PlayerId | null = null;

  constructor(private readonly cfg: TurnClockConfig) {}

  beginTurn(who: PlayerId): void {
    this.active = who;
    this.remaining = who === 'player' ? this.cfg.playerSeconds : this.cfg.aiSeconds;
  }

  stop(): void {
    this.active = null;
    this.remaining = 0;
  }

  /** Returns true when time just hit zero. */
  tick(dt: number): boolean {
    if (this.active !== 'player') return false;
    if (this.remaining <= 0) return false;
    this.remaining -= dt;
    return this.remaining <= 0;
  }

  progress01(): number {
    if (this.active !== 'player') return 1;
    const total = this.cfg.playerSeconds;
    return Math.max(0, Math.min(1, this.remaining / total));
  }

  getRemaining(): number {
    return Math.max(0, this.remaining);
  }
}
