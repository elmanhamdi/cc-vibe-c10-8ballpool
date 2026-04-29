import { Vec2 } from './Vec2.js';
import {
  DEFAULT_TABLE_LAYOUT,
  mergeTableLayout,
  type TableLayoutConfig,
} from './tableLayoutConfig.js';

export interface Pocket {
  id: number;
  pos: Vec2;
  radius: number;
}

export type CushionRole = 'rail' | 'pocketOuter' | 'pocketBridge';

/** Straight segment used for cushion / outer pocket wall. */
export interface CushionSegment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  role: CushionRole;
}

function closestPointOnSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): { x: number; y: number } {
  const abx = bx - ax;
  const aby = by - ay;
  const abLenSq = abx * abx + aby * aby;
  if (abLenSq < 1e-12) return { x: ax, y: ay };
  let t = ((px - ax) * abx + (py - ay) * aby) / abLenSq;
  t = Math.max(0, Math.min(1, t));
  return { x: ax + abx * t, y: ay + aby * t };
}

function distSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/** İki dış yay ucu → iki bitişik bant segmenti; çapraz eşleme toplam mesafeyi minimize eder. */
function pushPocketRailBridges(
  out: CushionSegment[],
  arcAx: number,
  arcAy: number,
  arcBx: number,
  arcBy: number,
  rail0: CushionSegment,
  rail1: CushionSegment,
): void {
  const c0a = closestPointOnSegment(arcAx, arcAy, rail0.ax, rail0.ay, rail0.bx, rail0.by);
  const c0b = closestPointOnSegment(arcBx, arcBy, rail0.ax, rail0.ay, rail0.bx, rail0.by);
  const c1a = closestPointOnSegment(arcAx, arcAy, rail1.ax, rail1.ay, rail1.bx, rail1.by);
  const c1b = closestPointOnSegment(arcBx, arcBy, rail1.ax, rail1.ay, rail1.bx, rail1.by);
  const cross1 = distSq(arcAx, arcAy, c0a.x, c0a.y) + distSq(arcBx, arcBy, c1b.x, c1b.y);
  const cross2 = distSq(arcAx, arcAy, c1a.x, c1a.y) + distSq(arcBx, arcBy, c0b.x, c0b.y);
  if (cross1 <= cross2) {
    out.push({ ax: arcAx, ay: arcAy, bx: c0a.x, by: c0a.y, role: 'pocketBridge' });
    out.push({ ax: arcBx, ay: arcBy, bx: c1b.x, by: c1b.y, role: 'pocketBridge' });
  } else {
    out.push({ ax: arcAx, ay: arcAy, bx: c1a.x, by: c1a.y, role: 'pocketBridge' });
    out.push({ ax: arcBx, ay: arcBy, bx: c0b.x, by: c0b.y, role: 'pocketBridge' });
  }
}

function pocketOuterArcEndPoints(
  px: number,
  py: number,
  tableCx: number,
  tableCy: number,
  R: number,
  throatHalf: number,
  phaseRad: number,
): { ax: number; ay: number; bx: number; by: number } {
  const thetaIn = Math.atan2(tableCy - py, tableCx - px) + phaseRad;
  const start = thetaIn + throatHalf;
  const end = thetaIn + 2 * Math.PI - throatHalf;
  return {
    ax: px + R * Math.cos(start),
    ay: py + R * Math.sin(start),
    bx: px + R * Math.cos(end),
    by: py + R * Math.sin(end),
  };
}

/** Köşe / yan cep id → `railSegments` içindeki iki bitişik bant indeksi [i0, i1]. */
function adjacentRailIndicesForPocket(pocketId: number): [number, number] {
  switch (pocketId) {
    case 0:
      return [0, 2];
    case 1:
      return [2, 3];
    case 2:
      return [0, 4];
    case 3:
      return [1, 3];
    case 4:
      return [4, 5];
    case 5:
      return [1, 5];
    default:
      return [0, 1];
  }
}

/**
 * Pocket outer blocking arc: no segments on the arc facing the table center (throat);
 * the complementary arc blocks balls from leaving through the pocket toward the rail outside.
 */
function pushPocketOuterWall(
  out: CushionSegment[],
  px: number,
  py: number,
  tableCx: number,
  tableCy: number,
  R: number,
  throatHalf: number,
  nSeg: number,
  /** Ek faz: yayı cep merkezi etrafında döndürür (radyan). */
  phaseRad: number,
): void {
  const thetaIn = Math.atan2(tableCy - py, tableCx - px) + phaseRad;
  const start = thetaIn + throatHalf;
  const end = thetaIn + 2 * Math.PI - throatHalf;
  const span = end - start;
  const n = Math.max(1, Math.round(nSeg));
  for (let i = 0; i < n; i++) {
    const u0 = start + (span * i) / n;
    const u1 = start + (span * (i + 1)) / n;
    out.push({
      ax: px + R * Math.cos(u0),
      ay: py + R * Math.sin(u0),
      bx: px + R * Math.cos(u1),
      by: py + R * Math.sin(u1),
      role: 'pocketOuter',
    });
  }
}

export class Table {
  readonly width: number;
  readonly height: number;
  readonly margin: number;
  readonly pockets: Pocket[];
  readonly cushions: CushionSegment[];
  readonly layout: TableLayoutConfig;

  readonly headStringY: number;
  readonly playableMinX: number;
  readonly playableMaxX: number;
  readonly playableMinY: number;
  readonly playableMaxY: number;

  readonly cushionCornerAlong: number;
  readonly cushionMidHalf: number;
  readonly cushionSideCorner: number;

