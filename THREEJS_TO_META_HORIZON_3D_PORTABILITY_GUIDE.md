# Three.js To Meta Horizon Studio 3D Portability Guide

This guide describes how to structure a Three.js HTML5 3D game so it can later
be ported to Meta Horizon Studio with the least resistance.

It is the 3D companion to `HTML5_CANVAS_TO_MHS_BUILD_GUIDE.md`. That existing
guide covers 2D canvas prototypes that map well to MHS custom UI drawing. This
guide covers 3D prototypes where Three.js is useful in the browser, but must be
kept behind a clean adapter so the future MHS implementation can use Horizon
scene files, imported assets, spawned templates, components, and services.

Its primary target MHS architecture reference is:

- `META_HORIZON_STUDIO_3D_GAME_ARCHITECTURE_GUIDE.md`

Use that document for the generic Meta Horizon Studio destination structure.

Use `SLIPSTREAM_META_HORIZON_3D_GAME_AI_GUIDE.md` only as an example
implementation of those generic patterns. Slipstream shows one real MHS pattern:
a static `space.hstf` scene bootstraps the world, scripts spawn `.hstf`
templates through `WorldService.get().spawnTemplate`, runtime objects cache
components such as `TransformComponent`, and visual-only effects use
`NetworkMode.LocalOnly` pools.

The goal is not to emulate Meta Horizon Studio APIs in the browser. The goal is
to prevent Three.js, browser loaders, DOM input, and browser audio from becoming
the game architecture.

## 1. Core Principle

Build the game as platform-neutral TypeScript with two thin 3D platform layers:

```text
Core gameplay simulation
  -> owns authoritative state, rules, timers, scoring, collision intent

Platform-neutral world description
  -> describes desired 3D objects, transforms, camera, HUD, events

Three.js browser adapter
  -> maps world description to THREE.Scene, Object3D, Mesh, Material, Audio

Future MHS adapter
  -> maps world description to space.hstf, TemplateAsset, TransformComponent,
     MeshComponent, SoundComponent, CustomUiComponent, and services
```

Non-negotiable rules:

- Do not make Three.js objects authoritative gameplay state.
- Do not put `THREE.*`, DOM APIs, browser loaders, or MHS APIs in core game
  logic.
- Treat Three.js as a renderer and browser platform adapter.
- Treat Meta Horizon Studio as a different renderer and platform adapter.
- Use stable logical IDs for assets, spawned objects, sounds, UI fields, events,
  and gameplay tags.
- Keep gameplay data serializable where practical.
- Keep transforms explicit: position, rotation, scale.
- Keep asset loading centralized in a manifest.
- Keep UI, audio, persistence, networking, and input behind platform services.

Bad dependency direction:

```text
GameRules -> THREE.Mesh -> DOM event -> browser URL -> game state
```

Good dependency direction:

```text
GameRules -> RenderWorldState -> ThreeSceneAdapter
GameRules -> GameEvent[] -> BrowserAudioAdapter
GameRules -> HudState -> BrowserHudAdapter
```

Later, the right side can be replaced:

```text
GameRules -> RenderWorldState -> MhsWorldAdapter
GameRules -> GameEvent[] -> MhsAudioAdapter
GameRules -> HudState -> MhsXamlAdapter
```

## 2. Recommended Project Structure

Use a browser project structure that makes platform boundaries obvious. Folder
names may vary, but the dependency rules should stay the same.

```text
threejs-game/
  index.html
  package.json
  tsconfig.json
  vite.config.ts
  public/
    assets/
      models/
        *.glb
        *.gltf
      textures/
        *.png
        *.jpg
        *.webp
      audio/
        *.mp3
        *.ogg
        *.wav
      ui/
        *.png
        *.json
  src/
    core/
      Constants.ts
      Types.ts
      Rng.ts
      GameState.ts
      Game.ts
      GameRules.ts
      Collision.ts
      Scoring.ts
    world/
      Transform.ts
      WorldObjectState.ts
      RenderWorldState.ts
      CameraState.ts
      HudState.ts
      GameEvents.ts
      WorldDiff.ts
    assets/
      AssetIds.ts
      AssetManifest.ts
      AssetTypes.ts
    render-three/
      ThreeApp.ts
      ThreeSceneAdapter.ts
      ThreeObjectFactory.ts
      ThreeAssetLoader.ts
      ThreeMaterialFactory.ts
      ThreeCameraController.ts
      ThreePools.ts
    platform-browser/
      BrowserGameLoop.ts
      BrowserInputAdapter.ts
      BrowserAudioAdapter.ts
      BrowserHudAdapter.ts
      BrowserStorageAdapter.ts
      BrowserResize.ts
    debug/
      DebugOverlay.ts
      DebugScenarios.ts
    main.ts
```

