import type { Ball } from '../physics/Ball.js';
import type { RulesContext } from './rules.types.js';

/** Line segments in the 2D table plane (physics x,y). */
export interface Segment2D {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Point2D {
  x: number;
  y: number;
}

export interface AimPreviewResult {
  show: boolean;
  /** Cue center → first contact or ray end. */
  cueToHit: Segment2D;
  /** Curved cue guideline approximation (intentionally imperfect). */
  cueCurve: Point2D[] | null;
  /** Subtle trailing hint behind the curved guideline. */
  cueTrail: Point2D[] | null;
  /** Cue-ball center at first contact with the object ball ("ghost ball" center). */
  cueImpactPoint: { x: number; y: number } | null;
  /** From target: “object ball” ghost (approximate). */
  objectGhost: Segment2D | null;
  /** From contact: “cue ball” ghost (approximate elastic). */
  cueGhost: Segment2D | null;
}

/** Upper bound for ray search — practically unlimited; covers the entire table at any aspect. */
const MAX_RAY = 1_000_000;
/** Visual length when the aim ray doesn't intersect any ball (cue line into the void). */
const NO_TARGET_RAY_VISUAL = 4000;
const GHOST_OBJ = 95;
const GHOST_CUE = 80;

/**
 * First object ball the cue ray would hit (same rules as aim preview / open-table 8 skip).
 * Ray–circle hit: C + t d, t>0, |P−O| = R (R = sum of ball radii).
 */
export function findFirstRayHitBall(
  balls: Ball[],
  cue: Ball,
  aimAngle: number,
  rules?: Pick<RulesContext, 'openTable'>,
): Ball | null {
  const dx = Math.cos(aimAngle);
  const dy = Math.sin(aimAngle);
  const cx = cue.pos.x;
  const cy = cue.pos.y;
  const rc = cue.radius;

  let bestT = MAX_RAY;
  let target: Ball | null = null;

  const skipEightWhileOpen =
    rules?.openTable &&
    balls.some((x) => x.active && (x.kind === 'solid' || x.kind === 'stripe'));

  for (const b of balls) {
    if (!b.active || b.id === cue.id) continue;
    if (skipEightWhileOpen && b.kind === 'eight') continue;
    const sumR = rc + b.radius;
    const t = rayCircleFirstHit(cx, cy, dx, dy, b.pos.x, b.pos.y, sumR);
    if (t != null && t > 1e-3 && t < bestT) {
      bestT = t;
      target = b;
    }
  }
  return target;
}

export function computeAimPreview(
  balls: Ball[],
  cue: Ball,
  aimAngle: number,
  rules?: Pick<RulesContext, 'openTable'>,
  spin?: { x: number; y: number },
): AimPreviewResult {
  const dx = Math.cos(aimAngle);
  const dy = Math.sin(aimAngle);
  const cx = cue.pos.x;
  const cy = cue.pos.y;
  const rc = cue.radius;

  const target = findFirstRayHitBall(balls, cue, aimAngle, rules);

  let bestT = MAX_RAY;
  if (target) {
    const sumR = rc + target.radius;
    const tHit = rayCircleFirstHit(cx, cy, dx, dy, target.pos.x, target.pos.y, sumR);
    if (tHit != null && tHit > 1e-3) bestT = tHit;
  }

  const Chx = cx + bestT * dx;
  const Chy = cy + bestT * dy;
  const cueToHit: Segment2D = { x0: cx, y0: cy, x1: Chx, y1: Chy };
  const sx = Math.max(-1, Math.min(1, spin?.x ?? 0));
  const sy = Math.max(-1, Math.min(1, spin?.y ?? 0));
  const spinStrength = Math.max(0, Math.min(1, Math.hypot(sx, sy)));

  if (!target) {
    const farX = cx + dx * NO_TARGET_RAY_VISUAL;
    const farY = cy + dy * NO_TARGET_RAY_VISUAL;
    const guideLen = Math.min(560, NO_TARGET_RAY_VISUAL);
    const curve = spinStrength > 0.03 ? buildCueCurve(cx, cy, dx, dy, guideLen, sx, sy) : null;
    return {
      show: true,
      cueToHit: { x0: cx, y0: cy, x1: farX, y1: farY },
      cueCurve: curve,
      cueTrail: curve ? buildCueTrail(curve) : null,
      cueImpactPoint: null,
      objectGhost: null,
      cueGhost: null,
    };
  }

  const Ox = target.pos.x;
  const Oy = target.pos.y;
  const Lx = Ox - Chx;
  const Ly = Oy - Chy;
  const llen = Math.hypot(Lx, Ly) || 1;
  const Lux = Lx / llen;
  const Luy = Ly / llen;
  const dot = dx * Lux + dy * Luy;
  const cgx = dx - 2 * dot * Lux;
  const cgy = dy - 2 * dot * Luy;
  const cglen = Math.hypot(cgx, cgy) || 1;
  const cux = cgx / cglen;
  const cuy = cgy / cglen;

  /** Equal-mass elastic split: object ball gets v*cos(theta), cue ball keeps v*sin(theta). */
  const cos = Math.max(0, Math.min(1, dot));
  const sin = Math.sqrt(Math.max(0, 1 - cos * cos));
  const objLen = GHOST_OBJ * cos;
  const cueLen = GHOST_CUE * sin;

  const objectGhost: Segment2D = {
    x0: Chx,
    y0: Chy,
    x1: Chx + Lux * objLen,
    y1: Chy + Luy * objLen,
  };
  const cueGhost: Segment2D = {
    x0: Chx,
    y0: Chy,
    x1: Chx + cux * cueLen,
    y1: Chy + cuy * cueLen,
  };

  return {
    show: true,
    cueToHit,
    cueCurve:
      spinStrength > 0.03 ? buildCueCurve(cx, cy, dx, dy, Math.max(40, Math.min(bestT, 560)), sx, sy) : null,
    cueTrail:
      spinStrength > 0.03
        ? buildCueTrail(buildCueCurve(cx, cy, dx, dy, Math.max(40, Math.min(bestT, 560)), sx, sy))
        : null,
    cueImpactPoint: { x: Chx, y: Chy },
    objectGhost,
    cueGhost,
  };
}

function buildCueCurve(
  cx: number,
  cy: number,
  dx: number,
  dy: number,
  totalLen: number,
  spinX: number,
  spinY: number,
): Point2D[] {
  const out: Point2D[] = [{ x: cx, y: cy }];
  const spinStrength = Math.max(0, Math.min(1, Math.hypot(spinX, spinY)));
  const steps = Math.max(8, Math.min(34, Math.floor(totalLen / 18)));
  const stepLen = totalLen / steps;
  let px = cx;
  let py = cy;
  let dirx = dx;
  let diry = dy;
  for (let i = 0; i < steps; i++) {
    const t = (i + 1) / steps;
    const baseCurve = spinX * (0.03 + 0.085 * t) * (0.36 + 0.64 * spinStrength);
    const uncertainty = spinStrength * 0.015 * Math.sin(t * 3.2 + spinY * 1.5);
    const curve = baseCurve + uncertainty;
    const perpx = -diry;
    const perpy = dirx;
    dirx += perpx * curve;
    diry += perpy * curve;
    const inv = 1 / (Math.hypot(dirx, diry) || 1);
    dirx *= inv;
    diry *= inv;
    px += dirx * stepLen;
    py += diry * stepLen;
    out.push({ x: px, y: py });
  }
  return out;
}

function buildCueTrail(points: Point2D[]): Point2D[] {
  if (points.length <= 2) return points.slice();
  const out: Point2D[] = [];
  for (let i = 0; i < points.length; i++) {
    if (i % 2 === 0 || i === points.length - 1) out.push(points[i]!);
  }
  return out;
}

function rayCircleFirstHit(
  cx: number,
  cy: number,
  dx: number,
  dy: number,
  ox: number,
  oy: number,
  radius: number,
): number | null {
  const fx = cx - ox;
  const fy = cy - oy;
  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - radius * radius;
  if (Math.abs(a) < 1e-12) return null;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  const t1 = (-b - s) / (2 * a);
  const t2 = (-b + s) / (2 * a);
  const eps = 1e-2;
  const candidates = [t1, t2].filter((t) => t > eps);
  if (!candidates.length) return null;
  return Math.min(...candidates);
}
