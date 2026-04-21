import { Vec2 } from './Vec2.js';

export type BallKind = 'cue' | 'solid' | 'stripe' | 'eight';

export class Ball {
  readonly pos = new Vec2();
  readonly vel = new Vec2();
  /** Pocketed balls are inactive until re-spot (cue) or removed. */
  active = true;
  /** English on cue (-1..1); decays during motion. */
  english = new Vec2();
  /** Visual / rules number: 1-15 for object balls, 0 cue. */
  number: number;
  kind: BallKind;

  constructor(
    public readonly id: number,
    number: number,
    kind: BallKind,
    public readonly radius: number,
  ) {
    this.number = number;
    this.kind = kind;
  }

  speed(): number {
    return this.vel.len();
  }

  isMoving(eps = 0.02): boolean {
    return this.active && this.vel.lenSq() > eps * eps;
  }
}
