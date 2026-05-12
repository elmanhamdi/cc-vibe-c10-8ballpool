# HTML5 Canvas To Meta Horizon Studio Build Guide

This guide describes how to build a game-agnostic HTML5 2D prototype that can later be ported cleanly to Meta Horizon Studio. The recommended browser architecture uses a small Custom Canvas 2D adapter that mirrors the future Meta Horizon Studio `DrawingCommandsBuilder` flow instead of building the prototype around Phaser, Three.js, or DOM-heavy UI state.

The goal is not to imitate Meta APIs in the browser. The goal is to keep game logic, render state, assets, input, and audio separated so that the browser shell can be replaced by the Meta Horizon Studio shell with minimal rewrite.

## Core Principle

Build the prototype as a platform-neutral TypeScript game with two thin platform layers:

- HTML5 platform layer: browser canvas, pointer input, browser audio, and asset URLs.
- Meta Horizon Studio platform layer: XAML `DrawingSurface`, `DrawingCommandsBuilder`, focused interaction input, `TextureAsset`, Noesis HUD, and Studio-managed audio entities.

The game should not know which platform is running it. Core logic produces state. Rendering consumes state. Input sends normalized commands. Audio and HUD react to gameplay events.

```text
Pure game logic
  -> produces RenderState and GameEvent values

HTML5 shell
  -> Canvas2DRenderer, browser input, browser audio

MHS shell
  -> DrawingCommandsBuilder renderer, CustomUiComponent, Studio input/audio
```

## When Not To Use Phaser Or Three.js

For an MHS-bound 2D game, do not make Phaser or Three.js the architectural center unless the browser prototype is intentionally throwaway.

Use Phaser only when:

- The team needs a fast browser-only proof of feel.
- The prototype will not be used as the code foundation for MHS.
- You are willing to rewrite Phaser scenes, loaders, tweens, input, and display objects later.

Avoid Three.js for most 2D MHS prototypes because:

- MHS 2D UI rendering uses a XAML `DrawingSurface` and immediate-mode drawing commands, not a WebGL scene graph.
- Three.js introduces cameras, meshes, materials, renderers, and shaders that usually do not map to the MHS 2D pipeline.
- A 2D canvas adapter is closer to the MHS `DrawingCommandsBuilder` pattern.

Recommended default: use plain TypeScript plus an adapter-backed HTML5 Canvas 2D renderer.

## Non-Negotiable Architecture Rules

- Keep game rules and simulation pure TypeScript where possible.
- Do not import Phaser, Three.js, DOM APIs, browser canvas APIs, or MHS APIs inside core game logic.
- Do not let rendering own authoritative game state.
- Keep rendering immediate-mode: rebuild each frame from `RenderState`.
- Keep draw order deterministic and explicit.
- Prefer numeric render-state data over retained display objects.
- Route gameplay randomness through a seedable RNG when reproducibility matters.
- Choose fixed logical canvas dimensions early, such as `480 x 800`, and scale to the viewport externally.
- Treat asset IDs as stable logical names, not ad hoc file paths scattered through rendering code.
- Use events to decouple gameplay from audio, HUD, analytics, persistence, and platform services.

## Recommended HTML5 Prototype Structure

Use a structure that separates platform-neutral code from browser-only code. Folder names can vary by project, but the boundary should remain clear.

```text
html5-game/
  src/
    core/
      Constants.ts
      Types.ts
      Rng.ts
      GameState.ts
      GameRules.ts
      Scoring.ts
    render/
      GameRenderer.ts
      RenderState.ts
      Rendering.ts
      Canvas2DRenderer.ts
    platform/
      BrowserGameLoop.ts
      BrowserInputAdapter.ts
      BrowserAudioAdapter.ts
      AssetManifest.ts
      GameEvents.ts
    main.ts
  public/
    sprites/
      *.png
    sounds/
      *.ogg
      *.mp3
    index.html
```

When porting to Meta Horizon Studio, collapse or adapt the structure to the project rules required by the MHS project. The proven MHS pattern in `matchThreeTest2/2D_GAME_BUILD_GUIDE.md` keeps TypeScript modules flat inside `scripts/`, uses `xaml/game.xaml` for the `DrawingSurface`, and declares sprites through static `TextureAsset("@sprites/...")` values.

## Layer Responsibilities

### Core Game Logic

Core modules own rules, state transitions, deterministic systems, timers, scoring, physics, board logic, AI, and save-ready data. They must not read from the DOM, canvas, MHS components, or audio systems.

Good core APIs:

- `game.update(dt, commands)`
- `game.getRenderState()`
- `game.drainEvents()`
- `game.reset(seed)`

Bad core dependencies:

- `CanvasRenderingContext2D`
- `HTMLImageElement`
- `document`
- `window`
- `DrawingCommandsBuilder`
- `TextureAsset`
- `SoundComponent`

### Rendering

Rendering receives a complete `RenderState` snapshot and draws it through the `GameRenderer` interface. Rendering can contain draw helpers, visual constants, camera transforms, particles, and animation interpolation, but it should not mutate authoritative gameplay data.

Use this shape:

```ts
export function renderFrame(renderer: GameRenderer, state: RenderState): void {
  renderer.clear();

  renderer.pushTranslate(state.camera.centerX, state.camera.centerY);
  renderer.pushScale(state.camera.zoom, state.camera.zoom, 0, 0);
  renderer.pushTranslate(-state.camera.x, -state.camera.y);

  drawBackground(renderer, state);
  drawWorld(renderer, state);
  drawEffects(renderer, state);

  renderer.pop();
  renderer.pop();
  renderer.pop();

  drawScreenSpace(renderer, state);
}
```

### Platform Shell

The browser platform shell owns:

- `requestAnimationFrame`
- canvas creation and resize
- input event listeners
- image and sound loading
- audio playback
- local storage or browser-only persistence
- debug overlays

The MHS platform shell later owns:

- `CustomUiComponent.dataContext`
- `DrawingCommandsBuilder`
- `OnWorldUpdateEvent` and `OnLateWorldUpdateEvent`
- focused interaction input
- `TextureAsset` declarations
- Studio-managed `SoundComponent` entities
- Noesis HUD ViewModels

## Rendering Adapter Interface

Keep the renderer small and aligned with drawing operations that are available or easy to express in both Canvas 2D and MHS `DrawingCommandsBuilder`.

```ts
export interface DrawImageRef {
  id: string;
}

export interface TextStyle {
  fontSize: number;
  fontFamily?: string;
  fontWeight?: 'normal' | 'bold';
  color: string;
  align?: 'left' | 'center' | 'right';
}

export interface GameRenderer {
  clear(): void;

  pushTranslate(x: number, y: number): void;
  pushScale(scaleX: number, scaleY: number, originX?: number, originY?: number): void;
  pushRotate(degrees: number, originX?: number, originY?: number): void;
  pop(): void;

  drawRect(color: string, x: number, y: number, width: number, height: number): void;
  drawEllipse(color: string, centerX: number, centerY: number, radiusX: number, radiusY: number): void;
  drawImage(image: DrawImageRef, x: number, y: number, width: number, height: number): void;
  drawText(text: string, x: number, y: number, width: number, height: number, style: TextStyle): void;
}
```

Keep color inputs simple in the shared layer. Hex strings such as `#ffffff` and optional alpha conventions are easy to convert in both browser and MHS renderers.

## Browser Canvas 2D Renderer

The browser renderer adapts `GameRenderer` calls to `CanvasRenderingContext2D`. It is browser-only and must not leak into core game logic.

```ts
export class Canvas2DRenderer implements GameRenderer {
  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly images: Record<string, HTMLImageElement>,
    private readonly width: number,
    private readonly height: number,
  ) {}

  clear(): void {
    this.ctx.clearRect(0, 0, this.width, this.height);
  }

  pushTranslate(x: number, y: number): void {
    this.ctx.save();
    this.ctx.translate(x, y);
  }

  pushScale(scaleX: number, scaleY: number, originX = 0, originY = 0): void {
    this.ctx.save();
    this.ctx.translate(originX, originY);
    this.ctx.scale(scaleX, scaleY);
    this.ctx.translate(-originX, -originY);
  }

  pushRotate(degrees: number, originX = 0, originY = 0): void {
    this.ctx.save();
    this.ctx.translate(originX, originY);
    this.ctx.rotate((degrees * Math.PI) / 180);
    this.ctx.translate(-originX, -originY);
  }

  pop(): void {
    this.ctx.restore();
  }

  drawRect(color: string, x: number, y: number, width: number, height: number): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, width, height);
  }

  drawEllipse(color: string, centerX: number, centerY: number, radiusX: number, radiusY: number): void {
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
    this.ctx.fill();
  }

  drawImage(image: DrawImageRef, x: number, y: number, width: number, height: number): void {
    const img = this.images[image.id];
    if (img == null) return;
    this.ctx.drawImage(img, x, y, width, height);
  }

  drawText(text: string, x: number, y: number, width: number, height: number, style: TextStyle): void {
    this.ctx.fillStyle = style.color;
    this.ctx.font = `${style.fontWeight ?? 'normal'} ${style.fontSize}px ${style.fontFamily ?? 'Arial'}`;
    this.ctx.textAlign = style.align ?? 'left';
    this.ctx.textBaseline = 'middle';
    const tx = style.align === 'center' ? x + width / 2 : style.align === 'right' ? x + width : x;
    this.ctx.fillText(text, tx, y + height / 2, width);
  }
}
```