  constructor(layout?: Partial<TableLayoutConfig>) {
    const L = mergeTableLayout(DEFAULT_TABLE_LAYOUT, layout ?? {});
    this.layout = L;
    this.width = L.tableWidth;
    this.height = L.tableHeight;
    this.margin = L.margin;
    const pocketR = L.pocketRadius;
    const m = L.margin;
    const w = L.tableWidth;
    const h = L.tableHeight;
    const cy = h * 0.5;
    const tcx = w * 0.5;
    const tcy = h * 0.5;
    const leftShift = L.leftSideShiftPx;
    const rightShift = L.rightSideShiftPx;
    const bottomShift = L.bottomSideShiftPx;
    const topShift = L.topSideShiftPx;
    const hx = L.horizontalEndsSqueezePx;
    const topCornerPocketY = m + topShift + L.topCornerPocketExtraDownPx;
    const bottomCornerPocketY = h - m - bottomShift - L.bottomCornerPocketExtraUpPx;

    const inset = L.feltInset;
    /** Dikey bantlar + orta yan cepler — squeeze uygulanmaz (orta boşluk sabit). */
    const innerL0 = m + inset + leftShift;
    const innerR0 = w - m - inset - rightShift;

    this.pockets = [
      { id: 0, pos: new Vec2(m + leftShift + hx, topCornerPocketY), radius: pocketR },
      { id: 1, pos: new Vec2(m * L.sidePocketXMul + leftShift, cy), radius: pocketR },
      { id: 2, pos: new Vec2(w - m - rightShift - hx, topCornerPocketY), radius: pocketR },
      { id: 3, pos: new Vec2(m + leftShift + hx, bottomCornerPocketY), radius: pocketR },
      { id: 4, pos: new Vec2(w - m * L.sidePocketXMul - rightShift, cy), radius: pocketR },
      { id: 5, pos: new Vec2(w - m - rightShift - hx, bottomCornerPocketY), radius: pocketR },
    ];

    const innerT = m + inset + topShift;
    const innerB = h - m - inset - bottomShift;

    const cornerAlong = L.cornerAlong;
    const midHalf = L.midHalf;
    const sideCorner = L.sideCorner;

    this.cushionCornerAlong = cornerAlong;
    this.cushionMidHalf = midHalf;
    this.cushionSideCorner = sideCorner;

    const he = L.horizontalRailExtendAlongPx;
    const luT = L.leftUpperVerticalRailExtendTopPx;
    const luB = L.leftUpperVerticalRailExtendBottomPx;
    const llT = L.leftLowerVerticalRailExtendTopPx;
    const llB = L.leftLowerVerticalRailExtendBottomPx;
    const ruT = L.rightUpperVerticalRailExtendTopPx;
    const ruB = L.rightUpperVerticalRailExtendBottomPx;
    const rlT = L.rightLowerVerticalRailExtendTopPx;
    const rlB = L.rightLowerVerticalRailExtendBottomPx;

    const railSegments: CushionSegment[] = [
      {
        ax: innerL0 + cornerAlong + hx - he,
        ay: innerT,
        bx: innerR0 - cornerAlong - hx + he,
        by: innerT,
        role: 'rail',
      },
      {
        ax: innerL0 + cornerAlong + hx - he,
        ay: innerB,
        bx: innerR0 - cornerAlong - hx + he,
        by: innerB,
        role: 'rail',
      },
      {
        ax: innerL0,
        ay: innerT + sideCorner - luT,
        bx: innerL0,
        by: cy - midHalf + luB,
        role: 'rail',
      },
      {
        ax: innerL0,
        ay: cy + midHalf - llT,
        bx: innerL0,
        by: innerB - sideCorner + llB,
        role: 'rail',
      },
      {
        ax: innerR0,
        ay: innerT + sideCorner - ruT,
        bx: innerR0,
        by: cy - midHalf + ruB,
        role: 'rail',
      },
      {
        ax: innerR0,
        ay: cy + midHalf - rlT,
        bx: innerR0,
        by: innerB - sideCorner + rlB,
        role: 'rail',
      },
    ];
    const cushions: CushionSegment[] = [...railSegments];

    const outerR = pocketR * L.pocketOuterWallRadiusScale;
    const th = L.pocketThroatHalfAngleRad;
    const nWall = L.pocketOuterWallSegments;
    const d2r = Math.PI / 180;
    const phaseByPocketId = (id: number): number => {
      switch (id) {
        case 0:
          return L.cornerPocketOuterWallRotateDegLeftTop * d2r;
        case 2:
          return L.cornerPocketOuterWallRotateDegRightTop * d2r;
        case 3:
          return L.cornerPocketOuterWallRotateDegLeftBottom * d2r;
        case 5:
          return L.cornerPocketOuterWallRotateDegRightBottom * d2r;
        default:
          return 0;
      }
    };
    for (const p of this.pockets) {
      const ph = phaseByPocketId(p.id);
      pushPocketOuterWall(cushions, p.pos.x, p.pos.y, tcx, tcy, outerR, th, nWall, ph);
      const [r0, r1] = adjacentRailIndicesForPocket(p.id);
      const ends = pocketOuterArcEndPoints(p.pos.x, p.pos.y, tcx, tcy, outerR, th, ph);
      pushPocketRailBridges(
        cushions,
        ends.ax,
        ends.ay,
        ends.bx,
        ends.by,
        railSegments[r0]!,
        railSegments[r1]!,
      );
    }

    this.cushions = cushions;

    this.headStringY = h * L.headStringYRatio;
    this.playableMinX = innerL0;
    this.playableMaxX = innerR0;
    this.playableMinY = innerT;
    this.playableMaxY = innerB;
  }
}
