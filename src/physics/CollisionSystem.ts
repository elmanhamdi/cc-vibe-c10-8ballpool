import { Ball } from './Ball.js';
import type { CushionSegment } from './Table.js';
import { Table } from './Table.js';
import { Vec2 } from './Vec2.js';

/** Higher = livelier ball–ball spread (e.g. break). */
const RESTITUTION = 0.985;
const CUSHION_RESTITUTION = 0.9;
/** Lower = less drag so balls roll farther / feel less heavy. */
const FRICTION = 0.6;
/** Realistic default spin tuning. */
const MAX_SPIN_TORQUE = 1.0;
const SPIN_DECAY = 0.7;
const CURVE_INFLUENCE = 0.15;
const RAIL_SPIN_INFLUENCE = 0.35;
const BACKSPIN_PULL_STRENGTH = 0.45;
const TOPSPIN_FOLLOW_STRENGTH = 0.4;
const EDGE_HIT_POWER_PENALTY = 0.82;
const CUE_MAX_SPEED = 1550;
const STOP_EPS = 0.012;
const MAX_SUBSTEPS = 6;
/** Min relative speed along normal (|dot|) to count as audible ball–ball hit (avoids resting jitter). */
const BALL_BALL_HIT_SOUND_MIN_REL = 14;

export interface PottedEvent {
  id: number;
  number: number;
}

export interface ShotOutcome {
  firstHitId: number | null;
  scratched: boolean;
  potted: PottedEvent[];
  anyBallMoved: boolean;
  /** After first cue–object contact, any ball (including cue) touched a cushion. */
  railAfterFirstContact: boolean;
  /** Distinct non-cue ball ids that hit a cushion this shot (illegal break counts ≥4). */
  breakCushionBallCount: number;
}

const tmpA = new Vec2();
const tmpB = new Vec2();
const tmpN = new Vec2();
const tmpCueHand = new Vec2();

function clampUnit(v: number): number {
  return Math.max(-1, Math.min(1, v));
}

function clampToUnitDisk(x: number, y: number): { x: number; y: number; len: number } {
  const sx = clampUnit(x);
  const sy = clampUnit(y);
  const len = Math.hypot(sx, sy);
  if (len <= 1) return { x: sx, y: sy, len };
  return { x: sx / len, y: sy / len, len: 1 };
}


