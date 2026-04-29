import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { BallKind } from '../physics/Ball.js';
import { Table } from '../physics/Table.js';
import { AssetManifest } from '../assets/AssetManifest.js';
import { AssetIds } from '../assets/AssetIds.js';
import { OPPONENT_TUNG_MODEL_TARGET_HEIGHT } from '../core/Constants.js';
import { resolveBrowserAssetUrl } from '../assets/resolveBrowserAssetUrl.js';
import type { RenderRuntimeHints } from '../core/gameContract.js';
import type { PolylineObjectState, RenderWorldState, WorldObjectState } from '../world/renderTypes.js';

/** `Table.glb` Y ölçeği — model ince kalıyorsa artır (fizik 2D, yalnızca görsel). */
const TABLE_MESH_Y_THICKNESS_MUL = 1.4;

/** Masa + toplar + çizgileri Y’de yukarı (world birimi); HUD altında daha merkezli görünür. */
const TABLE_SCENE_Y_LIFT = 24;
/** Sadece görsel masayı biraz yukarı kaldırmak için ekstra ofset. */
const TABLE_GROUP_Y_VISUAL_OFFSET = 4;

/**
 * Fizikle uyumlu oyun düzlemi: top merkezi y ≈ radius + 0.15 (varsayılan radius 9 → 9.15).
 * screen→table ışını bu yükseklikte kesilir.
 */
const TABLE_PLAY_SURFACE_LOCAL_Y = 9.15;

/** Top / isteka / aim çizgisi Y (world); − = masaya doğru. Kalınlık sabitinden bağımsız. */
const PLAYFIELD_RENDER_Y_OFFSET = -6;

const TABLE_RAY_PLANE_W = -(TABLE_SCENE_Y_LIFT + TABLE_PLAY_SURFACE_LOCAL_Y + PLAYFIELD_RENDER_Y_OFFSET);

/** Geniş zemin düzlemi; masanın `tableGroup` orijininin altında (world Y). */
const FLOOR_PLANE_WORLD_Y = TABLE_SCENE_Y_LIFT - 124;
const FLOOR_EXTEND_MUL = 2.75;

/** Tung container local: duvar masadan uzakta (−Z), düzlem XY (Y yukarı). */
const TUNG_BACK_WALL_LOCAL_Z = -400;
const TUNG_BACK_WALL_WIDTH_TABLE_MUL = 22.72;
const TUNG_BACK_WALL_HEIGHT_MODEL_MUL = 17.6;
/** Duvarı biraz aşağı kaydır (Y azalır). */
const TUNG_BACK_WALL_Y_PULL_DOWN = 56;
const TUNG_BACK_WALL_TEX_REPEAT_X = 41.6;
const TUNG_BACK_WALL_TEX_REPEAT_Y = 54.4;

export type ThreeSceneAdapterOptions = {
  /** Vite `import.meta.env.BASE_URL` for `public/` textures and GLB fallbacks. */
  assetBaseUrl?: string;
  /** Same instance as game physics so rails/pockets match after URL/localStorage tuning. */
  physicsTable?: Table;
};

/**
 * Maps portable `RenderWorldState` to a Three.js scene (guide §4).
 * Owns THREE.Scene, caches meshes by stable `objectId`.
 */
