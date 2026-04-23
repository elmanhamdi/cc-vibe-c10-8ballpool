/**
 * Cue-pull zone: thin strip behind the cue ball opposite shot direction.
 * Pure geometry — safe for `core/` (guide §1).
 */
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
