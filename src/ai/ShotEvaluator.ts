import type { Ball } from '../physics/Ball.js';
import type { CushionSegment, Pocket, Table } from '../physics/Table.js';
import { kindToGroup, type RulesContext } from '../gameplay/rules.types.js';
import type { TierParams } from './DifficultyProfiles.js';
import {
  clampSegmentOutsideCircle,
  dist,
  distPointToSegment,
  reflectPointAcrossLine,
  sweptSegmentBlocked,
  type Pt,
} from './geometry.js';
import { pocketThroatAcceptance, pocketWallIgnoreRadius } from './PocketGeometry.js';

export interface ShotCandidate {
  kind: 'direct' | 'bank' | 'combo';
  angle: number;
  power01: number;
  spinX: number;
  spinY: number;
  /** 0..1 estimated geometric pot probability. */
  potProb: number;
  /** 0..1 leave / position score for next shot. */
  leaveScore: number;
  /** 0..1 cue scratch risk (lower = better). */
  scratchRisk: number;
  /** Composite score used for ranking (higher = better). */
  totalScore: number;
  /** Diagnostic fields. */
  cut: number;
  d1: number;
  d2: number;
  /** Predicted cue ball end-of-shot position (rough). */
  predictedCueEnd: Pt;
}

export interface AIWorldView {
  table: Table;
  balls: Ball[];
  cue: Ball;
  rules: RulesContext;
}

/** Ghost-ball contact point (2r back from object along pocket line). */
function ghostBallNearPocket(obj: Pt, pocket: Pt, r: number): Pt {
  const dx = pocket.x - obj.x;
  const dy = pocket.y - obj.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: obj.x - (dx / len) * 2.0 * r, y: obj.y - (dy / len) * 2.0 * r };
}

function aimAngle(cue: Pt, target: Pt): number {
  return Math.atan2(target.y - cue.y, target.x - cue.x);
}

function cutQuality(cue: Pt, obj: Pt, pocket: Pt): number {
  const v1x = obj.x - cue.x;
  const v1y = obj.y - cue.y;
  const v2x = pocket.x - obj.x;
  const v2y = pocket.y - obj.y;
  const len1 = Math.hypot(v1x, v1y);
  const len2 = Math.hypot(v2x, v2y);
  if (len1 < 1e-4 || len2 < 1e-4) return 0;
  const cos = (v1x * v2x + v1y * v2y) / (len1 * len2);
  return Math.max(0, Math.min(1, cos));
}

/** Cue path passes too close to a non-target pocket → scratch risk. */
function cueScratchPenalty(table: Table, cue: Pt, ghost: Pt, targetPocketId: number): number {
  let pen = 1;
  for (const pk of table.pockets) {
    if (pk.id === targetPocketId) continue;
    const dLine = distPointToSegment(pk.pos, cue, ghost);
    if (dLine < pk.radius * 0.85 && dist(cue, pk.pos) < pk.radius * 9) {
      pen *= 0.65;
    }
  }
  return pen;
}

/** Bir top zaten bir cushion'a temas halindeyse, kalkış noktasını ileri ötele —
 *  bu sayede ralllar boyunca duran toplar yanlışlıkla "engellenmiş" sayılmaz. */
function advancePastTouchingRail(p0: Pt, p1: Pt, r: number, advance: number): Pt {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const len = Math.hypot(dx, dy);
  if (len < advance + 1e-3) return p0;
  void r;
  return { x: p0.x + (dx / len) * advance, y: p0.y + (dy / len) * advance };
}

/**
 * Object→pocket yolu cushion'lara çarpıyor mu?
 * Cep merkezi etrafındaki bantlar (boğaz çenesi) yok sayılır — gerçek giriş kabul testi
 * `pocketThroatAcceptance` ile yapılır.
 */
function objectPathBlocked(table: Table, obj: Pt, pocket: Pocket, r: number): boolean {
  const clamped = clampSegmentOutsideCircle(obj, pocket.pos, pocket.pos, pocket.radius * 0.82);
  /** Topun zaten temas ettiği rail'i atla: kalkışı r * 1.2 öne kaydır. */
  const start = advancePastTouchingRail(clamped.p0, clamped.p1, r, r * 1.25);
  /** Cep dış yayı (pocketOuter) pot hattını gereksiz yere kesmemeli; jaw duvarları (pocketBridge) ise ENGEL. */
  return sweptSegmentBlocked(start, clamped.p1, r, table.cushions, {
    ignoreRoles: new Set(['pocketOuter']),
  });
}

