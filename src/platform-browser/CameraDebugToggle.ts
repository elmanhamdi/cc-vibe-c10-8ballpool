/**
 * F — opponent / cinematic camera angles overlay (dev).
 */
export class CameraDebugToggle {
  private visible = false;
  private readonly el: HTMLPreElement;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('pre');
    this.el.id = 'camera-debug-overlay';
    this.el.className = 'camera-debug-overlay';
    this.el.setAttribute('aria-live', 'polite');
    this.el.hidden = true;
    parent.appendChild(this.el);
    window.addEventListener('keydown', this.onKey);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
    this.el.remove();
  }

  get(): boolean {
    return this.visible;
  }

  setLines(lines: string[]): void {
    if (!this.visible) return;
    this.el.textContent = lines.join('\n');
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    if (e.key !== 'f' && e.key !== 'F') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
    e.preventDefault();
    this.visible = !this.visible;
    this.el.hidden = !this.visible;
    if (!this.visible) this.el.textContent = '';
  };
}