### Dependency Rules

Allowed dependencies:

- `src/core/` may depend on `src/world/` types only when those types are pure
  data. It must not import `render-three/` or `platform-browser/`.
- `src/world/` must stay pure TypeScript data and helper functions.
- `src/assets/` must define logical IDs and manifests, not instantiate
  `THREE.Texture`, `THREE.Mesh`, or MHS `TextureAsset`/`TemplateAsset` directly.
- `src/render-three/` may import Three.js and browser loaders.
- `src/platform-browser/` may import DOM, browser audio, storage, and resize
  APIs.
- `main.ts` composes the browser-only application.

Forbidden dependencies:

- `src/core/` importing `three`, `window`, `document`, `GLTFLoader`,
  `HTMLAudioElement`, `localStorage`, or `meta/worlds`.
- `src/world/` storing `THREE.Object3D`, `THREE.Vector3`, `THREE.Quaternion`,
  or MHS component instances.
- gameplay rules looking up raw browser asset URLs.
- rendering code deciding score, damage, win/loss, spawn timing, or persistence.

### Future MHS Mapping

The browser project should be easy to collapse into an MHS project:

```text
Browser Three.js project       Future Meta Horizon Studio project
-------------------------      ----------------------------------
src/core/                      scripts/core/ or scripts/
src/world/                     scripts/world/ or scripts/
src/assets/AssetManifest.ts    scripts/config.ts static asset/template refs
public/assets/models/          Assets/ imported source files
public/assets/audio/           Assets/ imported audio
render-three/                  MHS components/adapters using meta/worlds
platform-browser/              MHS services/components/events
index.html                     space.hstf static scene
DOM HUD                        UI/*.xaml plus CustomUiComponent.dataContext
GLB browser object cache       Templates/*.hstf spawned at runtime
```

The future MHS version will likely have fewer folders because MHS projects often
keep TypeScript modules under `scripts/`, but the conceptual boundaries should
remain.

## 3. Platform-Neutral Runtime Model

The most important abstraction is the state shape between gameplay and rendering.
The browser renderer should receive a desired world description, not control the
game.

### Authoritative Game State

`GameState` owns truth:

- player stats and position intent
- enemy/traffic/obstacle logical state
- timers and cooldowns
- score and progression
- collision outcomes
- spawn schedules
- RNG state if deterministic behavior matters
- save-ready fields

Good API shape:

```ts
export interface GameInputCommand {
  type: string;
  pressed?: boolean;
  value?: number;
  x?: number;
  y?: number;
}

export interface Game {
  update(dtSec: number, commands: readonly GameInputCommand[]): void;
  getRenderWorldState(): RenderWorldState;
  getHudState(): HudState;
  drainEvents(): GameEvent[];
  reset(seed?: number): void;
}
```

### Render World State

`RenderWorldState` describes what should exist visually this frame.

```ts
export interface Vec3Data {
  x: number;
  y: number;
  z: number;
}

export interface QuatData {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface TransformState {
  position: Vec3Data;
  rotation: QuatData;
  scale: Vec3Data;
}

export type WorldObjectLifetime = "persistent" | "pooled" | "oneShot";
export type WorldObjectReplication = "sharedGameplay" | "localCosmetic";

export interface WorldObjectState {
  objectId: string;
  templateId: string;
  transform: TransformState;
  visible: boolean;
  lifetime: WorldObjectLifetime;
  replication: WorldObjectReplication;
  renderLayer?: string;
  renderOrder?: number;
  tintHex?: string;
  opacity?: number;
  animationId?: string;
  animationTimeSec?: number;
  tags?: readonly string[];
}

export interface CameraState {
  mode: "fixed" | "follow" | "orbit" | "cinematic";
  position: Vec3Data;
  target?: Vec3Data;
  rotation?: QuatData;
  fovDeg: number;
  shake?: {
    intensity: number;
    remainingSec: number;
  };
}

export interface RenderWorldState {
  camera: CameraState;
  objects: readonly WorldObjectState[];
  ambientColorHex?: string;
  fog?: {
    colorHex: string;
    near: number;
    far: number;
  };
}
```