/** Cue→ghost yolu cushion'lara çarpıyor mu? */
function cuePathBlocked(table: Table, cue: Pt, ghost: Pt, r: number): boolean {
  /** Beyaz top da rail'e yapışık olabilir; aynı şekilde başlangıçtan ileri kaydır. */
  const start = advancePastTouchingRail(cue, ghost, r, r * 1.25);
  return sweptSegmentBlocked(start, ghost, r, table.cushions);
}

/** Cue/object yolundaki başka top-engelleri — penaltıya dönüştürür (sıfırlamaz). */
function ballClearance(view: AIWorldView, target: Ball, ghost: Pt, pocket: Pt): number {
  const segs = [
    { a: view.cue.pos, b: ghost, ignoreCue: true },
    { a: target.pos, b: pocket, ignoreCue: false },
  ];
  const threshold = target.radius * 2.55;
  let min = Infinity;
  for (const s of segs) {
    for (const b of view.balls) {
      if (!b.active) continue;
      if (b.id === target.id) continue;
      if (s.ignoreCue && b.id === view.cue.id) continue;
      const d = distPointToSegment(b.pos, s.a, s.b);
      if (d < min) min = d;
    }
  }
  if (!Number.isFinite(min)) return 1;
  if (min < 1.05 * target.radius) return 0.0;
  if (min >= threshold) return 1;
  return Math.max(0.18, (min - target.radius) / (threshold - target.radius));
}

/** Cue ball tahmini son konum: kontak sonrası cue ghost yönünde sönen bir hız. */
function predictCueEnd(cue: Pt, ghost: Pt, target: Pt, power01: number): Pt {
  /** Equal-mass elastic split (AimPreview ile aynı yaklaşım). */
  const dx = ghost.x - cue.x;
  const dy = ghost.y - cue.y;
  const dlen = Math.hypot(dx, dy) || 1;
  const ux = dx / dlen;
  const uy = dy / dlen;
  const Lx = target.x - ghost.x;
  const Ly = target.y - ghost.y;
  const Llen = Math.hypot(Lx, Ly) || 1;
  const Lux = Lx / Llen;
  const Luy = Ly / Llen;
  const dot = ux * Lux + uy * Luy;
  const cgx = ux - 2 * dot * Lux;
  const cgy = uy - 2 * dot * Luy;
  const cglen = Math.hypot(cgx, cgy) || 1;
  const cux = cgx / cglen;
  const cuy = cgy / cglen;
  /** Sin component → cue ball travel after contact. */
  const cos = Math.max(0, Math.min(1, dot));
  const sin = Math.sqrt(Math.max(0, 1 - cos * cos));
  /** Power gücüne göre rough menzil; tipik: 0.5 power → ~280px sonra durur. */
  const baseRange = 220 + power01 * 520;
  const len = baseRange * (0.35 + sin * 0.85);
  return { x: ghost.x + cux * len, y: ghost.y + cuy * len };
}

/** evaluateLeave: tahmini cue son pozisyonu, sonraki vuruşların kalitesini puanla. */
export function evaluateLeave(
  view: AIWorldView,
  predictedCueEnd: Pt,
  ownTargets: Ball[],
  pottedTargetId: number,
): number {
  if (!ownTargets.length) return 0.5;

  /** Masa kenarlarından çok uzak değil mi? Banta yapışmış cue → kötü. */
  const t = view.table;
  const margin = view.cue.radius * 1.6;
  const nearRailL = predictedCueEnd.x < t.playableMinX + margin;
  const nearRailR = predictedCueEnd.x > t.playableMaxX - margin;
  const nearRailT = predictedCueEnd.y < t.playableMinY + margin;
  const nearRailB = predictedCueEnd.y > t.playableMaxY - margin;
  const railPenalty = nearRailL || nearRailR || nearRailT || nearRailB ? 0.65 : 1.0;

  /** En iyi sonraki "direct" atış skoru. */
  let bestNext = 0;
  for (const b of ownTargets) {
    if (b.id === pottedTargetId) continue;
    if (!b.active) continue;
    for (const pk of t.pockets) {
      const ghost = ghostBallNearPocket(b.pos, pk.pos, b.radius);
      const cuePathOk = !sweptSegmentBlocked(predictedCueEnd, ghost, view.cue.radius, t.cushions);
      if (!cuePathOk) continue;
      const objPathOk = !objectPathBlocked(t, b.pos, pk, b.radius);
      if (!objPathOk) continue;
      const dirAngle = Math.atan2(pk.pos.y - b.pos.y, pk.pos.x - b.pos.x);
      const throat = pocketThroatAcceptance(t, pk, dirAngle);
      if (throat < 0.2) continue;
      const cut = cutQuality(predictedCueEnd, b.pos, pk.pos);
      const d1 = dist(predictedCueEnd, b.pos);
      const d2 = dist(b.pos, pk.pos);
      const distFactor = 220 / (220 + d1 + d2);
      const score = cut * 0.55 + throat * 0.2 + distFactor * 0.25;
      if (score > bestNext) bestNext = score;
    }
  }
  return Math.max(0, Math.min(1, bestNext * railPenalty));
}

