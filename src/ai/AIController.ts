import { Vec2 } from '../physics/Vec2.js';
import type { Ball } from '../physics/Ball.js';
import type { Table } from '../physics/Table.js';
import type { RulesContext } from '../gameplay/rules.types.js';
import { kindToGroup } from '../gameplay/rules.types.js';
import type { AICharacterProfile } from './types.js';
import { tierParams } from './DifficultyProfiles.js';

export interface AIShotPlan {
  angle: number;
  power01: number;
  spinX: number;
  spinY: number;
  thinkMs: number;
}

export interface AIWorldView {
  table: Table;
  balls: Ball[];
  cue: Ball;
  rules: RulesContext;
}

export class AIController {
  constructor(private profile: AICharacterProfile) {}

  setProfile(p: AICharacterProfile): void {
    this.profile = p;
  }

  compute(view: AIWorldView): AIShotPlan {
    const tier = tierParams(this.profile.tier);
    const rng = Math.random;

    const targets = pickLegalTargets(view);
    let best: { angle: number; pow: number; score: number } | null = null;

    if (targets.length) {
      for (const obj of targets) {
        for (const pk of view.table.pockets) {
          const angle = aimAngle(view.cue.pos, obj.pos, pk.pos, obj.radius);
          const d1 = dist(view.cue.pos, obj.pos);
          const d2 = dist(obj.pos, pk.pos);
          const distSum = d1 + d2;
          const score = 1000 / (distSum + 40);
          if (!best || score > best.score) {
            const pow = Math.max(0.25, Math.min(1, 0.35 + distSum / 520));
            best = { angle, pow, score };
          }
        }
      }
    }

    let angle = best?.angle ?? -Math.PI / 2 + (rng() - 0.5) * 0.25;
    let power01 = best?.pow ?? 0.55;

    const acc = 0.35 + this.profile.accuracy * 0.65;
    const noise = tier.aimNoiseRad * (1.05 - acc) * (rng() - 0.5) * 2 * (0.55 + rng() * 0.45);
    angle += noise;

    power01 += (rng() - 0.5) * tier.powerJitter * (1 - acc * 0.8);
    power01 = Math.max(0.18, Math.min(1, power01));

    if (rng() < tier.mistakeChance * (1 - acc * 0.7)) {
      angle += (rng() - 0.5) * 0.38;
      power01 *= 0.72 + rng() * 0.28;
    }

    if (rng() < this.profile.risk * 0.28) {
      power01 = Math.min(1, power01 * 1.08);
    }

    const spinMag = tier.spinUsage * (0.35 + rng() * this.profile.accuracy);
    const spinX = (rng() - 0.5) * 2 * spinMag;
    const spinY = (rng() - 0.5) * 2 * spinMag * 0.55;

    /** Opponent “thinks” 1–3 s before shooting (HUD ring + feel). */
    const thinkMs = 1000 + rng() * 2000;

    return { angle, power01, spinX, spinY, thinkMs };
  }
}

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function aimAngle(cue: Vec2, obj: Vec2, pocket: Vec2, r: number): number {
  const dx = pocket.x - obj.x;
  const dy = pocket.y - obj.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-4) return -Math.PI / 2;
  const ux = dx / len;
  const uy = dy / len;
  const gx = obj.x - ux * 2.12 * r;
  const gy = obj.y - uy * 2.12 * r;
  return Math.atan2(gy - cue.y, gx - cue.x);
}

function pickLegalTargets(view: AIWorldView): Ball[] {
  const out: Ball[] = [];
  const { rules } = view;
  const aiGroup = rules.aiGroup;

  const groupRemaining = (g: 'solid' | 'stripe') =>
    view.balls.some((b) => b.active && kindToGroup(b.kind) === g);

  const aiNeedsEight = aiGroup && !groupRemaining(aiGroup);

  for (const b of view.balls) {
    if (!b.active || b.kind === 'cue') continue;
    if (b.kind === 'eight') {
      if (aiNeedsEight) out.push(b);
      continue;
    }
    if (rules.openTable) {
      out.push(b);
      continue;
    }
    if (aiGroup && kindToGroup(b.kind) === aiGroup) out.push(b);
  }

  if (!out.length) {
    const avoidEightOpen =
      rules.openTable &&
      view.balls.some((x) => x.active && (x.kind === 'solid' || x.kind === 'stripe'));
    for (const b of view.balls) {
      if (!b.active || b.kind === 'cue') continue;
      if (avoidEightOpen && b.kind === 'eight') continue;
      out.push(b);
    }
  }
  return out;
}
