import { DIALOGUE_BANK, type DialogueCategory, type WeightedLine } from './dialogueLines.js';

interface Cooldowns {
  global: number;
  byCategory: Partial<Record<DialogueCategory, number>>;
}

export class DialogueManager {
  private cd: Cooldowns = { global: 0, byCategory: {} };
  private readonly globalGap = 2.6;
  private readonly categoryGap: Partial<Record<DialogueCategory, number>> = {
    pressure: 4.5,
    player_miss: 3.2,
    player_foul: 3.0,
    ai_good_shot: 2.8,
    player_nice: 3.0,
    silent_beat: 6,
  };

  private current: { text: string; ttl: number } | null = null;

  tick(dt: number): void {
    this.cd.global = Math.max(0, this.cd.global - dt);
    for (const k of Object.keys(this.cd.byCategory) as DialogueCategory[]) {
      const v = this.cd.byCategory[k];
      if (v == null) continue;
      this.cd.byCategory[k] = Math.max(0, v - dt);
    }
    if (this.current) {
      this.current.ttl -= dt;
      if (this.current.ttl <= 0) this.current = null;
    }
  }

  trySpeak(category: DialogueCategory, opts?: { personalitySilentChance?: number }): string | null {
    const silentChance = opts?.personalitySilentChance ?? 0;
    if (category !== 'silent_beat' && Math.random() < silentChance) return null;

    if (this.cd.global > 0) return null;
    const catCd = this.cd.byCategory[category] ?? 0;
    if (catCd > 0) return null;

    const lines = DIALOGUE_BANK[category];
    const line = pickWeighted(lines);
    if (!line) return null;

    this.current = { text: line.text, ttl: 3.8 + Math.random() * 1.4 };
    this.cd.global = this.globalGap;
    this.cd.byCategory[category] = this.categoryGap[category] ?? 2.4;
    return line.text;
  }

  getBubble(): { text: string } | null {
    return this.current ? { text: this.current.text } : null;
  }

  clearBubble(): void {
    this.current = null;
  }

  /** When the same line is shown in a full-screen reaction, end the bubble together with that beat. */
  alignBubbleTtl(seconds: number): void {
    if (this.current) this.current.ttl = seconds;
  }
}

function pickWeighted(lines: WeightedLine[]): WeightedLine | null {
  if (!lines.length) return null;
  let total = 0;
  for (const l of lines) total += l.weight;
  let r = Math.random() * total;
  for (const l of lines) {
    r -= l.weight;
    if (r <= 0) return l;
  }
  return lines[lines.length - 1]!;
}
