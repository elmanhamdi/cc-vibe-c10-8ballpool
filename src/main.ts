import './styles.css';
import { GameEngine } from './core/GameEngine.js';
import { Table } from './physics/Table.js';
import { resolveTableLayoutFromBrowser } from './platform-browser/tableLayoutFromUrl.js';
import type { GameInputCommand } from './core/gameContract.js';
import { ThreeSceneAdapter } from './render-three/ThreeSceneAdapter.js';
import { BrowserHudAdapter } from './platform-browser/BrowserHudAdapter.js';
import { BrowserAudioAdapter } from './platform-browser/BrowserAudioAdapter.js';
import { applyCanvasResize } from './platform-browser/BrowserResize.js';
import { PhysicsDebugToggle } from './platform-browser/PhysicsDebugToggle.js';
import { CameraDebugToggle } from './platform-browser/CameraDebugToggle.js';
import { TableMeshDebugToggle } from './platform-browser/TableMeshDebugToggle.js';
import { OpponentShotCameraToggle } from './platform-browser/OpponentShotCameraToggle.js';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas')!;
const hudLayer = document.querySelector<HTMLElement>('#hud-layer')!;
const gameRoot = document.querySelector<HTMLElement>('#game-root')!;

const commandBuffer: GameInputCommand[] = [];
const tableLayout = resolveTableLayoutFromBrowser();
const sharedTable = new Table(tableLayout);
const engine = new GameEngine({ table: sharedTable, ballRadius: 9 });
const assetBaseUrl = import.meta.env.BASE_URL;
const sceneAdapter = new ThreeSceneAdapter(canvas, { assetBaseUrl, physicsTable: sharedTable });
const audioAdapter = new BrowserAudioAdapter({ assetBaseUrl });
const physicsDebug = new PhysicsDebugToggle();
const cameraDebug = new CameraDebugToggle(gameRoot);
const tableMeshDebug = new TableMeshDebugToggle();
const opponentShotCameraDebug = new OpponentShotCameraToggle();

const hudAdapter = new BrowserHudAdapter(
  hudLayer,
  engine,
  (c) => {
    commandBuffer.push(c);
  },
  {
    assetBaseUrl,
    toggleSound: () => audioAdapter.toggleMute(),
    isSoundMuted: () => audioAdapter.isMuted(),
  },
);
hudAdapter.bind();

window.addEventListener(
  'pointerdown',
  () => {
    audioAdapter.resumeBackgroundMusicIfNeeded();
  },
  { once: true, capture: true },
);

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

function renderHints() {
  return {
    physicsDebugVisible: physicsDebug.get(),
    debugHideTableMesh: tableMeshDebug.get(),
    debugOpponentShotCamera: opponentShotCameraDebug.get(),
  };
}

function pushPointer(phase: 'down' | 'move' | 'up' | 'cancel', sx: number, sy: number): void {
  const hints = renderHints();
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
  canvas.style.cursor = engine.isAwaitingPlayerBallInHand() ? 'grab' : 'auto';
  const hints = renderHints();
  const rw = engine.getRenderWorldState(
    { widthPx: canvas.width, heightPx: canvas.height },
    hints,
  );
  sceneAdapter.render(rw, dt, hints);
  hudAdapter.sync();
  if (cameraDebug.get()) {
    const d = engine.getOpponentCameraDebug(
      { widthPx: canvas.width, heightPx: canvas.height },
      hints,
    );
    if (d.useOpponentFraming) {
      cameraDebug.setLines([
        ...(hints.debugOpponentShotCamera ? ['O — sinematik kadraj önizleme'] : []),
        'Rakip vuruşu — kamera (F kapat)',
        `polar ${d.finalPolarDeg.toFixed(1)}°`,
        `azimuth ${d.finalAzimuthDeg.toFixed(1)}°`,
      ]);
    } else if (hints.debugOpponentShotCamera) {
      cameraDebug.setLines([
        'O açık — sinematik rakip kadrajı (O kapat)',
        `polar ${d.finalPolarDeg.toFixed(1)}°`,
        `azimuth ${d.finalAzimuthDeg.toFixed(1)}°`,
        `blend ${d.cinematicBlend.toFixed(2)}`,
      ]);
    } else {
      cameraDebug.setLines(['F açık — rakip sırasında polar/azimuth; O ile kadraj önizle']);
    }
  }
  audioAdapter.consume(engine.drainEvents());
  requestAnimationFrame(loop);
};

void sceneAdapter.preload([]).then(() => {
  requestAnimationFrame(loop);
});
