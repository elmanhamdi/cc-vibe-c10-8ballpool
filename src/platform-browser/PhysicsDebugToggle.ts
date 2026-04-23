/**
 * URL + keyboard toggle for debug overlay hints (no `window` in core).
 */
export class PhysicsDebugToggle {
  private visible: boolean;

  constructor() {
    const q = new URLSearchParams(window.location.search);
    this.visible = q.has('debug') || q.get('physics') === '1';
    window.addEventListener('keydown', this.onKey);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
  }

  get(): boolean {
    return this.visible;
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    if (e.key !== 'd' && e.key !== 'D') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
    this.visible = !this.visible;
  };
}
