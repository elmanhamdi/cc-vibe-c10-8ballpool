import type { GameInputCommand } from './gameContract.js';

const MIN_SHOT_POWER = 0.14;
const MAX_PULL_SENS = 0.0052;

export type PoolStrokeMode = 'idle' | 'aim' | 'charge';

/**
 * Browser-free aim + stroke state. Updated from `GameInputCommand` in core.
 * Aim: `pointer.table` drag. Power: `power.drag` (HUD slider); table touches are ignored while charging.
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
  /** Relative aim drag anchor: pointer + aim angle captured at drag start (around cue ball). */
  private aimDragAnchor: { pointerAngle: number; aimAngle: number } | null = null;
  /** Charge input source: right power slider or cue-stick drag. */
  private chargeInput: 'none' | 'slider' | 'cue' = 'none';
  /** Last table pointer while dragging on cue stick. */
  private cueDragLastTable: { x: number; y: number } | null = null;

  resetStroke(): void {
    this.strokeMode = 'idle';
    this.lastTable = null;
    this.charge01 = MIN_SHOT_POWER;
    this.aimDragAnchor = null;
    this.chargeInput = 'none';
    this.cueDragLastTable = null;
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

      if (c.type === 'power.drag') {
        const v = Math.max(0, Math.min(1, c.value01));
        if (c.phase === 'down') {
          if (!ctx.phaseIsPlayerTurn || !ctx.cueActive) continue;
          this.strokeMode = 'charge';
          this.chargeInput = 'slider';
          this.aimLocked = this.aimAngle;
          this.aimDragging = false;
          this.lastTable = null;
          this.charge01 = v;
          continue;
        }
        if (c.phase === 'move') {
          if (!ctx.phaseIsPlayerTurn || !ctx.cueActive) continue;
          if (this.strokeMode !== 'charge') continue;
          this.charge01 = v;
          continue;
        }
        if (c.phase === 'up') {
          if (this.strokeMode !== 'charge') continue;
          const ok = this.charge01 >= MIN_SHOT_POWER + 0.02;
          const aim = this.aimLocked;
          const power = this.charge01;
          const spin = ctx.getSpin();
          this.resetStroke();
          if (ctx.phaseIsPlayerTurn && ok) {
            ctx.requestShot(aim, power, spin.x, spin.y);
          }
          continue;
        }
        if (c.phase === 'cancel') {
          this.aimDragging = false;
          this.resetStroke();
        }
        continue;
      }

      if (c.type !== 'pointer.table') continue;
      const { phase, tableX, tableY } = c;

      if (this.strokeMode === 'charge') {
        /** HUD slider charging: table pointers are ignored. */
        if (this.chargeInput === 'slider') continue;
        /** Cue-stick charging: drag updates shot power; aim stays locked. */
        if (this.chargeInput === 'cue') {
          if (phase === 'move') {
            if (!ctx.phaseIsPlayerTurn || !ctx.cueActive || !this.cueDragLastTable) continue;
            const ax = Math.cos(this.aimLocked);
            const ay = Math.sin(this.aimLocked);
            const dx = tableX - this.cueDragLastTable.x;
            const dy = tableY - this.cueDragLastTable.y;
            const back = -ax * dx - ay * dy;
            if (back > 0) {
              this.charge01 = Math.min(1, this.charge01 + back * MAX_PULL_SENS);
            } else {
              this.charge01 = Math.max(MIN_SHOT_POWER, this.charge01 + back * (MAX_PULL_SENS * 0.55));
            }
            this.cueDragLastTable = { x: tableX, y: tableY };
            continue;
          }
          if (phase === 'up') {
            const ok = this.charge01 >= MIN_SHOT_POWER + 0.02;
            const aim = this.aimLocked;
            const power = this.charge01;
            const spin = ctx.getSpin();
            this.resetStroke();
            if (ctx.phaseIsPlayerTurn && ok) {
              ctx.requestShot(aim, power, spin.x, spin.y);
            }
            continue;
          }
          if (phase === 'cancel') {
            this.aimDragging = false;
            this.resetStroke();
            continue;
          }
          continue;
        }
        continue;
      }

      if (phase === 'down') {
        if (!ctx.phaseIsPlayerTurn || !ctx.cueActive) continue;
        /** Cue üstüne basılırsa: sadece çek-bırak ile vur, aim döndürme kilitli kalsın. */
        if (isOnCueStickPullZone(tableX, tableY, ctx.cueX, ctx.cueY, ctx.cueRadius, this.aimAngle)) {
          this.strokeMode = 'charge';
          this.chargeInput = 'cue';
          this.aimLocked = this.aimAngle;
          this.aimDragging = false;
          this.lastTable = null;
          this.charge01 = MIN_SHOT_POWER;
          this.cueDragLastTable = { x: tableX, y: tableY };
          continue;
        }
        this.lastTable = { x: tableX, y: tableY };
        this.strokeMode = 'aim';
        this.aimDragging = true;
        const dx0 = tableX - ctx.cueX;
        const dy0 = tableY - ctx.cueY;
        if (dx0 * dx0 + dy0 * dy0 >= 16) {
          this.aimDragAnchor = {
            pointerAngle: Math.atan2(dy0, dx0),
            aimAngle: this.aimAngle,
          };
        } else {
          this.aimDragAnchor = null;
        }
        continue;
      }

      if (phase === 'move') {
        if (!ctx.phaseIsPlayerTurn || !ctx.cueActive) continue;
        if (this.aimDragging) {
          const dx = tableX - ctx.cueX;
          const dy = tableY - ctx.cueY;
          if (dx * dx + dy * dy < 16) continue;
          const cur = Math.atan2(dy, dx);
          if (!this.aimDragAnchor) {
            this.aimDragAnchor = { pointerAngle: cur, aimAngle: this.aimAngle };
            continue;
          }
          let delta = cur - this.aimDragAnchor.pointerAngle;
          while (delta > Math.PI) delta -= 2 * Math.PI;
          while (delta < -Math.PI) delta += 2 * Math.PI;
          this.aimAngle = this.aimDragAnchor.aimAngle + delta;
        }
        continue;
      }

      if (phase === 'up') {
        this.aimDragging = false;
        this.aimDragAnchor = null;
        this.resetStroke();
        continue;
      }

      if (phase === 'cancel') {
        this.aimDragging = false;
        this.aimDragAnchor = null;
        this.resetStroke();
      }
    }
  }
}

/**
 * Cue stick hit zone in table-space:
 * - centered on the stick axis behind cue ball,
 * - excludes the cue-ball center area so table rotation remains easy around white ball.
 */
function isOnCueStickPullZone(
  tableX: number,
  tableY: number,
  cueX: number,
  cueY: number,
  cueRadius: number,
  aimAngle: number,
): boolean {
  const dx = tableX - cueX;
  const dy = tableY - cueY;
  const ux = Math.cos(aimAngle);
  const uy = Math.sin(aimAngle);
  /** Distance behind cue along opposite-to-shot direction. */
  const behind = -(dx * ux + dy * uy);
  /** Perpendicular distance to cue axis. */
  const perp = Math.abs(-uy * dx + ux * dy);
  const minBehind = cueRadius + 10;
  const maxBehind = cueRadius + 240;
  const axisHalfWidth = cueRadius * 1.15;
  return behind >= minBehind && behind <= maxBehind && perp <= axisHalfWidth;
}
