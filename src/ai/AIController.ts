import type { Ball } from '../physics/Ball.js';
import type { CushionSegment, Pocket, Table } from '../physics/Table.js';
import { kindToGroup, type RulesContext } from '../gameplay/rules.types.js';
import type { AICharacterProfile } from './types.js';
import { tierParams, type TierParams } from './DifficultyProfiles.js';
import {
  evaluateBankShot,
  evaluateCombination,
  evaluateDirectShot,
  ownTargetsFor,
  type AIWorldView,
  type ShotCandidate,
} from './ShotEvaluator.js';
import { dist, sweptSegmentBlocked, type Pt } from './geometry.js';
import { pocketThroatAcceptance } from './PocketGeometry.js';

export interface AIShotPlan {
  angle: number;
  power01: number;
  spinX: number;
  spinY: number;
  thinkMs: number;
  cueId?: string;
}

export type { AIWorldView };

/** Corner pocket ids (near rails); prefer these when AI runs the 8. */
const CORNER_POCKET_IDS = new Set([0, 2, 3, 5]);

export class AIController {
  constructor(private profile: AICharacterProfile) {}

  setProfile(p: AICharacterProfile): void {
    this.profile = p;
  }

  compute(view: AIWorldView): AIShotPlan {
    const tier = tierParams(this.profile.tier);
    const rng = Math.random;
    const targets = pickLegalTargets(view);
    const ownTargets = ownTargetsFor(view);

    const candidates: ShotCandidate[] = [];

    if (targets.length) {
      for (const obj of targets) {
        for (const pk of pocketsForRanking(view.table, obj)) {
          const direct = evaluateDirectShot(view, obj, pk, tier, ownTargets);
          if (direct) candidates.push(direct);

          if (tier.allowBank) {
            for (const rail of view.table.cushions) {
              if (rail.role !== 'rail') continue;
              const bank = evaluateBankShot(view, obj, pk, rail, tier, ownTargets);
              if (bank) candidates.push(bank);
            }
          }
        }
      }

      if (tier.allowCombo) {
        for (const ball1 of targets) {
          for (const ball2 of targets) {
            if (ball1.id === ball2.id) continue;
            /** Sadece kendi grubu / 8-top kombolar; yasal first-contact kontrolü pickLegalTargets garanti ediyor. */
            for (const pk of view.table.pockets) {
              const combo = evaluateCombination(view, ball1, ball2, pk, tier, ownTargets);
              if (combo) candidates.push(combo);
            }
          }
        }
      }
    }

    candidates.sort((a, b) => b.totalScore - a.totalScore);
    const best = candidates[0] ?? null;
    const bestDirect = candidates.find((c) => c.kind === 'direct') ?? null;

    let chosen: { angle: number; power01: number; spinX: number; spinY: number } | null = null;

    /**
     * Master/Expert için safety'e çok erken düşmemek gerekir:
     * önce pot ihtimali yüksek direct atışları zorla öne çıkar.
     */
    if (
      bestDirect &&
      bestDirect.potProb > 0.32 &&
      (!best || best.kind !== 'direct' || best.totalScore <= bestDirect.totalScore + 0.08)
    ) {
      chosen = {
        angle: bestDirect.angle,
        power01: bestDirect.power01,
        spinX: bestDirect.spinX,
        spinY: bestDirect.spinY,
      };
    }

    /**
     * Eski eşik master'da gereğinden yüksek kalıyordu ve AI pasifleşiyordu.
     * Yeni eşik, accuracy/risk arttıkça düşer (yüksek tier daha çok pot dener).
     */
    const safetyThreshold =
      0.018 + (1 - this.profile.accuracy) * 0.03 + (1 - this.profile.risk) * 0.015;
    if (!chosen && (!best || best.totalScore < safetyThreshold)) {
      const safety = pickAdvancedSafety(view, targets, tier);
      if (safety) chosen = safety;
    }

    if (!chosen) {
      if (best) {
        chosen = {
          angle: best.angle,
          power01: best.power01,
          spinX: best.spinX,
          spinY: best.spinY,
        };
      } else {
        /**
         * Aşırı pasif kalmamak için "no-candidate" durumda agresif fallback:
         * en yakın legal topa orta-sert vur.
         */
        const fallback = pickAggressiveFallback(view, targets);
        chosen = fallback ?? {
          angle: -Math.PI / 2 + (rng() - 0.5) * 0.4,
          power01: 0.52,
          spinX: 0,
          spinY: 0,
        };
      }
    }

    /** Tier gürültü ve hata uygulaması — duvar kontrolü plan içinde zaten yapıldı,
     *  sadece nişan/güç titrek. */
    const acc = 0.45 + (this.profile.accuracy ?? 0.5) * 0.55;
    const noiseSpan = tier.aimNoiseRad * (1.05 - acc);
    chosen.angle += (rng() - 0.5) * 2 * noiseSpan * (0.55 + rng() * 0.45);

    chosen.power01 += (rng() - 0.5) * tier.powerJitter * (1 - acc * 0.7);
    chosen.power01 = Math.max(0.2, Math.min(1, chosen.power01));

    if (rng() < tier.mistakeChance * (1 - acc * 0.6)) {
      /** Düşük tier hatası: ufak nişan kayması + güç eksilmesi. */
      chosen.angle += (rng() - 0.5) * 0.18;
      chosen.power01 *= 0.7 + rng() * 0.28;
    }

    if (rng() < this.profile.risk * 0.22) {
      chosen.power01 = Math.min(1, chosen.power01 * 1.06);
    }

    const thinkMs = (1100 + rng() * 1700) * this.profile.pace;
    return {
      angle: chosen.angle,
      power01: chosen.power01,
      spinX: chosen.spinX,
      spinY: chosen.spinY,
      thinkMs,
    };
  }
}

