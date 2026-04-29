/**
 * O — maç sırasında kamerayı rakibin sinematik vuruş kadrajına (blend 1) alır; tekrar O ile kapat.
 */
export class OpponentShotCameraToggle {
  private active = false;

  constructor() {
    window.addEventListener('keydown', this.onKey);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
  }

  get(): boolean {
    return this.active;
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    if (e.key !== 'o' && e.key !== 'O') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
    e.preventDefault();
    this.active = !this.active;
  };
}