Important distinction:

- `objectId` is the stable runtime instance ID, such as `traffic-07` or
  `coin-112`.
- `templateId` is the stable visual/template asset ID, such as `car.taxi` or
  `vfx.slipstreamDash`.

Never use asset IDs as object IDs. One template can have many object instances.

### Why Not Store `THREE.Object3D` In State

Storing Three.js objects in gameplay state creates porting friction:

- MHS will not have `THREE.Object3D`.
- Three.js material and geometry lifetimes do not map to MHS template/component
  lifetimes.
- Browser loaders are asynchronous and URL-based, while MHS asset references are
  static build-time declarations.
- Three.js scene traversal is a renderer concern, not a rules concern.

The browser adapter can hold a private cache:

```ts
private readonly objectById = new Map<string, THREE.Object3D>();
```

That cache belongs in `render-three/ThreeSceneAdapter.ts`, not in `core/`.

## 4. Rendering Structure

### Three.js Adapter Responsibilities

`ThreeSceneAdapter` owns:

- `THREE.Scene`
- `THREE.WebGLRenderer`
- camera object and camera controller
- object cache by stable `objectId`
- model/material/texture cache by logical asset ID
- pools for reused objects
- renderer resize and pixel ratio policy
- debug helpers, if enabled

It consumes `RenderWorldState`:

```ts
export class ThreeSceneAdapter {
  render(state: RenderWorldState, dtSec: number): void {
    this.syncCamera(state.camera, dtSec);
    this.syncObjects(state.objects);
    this.renderer.render(this.scene, this.camera);
  }
}
```

It should not:

- compute collisions
- decide spawns
- mutate score
- read raw keyboard/touch input
- write save data
- own authoritative entity health or timers

### Object Sync Pattern

Use stable object IDs to sync desired state to actual Three.js objects:

```ts
private syncObjects(objects: readonly WorldObjectState[]): void {
  const seen = new Set<string>();

  for (const objectState of objects) {
    seen.add(objectState.objectId);
    const object = this.getOrCreateObject(objectState);
    this.applyTransform(object, objectState.transform);
    object.visible = objectState.visible;
    this.applyRenderProperties(object, objectState);
  }

  for (const [objectId, object] of this.objectById) {
    if (!seen.has(objectId)) {
      this.releaseObject(objectId, object);
    }
  }
}
```

This maps cleanly to MHS:

- `getOrCreateObject` becomes spawn or reuse a `.hstf` template.
- `applyTransform` becomes writes to `TransformComponent`.
- `releaseObject` becomes hide, pool, or destroy the spawned entity.

### Concept Mapping

```text
Three.js concept                       Meta Horizon Studio concept
----------------------------------     ---------------------------------------
THREE.Scene                            space.hstf plus runtime spawned entities
THREE.Object3D                         Entity with TransformComponent
Object3D.position/quaternion/scale     TransformComponent world transform
THREE.Mesh                             imported mesh inside .hstf template
THREE.Material                         imported/material asset or ColorComponent
GLTFLoader output                      Studio-imported Asset + Template .hstf
Scene.add(object)                      WorldService.get().spawnTemplate(...)
Scene.remove(object)                   entity.destroy() or hide pooled entity
Object pool hidden in scene            spawned template pool hidden below world
mesh.visible                           transform hide or component visibility
renderOrder                            MeshComponent.renderOrderOffset
camera.position/fov/lookAt             CameraMode.Custom + CameraComponent
decorative local mesh                  NetworkMode.LocalOnly spawned template
shared gameplay mesh                   NetworkMode.Networked spawned template
```

