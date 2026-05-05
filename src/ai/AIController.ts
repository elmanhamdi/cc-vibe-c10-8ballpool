import { Vec2 } from '../physics/Vec2.js';
import type { Ball } from '../physics/Ball.js';
import type { Table } from '../physics/Table.js';
import type { Pocket } from '../physics/Table.js';
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

/** Ghost-ball contact point (2r back from object along pocket line). */
function ghostBallNearPocket(obj: Vec2, pocket: Vec2, r: number): { x: number; y: number } {
  const dx = pocket.x - obj.x;
  const dy = pocket.y - obj.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-4) return { x: obj.x, y: obj.y };
  const ux = dx / len;
  const uy = dy / len;
  return { x: obj.x - ux * 2.0 * r, y: obj.y - uy * 2.0 * r };
}

function aimAngleToPoint(cue: Vec2, target: { x: number; y: number }): number {
  return Math.atan2(target.y - cue.y, target.x - cue.x);
}

/** Corner pocket ids (near rails); prefer these when AI runs the 8. */
const CORNER_POCKET_IDS = new Set([0, 2, 3, 5]);

function pocketsForRanking(table: Table, obj: Ball): readonly Pocket[] {
  if (obj.kind !== 'eight') return table.pockets;
  return [...table.pockets].sort((a, b) => {
    const ac = CORNER_POCKET_IDS.has(a.id) ? 0 : 1;
    const bc = CORNER_POCKET_IDS.has(b.id) ? 0 : 1;
    return ac - bc;
  });
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
    let best: {
      angle: number;
      pow: number;
      score: number;
      cut: number;
      d1: number;
      d2: number;
    } | null = null;

    if (targets.length) {
      for (const obj of targets) {
        for (const pk of pocketsForRanking(view.table, obj)) {
          const ghost = ghostBallNearPocket(obj.pos, pk.pos, obj.radius);
          const angle = aimAngleToPoint(view.cue.pos, ghost);
          const d1 = dist(view.cue.pos, obj.pos);
          const d2 = dist(obj.pos, pk.pos);
          const distSum = d1 + d2;

          const cut = cutQuality(view.cue.pos, obj.pos, pk.pos);
          const clear = clearanceFactor(view, obj, view.cue, ghost, pk.pos);
          const scratch = scratchRisk(view.cue.pos, obj.pos, pk.pos);
          const pocketApp = pocketApproachFactor(view.table, obj.pos, pk.pos);
          const cueScr = cueScratchFactor(view, ghost);

          const score =
            cut ** 1.6 *
            clear *
            scratch *
            pocketApp *
            cueScr *
            (1.0 + 220 / (distSum + 60)) *
            (1 + this.profile.risk * 0.05);

          if (!best || score > best.score) {
            const cutClamped = Math.max(1e-4, cut);
            const baseP = 0.32 + d1 / 900 + d2 / 700;
            const cutBoost = (1 - cutClamped) * 0.18;
            const powTarget = Math.min(0.92, Math.max(0.28, baseP + cutBoost));
            best = { angle, pow: powTarget, score, cut: cutClamped, d1, d2 };
          }
        }
      }
    }

    if (best && best.score < 0.04) {
      const safety = pickSafetyShot(view, targets, this.profile, rng);
      if (safety) return safety;
    }

    let angle = best?.angle ?? -Math.PI / 2 + (rng() - 0.5) * 0.25;
    let power01 = best?.pow ?? 0.55;

    const acc = 0.35 + this.profile.accuracy * 0.65;
    const noise = tier.aimNoiseRad * (1.05 - acc) * (rng() - 0.5) * 2 * (0.55 + rng() * 0.45);
    angle += noise;

    power01 += (rng() - 0.5) * tier.powerJitter * (1 - acc * 0.8);
    power01 = Math.max(0.18, Math.min(1, power01));

    if (rng() < tier.mistakeChance * (1 - acc * 0.7)) {
      angle += (rng() - 0.5) * 0.22;
      power01 *= 0.72 + rng() * 0.28;
    }

    if (rng() < this.profile.risk * 0.28) {
      power01 = Math.min(1, power01 * 1.08);
    }

    let spinX = 0;
    let spinY = 0;
    if (tier.spinUsage > 0.25) {
      let nearPocket = false;
      for (const pk of view.table.pockets) {
        if (dist(view.cue.pos, pk.pos) < view.cue.radius * 9) {
          nearPocket = true;
          break;
        }
      }
      if (nearPocket) spinY = -0.35;
    }

    const thinkMs = (1000 + rng() * 2000) * this.profile.pace;

    return { angle, power01, spinX, spinY, thinkMs };
  }
}

