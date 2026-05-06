import type { Pocket, Table } from '../physics/Table.js';
import { wrapAngle } from './geometry.js';

interface PocketThroat {
  /** Cep merkezinden masa merkezine doğru "kabul edilen" giriş yön açısı (radyan). */
  centerAngle: number;
  /** Boğazın yarı açısı (radyan). centerAngle ± halfAngle aralığı kabul bölgesi. */
  halfAngle: number;
}

interface TableThroatCache {
  byPocketId: Map<number, PocketThroat>;
  /** Cep merkezi etrafında şu yarıçapın altındaki cushion segmentleri "boğaz" sayılır. */
  pocketWallRadius: number;
}

const cache = new WeakMap<Table, TableThroatCache>();

/** Yan cep id'leri (sol-orta = 1, sağ-orta = 4). Yan cep boğazı daha dar olur. */
const SIDE_POCKET_IDS = new Set([1, 4]);

function buildThroat(table: Table, pocket: Pocket): PocketThroat {
  const tcx = table.width * 0.5;
  const tcy = table.height * 0.5;
  /** Cep merkezinden masa merkezine bakan açı — boğazın açık yönü. */
  const centerAngle = Math.atan2(tcy - pocket.pos.y, tcx - pocket.pos.x);

  /** Layout'taki throat half-angle hem fiziksel cushion'ları hem boğazı tanımlar. */
  const layoutHalf = table.layout.pocketThroatHalfAngleRad;

  /**
   * Önceki değerler fazla genişti; AI cep girişindeki yan duvarları (jaw) dikkate almadan
   * çok keskin girişleri seçiyordu. Daha dar kabul penceresi kullan.
   */
  const halfAngle = SIDE_POCKET_IDS.has(pocket.id) ? layoutHalf * 0.44 : layoutHalf * 0.56;

  return { centerAngle, halfAngle };
}

function ensureCache(table: Table): TableThroatCache {
  let c = cache.get(table);
  if (c) return c;
  const byPocketId = new Map<number, PocketThroat>();
  for (const p of table.pockets) byPocketId.set(p.id, buildThroat(table, p));
  /** Cep boğaz/yay segmentlerinin yok sayılma yarıçapı: outer arc yarıçapı + biraz pay. */
  const pocketWallRadius = table.pockets[0]
    ? table.pockets[0].radius * (table.layout.pocketOuterWallRadiusScale + 0.55)
    : 30;
  c = { byPocketId, pocketWallRadius };
  cache.set(table, c);
  return c;
}

/**
 * approachDirRad: object→pocket yönü (cep merkezine GİREN açı).
 * Dönen değer 0..1: 1 = mükemmel, 0 = boğaza girmez (taş duvar gibi reddedilir).
 */
export function pocketThroatAcceptance(table: Table, pocket: Pocket, approachDirRad: number): number {
  const c = ensureCache(table);
  const t = c.byPocketId.get(pocket.id);
  if (!t) return 0.5;

  /** Giriş yönünün TERSİ (cep→top) boğaz orta açısına yakın olmalı. */
  const outAngle = approachDirRad + Math.PI;
  const diff = Math.abs(wrapAngle(outAngle - t.centerAngle));

  const innerEdge = t.halfAngle * 0.82;
  if (diff <= innerEdge) return 1.0;
  if (diff >= t.halfAngle) return 0.0;
  /** Lineer yumuşak bölge. */
  const u = (diff - innerEdge) / (t.halfAngle - innerEdge);
  return Math.max(0, 1 - u);
}

/** Bant kontrolünde cep ağzındaki segmentleri yok saymak için yarıçap. */
export function pocketWallIgnoreRadius(table: Table): number {
  return ensureCache(table).pocketWallRadius;
}

/** Debug / test için boğaz açıklığı bilgisi. */
export function pocketThroatInfo(table: Table, pocket: Pocket): { centerAngle: number; halfAngle: number } {
  const c = ensureCache(table);
  const t = c.byPocketId.get(pocket.id);
  return t ?? { centerAngle: 0, halfAngle: table.layout.pocketThroatHalfAngleRad };
}
