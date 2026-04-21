import type { Ball } from '../physics/Ball.js';

/** Line segments in the 2D table plane (physics x,y). */
export interface Segment2D {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface AimPreviewResult {
  show: boolean;
  /** Cue center → first contact or ray end. */
  cueToHit: Segment2D;
  /** From target: “object ball” ghost (approximate). */
  objectGhost: Segment2D | null;
  /** From contact: “cue ball” ghost (approximate elastic). */
  cueGhost: Segment2D | null;
}

const MAX_RAY = 720;
const GHOST_OBJ = 175;
const GHOST_CUE = 155;

/**
 * Ray–circle hit: C + t d, t>0, |P−O| = R (R = sum of ball radii).
 * TODO: On open table, first geometric hit vs first legal ball by rules (MVP uses ray hit).
 */
export function computeAimPreview(balls: Ball[], cue: Ball, aimAngle: number): AimPreviewResult {
  const dx = Math.cos(aimAngle);
  const dy = Math.sin(aimAngle);
  const cx = cue.pos.x;
  const cy = cue.pos.y;
  const rc = cue.radius;

  let bestT = MAX_RAY;
  let target: Ball | null = null;

  for (const b of balls) {
    if (!b.active || b.id === cue.id) continue;
    const sumR = rc + b.radius;
    const t = rayCircleFirstHit(cx, cy, dx, dy, b.pos.x, b.pos.y, sumR);
    if (t != null && t > 1e-3 && t < bestT) {
      bestT = t;
      target = b;
    }
  }

  const Chx = cx + bestT * dx;
  const Chy = cy + bestT * dy;
  const cueToHit: Segment2D = { x0: cx, y0: cy, x1: Chx, y1: Chy };

  if (!target) {
    const farX = cx + dx * MAX_RAY;
    const farY = cy + dy * MAX_RAY;
    return {
      show: true,
      cueToHit: { x0: cx, y0: cy, x1: farX, y1: farY },
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

  const objectGhost: Segment2D = {
    x0: Chx,
    y0: Chy,
    x1: Chx + Lux * GHOST_OBJ,
    y1: Chy + Luy * GHOST_OBJ,
  };
  const cueGhost: Segment2D = {
    x0: Chx,
    y0: Chy,
    x1: Chx + cux * GHOST_CUE,
    y1: Chy + cuy * GHOST_CUE,
  };

  return { show: true, cueToHit, objectGhost, cueGhost };
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
