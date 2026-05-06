import type { CushionSegment } from '../physics/Table.js';

export interface Pt {
  x: number;
  y: number;
}

/** Klasik yardımcılar — saf, pure-fonksiyon. */
export function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function distSq(a: Pt, b: Pt): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function distPointToSegment(p: Pt, a: Pt, b: Pt): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const ab2 = abx * abx + aby * aby;
  if (ab2 < 1e-10) return Math.hypot(apx, apy);
  let t = (apx * abx + apy * aby) / ab2;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + abx * t;
  const cy = a.y + aby * t;
  return Math.hypot(p.x - cx, p.y - cy);
}

/** Two-segment minimum distance using parametric approach (handles parallel + clamps). */
export function segmentSegmentMinDistance(a0: Pt, a1: Pt, b0: Pt, b1: Pt): number {
  const dx1 = a1.x - a0.x;
  const dy1 = a1.y - a0.y;
  const dx2 = b1.x - b0.x;
  const dy2 = b1.y - b0.y;
  const rx = a0.x - b0.x;
  const ry = a0.y - b0.y;
  const a = dx1 * dx1 + dy1 * dy1;
  const e = dx2 * dx2 + dy2 * dy2;
  const f = dx2 * rx + dy2 * ry;

  let s: number;
  let t: number;

  if (a < 1e-10 && e < 1e-10) {
    return Math.hypot(rx, ry);
  }
  if (a < 1e-10) {
    s = 0;
    t = Math.max(0, Math.min(1, f / e));
  } else {
    const c = dx1 * rx + dy1 * ry;
    if (e < 1e-10) {
      t = 0;
      s = Math.max(0, Math.min(1, -c / a));
    } else {
      const b = dx1 * dx2 + dy1 * dy2;
      const denom = a * e - b * b;
      if (denom !== 0) {
        s = Math.max(0, Math.min(1, (b * f - c * e) / denom));
      } else {
        s = 0;
      }
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = Math.max(0, Math.min(1, -c / a));
      } else if (t > 1) {
        t = 1;
        s = Math.max(0, Math.min(1, (b - c) / a));
      }
    }
  }

  const cx1 = a0.x + dx1 * s;
  const cy1 = a0.y + dy1 * s;
  const cx2 = b0.x + dx2 * t;
  const cy2 = b0.y + dy2 * t;
  return Math.hypot(cx1 - cx2, cy1 - cy2);
}

/** Yarıçap-şişirilmiş bir hareket çizgisi (p0→p1) bir cushion segmenti ile çakışıyor mu? */
export function sweptSegmentHitsCushion(p0: Pt, p1: Pt, radius: number, seg: CushionSegment): boolean {
  const segA = { x: seg.ax, y: seg.ay };
  const segB = { x: seg.bx, y: seg.by };
  const minD = segmentSegmentMinDistance(p0, p1, segA, segB);
  return minD < radius;
}

export interface CushionBlockOpts {
  /** Bu noktanın etrafında verilen yarıçap içindeki cushion'ları yok say (cep boğazı için). */
  ignoreNearPocketPos?: Pt;
  ignoreNearPocketRadius?: number;
  /** Bu rolleri yok say (örn. bank reflektörü olarak kullanılan rail'i bloklayıcı sayma). */
  ignoreSegmentRefs?: ReadonlySet<CushionSegment>;
  /** Belirli cushion rollerini yok say. */
  ignoreRoles?: ReadonlySet<CushionSegment['role']>;
}

/** Hat boyunca herhangi bir cushion'a değiyor mu? */
export function sweptSegmentBlocked(
  p0: Pt,
  p1: Pt,
  radius: number,
  cushions: readonly CushionSegment[],
  opts: CushionBlockOpts = {},
): boolean {
  const ignorePos = opts.ignoreNearPocketPos;
  const ignoreR = opts.ignoreNearPocketRadius ?? 0;
  const ignoreRefs = opts.ignoreSegmentRefs;
  const ignoreRoles = opts.ignoreRoles;

  for (const seg of cushions) {
    if (ignoreRefs && ignoreRefs.has(seg)) continue;
    if (ignoreRoles && ignoreRoles.has(seg.role)) continue;
    if (ignorePos && ignoreR > 0) {
      /** Segment'in cep merkezine en yakın noktası çok yakınsa atla (cep ağzındaki bantlar). */
      const dToPocket = distPointToSegment(ignorePos, { x: seg.ax, y: seg.ay }, { x: seg.bx, y: seg.by });
      if (dToPocket < ignoreR) continue;
    }
    if (sweptSegmentHitsCushion(p0, p1, radius, seg)) return true;
  }
  return false;
}

