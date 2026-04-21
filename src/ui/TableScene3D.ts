import * as THREE from 'three';
import type { GameEngine } from '../core/GameEngine.js';
import type { BallKind } from '../physics/Ball.js';
import { computeAimPreview, type Segment2D } from '../gameplay/AimPreview.js';

/** Slight camera offset from nadir for depth (radians). */
const CAMERA_ORBIT = 0.11;

/**
 * 3D view: table in XZ plane; physics (x,y) → world (x−W/2, r, y−H/2).
 * Camera above the table with a small orbit for depth (screen “up” ≈ world −Z).
 */
export class TableScene3D {
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly raycaster = new THREE.Raycaster();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly hit = new THREE.Vector3();
  private readonly ndc = new THREE.Vector2();
  private readonly balls = new Map<number, THREE.Mesh>();
  private aimLine!: THREE.Line;
  private readonly aimPositions = new Float32Array(6);
  private readonly aimGeom = new THREE.BufferGeometry();
  private ghostObjLine!: THREE.Line;
  private ghostCueLine!: THREE.Line;
  private readonly ghostObjPos = new Float32Array(6);
  private readonly ghostCuePos = new Float32Array(6);
  private readonly ghostObjGeom = new THREE.BufferGeometry();
  private readonly ghostCueGeom = new THREE.BufferGeometry();
  private readonly ballGeo: THREE.SphereGeometry;
  private readonly tableGroup = new THREE.Group();
  private readonly cueGroup = new THREE.Group();
  private cueShaft!: THREE.Mesh;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly engine: GameEngine,
  ) {
    this.scene.background = new THREE.Color(0x0b0f14);

    this.camera = new THREE.PerspectiveCamera(24, 1, 40, 12000);
    this.placeCamera();

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
    this.buildTable();
    this.buildBalls();
    this.buildCueStick();
    this.buildAimLine();
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
    this.scene.add(this.cueGroup);
  }

  private placeCamera(): void {
    const t = this.engine.table;
    const aspect = Math.max(0.2, Math.min(3, this.camera.aspect));
    const base = Math.max(t.width, t.height);
    const dist = base * (1.95 + 0.55 * (1 / aspect - 1));
    this.camera.up.set(0, 0, -1);
    const y = dist * Math.cos(CAMERA_ORBIT);
    const z = dist * Math.sin(CAMERA_ORBIT);
    this.camera.position.set(0, y, z);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
  }

  private buildLights(): void {
    const t = this.engine.table;
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

  private buildTable(): void {
    const t = this.engine.table;
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

      const hole = new THREE.Mesh(
        new THREE.CylinderGeometry(pr * 0.9, pr * 0.82, 32, 28),
        pocketMat,
      );
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

    this.scene.add(this.tableGroup);
  }

  private buildBalls(): void {
    for (const b of this.engine.physics.balls) {
      const mat = makeBallMaterial(b.kind, b.number);
      const mesh = new THREE.Mesh(this.ballGeo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.ballId = b.id;
      this.balls.set(b.id, mesh);
      this.scene.add(mesh);
    }
  }

  private buildAimLine(): void {
    this.aimGeom.setAttribute('position', new THREE.BufferAttribute(this.aimPositions, 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    this.aimLine = new THREE.Line(this.aimGeom, mat);
    this.aimLine.visible = false;
    this.scene.add(this.aimLine);

    this.ghostObjGeom.setAttribute('position', new THREE.BufferAttribute(this.ghostObjPos, 3));
    this.ghostCueGeom.setAttribute('position', new THREE.BufferAttribute(this.ghostCuePos, 3));
    this.ghostObjLine = new THREE.Line(
      this.ghostObjGeom,
      new THREE.LineBasicMaterial({
        color: 0xffdd88,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
    );
    this.ghostCueLine = new THREE.Line(
      this.ghostCueGeom,
      new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
      }),
    );
    this.ghostObjLine.visible = false;
    this.ghostCueLine.visible = false;
    this.scene.add(this.ghostObjLine, this.ghostCueLine);
  }

  private static seg2dToWorld(seg: Segment2D, y: number, tw: number, th: number, out: Float32Array): void {
    out[0] = seg.x0 - tw / 2;
    out[1] = y;
    out[2] = seg.y0 - th / 2;
    out[3] = seg.x1 - tw / 2;
    out[4] = y;
    out[5] = seg.y1 - th / 2;
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.placeCamera();
  }

  /** Canvas pixels (backing store) → physics table coordinates (y = 0 plane). */
  screenToTable(sx: number, sy: number): { x: number; y: number } {
    const t = this.engine.table;
    const w = this.canvas.width;
    const h = this.canvas.height;
    this.ndc.set((sx / w) * 2 - 1, -(sy / h) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hit = this.raycaster.ray.intersectPlane(this.plane, this.hit);
    if (hit == null) {
      return { x: t.width * 0.5, y: t.height * 0.5 };
    }
    return { x: this.hit.x + t.width / 2, y: this.hit.z + t.height / 2 };
  }

  render(aimAngle: number, opts?: { chargePull?: number }): void {
    const t = this.engine.table;
    const tw = t.width;
    const th = t.height;
    const aiPlan = this.engine.phase === 'AITurn' && this.engine.physics.cue.active ? this.engine.getAiCuePreview() : null;
    const effectiveAim = aiPlan ? aiPlan.angle : aimAngle;
    const chargePull = aiPlan
      ? Math.max(0, Math.min(1, aiPlan.power01 * 0.92))
      : Math.max(0, Math.min(1, opts?.chargePull ?? 0));

    for (const b of this.engine.physics.balls) {
      const mesh = this.balls.get(b.id);
      if (!mesh) continue;
      if (!b.active) {
        mesh.visible = false;
        continue;
      }
      mesh.visible = true;
      const r = b.radius;
      mesh.scale.setScalar(r);
      mesh.position.set(b.pos.x - tw / 2, r + 0.15, b.pos.y - th / 2);
    }

    const showAim =
      this.engine.physics.cue.active &&
      this.engine.phase !== 'BallSimulation' &&
      ((this.engine.phase === 'PlayerTurn') || (this.engine.phase === 'AITurn' && aiPlan != null));
    this.aimLine.visible = showAim;
    const aimMat = this.aimLine.material as THREE.LineBasicMaterial;
    aimMat.color.set(aiPlan ? 0xb8e8ff : 0xffffff);
    aimMat.opacity = aiPlan ? 0.5 : 0.42;
    if (showAim) {
      const cue = this.engine.physics.cue;
      const y = cue.radius + 0.2;
      const preview = computeAimPreview(this.engine.physics.balls, cue, effectiveAim);
      TableScene3D.seg2dToWorld(preview.cueToHit, y, tw, th, this.aimPositions);
      this.aimGeom.attributes.position!.needsUpdate = true;

      const hasGhost = preview.objectGhost != null && preview.cueGhost != null;
      this.ghostObjLine.visible = hasGhost;
      this.ghostCueLine.visible = hasGhost;
      if (hasGhost) {
        TableScene3D.seg2dToWorld(preview.objectGhost!, y, tw, th, this.ghostObjPos);
        TableScene3D.seg2dToWorld(preview.cueGhost!, y, tw, th, this.ghostCuePos);
        this.ghostObjGeom.attributes.position!.needsUpdate = true;
        this.ghostCueGeom.attributes.position!.needsUpdate = true;
        const gObj = this.ghostObjLine.material as THREE.LineBasicMaterial;
        const gCue = this.ghostCueLine.material as THREE.LineBasicMaterial;
        if (aiPlan) {
          gObj.color.set(0xffcc88);
          gCue.color.set(0xb8e8ff);
        } else {
          gObj.color.set(0xffdd88);
          gCue.color.set(0xffffff);
        }
      }
    } else {
      this.ghostObjLine.visible = false;
      this.ghostCueLine.visible = false;
    }

    const showCue = showAim;
    this.cueGroup.visible = showCue;
    if (showCue) {
      const cue = this.engine.physics.cue;
      const r = cue.radius;
      const bx = cue.pos.x - tw / 2;
      const bz = cue.pos.y - th / 2;
      const by = r + 0.2;
      const dir = new THREE.Vector3(Math.cos(effectiveAim), 0, Math.sin(effectiveAim)).normalize();
      const pull = chargePull * 125;
      const shaftLen = 292;
      const centerDist = r + shaftLen * 0.5 + pull;
      const pos = new THREE.Vector3(bx, by, bz).add(dir.clone().multiplyScalar(-centerDist));
      this.cueGroup.position.copy(pos);
      this.cueGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    }

    this.renderer.render(this.scene, this.camera);
  }
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

function makeBallMaterial(kind: BallKind, num: number): THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial {
  if (kind === 'cue') {
    return new THREE.MeshPhysicalMaterial({
      color: 0xf4f7ff,
      roughness: 0.22,
      metalness: 0.04,
      clearcoat: 0.42,
      clearcoatRoughness: 0.18,
    });
  }
  if (kind === 'eight') {
    return new THREE.MeshStandardMaterial({
      color: 0x111111,
      roughness: 0.4,
      metalness: 0.18,
    });
  }
  if (kind === 'solid') {
    const c = new THREE.Color(solidHex(num));
    return new THREE.MeshStandardMaterial({ color: c, roughness: 0.38, metalness: 0.1 });
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
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
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
