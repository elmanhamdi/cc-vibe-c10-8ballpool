import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { BallKind } from '../physics/Ball.js';
import { Table } from '../physics/Table.js';
import { AssetManifest } from '../assets/AssetManifest.js';
import { AssetIds } from '../assets/AssetIds.js';
import { resolveBrowserAssetUrl } from '../assets/resolveBrowserAssetUrl.js';
import type { RenderRuntimeHints } from '../core/gameContract.js';
import type { PolylineObjectState, RenderWorldState, WorldObjectState } from '../world/renderTypes.js';

/** `Table.glb` Y ölçeği — model ince kalıyorsa artır (fizik 2D, yalnızca görsel). */
const TABLE_MESH_Y_THICKNESS_MUL = 10.0;

/** Masa + toplar + çizgileri Y’de yukarı (world birimi); HUD altında daha merkezli görünür. */
const TABLE_SCENE_Y_LIFT = 22;

/**
 * Fizikle uyumlu oyun düzlemi: top merkezi y ≈ radius + 0.15 (varsayılan radius 9 → 9.15).
 * screen→table ışını bu yükseklikte kesilir.
 */
const TABLE_PLAY_SURFACE_LOCAL_Y = 9.15;

/** Top / isteka / aim çizgisi Y (world); − = masaya doğru. Kalınlık sabitinden bağımsız. */
const PLAYFIELD_RENDER_Y_OFFSET = -6;

const TABLE_RAY_PLANE_W = -(TABLE_SCENE_Y_LIFT + TABLE_PLAY_SURFACE_LOCAL_Y + PLAYFIELD_RENDER_Y_OFFSET);

export type ThreeSceneAdapterOptions = {
  /** Vite `import.meta.env.BASE_URL` for `public/` textures and GLB fallbacks. */
  assetBaseUrl?: string;
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
  private readonly physicsTable: Table;
  /** Top numarası → diffuse (1–15, 0 = isteka); paylaşılan `Texture` referansı. */
  private readonly ballDiffuseByNumber = new Map<number, THREE.Texture>();
  private readonly assetBaseUrl: string;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    options?: ThreeSceneAdapterOptions,
  ) {
    this.assetBaseUrl = options?.assetBaseUrl ?? '/';
    this.physicsTable = new Table();

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
  }

  dispose(): void {
    for (const t of this.ballDiffuseByNumber.values()) {
      t.dispose();
    }
    this.ballDiffuseByNumber.clear();
    this.renderer.dispose();
    this.ballGeo.dispose();
  }

  private resolveAssetUrl(browserUrl: string): string {
    return resolveBrowserAssetUrl(this.assetBaseUrl, browserUrl);
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
    this.applyCamera(state.camera);
    this.syncWorldObjects(state.objects, dt);
    this.syncPolylines(state.polylines);
    this.renderer.render(this.scene, this.camera);
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

  private disposeObject(obj: THREE.Object3D): void {
    if (obj === this.cueGroup) return;
    if (obj instanceof THREE.Mesh) {
      const m = obj.material;
      if (!Array.isArray(m)) m.dispose?.();
      else m.forEach((x) => x.dispose?.());
      if (obj.geometry && obj.geometry !== this.ballGeo) {
        obj.geometry.dispose();
      }
    }
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
    const amb = new THREE.AmbientLight(0xffffff, 0.26);
    this.scene.add(amb);
    const hemi = new THREE.HemisphereLight(0xc8e2ff, 0x4a3828, 0.42);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff5e8, 1.28);
    sun.position.set(120, 620, 180);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.00015;
    sun.shadow.normalBias = 0.028;
    sun.shadow.camera.near = 80;
    sun.shadow.camera.far = 1400;
    sun.shadow.camera.left = -span;
    sun.shadow.camera.right = span;
    sun.shadow.camera.top = span;
    sun.shadow.camera.bottom = -span;
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xa8c8f0, 0.22);
    fill.position.set(-200, 380, -120);
    this.scene.add(fill);
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
    this.tableGroup.position.y = TABLE_SCENE_Y_LIFT;
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
    const len = 292;
    this.cueShaft = new THREE.Mesh(
      new THREE.CylinderGeometry(3.2, 3.9, len, 14, 1),
      new THREE.MeshStandardMaterial({
        color: 0x6b4423,
        roughness: 0.48,
        metalness: 0.14,
      }),
    );
    this.cueShaft.castShadow = true;
    this.cueGroup.add(this.cueShaft);
    const tip = new THREE.Mesh(
      new THREE.CylinderGeometry(3.9, 3.1, 18, 12, 1),
      new THREE.MeshStandardMaterial({ color: 0xc9b08e, roughness: 0.38, metalness: 0.1 }),
    );
    tip.position.y = len * 0.5 + 8;
    tip.castShadow = true;
    this.cueGroup.add(tip);
    this.cueGroup.visible = false;
  }
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
