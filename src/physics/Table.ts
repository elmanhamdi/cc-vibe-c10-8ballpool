import { Vec2 } from './Vec2.js';

export interface Pocket {
  id: number;
  pos: Vec2;
  radius: number;
}

export interface CushionSegment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

export class Table {
  readonly width: number;
  readonly height: number;
  readonly margin: number;
  readonly pockets: Pocket[];
  readonly cushions: CushionSegment[];

  /** Kitchen / head string line Y (breaker shoots from below this line). */
  readonly headStringY: number;
  /** Cue ball allowed half-width inside table from cushions. */
  readonly playableMinX: number;
  readonly playableMaxX: number;
  readonly playableMinY: number;
  readonly playableMaxY: number;

  /** Cushion cutout geometry (same values used to build `cushions`) — for debug / tooling. */
  readonly cushionCornerAlong: number;
  readonly cushionMidHalf: number;
  readonly cushionSideCorner: number;

  constructor() {
    /** Slightly smaller table — less clash with top HUD in portrait. */
    this.width = 368;
    this.height = 658;
    /** ~20px closer to each rim vs 34 — wider play between rails and pockets. */
    this.margin = 27;
    const pocketR = 20;
    const m = this.margin;
    const w = this.width;
    const h = this.height;
    const cy = h * 0.5;

    this.pockets = [
      { id: 0, pos: new Vec2(m, m), radius: pocketR },
      /** Side pockets on long rails (physics x = narrow phone width → world left/right). */
      { id: 1, pos: new Vec2(m * 0.65, cy), radius: pocketR },
      { id: 2, pos: new Vec2(w - m, m), radius: pocketR },
      { id: 3, pos: new Vec2(m, h - m), radius: pocketR },
      { id: 4, pos: new Vec2(w - m * 0.65, cy), radius: pocketR },
      { id: 5, pos: new Vec2(w - m, h - m), radius: pocketR },
    ];

    const inset = 14;
    const innerL = m + inset;
    const innerR = w - m - inset;
    const innerT = m + inset;
    const innerB = h - m - inset;

    /**
     * Pocket mouths at corners and mids — a single closed cushion rectangle blocked paths;
     * balls could not reach pockets. Split rails into segments with gaps.
     * Gap sizes: too wide and balls escape at rails; balance with pot-before-cushion order.
     */
    const cornerAlong = 20;
    /** Half-gap along rail for mid-pocket mouth (was on top/bottom; now on left/right rails). */
    const midHalf = 28;
    const sideCorner = 22;

    this.cushionCornerAlong = cornerAlong;
    this.cushionMidHalf = midHalf;
    this.cushionSideCorner = sideCorner;

    this.cushions = [
      { ax: innerL + cornerAlong, ay: innerT, bx: innerR - cornerAlong, by: innerT },
      { ax: innerL + cornerAlong, ay: innerB, bx: innerR - cornerAlong, by: innerB },
      { ax: innerL, ay: innerT + sideCorner, bx: innerL, by: cy - midHalf },
      { ax: innerL, ay: cy + midHalf, bx: innerL, by: innerB - sideCorner },
      { ax: innerR, ay: innerT + sideCorner, bx: innerR, by: cy - midHalf },
      { ax: innerR, ay: cy + midHalf, bx: innerR, by: innerB - sideCorner },
    ];

    this.headStringY = h * 0.72;
    this.playableMinX = innerL;
    this.playableMaxX = innerR;
    this.playableMinY = innerT;
    this.playableMaxY = innerB;
  }
}