/** Belirli bir hedef-cep çifti için doğrudan atışı değerlendir. */
export function evaluateDirectShot(
  view: AIWorldView,
  obj: Ball,
  pocket: Pocket,
  tierCfg: TierParams,
  ownTargets: Ball[],
): ShotCandidate | null {
  const t = view.table;
  const ghost = ghostBallNearPocket(obj.pos, pocket.pos, obj.radius);
  const tierSkill = Math.max(0, Math.min(1, tierCfg.positionPlay));
  const minThroat = 0.22 - tierSkill * 0.06;
  const minCut = 0.075 - tierSkill * 0.025;
  const minClearance = 0.03 - tierSkill * 0.012;

  /** ZORUNLU: cue ghost'un masa içinde olması (rail içine giremez). */
  if (
    ghost.x < t.playableMinX + view.cue.radius * 0.6 ||
    ghost.x > t.playableMaxX - view.cue.radius * 0.6 ||
    ghost.y < t.playableMinY + view.cue.radius * 0.6 ||
    ghost.y > t.playableMaxY - view.cue.radius * 0.6
  ) {
    /** Ghost rail dışında — top duvarın çok yakınında, yine de bazı durumlarda mümkün; düşür. */
    const slackOk =
      ghost.x > t.playableMinX - obj.radius * 0.5 &&
      ghost.x < t.playableMaxX + obj.radius * 0.5 &&
      ghost.y > t.playableMinY - obj.radius * 0.5 &&
      ghost.y < t.playableMaxY + obj.radius * 0.5;
    if (!slackOk) return null;
  }

  /** ZORUNLU: cue → ghost cushion clearance. */
  if (cuePathBlocked(t, view.cue.pos, ghost, view.cue.radius * 0.88)) return null;
  /** ZORUNLU: object → pocket cushion clearance (cep ağzı yok sayılarak). */
  if (objectPathBlocked(t, obj.pos, pocket, obj.radius * 0.88)) return null;

  const dirAngle = Math.atan2(pocket.pos.y - obj.pos.y, pocket.pos.x - obj.pos.x);
  const throat = pocketThroatAcceptance(t, pocket, dirAngle);
  /** ZORUNLU: throat acceptance. */
  if (throat < minThroat) return null;

  const angle = aimAngle(view.cue.pos, ghost);
  const d1 = dist(view.cue.pos, obj.pos);
  const d2 = dist(obj.pos, pocket.pos);
  const cut = cutQuality(view.cue.pos, obj.pos, pocket.pos);
  if (cut < minCut) return null;

  const ballClr = ballClearance(view, obj, ghost, pocket.pos);
  if (ballClr < minClearance) return null;

  const cueScr = cueScratchPenalty(t, view.cue.pos, ghost, pocket.id);

  /** Power: cut ne kadar dikse o kadar fazla; mesafeyle artar. */
  const baseP = 0.30 + d1 / 950 + d2 / 800;
  const cutBoost = (1 - cut) * 0.22;
  const power01 = Math.max(0.26, Math.min(0.96, baseP + cutBoost));

  /** Spin: cue cebe yakın ve power yüksekse hafif geri spin. */
  let spinX = 0;
  let spinY = 0;
  if (tierCfg.spinUsage > 0.2) {
    let nearOwnPocket = false;
    for (const pk of t.pockets) {
      if (dist(view.cue.pos, pk.pos) < view.cue.radius * 8) {
        nearOwnPocket = true;
        break;
      }
    }
    if (nearOwnPocket) spinY = -0.32;
    /** Master/expert: pozisyon için draw/follow karar. */
    if (tierCfg.positionPlay > 0.7) {
      spinY = power01 > 0.65 ? -0.25 : 0.18;
    }
  }

  const predictedCueEnd = predictCueEnd(view.cue.pos, ghost, obj.pos, power01);
  const leave =
    tierCfg.positionPlay > 0
      ? evaluateLeave(view, predictedCueEnd, ownTargets, obj.id)
      : 0.5;

  /** Pot prob (heuristic): cut^1.4 * throat * ballClearance * (mesafe penaltısı) * cueScratch. */
  const distPenalty = 1 - Math.min(0.55, (d1 + d2) / 2400);
  const potProb = Math.pow(cut, 1.45) * throat * ballClr * distPenalty * cueScr;

  const scratchRisk = 1 - cueScr; // kabaca

  /** Composite: pot*ağırlık + leave*pozisyon ağırlığı + risk düşümü. */
  const wPot = 1.0;
  const wLeave = 0.25 + tierCfg.positionPlay * 0.55;
  const totalScore = potProb * wPot + leave * wLeave - scratchRisk * 0.25;

  return {
    kind: 'direct',
    angle,
    power01,
    spinX,
    spinY,
    potProb,
    leaveScore: leave,
    scratchRisk,
    totalScore,
    cut,
    d1,
    d2,
    predictedCueEnd,
  };
}

