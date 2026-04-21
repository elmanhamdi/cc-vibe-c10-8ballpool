export class AimController {
  /** Whether aim drag on the table is active (read externally to avoid clashing with cue pull). */
  dragging = false;
  /** Aim direction in radians (velocity = (cos,sin)). */
  angle = -Math.PI / 2;

  onPointerDown(): void {
    this.dragging = true;
  }

  onPointerUp(): void {
    this.dragging = false;
  }

  /**
   * @param cx cy cue center in canvas pixels
   * @param px py pointer in canvas pixels
   */
  updateFromPointer(cx: number, cy: number, px: number, py: number, active: boolean): void {
    if (!active || !this.dragging) return;
    const dx = px - cx;
    const dy = py - cy;
    if (dx * dx + dy * dy < 16) return;
    this.angle = Math.atan2(dy, dx);
  }

  setAngle(a: number): void {
    this.angle = a;
  }
}