### Rendering Layers

Do not rely on browser-specific render layer tricks for core game behavior.
Represent layer intent in data:

```ts
renderLayer: "world" | "vehicle" | "vfx" | "debug" | "sky"
renderOrder: number
```

Three.js can map this to render order, layers, material depth flags, or scene
groups. MHS can map it to template hierarchy, `MeshComponent.renderOrderOffset`,
or separate local-only VFX entities.

### Decorative Geometry

Visual-only objects should be tagged as local cosmetics:

```ts
replication: "localCosmetic"
```

In Three.js this still creates a normal `Object3D`. In MHS it should become a
`NetworkMode.LocalOnly` spawned template, and collision/shadows should usually be
disabled if it is a particle, trail, outline, sky plane, or HUD-like world visual.

This mirrors the Slipstream pattern where slipstream dash cubes and the
camera-following sky plane are local-only runtime visuals.

## 5. Asset And File Loading

Asset loading is one of the biggest porting risks. Browser Three.js projects
often scatter URLs through loaders. MHS projects usually need static asset and
template references that the editor/build system can resolve.

### Preferred Source Formats

Recommended defaults:

- Models:
  - Prefer `glTF`/`.glb` for browser prototypes.
  - Use FBX only when the art pipeline requires it or the future MHS import
    workflow is known to need it.
  - Keep original source files from Blender/Maya/etc. outside runtime folders if
    they are not served by the browser.
- Textures:
  - Use PNG for alpha and UI.
  - Use JPG for opaque photographic/sky textures.
  - Use WebP only if the future target pipeline accepts it, or keep PNG/JPG
    fallbacks.
- Audio:
  - Use MP3, OGG, or WAV with stable sound IDs.
  - Keep one logical sound ID even if browser and MHS use different file formats.
- UI:
  - Browser may use DOM, canvas, or texture sprites.
  - Future MHS should plan for XAML files and `CustomUiComponent.dataContext`.

### Central Asset Manifest

Every asset should have a stable logical ID. Put the mapping in one manifest.

```ts
export type AssetKind =
  | "model"
  | "template"
  | "texture"
  | "audio"
  | "ui"
  | "material";

export interface AssetManifestEntry {
  id: string;
  kind: AssetKind;
  browserUrl: string;
  futureMhsPath?: string;
  sourceFormat?: "glb" | "gltf" | "fbx" | "png" | "jpg" | "webp" | "mp3" | "ogg" | "wav";
  unitScale?: number;
  forwardAxis?: "+X" | "-X" | "+Y" | "-Y" | "+Z" | "-Z";
  upAxis?: "+Y" | "+Z";
  correctiveRotationDeg?: { x: number; y: number; z: number };
  pivot?: "center" | "bottomCenter" | "custom";
  collision?: "none" | "box" | "sphere" | "capsule" | "mesh" | "custom";
  notes?: string;
}

export const AssetManifest = {
  "vehicle.player": {
    id: "vehicle.player",
    kind: "template",
    browserUrl: "/assets/models/player-car.glb",
    futureMhsPath: "@Templates/player-car.hstf",
    sourceFormat: "glb",
    unitScale: 1,
    forwardAxis: "+Z",
    upAxis: "+Y",
    pivot: "bottomCenter",
    collision: "box",
  },
  "vfx.boostDash": {
    id: "vfx.boostDash",
    kind: "template",
    browserUrl: "/assets/models/boost-dash.glb",
    futureMhsPath: "@Templates/Primitives/Cube.hstf",
    sourceFormat: "glb",
    collision: "none",
  },
  "sound.boost": {
    id: "sound.boost",
    kind: "audio",
    browserUrl: "/assets/audio/boost.mp3",
    futureMhsPath: "@Assets/boost.mp3",
    sourceFormat: "mp3",
  },
} satisfies Record<string, AssetManifestEntry>;
```

The exact `futureMhsPath` format depends on the MHS project. The important rule
is to plan for static, declared references. Do not build future MHS asset paths
dynamically from arbitrary strings.

Bad:

```ts
new TemplateAsset("@Templates/" + vehicleType + ".hstf")
```

