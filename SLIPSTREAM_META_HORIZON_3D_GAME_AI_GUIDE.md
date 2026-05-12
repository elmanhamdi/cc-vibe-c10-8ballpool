# Slipstream Meta Horizon Studio 3D Game AI Guide

This document is a project-specific case study of how the `Slipstream` project
is structured and how it implements a runtime 3D game in Meta Horizon Studio.

It is not the canonical generic build guide for Meta Horizon Studio 3D games.

For generic architecture, system structure, spawning, ownership, UI, audio,
persistence, and networking guidance, use:

- `META_HORIZON_STUDIO_3D_GAME_ARCHITECTURE_GUIDE.md`

Use this Slipstream document when you want one real example of those patterns in
an actual project with concrete scene entities, template contracts, and runtime
systems.

## How To Use This Document

- Use `META_HORIZON_STUDIO_3D_GAME_ARCHITECTURE_GUIDE.md` for generic design and
  architecture decisions.
- Use this document for concrete examples of those patterns in one real project.
- Use `THREEJS_TO_META_HORIZON_3D_PORTABILITY_GUIDE.md` when the source project
  starts in Three.js and will later be ported into Meta Horizon Studio.

Reference project root:

```text
F:\Projects\CreatorsCorp\Snackables\MetaProjects\Slipstream
```

Primary reference files:

- `Slipstream/Slipstream.hzproject`
- `Slipstream/space.hstf`
- `Slipstream/Templates/*.hstf`
- `Slipstream/Templates/Primitives/*.hstf`
- `Slipstream/Assets/*.fbx` and `Slipstream/Assets/*.fbx.assetmeta`
- `Slipstream/scripts/config.ts`
- `Slipstream/scripts/GameManager.ts`
- `Slipstream/scripts/SegmentManager.ts`
- `Slipstream/scripts/TrafficSpawner.ts`
- `Slipstream/scripts/SlipstreamZoneRenderer.ts`
- `Slipstream/scripts/CameraController.ts`
- `Slipstream/scripts/GameUi.ts`
- `Slipstream/scripts/GameOverUIController.ts`
- `Slipstream/scripts/HighScorePersistenceService.ts`

## 1. Project Anatomy

Slipstream is a Meta Horizon Studio project, not a conventional web/game-engine
project. The important files are Horizon scene, template, asset, UI, and script
artifacts.

### Root Files

- `Slipstream.hzproject` is the Horizon project descriptor. It stores project
  identity, world ID, collision layer names, editor version, starter world type,
  and player settings such as portrait orientation.
- `SlipstreamNew.hzproject` appears to be an alternate project descriptor. Treat
  `Slipstream.hzproject` as the active opened project unless the user specifies
  otherwise.
- `space.hstf` is the static world scene. It contains the initial world
  hierarchy: scene settings, camera, game manager, UI entities, audio entities,
  skybox, lighting, spawn point, and high score persistence entity.
- `player.hstf` and `Templates/PlayerCharacter.hstf` are inherited/base
  character template files. They are useful for reference, but the actual
  Slipstream arcade racing flow is driven by `GameManager.ts`, not by the
  default third-person character controller.
- `tsconfig.custom.json` is safe to edit for IDE/type-check customization, but
  Horizon Studio controls script transpilation. Do not assume changing this file
  changes runtime build behavior.
- `eslint.config.js` is a lint configuration template for Horizon TypeScript.
  It references the optional MHS linter package but is not required for runtime.
- `materialMap.json` imports `meta/editor_kit_shaders@materialMap.json`. Asset
  importers can use this map when assigning or converting materials.
- `GlobalResources.xaml` defines shared Noesis/XAML colors, fonts, and templates
  used by screen-space UI.

### Key Directories

- `Assets/` contains source and imported assets such as FBX meshes, PNG sky
  textures, MP3 audio, and `.material` files.
- `Templates/` contains `.hstf` template assets. These are the runtime-spawned
  prefabs referenced from code through `TemplateAsset`.
- `Templates/Primitives/` contains reusable primitive prefabs such as
  `Cube.hstf` and `Plane.hstf`. Slipstream uses these for runtime-generated
  visual effects.
- `UI/` contains Noesis/XAML UI layouts: `CoreGUI.xaml`, `GameOver.xaml`, and
  `PlayerActionUI.xaml`.
- `scripts/` contains Horizon TypeScript gameplay, rendering, camera, UI, audio,
  input, persistence, and utility modules.
- `generated/view_models/` contains generated UI view model classes. Do not edit
  generated files by hand unless the user explicitly asks.
- `Assistant/skills/` contains local skill/documentation material from the base
  template. It is useful context, but it is not the Slipstream runtime itself.

### `.assetmeta` Files

Most imported assets and scripts have paired `.assetmeta` files. These metadata
files store Horizon asset IDs, ingestion IDs, pipeline versions, and builder
settings.

Example: `Assets/playerCar2.fbx.assetmeta` contains DCC/template/mesh/physics
builder settings for the car import. It declares settings such as target
template generation, source coordinate system, mesh/material import handling,
streamable mesh settings, and collision mesh generation.

Code normally does not reference raw `.fbx` files directly. Code references the
template wrappers created by Horizon Studio:

```ts
new TemplateAsset("@Templates/car2.hstf")
```

Future AI agents should preserve `.assetmeta` files unless intentionally
reimporting assets through Horizon Studio.

## 2. Static Scene Bootstrap

