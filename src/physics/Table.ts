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

  constructor() {
    /** Slightly smaller table — less clash with top HUD in portrait. */
    this.width = 368;
    this.height = 658;
    this.margin = 34;
    const pocketR = 20;
    const m = this.margin;
    const w = this.width;
    const h = this.height;

    this.pockets = [
      { id: 0, pos: new Vec2(m, m), radius: pocketR },
      { id: 1, pos: new Vec2(w * 0.5, m * 0.65), radius: pocketR },
      { id: 2, pos: new Vec2(w - m, m), radius: pocketR },
      { id: 3, pos: new Vec2(m, h - m), radius: pocketR },
      { id: 4, pos: new Vec2(w * 0.5, h - m * 0.65), radius: pocketR },
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
    const midHalf = 28;
    const sideCorner = 22;
    const cx = w * 0.5;

    this.cushions = [
      { ax: innerL + cornerAlong, ay: innerT, bx: cx - midHalf, by: innerT },
      { ax: cx + midHalf, ay: innerT, bx: innerR - cornerAlong, by: innerT },
      { ax: innerL + cornerAlong, ay: innerB, bx: cx - midHalf, by: innerB },
      { ax: cx + midHalf, ay: innerB, bx: innerR - cornerAlong, by: innerB },
      { ax: innerL, ay: innerT + sideCorner, bx: innerL, by: innerB - sideCorner },
      { ax: innerR, ay: innerT + sideCorner, bx: innerR, by: innerB - sideCorner },
    ];

    this.headStringY = h * 0.72;
    this.playableMinX = innerL;
    this.playableMaxX = innerR;
    this.playableMinY = innerT;
    this.playableMaxY = innerB;
  }
}