function pickSafetyShot(
  view: AIWorldView,
  targets: Ball[],
  profile: AICharacterProfile,
  rng: () => number,
): AIShotPlan | null {
  const nonEight = targets.filter((b) => b.kind !== 'eight');
  const list = nonEight.length ? nonEight : targets;
  if (!list.length) return null;

  let pick = list[0]!;
  let dMin = Infinity;
  for (const t of list) {
    const d = dist(view.cue.pos, t.pos);
    if (d < dMin) {
      dMin = d;
      pick = t;
    }
  }

  const angle = Math.atan2(pick.pos.y - view.cue.pos.y, pick.pos.x - view.cue.pos.x);
  const thinkMs = (1000 + rng() * 2000) * profile.pace;
  return { angle, power01: 0.32, spinX: 0, spinY: 0, thinkMs };
}

function cutQuality(cue: Vec2, obj: Vec2, pocket: Vec2): number {
  const v1x = obj.x - cue.x;
  const v1y = obj.y - cue.y;
  const v2x = pocket.x - obj.x;
  const v2y = pocket.y - obj.y;
  const len1 = Math.hypot(v1x, v1y);
  const len2 = Math.hypot(v2x, v2y);
  if (len1 < 1e-4 || len2 < 1e-4) return 0;
  const cos = (v1x * v2x + v1y * v2y) / (len1 * len2);
  const clamped = Math.max(0, Math.min(1, cos));
  return clamped ** 2;
}

function clearanceFactor(
  view: AIWorldView,
  target: Ball,
  cue: Ball,
  ghost: { x: number; y: number },
  pocketPos: Vec2,
): number {
  const segs = [
    { a: cue.pos, b: ghost, ignoreCue: true },
    { a: target.pos, b: pocketPos, ignoreCue: false },
  ];
  const threshold = target.radius * 2.6;
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
  if (min < 1.05 * target.radius) return 0.04;
  if (min >= threshold) return 1;
  return Math.max(0.3, min / threshold);
}

function scratchRisk(cuePos: Vec2, objPos: Vec2, pocketPos: Vec2): number {
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

/** Penalize steep entry vs table-center → pocket axis (rough throat alignment). */
function pocketApproachFactor(table: Table, obj: Vec2, pocket: Vec2): number {
  const pcx = table.width * 0.5;
  const pcy = table.height * 0.5;
  const ix = pcx - pocket.x;
  const iy = pcy - pocket.y;
  const inLen = Math.hypot(ix, iy);
  if (inLen < 1e-4) return 1;
  const ax = pocket.x - obj.x;
  const ay = pocket.y - obj.y;
  const aLen = Math.hypot(ax, ay);
  if (aLen < 1e-4) return 1;
  const cos = (ax * ix + ay * iy) / (aLen * inLen);
  const cos60 = Math.cos((60 * Math.PI) / 180);
  if (cos >= cos60) return 1;
  return Math.max(0.35, (cos + 0.1) / (cos60 + 0.1));
}

/** Cue path toward ghost passes too close to a pocket — scratch risk. */
function cueScratchFactor(view: AIWorldView, ghost: { x: number; y: number }): number {
  let pen = 1;
  for (const pk of view.table.pockets) {
    const dLine = distPointToSegment(pk.pos, view.cue.pos, ghost);
    if (dLine < view.cue.radius * 1.8 && dist(view.cue.pos, pk.pos) < view.cue.radius * 10) {
      pen *= 0.72;
    }
  }
  return pen;
}

function distPointToSegment(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
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