`Slipstream/space.hstf` is the static scene entrypoint. Runtime systems use it as
the bootstrap scene, then spawn most gameplay visuals dynamically.

### Main Scene Entities

- `StartingWorld`
  - Holds the world root.
  - Includes player config, physics scene, scene/fog settings, scene shadow
    settings, transform, mesh, and material components.
  - Physics gravity is `0.0` in the inspected scene, matching the arcade racer
    design where most gameplay movement is scripted rather than full physical
    vehicle simulation.
- `Directional Light`
  - Distant light with warm color and high intensity.
- `SpawnPoint`
  - Standard Horizon spawn point.
  - Player avatars are not the visible taxi; the taxi is spawned and controlled
    by `GameManager`.
- `GameManager`
  - Static entity with the `GameManager` script component.
  - Acts as the main client-side runtime orchestrator.
  - Owns child entities for static audio, screen-space UI, and persistence.
- Audio child entities under `GameManager`
  - `BackgroundMusic`
  - `PlayerEngine`
  - `SlipstreamSfx`
  - `CrashSfx`
  - `GameOverSfx`
  - `SpeedBoostSfx`
  - `SpeedBoostOffSfx`
  - `RaceStartSfx`
- `CoreGUI`
  - Screen-space `CustomUiComponent` using `UI/CoreGUI.xaml`.
  - Bound at runtime to `SlipstreamGameDataViewModel`.
- `GameOverGUI`
  - Screen-space `CustomUiComponent` using `UI/GameOver.xaml`.
  - Also has `GameOverUIController`.
  - Hidden initially and shown by `GameManager` on game over.
- `HighScorePersistence`
  - Static entity with `HighScorePersistenceComponent`.
  - Marked networkable in `space.hstf`.
  - Must be server-owned for high-score network events and persistence.
- `Skybox`
  - Static `SkyboxPlatformComponent`.
  - Separate from the runtime camera-following sky plane spawned by
    `CameraController`.
- `Camera`
  - Has `CameraPlatformComponent`.
  - Has `CameraController`.
  - `CameraController` switches the active camera to `CameraMode.Custom`.

Audio and UI children are found by name from `GameManager.ts` using
`this.entity.findChildrenWithName(name, true)`, then cached as their component
types. These names are runtime contracts.

### Client/Server Guard Pattern

Slipstream's visual and gameplay runtime is mostly client-side. Many handlers
begin with:

```ts
if (NetworkingService.get().isServerContext()) {
  return;
}
```

This appears in `GameManager.ts` and `CameraController.ts`. Keep this pattern
when adding client-only rendering, input, UI, camera, audio, and local gameplay
logic. Server-side work is isolated to persistence and leaderboard handling in
`HighScorePersistenceService.ts`.

## 3. Runtime 3D Rendering Structure

Slipstream uses a hybrid approach:

- Static Horizon scene for bootstrapping.
- Runtime-spawned `.hstf` templates for environment, vehicles, and effects.
- Scripted transforms for movement.
- Screen-space XAML for HUD/game-over UI.
- World-space text child components for labels attached to cars.

### Camera Renderer

Reference: `scripts/CameraController.ts`

`CameraController` is attached to the scene `Camera` entity. It:

- caches `CameraComponent` and `TransformComponent` on start
- sets `CameraService.get().setCameraMode(CameraMode.Custom, ...)`
- controls camera transform directly each frame
- uses a fixed arcade camera position from `CONFIG`
- points the camera toward a configured look target
- applies camera shake from `CameraShakeState`
- lerps FOV for Super Slipstream mode
- spawns and updates a camera-following sky plane

Important classes/imports:

```ts
CameraComponent
CameraMode
CameraService
TransformComponent
TemplateAsset
WorldService
NetworkMode
MeshComponent
ColorComponent
PhysicsBodyComponent
ShadowParams
Vec3
Quaternion
```

The runtime sky plane is defined by:

```ts
const SKY_QUAD_TEMPLATE = new TemplateAsset("@Templates/Primitives/Plane.hstf");
```

It is spawned with:

- `NetworkMode.LocalOnly`
- initial position at the active camera
- large scale from `CONFIG.SKY_QUAD_WIDTH` and `CONFIG.SKY_QUAD_HEIGHT`
- collision disabled through `PhysicsBodyComponent.collisionEnabled = false`
- shadows disabled through `MeshComponent.shadowParams = new ShadowParams(false)`
- low render order through `MeshComponent.renderOrderOffset = -20`

The plane is repositioned in front of the current camera every frame using
`CameraService.get().position`, `CameraService.get().forward`, and
`CameraService.get().rotation`.

### Road And Environment Rendering

Reference: `scripts/SegmentManager.ts`

The road is not a single endless mesh. It is a recycled set of environment
segment templates.

Core data:

```ts
type RoadSegmentSlot = {
  zCenter: number;
  segmentIndex: number;
  entity: Entity | null;
};
```

On construction:

- `SegmentManager` creates `CONFIG.ROAD_VISIBLE_SEGMENTS` slots.
- Each slot gets an initial Z center.
- `createEntityForSegment` spawns the template for that slot.

Template selection:

- `CONFIG.ROAD_ENVIRONMENTS` is a phase array in `scripts/config.ts`.
- Each phase contains environment templates.
- Current templates are:
  - `@Templates/env1-1.hstf`
  - `@Templates/env1-2.hstf`
  - `@Templates/env2-1.hstf`
  - `@Templates/env2-2.hstf`
  - `@Templates/env3-1.hstf`
  - `@Templates/env3-2.hstf`
