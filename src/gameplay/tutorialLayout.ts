import type { Table } from '../physics/Table.js';
import type { CollisionSystem } from '../physics/CollisionSystem.js';
import { Vec2 } from '../physics/Vec2.js';

/** Cue + two solids + two stripes + 8 — mid-game vs Tungo. */
const ACTIVE_NUMBERS = new Set([0, 1, 3, 8, 10, 14]);

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Solid 1 + cue sit on a ray from the **top-left** pocket for an easy straight cut;
 * solid 3 sits near the **top-right** pocket. Eight + stripes stay lower for the AI side.
 */
export function applyTutorialMidgameLayout(table: Table, physics: CollisionSystem): void {
  const r = physics.cue.radius;
  const pad = r * 2.35;
  const minX = table.playableMinX + pad;
  const maxX = table.playableMaxX - pad;
  const minY = table.playableMinY + pad;
  const maxY = table.playableMaxY - pad;

  const ph = table.playableMaxY - table.playableMinY;
  const cx = (table.playableMinX + table.playableMaxX) * 0.5;

  const setBall = (number: number, x: number, y: number): void => {
    const b = physics.balls.find((bb) => bb.number === number);
    if (!b) return;
    b.pos.set(clamp(x, minX, maxX), clamp(y, minY, maxY));
    b.vel.set(0, 0);
    b.english.set(0, 0);
    b.active = true;
  };

  for (const b of physics.balls) {
    if (!ACTIVE_NUMBERS.has(b.number)) {
      b.active = false;
      b.vel.set(0, 0);
      b.english.set(0, 0);
    }
  }

  /** Along ray from corner pocket into felt (toward table interior). */
  const placeFromPocket = (pocket: Vec2, inwardBias: Vec2, distBall: number, distCue: number) => {
    const dir = Vec2.sub(inwardBias, pocket);
    if (dir.lenSq() < 1e-6) return;
    dir.normalize();
    const ballPos = new Vec2(pocket.x + dir.x * distBall, pocket.y + dir.y * distBall);
    const cuePos = new Vec2(pocket.x + dir.x * distCue, pocket.y + dir.y * distCue);
    return { ballPos, cuePos, dir };
  };

  const pocket0 = table.pockets.find((p) => p.id === 0)?.pos;
  const pocket2 = table.pockets.find((p) => p.id === 2)?.pos;

  /**
   * Inward aim targets biased toward table center so the shot line doesn’t hug the side cushion.
   * Extra +X nudge on cue + first target ball pulls the straight shot off the long rail.
   */
  const inwardL = new Vec2(cx + 28, table.playableMinY + ph * 0.56);
  const inwardR = new Vec2(cx - 22, table.playableMinY + ph * 0.56);
  /** Lateral nudge for cue + target solid 1; negative = slight shift left. */
  const nudgeShotX = 6;

  if (pocket0) {
    const left = placeFromPocket(pocket0, inwardL, 118, 248);
    if (left) {
      setBall(1, left.ballPos.x + nudgeShotX, left.ballPos.y);
      setBall(0, left.cuePos.x + nudgeShotX, left.cuePos.y);
    }
  } else {
    setBall(1, cx - 32, table.playableMinY + ph * 0.28);
    setBall(0, cx - 26, table.playableMinY + ph * 0.72);
  }

  if (pocket2) {
    const right = placeFromPocket(pocket2, inwardR, 118, 248);
    if (right) {
      setBall(3, right.ballPos.x, right.ballPos.y);
    }
  } else {
    setBall(3, cx + 46, table.playableMinY + ph * 0.28);
  }

  /** Eight + stripes — lower half, shifted so they don’t sit on the left-top shot corridor. */
  setBall(8, cx + 36, table.playableMinY + ph * 0.54);
  setBall(10, cx - 40, table.playableMinY + ph * 0.72);
  setBall(14, cx + 52, table.playableMinY + ph * 0.69);
}
