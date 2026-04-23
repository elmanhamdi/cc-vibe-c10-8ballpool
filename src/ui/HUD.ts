import type { GameInputCommand } from '../core/gameContract.js';
import type { HudState, PotHudState } from '../world/renderTypes.js';

const base = () => import.meta.env.BASE_URL;
const avatar = (name: 'me.svg' | 'opp.svg') => `${base()}avatars/${name}`;

function opponentHudAvatarSrc(opponentId: string): string {
  if (opponentId === 'tung') return `${base()}opponents/tung/hud/tung_avatar.png`;
  return `${avatar('opp.svg')}?v=${encodeURIComponent(opponentId)}`;
}

export class HUD {
  private readonly root: HTMLElement;
  private readonly topStack: HTMLElement;
  private readonly oppReaction: HTMLElement;
  /** So each reaction beat restarts CSS motion from 0%. */
  private lastOppReactionBeatId = -1;
  private readonly menuCorner: HTMLButtonElement;
  private readonly bubble: HTMLElement;
  private readonly menu: HTMLElement;
  private readonly end: HTMLElement;
  private readonly gameRoot: HTMLElement | null;
  private readonly hudLayoutObserver: ResizeObserver;

  constructor(
    root: HTMLElement,
    private readonly getHud: () => HudState,
    private readonly pushCommand: (c: GameInputCommand) => void,
  ) {
    this.root = root;
    this.gameRoot = root.parentElement?.id === 'game-root' ? root.parentElement : null;
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
        <div class="hud-top-main">
          <div class="hud-side hud-side-ai">
            <div class="hud-ident-block">
              <div class="hud-ident-row">
                <div class="avatar-frame" id="ai-avatar-frame" aria-hidden="true">
                  <div class="avatar-inner">
                    <img id="ai-avatar-img" class="avatar-photo" src="${avatar('opp.svg')}" alt="" decoding="async" />
                  </div>
                </div>
                <div class="hud-side-text hud-ident-text">
                  <div class="side-line">
                    <span id="opp-name" class="side-name">—</span>
                    <span id="opp-lvl" class="lvl-star lvl-star-ai" aria-label="Opponent level">1</span>
                  </div>
                  <div id="opp-tier" class="side-meta">—</div>
                </div>
              </div>
            </div>
          </div>
          <div class="hud-center-col">
            <div class="spin interactive spin-top spin-center" id="spin-pad" aria-label="Spin picker">
              <div class="cue-mini cue-spin-main"><div id="spin-dot" class="spin-dot"></div></div>
            </div>
          </div>
          <div class="hud-side hud-side-player">
            <div class="hud-ident-block hud-ident-block--end">
              <div class="hud-ident-row">
                <div class="hud-side-text hud-side-text-right hud-ident-text">
                  <div class="side-line side-line-end">
                    <span id="pl-name" class="side-name">You</span>
                    <span id="pl-lvl" class="lvl-star" aria-label="Level">1</span>
                  </div>
                </div>
                <div class="avatar-frame" id="pl-avatar-frame" aria-hidden="true">
                  <div class="avatar-inner">
                    <img id="pl-avatar-img" class="avatar-photo" src="${avatar('me.svg')}" alt="" decoding="async" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="hud-top-pots" id="hud-top-pots">
          <div class="hud-pot-wrap hud-pot-wrap--ai">
            <div class="pot-under">
              <div class="pot-label" id="pot-label-left">—</div>
              <div id="pot-chips-left" class="pot-chips"></div>
            </div>
          </div>
          <div class="hud-pot-wrap hud-pot-wrap--spacer" aria-hidden="true"></div>
          <div class="hud-pot-wrap hud-pot-wrap--pl">
            <div class="pot-under pot-under-end">
              <div class="pot-label pot-label-end" id="pot-label-right">—</div>
              <div id="pot-chips-right" class="pot-chips pot-chips-end"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.oppReaction = el('div', 'opp-reaction-overlay');
    this.oppReaction.setAttribute('aria-hidden', 'true');
    this.oppReaction.innerHTML = `
      <div class="opp-reaction-stage">
        <div class="opp-reaction-portrait-wrap" aria-hidden="true">
          <div id="opp-reaction-portrait" class="opp-reaction-portrait-inner opp-reaction-portrait--placeholder"></div>
        </div>
        <div class="opp-reaction-text-wrap">
          <p id="opp-reaction-text" class="opp-reaction-text"></p>
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

    root.append(this.menu, this.menuCorner, this.topStack, this.oppReaction, this.bubble, this.end);
    this.hudLayoutObserver = new ResizeObserver(() => this.applyHudTopBandFromLayout());
    this.hudLayoutObserver.observe(this.topStack);
    this.hideGame();
  }

  bindHandlers(): void {
    this.menuCorner.addEventListener('click', () => this.pushCommand({ type: 'menu.restart' }));
    this.end.querySelector('#btn-next')!.addEventListener('click', () => this.pushCommand({ type: 'menu.next' }));
    this.end.querySelector('#btn-home')!.addEventListener('click', () => this.pushCommand({ type: 'menu.home' }));

    const spin = this.topStack.querySelector('#spin-pad') as HTMLElement;
    spin.addEventListener('pointerdown', (e: Event) => {
      const pe = e as PointerEvent;
      const r = spin.getBoundingClientRect();
      const nx = ((pe.clientX - r.left) / r.width) * 2 - 1;
      const ny = ((pe.clientY - r.top) / r.height) * 2 - 1;
      this.pushCommand({ type: 'spin.set', nx: clamp(nx), ny: clamp(ny) });
    });
  }

  syncFromState(): void {
    const h = this.getHud();
    const eb = h.eightBall;
    if (!eb) return;

    const phase = eb.phase;
    const opp = {
      id: eb.opponentId,
      name: eb.opponentName,
      tier: eb.opponentTier,
      accuracy: eb.opponentAccuracy,
    };

    this.menu.style.display = phase === 'MainMenu' ? 'flex' : 'none';
    this.end.style.display = phase === 'MatchEnd' ? 'flex' : 'none';

    if (phase === 'MatchEnd') {
      if (eb.lastMatchWon !== null) {
        this.syncEndOverlay(eb.lastMatchWon === true, eb.reason);
      }
      this.topStack.style.display = 'none';
      this.menuCorner.style.display = 'none';
      this.bubble.style.display = 'none';
      this.lastOppReactionBeatId = -1;
      this.oppReaction.querySelector('.opp-reaction-stage')?.classList.remove('opp-react-anim');
      this.oppReaction.classList.remove('show');
      this.clearHudTopBand();
      return;
    }

    const inMatch = phase !== 'MainMenu';
    this.topStack.style.display = inMatch ? 'flex' : 'none';
    this.menuCorner.style.display = inMatch ? 'block' : 'none';
    this.bubble.style.display = inMatch ? 'block' : 'none';

    if (!inMatch) {
      this.menuCorner.style.display = 'none';
      this.oppReaction.classList.remove('show');
      this.clearHudTopBand();
      return;
    }

    const t = eb.turnTime01;
    const plFrame = this.topStack.querySelector('#pl-avatar-frame') as HTMLElement;
    const aiFrame = this.topStack.querySelector('#ai-avatar-frame') as HTMLElement;
    const playerRingOn = eb.phase === 'PlayerTurn' && eb.activePlayer === 'player';
    const aiRingOn = eb.phase === 'AITurn';
    plFrame.style.setProperty('--p', String(t));
    aiFrame.style.setProperty('--p', String(t));
    plFrame.classList.toggle('avatar-active', playerRingOn);
    plFrame.classList.toggle('hot', playerRingOn && t < 0.22);
    aiFrame.classList.toggle('avatar-active', aiRingOn);
    aiFrame.classList.toggle('hot', aiRingOn && t < 0.22);

    this.topStack.querySelector('#pl-name')!.textContent = 'You';
    this.topStack.querySelector('#pl-lvl')!.textContent = String(eb.levelIndex + 1);

    this.topStack.querySelector('#opp-name')!.textContent = opp.name;
    this.topStack.querySelector('#opp-tier')!.textContent = opp.tier.toUpperCase();
    this.topStack.querySelector('#opp-lvl')!.textContent = String(
      Math.min(99, eb.levelIndex + 3 + Math.floor(opp.accuracy * 40)),
    );

    const aiImg = this.topStack.querySelector('#ai-avatar-img') as HTMLImageElement;
    aiImg.src = opponentHudAvatarSrc(opp.id);
    if (opp.id === 'tung') {
      aiImg.style.filter = '';
    } else {
      let hue = 0;
      for (let i = 0; i < opp.id.length; i++) hue = (hue + opp.id.charCodeAt(i) * 37) % 360;
      aiImg.style.filter = `hue-rotate(${hue}deg) saturate(1.08)`;
    }

    this.renderPotStrip(eb.pot, eb);

    const bubbleText = this.bubble.querySelector('#bubble-text')!;
    const react = eb.opponentReaction;
    if (react) {
      this.oppReaction.classList.add('show');
      this.oppReaction.querySelector('#opp-reaction-text')!.textContent = react.text;
      const portrait = this.oppReaction.querySelector('#opp-reaction-portrait') as HTMLElement;
      if (react.portraitSrc) {
        portrait.classList.remove('opp-reaction-portrait--placeholder');
        portrait.style.backgroundImage = `url("${react.portraitSrc}")`;
      } else {
        portrait.classList.add('opp-reaction-portrait--placeholder');
        portrait.style.backgroundImage = '';
      }
      bubbleText.textContent = '';
      this.bubble.classList.remove('show');

      const stage = this.oppReaction.querySelector('.opp-reaction-stage') as HTMLElement;
      if (react.beatId !== this.lastOppReactionBeatId) {
        this.lastOppReactionBeatId = react.beatId;
        this.oppReaction.style.setProperty('--opp-react-dur', `${react.durationSec}s`);
        stage.classList.remove('opp-react-anim');
        void stage.offsetWidth;
        stage.classList.add('opp-react-anim');
      }
    } else {
      this.lastOppReactionBeatId = -1;
      const stage = this.oppReaction.querySelector('.opp-reaction-stage') as HTMLElement | null;
      stage?.classList.remove('opp-react-anim');
      const portrait = this.oppReaction.querySelector('#opp-reaction-portrait') as HTMLElement | null;
      if (portrait) {
        portrait.classList.add('opp-reaction-portrait--placeholder');
        portrait.style.backgroundImage = '';
      }
      this.oppReaction.classList.remove('show');
      if (eb.dialogueText) {
        bubbleText.textContent = eb.dialogueText;
        this.bubble.classList.add('show');
      } else {
        bubbleText.textContent = '';
        this.bubble.classList.remove('show');
      }
    }

    const dot = this.topStack.querySelector('#spin-dot') as HTMLElement;
    dot.style.left = `${50 + eb.spinX * 38}%`;
    dot.style.top = `${50 + eb.spinY * 38}%`;

    requestAnimationFrame(() => this.applyHudTopBandFromLayout());
  }

  /** Keep canvas `margin-top` equal to actual HUD height so #game-root does not show as a black strip. */
  private applyHudTopBandFromLayout(): void {
    const gr = this.gameRoot;
    if (!gr) return;
    if (this.topStack.style.display === 'none' || getComputedStyle(this.topStack).display === 'none') {
      this.clearHudTopBand();
      return;
    }
    const h = this.topStack.getBoundingClientRect().height;
    if (h < 4) return;
    gr.style.setProperty('--hud-top-band', `${Math.ceil(h)}px`);
  }

  private clearHudTopBand(): void {
    this.gameRoot?.style.removeProperty('--hud-top-band');
  }

  private renderPotStrip(
    pot: PotHudState,
    ctx: NonNullable<HudState['eightBall']>,
  ): void {
    const chipsL = this.topStack.querySelector('#pot-chips-left')!;
    const chipsR = this.topStack.querySelector('#pot-chips-right')!;
    const lblL = this.topStack.querySelector('#pot-label-left')!;
    const lblR = this.topStack.querySelector('#pot-label-right')!;
    const potUnders = this.topStack.querySelectorAll('.pot-under');

    for (const el of potUnders) {
      (el as HTMLElement).style.display = '';
    }

    lblL.textContent = ctx.potTargetLabelOpponent;
    lblR.textContent = ctx.potTargetLabelPlayer;

    if (!ctx.showPotProgressStrip) {
      const eightRow = ctx.eightPocketed ? chipHtml(8) : eightDueHtml();
      chipsL.innerHTML = eightRow;
      chipsR.innerHTML = eightRow;
      return;
    }

    if (pot.kind === 'open') {
      chipsL.innerHTML = stripOrdered(SOLID_NUMBERS, pot.solids);
      chipsR.innerHTML = stripOrdered(STRIPE_NUMBERS, pot.stripes);
      return;
    }

    const pg = ctx.playerGroup;
    const ag = ctx.aiGroup;
    if (pg && ag) {
      const playerOrder = pg === 'solid' ? SOLID_NUMBERS : STRIPE_NUMBERS;
      const aiOrder = ag === 'solid' ? SOLID_NUMBERS : STRIPE_NUMBERS;
      chipsL.innerHTML = stripOrdered(aiOrder, pot.ai);
      chipsR.innerHTML = stripOrdered(playerOrder, pot.player);
    } else {
      chipsL.innerHTML = pot.ai.map((n) => chipHtml(n)).join('');
      chipsR.innerHTML = pot.player.map((n) => chipHtml(n)).join('');
    }
  }

  private syncEndOverlay(won: boolean, reason: string): void {
    const title = this.end.querySelector('#end-title')!;
    const sub = this.end.querySelector('#end-sub')!;
    title.textContent = won ? 'You won' : 'You lost';
    sub.textContent = reason;
    (this.end.querySelector('#btn-next') as HTMLElement).style.display = won ? 'inline-flex' : 'none';
  }

  private hideGame(): void {
    this.topStack.style.display = 'none';
    this.menuCorner.style.display = 'none';
    this.lastOppReactionBeatId = -1;
    this.oppReaction.querySelector('.opp-reaction-stage')?.classList.remove('opp-react-anim');
    this.oppReaction.classList.remove('show');
    this.bubble.style.display = 'none';
    this.end.style.display = 'none';
    this.clearHudTopBand();
  }
}

const SOLID_NUMBERS = [1, 2, 3, 4, 5, 6, 7] as const;
const STRIPE_NUMBERS = [9, 10, 11, 12, 13, 14, 15] as const;

function chipColor(n: number): string {
  const m: Record<number, string> = {
    1: '#f2c542',
    2: '#2f6bff',
    3: '#e23b3b',
    4: '#6b2fd6',
    5: '#ff7a1a',
    6: '#1f7a4a',
    7: '#6b1f1f',
    8: '#141414',
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

function stripOrdered(order: readonly number[], potted: number[]): string {
  const set = new Set(potted);
  return order.map((n) => (set.has(n) ? chipHtml(n) : slotHtml())).join('');
}

/** 8-ball still on table — show target digit before group strip appears. */
function eightDueHtml(): string {
  return '<span class="pot-eight-due" aria-hidden="true">8</span>';
}

function slotHtml(): string {
  return '<span class="pot-slot" aria-hidden="true"></span>';
}

function chipHtml(n: number): string {
  const bg = chipColor(n);
  return `<span class="pot-chip" style="background:${bg}">${n}</span>`;
}

function el(tag: string, cls: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}

function clamp(v: number, lo = -1, hi = 1): number {
  return Math.max(lo, Math.min(hi, v));
}