## Future MHS Renderer Shape

The MHS renderer should adapt the same `GameRenderer` calls to `DrawingCommandsBuilder`. This is intentionally a shape example, not drop-in code for every project.

```ts
import { Color, DrawingCommandsBuilder, Font, SolidBrush, TextureAsset } from 'meta/worlds';

export class MhsDrawingRenderer implements GameRenderer {
  constructor(
    private readonly builder: DrawingCommandsBuilder,
    private readonly textures: Record<string, TextureAsset>,
    private readonly font: Font,
  ) {}

  clear(): void {
    this.builder.clear();
  }

  pushTranslate(x: number, y: number): void {
    this.builder.pushTranslate({ x, y });
  }

  pushScale(scaleX: number, scaleY: number, originX = 0, originY = 0): void {
    this.builder.pushScale({ x: scaleX, y: scaleY }, { x: originX, y: originY });
  }

  pushRotate(degrees: number, originX = 0, originY = 0): void {
    this.builder.pushRotate(degrees, { x: originX, y: originY });
  }

  pop(): void {
    this.builder.pop();
  }

  drawRect(color: string, x: number, y: number, width: number, height: number): void {
    this.builder.drawRect(new SolidBrush(Color.fromHex(color)), null, { x, y, width, height });
  }

  drawEllipse(color: string, centerX: number, centerY: number, radiusX: number, radiusY: number): void {
    this.builder.drawEllipse(
      new SolidBrush(Color.fromHex(color)),
      null,
      { x: centerX, y: centerY },
      { x: radiusX, y: radiusY },
    );
  }

  drawImage(image: DrawImageRef, x: number, y: number, width: number, height: number): void {
    const texture = this.textures[image.id];
    if (texture == null) return;
    this.builder.drawImage(texture, { x, y, width, height });
  }

  drawText(text: string, x: number, y: number, width: number, height: number, style: TextStyle): void {
    this.builder.drawText(
      text,
      { x, y, width, height },
      style.fontSize,
      new SolidBrush(Color.fromHex(style.color)),
      this.font,
    );
  }
}
```

For production MHS code, pre-create reusable `SolidBrush` and `Font` instances where possible. Avoid allocating new brush and font objects in hot per-frame paths unless color or alpha changes dynamically.

V79+ drawing API note: for Worlds SDK scripts, import `DrawingCommandsBuilder`, `DrawingCommandData`, brush/pen/font resources, and drawing enums from `meta/worlds`; do not use the legacy experimental drawing module. Builder-level drawing and transform methods use object-shaped `IRectangle` and `IVec2` values, such as `{ x, y, width, height }` for rectangles and `{ x, y }` for vectors. If MHS code constructs `Font` instances directly, use `FontFamily.*` values instead of string family names.

V77+ binding note: the old helper that pushed commands into a ViewModel property was removed. Canvas ViewModels should store drawing commands as `DrawingCommandData`, and the component should assign built commands directly after rendering.

```ts
import { type Maybe, uiViewModel, UiViewModel } from 'meta/custom_ui';
import { type DrawingCommandData } from 'meta/worlds';

@uiViewModel()
export class GameCanvasViewModel extends UiViewModel {
  drawCommands: Maybe<DrawingCommandData> = null;
}

renderFrame(mhsRenderer, game.getRenderState());
gameViewModel.drawCommands = builder.build();
```

`build()` returns a `DrawingCommandData` object and clears the builder automatically, so do not call `builder.clear()` immediately after `build()`.

## Render State Pattern

`RenderState` should be a snapshot of what the player needs to see. It should not contain platform objects.

```ts
export interface CameraState {
  x: number;
  y: number;
  centerX: number;
  centerY: number;
  zoom: number;
}

export interface SpriteState {
  imageId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDegrees: number;
  alpha: number;
}

export interface RenderState {
  logicalWidth: number;
  logicalHeight: number;
  camera: CameraState;
  sprites: SpriteState[];
  scoreText: string;
  debugText?: string;
}
```

Good render state contains:

