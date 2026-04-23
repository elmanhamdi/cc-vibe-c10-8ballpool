import { Ball } from './Ball.js';
import { Table } from './Table.js';
import { Vec2 } from './Vec2.js';

const RESTITUTION = 0.94;
const CUSHION_RESTITUTION = 0.88;
const FRICTION = 1.35;
const ENGLISH_DECAY = 1.8;
const CURL_STRENGTH = 0.55;
const STOP_EPS = 0.012;
const MAX_SUBSTEPS = 6;

export interface PottedEvent {
  id: number;
  number: number;
}

export interface ShotOutcome {
  firstHitId: number | null;
  scratched: boolean;
  potted: PottedEvent[];
  anyBallMoved: boolean;
}

const tmpA = new Vec2();
const tmpB = new Vec2();
const tmpN = new Vec2();


export class CollisionSystem {
  readonly table: Table;
  readonly balls: Ball[] = [];
  readonly cue: Ball;
  private shotActive = false;
  private shotT = 0;
  private readonly shotOutcome: ShotOutcome = {
    firstHitId: null,
    scratched: false,
    potted: [],
    anyBallMoved: false,
  };

  constructor(table: Table, ballRadius: number) {
    this.table = table;
    this.balls = createRack(table, ballRadius);
    this.cue = this.balls.find((b) => b.kind === 'cue')!;
  }

  resetRack(): void {
    const r = this.cue.radius;
    const next = createRack(this.table, r);
    for (let i = 0; i < this.balls.length; i++) {
      const a = this.balls[i]!;
      const b = next[i]!;
      a.pos.copy(b.pos);
      a.vel.set(0, 0);
      a.english.set(0, 0);
      a.active = true;
    }
  }

  placeCueBallForBreak(): void {
    const t = this.table;
    this.cue.active = true;
    this.cue.pos.set(t.width * 0.5, t.height * 0.86);
    this.cue.vel.set(0, 0);
    this.cue.english.set(0, 0);
  }

  placeCueBallInKitchen(): void {
    const t = this.table;
    this.cue.active = true;
    this.cue.pos.set(t.width * 0.5, t.headStringY + 40);
    this.cue.vel.set(0, 0);
    this.cue.english.set(0, 0);
  }

  applyShot(angle: number, power01: number, spinX: number, spinY: number): void {
    const speed = 520 * (0.25 + 0.75 * power01);
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    this.cue.vel.set(c * speed, s * speed);
    this.cue.english.set(spinX, spinY);
  }

  /** Call after `applyShot` to start incremental simulation. */
  beginShot(): void {
    this.shotActive = true;
    this.shotT = 0;
    this.shotOutcome.firstHitId = null;
    this.shotOutcome.scratched = false;
    this.shotOutcome.potted.length = 0;
    this.shotOutcome.anyBallMoved = this.cue.speed() > STOP_EPS;
  }

  /** One render-frame step. Returns true when simulation finished. */
  stepFrame(dt: number): boolean {
    if (!this.shotActive) return true;
    this.shotT += dt;
    if (this.shotT > 26) {
      this.forceStopAll();
      this.shotActive = false;
      return true;
    }

    const substeps = MAX_SUBSTEPS;
    const h = dt / substeps;
    for (let k = 0; k < substeps; k++) {
      this.integrateEnglish(this.cue, h, this.shotOutcome);
      for (const b of this.balls) {
        if (!b.active) continue;
        b.pos.add(Vec2.scale(b.vel, h));
      }
      this.resolveBallBall(this.shotOutcome, h);
      this.resolvePockets(this.shotOutcome);
      this.resolveCushions();
      this.applyFriction(h);
    }

    this.snapTinyVelocities();

    if (this.allStopped()) {
      this.shotActive = false;
      return true;
    }
    return false;
  }

