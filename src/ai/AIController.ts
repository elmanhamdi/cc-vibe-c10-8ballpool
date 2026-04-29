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
  cueId?: string;
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

          const base = 1000 / (distSum + 40);
          const cut = cutQuality(view.cue.pos, obj.pos, pk.pos);
          const clear = clearanceFactor(view, obj, view.cue, pk.pos);
          const scratch = scratchRisk(view.cue.pos, obj.pos, pk.pos);
          const confidence = base * cut * clear * scratch;
          const score =
            confidence *
            (1 + this.profile.risk * 0.08) *
            (1 - tier.mistakeChance * 0.08);

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

    /** Opponent “thinks” 1–3 s before shooting (HUD ring + feel). Lower pace = faster. */
    const thinkMs = (1000 + rng() * 2000) * this.profile.pace;

    return { angle, power01, spinX, spinY, thinkMs };
  }
}

function cutQuality(cue: Vec2, obj: Vec2, pocket: Vec2): number {
  const v1x = obj.x - cue.x;
  const v1y = obj.y - cue.y;
  const v2x = pocket.x - obj.x;
  const v2y = pocket.y - obj.y;
  const len1 = Math.hypot(v1x, v1y);
  const len2 = Math.hypot(v2x, v2y);
  if (len1 < 1e-4 || len2 < 1e-4) return 0.8;
  const cos = (v1x * v2x + v1y * v2y) / (len1 * len2);
  // 1 = straight line, 0 = 90deg cut; clamp to avoid negatives.
  const clamped = Math.max(0, Math.min(1, cos));
  return 0.55 + 0.45 * clamped;
}

function clearanceFactor(view: AIWorldView, target: Ball, cue: Ball, pocketPos: Vec2): number {
  const segs = [
    { a: cue.pos, b: target.pos, ignoreCue: true },
    { a: target.pos, b: pocketPos, ignoreCue: false },
  ];
  const threshold = target.radius * 2.3;
  let min = Infinity;

  for (const s of segs) {
    for (const b of view.balls) {
      if (!b.active) continue;
      if (b.id === target.id) continue;
      if (s.ignoreCue && b.id === cue.id) continue;
      const d = distPointToSegment(b.pos, s.a, s.b);
      if (d < min) min = d;
    }
  }

  if (!Number.isFinite(min)) return 1;
  if (min >= threshold) return 1;
  // Soft penalty when traffic is close to the line.
  return Math.max(0.3, min / threshold);
}

function scratchRisk(cuePos: Vec2, objPos: Vec2, pocketPos: Vec2): number {
  // If cue path and pocket line are nearly aligned, reduce confidence slightly.
  const v1x = objPos.x - cuePos.x;
  const v1y = objPos.y - cuePos.y;
  const v2x = pocketPos.x - cuePos.x;
  const v2y = pocketPos.y - cuePos.y;
  const len1 = Math.hypot(v1x, v1y);
  const len2 = Math.hypot(v2x, v2y);
  if (len1 < 1e-4 || len2 < 1e-4) return 1;
  const cos = (v1x * v2x + v1y * v2y) / (len1 * len2);
  if (cos > 0.96) return 0.72;
  if (cos > 0.9) return 0.86;
  return 1;
}

function distPointToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const abLenSq = abx * abx + aby * aby;
  if (abLenSq < 1e-8) return Math.hypot(apx, apy);
  let t = (apx * abx + apy * aby) / abLenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + abx * t;
  const cy = a.y + aby * t;
  return Math.hypot(p.x - cx, p.y - cy);
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