- `CONFIG.ROAD_ENV_SEGMENTS_PER_PHASE` determines how many segment indexes use a
  phase before moving to the next one.

Spawning:

```ts
await WorldService.get().spawnTemplate({
  templateAsset: template,
  networkMode: NetworkMode.Networked,
  position: new Vec3(0, 0, segment.zCenter),
  rotation: Quaternion.identity,
  scale: Vec3.one,
});
```

Scrolling:

- `GameManager` computes `scrollDz`.
- `SegmentManager.update(scrollDz)` subtracts from each segment `zCenter`.
- Existing spawned segment entities are moved by setting
  `TransformComponent.worldPosition`.
- When a segment moves behind `-CONFIG.ROAD_ENV_RECYCLE_BEHIND_DIST`, it is
  moved ahead of the current max Z and gets a new `segmentIndex`.
- The old entity is destroyed and a new template is spawned if the phase/variant
  changes.

Async spawn safety:

- `SegmentManager` uses `buildVersion`.
- If an async spawn resolves after a reset/destroy, the spawned entity is
  destroyed and not assigned.

### Vehicle Rendering

References:

- `scripts/GameManager.ts`
- `scripts/TrafficSpawner.ts`
- `scripts/config.ts`
- `Templates/car2.hstf`

`CONFIG.CAR_TEMPLATE` is the canonical car template:

```ts
CAR_TEMPLATE: new TemplateAsset("@Templates/car2.hstf")
```

Player car:

- Spawned by `GameManager.spawnPlayerCar()`.
- Uses `NetworkMode.Networked`.
- Position is `(0, CONFIG.PLAYER_CAR_Y_OFFSET, this.playerCarCurrentZ)`.
- `playerCarTransform` is cached.
- `TaxiWorldHud` world text child is found and cached.

Traffic cars:

- Managed by `TrafficSpawner`.
- Backed by a fixed logical vehicle pool: `CONFIG.VEHICLE_POOL_SIZE`.
- Spawned lazily when a pool slot first becomes active.
- Hidden by moving the entity to `(0, -1000, 0)` when inactive.
- Reused later by applying new transforms and labels.

Traffic cars are spawned with:

```ts
await WorldService.get().spawnTemplate({
  templateAsset: CONFIG.CAR_TEMPLATE,
  networkMode: NetworkMode.Networked,
  position: new Vec3(vehicle.x, 0, vehicle.z),
  rotation: Quaternion.identity,
  scale: Vec3.one,
});
```

Car transform updates:

- `TrafficSpawner.applyVehicleTransform` writes `worldPosition` and
  `worldRotation`.
- Normal cars use `Quaternion.identity`.
- Crash tumble cars use `Quaternion.fromEuler(this.crashedVehicleRotationDeg)`.
- Player car body roll uses `Quaternion.fromEuler(new Vec3(0, 0, bodyRollDeg))`.

### Slipstream And VFX Rendering

References:

- `scripts/SlipstreamZoneRenderer.ts`
- `scripts/GameManager.ts`
- `Templates/Primitives/Cube.hstf`

Slipstream outline:

- `SlipstreamZoneRenderer` renders dashed rectangular outlines behind active
  traffic cars.
- It uses local-only primitive cubes:

```ts
const DASH_TEMPLATE = new TemplateAsset("@Templates/Primitives/Cube.hstf");
```

- It allocates dash arrays per vehicle pool slot.
- Each dash caches `Entity`, `TransformComponent`, `ColorComponent`, and
  `MeshComponent`.
- Mesh shadows are disabled.
- Render order is raised with `renderOrderOffset = 4`.
- Inactive dash entities are hidden at `(0, -1000, 0)`.

Slipstream activation burst and Super Slipstream stream:

- Implemented in `GameManager.ts`.
- Both use `@Templates/Primitives/Cube.hstf`.
- Both allocate local-only pools up front.
- Pool entities cache transform/color/mesh/physics.
- Decorative physics collision is disabled.
- Mesh shadow casting is disabled.
- Render order is high (`80`/`90`) so effects layer cleanly.

General VFX pattern:

1. Spawn primitive template with `NetworkMode.LocalOnly`.
2. Cache `TransformComponent`, `ColorComponent`, `MeshComponent`, and
   `PhysicsBodyComponent`.
3. Disable collision and shadows.
4. Move inactive entities to `(0, -1000, 0)`.
5. Reuse the entity by setting position, rotation, scale, and color every frame.

This avoids repeated spawn/destroy churn during gameplay.

## 4. File Loading And Template Spawning

Meta Horizon Studio asset loading is template-oriented. FBX files are imported by
the editor/pipeline, then runtime code spawns the corresponding `.hstf`
templates.

### Imported FBX To Template

Relevant assets:

- `Assets/playerCar2.fbx`
- `Assets/playerCar2.fbx.assetmeta`
- `Templates/car2.hstf`
- `Templates/car2.hstf.assetmeta`

The `.fbx.assetmeta` file stores builder settings that create a Horizon template
and mesh/collision assets from the source model. Future agents should avoid
assuming the FBX can be loaded directly from TypeScript. Use the `.hstf` template
path in `TemplateAsset`.

### Car Template Contract

Reference: `Templates/car2.hstf`

Important structure:

- `car2`
  - Root imported template/mesh.
  - Has mesh, collider mesh, and physics body components.