export class ThreeSceneAdapter {
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly raycaster = new THREE.Raycaster();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), TABLE_RAY_PLANE_W);
  private readonly hit = new THREE.Vector3();
  private readonly ndc = new THREE.Vector2();
  private readonly objectById = new Map<string, THREE.Object3D>();
  private readonly polylineById = new Map<string, THREE.Line>();
  private readonly ballGeo: THREE.SphereGeometry;
  /** Per-ball rolling quaternion (render); integrated from `tableVelocity` + real frame dt. */
  private readonly ballRollQuat = new Map<string, THREE.Quaternion>();
  private readonly ballLastPos = new Map<string, THREE.Vector3>();
  private readonly tmpRollAxis = new THREE.Vector3();
  private readonly tmpRollDelta = new THREE.Quaternion();
  private readonly tableGroup = new THREE.Group();
  private readonly cueGroup = new THREE.Group();
  private cueShaft!: THREE.Mesh;
  private cueTip!: THREE.Mesh;
  private cueFerrule!: THREE.Mesh;
  private cueAccentRing!: THREE.Mesh;
  private cueWrap!: THREE.Mesh;
  private cueButt!: THREE.Mesh;
  private cueButtCap!: THREE.Mesh;
  private cueButtRing!: THREE.Mesh;
  private cueAppliedStyleId: string | null = null;
  /** İlk break “çek–vur” ipucu — `cuePullHandHint` açıkken sopada yukarı/aşağı. */
  private cueHandHintSprite: THREE.Sprite | null = null;
  private cueHandHintTexture: THREE.Texture | null = null;
  private cueHandHintPhase = 0;
  /** Beyazı sürükleyerek yerleştirme — `cueBallInHandCursorHint`. */
  private ballInHandHintSprite: THREE.Sprite | null = null;
  private ballInHandHintPhase = 0;
  /** Büyük zemin; `tableGroup.clear()` bunu silmez (sahne kökünde). */
  private floorMesh: THREE.Mesh | null = null;
  private floorTexture: THREE.Texture | null = null;
  private readonly physicsTable: Table;
  /** Top numarası → diffuse (1–15, 0 = isteka); paylaşılan `Texture` referansı. */
  private readonly ballDiffuseByNumber = new Map<number, THREE.Texture>();
  private readonly assetBaseUrl: string;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    options?: ThreeSceneAdapterOptions,
  ) {
    this.assetBaseUrl = options?.assetBaseUrl ?? '/';
    this.physicsTable = options?.physicsTable ?? new Table();

    this.scene.background = new THREE.Color(0x0b0f14);
    this.camera = new THREE.PerspectiveCamera(24, 1, 40, 12000);
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.ballGeo = new THREE.SphereGeometry(1, 36, 24);
    this.buildLights();
    this.buildTableFromManifest();
    this.buildCueStick();
    this.tableGroup.position.y = TABLE_SCENE_Y_LIFT;
    this.scene.add(this.tableGroup, this.cueGroup);
  }

  /** Preload declared templates/models (guide §6). */
  async preload(templateIds: readonly string[]): Promise<void> {
    void templateIds;
    await this.loadBallDiffuseTextures();
    await this.loadCueHandHintTexture();
    await this.loadFloorUnderTable();
  }

  dispose(): void {
    for (const t of this.ballDiffuseByNumber.values()) {
      t.dispose();
    }
    this.ballDiffuseByNumber.clear();
    if (this.ballInHandHintSprite) {
      const mb = this.ballInHandHintSprite.material as THREE.SpriteMaterial;
      mb.map = null;
      mb.dispose();
      this.tableGroup.remove(this.ballInHandHintSprite);
      this.ballInHandHintSprite = null;
    }
    if (this.cueHandHintSprite) {
      const m = this.cueHandHintSprite.material as THREE.SpriteMaterial;
      m.dispose();
      this.cueGroup.remove(this.cueHandHintSprite);
      this.cueHandHintSprite = null;
    }
    if (this.cueHandHintTexture) {
      this.cueHandHintTexture.dispose();
      this.cueHandHintTexture = null;
    }
    if (this.floorMesh) {
      this.floorMesh.geometry.dispose();
      const m = this.floorMesh.material;
      if (!Array.isArray(m)) m.dispose();
      else m.forEach((x) => x.dispose());
      this.scene.remove(this.floorMesh);
      this.floorMesh = null;
    }
    if (this.floorTexture) {
      this.floorTexture.dispose();
      this.floorTexture = null;
    }
    this.renderer.dispose();
    this.ballGeo.dispose();
  }

  private resolveAssetUrl(browserUrl: string): string {
    return resolveBrowserAssetUrl(this.assetBaseUrl, browserUrl);
  }

  /** `public/textures/floor/floor.jpg` — masanın altında geniş zemin. */
  private async loadFloorUnderTable(): Promise<void> {
    if (this.floorMesh) return;
    const url = this.resolveAssetUrl('textures/floor/floor.jpg');
    const loader = new THREE.TextureLoader();
    let tex: THREE.Texture;
    try {
      tex = await loader.loadAsync(url);
    } catch {
      console.warn('[ThreeSceneAdapter] Floor texture missing:', url);
      return;
    }
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3.4, 3.4);
    tex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    this.floorTexture = tex;

    const t = this.physicsTable;
    const span = Math.max(t.width, t.height) * FLOOR_EXTEND_MUL;
    const geom = new THREE.PlaneGeometry(span, span);
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      color: 0xffffff,
      roughness: 0.93,
      metalness: 0.02,
    });
    const floor = new THREE.Mesh(geom, mat);
    floor.name = 'env.floor';
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, FLOOR_PLANE_WORLD_Y, 0);
    floor.receiveShadow = true;
    this.floorMesh = floor;
    this.scene.add(floor);
  }

  private async tryLoadTextureUrl(fullUrl: string): Promise<THREE.Texture | null> {
    const loader = new THREE.TextureLoader();
    try {
      const tex = await loader.loadAsync(fullUrl);
      configureBallDiffuseMap(tex);
      return tex;
    } catch {
      return null;
    }
  }

  /** Manifest path plus .jpg/.jpeg/.png; if path uses `textures/balls/`, also tries `textures/`. */
  private async loadBallDiffuseFromManifestKey(manifestKey: string): Promise<THREE.Texture | null> {
    const entry = AssetManifest[manifestKey as keyof typeof AssetManifest];
    if (!entry || entry.kind !== 'texture') return null;
    const stem = entry.browserUrl.replace(/\.(jpe?g|png)$/i, '');
    const exts = ['jpg', 'jpeg', 'png'] as const;
    const relPaths: string[] = [];
    for (const ext of exts) {
      relPaths.push(`${stem}.${ext}`);
    }
    if (stem.includes('/balls/')) {
      const altStem = stem.replace('/balls/', '/');
      for (const ext of exts) {
        relPaths.push(`${altStem}.${ext}`);
      }
    }
    for (const rel of relPaths) {
      const t = await this.tryLoadTextureUrl(this.resolveAssetUrl(rel));
      if (t) return t;
    }
    return null;
  }

  private async loadCueHandHintTexture(): Promise<void> {
    if (this.cueHandHintTexture) return;
    const href = new URL('../ui/hand-cursor-tap.png', import.meta.url).href;
    const loader = new THREE.TextureLoader();
    try {
      const tex = await loader.loadAsync(href);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.generateMipmaps = false;
      this.cueHandHintTexture = tex;
      this.attachCueHandHintSprite();
      this.attachBallInHandHandHintSprite();
    } catch {
      /* asset optional */
    }
  }

  private attachCueHandHintSprite(): void {
    if (!this.cueHandHintTexture || this.cueHandHintSprite) return;
    const mat = new THREE.SpriteMaterial({
      map: this.cueHandHintTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      alphaTest: 0.01,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.name = 'cueHandHint';
    sprite.renderOrder = 50;
    sprite.scale.set(70, 70, 1);
    sprite.center.set(0.52, 0.42);
    sprite.rotation.z = 0.85;
    sprite.visible = false;
    this.cueGroup.add(sprite);
    this.cueHandHintSprite = sprite;
  }

  private attachBallInHandHandHintSprite(): void {
    if (!this.cueHandHintTexture || this.ballInHandHintSprite) return;
    const mat = new THREE.SpriteMaterial({
      map: this.cueHandHintTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      alphaTest: 0.01,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.name = 'ballInHandHint';
    sprite.renderOrder = 55;
    sprite.scale.set(64, 64, 1);
    sprite.center.set(0.5, 0.8);
    sprite.rotation.z = 0;
    sprite.visible = false;
    this.tableGroup.add(sprite);
    this.ballInHandHintSprite = sprite;
  }

  private async loadBallDiffuseTextures(): Promise<void> {
    for (const t of this.ballDiffuseByNumber.values()) {
      t.dispose();
    }
    this.ballDiffuseByNumber.clear();

    await Promise.all(
      Array.from({ length: 15 }, (_, i) => {
        const n = i + 1;
        return (async () => {
          const tex = await this.loadBallDiffuseFromManifestKey(AssetIds.texBall(n));
          if (tex) this.ballDiffuseByNumber.set(n, tex);
        })();
      }),
    );

    const cueTex =
      (await this.loadBallDiffuseFromManifestKey(AssetIds.texBallCue)) ??
      (await this.loadBallDiffuseFromManifestKey(AssetIds.texBallZeroFallback));
    if (cueTex) this.ballDiffuseByNumber.set(0, cueTex);
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  /** Canvas pixels → physics table plane coordinates. */
  screenToTable(sx: number, sy: number, state: RenderWorldState): { x: number; y: number } {
    const w = this.canvas.width;
    const h = this.canvas.height;
    this.applyCamera(state.camera);
    this.ndc.set((sx / w) * 2 - 1, -(sy / h) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hit = this.raycaster.ray.intersectPlane(this.plane, this.hit);
    const tw = state.tableSpace.width;
    const th = state.tableSpace.height;
    if (hit == null) {
      return { x: tw * 0.5, y: th * 0.5 };
    }
    return { x: this.hit.x + tw / 2, y: this.hit.z + th / 2 };
  }

  render(state: RenderWorldState, dtSec: number, hints: RenderRuntimeHints): void {
    const dt = Math.max(0, Math.min(0.08, dtSec));
    if (state.ambientColorHex) {
      this.scene.background = new THREE.Color(state.ambientColorHex);
    }
    this.tableGroup.visible = !hints.debugHideTableMesh;
    this.applyCueStyle(state.activeCueId ?? state.opponentCueId);
    this.applyCamera(state.camera);
    this.syncWorldObjects(state.objects, dt);
    this.syncPolylines(state.polylines);
    this.updateCueHandHint(state, dt);
    this.updateBallInHandHandHint(state, dt);
    this.updateTungIdleMixers(dt);
    this.renderer.render(this.scene, this.camera);
  }

  /** El ikonu: topa bakan uca yakın, local Y ile hafif çek–it hareketi (+Y = top yönü). */
  private updateCueHandHint(state: RenderWorldState, dtSec: number): void {
    const sprite = this.cueHandHintSprite;
    if (!sprite) return;
    const on =
      state.cuePullHandHint === true && this.cueGroup.visible && state.cueBallInHandCursorHint !== true;
    sprite.visible = on;
    if (!on) return;
    this.cueHandHintPhase += dtSec * 4.8;
    const amp = 10;
    /** +Y top/ucu; değeri düşürmek ikonu uçtan kavrama doğru uzaklaştırır. */
    const baseY = 58;
    const sideX = 12;
    sprite.position.set(sideX, baseY - Math.sin(this.cueHandHintPhase) * amp, 0);
  }

  private updateBallInHandHandHint(state: RenderWorldState, dtSec: number): void {
    const sprite = this.ballInHandHintSprite;
    if (!sprite) return;
    const on = state.cueBallInHandCursorHint === true;
    sprite.visible = on;
    if (!on) return;
    let bx = 0;
    let by = 0;
    let bz = 0;
    let found = false;
    for (const o of state.objects) {
      if (o.templateId === AssetIds.ballCue && o.visible) {
        const p = o.transform.position;
        bx = p.x;
        by = p.y + TABLE_SCENE_Y_LIFT + PLAYFIELD_RENDER_Y_OFFSET;
        bz = p.z;
        found = true;
        break;
      }
    }
    if (!found) {
      sprite.visible = false;
      return;
    }
    this.ballInHandHintPhase += dtSec * 5.2;
    const bob = Math.sin(this.ballInHandHintPhase) * 5;
    const w = this.physicsTable.width;
    /** +X ≈ sağ; negatif Y ofseti = ikon biraz daha aşağı. */
    sprite.position.set(bx + w * 0.036, by + w * -0.008 + bob, bz);
  }

  private applyCueStyle(cueId?: string): void {
    if (!this.cueShaft) return;
    const id = cueId && CUE_STYLE_TABLE[cueId] ? cueId : 'classic';
    if (this.cueAppliedStyleId === id) return;
    this.cueAppliedStyleId = id;
    const style = CUE_STYLE_TABLE[id]!;
    applyMatPart(this.cueShaft, style.shaft);
    applyMatPart(this.cueTip, style.tip);
    applyMatPart(this.cueFerrule, style.ferrule);
    applyMatPart(this.cueAccentRing, style.accent);
    applyMatPart(this.cueWrap, style.wrap);
    applyMatPart(this.cueButt, style.butt);
    applyMatPart(this.cueButtCap, style.buttCap);
    applyMatPart(this.cueButtRing, style.accent);
  }

  private applyCamera(cam: RenderWorldState['camera']): void {
    this.camera.fov = cam.fovDeg;
    if (cam.near != null) this.camera.near = cam.near;
    if (cam.far != null) this.camera.far = cam.far;
    this.camera.updateProjectionMatrix();
    this.camera.position.set(cam.position.x, cam.position.y, cam.position.z);
    if (cam.up) {
      this.camera.up.set(cam.up.x, cam.up.y, cam.up.z);
    } else {
      this.camera.up.set(0, 1, 0);
    }
    if (cam.target) {
      this.camera.lookAt(cam.target.x, cam.target.y, cam.target.z);
    } else if (cam.rotation) {
      this.camera.quaternion.set(cam.rotation.x, cam.rotation.y, cam.rotation.z, cam.rotation.w);
    }
  }

  private syncWorldObjects(objects: readonly WorldObjectState[], dtSec: number): void {
    const seen = new Set<string>();
    for (const o of objects) {
      seen.add(o.objectId);
      let obj = this.objectById.get(o.objectId);
      if (!obj) {
        const created = this.createWorldObject(o);
        if (created) {
          obj = created;
          this.objectById.set(o.objectId, obj);
          if (obj.parent == null) {
            this.scene.add(obj);
          }
        }
      }
      if (!obj) continue;
      obj.visible = o.visible;
      this.applyTransform(obj, o);
      // `instanceof THREE.Mesh` can fail if multiple three bundles exist; `type` is reliable.
      if (o.objectId.startsWith('ball.') && (obj as THREE.Object3D).type === 'Mesh') {
        this.applyBallRollVisual(obj as THREE.Mesh, o, dtSec);
      }
    }
    for (const [id, obj] of this.objectById) {
      if (!seen.has(id)) {
        this.ballRollQuat.delete(id);
        this.ballLastPos.delete(id);
        this.scene.remove(obj);
        this.objectById.delete(id);
        this.disposeObject(obj);
      }
    }
  }

  /** ω ∝ ŷ × v on table plane; uses real render dt so spin is visible. */
  private applyBallRollVisual(mesh: THREE.Mesh, o: WorldObjectState, dtSec: number): void {
    const id = o.objectId;
    const p = o.transform.position;
    const py = p.y + TABLE_SCENE_Y_LIFT + PLAYFIELD_RENDER_Y_OFFSET;
    const wx = p.x;
    const wy = py;
    const wz = p.z;

    let last = this.ballLastPos.get(id);
    if (!last) {
      last = new THREE.Vector3();
      this.ballLastPos.set(id, last);
    } else {
      const dx = wx - last.x;
      const dy = wy - last.y;
      const dz = wz - last.z;
      if (dx * dx + dy * dy + dz * dz > 55 * 55) {
        const rq = this.ballRollQuat.get(id) ?? new THREE.Quaternion();
        rq.identity();
        this.ballRollQuat.set(id, rq);
      }
    }
    last.set(wx, wy, wz);

    let rq = this.ballRollQuat.get(id);
    if (!rq) {
      rq = new THREE.Quaternion();
      this.ballRollQuat.set(id, rq);
    }

    const tv = o.tableVelocity;
    const sp = tv ? Math.hypot(tv.x, tv.y) : 0;
    if (o.visible && tv && sp > 1e-3 && dtSec > 0) {
      const vx = tv.x;
      const vz = tv.y;
      this.tmpRollAxis.set(vz, 0, -vx).normalize();
      const r = Math.max(o.transform.scale.x, 1e-4);
      const angle = (sp / r) * dtSec * 1.25;
      this.tmpRollDelta.setFromAxisAngle(this.tmpRollAxis, angle);
      rq.premultiply(this.tmpRollDelta);
    }
    mesh.quaternion.copy(rq);
  }

  private createWorldObject(o: WorldObjectState): THREE.Object3D | null {
    if (o.templateId === AssetIds.cueStick) {
      this.cueGroup.visible = true;
      return this.cueGroup;
    }
    if (o.templateId === AssetIds.opponentTungPlaceholder) {
      const root = new THREE.Group();
      this.loadTungBackdropBrickWall(root);
      this.loadTungIdleFbxInto(root);
      return root;
    }
    const ball = parseBallTemplate(o.templateId);
    if (ball) {
      const diffuse = this.ballDiffuseByNumber.get(ball.num);
      const mat = makeBallMaterial(ball.kind, ball.num, diffuse);
      const mesh = new THREE.Mesh(this.ballGeo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    }
    return null;
  }

  private applyTransform(obj: THREE.Object3D, o: WorldObjectState): void {
    const { position: p, rotation: r, scale: s } = o.transform;
    obj.position.set(p.x, p.y + TABLE_SCENE_Y_LIFT + PLAYFIELD_RENDER_Y_OFFSET, p.z);
    if (!o.objectId.startsWith('ball.')) {
      obj.quaternion.set(r.x, r.y, r.z, r.w);
    }
    obj.scale.set(s.x, s.y, s.z);
  }

  private updateTungIdleMixers(dtSec: number): void {
    for (const obj of this.objectById.values()) {
      const mixer = obj.userData.tungIdleMixer as THREE.AnimationMixer | undefined;
      if (mixer) mixer.update(dtSec);
    }
  }

  private disposeObject(obj: THREE.Object3D): void {
    if (obj === this.cueGroup) return;
    const mixer = obj.userData.tungIdleMixer as THREE.AnimationMixer | undefined;
    const mixerRoot = obj.userData.tungIdleRoot as THREE.Object3D | undefined;
    if (mixer) {
      mixer.stopAllAction();
      if (mixerRoot) mixer.uncacheRoot(mixerRoot);
      obj.userData.tungIdleMixer = undefined;
      obj.userData.tungIdleRoot = undefined;
    }
    obj.userData.tungWallState = undefined;
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const m = child.material;
        if (!Array.isArray(m)) m.dispose?.();
        else m.forEach((x) => x.dispose?.());
        if (child.geometry && child.geometry !== this.ballGeo) {
          child.geometry.dispose();
        }
      }
    });
  }

  /** `public/textures/wall/cartoon-brick.png` — Tung’un arkasında dikey duvar (container local −Z). */
  private loadTungBackdropBrickWall(container: THREE.Group): void {
    if (container.userData.tungWallState === 'loading' || container.userData.tungWallState === 'done') return;
    container.userData.tungWallState = 'loading';
    const url = this.resolveAssetUrl('textures/wall/cartoon-brick.png');
    const loader = new THREE.TextureLoader();
    void loader
      .loadAsync(url)
      .then((tex) => {
        if (container.userData.tungWallState !== 'loading') {
          tex.dispose();
          return;
        }
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(TUNG_BACK_WALL_TEX_REPEAT_X, TUNG_BACK_WALL_TEX_REPEAT_Y);
        tex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = true;

        const wallH = OPPONENT_TUNG_MODEL_TARGET_HEIGHT * TUNG_BACK_WALL_HEIGHT_MODEL_MUL;
        const wallW = this.physicsTable.width * TUNG_BACK_WALL_WIDTH_TABLE_MUL;
        const geom = new THREE.PlaneGeometry(wallW, wallH);
        const mat = new THREE.MeshStandardMaterial({
          map: tex,
          color: 0xffffff,
          roughness: 0.94,
          metalness: 0.02,
          side: THREE.DoubleSide,
        });
        const wall = new THREE.Mesh(geom, mat);
        wall.name = 'env.tungBackdropBrick';
        wall.position.set(0, wallH * 0.5 - TUNG_BACK_WALL_Y_PULL_DOWN, TUNG_BACK_WALL_LOCAL_Z);
        wall.receiveShadow = true;
        wall.castShadow = false;
        container.add(wall);
        container.userData.tungWallState = 'done';
      })
      .catch((err: unknown) => {
        console.warn('[ThreeSceneAdapter] Tung brick wall texture failed:', url, err);
        container.userData.tungWallState = 'error';
      });
  }

  /** `Tung_Idle.fbx` — ölçek + pivot ayaklar container orijininde, felt üzerinde hizalanır. */
  private loadTungIdleFbxInto(container: THREE.Group): void {
    if (container.userData.tungLoadState === 'loading' || container.userData.tungLoadState === 'done') return;
    container.userData.tungLoadState = 'loading';
    const href = new URL('../opponents/tung/model/Tung_Idle.fbx', import.meta.url).href;
    const loader = new FBXLoader();
    loader.load(
      href,
      (fbx) => {
        fbx.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });
        fbx.updateMatrixWorld(true);
        const box0 = new THREE.Box3().setFromObject(fbx);
        const size = box0.getSize(new THREE.Vector3());
        const sy = OPPONENT_TUNG_MODEL_TARGET_HEIGHT / Math.max(size.y, 1e-4);
        fbx.scale.setScalar(sy);
        fbx.updateMatrixWorld(true);
        let box2 = new THREE.Box3().setFromObject(fbx);
        fbx.position.y = -box2.min.y;
        fbx.updateMatrixWorld(true);
        box2 = new THREE.Box3().setFromObject(fbx);
        const c = box2.getCenter(new THREE.Vector3());
        fbx.position.x -= c.x;
        fbx.position.z -= c.z;
        container.add(fbx);
        if (fbx.animations.length > 0) {
          const mixer = new THREE.AnimationMixer(fbx);
          const action = mixer.clipAction(fbx.animations[0]!);
          action.setLoop(THREE.LoopRepeat, Infinity);
          action.play();
          container.userData.tungIdleMixer = mixer;
          container.userData.tungIdleRoot = fbx;
        }
        container.userData.tungLoadState = 'done';
      },
      undefined,
      (err) => {
        console.warn('[ThreeSceneAdapter] Tung_Idle.fbx load failed:', err);
        container.userData.tungLoadState = 'error';
      },
    );
  }

  private syncPolylines(lines: readonly PolylineObjectState[]): void {
    const seen = new Set<string>();
    for (const line of lines) {
      if (line.points.length < 2) continue;
      seen.add(line.objectId);
      let ln = this.polylineById.get(line.objectId);
      if (!ln) {
        ln = this.makePolyline(line);
        this.polylineById.set(line.objectId, ln);
        this.scene.add(ln);
      }
      ln.visible = line.visible;
      let g = ln.geometry as THREE.BufferGeometry;
      let attr = g.getAttribute('position') as THREE.BufferAttribute;
      let arr = attr.array as Float32Array;
      if (arr.length !== line.points.length * 3) {
        this.scene.remove(ln);
        ln.geometry.dispose();
        (ln.material as THREE.Material).dispose();
        ln = this.makePolyline(line);
        this.polylineById.set(line.objectId, ln);
        this.scene.add(ln);
        g = ln.geometry as THREE.BufferGeometry;
        attr = g.getAttribute('position') as THREE.BufferAttribute;
        arr = attr.array as Float32Array;
      }
      let i = 0;
      for (const p of line.points) {
        arr[i++] = p.x;
        arr[i++] = p.y + TABLE_SCENE_Y_LIFT + PLAYFIELD_RENDER_Y_OFFSET;
        arr[i++] = p.z;
      }
      attr.needsUpdate = true;
      g.setDrawRange(0, line.points.length);
      const mat = ln.material as THREE.LineBasicMaterial;
      mat.color.set(line.colorHex);
      mat.opacity = line.opacity;
    }
    for (const [id, ln] of this.polylineById) {
      if (!seen.has(id)) {
        this.scene.remove(ln);
        ln.geometry.dispose();
        (ln.material as THREE.Material).dispose();
        this.polylineById.delete(id);
      }
    }
  }

  private makePolyline(line: PolylineObjectState): THREE.Line {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(line.points.length * 3);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.LineBasicMaterial({
      color: new THREE.Color(line.colorHex),
      transparent: true,
      opacity: line.opacity,
      depthWrite: false,
    });
    return new THREE.Line(g, mat);
  }

  private buildLights(): void {
    const t = this.physicsTable;
    const span = Math.max(t.width, t.height) * 0.42 + 48;
    const amb = new THREE.AmbientLight(0xffffff, 0.16);
    this.scene.add(amb);
    const hemi = new THREE.HemisphereLight(0xc8e2ff, 0x4a3828, 0.24);
    this.scene.add(hemi);
    const rightKey = new THREE.DirectionalLight(0xfff3e2, 0.52);
    rightKey.position.set(260, 500, 80);
    rightKey.castShadow = true;
    rightKey.shadow.mapSize.set(2048, 2048);
    rightKey.shadow.bias = -0.00015;
    rightKey.shadow.normalBias = 0.028;
    rightKey.shadow.camera.near = 80;
    rightKey.shadow.camera.far = 1400;
    rightKey.shadow.camera.left = -span;
    rightKey.shadow.camera.right = span;
    rightKey.shadow.camera.top = span;
    rightKey.shadow.camera.bottom = -span;
    this.scene.add(rightKey);

    const leftKey = new THREE.DirectionalLight(0xd3e6ff, 0.62);
    leftKey.position.set(-320, 520, 120);
    leftKey.castShadow = true;
    leftKey.shadow.mapSize.set(2048, 2048);
    leftKey.shadow.bias = -0.00015;
    leftKey.shadow.normalBias = 0.028;
    leftKey.shadow.camera.near = 80;
    leftKey.shadow.camera.far = 1400;
    leftKey.shadow.camera.left = -span;
    leftKey.shadow.camera.right = span;
    leftKey.shadow.camera.top = span;
    leftKey.shadow.camera.bottom = -span;
    this.scene.add(leftKey);
  }

  private buildTableFromManifest(): void {
    this.addTableLoadingBackdrop();
    const entry = AssetManifest['env.tableMesh'];
    const loader = new GLTFLoader();
    loader.load(
      this.resolveAssetUrl(entry.browserUrl),
      (gltf) => {
        this.tableGroup.clear();
        this.fitTableModelToPhysics(gltf.scene);
      },
      undefined,
      () => {
        console.warn('[ThreeSceneAdapter] Table.glb failed; procedural table.');
        this.tableGroup.clear();
        this.buildProceduralTable();
      },
    );
  }

  private addTableLoadingBackdrop(): void {
    const t = this.physicsTable;
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(t.width, t.height),
      new THREE.MeshBasicMaterial({ color: 0x0a1812 }),
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -0.5;
    plane.receiveShadow = true;
    this.tableGroup.add(plane);
  }

  private fitTableModelToPhysics(model: THREE.Object3D): void {
    const t = this.physicsTable;
    const tw = t.width;
    const th = t.height;
    const root = new THREE.Group();
    root.add(model);
    model.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    if (size.x < 1e-4 || size.z < 1e-4) {
      this.buildProceduralTable();
      return;
    }
    const sx = tw / size.x;
    const sz = th / size.z;
    const horizMin = Math.min(size.x, size.z);
    const syBase = size.y < 1e-5 ? Math.min(sx, sz) : Math.min(sx, sz) * (size.y / horizMin);
    const sy = syBase * TABLE_MESH_Y_THICKNESS_MUL;
    root.scale.set(sx, sy, sz);
    root.updateMatrixWorld(true);
    const box2 = new THREE.Box3().setFromObject(root);
    root.position.set(-(box2.min.x + box2.max.x) * 0.5, -box2.max.y, -(box2.min.z + box2.max.z) * 0.5);
    this.tableGroup.position.y = TABLE_SCENE_Y_LIFT + TABLE_GROUP_Y_VISUAL_OFFSET;
    this.tableGroup.add(root);
  }

  private buildProceduralTable(): void {
    const t = this.physicsTable;
    const tw = t.width;
    const th = t.height;
    const feltTex = createFeltTexture();
    feltTex.anisotropy = 8;
    const felt = new THREE.Mesh(
      new THREE.PlaneGeometry(tw, th),
      new THREE.MeshPhysicalMaterial({
        map: feltTex,
        color: 0x0d6b4d,
        roughness: 0.78,
        metalness: 0,
        sheen: 0.55,
        sheenRoughness: 0.62,
        sheenColor: new THREE.Color(0x1a8a5a),
        clearcoat: 0.04,
        clearcoatRoughness: 0.9,
      }),
    );
    felt.rotation.x = -Math.PI / 2;
    felt.receiveShadow = true;
    this.tableGroup.position.y = TABLE_SCENE_Y_LIFT + TABLE_GROUP_Y_VISUAL_OFFSET;
    this.tableGroup.add(felt);

    const railRubber = new THREE.MeshStandardMaterial({
      color: 0x121a24,
      roughness: 0.78,
      metalness: 0.04,
    });
    const railWood = new THREE.MeshStandardMaterial({
      color: 0x3d2818,
      roughness: 0.72,
      metalness: 0.06,
    });

    for (const seg of t.cushions) {
      if (seg.role === 'pocketOuter' || seg.role === 'pocketBridge') continue;
      const ax = seg.ax - tw / 2;
      const az = seg.ay - th / 2;
      const bx = seg.bx - tw / 2;
      const bz = seg.by - th / 2;
      const dx = bx - ax;
      const dz = bz - az;
      const len = Math.hypot(dx, dz) || 1;
      const midX = (ax + bx) * 0.5;
      const midZ = (az + bz) * 0.5;
      const dir = new THREE.Vector3(dx / len, 0, dz / len);
      const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
      const rubber = new THREE.Mesh(new THREE.BoxGeometry(len, 11, 20.5), railRubber);
      rubber.position.set(midX, 5.5, midZ);
      rubber.quaternion.copy(quat);
      rubber.castShadow = true;
      rubber.receiveShadow = true;
      this.tableGroup.add(rubber);
      const wood = new THREE.Mesh(new THREE.BoxGeometry(len, 5.2, 23.2), railWood);
      wood.position.set(midX, 12.2, midZ);
      wood.quaternion.copy(quat);
      wood.castShadow = true;
      wood.receiveShadow = true;
      this.tableGroup.add(wood);
    }

    const pocketMat = new THREE.MeshStandardMaterial({ color: 0x020304, roughness: 1, metalness: 0 });
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x0a0c10,
      roughness: 0.88,
      metalness: 0.12,
    });
    for (const p of t.pockets) {
      const px = p.pos.x - tw / 2;
      const pz = p.pos.y - th / 2;
      const pr = p.radius;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(pr * 0.96, 1.6, 10, 40), ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(px, 0.85, pz);
      ring.castShadow = true;
      ring.receiveShadow = true;
      this.tableGroup.add(ring);
      const hole = new THREE.Mesh(new THREE.CylinderGeometry(pr * 0.9, pr * 0.82, 32, 28), pocketMat);
      hole.rotation.x = Math.PI / 2;
      hole.position.set(px, -12, pz);
      this.tableGroup.add(hole);
    }
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(tw + 56, 24, th + 56),
      new THREE.MeshStandardMaterial({
        color: 0x140e0a,
        roughness: 0.86,
        metalness: 0.04,
      }),
    );
    frame.position.set(0, -18, 0);
    frame.receiveShadow = true;
    frame.castShadow = true;
    this.tableGroup.add(frame);
    this.tableGroup.position.y = TABLE_SCENE_Y_LIFT;
  }

  private buildCueStick(): void {
    /**
     * Cue local axes: +Y points toward the cue ball (tip side), -Y is the butt.
     * Total visual length stays ~292 (matches old cue) so aim/stroke geometry is unchanged.
     */
    const shaftLen = 292;
    const shaftTopY = shaftLen * 0.5;
    const shaftBotY = -shaftLen * 0.5;
    const shaftTopR = 3.2;
    const shaftBotR = 3.9;

    this.cueShaft = new THREE.Mesh(
      new THREE.CylinderGeometry(shaftTopR, shaftBotR, shaftLen, 18, 1),
      new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.48, metalness: 0.14 }),
    );
    this.cueShaft.castShadow = true;
    this.cueGroup.add(this.cueShaft);

    const ferruleH = 6;
    this.cueFerrule = new THREE.Mesh(
      new THREE.CylinderGeometry(shaftTopR + 0.05, shaftTopR + 0.1, ferruleH, 16, 1),
      new THREE.MeshStandardMaterial({ color: 0xf3ece0, roughness: 0.55, metalness: 0.05 }),
    );
    this.cueFerrule.position.y = shaftTopY + ferruleH * 0.5;
    this.cueFerrule.castShadow = true;
    this.cueGroup.add(this.cueFerrule);

    const tipH = 14;
    this.cueTip = new THREE.Mesh(
      new THREE.CylinderGeometry(shaftTopR - 0.05, shaftTopR + 0.1, tipH, 16, 1),
      new THREE.MeshStandardMaterial({ color: 0x4d6fa8, roughness: 0.7, metalness: 0.05 }),
    );
    this.cueTip.position.y = shaftTopY + ferruleH + tipH * 0.5;
    this.cueTip.castShadow = true;
    this.cueGroup.add(this.cueTip);

    /** Decorative ring where the forearm meets the wrap (accent color). */
    const accentRingH = 3.4;
    const accentRingR = shaftBotR + 0.55;
    this.cueAccentRing = new THREE.Mesh(
      new THREE.CylinderGeometry(accentRingR, accentRingR, accentRingH, 22, 1),
      new THREE.MeshStandardMaterial({ color: 0xf2c542, roughness: 0.32, metalness: 0.55 }),
    );
    this.cueAccentRing.position.y = shaftBotY + 38;
    this.cueAccentRing.castShadow = true;
    this.cueGroup.add(this.cueAccentRing);

    /** Wrap (grip) — slightly thicker than shaft, sits below the accent ring. */
    const wrapLen = 56;
    const wrapR = shaftBotR + 0.35;
    this.cueWrap = new THREE.Mesh(
      new THREE.CylinderGeometry(wrapR, wrapR, wrapLen, 22, 1),
      new THREE.MeshStandardMaterial({ color: 0x1d150e, roughness: 0.92, metalness: 0.04 }),
    );
    this.cueWrap.position.y = shaftBotY + 38 - accentRingH * 0.5 - wrapLen * 0.5;
    this.cueWrap.castShadow = true;
    this.cueGroup.add(this.cueWrap);

    /** Butt sleeve — bottom 36 units, slightly wider, sits below the wrap. */
    const buttLen = 36;
    const buttRtop = shaftBotR + 0.15;
    const buttRbot = shaftBotR + 0.6;
    const buttTopY = this.cueWrap.position.y - wrapLen * 0.5;
    this.cueButt = new THREE.Mesh(
      new THREE.CylinderGeometry(buttRtop, buttRbot, buttLen, 22, 1),
      new THREE.MeshStandardMaterial({ color: 0x3a2614, roughness: 0.55, metalness: 0.18 }),
    );
    this.cueButt.position.y = buttTopY - buttLen * 0.5;
    this.cueButt.castShadow = true;
    this.cueGroup.add(this.cueButt);

    /** Thin accent ring at the bottom of the butt (decorative inlay). */
    const buttRingH = 2.4;
    this.cueButtRing = new THREE.Mesh(
      new THREE.CylinderGeometry(buttRbot + 0.2, buttRbot + 0.2, buttRingH, 22, 1),
      new THREE.MeshStandardMaterial({ color: 0xf2c542, roughness: 0.32, metalness: 0.55 }),
    );
    this.cueButtRing.position.y = this.cueButt.position.y - buttLen * 0.5 - buttRingH * 0.5;
    this.cueButtRing.castShadow = true;
    this.cueGroup.add(this.cueButtRing);

    /** Rounded butt cap (rubber bumper). */
    const buttCapR = buttRbot + 0.1;
    this.cueButtCap = new THREE.Mesh(
      new THREE.SphereGeometry(buttCapR, 18, 12, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5),
      new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.78, metalness: 0.08 }),
    );
    this.cueButtCap.position.y = this.cueButtRing.position.y - buttRingH * 0.5;
    this.cueButtCap.castShadow = true;
    this.cueGroup.add(this.cueButtCap);

    this.attachCueHandHintSprite();
    this.cueGroup.visible = false;
    this.applyCueStyle('classic');
  }
}