function pickAggressiveFallback(
  view: AIWorldView,
  targets: Ball[],
): { angle: number; power01: number; spinX: number; spinY: number } | null {
  if (!targets.length) return null;
  let pick = targets[0]!;
  let best = Infinity;
  for (const t of targets) {
    const d = dist(view.cue.pos, t.pos);
    if (d < best) {
      best = d;
      pick = t;
    }
  }
  const angle = Math.atan2(pick.pos.y - view.cue.pos.y, pick.pos.x - view.cue.pos.x);
  const power01 = Math.max(0.5, Math.min(0.86, 0.54 + best / 1200));
  return { angle, power01, spinX: 0, spinY: 0 };
}

/** Snooker-style safety: rakibe en zor pozisyonu bırakacak açı/gücü ara. */
function pickAdvancedSafety(
  view: AIWorldView,
  targets: Ball[],
  tier: TierParams,
): { angle: number; power01: number; spinX: number; spinY: number } | null {
  const nonEight = targets.filter((b) => b.kind !== 'eight');
  const list = nonEight.length ? nonEight : targets;
  if (!list.length) return null;

  /** Aday hedef topları: en yakın 4 tanesi (perforans için). */
  const sorted = [...list].sort(
    (a, b) => dist(view.cue.pos, a.pos) - dist(view.cue.pos, b.pos),
  );
  const cands = sorted.slice(0, Math.min(4, sorted.length));

  let bestPlan: { angle: number; power01: number; spinX: number; spinY: number } | null = null;
  let bestSafetyScore = -Infinity;

  for (const tgt of cands) {
    /** Birkaç farklı vuruş açısı/gücü dene: doğrudan, hafif kesik, soft, medium. */
    const baseAngle = Math.atan2(tgt.pos.y - view.cue.pos.y, tgt.pos.x - view.cue.pos.x);
    const variants: { angle: number; power: number }[] = [
      { angle: baseAngle, power: 0.32 },
      { angle: baseAngle, power: 0.42 },
      { angle: baseAngle - 0.06, power: 0.36 },
      { angle: baseAngle + 0.06, power: 0.36 },
    ];

    for (const v of variants) {
      /** Cue path duvardan geçiyorsa atla. */
      const aimEnd: Pt = {
        x: view.cue.pos.x + Math.cos(v.angle) * 90,
        y: view.cue.pos.y + Math.sin(v.angle) * 90,
      };
      if (sweptSegmentBlocked(view.cue.pos, aimEnd, view.cue.radius * 0.95, view.table.cushions)) continue;

      /** Tahmini cue son pozisyonu: vuruş yönünde sönen bir hız. */
      const cueEnd = predictSafetyCueEnd(view.cue.pos, v.angle, v.power, view.table, view.cue.radius);
      const score = scoreSafetyLeave(view, cueEnd, tier);
      if (score > bestSafetyScore) {
        bestSafetyScore = score;
        bestPlan = { angle: v.angle, power01: v.power, spinX: 0, spinY: 0 };
      }
    }
  }

  return bestPlan;
}