  snapshotOutcome(): ShotOutcome {
    return {
      firstHitId: this.shotOutcome.firstHitId,
      scratched: this.shotOutcome.scratched,
      anyBallMoved: this.shotOutcome.anyBallMoved,
      potted: this.shotOutcome.potted.map((p) => ({ ...p })),
    };
  }

  /** Deterministic “instant” sim — useful for tests / AI lookahead TODO. */
  simulateUntilRest(maxSimTime = 18): ShotOutcome {
    this.beginShot();
    const dtBase = 1 / 120;
    let t = 0;
    while (t < maxSimTime) {
      const done = this.stepFrame(dtBase);
      t += dtBase;
      if (done) break;
    }
    return this.snapshotOutcome();
  }

  private snapTinyVelocities(): void {
    for (const b of this.balls) {
      if (!b.active) continue;
      if (b.vel.lenSq() < STOP_EPS * STOP_EPS) b.vel.set(0, 0);
    }
    if (this.cue.active && this.cue.vel.lenSq() < STOP_EPS * STOP_EPS) {
      this.cue.english.set(0, 0);
    }
  }

  private forceStopAll(): void {
    for (const b of this.balls) {
      b.vel.set(0, 0);
    }
    this.cue.english.set(0, 0);
  }

  private allStopped(): boolean {
    for (const b of this.balls) {
      if (!b.active) continue;
      if (b.isMoving(STOP_EPS)) return false;
    }
    return true;
  }

  private integrateEnglish(b: Ball, h: number, outcome: ShotOutcome): void {
    if (b.kind !== 'cue' || !b.active) return;
    const sp = b.speed();
    if (sp < 1e-3) return;
    if (sp > STOP_EPS) outcome.anyBallMoved = true;
    const dir = tmpA.copy(b.vel).normalize();
    const perp = tmpB.set(-dir.y, dir.x);
    const curl = CURL_STRENGTH * b.english.x;
    b.vel.add(perp.scale(curl * sp * h));
    const roll = b.english.y;
    const forward = tmpA.copy(dir).scale(roll * 0.35 * FRICTION * h);
    b.vel.add(forward);
    const decay = Math.exp(-ENGLISH_DECAY * h * (0.35 + sp * 0.002));
    b.english.scale(decay);
  }