Good:

```ts
const CarTemplateById = {
  "vehicle.player": new TemplateAsset("@Templates/player-car.hstf"),
  "vehicle.traffic": new TemplateAsset("@Templates/traffic-car.hstf"),
} as const;
```

### Browser Loader Boundary

Keep Three.js loaders in `render-three/`, not in core.

```ts
export class ThreeAssetLoader {
  async loadModel(assetId: string): Promise<THREE.Object3D> {
    const entry = AssetManifest[assetId];
    if (!entry || entry.kind !== "model" && entry.kind !== "template") {
      throw new Error(`Unknown model asset: ${assetId}`);
    }

    const gltf = await this.gltfLoader.loadAsync(entry.browserUrl);
    return gltf.scene;
  }
}
```

Core game logic should only say:

```ts
templateId: "vehicle.player"
```

It should never say:

```ts
"/assets/models/player-car.glb"
```

### Orientation And Scale

Pick and document conventions at the start of the project.

Recommended default:

- world units: 1 unit = 1 meter, or 1 unit = one gameplay tile; choose once
- up axis: `+Y`
- gameplay forward: `+Z`
- rotations: quaternions in state, degrees only in config/manifests
- pivots: root pivot at gameplay origin, usually bottom-center for characters
  and vehicles

Store corrective rotations in the asset manifest. Do not bury them inside random
Three.js loader code. The future MHS template may need the same correction on a
template child transform or imported asset.

Model checklist:

- [ ] Does the asset face the intended gameplay forward direction?
- [ ] Is the pivot useful for spawning and collision?
- [ ] Does scale match gameplay units?
- [ ] Are collision bounds authored separately from visual mesh bounds?
- [ ] Are material names stable enough for future tinting or effects?
- [ ] Are animations named with stable logical IDs?

## 6. Runtime Spawning And Pooling

Three.js makes it easy to call `scene.add` anywhere. Avoid that pattern. Use an
explicit world adapter API that mirrors future MHS template spawning.

### Spawn Adapter Interface

```ts
export interface SpawnObjectOptions {
  objectId: string;
  templateId: string;
  transform: TransformState;
  replication: WorldObjectReplication;
  lifetime: WorldObjectLifetime;
}

export interface WorldRenderAdapter {
  preload(templateIds: readonly string[]): Promise<void>;
  spawnObject(options: SpawnObjectOptions): Promise<void>;
  setObjectTransform(objectId: string, transform: TransformState): void;
  setObjectVisible(objectId: string, visible: boolean): void;
  setObjectTint?(objectId: string, tintHex: string, opacity?: number): void;
  destroyObject(objectId: string): void;
}
```

Browser implementation:

- `spawnObject` clones or instantiates a cached GLB/model.
- `setObjectTransform` writes `Object3D.position`, `quaternion`, and `scale`.
- `setObjectVisible` writes `object.visible`.
- `destroyObject` removes the object or returns it to a pool.

Future MHS implementation:

- `spawnObject` calls `WorldService.get().spawnTemplate`.
- `setObjectTransform` writes `TransformComponent.worldPosition`,
  `worldRotation`, and `worldScale`.
- `setObjectVisible` may move pooled entities to a hidden location such as
  `(0, -1000, 0)` or toggle a component if available.
- `destroyObject` calls `entity.destroy()` only for non-pooled lifetimes.

### Pooling Policy

Use pooling for objects that spawn repeatedly:

- projectiles
- collectibles
- traffic/obstacles
- coins/rings
- VFX particles
- trails/outlines
- repeated environment segments

Use true destroy for:

- level teardown
- rare one-off objects
- editor/debug-only helpers
- objects whose memory should be released after a scene change

Represent pooling in data:

```ts
lifetime: "pooled"
```

When porting to MHS, pooled visual objects can follow the Slipstream pattern:

- spawn the template once
- cache the `Entity` and useful components
- hide inactive objects below the world
- reuse by applying a new transform and visibility state

### Replication Intent

Three.js browser prototypes are usually single-player, so everything is just an
object in the browser scene. Still mark network intent now:

```ts
replication: "sharedGameplay" | "localCosmetic"
```