type CueMatPart = {
  color: number;
  roughness?: number;
  metalness?: number;
  emissive?: number;
  emissiveIntensity?: number;
};

type CueStyle = {
  shaft: CueMatPart;
  tip: CueMatPart;
  ferrule: CueMatPart;
  accent: CueMatPart;
  wrap: CueMatPart;
  butt: CueMatPart;
  buttCap: CueMatPart;
};

/**
 * Per-cue visual style. Keys MUST match `SHOP_CUE_CATALOG` ids in `core/ShopCatalog.ts`
 * so equipping a cue in the shop swaps the in-game stick instantly.
 */
const CUE_STYLE_TABLE: Record<string, CueStyle> = {
  classic: {
    shaft: { color: 0x8b5a2b, roughness: 0.55, metalness: 0.08 },
    tip: { color: 0x4d6fa8, roughness: 0.7, metalness: 0.05 },
    ferrule: { color: 0xf3ece0, roughness: 0.55, metalness: 0.05 },
    accent: { color: 0xf2c542, roughness: 0.32, metalness: 0.55 },
    wrap: { color: 0x1d150e, roughness: 0.92, metalness: 0.04 },
    butt: { color: 0x3a2614, roughness: 0.55, metalness: 0.18 },
    buttCap: { color: 0x141414, roughness: 0.78, metalness: 0.08 },
  },
  street: {
    shaft: { color: 0xc8a273, roughness: 0.5, metalness: 0.1 },
    tip: { color: 0x4d6fa8, roughness: 0.7, metalness: 0.05 },
    ferrule: { color: 0xf3ece0, roughness: 0.55, metalness: 0.05 },
    accent: { color: 0xc08750, roughness: 0.4, metalness: 0.45 },
    wrap: { color: 0x4a3a2a, roughness: 0.88, metalness: 0.05 },
    butt: { color: 0x6b4423, roughness: 0.5, metalness: 0.16 },
    buttCap: { color: 0x141414, roughness: 0.78, metalness: 0.08 },
  },
  pro: {
    shaft: { color: 0xe8efe9, roughness: 0.34, metalness: 0.22 },
    tip: { color: 0x3f6a98, roughness: 0.68, metalness: 0.08 },
    ferrule: { color: 0xfafafa, roughness: 0.4, metalness: 0.18 },
    accent: {
      color: 0x5cf0c2,
      roughness: 0.28,
      metalness: 0.55,
      emissive: 0x1f6f5b,
      emissiveIntensity: 0.35,
    },
    wrap: { color: 0x223533, roughness: 0.7, metalness: 0.18 },
    butt: { color: 0x2c4d44, roughness: 0.4, metalness: 0.34 },
    buttCap: { color: 0x0d1614, roughness: 0.6, metalness: 0.18 },
  },
  neon: {
    shaft: {
      color: 0xff6f91,
      roughness: 0.32,
      metalness: 0.22,
      emissive: 0xff2e6a,
      emissiveIntensity: 0.45,
    },
    tip: { color: 0x3a2230, roughness: 0.7, metalness: 0.08 },
    ferrule: { color: 0xfff2f7, roughness: 0.4, metalness: 0.2 },
    accent: {
      color: 0xff9ec5,
      roughness: 0.22,
      metalness: 0.55,
      emissive: 0xff3d72,
      emissiveIntensity: 0.95,
    },
    wrap: { color: 0x1a0e16, roughness: 0.6, metalness: 0.2 },
    butt: {
      color: 0xff3d72,
      roughness: 0.34,
      metalness: 0.28,
      emissive: 0xff1858,
      emissiveIntensity: 0.45,
    },
    buttCap: { color: 0x0a0408, roughness: 0.55, metalness: 0.22 },
  },
  carbon: {
    shaft: { color: 0x1c2230, roughness: 0.26, metalness: 0.78 },
    tip: { color: 0x4d6fa8, roughness: 0.7, metalness: 0.05 },
    ferrule: { color: 0xc9d3e1, roughness: 0.32, metalness: 0.6 },
    accent: {
      color: 0x66b6ff,
      roughness: 0.24,
      metalness: 0.7,
      emissive: 0x1f6fbf,
      emissiveIntensity: 0.55,
    },
    wrap: { color: 0x0d1018, roughness: 0.5, metalness: 0.55 },
    butt: { color: 0x2a2f40, roughness: 0.3, metalness: 0.74 },
    buttCap: { color: 0x05070c, roughness: 0.4, metalness: 0.6 },
  },
  legend: {
    shaft: { color: 0xe7c46b, roughness: 0.34, metalness: 0.62 },
    tip: { color: 0x4d6fa8, roughness: 0.7, metalness: 0.05 },
    ferrule: { color: 0xfff5d6, roughness: 0.36, metalness: 0.5 },
    accent: {
      color: 0xfff0a3,
      roughness: 0.22,
      metalness: 0.85,
      emissive: 0xb98a18,
      emissiveIntensity: 0.5,
    },
    wrap: { color: 0x2c1f0a, roughness: 0.7, metalness: 0.32 },
    butt: { color: 0x8a6328, roughness: 0.36, metalness: 0.65 },
    buttCap: { color: 0x1a1208, roughness: 0.55, metalness: 0.4 },
  },
};