function predictSafetyCueEnd(cue: Pt, angle: number, power01: number, table: Table, radius: number): Pt {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const baseRange = 280 + power01 * 700;

  /** Basit: ilk cushion çarpışmasına kadar git, sonra simetri ile yansıt — toplam baseRange uzunluğunda. */
  let curX = cue.x;
  let curY = cue.y;
  let remain = baseRange;
  let dirX = dx;
  let dirY = dy;
  for (let bounce = 0; bounce < 3 && remain > 1; bounce++) {
    const end: Pt = { x: curX + dirX * remain, y: curY + dirY * remain };
    /** Hangi rail'e en önce çarpıyor? */
    let bestT = 1.0;
    let bestSeg: CushionSegment | null = null;
    for (const seg of table.cushions) {
      if (seg.role !== 'rail') continue;
      /** Ray-segment intersection. */
      const sx = seg.bx - seg.ax;
      const sy = seg.by - seg.ay;
      const denom = dirX * sy - dirY * sx;
      if (Math.abs(denom) < 1e-6) continue;
      const t = ((seg.ax - curX) * sy - (seg.ay - curY) * sx) / denom;
      const u = ((seg.ax - curX) * dirY - (seg.ay - curY) * dirX) / denom;
      const segLen = Math.hypot(sx, sy) || 1;
      const radiusInU = radius / segLen;
      if (t > 0.001 && t < bestT && u >= -radiusInU && u <= 1 + radiusInU) {
        bestT = t;
        bestSeg = seg;
      }
    }
    if (!bestSeg) {
      curX = end.x;
      curY = end.y;
      break;
    }
    const hitX = curX + dirX * bestT * remain;
    const hitY = curY + dirY * bestT * remain;
    /** Reflect dir across rail tangent: d' = 2(d·t)t - d. */
    const sx = bestSeg.bx - bestSeg.ax;
    const sy = bestSeg.by - bestSeg.ay;
    const slen = Math.hypot(sx, sy) || 1;
    const tx = sx / slen;
    const ty = sy / slen;
    const dotT = dirX * tx + dirY * ty;
    dirX = 2 * dotT * tx - dirX;
    dirY = 2 * dotT * ty - dirY;
    curX = hitX + dirX * 0.5;
    curY = hitY + dirY * 0.5;
    remain *= 1 - bestT;
    remain *= 0.78;
  }
  return { x: curX, y: curY };
}