- numbers
- strings
- booleans
- enums
- arrays of plain objects
- stable asset IDs

Bad render state contains:

- `HTMLImageElement`
- `CanvasRenderingContext2D`
- `TextureAsset`
- `DrawingCommandsBuilder`
- DOM nodes
- Phaser game objects
- Three.js meshes or materials

## Game Loop Shell

The browser game loop should be thin. It gathers input, advances the game, renders the latest state, then lets platform adapters react to events.

```ts
export class BrowserGameLoop {
  private lastTime = 0;

  constructor(
    private readonly game: GameApp,
    private readonly renderer: GameRenderer,
    private readonly input: InputAdapter,
    private readonly audio: AudioAdapter,
  ) {}

  start(): void {
    requestAnimationFrame(this.tick);
  }

  private readonly tick = (timeMs: number): void => {
    const dt = this.lastTime === 0 ? 0 : Math.min((timeMs - this.lastTime) / 1000, 1 / 30);
    this.lastTime = timeMs;

    const commands = this.input.drainCommands();
    this.game.update(dt, commands);

    renderFrame(this.renderer, this.game.getRenderState());

    for (const event of this.game.drainEvents()) {
      this.audio.handleEvent(event);
    }

    requestAnimationFrame(this.tick);
  };
}
```

The future MHS game component should follow the same conceptual flow:

- receive `deltaTime` from `OnWorldUpdateEvent`
- drain normalized input commands
- update game logic
- emit events for audio/HUD/services
- render in `OnLateWorldUpdateEvent`
- assign built commands to the canvas ViewModel with `viewModel.drawCommands = builder.build()`

## Input Adapter Pattern

Input should be normalized into game-level commands before it reaches core logic.

```ts
export type GameInputCommand =
  | { type: 'tap'; x: number; y: number }
  | { type: 'dragStart'; x: number; y: number }
  | { type: 'dragMove'; x: number; y: number }
  | { type: 'dragEnd'; x: number; y: number }
  | { type: 'pause' }
  | { type: 'restart' };

export interface InputAdapter {
  drainCommands(): GameInputCommand[];
}
```

For browser input, convert client coordinates into fixed logical canvas coordinates.

```ts
export function clientToLogicalPoint(
  event: PointerEvent,
  canvas: HTMLCanvasElement,
  logicalWidth: number,
  logicalHeight: number,
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const scale = Math.min(rect.width / logicalWidth, rect.height / logicalHeight);
  const viewWidth = logicalWidth * scale;
  const viewHeight = logicalHeight * scale;
  const offsetX = rect.left + (rect.width - viewWidth) / 2;
  const offsetY = rect.top + (rect.height - viewHeight) / 2;

  return {
    x: (event.clientX - offsetX) / scale,
    y: (event.clientY - offsetY) / scale,
  };
}
```

The future MHS input adapter should convert focused interaction screen positions into the same logical coordinate space used by the renderer.

## Audio And Event Pattern

Core gameplay should emit events. The platform layer decides how to play sounds, update HUD, save progress, or report analytics.

```ts
export type GameEvent =
  | { type: 'gameStarted' }
  | { type: 'scoreChanged'; score: number }
  | { type: 'effectTriggered'; effectId: string; x: number; y: number }
  | { type: 'soundRequested'; soundId: string; intensity?: number }
  | { type: 'gameEnded'; finalScore: number };

export interface AudioAdapter {
  handleEvent(event: GameEvent): void;
}
```

Browser audio can map `soundId` values to loaded `HTMLAudioElement`, Web Audio buffers, or a small audio library. MHS audio should map the same event IDs to Studio child entities with `SoundComponent`, using the AudioHub discovery pattern from the MHS guide.

Avoid calling audio directly from game rules:

```ts
// Avoid this in core logic.
audio.play('match');

// Prefer this.
events.push({ type: 'soundRequested', soundId: 'match' });
```

## Asset Manifest Pattern

Use stable logical asset IDs everywhere in core and rendering code.

```ts
export const AssetIds = {
  background: 'background',
  player: 'player',
  buttonPrimary: 'buttonPrimary',
  hitSound: 'hitSound',
} as const;

export const BrowserAssetManifest = {
  images: {
    [AssetIds.background]: '/sprites/background.png',
    [AssetIds.player]: '/sprites/player.png',
    [AssetIds.buttonPrimary]: '/sprites/button-primary.png',
  },
  sounds: {
    [AssetIds.hitSound]: '/sounds/hit.ogg',
  },
} as const;
```

In MHS, these IDs should map to static asset declarations.