Future MHS mapping:

- `sharedGameplay` -> `NetworkMode.Networked`
- `localCosmetic` -> `NetworkMode.LocalOnly`

Examples:

- player avatar/car: `sharedGameplay`
- enemies/traffic/collectibles: `sharedGameplay`
- local camera sky plane: `localCosmetic`
- sparks, trails, speed lines: `localCosmetic`
- debug gizmos: `localCosmetic`

## 7. Camera

Keep camera behavior data-driven. Three.js and MHS have different camera APIs,
but both can consume a camera state.

```ts
export interface CameraState {
  mode: "fixed" | "follow" | "orbit" | "cinematic";
  position: Vec3Data;
  target?: Vec3Data;
  rotation?: QuatData;
  fovDeg: number;
  near?: number;
  far?: number;
  shake?: {
    intensity: number;
    remainingSec: number;
  };
}
```

Three.js adapter:

- owns `THREE.PerspectiveCamera`
- applies position and quaternion or calls `lookAt(target)`
- applies FOV and projection updates
- applies camera shake as a visual offset

Future MHS adapter:

- owns a scene `Camera` entity with `CameraComponent`
- uses `CameraService.get().setCameraMode(CameraMode.Custom, ...)`
- applies transform through `TransformComponent`
- applies FOV through camera service/component calls
- applies camera shake as a visual offset

Do not put raw `THREE.Camera` in core state. Do not make input logic depend on a
Three.js camera object directly. If movement needs camera-relative direction,
compute it through a platform-neutral camera math helper or expose a normalized
input command from the platform adapter.

## 8. Input

Normalize browser input into commands before core logic sees it.

```ts
export type GameInputCommand =
  | { type: "move"; x: number; y: number }
  | { type: "aim"; x: number; y: number }
  | { type: "action"; id: "jump" | "dash" | "interact"; pressed: boolean }
  | { type: "pointer"; phase: "start" | "move" | "end"; x: number; y: number };
```

Browser adapter owns:

- keyboard events
- mouse events
- touch events
- pointer lock, if used
- gamepad polling
- screen-to-logical coordinate conversion

Core owns:

- what commands mean
- command buffering
- cooldowns
- movement rules
- action rules

Future MHS owns:

- focused interaction input
- player input subscriptions
- device-specific behavior
- conversion into the same command shape

Avoid using raw DOM event fields in core, such as `event.clientX`,
`event.code`, or `event.pointerId`.

## 9. UI

Browser UI can be DOM, canvas overlay, or Three.js world-space text. Keep the
data contract separate from the implementation.

```ts
export interface HudState {
  scoreText: string;
  timerText: string;
  healthPercent: number;
  boostPercent: number;
  visiblePanels: readonly string[];
  prompts: readonly {
    id: string;
    text: string;
    priority: number;
  }[];
}
```

Browser adapter options:

- DOM overlay bound to `HudState`
- canvas overlay renderer
- Three.js text sprites for world-space labels

Future MHS mapping:

- screen UI -> XAML files in `UI/`
- runtime state -> view model fields
- binding -> `CustomUiComponent.dataContext`
- button commands -> `UiEvent` bridged to local or network events
- world labels -> `WorldTextComponent` children on templates

Do not let DOM structure become game state. The UI should reflect `HudState` and
emit input/events; it should not own score, timers, health, or progression.

## 10. Audio

Core gameplay emits events. Platform adapters play audio.

```ts
export type GameEvent =
  | { type: "sound"; soundId: string; volume?: number; position?: Vec3Data }
  | { type: "music"; musicId: string; action: "start" | "stop" | "fade" }
  | { type: "hud"; id: string; value?: string | number | boolean }
  | { type: "persistence"; action: "save" | "load" | "submitScore" };
```

Browser audio adapter:

- maps `soundId` to `AudioBuffer`, `HTMLAudioElement`, or a small audio library
- handles global and positional audio
- owns browser unlock/resume policies

Future MHS audio adapter:

- maps `soundId` to named scene child entities with `SoundComponent`
- maps template-local sounds to named child components on spawned templates
- controls spatial/non-spatial emitter type
- starts/stops/repitches sounds through MHS sound APIs