function applyMatPart(mesh: THREE.Mesh | undefined, part: CueMatPart): void {
  if (!mesh) return;
  const mat = mesh.material as THREE.MeshStandardMaterial;
  if (mat.color.getHex() !== part.color) {
    mat.color.setHex(part.color);
  }
  if (part.roughness != null) mat.roughness = part.roughness;
  if (part.metalness != null) mat.metalness = part.metalness;
  /** Drop emissive cleanly when the new style omits it (e.g. neon → classic). */
  if (part.emissive != null) {
    mat.emissive.setHex(part.emissive);
    mat.emissiveIntensity = part.emissiveIntensity ?? 1;
  } else {
    mat.emissive.setHex(0x000000);
    mat.emissiveIntensity = 0;
  }
  mat.needsUpdate = true;
}

function configureBallDiffuseMap(tex: THREE.Texture): void {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
}

function parseBallTemplate(templateId: string): { kind: BallKind; num: number } | null {
  if (templateId === AssetIds.ballCue) return { kind: 'cue', num: 0 };
  if (templateId === AssetIds.ballEight) return { kind: 'eight', num: 8 };
  const solid = templateId.match(/^ball\.solid\.(\d+)$/);
  if (solid) return { kind: 'solid', num: Number(solid[1]) };
  const stripe = templateId.match(/^ball\.stripe\.(\d+)$/);
  if (stripe) return { kind: 'stripe', num: Number(stripe[1]) };
  return null;
}