/** Tek bir rail segmenti üzerinden bank atışı (mirror trick). Yalnızca 'rail' rolündeki uzun bantlar için. */
export function evaluateBankShot(
  view: AIWorldView,
  obj: Ball,
  pocket: Pocket,
  rail: CushionSegment,
  tierCfg: TierParams,
  ownTargets: Ball[],
): ShotCandidate | null {
  const t = view.table;
  if (rail.role !== 'rail') return null;
  const tierSkill = Math.max(0, Math.min(1, tierCfg.positionPlay));
  const minThroat = 0.24 - tierSkill * 0.08;
  const minCut = 0.14 - tierSkill * 0.06;
  const minClearance = 0.06 - tierSkill * 0.03;

  /** Sanal cep: cep konumunu rail doğrusunun karşısına yansıt. */
  const railA = { x: rail.ax, y: rail.ay };
  const railB = { x: rail.bx, y: rail.by };
  const virtualPocket = reflectPointAcrossLine(pocket.pos, railA, railB);

  /** Sanal cebe atış olarak object→virtualPocket yönünde ghost hesapla. */
  const ghost = ghostBallNearPocket(obj.pos, virtualPocket, obj.radius);

  if (cuePathBlocked(t, view.cue.pos, ghost, view.cue.radius * 0.88)) return null;

  /** Object → rail kontağı: object'in sanal cebe gittiği hat üzerinde rail ile kesişme noktası
   *  rail SEGMENTİ içinde olmalı (uçlardan kaçar) ve cep boğaz bölgesinde olmamalı. */
  const dx = virtualPocket.x - obj.pos.x;
  const dy = virtualPocket.y - obj.pos.y;
  const railDx = rail.bx - rail.ax;
  const railDy = rail.by - rail.ay;
  const denom = (-dx) * railDy - (-dy) * railDx;
  if (Math.abs(denom) < 1e-6) return null;
  const sParam = ((rail.ax - obj.pos.x) * railDy - (rail.ay - obj.pos.y) * railDx) / -denom;
  const tParam =
    ((rail.ax - obj.pos.x) * (-dy) - (rail.ay - obj.pos.y) * (-dx)) / -denom;
  if (sParam <= 0.02 || sParam >= 0.98) return null;
  if (tParam <= 0.06 || tParam >= 0.94) return null;
  const reflectPt: Pt = {
    x: obj.pos.x + dx * sParam,
    y: obj.pos.y + dy * sParam,
  };

  /** Reflect noktası bir cep ağzının çok yakınında olmamalı (orada bant yok / kötü tepki). */
  const ignoreR = pocketWallIgnoreRadius(t);
  for (const pk of t.pockets) {
    if (dist(reflectPt, pk.pos) < ignoreR) return null;
  }

  /** Object yolu: obj → reflectPt (cushion'lar hariç bu rail) ve reflectPt → pocket (cushion'lar hariç bu rail).
   *  Bu rail kendi kendisini bloklamayacak. */
  const ignoreSet = new Set<CushionSegment>([rail]);
  const seg1Blocked = sweptSegmentBlocked(obj.pos, reflectPt, obj.radius * 0.92, t.cushions, {
    ignoreSegmentRefs: ignoreSet,
  });
  if (seg1Blocked) return null;
  const seg2Blocked = sweptSegmentBlocked(reflectPt, pocket.pos, obj.radius * 0.92, t.cushions, {
    ignoreSegmentRefs: ignoreSet,
    ignoreNearPocketPos: pocket.pos,
    ignoreNearPocketRadius: ignoreR,
  });
  if (seg2Blocked) return null;

  /** Throat acceptance: reflectPt → pocket yön açısı. */
  const dirAngle = Math.atan2(pocket.pos.y - reflectPt.y, pocket.pos.x - reflectPt.x);
  const throat = pocketThroatAcceptance(t, pocket, dirAngle);
  if (throat < minThroat) return null;

  const cut = cutQuality(view.cue.pos, obj.pos, virtualPocket);
  if (cut < minCut) return null;

  const ballClr = ballClearanceMulti(view, obj, ghost, [reflectPt, pocket.pos]);
  if (ballClr < minClearance) return null;

  const angle = aimAngle(view.cue.pos, ghost);
  const d1 = dist(view.cue.pos, obj.pos);
  const d2 = dist(obj.pos, reflectPt) + dist(reflectPt, pocket.pos);

  /** Bank atışı her zaman daha güçlü gerekir. */
  const baseP = 0.45 + d1 / 850 + d2 / 700;
  const cutBoost = (1 - cut) * 0.18;
  const power01 = Math.max(0.42, Math.min(1.0, baseP + cutBoost));

  const cueScr = cueScratchPenalty(t, view.cue.pos, ghost, pocket.id);
  const distPenalty = 1 - Math.min(0.6, (d1 + d2) / 2200);
  /** Bank inherently uncertain: ek 0.6 çarpan. */
  const bankReliability = 0.55;
  const potProb = Math.pow(cut, 1.4) * throat * ballClr * distPenalty * cueScr * bankReliability;

  const predictedCueEnd = predictCueEnd(view.cue.pos, ghost, obj.pos, power01);
  const leave =
    tierCfg.positionPlay > 0
      ? evaluateLeave(view, predictedCueEnd, ownTargets, obj.id) * 0.7
      : 0.4;

  const scratchRisk = 1 - cueScr;
  const wLeave = 0.18 + tierCfg.positionPlay * 0.4;
  const totalScore = potProb * 0.85 + leave * wLeave - scratchRisk * 0.22;

  return {
    kind: 'bank',
    angle,
    power01,
    spinX: 0,
    spinY: 0,
    potProb,
    leaveScore: leave,
    scratchRisk,
    totalScore,
    cut,
    d1,
    d2,
    predictedCueEnd,
  };
}