This matches Slipstream's MHS pattern:

- static audio children under `GameManager`
- traffic engine audio as a child of the spawned car template
- code finds sound entities by stable names and caches `SoundComponent`

## 11. Persistence, Networking, And Platform Services

Keep browser-only persistence isolated.

Browser adapter may use:

- `localStorage`
- `IndexedDB`
- URL query params for debug scenarios
- browser analytics, if any

Core should request persistence through events or service interfaces:

```ts
export interface PersistenceAdapter {
  load<T>(key: string): Promise<T | null>;
  save<T>(key: string, value: T): Promise<void>;
  submitScore?(score: number): Promise<void>;
}
```

Future MHS mapping:

- server-owned persistence components
- `NetworkEvent` for client/server requests
- `EventService.sendToOwner` for server replies
- `PlayerVariablesService` for stored per-player values
- `LeaderboardsService` for leaderboard entries

Do not call browser storage from core game rules. Do not design save data around
DOM or Three.js object references. Save plain data.

## 12. Future MHS Porting Recipe

When the Three.js prototype is ready to port:

1. Create the MHS project and inspect `space.hstf`.
   - Add a main manager entity.
   - Add camera, lighting, skybox, UI, audio, and persistence entities.
2. Import assets through Horizon Studio.
   - Place source assets under `Assets/`.
   - Let Studio produce `.assetmeta` files and templates.
   - Create stable `.hstf` templates for runtime-spawned objects.
3. Convert browser asset manifest entries.
   - `browserUrl` becomes static MHS asset/template declarations.
   - `templateId` maps to `TemplateAsset("@Templates/name.hstf")`.
   - sound IDs map to named `SoundComponent` entities.
4. Move pure modules.
   - Copy/adapt `core/`, `world/`, and asset ID constants into `scripts/`.
   - Keep browser-only `render-three/` and `platform-browser/` out of MHS.
5. Replace `ThreeSceneAdapter`.
   - Implement an MHS adapter that spawns templates.
   - Cache `Entity`, `TransformComponent`, `MeshComponent`,
     `ColorComponent`, `SoundComponent`, and `WorldTextComponent` as needed.
6. Replace browser game loop.
   - Use `OnEntityStartEvent` for initialization.
   - Use `OnWorldUpdateEvent` for simulation and transform updates.
   - Optionally use late update/render events if the project needs them.
7. Replace browser input.
   - Convert focused interaction, player input, or UI events into the same
     `GameInputCommand` shape.
8. Replace browser HUD.
   - Use XAML and a view model.
   - Assign `CustomUiComponent.dataContext`.
9. Replace browser audio.
   - Use named scene/template child `SoundComponent`s.
   - Keep sound IDs stable.
10. Replace browser persistence.
    - Use server-owned MHS persistence components and platform events.

## 13. Anti-Patterns That Make Porting Hard

Avoid these patterns in the Three.js version:

- Gameplay state stored on `THREE.Object3D.userData`.
- Collision rules based on traversing the Three.js scene graph.
- Spawning objects directly from random modules with `scene.add`.
- Asset URLs scattered across gameplay and rendering files.
- Dynamic future MHS asset path construction.
- DOM elements used as authoritative game state.
- Timers split across `setTimeout`, animation mixers, and game rules.
- Game logic tied to browser frame rate rather than explicit `dtSec`.
- Input rules depending on raw DOM event names.
- Audio playback triggered directly from collision code.
- Camera behavior hard-coded inside the renderer with no `CameraState`.
- Save data containing Three.js objects, vectors, materials, or browser URLs.
- Shaders or postprocessing required for core gameplay readability.
- Gameplay depending on exact Three.js material behavior.

Some of these are acceptable in throwaway prototypes. They are not acceptable if
the Three.js project is intended to be the foundation for a Meta Horizon Studio
port.

## 14. Port-Friendly AI Build Prompt Rules

When asking an AI agent to build a Three.js game that will later port to MHS,
include rules like these:

