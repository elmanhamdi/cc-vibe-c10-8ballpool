import type { GameInputCommand } from './gameContract.js';
import { isOnCuePullZone } from './cuePullZone.js';

const MIN_SHOT_POWER = 0.14;
const MAX_PULL_SENS = 0.0052;

export type PoolStrokeMode = 'idle' | 'aim' | 'charge';

/**
 * Browser-free aim + stroke state. Updated from `GameInputCommand` in core.
 */
export class PoolInputState {
  /** Aim direction in radians (shot velocity = (cos, sin)). */
  aimAngle = -Math.PI / 2;
  aimDragging = false;

  strokeMode: PoolStrokeMode = 'idle';
  aimLocked = 0;
  /** 0–1 pull while charging (read by render state). */
  charge01 = MIN_SHOT_POWER;
  private lastTable: { x: number; y: number } | null = null;

  resetStroke(): void {
    this.strokeMode = 'idle';
    this.lastTable = null;
    this.charge01 = MIN_SHOT_POWER;
  }

  /** Visual pull 0–1 for cue draw (charge mode or AI preview scale). */
  getChargeVisual(): number {
    return this.charge01;
  }

  getStrokeAimForRender(): number {
    return this.strokeMode === 'charge' ? this.aimLocked : this.aimAngle;
  }

  applyCommands(
    commands: readonly GameInputCommand[],
    ctx: {
      phaseIsPlayerTurn: boolean;
      cueActive: boolean;
      cueX: number;
      cueY: number;
      cueRadius: number;
      spinSetter: (nx: number, ny: number) => void;
      requestShot: (angle: number, power: number, spinX: number, spinY: number) => void;
      getSpin: () => { x: number; y: number };
    },
  ): void {
    for (const c of commands) {
      if (c.type === 'spin.set') {
        ctx.spinSetter(c.nx, c.ny);
        continue;
      }
      if (c.type !== 'pointer.table') continue;
      const { phase, tableX, tableY } = c;

      if (phase === 'down') {
        if (!ctx.phaseIsPlayerTurn || !ctx.cueActive) continue;
        this.lastTable = { x: tableX, y: tableY };
        const onCue = isOnCuePullZone(
          tableX,
          tableY,
          ctx.cueX,
          ctx.cueY,
          this.aimAngle,
          ctx.cueRadius,
        );
        if (onCue) {
          this.strokeMode = 'charge';
          this.aimLocked = this.aimAngle;
          this.charge01 = MIN_SHOT_POWER;
        } else {
          this.strokeMode = 'aim';
          this.aimDragging = true;
        }
        continue;
      }

      if (phase === 'move') {
        if (!ctx.phaseIsPlayerTurn || !ctx.cueActive) continue;
        if (this.strokeMode === 'charge' && this.lastTable) {
          const ax = Math.cos(this.aimLocked);
          const ay = Math.sin(this.aimLocked);
          const dx = tableX - this.lastTable.x;
          const dy = tableY - this.lastTable.y;
          const back = -ax * dx - ay * dy;
          if (back > 0) {
            this.charge01 = Math.min(1, this.charge01 + back * MAX_PULL_SENS);
          }
          this.lastTable = { x: tableX, y: tableY };
        } else if (this.aimDragging) {
          const dx = tableX - ctx.cueX;
          const dy = tableY - ctx.cueY;
          if (dx * dx + dy * dy >= 16) {
            this.aimAngle = Math.atan2(dy, dx);
          }
        }
        continue;
      }

      if (phase === 'up') {
        this.aimDragging = false;
        if (ctx.phaseIsPlayerTurn && this.strokeMode === 'charge') {
          const ok = this.charge01 >= MIN_SHOT_POWER + 0.02;
          const aim = this.aimLocked;
          const power = this.charge01;
          const spin = ctx.getSpin();
          this.resetStroke();
          if (ok) {
            ctx.requestShot(aim, power, spin.x, spin.y);
          }
        } else {
          this.resetStroke();
        }
        continue;
      }

      if (phase === 'cancel') {
        this.aimDragging = false;
        this.resetStroke();
      }
    }
  }
}
