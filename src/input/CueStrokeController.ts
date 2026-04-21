/**
 * Drag on empty table = aim (angle).
 * Press behind the cue ball on the “cue line”, pull back for power; release to shoot.
 */

const MIN_SHOT_POWER = 0.14;
const MAX_PULL_SENS = 0.0052;

export type StrokeMode = 'idle' | 'aim' | 'charge';

export class CueStrokeController {
  mode: StrokeMode = 'idle';
  /** Aim angle locked when charge starts (radians). */
  aimLocked = 0;
  charge01 = MIN_SHOT_POWER;
  private lastTable: { x: number; y: number } | null = null;

  reset(): void {
    this.mode = 'idle';
    this.lastTable = null;
    this.charge01 = MIN_SHOT_POWER;
  }

  beginStroke(tableX: number, tableY: number, onCueZone: boolean, cueX: number, cueY: number, aimAngle: number): void {
    this.lastTable = { x: tableX, y: tableY };
    if (onCueZone) {
      this.mode = 'charge';
      this.aimLocked = aimAngle;
      this.charge01 = MIN_SHOT_POWER;
    } else {
      this.mode = 'aim';
    }
  }

  moveStroke(tableX: number, tableY: number): void {
    if (this.mode !== 'charge' || !this.lastTable) return;
    const ax = Math.cos(this.aimLocked);
    const ay = Math.sin(this.aimLocked);
    const dx = tableX - this.lastTable.x;
    const dy = tableY - this.lastTable.y;
    const back = -ax * dx - ay * dy;
    if (back > 0) {
      this.charge01 = Math.min(1, this.charge01 + back * MAX_PULL_SENS);
    }
    this.lastTable = { x: tableX, y: tableY };
  }

  endStroke(): { shouldShoot: boolean; aim: number; power: number } {
    if (this.mode === 'charge') {
      const ok = this.charge01 >= MIN_SHOT_POWER + 0.02;
      const aim = this.aimLocked;
      const power = this.charge01;
      this.reset();
      return ok ? { shouldShoot: true, aim, power } : { shouldShoot: false, aim, power: 0 };
    }
    this.reset();
    return { shouldShoot: false, aim: 0, power: 0 };
  }
}

/** Cue-pull zone: thin strip behind the cue ball opposite shot direction. */
export function isOnCuePullZone(
  tableX: number,
  tableY: number,
  cueX: number,
  cueY: number,
  aimAngle: number,
  ballRadius: number,
): boolean {
  const ax = Math.cos(aimAngle);
  const ay = Math.sin(aimAngle);
  const vx = tableX - cueX;
  const vy = tableY - cueY;
  const forward = vx * ax + vy * ay;
  if (forward > ballRadius * 0.75) return false;
  const back = -forward;
  const lateral = Math.abs(vx * -ay + vy * ax);
  const maxBack = 320;
  const latMax = 26;
  return back >= -ballRadius * 0.35 && back <= maxBack && lateral < latMax;
}
