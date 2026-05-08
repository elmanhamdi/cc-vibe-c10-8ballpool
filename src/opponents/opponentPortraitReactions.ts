/**
 * Opponents with full-screen reaction portraits (Tungo, Torta Tartaruga, …).
 */

import {
  type PortraitLineKey,
  type TungoReactionKind,
  pickTungoLine,
  randomTimeReactionKind,
  TUNGO_DEFAULT_REACTION_ASSET_ID,
  tungoReactionAssetId,
} from './tungoReactions.js';
import {
  pickTortaTartarugaLine,
  TORTA_TARTARUGA_DEFAULT_REACTION_ASSET_ID,
  tortaTartarugaReactionAssetId,
} from './tortaTartarugaReactions.js';
import {
  GATTOTTO_OTTO_DEFAULT_REACTION_ASSET_ID,
  gattottoOttoReactionAssetId,
  pickGattottoOttoLine,
} from './gattottoOttoReactions.js';

export type PortraitReactionKind = TungoReactionKind;
export type { PortraitLineKey } from './tungoReactions.js';
export { randomTimeReactionKind } from './tungoReactions.js';

const PORTRAIT_REACTION_IDS = new Set<string>(['tungo', 'gattotto_otto', 'torta_tartaruga']);

export function hasPortraitReactionOpponent(opponentId: string): boolean {
  return PORTRAIT_REACTION_IDS.has(opponentId);
}

export function portraitReactionAssetId(opponentId: string, kind: PortraitReactionKind): string {
  if (opponentId === 'torta_tartaruga') return tortaTartarugaReactionAssetId(kind);
  if (opponentId === 'gattotto_otto') return gattottoOttoReactionAssetId(kind);
  return tungoReactionAssetId(kind);
}

export function pickPortraitReactionLine(opponentId: string, key: PortraitLineKey): string {
  if (opponentId === 'torta_tartaruga') return pickTortaTartarugaLine(key);
  if (opponentId === 'gattotto_otto') return pickGattottoOttoLine(key);
  return pickTungoLine(key);
}

export function defaultPortraitReactionAssetId(opponentId: string): string | null {
  if (opponentId === 'tungo') return TUNGO_DEFAULT_REACTION_ASSET_ID;
  if (opponentId === 'gattotto_otto') return GATTOTTO_OTTO_DEFAULT_REACTION_ASSET_ID;
  if (opponentId === 'torta_tartaruga') return TORTA_TARTARUGA_DEFAULT_REACTION_ASSET_ID;
  return null;
}