```text
Build this as a platform-neutral TypeScript game with a Three.js browser adapter.
Do not put THREE.* imports in core gameplay modules.
Use RenderWorldState with stable object IDs and template IDs.
Use a central AssetManifest with browser URLs and future MHS template notes.
Represent camera as CameraState.
Represent HUD as HudState.
Emit GameEvent values for audio, UI, persistence, and analytics.
Use explicit spawn/despawn/pool intent.
Mark objects as sharedGameplay or localCosmetic for future MHS NetworkMode mapping.
Keep browser loaders, DOM input, audio, and storage in platform-browser or render-three only.
```

If the AI builds a normal Three.js app where every system directly manipulates
`THREE.Mesh` instances, the port will be a rewrite. If it builds a data-driven
simulation with a Three.js adapter, the MHS port becomes an adapter replacement.

## 15. Portability Checklist

Before considering the Three.js prototype MHS-port-ready:

- [ ] Core game logic has no `THREE.*` imports.
- [ ] Core game logic has no DOM, browser loader, browser audio, or MHS imports.
- [ ] `GameState` owns authoritative gameplay truth.
- [ ] `RenderWorldState` or `SceneState` describes desired 3D visuals.
- [ ] Stable `objectId` values are separate from stable `templateId` values.
- [ ] All assets are declared in a central manifest.
- [ ] Asset manifest includes browser URL and future MHS path/template notes.
- [ ] Transform convention is documented: units, forward axis, up axis, pivot.
- [ ] Corrective rotations/scales are stored in manifest/config, not hidden in
  random loader code.
- [ ] Three.js object cache is private to `ThreeSceneAdapter`.
- [ ] Runtime spawning goes through an adapter API.
- [ ] Repeated objects have a documented pooling policy.
- [ ] Objects are marked `sharedGameplay` or `localCosmetic`.
- [ ] Collision intent is separate from render mesh details.
- [ ] Camera is represented as portable `CameraState`.
- [ ] Browser input is normalized into game commands.
- [ ] UI reads `HudState` and does not own game truth.
- [ ] Audio plays from `GameEvent` sound IDs.
- [ ] Persistence is adapter-only and saves plain data.
- [ ] Future MHS template names and child entity contracts are planned.
- [ ] Future MHS `NetworkMode.Networked` vs `NetworkMode.LocalOnly` mapping is
  obvious from state.
- [ ] No required behavior depends on browser-only shaders, DOM layout, CSS
  animation, or Three.js scene traversal.

## 16. Quick Reference

Three.js to MHS concept map:

```text
Three.js browser layer              Future MHS layer
----------------------              ----------------
index.html                          space.hstf
public/assets/models/*.glb          Assets/ imported model sources
GLTFLoader                          Horizon Studio import pipeline
THREE.Scene                         static scene plus spawned templates
THREE.Object3D                      Entity + TransformComponent
THREE.Mesh                          imported mesh/template asset
THREE.Material                      imported material or ColorComponent
THREE.PerspectiveCamera             CameraComponent + CameraMode.Custom
scene.add                           WorldService.get().spawnTemplate
object.visible = false              hide pooled entity or set visibility
object.position/quaternion/scale    TransformComponent world transform
renderOrder                         MeshComponent.renderOrderOffset
browser audio                       SoundComponent entities
DOM HUD                             XAML + CustomUiComponent.dataContext
localStorage                        PlayerVariablesService/server component
browser URL manifest                static TextureAsset/TemplateAsset mapping
```

Preferred module ownership:

```text
core/
  owns rules, state, scoring, timers, collision intent

world/
  owns pure data shapes: RenderWorldState, WorldObjectState, CameraState, HudState

assets/
  owns stable logical IDs and manifests

render-three/
  owns THREE.Scene, GLTFLoader, Object3D cache, materials, camera application

platform-browser/
  owns DOM input, browser loop, audio, storage, resize

future MHS adapter
  owns TemplateAsset, WorldService, TransformComponent, MeshComponent,
  SoundComponent, CustomUiComponent, NetworkMode, EventService
```

If a module would still make sense after replacing Three.js imports with
`meta/worlds` adapter calls, it is probably in the right layer. If a module
directly mixes rules, Three.js objects, browser events, and asset URLs, expect to
rewrite it during the MHS port.