  private resolveBallBall(outcome: ShotOutcome, h: number): void {
    const list = this.balls;
    for (let i = 0; i < list.length; i++) {
      const a = list[i]!;
      if (!a.active) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j]!;
        if (!b.active) continue;
        tmpN.copy(b.pos).sub(a.pos);
        const dist = tmpN.len();
        const minD = a.radius + b.radius;
        if (dist < 1e-6) continue;
        if (dist >= minD) continue;

        tmpN.scale(1 / dist);
        const overlap = minD - dist;
        const corr = overlap * 0.5 + 0.01;
        a.pos.add(tmpN.clone().scale(-corr));
        b.pos.add(tmpN.clone().scale(corr));

        const rv = tmpA.copy(b.vel).sub(a.vel);
        const velAlongN = Vec2.dot(rv, tmpN);
        if (velAlongN > 0) continue;

        const jImp = -(1 + RESTITUTION) * velAlongN * 0.5;
        const impulse = tmpN.clone().scale(jImp);
        a.vel.sub(impulse);
        b.vel.add(impulse);

        if (a.kind === 'cue' || b.kind === 'cue') {
          outcome.anyBallMoved = true;
          const cue = a.kind === 'cue' ? a : b;
          const other = a.kind === 'cue' ? b : a;
          if (outcome.firstHitId === null && other.kind !== 'cue') {
            outcome.firstHitId = other.id;
          }
          const tangent = tmpA.set(-tmpN.y, tmpN.x);
          const englishBoost = 18 * h * 60;
          if (cue.kind === 'cue') {
            cue.vel.add(tangent.scale(cue.english.x * englishBoost * 0.02));
            cue.vel.add(tmpN.clone().scale(cue.english.y * englishBoost * 0.015));
          }
        }
      }
    }
  }

  private resolveCushions(): void {
    const t = this.table;
    for (const b of this.balls) {
      if (!b.active) continue;
      for (const seg of t.cushions) {
        this.collideSegment(b, seg.ax, seg.ay, seg.bx, seg.by);
      }
    }
  }

  private collideSegment(b: Ball, ax: number, ay: number, bx: number, by: number): void {
    const abx = bx - ax;
    const aby = by - ay;
    const abLenSq = abx * abx + aby * aby;
    if (abLenSq < 1e-6) return;
    const apx = b.pos.x - ax;
    const apy = b.pos.y - ay;
    let tproj = (apx * abx + apy * aby) / abLenSq;
    tproj = Math.max(0, Math.min(1, tproj));
    const cx = ax + abx * tproj;
    const cy = ay + aby * tproj;
    tmpN.set(b.pos.x - cx, b.pos.y - cy);
    const d = tmpN.len();
    if (d < 1e-6) return;
    const minD = b.radius;
    if (d >= minD) return;
    tmpN.scale(1 / d);
    const pen = minD - d + 0.05;
    b.pos.add(tmpN.clone().scale(pen));
    const vn = Vec2.dot(b.vel, tmpN);
    if (vn < 0) {
      const tang = tmpA.set(-tmpN.y, tmpN.x);
      const englishKick = b.kind === 'cue' ? b.english.x * 0.22 : 0;
      b.vel.sub(tmpN.clone().scale((1 + CUSHION_RESTITUTION) * vn));
      b.vel.add(tang.scale(englishKick));
    }
  }

  private resolvePockets(outcome: ShotOutcome): void {
    for (const b of this.balls) {
      if (!b.active) continue;
      for (const p of this.table.pockets) {
        const dx = b.pos.x - p.pos.x;
        const dy = b.pos.y - p.pos.y;
        if (dx * dx + dy * dy < (p.radius - b.radius * 0.35) ** 2) {
          b.active = false;
          b.vel.set(0, 0);
          outcome.potted.push({ id: b.id, number: b.number });
          if (b.kind === 'cue') outcome.scratched = true;
          break;
        }
      }
    }
  }

  private applyFriction(h: number): void {
    const k = FRICTION * h * 60;
    for (const b of this.balls) {
      if (!b.active) continue;
      const sp = b.speed();
      if (sp < 1e-6) continue;
      const drop = Math.max(0, sp - k * (0.9 + sp * 0.0012));
      if (drop < STOP_EPS) b.vel.set(0, 0);
      else b.vel.normalize().scale(drop);
    }
  }
}

function createRack(table: Table, r: number): Ball[] {
  const balls: Ball[] = [];
  let id = 0;
  const add = (n: number, kind: Ball['kind'], x: number, y: number) => {
    const b = new Ball(id++, n, kind, r);
    b.pos.set(x, y);
    balls.push(b);
  };

  const cx = table.width * 0.5;
  const cy = table.height * 0.2;
  const dx = 2 * r * 1.03;
  const dy = Math.sqrt(3) * r * 1.05;

  const layout: number[][] = [
    [1],
    [10, 2],
    [4, 8, 5],
    [12, 9, 11, 3],
    [13, 6, 14, 15, 7],
  ];

  for (let row = 0; row < layout.length; row++) {
    const nums = layout[row]!;
    const count = nums.length;
    const y = cy + row * dy;
    const rowW = (count - 1) * dx;
    const startX = cx - rowW * 0.5;
    for (let c = 0; c < count; c++) {
      const num = nums[c]!;
      const kind: Ball['kind'] =
        num === 0 ? 'cue' : num === 8 ? 'eight' : num < 8 ? 'solid' : 'stripe';
      add(num, kind, startX + c * dx, y);
    }
  }

  add(0, 'cue', cx, table.height * 0.86);
  return balls;
}
