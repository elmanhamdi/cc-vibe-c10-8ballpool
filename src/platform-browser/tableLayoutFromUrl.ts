import {
  DEFAULT_TABLE_LAYOUT,
  mergeTableLayout,
  TABLE_LAYOUT_KEYS,
  tableLayoutFromJson,
  type TableLayoutConfig,
} from '../physics/tableLayoutConfig.js';
import type { StorageAdapter } from '../core/StorageAdapter.js';

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

export type ResolveTableLayoutOptions = {
  storage?: StorageAdapter;
  /** Raw search string such as `'?tl_key=value'`; defaults to `window.location.search` if present. */
  search?: string;
};

/**
 * Default layout merged with injected storage JSON, then URL `tl_*` overrides (URL wins).
 * Safe to call outside browser (returns defaults only if `window` and storage missing).
 */
export function resolveTableLayoutFromBrowser(options?: ResolveTableLayoutOptions): TableLayoutConfig {
  let merged = { ...DEFAULT_TABLE_LAYOUT };
  const storage = options?.storage;
  const search =
    options?.search ?? (typeof window !== 'undefined' && typeof window.location !== 'undefined'
      ? window.location.search
      : '');

  const rawFromStorage = (() => {
    if (storage) return storage.getItem(STORAGE_KEY);
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        return window.localStorage.getItem(STORAGE_KEY);
      } catch {
        return null;
      }
    }
    return null;
  })();

  if (rawFromStorage) {
    try {
      merged = mergeTableLayout(merged, tableLayoutFromJson(JSON.parse(rawFromStorage) as unknown));
    } catch {
      /* ignore bad JSON */
    }
  }

  if (search) {
    merged = mergeTableLayout(merged, partialTableLayoutFromUrl(search));
  }

  return merged;
}

export { STORAGE_KEY as TABLE_LAYOUT_STORAGE_KEY };