/** Aynı kontrol, fakat ilk çarpışan cushion'ı geri döndürür (debug / scoring için). */
export function firstCushionHit(
  p0: Pt,
  p1: Pt,
  radius: number,
  cushions: readonly CushionSegment[],
  opts: CushionBlockOpts = {},
): CushionSegment | null {
  let bestT = Infinity;
  let bestSeg: CushionSegment | null = null;
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const totalLen = Math.hypot(dx, dy) || 1;

  const ignorePos = opts.ignoreNearPocketPos;
  const ignoreR = opts.ignoreNearPocketRadius ?? 0;
  const ignoreRefs = opts.ignoreSegmentRefs;
  const ignoreRoles = opts.ignoreRoles;

  for (const seg of cushions) {
    if (ignoreRefs && ignoreRefs.has(seg)) continue;
    if (ignoreRoles && ignoreRoles.has(seg.role)) continue;
    if (ignorePos && ignoreR > 0) {
      const dToPocket = distPointToSegment(ignorePos, { x: seg.ax, y: seg.ay }, { x: seg.bx, y: seg.by });
      if (dToPocket < ignoreR) continue;
    }
    if (!sweptSegmentHitsCushion(p0, p1, radius, seg)) continue;
    /** Approximate parametric t along p0→p1 of the closest contact. */
    const t = approxContactT(p0, p1, radius, seg);
    if (t < bestT) {
      bestT = t;
      bestSeg = seg;
    }
  }
  void totalLen;
  return bestSeg;
}

function approxContactT(p0: Pt, p1: Pt, radius: number, seg: CushionSegment): number {
  /** Sample-based; ucuz ama yeterli (bank/lookahead skorlaması için). */
  const N = 12;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const x = p0.x + (p1.x - p0.x) * t;
    const y = p0.y + (p1.y - p0.y) * t;
    const d = distPointToSegment({ x, y }, { x: seg.ax, y: seg.ay }, { x: seg.bx, y: seg.by });
    if (d < radius) return t;
  }
  return 1;
}

/** Bir noktayı bir doğru parçasının üzerinden yansıt (bank/sanal cep için). */
export function reflectPointAcrossLine(p: Pt, a: Pt, b: Pt): Pt {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-10) return { x: p.x, y: p.y };
  /** Foot of perpendicular from p onto line(a,b). */
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  const fx = a.x + dx * t;
  const fy = a.y + dy * t;
  return { x: 2 * fx - p.x, y: 2 * fy - p.y };
}

/** İki nokta arasındaki segmentin, c merkezli r yarıçaplı dairenin **dışında kalan** kısmını döndür (içe girince keser). */
export function clampSegmentOutsideCircle(p0: Pt, p1: Pt, c: Pt, r: number): { p0: Pt; p1: Pt } {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const fx = p0.x - c.x;
  const fy = p0.y - c.y;
  const a = dx * dx + dy * dy;
  if (a < 1e-10) return { p0, p1 };
  const b = 2 * (fx * dx + fy * dy);
  const cc = fx * fx + fy * fy - r * r;
  const disc = b * b - 4 * a * cc;
  if (disc <= 0) return { p0, p1 };
  const sq = Math.sqrt(disc);
  const t1 = (-b - sq) / (2 * a);
  /** İlk girişe kırp (t1 ∈ (0,1) ise). */
  if (t1 > 0 && t1 < 1) {
    return { p0, p1: { x: p0.x + dx * t1, y: p0.y + dy * t1 } };
  }
  return { p0, p1 };
}

/** İki segmentin doğrusal kesişim noktasını ver (parametre s,t ∈ ℝ). null = paralel. */
export function lineIntersection(a0: Pt, a1: Pt, b0: Pt, b1: Pt): { x: number; y: number; s: number; t: number } | null {
  const x1 = a0.x;
  const y1 = a0.y;
  const x2 = a1.x;
  const y2 = a1.y;
  const x3 = b0.x;
  const y3 = b0.y;
  const x4 = b1.x;
  const y4 = b1.y;
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-10) return null;
  const s = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  const t = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
  return { x: x1 + s * (x2 - x1), y: y1 + s * (y2 - y1), s, t };
}

/** angularDelta(a,b) ∈ [-π, π]. */
export function wrapAngle(a: number): number {
  let r = a;
  while (r > Math.PI) r -= 2 * Math.PI;
  while (r < -Math.PI) r += 2 * Math.PI;
  return r;
}

export function angleDiff(a: number, b: number): number {
  return Math.abs(wrapAngle(a - b));
}