/** Object-space tint so ball rotation is visible (solids/cue/8 were visually symmetric). */
function patchBallRollShader(shader: { vertexShader: string; fragmentShader: string }): void {
  if (shader.vertexShader.includes('vRollObjPos')) return;
  shader.vertexShader = shader.vertexShader.replace(
    '#include <common>',
    `#include <common>
varying vec3 vRollObjPos;`,
  );
  shader.vertexShader = shader.vertexShader.replace(
    '#include <begin_vertex>',
    `#include <begin_vertex>
vRollObjPos = position;`,
  );
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <common>',
    `#include <common>
varying vec3 vRollObjPos;`,
  );
}

const ROLL_VISUAL_MOD = `diffuseColor.rgb *= 1.0 + 0.14 * sin( dot( vRollObjPos, vec3( 0.94, 1.09, 1.05 ) ) * 0.2 );`;

function appendRollToColorFragment(shader: { fragmentShader: string }): void {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <color_fragment>',
    `#include <color_fragment>
${ROLL_VISUAL_MOD}`,
  );
}

function createFeltTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, '#0c5c42');
  g.addColorStop(0.5, '#0e704e');
  g.addColorStop(1, '#0a523c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 9000; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const a = 0.02 + Math.random() * 0.05;
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.fillRect(x, y, 1, 1);
  }
  const cx = size * 0.5;
  const cy = size * 0.5;
  const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.72);
  rg.addColorStop(0, 'rgba(255,255,255,0.04)');
  rg.addColorStop(1, 'rgba(0,0,0,0.12)');
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3.2, 5.8);
  return tex;
}

