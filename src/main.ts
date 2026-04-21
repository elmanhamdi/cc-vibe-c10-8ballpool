import './styles.css';
import { GameEngine } from './core/GameEngine.js';
import { TableScene3D } from './ui/TableScene3D.js';
import { HUD } from './ui/HUD.js';
import { AimController } from './input/AimController.js';
import { CueStrokeController, isOnCuePullZone } from './input/CueStrokeController.js';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas')!;
const hudLayer = document.querySelector<HTMLElement>('#hud-layer')!;

const engine = new GameEngine();
const aim = new AimController();
const stroke = new CueStrokeController();
const renderer = new TableScene3D(canvas, engine);
const hud = new HUD(hudLayer, engine);

function resize(): void {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(2, Math.floor(rect.width * dpr));
  canvas.height = Math.max(2, Math.floor(rect.height * dpr));
  renderer.resize(canvas.width, canvas.height);
}

resize();
window.addEventListener('resize', resize);

function canvasPoint(e: PointerEvent): { sx: number; sy: number } {
  const r = canvas.getBoundingClientRect();
  const sx = (e.clientX - r.left) * (canvas.width / r.width);
  const sy = (e.clientY - r.top) * (canvas.height / r.height);
  return { sx, sy };
}

canvas.addEventListener('pointerdown', (e) => {
  if (engine.phase !== 'PlayerTurn') return;
  const { sx, sy } = canvasPoint(e);
  const p = renderer.screenToTable(sx, sy);
  const cue = engine.physics.cue;
  if (!cue.active) return;
  const onCue = isOnCuePullZone(p.x, p.y, cue.pos.x, cue.pos.y, aim.angle, cue.radius);
  stroke.beginStroke(p.x, p.y, onCue, cue.pos.x, cue.pos.y, aim.angle);
  if (!onCue) aim.onPointerDown();
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener('pointerup', (e) => {
  aim.onPointerUp();
  if (engine.phase === 'PlayerTurn') {
    const r = stroke.endStroke();
    if (r.shouldShoot) {
      engine.requestPlayerShot(r.aim, r.power, engine.spinX, engine.spinY);
    }
  } else {
    stroke.reset();
  }
  try {
    canvas.releasePointerCapture(e.pointerId);
  } catch {
    /* ignore */
  }
});

canvas.addEventListener('pointercancel', () => {
  aim.onPointerUp();
  stroke.reset();
});

canvas.addEventListener('pointermove', (e) => {
  if (engine.phase !== 'PlayerTurn') return;
  const { sx, sy } = canvasPoint(e);
  const p = renderer.screenToTable(sx, sy);
  const cue = engine.physics.cue;
  if (stroke.mode === 'charge') {
    stroke.moveStroke(p.x, p.y);
  } else {
    aim.updateFromPointer(cue.pos.x, cue.pos.y, p.x, p.y, aim.dragging);
  }
});

hud.bindHandlers({
  onMenu: () => {
    stroke.reset();
    engine.beginCareer(engine.levelIndex);
  },
  onNext: () => {
    stroke.reset();
    engine.bumpLevelAfterVictory();
    engine.beginCareer(engine.levelIndex);
  },
  onHome: () => {
    stroke.reset();
    engine.beginCareer(engine.levelIndex);
  },
  onSpinTap: (nx, ny) => {
    engine.spinX = nx;
    engine.spinY = ny;
  },
});

let last = performance.now();
const loop = (now: number) => {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  engine.update(dt);
  const aimVis = stroke.mode === 'charge' ? stroke.aimLocked : aim.angle;
  const pullVis = stroke.mode === 'charge' ? stroke.charge01 : 0;
  renderer.render(aimVis, { chargePull: pullVis });
  hud.sync();
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);
