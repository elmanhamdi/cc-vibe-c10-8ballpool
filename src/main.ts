import './styles.css';
import { GameEngine } from './core/GameEngine.js';
import type { GameInputCommand } from './core/gameContract.js';
import { ThreeSceneAdapter } from './render-three/ThreeSceneAdapter.js';
import { BrowserHudAdapter } from './platform-browser/BrowserHudAdapter.js';
import { BrowserAudioAdapter } from './platform-browser/BrowserAudioAdapter.js';
import { applyCanvasResize } from './platform-browser/BrowserResize.js';
import { PhysicsDebugToggle } from './platform-browser/PhysicsDebugToggle.js';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas')!;
const hudLayer = document.querySelector<HTMLElement>('#hud-layer')!;

const commandBuffer: GameInputCommand[] = [];
const engine = new GameEngine();
const sceneAdapter = new ThreeSceneAdapter(canvas);
const audioAdapter = new BrowserAudioAdapter();
const physicsDebug = new PhysicsDebugToggle();

const hudAdapter = new BrowserHudAdapter(hudLayer, engine, (c) => {
  commandBuffer.push(c);
});
hudAdapter.bind();

function resize(): void {
  const rect = canvas.getBoundingClientRect();
  applyCanvasResize(canvas, rect.width, rect.height);
  sceneAdapter.resize(canvas.width, canvas.height);
}

resize();
window.addEventListener('resize', resize);

function canvasPoint(e: PointerEvent): { sx: number; sy: number } {
  const r = canvas.getBoundingClientRect();
  const sx = (e.clientX - r.left) * (canvas.width / r.width);
  const sy = (e.clientY - r.top) * (canvas.height / r.height);
  return { sx, sy };
}

function pushPointer(phase: 'down' | 'move' | 'up' | 'cancel', sx: number, sy: number): void {
  const hints = { physicsDebugVisible: physicsDebug.get() };
  const rw = engine.getRenderWorldState(
    { widthPx: canvas.width, heightPx: canvas.height },
    hints,
  );
  const p = sceneAdapter.screenToTable(sx, sy, rw);
  commandBuffer.push({ type: 'pointer.table', phase, tableX: p.x, tableY: p.y });
}

canvas.addEventListener('pointerdown', (e) => {
  if (engine.phase !== 'PlayerTurn') return;
  const { sx, sy } = canvasPoint(e);
  pushPointer('down', sx, sy);
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener('pointerup', (e) => {
  if (engine.phase === 'PlayerTurn') {
    const { sx, sy } = canvasPoint(e);
    pushPointer('up', sx, sy);
  }
  try {
    canvas.releasePointerCapture(e.pointerId);
  } catch {
    /* ignore */
  }
});

canvas.addEventListener('pointercancel', () => {
  commandBuffer.push({ type: 'pointer.table', phase: 'cancel', tableX: 0, tableY: 0 });
});

canvas.addEventListener('pointermove', (e) => {
  if (engine.phase !== 'PlayerTurn') return;
  const { sx, sy } = canvasPoint(e);
  pushPointer('move', sx, sy);
});

let last = performance.now();
const loop = (now: number) => {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const cmds = commandBuffer.splice(0, commandBuffer.length);
  engine.update(dt, cmds);
  const hints = { physicsDebugVisible: physicsDebug.get() };
  const rw = engine.getRenderWorldState(
    { widthPx: canvas.width, heightPx: canvas.height },
    hints,
  );
  sceneAdapter.render(rw, dt);
  hudAdapter.sync();
  audioAdapter.consume(engine.drainEvents());
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);