function makeBallMaterial(
  kind: BallKind,
  num: number,
  diffuse: THREE.Texture | undefined,
): THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial {
  if (diffuse) {
    return new THREE.MeshStandardMaterial({
      map: diffuse,
      color: 0xffffff,
      roughness: 0.38,
      metalness: 0.07,
    });
  }
  if (kind === 'cue') {
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xf4f7ff,
      roughness: 0.22,
      metalness: 0.04,
      clearcoat: 0.42,
      clearcoatRoughness: 0.18,
    });
    mat.onBeforeCompile = (shader) => {
      patchBallRollShader(shader);
      appendRollToColorFragment(shader);
    };
    return mat;
  }
  if (kind === 'eight') {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x111111,
      roughness: 0.4,
      metalness: 0.18,
    });
    mat.onBeforeCompile = (shader) => {
      patchBallRollShader(shader);
      appendRollToColorFragment(shader);
    };
    return mat;
  }
  if (kind === 'solid') {
    const c = new THREE.Color(solidHex(num));
    const mat = new THREE.MeshStandardMaterial({ color: c, roughness: 0.38, metalness: 0.1 });
    mat.onBeforeCompile = (shader) => {
      patchBallRollShader(shader);
      appendRollToColorFragment(shader);
    };
    return mat;
  }
  return makeStripeBallMaterial(num);
}