- `OvertakeNameLabel`
  - Child entity.
  - Has `WorldTextComponent`.
  - Found by `TrafficSpawner` for named overtake racers.
- `TaxiWorldHud`
  - Child entity.
  - Has `WorldTextComponent`.
  - Found by `GameManager` for the player's speed readout.
- `SlipstreamTimeBonusLabel`
  - Child entity.
  - Has `WorldTextComponent`.
  - Found by `TrafficSpawner` and used for `+1 sec` / `+2 sec` labels.
- `TrafficEngine`
  - Child entity.
  - Has `SoundComponent`.
  - Found by `TrafficSpawner`.
  - Used as spatial looped engine audio for traffic.

These names are hard-coded in scripts. Renaming the child entities in the
template will break runtime behavior unless the matching constants are updated:

- `GameManager.playerSpeedHudEntityName = "TaxiWorldHud"`
- `TrafficSpawner` constants:
  - `OVERTAKE_NAME_ENTITY_NAME = "OvertakeNameLabel"`
  - `SLIPSTREAM_TIME_BONUS_ENTITY_NAME = "SlipstreamTimeBonusLabel"`
  - `TRAFFIC_ENGINE_ENTITY_NAME = "TrafficEngine"`

### Environment Template Contract

References:

- `Templates/env1-1.hstf`
- `Templates/env1-2.hstf`
- `Templates/env2-1.hstf`
- `Templates/env2-2.hstf`
- `Templates/env3-1.hstf`
- `Templates/env3-2.hstf`
- `scripts/config.ts`
- `scripts/SegmentManager.ts`

Each environment template is a spawned road/environment segment. They are
selected through `CONFIG.ROAD_ENVIRONMENTS`.

Design assumptions encoded in `config.ts` comments:

- Segment length is `CONFIG.ROAD_SEGMENT_LENGTH`, currently `20`.
- Visible segment count is `CONFIG.ROAD_VISIBLE_SEGMENTS`, currently `9`.
- Environment origin should be on the road surface in the DCC tool.
- Environment scaling can be based on bounding box when width/depth refs are `0`.
- `ROAD_SEGMENT_VISUAL_WIDTH` is visual width, while `ROAD_WIDTH` is gameplay
  corridor width.

### Primitive Template Contract

References:

- `Templates/Primitives/Cube.hstf`
- `Templates/Primitives/Plane.hstf`

These primitive templates include transform, mesh, material, color, physics body,
and primitive collider components. They are reusable building blocks for dashed
slipstream outlines, slipstream burst particles, Super Slipstream stream
particles, and the camera-following sky plane.

Because they include physics/collider components by default, cosmetic usage
should disable collision through `PhysicsBodyComponent.collisionEnabled = false`
when available.

### Spawn Pattern

Use this pattern for dynamic runtime assets:

```ts
import {
  NetworkMode,
  Quaternion,
  TemplateAsset,
  TransformComponent,
  Vec3,
  WorldService,
  type Entity,
} from "meta/worlds";

const TEMPLATE = new TemplateAsset("@Templates/example.hstf");

async function spawnExample(): Promise<Entity | null> {
  try {
    const entity = await WorldService.get().spawnTemplate({
      templateAsset: TEMPLATE,
      networkMode: NetworkMode.Networked,
      position: new Vec3(0, 0, 0),
      rotation: Quaternion.identity,
      scale: Vec3.one,
    });

    const transform = entity.getComponent(TransformComponent);
    if (transform) {
      transform.worldPosition = new Vec3(0, 0, 10);
    }

    return entity;
  } catch (error) {
    console.error("Failed to spawn example", error);
    return null;
  }
}
```

Network mode choice:

- Use `NetworkMode.Networked` for gameplay-visible objects that should exist
  consistently across network contexts, such as cars and road segments.
- Use `NetworkMode.LocalOnly` for cosmetic/client-only effects, such as sky
  planes, slipstream dashes, and particles.

Async safety:

- If an object may be reset/destroyed while spawn is in flight, store a version
  token.
- After `await spawnTemplate`, compare the token.
- If stale, call `entity.destroy()` and return.
- `SegmentManager` and `SlipstreamZoneRenderer` both use this pattern.

## 5. Code Import Structure

Slipstream uses TypeScript modules under `scripts/`. Horizon Studio wires script
classes to scene/template entities through script components in `.hstf` files.

### Runtime Module Layers

- `scripts/GameManager.ts`
  - Main orchestrator.
  - Imports most gameplay/rendering systems.
  - Handles initialization, main update loop, state transitions, audio, UI,
    scoring, collisions, slipstream activation, particles, and leaderboard UI.
- `scripts/config.ts`
  - Central source of tuning constants, palette values, and template references.
  - Defines `CONFIG.CAR_TEMPLATE`.
  - Defines `CONFIG.ROAD_ENVIRONMENTS`.
  - Defines camera, road, traffic, slipstream, scoring, UI, audio, and
    persistence tuning.
- `scripts/SegmentManager.ts`
  - Plain TypeScript class, not a `Component`.
  - Spawns and recycles road/environment template segments.
- `scripts/TrafficSpawner.ts`
  - Plain TypeScript class.
  - Owns traffic vehicle pool, spawning, movement, lane changes, crash tumble,
    labels, and traffic engine audio.
- `scripts/LaneSystem.ts`
  - Plain TypeScript class.
  - Converts touch input to lane steps.
  - Provides eased lane X and body roll values.