/** Bir cue son pozisyonu için "rakip ne kadar zorlanır" skoru — yüksek = AI için iyi safety. */
function scoreSafetyLeave(view: AIWorldView, cueEnd: Pt, tier: TierParams): number {
  /** Rakip "hedefleri": rakip grubu (player) toplarından oluşan listi. */
  const opponentTargets = view.balls.filter((b) => {
    if (!b.active || b.kind === 'cue') return false;
    if (b.kind === 'eight') return false;
    if (view.rules.openTable) return true;
    const og = view.rules.playerGroup;
    if (!og) return true;
    return kindToGroup(b.kind) === og;
  });

  if (!opponentTargets.length) return 0;

  /** Rakibin en iyi direct atışı (basit): cuePathBlocked + objectPathBlocked + throat. */
  let bestOpp = 0;
  for (const obj of opponentTargets) {
    for (const pk of view.table.pockets) {
      const ghost: Pt = ghostFor(obj.pos, pk.pos, obj.radius);
      const cueOk = !sweptSegmentBlocked(cueEnd, ghost, view.cue.radius, view.table.cushions);
      if (!cueOk) continue;
      const dirAngle = Math.atan2(pk.pos.y - obj.pos.y, pk.pos.x - obj.pos.x);
      const throat = pocketThroatAcceptance(view.table, pk, dirAngle);
      if (throat < 0.18) continue;
      const cut = simpleCut(cueEnd, obj.pos, pk.pos);
      const d1 = dist(cueEnd, obj.pos);
      const d2 = dist(obj.pos, pk.pos);
      const distFactor = 220 / (220 + d1 + d2);
      const oppScore = Math.pow(cut, 1.4) * throat * distFactor;
      if (oppScore > bestOpp) bestOpp = oppScore;
    }
  }

  /** Rail yakınında mı? Banta yapışmış cue rakibi zorlar. */
  const t = view.table;
  const margin = view.cue.radius * 1.5;
  const railClose =
    cueEnd.x < t.playableMinX + margin ||
    cueEnd.x > t.playableMaxX - margin ||
    cueEnd.y < t.playableMinY + margin ||
    cueEnd.y > t.playableMaxY - margin;
  const railBonus = railClose ? 0.18 : 0;

  /** Lookahead 1: rakibin en iyi atışını ne kadar zorlaştırdık. */
  const denyScore = 1 - bestOpp;
  const base = denyScore + railBonus;
  /** Yüksek tier daha agresif safety oynar (rakibe daha zoru bırakmaya çalışır). */
  return base + tier.safetyAggression * 0.05;
}

function ghostFor(obj: Pt, pocket: Pt, r: number): Pt {
  const dx = pocket.x - obj.x;
  const dy = pocket.y - obj.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: obj.x - (dx / len) * 2 * r, y: obj.y - (dy / len) * 2 * r };
}

function simpleCut(cue: Pt, obj: Pt, pocket: Pt): number {
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

function pocketsForRanking(table: Table, obj: Ball): readonly Pocket[] {
  if (obj.kind !== 'eight') return table.pockets;
  return [...table.pockets].sort((a, b) => {
    const ac = CORNER_POCKET_IDS.has(a.id) ? 0 : 1;
    const bc = CORNER_POCKET_IDS.has(b.id) ? 0 : 1;
    return ac - bc;
  });
}

function pickLegalTargets(view: AIWorldView): Ball[] {
  const out: Ball[] = [];
  const { rules } = view;
  const aiGroup = rules.aiGroup;

  const groupRemaining = (g: 'solid' | 'stripe') =>
    view.balls.some((b) => b.active && kindToGroup(b.kind) === g);

  const aiNeedsEight = aiGroup && !groupRemaining(aiGroup);

  for (const b of view.balls) {
    if (!b.active || b.kind === 'cue') continue;
    if (b.kind === 'eight') {
      if (aiNeedsEight) out.push(b);
      continue;
    }
    if (rules.openTable) {
      out.push(b);
      continue;
    }
    if (aiGroup && kindToGroup(b.kind) === aiGroup) out.push(b);
  }

  if (!out.length) {
    const avoidEightOpen =
      rules.openTable &&
      view.balls.some((x) => x.active && (x.kind === 'solid' || x.kind === 'stripe'));
    for (const b of view.balls) {
      if (!b.active || b.kind === 'cue') continue;
      if (avoidEightOpen && b.kind === 'eight') continue;
      out.push(b);
    }
  }
  return out;
}