function ballClearanceMulti(view: AIWorldView, target: Ball, ghost: Pt, viaPoints: Pt[]): number {
  const segs: { a: Pt; b: Pt; ignoreCue: boolean }[] = [];
  segs.push({ a: view.cue.pos, b: ghost, ignoreCue: true });
  for (let i = 0; i < viaPoints.length - 1; i++) {
    segs.push({ a: i === 0 ? target.pos : viaPoints[i - 1]!, b: viaPoints[i]!, ignoreCue: false });
  }
  /** Son segmenti ekle (target.pos → ilk viaPoint, ardından sırayla). */
  if (viaPoints.length === 1) {
    segs.length = 1;
    segs.push({ a: target.pos, b: viaPoints[0]!, ignoreCue: false });
  } else if (viaPoints.length >= 2) {
    segs.length = 1;
    segs.push({ a: target.pos, b: viaPoints[0]!, ignoreCue: false });
    for (let i = 0; i < viaPoints.length - 1; i++) {
      segs.push({ a: viaPoints[i]!, b: viaPoints[i + 1]!, ignoreCue: false });
    }
  }
  const threshold = target.radius * 2.5;
  let min = Infinity;
  for (const s of segs) {
    for (const b of view.balls) {
      if (!b.active) continue;
      if (b.id === target.id) continue;
      if (s.ignoreCue && b.id === view.cue.id) continue;
      const d = distPointToSegment(b.pos, s.a, s.b);
      if (d < min) min = d;
    }
  }
  if (!Number.isFinite(min)) return 1;
  if (min < 1.05 * target.radius) return 0;
  if (min >= threshold) return 1;
  return Math.max(0.15, (min - target.radius) / (threshold - target.radius));
}

/**
 * 2-top kombinasyon: cue → ball1 → ball2 → pocket.
 * ball1 = AI'nın değdiği ilk top (legal first contact için kendi grubu olmalı), ball2 = potlanacak.
 */