- `scripts/SlipstreamZone.ts`
  - Plain TypeScript class.
  - Tracks draft zone overlap, accumulated draft depth, meter fill, and
    slingshot release.
- `scripts/slipstreamOverlap.ts`
  - Helper for player/vehicle slipstream overlap.
- `scripts/CollisionSystem.ts`
  - Plain TypeScript class.
  - Performs X/Z AABB collision checks against active traffic.
- `scripts/SlipstreamZoneRenderer.ts`
  - Rendering-focused plain TypeScript class.
  - Spawns local-only cube dashes for slipstream outlines.
- `scripts/CameraController.ts`
  - Horizon `Component`.
  - Owns active camera, custom FOV, shake, and sky plane.
- `scripts/GameUi.ts`
  - UI events and `SlipstreamGameDataViewModel`.
  - Extends generated `GameDataViewModel`.
- `scripts/GameOverUIController.ts`
  - Horizon `Component`.
  - Bridges the XAML retry button event to a local retry event.
- `scripts/HighScorePersistenceService.ts`
  - Contains `HighScorePersistenceComponent` and
    `HighScorePersistenceService`.
  - Handles server-owned persistence through `PlayerVariablesService` and
    leaderboard submission through `LeaderboardsService`.
- `scripts/controllers/`, `scripts/components/`, and related camera/controller
  files
  - Mostly inherited base third-person character controller architecture.
  - Useful for non-racing games.
  - Not the center of Slipstream's arcade racing loop.

### Common `meta/worlds` Imports

Decorators and events:

```ts
Component
Service
component
service
subscribe
property
serializable
uiViewModel
OnEntityStartEvent
OnWorldUpdateEvent
OnPlayerCreateEvent
LocalEvent
NetworkEvent
UiEvent
```

Runtime services:

```ts
WorldService
CameraService
EventService
NetworkingService
PlayerService
EntityService
FocusedInteractionService
LeaderboardsService
PlayerVariablesService
```

Components:

```ts
TransformComponent
MeshComponent
ColorComponent
SoundComponent
WorldTextComponent
CustomUiComponent
PhysicsBodyComponent
CameraComponent
```

Math/assets/render helpers:

```ts
Vec2
Vec3
Quaternion
Color
TemplateAsset
ShadowParams
SoundPlayInfo
```

Type-only imports are common:

```ts
import type { Entity } from "meta/worlds";
```

Use type-only imports for Horizon types that are only used as annotations.

## 6. Gameplay Loop And Data Flow

### `GameManager.onStart`

Reference: `scripts/GameManager.ts`

`GameManager` subscribes to `OnEntityStartEvent`. Its startup flow is:

1. Return immediately if running in server context.
2. Initialize local high score sync.
3. Construct runtime systems:
   - `SegmentManager`
   - `TrafficSpawner`
   - `LaneSystem`
   - `SlipstreamZone`
   - `SlipstreamZoneRenderer`
4. Cache UI components:
   - `CoreGUI`
   - `GameOverGUI`
5. Cache static audio child components under the `GameManager` entity.
6. Start background music and player engine audio if enabled.
7. Begin creating local-only VFX pools.
8. Reset global Super Slipstream state.
9. Enable focused touch input on supported non-XR devices.
10. Reset run state.
11. Spawn the player car.

This order matters: UI and audio are cached before gameplay begins, pools are
created early to avoid runtime spikes, and run state is reset before the first
player car transform update.

### `GameManager.onUpdate`

Reference: `scripts/GameManager.ts`

`GameManager` subscribes to `OnWorldUpdateEvent`. Its update flow is:

1. Return if server context.
2. Ensure background music and engine audio are started.
3. If first-launch intro is active, update intro and return.
4. If game over, keep engine audio muted/off and return.
5. Update FPS HUD and slipstream burst particles.
6. If crash tumble is active:
   - update engine audio
   - update traffic tumble
   - update player crash tumble
   - return
7. If pre-race sequence is active:
   - update countdown
   - update engine audio
   - clear player speed HUD
   - refresh HUD
   - return
8. Compute active gameplay values:
   - `deltaSec`
   - `scrollPerFrame`
   - `scrollDz`
   - Super Slipstream active flag
   - player lane index
   - player audio position
9. Decrement race timer and enter game over if time expires.
10. Accumulate distance and HUD speed.
11. Update player engine audio and speed world text.
12. Update floating race-time bonus.
13. Update road segments through `SegmentManager.update(scrollDz)`.
14. Update traffic through `TrafficSpawner.update(...)`.
15. Update player car transform from `LaneSystem`.
16. Update Super Slipstream stream particles.
17. Compute player bounds.
18. Update slipstream logic through `SlipstreamZone.update(...)`.
19. If slingshot fires:
   - apply bonus
   - play SFX
   - trigger burst VFX
   - spawn time bonus float
   - mark traffic target consumed
20. Update slipstream outline renderer.
21. Check collisions through `CollisionSystem.checkHit(...)`.
22. Start crash tumble if hit.
23. Refresh HUD.

### World Movement Model

The player taxi stays near a fixed Z position. The world scrolls toward the
camera by moving road segments and traffic along Z. This creates an endless-road
arcade racing effect while keeping the player car stable and easy to frame.

Important config values:

- `CONFIG.TAXI_POSITION_Z`
- `CONFIG.TAXI_INTRO_START_Z_OFFSET`
- `CONFIG.ROAD_SEGMENT_LENGTH`
- `CONFIG.ROAD_VISIBLE_SEGMENTS`
- `CONFIG.BASE_SCROLL_SPEED`
- `CONFIG.MAX_SCROLL_SPEED`
- `CONFIG.TRAFFIC_SPAWN_AHEAD_Z`
- `CONFIG.TRAFFIC_DESPAWN_BEHIND_Z`

### Collision And Slipstream Logic

Collision and slipstream are computed as simplified 2D X/Z gameplay bounds even
though visuals are 3D.

Player bounds:

- center X/Z from lane and player car position
- half width/depth from `CONFIG.TAXI_DIMENSIONS`
- collision half sizes scaled by:
  - `CONFIG.TAXI_COLLISION_X_HALF_SCALE`
  - `CONFIG.TAXI_COLLISION_Z_HALF_SCALE`

Traffic bounds:

- stored per logical vehicle slot in `TrafficSpawner`
- based on active vehicle X/Z and configured car dimensions

Collision:

- `CollisionSystem` uses simple AABB overlap on X/Z.

Slipstream:

- `SlipstreamZone` asks `TrafficSpawner.getActiveCollisionBounds()`.
- `playerInVehicleSlipstream` checks if the player overlaps a rectangular draft
  zone behind the traffic vehicle.
- Draft meter fills based on relative Z travel while staying in the same
  vehicle's zone.
- Slingshot fires when the player exits the zone after the meter is full.

This model keeps gameplay deterministic and cheap while preserving 3D visuals.

### Lane Movement

Reference: `scripts/LaneSystem.ts`

`LaneSystem` is a plain TypeScript class. It:

- tracks current lane and target lane
- accepts focused touch start/move/end events
- supports edge taps and swipe movement
- converts lane index to world X using `CONFIG.LANE_WIDTH`
- eases lateral movement with `easeOutBack`
- produces body roll and wheel steer values

`GameManager.updatePlayerCarTransform` consumes:

- `laneSystem.getLaneX(nowMs)`
- `laneSystem.getBodyRollDeg(nowMs)`

Then it writes the player car transform directly.

## 7. UI, Audio, And Persistence

### Noesis/XAML UI

References:

- `UI/CoreGUI.xaml`
- `UI/GameOver.xaml`
- `GlobalResources.xaml`
- `generated/view_models/GameDataViewModel.ts`
- `scripts/GameUi.ts`
- `scripts/GameManager.ts`
- `scripts/GameOverUIController.ts`

`GameDataViewModel.ts` is generated and defines base UI fields:

- `ElapsedTime`
- `Speed`
- `BoostActive`
- `Score`
- `Slipstreams`
- `Distance`
- `IsHighScore`

`SlipstreamGameDataViewModel` extends it and adds Slipstream-specific HUD and
game-over fields:

- Super Slipstream meter
- FPS text
- game over title
- pre-race countdown text
- timer characters
- tutorial hint flags
- race time bonus float data
- saved high score
- leaderboard rows
- retry button event binding

`GameManager.cacheUiComponents` finds `CoreGUI` and `GameOverGUI` by name under
the `GameManager` scene entity and assigns:

```ts
this.hudUi.dataContext = this.gameDataViewModel;
this.gameOverUi.dataContext = this.gameDataViewModel;
```

`GameOver.xaml` binds the retry button command to:

```xaml
Command="{Binding events.onRetryButtonClicked}"
```

`GameOverUIController` receives that UI event and sends a local
`retryGameRequestedEvent`. `GameManager` subscribes to that local event and
resets the run state.

### World Text On 3D Templates

Slipstream uses `WorldTextComponent` children on the car template for labels that
should move with cars:

- `TaxiWorldHud`: player speed readout
- `OvertakeNameLabel`: generated racer names for overtake cars
- `SlipstreamTimeBonusLabel`: visible `+1 sec` / `+2 sec` slipstream reward

These are configured in script after lookup:

- text
- font size
- alignment
- horizontal/vertical origin
- color
- outline color
- outline width

Use world text when text should exist in the 3D scene and follow an entity. Use
XAML screen-space UI for HUD overlays.

### Audio

References:

- `space.hstf`
- `Templates/car2.hstf`
- `scripts/GameManager.ts`
- `scripts/TrafficSpawner.ts`
- `scripts/config.ts`

Static audio:

- Lives as child entities under `GameManager`.
- Uses `SoundComponent`.
- Is found by hard-coded entity name.
- Background music and most SFX are non-spatial.

Player engine:

- `PlayerEngine` is a static non-spatial scene sound.
- `GameManager` loops it and adjusts volume/pitch based on speed.

Traffic engine:

- `TrafficEngine` is a child of each spawned car template.
- `TrafficSpawner` finds the child sound component on each vehicle entity.
- Traffic engine sound is spatial:

```ts
sound.soundEmitterType = AudioEmitterType.Spatial;
sound.minMaxDistance = new Vec2(
  CONFIG.AUDIO_RACECAR_REF_DISTANCE,
  CONFIG.AUDIO_RACECAR_MAX_DISTANCE,
);
```

Pitch changes:

- Both player and traffic engine systems smooth target pitch.
- When the pitch delta exceeds a threshold and a repitch interval has elapsed,
  they stop and replay the sound at the updated pitch while preserving timeline
  position.

### Persistence And Leaderboards

References:

- `scripts/HighScorePersistenceService.ts`
- `scripts/GameUi.ts`
- `scripts/GameManager.ts`
- `space.hstf`

Important classes:

- `HighScorePersistenceComponent`
- `HighScorePersistenceService`

`HighScorePersistenceComponent` should be attached to a server-owned networked
scene entity. In Slipstream this entity is named `HighScorePersistence`.

Client/server event flow:

1. Client `GameManager` identifies the local player.
2. Client sends `requestSavedHighScoreEvent` to the high-score target owner.
3. Server-side `HighScorePersistenceComponent` receives the request.
4. Server service loads player variable `score`.
5. Server sends `savedHighScoreUpdatedEvent` to the player owner.
6. Client applies the saved value to the UI view model.

Score submission flow:

1. Client sends `submitRunScoreEvent`.
2. Server sanitizes score.
3. Server compares with stored high score.
4. Server updates leaderboard through `LeaderboardsService`.
5. Server stores new personal high score through `PlayerVariablesService`.
6. Server sends `savedHighScoreUpdatedEvent` back to the owner.

`CONFIG.LEADERBOARD_API_NAME` controls the leaderboard key.

## 8. Development Patterns To Preserve

### Prefer Central Config

Slipstream keeps tuning and asset references in `scripts/config.ts`. Future
changes should usually add constants there instead of scattering magic numbers.

Examples:

- camera FOV/height/distance
- road segment length and environment templates
- traffic spawn phases
- vehicle pool size
- slipstream dimensions
- UI timing
- audio volumes and pitch behavior
- leaderboard name

### Keep Template Child Names Stable

Code depends on child entity names in `space.hstf` and `Templates/car2.hstf`.
Before renaming a scene/template entity, search scripts for that exact name.

Common lookup pattern:

```ts
const entity = root.findChildrenWithName("SomeName", true)[0] ?? null;
const component = entity?.getComponent(SomeComponent) ?? null;
```

If the name changes, this lookup silently returns `null` and runtime behavior
degrades with warnings or missing UI/audio/text.

### Use Pools For Repeated Runtime Effects

Slipstream pools:

- traffic logical slots
- traffic spawned entities
- slipstream outline dashes
- slipstream activation burst particles
- Super Slipstream stream particles

Do not spawn/destroy large numbers of visual effects every frame. Spawn once,
cache components, hide inactive items below the world, and update transforms.

### Separate Gameplay Logic From Rendering

Several systems are plain TypeScript classes, not Horizon components:

- `SegmentManager`
- `TrafficSpawner`
- `LaneSystem`
- `SlipstreamZone`
- `CollisionSystem`
- `SlipstreamZoneRenderer`

`GameManager` owns and calls them. This keeps most logic testable and avoids
attaching too many script components to scene entities.

### Use Server Context Only For Server Work

Client-only visual code should guard out server context. Server persistence code
should guard out non-server contexts.

Client guard:

```ts
if (NetworkingService.get().isServerContext()) {
  return;
}
```

Server guard:

```ts
if (!NetworkingService.get().isServerContext()) {
  return;
}
```

### Match Network Mode To Intent

Use `NetworkMode.Networked` for:

- player car template
- traffic car templates
- environment segments
- objects that must be represented consistently as game entities

Use `NetworkMode.LocalOnly` for:

- camera-following sky plane
- slipstream outline dashes
- local VFX particles
- cosmetic-only visuals that do not need network replication

### Disable Physics On Cosmetic Primitives

Primitive templates include physics/collider components. When using them for
VFX, disable collision:

```ts
const physicsBody = entity.getComponent(PhysicsBodyComponent);
if (physicsBody) {
  physicsBody.collisionEnabled = false;
}
```

Also disable shadows when visuals are UI-like or particle-like:

```ts
const mesh = entity.getComponent(MeshComponent);
if (mesh) {
  mesh.shadowParams = new ShadowParams(false);
}
```

### Handle Async Spawn Races

Any reset/destroy can race with async `spawnTemplate`. Use a version token:

```ts
const buildVersion = ++this.buildVersion;
const entity = await WorldService.get().spawnTemplate(...);
if (buildVersion !== this.buildVersion) {
  entity.destroy();
  return;
}
```

This prevents stale spawned objects from appearing after a reset.

## 9. Practical Recipe For A New 3D Horizon Game

Use this high-level recipe when building a new 3D game from Slipstream's pattern:

1. Create or inspect the static scene `.hstf`.
   - Add one main manager entity.
   - Add camera, lighting, skybox, UI entities, and server-owned persistence
     entities as needed.
2. Import 3D assets through Horizon Studio.
   - Keep source assets in `Assets/`.
   - Let Studio generate `.assetmeta` and template artifacts.
   - Reference spawned objects through `.hstf` templates.
3. Define template contracts.
   - Put runtime-spawned prefabs in `Templates/`.
   - Add named child entities for labels, sockets, audio, attach points, or
     other script lookups.
   - Document those child names and keep them stable.
4. Create a central `config.ts`.
   - Store template references with `TemplateAsset`.
   - Store gameplay dimensions, spawn rates, camera values, audio volumes, and
     UI timing.
5. Build a main manager component.
   - Subscribe to `OnEntityStartEvent`.
   - Subscribe to `OnWorldUpdateEvent`.
   - Guard client-only logic from server context.
   - Construct plain TypeScript systems.
   - Cache scene child components by name.
6. Spawn runtime objects from templates.
   - Use `WorldService.get().spawnTemplate`.
   - Cache transform/render/audio/text components immediately.
   - Choose `NetworkMode.Networked` or `NetworkMode.LocalOnly` deliberately.