function makeStripeBallMaterial(num: number): THREE.MeshStandardMaterial {
  const base = new THREE.Color(solidHex(num));
  const mat = new THREE.MeshStandardMaterial({
    color: base,
    roughness: 0.4,
    metalness: 0.08,
  });
  mat.onBeforeCompile = (shader) => {
    patchBallRollShader(shader);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
${ROLL_VISUAL_MOD}
      {
        vec3 n = normalize( vNormal );
        float pole = smoothstep( 0.38, 0.78, abs( n.y ) );
        vec3 whiteCap = vec3( 0.93, 0.93, 0.92 );
        diffuseColor.rgb = mix( diffuseColor.rgb, whiteCap, pole );
      }`,
    );
  };
  return mat;
}

function solidHex(n: number): number {
  const palette: Record<number, number> = {
    1: 0xf2c542,
    2: 0x2f6bff,
    3: 0xe23b3b,
    4: 0x6b2fd6,
    5: 0xff7a1a,
    6: 0x1f7a4a,
    7: 0x6b1f1f,
    9: 0xffd24d,
    10: 0x2f6bff,
    11: 0xe23b3b,
    12: 0x6b2fd6,
    13: 0xff7a1a,
    14: 0x1f7a4a,
    15: 0x222222,
  };
  return palette[n] ?? 0x999999;
}
