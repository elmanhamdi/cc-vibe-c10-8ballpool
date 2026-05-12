import type { StorageAdapter } from '../core/StorageAdapter.js';

/**
 * Thin wrapper around `window.localStorage` so core/gameplay code stays
 * platform-neutral. Falls back to a no-op implementation if localStorage
 * is unavailable (e.g. privacy mode).
 */
export class BrowserStorageAdapter implements StorageAdapter {
  private readonly storage: Storage | null;

  constructor(storage?: Storage | null) {
    if (storage) {
      this.storage = storage;
    } else if (typeof window !== 'undefined' && window.localStorage) {
      this.storage = window.localStorage;
    } else {
      this.storage = null;
    }
  }

  getItem(key: string): string | null {
    if (!this.storage) return null;
    try {
      return this.storage.getItem(key);
    } catch {
      return null;
    }
  }

  setItem(key: string, value: string): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(key, value);
    } catch {
      /* ignore quota or privacy errors */
    }
  }

  removeItem(key: string): void {
    if (!this.storage) return;
    try {
      this.storage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}
