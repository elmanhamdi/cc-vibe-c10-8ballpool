import {
  DEFAULT_TABLE_LAYOUT,
  mergeTableLayout,
  TABLE_LAYOUT_KEYS,
  tableLayoutFromJson,
  type TableLayoutConfig,
} from '../physics/tableLayoutConfig.js';

const STORAGE_KEY = 'poolTableLayoutJson';
const URL_PREFIX = 'tl_';

/** Parse `tl_key=value` from `URLSearchParams` into partial layout. */
export function partialTableLayoutFromUrl(search: string): Partial<TableLayoutConfig> {
  const params = new URLSearchParams(search);
  const partial: Partial<TableLayoutConfig> = {};
  for (const [rawKey, rawVal] of params.entries()) {
    if (!rawKey.startsWith(URL_PREFIX)) continue;
    const key = rawKey.slice(URL_PREFIX.length) as keyof TableLayoutConfig;
    if (!TABLE_LAYOUT_KEYS.includes(key)) continue;
    const n = Number(rawVal);
    if (!Number.isFinite(n)) continue;
    (partial as Record<string, number>)[key] = n;
  }
  return partial;
}

/**
 * Default layout merged with `localStorage` JSON, then URL `tl_*` overrides (URL wins).
 * Safe to call outside browser (returns defaults only if `window` missing).
 */
export function resolveTableLayoutFromBrowser(): TableLayoutConfig {
  let merged = { ...DEFAULT_TABLE_LAYOUT };
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) merged = mergeTableLayout(merged, tableLayoutFromJson(JSON.parse(raw) as unknown));
    } catch {
      /* ignore bad JSON */
    }
    merged = mergeTableLayout(merged, partialTableLayoutFromUrl(window.location.search));
  }
  return merged;
}

export { STORAGE_KEY as TABLE_LAYOUT_STORAGE_KEY };