export class CollisionSystem {
  readonly table: Table;
  readonly balls: Ball[] = [];
  readonly cue: Ball;
  private shotActive = false;
  private shotT = 0;
  /** Short-lived boost to make post-rail sidespin reaction more noticeable than free-flight curve. */
  private cueRailSpinBoost = 0;
  /** Impulses counted this `stepFrame` (all substeps); reset at start of each frame. */
  private ballBallHitsThisFrame = 0;
  private readonly shotOutcome: ShotOutcome = {
    firstHitId: null,
    scratched: false,
    potted: [],
    anyBallMoved: false,
    railAfterFirstContact: false,
    breakCushionBallCount: 0,
  };
  /** Object balls that hit a cushion at least once this shot (for illegal-break count). */
  private readonly breakCushionBallIds = new Set<number>();

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
    this.cueRailSpinBoost = 0;
  }

  placeCueBallForBreak(): void {
    const t = this.table;
    this.cue.active = true;
    this.cue.pos.set(t.width * 0.5, t.height * 0.86);
    this.cue.vel.set(0, 0);
    this.cue.english.set(0, 0);
    this.cueRailSpinBoost = 0;
  }

  placeCueBallInKitchen(): void {
    const t = this.table;
    this.cue.active = true;
    this.cue.pos.set(t.width * 0.5, t.headStringY + 40);
    this.cue.vel.set(0, 0);
    this.cue.english.set(0, 0);
    this.cueRailSpinBoost = 0;
  }

  /** Ball-in-hand: playable alan + diğer aktif toplardan ayır. */
  moveCueBallForBallInHand(tableX: number, tableY: number): void {
    const cue = this.cue;
    cue.active = true;
    this.clampCueBallInHandInto(tableX, tableY, cue.pos);
    cue.vel.set(0, 0);
    cue.english.set(0, 0);
    this.cueRailSpinBoost = 0;
  }

  /**
   * Rakip ball-in-hand: rastgele uygun nokta `out` içine (isteğe bağlı animasyon için).
   * @returns false ise mutfak yerleştirmesi gerekir.
   */
  tryPickRandomLegalCueHandPosForAi(out: Vec2): boolean {
    const t = this.table;
    const cue = this.cue;
    const r = cue.radius;
    const minX = t.playableMinX + r;
    const maxX = t.playableMaxX - r;
    const minY = t.playableMinY + r;
    const maxY = t.playableMaxY - r;
    if (maxX <= minX || maxY <= minY) return false;
    for (let k = 0; k < 52; k++) {
      const tx = minX + Math.random() * (maxX - minX);
      const ty = minY + Math.random() * (maxY - minY);
      this.clampCueBallInHandInto(tx, ty, tmpCueHand);
      if (!this.cuePositionOverlapsActiveObjects(tmpCueHand)) {
        out.copy(tmpCueHand);
        return true;
      }
    }
    return false;
  }

  /**
   * Rakip ball-in-hand: legal adaylar arasında en yüksek skoru veren pozisyonu seç.
   * `scoreFn` daha yüksek = daha iyi (örn. pot olasılığı + leave).
   * @returns false ise yasal aday bulunamadı.
   */
  tryPickBestCueHandPosForAi(out: Vec2, scoreFn: (pos: Readonly<Vec2>) => number): boolean {
    const t = this.table;
    const cue = this.cue;
    const r = cue.radius;
    const minX = t.playableMinX + r;
    const maxX = t.playableMaxX - r;
    const minY = t.playableMinY + r;
    const maxY = t.playableMaxY - r;
    if (maxX <= minX || maxY <= minY) return false;

    let found = false;
    let bestScore = -Infinity;
    const bestPos = new Vec2();

    /** Sobol benzeri deterministik dağılım + jitter: geniş alanı hızlı tarar. */
    const N = 108;
    for (let k = 0; k < N; k++) {
      const u = (k + 0.5) / N;
      const v = ((k * 37) % N + 0.5) / N;
      const jx = (Math.random() - 0.5) * 0.08;
      const jy = (Math.random() - 0.5) * 0.08;
      const tx = minX + Math.max(0, Math.min(1, u + jx)) * (maxX - minX);
      const ty = minY + Math.max(0, Math.min(1, v + jy)) * (maxY - minY);
      this.clampCueBallInHandInto(tx, ty, tmpCueHand);
      if (this.cuePositionOverlapsActiveObjects(tmpCueHand)) continue;
      const score = scoreFn(tmpCueHand);
      if (!Number.isFinite(score)) continue;
      if (!found || score > bestScore) {
        found = true;
        bestScore = score;
        bestPos.copy(tmpCueHand);
      }
    }

    if (!found) return false;
    out.copy(bestPos);
    return true;
  }

  /** Rakip faul sonrası AI: rastgele uygun nokta, yoksa mutfak. */
  placeCueBallRandomLegalForAi(): void {
    const cue = this.cue;
    if (this.tryPickRandomLegalCueHandPosForAi(cue.pos)) {
      cue.active = true;
      cue.vel.set(0, 0);
      cue.english.set(0, 0);
      this.cueRailSpinBoost = 0;
      return;
    }
    this.placeCueBallInKitchen();
  }

  private cuePositionOverlapsActiveObjects(pos: Vec2): boolean {
    const cue = this.cue;
    const pad = 1.08;
    for (const b of this.balls) {
      if (!b.active || b.kind === 'cue') continue;
      const need = (cue.radius + b.radius) * pad;
      const dx = pos.x - b.pos.x;
      const dy = pos.y - b.pos.y;
      if (dx * dx + dy * dy < need * need) return true;
    }
    return false;
  }

  private clampCueBallInHandInto(tx: number, ty: number, out: Vec2): void {
    const t = this.table;
    const cue = this.cue;
    const r = cue.radius;
    out.set(
      Math.max(t.playableMinX + r, Math.min(t.playableMaxX - r, tx)),
      Math.max(t.playableMinY + r, Math.min(t.playableMaxY - r, ty)),
    );
    for (let iter = 0; iter < 14; iter++) {
      let adjusted = false;
      for (const b of this.balls) {
        if (!b.active || b.kind === 'cue') continue;
        const dx = out.x - b.pos.x;
        const dy = out.y - b.pos.y;
        const dist = Math.hypot(dx, dy);
        const minSep = r + b.radius + 1.2;
        if (dist < 1e-7) {
          out.x += minSep;
          adjusted = true;
          continue;
        }
        if (dist < minSep) {
          const push = (minSep - dist) / dist;
          out.x += dx * push;
          out.y += dy * push;
          adjusted = true;
        }
      }
      out.x = Math.max(t.playableMinX + r, Math.min(t.playableMaxX - r, out.x));
      out.y = Math.max(t.playableMinY + r, Math.min(t.playableMaxY - r, out.y));
      if (!adjusted) break;
    }
  }

  applyShot(angle: number, power01: number, spinX: number, spinY: number): void {
    const spin = clampToUnitDisk(spinX, spinY);
    const spinStrength = Math.max(0, Math.min(1, spin.len));
    const effectivePower01 =
      Math.max(0, Math.min(1, power01)) *
      (1 + (EDGE_HIT_POWER_PENALTY - 1) * spinStrength);
    /** Global cue strength. */
    const speed = 730 * (0.18 + 0.82 * effectivePower01);
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    this.cue.vel.set(c * speed, s * speed);
    this.cue.english.set(spin.x * MAX_SPIN_TORQUE, spin.y * MAX_SPIN_TORQUE);
    this.cueRailSpinBoost = 0;
  }

  /** Call after `applyShot` to start incremental simulation. */
  beginShot(): void {
    this.shotActive = true;
    this.shotT = 0;
    this.ballBallHitsThisFrame = 0;
    this.shotOutcome.firstHitId = null;
    this.shotOutcome.scratched = false;
    this.shotOutcome.potted.length = 0;
    this.shotOutcome.anyBallMoved = this.cue.speed() > STOP_EPS;
    this.shotOutcome.railAfterFirstContact = false;
    this.breakCushionBallIds.clear();
    this.shotOutcome.breakCushionBallCount = 0;
    this.cueRailSpinBoost = 0;
  }

  /** One render-frame step. Returns true when simulation finished. */
  stepFrame(dt: number): boolean {
    if (!this.shotActive) return true;
    this.shotT += dt;
    this.cueRailSpinBoost = Math.max(0, this.cueRailSpinBoost - dt * 2.6);
    if (this.shotT > 26) {
      this.forceStopAll();
      this.shotActive = false;
      return true;
    }

    this.ballBallHitsThisFrame = 0;
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
      this.resolveCushions(this.shotOutcome);
      this.applyFriction(h);
    }

    this.snapTinyVelocities();

    if (this.allStopped()) {
      this.shotActive = false;
      return true;
    }
    return false;
  }

  /** Ball–ball impacts accumulated in the last `stepFrame` call (for SFX). */
  getBallBallHitsThisFrame(): number {
    return this.ballBallHitsThisFrame;
  }

  snapshotOutcome(): ShotOutcome {
    this.shotOutcome.breakCushionBallCount = this.breakCushionBallIds.size;
    return {
      firstHitId: this.shotOutcome.firstHitId,
      scratched: this.shotOutcome.scratched,
      anyBallMoved: this.shotOutcome.anyBallMoved,
      potted: this.shotOutcome.potted.map((p) => ({ ...p })),
      railAfterFirstContact: this.shotOutcome.railAfterFirstContact,
      breakCushionBallCount: this.shotOutcome.breakCushionBallCount,
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
      this.cueRailSpinBoost = 0;
    }
  }

  private forceStopAll(): void {
    for (const b of this.balls) {
      b.vel.set(0, 0);
    }
    this.cue.english.set(0, 0);
    this.cueRailSpinBoost = 0;
  }

  private allStopped(): boolean {
    for (const b of this.balls) {
      if (!b.active) continue;
      if (b.isMoving(STOP_EPS)) return false;
    }
    return true;
  }

  /** Continuous cue-spin integration: moderate cloth curve, draw/follow coupling, exponential decay. */
  private integrateEnglish(b: Ball, h: number, outcome: ShotOutcome): void {
    if (b.kind !== 'cue' || !b.active) return;
    const sp = Math.min(b.speed(), CUE_MAX_SPEED);
    if (sp < 1e-3) return;
    if (sp > STOP_EPS) outcome.anyBallMoved = true;

    const decay = Math.exp(-SPIN_DECAY * h * (0.75 + sp * 0.00105));
    b.english.scale(decay);
    const dir = tmpA.copy(b.vel);
    if (dir.lenSq() < 1e-10) return;
    dir.normalize();
    const perp = tmpB.set(-dir.y, dir.x);
    const sideSpin = b.english.x;
    const verticalSpin = b.english.y;
    const curveBoost = 1 + this.cueRailSpinBoost * 0.85;
    const curveStrength = CURVE_INFLUENCE * curveBoost;
    b.vel.add(perp.scale(sideSpin * sp * curveStrength * h));

    const topspin = Math.max(0, verticalSpin);
    const backspin = Math.max(0, -verticalSpin);
    if (topspin > 1e-4) {
      b.vel.add(tmpA.copy(dir).scale(topspin * TOPSPIN_FOLLOW_STRENGTH * FRICTION * h));
    }
    if (backspin > 1e-4) {
      const postContactBoost = outcome.firstHitId !== null ? 1.45 : 0.95;
      b.vel.add(
        tmpA
          .copy(dir)
          .scale(-backspin * BACKSPIN_PULL_STRENGTH * postContactBoost * FRICTION * h),
      );
    }
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

        if (Math.abs(velAlongN) >= BALL_BALL_HIT_SOUND_MIN_REL) {
          this.ballBallHitsThisFrame += 1;
        }

        if (a.kind === 'cue' || b.kind === 'cue') {
          outcome.anyBallMoved = true;
          const cue = a.kind === 'cue' ? a : b;
          const other = a.kind === 'cue' ? b : a;
          if (outcome.firstHitId === null && other.kind !== 'cue') {
            outcome.firstHitId = other.id;
          }
          if (cue.kind === 'cue' && other.kind !== 'cue') {
            const ex = cue.english.x;
            const ey = cue.english.y;
            if (Math.abs(ex) > 1e-5 || Math.abs(ey) > 1e-5) {
              const relN = Math.min(1, Math.abs(velAlongN) / 520);
              const tang = tmpA.set(-tmpN.y, tmpN.x);
              const topspin = Math.max(0, ey);
              const backspin = Math.max(0, -ey);
              const sideSpin = ex;
              const followObj = topspin * TOPSPIN_FOLLOW_STRENGTH * 0.14 * relN;
              const cueFollow = topspin * TOPSPIN_FOLLOW_STRENGTH * 0.06 * relN;
              const cueDraw = backspin * BACKSPIN_PULL_STRENGTH * 0.22 * relN;
              other.vel.add(tmpN.clone().scale(followObj));
              cue.vel.add(tmpN.clone().scale(cueFollow - cueDraw));
              const sideObj = sideSpin * 0.095 * relN;
              const sideCue = sideSpin * 0.12 * relN;
              other.vel.add(tang.clone().scale(sideObj));
              cue.vel.add(tang.clone().scale(-sideCue));
              cue.english.scale(0.82);
              const cueSp = cue.speed();
              if (cueSp > CUE_MAX_SPEED) cue.vel.scale(CUE_MAX_SPEED / cueSp);
            }
          }
        }
      }
    }
  }

  private resolveCushions(outcome: ShotOutcome): void {
    const t = this.table;
    for (const b of this.balls) {
      if (!b.active) continue;
      for (const seg of t.cushions) {
        this.collideSegment(b, seg, outcome);
      }
    }
  }

  private collideSegment(b: Ball, seg: CushionSegment, outcome: ShotOutcome): void {
    const { ax, ay, bx, by } = seg;
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
      const sideSpin = b.kind === 'cue' ? b.english.x : 0;
      const verticalSpin = b.kind === 'cue' ? b.english.y : 0;
      const speedFactor = 0.45 + 0.55 * Math.min(1, b.speed() / 900);
      const railKick = sideSpin * RAIL_SPIN_INFLUENCE * speedFactor;
      const reboundBias = 1 + Math.max(0, verticalSpin) * 0.07 - Math.max(0, -verticalSpin) * 0.09;
      const reflected = (1 + CUSHION_RESTITUTION * reboundBias) * vn;
      b.vel.sub(tmpN.clone().scale(reflected));
      b.vel.add(tang.scale(railKick * Math.max(120, b.speed()) * 0.17));
      if (b.kind === 'cue') {
        b.english.x *= 0.74;
        b.english.y *= 0.84;
        this.cueRailSpinBoost = 1;
      }
      if (b.kind !== 'cue') this.breakCushionBallIds.add(b.id);
      if (outcome.firstHitId !== null) outcome.railAfterFirstContact = true;
    }
  }

  private resolvePockets(outcome: ShotOutcome): void {
    const potF = this.table.layout.potRadiusBallFactor;
    for (const b of this.balls) {
      if (!b.active) continue;
      for (const p of this.table.pockets) {
        const dx = b.pos.x - p.pos.x;
        const dy = b.pos.y - p.pos.y;
        if (dx * dx + dy * dy < (p.radius - b.radius * potF) ** 2) {
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

/** Imperfect rack: tiny random offset per object ball (within gap between touching neighbors). */
function rackMicroJitter(r: number): { jx: number; jy: number } {
  return {
    jx: (Math.random() - 0.5) * r * 0.042,
    jy: (Math.random() - 0.5) * r * 0.036,
  };
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

  const rowMax = layout.length - 1;
  for (let row = 0; row < layout.length; row++) {
    const nums = layout[row]!;
    const count = nums.length;
    /** Apex (1-ball) toward break side / player — rows increase away from cue (cue at high Y). */
    const y = cy + (rowMax - row) * dy;
    const rowW = (count - 1) * dx;
    const startX = cx - rowW * 0.5;
    for (let c = 0; c < count; c++) {
      const num = nums[c]!;
      const kind: Ball['kind'] =
        num === 0 ? 'cue' : num === 8 ? 'eight' : num < 8 ? 'solid' : 'stripe';
      const { jx, jy } = rackMicroJitter(r);
      add(num, kind, startX + c * dx + jx, y + jy);
    }
  }

  add(0, 'cue', cx, table.height * 0.86);
  return balls;
}