7. Move objects through transforms.
   - For arcade games, scripted `TransformComponent.worldPosition` and
     `worldRotation` can be simpler than full rigid-body simulation.
   - Use simplified gameplay bounds when full 3D physics is unnecessary.
8. Add UI through XAML and view models.
   - Keep generated view models generated.
   - Extend them in a script-owned view model class.
   - Assign `CustomUiComponent.dataContext` at runtime.
   - Bridge UI button events to local or network events.
9. Add audio through named scene/template children.
   - Use static scene sound entities for global music/SFX.
   - Use child sound components on spawned templates for spatial object audio.
   - Cache by name and handle missing components gracefully.
10. Add persistence on a server-owned networked entity.
    - Use `NetworkEvent`s for client/server requests.
    - Use `PlayerVariablesService` for stored per-player values.
    - Use `LeaderboardsService` for leaderboard entries.

## 10. AI Implementation Checklist

Before changing a Meta Horizon Studio 3D project based on Slipstream, inspect:

- [ ] Active `.hzproject` file and player settings.
- [ ] Static scene file, usually `space.hstf`.
- [ ] Main manager entity and attached script component.
- [ ] Camera entity, camera script, and `CameraMode.Custom` setup.
- [ ] Lighting, skybox, fog, and shadow settings.
- [ ] Runtime-spawned templates in `Templates/`.
- [ ] Imported asset metadata in `Assets/*.assetmeta`.
- [ ] Central config file and all `TemplateAsset` references.
- [ ] Hard-coded scene child names used by `findChildrenWithName`.
- [ ] Hard-coded template child names used by `findChildrenWithName`.
- [ ] `NetworkMode.Networked` vs `NetworkMode.LocalOnly` choices.
- [ ] Component caching after `spawnTemplate`.
- [ ] Async spawn version-token guards.
- [ ] Object pools and hidden inactive positions.
- [ ] Physics/collision state on cosmetic primitive templates.
- [ ] UI XAML files and their bound view model fields.
- [ ] `CustomUiComponent.dataContext` assignment.
- [ ] UI event bridge classes such as `GameOverUIController`.
- [ ] Static audio entities and child audio components on templates.
- [ ] Server/client context guards.
- [ ] Persistence and leaderboard entity ownership.
- [ ] Generated files that should not be edited manually.

Before renaming anything, search scripts for:

```text
findChildrenWithName
TemplateAsset(
CONFIG.
NetworkMode.
```

Before adding a new spawned visual, decide:

- Is it gameplay-visible/shared? Use `NetworkMode.Networked`.
- Is it local cosmetic VFX? Use `NetworkMode.LocalOnly`.
- Does it need a stable named child contract?
- Can it be pooled instead of repeatedly spawned/destroyed?
- Should collision and shadows be disabled?
- Should it be hidden at `(0, -1000, 0)` when inactive?

Before touching UI, confirm:

- The XAML binding path exists on the runtime view model.
- The correct `CustomUiComponent` receives `dataContext`.
- Button commands map to `UiEvent`s.
- UI events are bridged to local/network events as needed.

Before touching persistence, confirm:

- The persistence component is on a server-owned networked entity.
- Client requests use `NetworkEvent` and are sent to the owner/target.
- Server code guards with `NetworkingService.get().isServerContext()`.
- Client UI updates are sent back with `EventService.sendToOwner`.

## 11. Quick Reference: Slipstream Runtime Contracts

Scene entity names from `space.hstf`:

- `StartingWorld`
- `Directional Light`
- `SpawnPoint`
- `GameManager`
- `BackgroundMusic`
- `PlayerEngine`
- `SlipstreamSfx`
- `CrashSfx`
- `GameOverSfx`
- `SpeedBoostSfx`
- `SpeedBoostOffSfx`
- `RaceStartSfx`
- `CoreGUI`
- `GameOverGUI`
- `HighScorePersistence`
- `Skybox`
- `Camera`

Runtime template references from `scripts/config.ts` and rendering scripts:

- `@Templates/car2.hstf`
- `@Templates/env1-1.hstf`
- `@Templates/env1-2.hstf`
- `@Templates/env2-1.hstf`
- `@Templates/env2-2.hstf`
- `@Templates/env3-1.hstf`
- `@Templates/env3-2.hstf`
- `@Templates/Primitives/Cube.hstf`
- `@Templates/Primitives/Plane.hstf`

Car template child names from `Templates/car2.hstf`:

- `OvertakeNameLabel`
- `TaxiWorldHud`
- `SlipstreamTimeBonusLabel`
- `TrafficEngine`

Central orchestrator:

- `scripts/GameManager.ts`

Rendering-focused scripts:

- `scripts/CameraController.ts`
- `scripts/SegmentManager.ts`
- `scripts/SlipstreamZoneRenderer.ts`
- VFX portions of `scripts/GameManager.ts`

Gameplay-focused scripts:

- `scripts/TrafficSpawner.ts`
- `scripts/LaneSystem.ts`
- `scripts/SlipstreamZone.ts`
- `scripts/slipstreamOverlap.ts`
- `scripts/CollisionSystem.ts`
- `scripts/GameState.ts`
- `scripts/SuperSlipstreamState.ts`
- `scripts/CameraShakeState.ts`

UI/persistence scripts:

- `scripts/GameUi.ts`
- `scripts/GameOverUIController.ts`
- `scripts/HighScorePersistenceService.ts`