export function evaluateCombination(
  view: AIWorldView,
  ball1: Ball,
  ball2: Ball,
  pocket: Pocket,
  tierCfg: TierParams,
  ownTargets: Ball[],
): ShotCandidate | null {
  if (ball1.id === ball2.id) return null;
  const t = view.table;
  const tierSkill = Math.max(0, Math.min(1, tierCfg.positionPlay));
  const minThroat = 0.24 - tierSkill * 0.1;
  const minCut1 = 0.42 - tierSkill * 0.16;
  const minCut2 = 0.36 - tierSkill * 0.12;
  const minBlockers = 0.2 - tierSkill * 0.12;

  /** Ball2 → pocket yolu temiz olmalı. */
  if (objectPathBlocked(t, ball2.pos, pocket, ball2.radius * 0.88)) return null;
  const dir2 = Math.atan2(pocket.pos.y - ball2.pos.y, pocket.pos.x - ball2.pos.x);
  if (pocketThroatAcceptance(t, pocket, dir2) < minThroat) return null;

  /** Ball1 ball2'ye doğru ghost noktasından gönderilmeli. */
  const ghost2 = ghostBallNearPocket(ball2.pos, pocket.pos, ball2.radius);
  /** Ball1 → ghost2 yolu temiz. */
  if (sweptSegmentBlocked(ball1.pos, ghost2, ball1.radius * 0.92, t.cushions)) return null;
  /** Cue → ghost1 (where ghost1 makes ball1 head toward ghost2) */
  const dx = ghost2.x - ball1.pos.x;
  const dy = ghost2.y - ball1.pos.y;
  const dlen = Math.hypot(dx, dy) || 1;
  const ghost1: Pt = {
    x: ball1.pos.x - (dx / dlen) * 2 * ball1.radius,
    y: ball1.pos.y - (dy / dlen) * 2 * ball1.radius,
  };
  if (cuePathBlocked(t, view.cue.pos, ghost1, view.cue.radius * 0.88)) return null;

  /** Cut'ları al — iki kademe birbiri ile çarpılır. */
  const cut1 = cutQuality(view.cue.pos, ball1.pos, ghost2);
  const cut2 = cutQuality(ball1.pos, ball2.pos, pocket.pos);
  if (cut1 < minCut1 || cut2 < minCut2) return null;

  /** Diğer top engelleri. */
  const blockers = ballClearanceMulti(view, ball1, ghost1, [ball2.pos, pocket.pos]);
  if (blockers < minBlockers) return null;

  const angle = aimAngle(view.cue.pos, ghost1);
  const d1 = dist(view.cue.pos, ball1.pos);
  const dMid = dist(ball1.pos, ball2.pos);
  const d2 = dist(ball2.pos, pocket.pos);
  const baseP = 0.5 + (d1 + dMid + d2) / 1700;
  const power01 = Math.max(0.5, Math.min(1.0, baseP));

  const cueScr = cueScratchPenalty(t, view.cue.pos, ghost1, pocket.id);
  const throat = pocketThroatAcceptance(t, pocket, dir2);
  const distPenalty = 1 - Math.min(0.65, (d1 + dMid + d2) / 2400);
  /** Combinations are inherently risky. */
  const reliability = 0.4;
  const potProb =
    Math.pow(cut1, 1.2) * Math.pow(cut2, 1.4) * throat * blockers * distPenalty * cueScr * reliability;

  const predictedCueEnd = predictCueEnd(view.cue.pos, ghost1, ball1.pos, power01);
  const leave =
    tierCfg.positionPlay > 0
      ? evaluateLeave(view, predictedCueEnd, ownTargets, ball2.id) * 0.55
      : 0.35;

  const scratchRisk = 1 - cueScr;
  const wLeave = 0.15 + tierCfg.positionPlay * 0.3;
  const totalScore = potProb * 0.7 + leave * wLeave - scratchRisk * 0.2;

  return {
    kind: 'combo',
    angle,
    power01,
    spinX: 0,
    spinY: 0,
    potProb,
    leaveScore: leave,
    scratchRisk,
    totalScore,
    cut: cut1 * cut2,
    d1,
    d2: dMid + d2,
    predictedCueEnd,
  };
}

/** Kendi grubu hâlâ kalan toplar (bu skor bağlamında "ownTargets"). */
export function ownTargetsFor(view: AIWorldView): Ball[] {
  const aiGroup = view.rules.aiGroup;
  if (!aiGroup) {
    return view.balls.filter((b) => b.active && (b.kind === 'solid' || b.kind === 'stripe'));
  }
  return view.balls.filter((b) => b.active && kindToGroup(b.kind) === aiGroup);
}
