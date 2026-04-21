import type { GameEngine, PotHudState } from '../core/GameEngine.js';

export class HUD {
  private readonly root: HTMLElement;
  private readonly topStack: HTMLElement;
  private readonly menuCorner: HTMLButtonElement;
  private readonly bubble: HTMLElement;
  private readonly menu: HTMLElement;
  private readonly end: HTMLElement;

  constructor(root: HTMLElement, private readonly engine: GameEngine) {
    this.root = root;
    root.innerHTML = '';

    this.menu = el('div', 'panel menu interactive');
    this.menu.innerHTML = `
      <div class="title">Vertical 8 Ball</div>
      <div class="sub">Career — single player</div>
    `;

    this.menuCorner = el('button', 'hud-menu-corner interactive') as HTMLButtonElement;
    this.menuCorner.type = 'button';
    this.menuCorner.id = 'btn-menu-compact';
    this.menuCorner.setAttribute('aria-label', 'Restart match');
    this.menuCorner.textContent = '☰';

    this.topStack = el('div', 'hud-top-stack');
    this.topStack.innerHTML = `
      <div class="hud-top">
        <div class="hud-side hud-side-ai">
          <div class="hud-avatar-col">
            <div class="avatar-frame" id="ai-avatar-frame" aria-hidden="true">
              <div class="avatar-inner">
                <img id="ai-avatar-img" class="avatar-photo" src="/avatars/opp.svg" alt="" decoding="async" />
              </div>
            </div>
            <div class="pot-under">
              <div class="pot-label" id="pot-label-left">Opp</div>
              <div id="pot-chips-left" class="pot-chips"></div>
            </div>
          </div>
          <div class="hud-side-text">
            <div class="side-line">
              <span id="opp-name" class="side-name">—</span>
              <span id="opp-lvl" class="lvl-star lvl-star-ai" aria-label="Opponent level">1</span>
            </div>
            <div id="opp-tier" class="side-meta">—</div>
          </div>
        </div>
        <div class="hud-center-col">
          <div class="spin interactive spin-top spin-center" id="spin-pad" aria-label="Spin picker">
            <div class="cue-mini cue-spin-main"><div id="spin-dot" class="spin-dot"></div></div>
          </div>
        </div>
        <div class="hud-side hud-side-player">
          <div class="hud-side-text hud-side-text-right">
            <div class="side-line side-line-end">
              <span id="pl-name" class="side-name">You</span>
              <span id="pl-lvl" class="lvl-star" aria-label="Level">1</span>
            </div>
          </div>
          <div class="hud-avatar-col hud-avatar-col-end">
            <div class="avatar-frame" id="pl-avatar-frame" aria-hidden="true">
              <div class="avatar-inner">
                <img id="pl-avatar-img" class="avatar-photo" src="/avatars/me.svg" alt="" decoding="async" />
              </div>
            </div>
            <div class="pot-under pot-under-end">
              <div class="pot-label pot-label-end" id="pot-label-right">You</div>
              <div id="pot-chips-right" class="pot-chips pot-chips-end"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.bubble = el('div', 'bubble');
    this.bubble.innerHTML = `<div id="bubble-text" class="bubble-text"></div>`;

    this.end = el('div', 'panel end interactive');
    this.end.innerHTML = `
      <div id="end-title" class="title">Match over</div>
      <div id="end-sub" class="sub">—</div>
      <div class="row">
        <button id="btn-next" class="btn primary">Next opponent</button>
        <button id="btn-home" class="btn ghost">Restart</button>
      </div>
    `;

    root.append(this.menu, this.menuCorner, this.topStack, this.bubble, this.end);
    this.hideGame();
  }

  bindHandlers(handlers: {
    onMenu: () => void;
    onNext: () => void;
    onHome: () => void;
    onSpinTap: (nx: number, ny: number) => void;
  }): void {
    this.menuCorner.addEventListener('click', handlers.onMenu);
    this.end.querySelector('#btn-next')!.addEventListener('click', handlers.onNext);
    this.end.querySelector('#btn-home')!.addEventListener('click', handlers.onHome);

    const spin = this.topStack.querySelector('#spin-pad') as HTMLElement;
    spin.addEventListener('pointerdown', (e: Event) => {
      const pe = e as PointerEvent;
      const r = spin.getBoundingClientRect();
      const nx = ((pe.clientX - r.left) / r.width) * 2 - 1;
      const ny = ((pe.clientY - r.top) / r.height) * 2 - 1;
      handlers.onSpinTap(clamp(nx), clamp(ny));
    });
  }

  sync(): void {
    const snap = this.engine.getSnapshot();
    const meta = this.engine.getHudMeta();
    const opp = meta.opponent;
    const phase = snap.phase;

    this.menu.style.display = phase === 'MainMenu' ? 'flex' : 'none';
    this.end.style.display = phase === 'MatchEnd' ? 'flex' : 'none';

    if (phase === 'MatchEnd') {
      if (this.engine.lastMatchWon !== null) {
        this.syncEndOverlay(this.engine.lastMatchWon === true);
      }
      this.topStack.style.display = 'none';
      this.menuCorner.style.display = 'none';
      this.bubble.style.display = 'none';
      return;
    }

    const inMatch = phase !== 'MainMenu';
    this.topStack.style.display = inMatch ? 'block' : 'none';
    this.menuCorner.style.display = inMatch ? 'block' : 'none';
    this.bubble.style.display = inMatch ? 'block' : 'none';

    if (!inMatch) {
      this.menuCorner.style.display = 'none';
      return;
    }

    const t = snap.turnTime01;
    const plFrame = this.topStack.querySelector('#pl-avatar-frame') as HTMLElement;
    const aiFrame = this.topStack.querySelector('#ai-avatar-frame') as HTMLElement;
    const playerRingOn = snap.phase === 'PlayerTurn' && snap.activePlayer === 'player';
    const aiRingOn = snap.phase === 'AITurn';
    plFrame.style.setProperty('--p', String(t));
    aiFrame.style.setProperty('--p', String(t));
    plFrame.classList.toggle('avatar-active', playerRingOn);
    plFrame.classList.toggle('hot', playerRingOn && t < 0.22);
    aiFrame.classList.toggle('avatar-active', aiRingOn);
    aiFrame.classList.toggle('hot', aiRingOn && t < 0.22);

    this.topStack.querySelector('#pl-name')!.textContent = 'You';
    this.topStack.querySelector('#pl-lvl')!.textContent = String(snap.levelIndex + 1);

    this.topStack.querySelector('#opp-name')!.textContent = opp.name;
    this.topStack.querySelector('#opp-tier')!.textContent = opp.tier.toUpperCase();
    this.topStack.querySelector('#opp-lvl')!.textContent = String(
      Math.min(99, snap.levelIndex + 3 + Math.floor(opp.accuracy * 40)),
    );

    const aiImg = this.topStack.querySelector('#ai-avatar-img') as HTMLImageElement;
    aiImg.src = `/avatars/opp.svg?v=${encodeURIComponent(opp.id)}`;
    let hue = 0;
    for (let i = 0; i < opp.id.length; i++) hue = (hue + opp.id.charCodeAt(i) * 37) % 360;
    aiImg.style.filter = `hue-rotate(${hue}deg) saturate(1.08)`;

    const pot = this.engine.getPotHudState();
    this.renderPotStrip(pot);

    const bubbleText = this.bubble.querySelector('#bubble-text')!;
    if (snap.dialogue) {
      bubbleText.textContent = snap.dialogue.text;
      this.bubble.classList.add('show');
    } else {
      bubbleText.textContent = '';
      this.bubble.classList.remove('show');
    }

    const dot = this.topStack.querySelector('#spin-dot') as HTMLElement;
    dot.style.left = `${50 + this.engine.spinX * 38}%`;
    dot.style.top = `${50 + this.engine.spinY * 38}%`;
  }

  private renderPotStrip(pot: PotHudState): void {
    const chipsL = this.topStack.querySelector('#pot-chips-left')!;
    const chipsR = this.topStack.querySelector('#pot-chips-right')!;
    const lblL = this.topStack.querySelector('#pot-label-left')!;
    const lblR = this.topStack.querySelector('#pot-label-right')!;
    const ctx = this.engine.rulesCtx;
    const potUnders = this.topStack.querySelectorAll('.pot-under');

    if (pot.kind === 'open') {
      for (const el of potUnders) (el as HTMLElement).style.display = 'none';
      lblL.textContent = '';
      lblR.textContent = '';
      chipsL.innerHTML = '';
      chipsR.innerHTML = '';
      return;
    }

    for (const el of potUnders) (el as HTMLElement).style.display = '';
    const pg = ctx.playerGroup;
    const ag = ctx.aiGroup;
    if (pg && ag) {
      const youG = pg === 'solid' ? 'Solids' : 'Stripes';
      const oppG = ag === 'solid' ? 'Solids' : 'Stripes';
      lblL.textContent = `Opp · ${oppG}`;
      lblR.textContent = `You · ${youG}`;
      const playerOrder = pg === 'solid' ? SOLID_NUMBERS : STRIPE_NUMBERS;
      const aiOrder = ag === 'solid' ? SOLID_NUMBERS : STRIPE_NUMBERS;
      chipsL.innerHTML = stripOrdered(aiOrder, pot.ai);
      chipsR.innerHTML = stripOrdered(playerOrder, pot.player);
    } else {
      lblL.textContent = 'Opp';
      lblR.textContent = 'You';
      chipsL.innerHTML = pot.ai.map((n) => chipHtml(n)).join('');
      chipsR.innerHTML = pot.player.map((n) => chipHtml(n)).join('');
    }
  }

  private syncEndOverlay(won: boolean): void {
    const title = this.end.querySelector('#end-title')!;
    const sub = this.end.querySelector('#end-sub')!;
    title.textContent = won ? 'You won' : 'You lost';
    sub.textContent = this.engine.getHudMeta().reason;
    (this.end.querySelector('#btn-next') as HTMLElement).style.display = won ? 'inline-flex' : 'none';
  }

  private hideGame(): void {
    this.topStack.style.display = 'none';
    this.menuCorner.style.display = 'none';
    this.bubble.style.display = 'none';
    this.end.style.display = 'none';
  }
}

const SOLID_NUMBERS = [1, 2, 3, 4, 5, 6, 7] as const;
const STRIPE_NUMBERS = [9, 10, 11, 12, 13, 14, 15] as const;

function stripOrdered(order: readonly number[], potted: number[]): string {
  const set = new Set(potted);
  return order.map((n) => (set.has(n) ? chipHtml(n) : slotHtml())).join('');
}

function slotHtml(): string {
  return '<span class="pot-slot" aria-hidden="true"></span>';
}

function chipHtml(n: number): string {
  const bg = chipColor(n);
  return `<span class="pot-chip" style="background:${bg}">${n}</span>`;
}

function chipColor(n: number): string {
  const m: Record<number, string> = {
    1: '#f2c542',
    2: '#2f6bff',
    3: '#e23b3b',
    4: '#6b2fd6',
    5: '#ff7a1a',
    6: '#1f7a4a',
    7: '#6b1f1f',
    9: '#ffd24d',
    10: '#2f6bff',
    11: '#e23b3b',
    12: '#6b2fd6',
    13: '#ff7a1a',
    14: '#1f7a4a',
    15: '#333',
  };
  return m[n] ?? '#888';
}

function el(tag: string, cls: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}

function clamp(v: number, lo = -1, hi = 1): number {
  return Math.max(lo, Math.min(hi, v));
}
