/**
 * T — masa mesh grubunu (GLB + procedural) gizle / göster (dev).
 */
export class TableMeshDebugToggle {
  private hidden = false;

  constructor() {
    window.addEventListener('keydown', this.onKey);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
  }

  /** true = masa görünmez */
  get(): boolean {
    return this.hidden;
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    if (e.key !== 't' && e.key !== 'T') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
    e.preventDefault();
    this.hidden = !this.hidden;
  };
}