```ts
import { TextureAsset } from 'meta/worlds';

export const backgroundTexture = new TextureAsset("@sprites/background.png");
export const playerTexture = new TextureAsset("@sprites/player.png");
export const buttonPrimaryTexture = new TextureAsset("@sprites/button-primary.png");

export const MhsTextureById = {
  background: backgroundTexture,
  player: playerTexture,
  buttonPrimary: buttonPrimaryTexture,
} as const;
```

Do not construct MHS texture paths dynamically. Use static string literals so the engine can resolve assets at build time.

## UI And HUD Guidance

For HTML5, simple HUD text may be drawn into the same canvas while prototyping. Keep the data platform-neutral:

```ts
export interface HudState {
  scoreText: string;
  timerText?: string;
  promptText?: string;
  modalVisible: boolean;
}
```

When porting to MHS:

- Keep moment-to-moment gameplay visuals in the `DrawingSurface`.
- Move richer overlay UI to Noesis XAML and ViewModels when appropriate.
- Drive HUD state from game events or explicit ViewModel sync, not direct calls from isolated game rules.

## Porting To Meta Horizon Studio

When the HTML5 prototype is ready to port:

1. Create the MHS project structure required by the local MHS guide.
2. Move pure game modules into MHS `scripts/`, adapting imports to the project's flat module rules.
3. Replace `Canvas2DRenderer` with an MHS renderer backed by `DrawingCommandsBuilder`.
4. Create `xaml/game.xaml` with a fixed-size `DrawingSurface` matching the logical canvas size.
5. Add a canvas ViewModel with a `drawCommands: Maybe<DrawingCommandData>` field, importing `DrawingCommandData` from `meta/worlds`.
6. Add the main game component on the same entity as `CustomUiComponent`.
7. In `OnEntityCreateEvent`, assign `customUi.dataContext` to the canvas ViewModel.
8. In `OnWorldUpdateEvent`, update the game with normalized input and `deltaTime`.
9. In `OnLateWorldUpdateEvent`, call `renderFrame(mhsRenderer, game.getRenderState())`.
10. Assign draw commands with `gameViewModel.drawCommands = builder.build()`. `build()` clears the builder automatically.
11. Convert browser asset URLs into static `TextureAsset("@sprites/...")` declarations.
12. Convert browser audio mappings into an MHS AudioHub with named child `SoundComponent` entities.
13. Convert browser input coordinates into the same fixed logical canvas coordinates.
14. Move browser-only HUD DOM to Noesis XAML ViewModels or draw it in the canvas if it is gameplay-integrated.

## New HTML5 Prototype Checklist

Use this checklist before writing gameplay code:

1. Choose fixed logical canvas dimensions.
2. Define `GameRenderer` before drawing any game-specific visuals.
3. Implement `Canvas2DRenderer`.
4. Define `RenderState` as plain data.
5. Write `renderFrame(renderer, state)` with no DOM or MHS dependencies.
6. Create a thin game loop that calls `update(dt)` before rendering.
7. Normalize browser input into `GameInputCommand` values.
8. Route audio through `GameEvent` values.
9. Define stable asset IDs and a browser asset manifest.
10. Keep core game logic free of browser, Phaser, Three.js, and MHS imports.
11. Keep draw order explicit and stable.
12. Use a seedable RNG if gameplay should be replayable or testable.
13. Add simple debug scenarios that can run without rendering.
14. Keep a porting note for every platform-specific workaround.

## MHS Compatibility Checklist

Before considering the HTML5 prototype port-ready:

1. Core logic compiles without browser type dependencies.
2. Rendering code only depends on `GameRenderer`, `RenderState`, and asset IDs.
3. Input reaches the game only as normalized commands.
4. Audio is triggered by events, not direct browser audio calls.
5. Asset paths are centralized and can be mapped to static MHS declarations.
6. The logical canvas dimensions match the intended MHS `DrawingSurface`.
7. Game state and render state are separate.
8. No essential behavior depends on Phaser scenes, Three.js objects, DOM layout, CSS animation, or browser timers other than the outer loop.
9. A future MHS game component can call the same `update`, `getRenderState`, and `drainEvents` methods.

## Practical Rule Of Thumb

If a module would still make sense inside an MHS `scripts/` folder after replacing imports and asset declarations, it is probably in the right layer.

If a module directly touches `window`, `document`, `CanvasRenderingContext2D`, `HTMLAudioElement`, Phaser, Three.js, or browser asset URLs, it belongs in the HTML5 platform layer and should be expected to be replaced during the MHS port.
