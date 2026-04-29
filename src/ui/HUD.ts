import type { GameInputCommand } from '../core/gameContract.js';
import type { HudState, PotHudState } from '../world/renderTypes.js';
import { AssetManifest } from '../assets/AssetManifest.js';
import { AssetIds } from '../assets/AssetIds.js';
import { resolveBrowserAssetUrl } from '../assets/resolveBrowserAssetUrl.js';
import { SHOP_CUE_CATALOG } from '../core/ShopCatalog.js';

const SOUND_ICON_ON_URL = new URL('./sound.png', import.meta.url).href;
const SOUND_ICON_OFF_URL = new URL('./sound_off.png', import.meta.url).href;
const SOLID_BALL_ICON_URL = new URL('./SolidBall.png', import.meta.url).href;
const STRIPE_BALL_ICON_URL = new URL('./StripeBall.png', import.meta.url).href;

function opponentHudAvatarUrl(assetBaseUrl: string, opponentId: string): string {
  if (opponentId === 'tung') {
    const e = AssetManifest['ui.opponent.tung.avatar'];
    return resolveBrowserAssetUrl(assetBaseUrl, e.browserUrl);
  }
  if (opponentId === 'balleeina') {
    const e = AssetManifest['ui.opponent.balleeina.avatar'] ?? AssetManifest['ui.avatar.genericOpponent'];
    return resolveBrowserAssetUrl(assetBaseUrl, e.browserUrl);
  }
  const e = AssetManifest['ui.avatar.genericOpponent'];
  const u = resolveBrowserAssetUrl(assetBaseUrl, e.browserUrl);
  return `${u}?v=${encodeURIComponent(opponentId)}`;
}

export class HUD {
  private readonly root: HTMLElement;
  private readonly topStack: HTMLElement;
  private readonly oppReaction: HTMLElement;
  /** So each reaction beat restarts CSS motion from 0%. */
  private lastOppReactionBeatId = -1;
  private readonly bubble: HTMLElement;
  private readonly menu: HTMLElement;
  private readonly end: HTMLElement;
  private readonly endReward: HTMLElement;
  private readonly endBalance: HTMLElement;
  private readonly btnNext: HTMLButtonElement;
  private readonly btnRematch: HTMLButtonElement;
  private readonly btnShop: HTMLButtonElement;
  private readonly confettiLayer: HTMLElement;
  private readonly nextModal: HTMLElement;
  private readonly nextAvatar: HTMLImageElement;
  private readonly nextName: HTMLElement;
  private readonly nextTier: HTMLElement;
  private readonly nextAccept: HTMLButtonElement;
  private ringAudio: HTMLAudioElement | null = null;
  private confettiTimeout: number | null = null;
  private readonly soundBtn: HTMLButtonElement;
  private readonly soundBtnIcon: HTMLImageElement;
  private readonly statsOverlay: HTMLElement;
  private readonly statsTitle: HTMLElement;
  private readonly statsList: HTMLElement;
  private readonly levelOverlay: HTMLElement;
  private readonly levelTitle: HTMLElement;
  private readonly levelProgressBar: HTMLElement;
  private readonly levelProgressText: HTMLElement;
  private readonly levelCurrentRank: HTMLElement;
  private readonly levelNextRank: HTMLElement;
  private readonly levelWinsNeeded: HTMLElement;
  private readonly levelReward: HTMLElement;
  private readonly menuLevel: HTMLElement;
  private readonly endLevel: HTMLElement;
  private readonly shopOverlay: HTMLElement;
  private readonly shopList: HTMLElement;
  private readonly shopCoins: HTMLElement;
  private lastShopSignature = '';
  private readonly rewardWin: HTMLElement;
  private lastProfile: HudState['profile'] | null = null;
  private lastEightBall: HudState['eightBall'] | null = null;
  private statsVisibleFor: 'player' | 'opponent' | null = null;
  private levelVisible = false;
  private soundMuted = false;
  private readonly gameRoot: HTMLElement | null;
  private readonly hudLayoutObserver: ResizeObserver;

  constructor(
    root: HTMLElement,
    private readonly getHud: () => HudState,
    private readonly pushCommand: (c: GameInputCommand) => void,
    private readonly assetBaseUrl: string,
    private readonly opts?: {
      toggleSound?: () => boolean;
      isSoundMuted?: () => boolean;
    },
  ) {
    this.root = root;
    this.gameRoot = root.parentElement?.id === 'game-root' ? root.parentElement : null;
    root.innerHTML = '';

    this.menu = el('div', 'panel menu interactive');
    this.menu.innerHTML = `
      <div class="title">Vertical 8 Ball</div>
      <div class="sub">Career — single player</div>
      <div class="menu-level-row">
        <span class="menu-level-label">Your level</span>
        <span id="menu-lvl" class="lvl-star lvl-clickable" aria-label="Level">1</span>
      </div>
    `;

    this.topStack = el('div', 'hud-top-stack');
    this.topStack.innerHTML = `
      <div class="hud-top">
        <div class="hud-top-main">
          <div class="hud-side hud-side-ai">
            <div class="hud-ident-block">
              <div class="hud-ident-row">
                <div class="avatar-frame interactive" id="ai-avatar-frame" aria-hidden="true">
                  <div class="avatar-inner">
                    <img id="ai-avatar-img" class="avatar-photo" src="${resolveBrowserAssetUrl(this.assetBaseUrl, AssetManifest['ui.avatar.genericOpponent'].browserUrl)}" alt="" decoding="async" />
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
            <div class="hud-reward" id="hud-reward-win" aria-live="polite"></div>
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
                <div class="avatar-frame interactive" id="pl-avatar-frame" aria-hidden="true">
                  <div class="avatar-inner">
                    <img id="pl-avatar-img" class="avatar-photo" src="${resolveBrowserAssetUrl(this.assetBaseUrl, AssetManifest['ui.avatar.player'].browserUrl)}" alt="" decoding="async" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="hud-top-pots" id="hud-top-pots">
          <div class="hud-pot-wrap hud-pot-wrap--ai">
            <div class="pot-under">
              <div class="pot-label" id="pot-label-left"></div>
              <div id="pot-chips-left" class="pot-chips"></div>
            </div>
          </div>
          <div class="hud-pot-wrap hud-pot-wrap--spacer" aria-hidden="true"></div>
          <div class="hud-pot-wrap hud-pot-wrap--pl">
            <div class="pot-under pot-under-end">
              <div class="pot-label pot-label-end" id="pot-label-right"></div>
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
      <div class="end-card">
        <div class="end-head">
          <div id="end-title" class="title">MATCH OVER</div>
          <div id="end-sub" class="sub">—</div>
          <div class="end-level-row">
            <span class="end-level-label">Your level</span>
            <span id="end-lvl" class="lvl-star lvl-clickable" aria-label="Level">1</span>
          </div>
        </div>
        <div class="end-coins">
          <div class="end-coins-row">
            <span class="end-coins-label">Reward</span>
            <span id="end-reward" class="end-coins-value">+0</span>
          </div>
          <div class="end-coins-row">
            <span class="end-coins-label">Balance</span>
            <span id="end-balance" class="end-coins-value">0</span>
          </div>
        </div>
        <div class="end-actions">
          <button id="btn-shop" class="btn ghost">Shop</button>
          <div class="end-actions-main">
            <button id="btn-rematch" class="btn ghost">Rematch</button>
            <button id="btn-next" class="btn btn-next primary">Next Match</button>
          </div>
        </div>
      </div>
      <div id="confetti-layer" class="confetti-layer" aria-hidden="true"></div>
    `;
    this.endReward = this.end.querySelector('#end-reward') as HTMLElement;
    this.endBalance = this.end.querySelector('#end-balance') as HTMLElement;
    this.btnNext = this.end.querySelector('#btn-next') as HTMLButtonElement;
    this.btnRematch = this.end.querySelector('#btn-rematch') as HTMLButtonElement;
    this.btnShop = this.end.querySelector('#btn-shop') as HTMLButtonElement;
    this.confettiLayer = this.end.querySelector('#confetti-layer') as HTMLElement;

    this.statsOverlay = el('div', 'hud-stats-overlay');
    this.statsOverlay.innerHTML = `
      <div class="hud-stats-backdrop" id="hud-stats-backdrop"></div>
      <div class="hud-stats-modal">
        <button class="hud-stats-close" id="hud-stats-close" aria-label="Close stats">×</button>
        <div class="hud-stats-title" id="hud-stats-title">Stats</div>
        <div class="hud-stats-grid" id="hud-stats-grid"></div>
      </div>
    `;
    this.statsTitle = this.statsOverlay.querySelector('#hud-stats-title') as HTMLElement;
    this.statsList = this.statsOverlay.querySelector('#hud-stats-grid') as HTMLElement;

    this.levelOverlay = el('div', 'hud-level-overlay');
    this.levelOverlay.innerHTML = `
      <div class="hud-level-backdrop" id="hud-level-backdrop"></div>
      <div class="hud-level-modal">
        <button class="hud-level-close" id="hud-level-close" aria-label="Close level details">×</button>
        <div class="hud-level-title" id="hud-level-title">Rank</div>
        <div class="hud-level-current">
          <div class="hud-level-label">Current rank</div>
          <div class="hud-level-value" id="hud-level-current">—</div>
        </div>
        <div class="hud-level-progress">
          <div class="hud-level-progress-track">
            <div class="hud-level-progress-bar" id="hud-level-progress-bar"></div>
          </div>
          <div class="hud-level-progress-text" id="hud-level-progress-text">—</div>
        </div>
        <div class="hud-level-row">
          <div class="hud-level-label">Next rank</div>
          <div class="hud-level-value" id="hud-level-next">—</div>
        </div>
        <div class="hud-level-row">
          <div class="hud-level-label">Wins needed</div>
          <div class="hud-level-value" id="hud-level-wins-needed">—</div>
        </div>
        <div class="hud-level-row">
          <div class="hud-level-label">Win reward</div>
          <div class="hud-level-value" id="hud-level-reward">—</div>
        </div>
      </div>
    `;
    this.levelTitle = this.levelOverlay.querySelector('#hud-level-title') as HTMLElement;
    this.levelProgressBar = this.levelOverlay.querySelector('#hud-level-progress-bar') as HTMLElement;
    this.levelProgressText = this.levelOverlay.querySelector('#hud-level-progress-text') as HTMLElement;
    this.levelCurrentRank = this.levelOverlay.querySelector('#hud-level-current') as HTMLElement;
    this.levelNextRank = this.levelOverlay.querySelector('#hud-level-next') as HTMLElement;
    this.levelWinsNeeded = this.levelOverlay.querySelector('#hud-level-wins-needed') as HTMLElement;
    this.levelReward = this.levelOverlay.querySelector('#hud-level-reward') as HTMLElement;
    this.menuLevel = this.menu.querySelector('#menu-lvl') as HTMLElement;
    this.endLevel = this.end.querySelector('#end-lvl') as HTMLElement;

    this.shopOverlay = el('div', 'hud-shop-overlay');
    this.shopOverlay.innerHTML = `
      <div class="hud-shop-backdrop" id="hud-shop-backdrop"></div>
      <div class="hud-shop-modal">
        <div class="hud-shop-header">
          <div class="hud-shop-title">Cue Shop</div>
          <div class="hud-shop-balance" id="hud-shop-coins">0 🪙</div>
          <button class="hud-shop-close" id="hud-shop-close" aria-label="Close shop">×</button>
        </div>
        <div class="hud-shop-grid" id="hud-shop-grid"></div>
      </div>
    `;
    this.shopList = this.shopOverlay.querySelector('#hud-shop-grid') as HTMLElement;
    this.shopCoins = this.shopOverlay.querySelector('#hud-shop-coins') as HTMLElement;

    this.nextModal = el('div', 'hud-next-overlay');
    this.nextModal.innerHTML = `
      <div class="hud-next-backdrop" id="hud-next-backdrop"></div>
      <div class="hud-next-modal">
        <div class="hud-next-title">Searching next opponent...</div>
        <div class="hud-next-card">
          <div class="hud-next-avatar-wrap ringing" id="hud-next-avatar-wrap">
            <img id="hud-next-avatar" class="hud-next-avatar" alt="Next opponent" decoding="async" />
          </div>
          <div class="hud-next-meta">
            <div id="hud-next-name" class="hud-next-name">—</div>
            <div id="hud-next-tier" class="hud-next-tier">—</div>
          </div>
        </div>
        <button id="hud-next-accept" class="btn primary">Accept New Match</button>
      </div>
    `;
    this.nextAvatar = this.nextModal.querySelector('#hud-next-avatar') as HTMLImageElement;
    this.nextName = this.nextModal.querySelector('#hud-next-name') as HTMLElement;
    this.nextTier = this.nextModal.querySelector('#hud-next-tier') as HTMLElement;
    this.nextAccept = this.nextModal.querySelector('#hud-next-accept') as HTMLButtonElement;

    this.soundBtn = document.createElement('button');
    this.soundBtn.className = 'hud-sound-btn interactive';
    this.soundBtn.type = 'button';
    this.soundBtn.setAttribute('aria-label', 'Toggle sound');
    this.soundBtnIcon = document.createElement('img');
    this.soundBtnIcon.className = 'hud-sound-btn-icon';
    this.soundBtnIcon.alt = '';
    this.soundBtnIcon.decoding = 'async';
    this.soundBtn.append(this.soundBtnIcon);

    this.rewardWin = this.topStack.querySelector('#hud-reward-win') as HTMLElement;

    root.append(
      this.menu,
      this.topStack,
      this.oppReaction,
      this.bubble,
      this.end,
      this.statsOverlay,
      this.levelOverlay,
      this.shopOverlay,
      this.nextModal,
      this.soundBtn,
    );
    this.soundMuted = this.opts?.isSoundMuted?.() ?? false;
    this.syncSoundButtonVisual();
    this.hudLayoutObserver = new ResizeObserver(() => this.applyHudTopBandFromLayout());
    this.hudLayoutObserver.observe(this.topStack);
    this.hideGame();
  }

  bindHandlers(): void {
    this.btnNext.addEventListener('click', () => this.showNextMatchModal());
    this.btnRematch.addEventListener('click', () => this.pushCommand({ type: 'menu.restart' }));
    this.btnShop.addEventListener('click', () => this.showShopOverlay());

    const spin = this.topStack.querySelector('#spin-pad') as HTMLElement;
    spin.addEventListener('pointerdown', (e: Event) => {
      const pe = e as PointerEvent;
      const r = spin.getBoundingClientRect();
      const nx = ((pe.clientX - r.left) / r.width) * 2 - 1;
      const ny = ((pe.clientY - r.top) / r.height) * 2 - 1;
      this.pushCommand({ type: 'spin.set', nx: clamp(nx), ny: clamp(ny) });
    });

    const statsClose = this.statsOverlay.querySelector('#hud-stats-close') as HTMLElement;
    const statsBackdrop = this.statsOverlay.querySelector('#hud-stats-backdrop') as HTMLElement;
    statsClose.addEventListener('click', () => this.hideStatsOverlay());
    statsBackdrop.addEventListener('click', () => this.hideStatsOverlay());

    const levelClose = this.levelOverlay.querySelector('#hud-level-close') as HTMLElement;
    const levelBackdrop = this.levelOverlay.querySelector('#hud-level-backdrop') as HTMLElement;
    levelClose.addEventListener('click', () => this.hideLevelOverlay());
    levelBackdrop.addEventListener('click', () => this.hideLevelOverlay());

    const shopClose = this.shopOverlay.querySelector('#hud-shop-close') as HTMLElement;
    const shopBackdrop = this.shopOverlay.querySelector('#hud-shop-backdrop') as HTMLElement;
    shopClose.addEventListener('click', () => this.hideShopOverlay());
    shopBackdrop.addEventListener('click', () => this.hideShopOverlay());
    this.shopList.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const btn = t.closest('[data-buy],[data-equip]') as HTMLElement | null;
      if (!btn) return;
      const buy = btn.dataset.buy;
      const equip = btn.dataset.equip;
      if (buy) this.pushCommand({ type: 'shop.buyCue', cueId: buy });
      if (equip) this.pushCommand({ type: 'shop.equipCue', cueId: equip });
    });

    const nextBackdrop = this.nextModal.querySelector('#hud-next-backdrop') as HTMLElement;
    nextBackdrop.addEventListener('click', () => this.hideNextMatchModal());
    this.nextAccept.addEventListener('click', () => {
      this.hideNextMatchModal();
      this.pushCommand({ type: 'menu.next' });
    });

    const plAvatar = this.topStack.querySelector('#pl-avatar-frame') as HTMLElement;
    const aiAvatar = this.topStack.querySelector('#ai-avatar-frame') as HTMLElement;
    const plLevel = this.topStack.querySelector('#pl-lvl') as HTMLElement | null;
    plAvatar.addEventListener('click', () => this.showStatsOverlay('player'));
    aiAvatar.addEventListener('click', () => this.showStatsOverlay('opponent'));
    if (plLevel) {
      plLevel.classList.add('lvl-clickable');
      plLevel.setAttribute('role', 'button');
      plLevel.setAttribute('tabindex', '0');
      plLevel.addEventListener('click', () => this.showLevelOverlay());
      plLevel.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.showLevelOverlay();
        }
      });
    }
    if (this.menuLevel) {
      this.menuLevel.setAttribute('role', 'button');
      this.menuLevel.setAttribute('tabindex', '0');
      this.menuLevel.addEventListener('click', () => this.showLevelOverlay());
      this.menuLevel.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.showLevelOverlay();
        }
      });
    }
    if (this.endLevel) {
      this.endLevel.setAttribute('role', 'button');
      this.endLevel.setAttribute('tabindex', '0');
      this.endLevel.addEventListener('click', () => this.showLevelOverlay());
      this.endLevel.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.showLevelOverlay();
        }
      });
    }

    this.soundBtn.addEventListener('click', () => {
      this.soundMuted = this.opts?.toggleSound?.() ?? !this.soundMuted;
      this.syncSoundButtonVisual();
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
    const levelLabel = String(eb.levelIndex + 1);
    this.lastProfile = h.profile ?? null;
    this.lastEightBall = eb;

    this.menu.style.display = phase === 'MainMenu' ? 'flex' : 'none';
    this.end.style.display = phase === 'MatchEnd' ? 'flex' : 'none';
    this.soundBtn.style.display = phase === 'MainMenu' ? 'none' : 'inline-flex';

    if (phase === 'MatchEnd') {
      if (eb.lastMatchWon !== null) {
        this.syncEndOverlay(eb.lastMatchWon === true, eb.reason, h);
      }
      if (this.menuLevel) this.menuLevel.textContent = levelLabel;
      if (this.endLevel) this.endLevel.textContent = levelLabel;
      this.topStack.style.display = 'none';
      this.bubble.style.display = 'none';
      this.lastOppReactionBeatId = -1;
      this.oppReaction.querySelector('.opp-reaction-stage')?.classList.remove('opp-react-anim');
      this.oppReaction.classList.remove('show');
      this.clearHudTopBand();
      this.hideStatsOverlay();
      this.renderShopPanel(h);
      return;
    }

    this.stopConfetti();
    this.stopRingAudio();
    this.hideNextMatchModal();
    this.hideShopOverlay();

    const inMatch = phase !== 'MainMenu';
    this.topStack.style.display = inMatch ? 'flex' : 'none';
    this.bubble.style.display = inMatch ? 'block' : 'none';

    if (!inMatch) {
      this.oppReaction.classList.remove('show');
      this.clearHudTopBand();
      if (this.menuLevel) this.menuLevel.textContent = levelLabel;
      if (this.endLevel) this.endLevel.textContent = levelLabel;
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
    this.topStack.querySelector('#pl-lvl')!.textContent = levelLabel;
    if (this.menuLevel) this.menuLevel.textContent = levelLabel;
    if (this.endLevel) this.endLevel.textContent = levelLabel;

    this.topStack.querySelector('#opp-name')!.textContent = opp.name;
    this.topStack.querySelector('#opp-tier')!.textContent = opp.tier.toUpperCase();
    this.topStack.querySelector('#opp-lvl')!.textContent = String(
      Math.min(99, eb.levelIndex + 3 + Math.floor(opp.accuracy * 40)),
    );

    const aiImg = this.topStack.querySelector('#ai-avatar-img') as HTMLImageElement;
    aiImg.src = opponentHudAvatarUrl(this.assetBaseUrl, opp.id);
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
      let src = '';
      if (react.portraitAssetId) {
        const entry = AssetManifest[react.portraitAssetId as keyof typeof AssetManifest];
        src = entry ? resolveBrowserAssetUrl(this.assetBaseUrl, entry.browserUrl) : '';
      }
      if (!src) {
        src = opponentHudAvatarUrl(this.assetBaseUrl, opp.id);
      }
      portrait.classList.remove('opp-reaction-portrait--placeholder');
      portrait.style.backgroundImage = src ? `url("${src}")` : '';
      if (!src) portrait.classList.add('opp-reaction-portrait--placeholder');
      bubbleText.textContent = '';
      this.bubble.classList.remove('show');
      this.bubble.style.display = 'none';

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
      const hasDialogue = typeof eb.dialogueText === 'string' && eb.dialogueText.trim().length > 0;
      if (hasDialogue) {
        bubbleText.textContent = eb.dialogueText!;
        this.bubble.classList.add('show');
        this.bubble.style.display = 'block';
      } else {
        bubbleText.textContent = '';
        this.bubble.classList.remove('show');
        this.bubble.style.display = 'none';
      }
    }

    const dot = this.topStack.querySelector('#spin-dot') as HTMLElement;
    dot.style.left = `${50 + eb.spinX * 38}%`;
    dot.style.top = `${50 + eb.spinY * 38}%`;

    if (this.statsVisibleFor) {
      this.renderStatsModal(this.statsVisibleFor, this.lastProfile, eb);
    }
    if (this.levelVisible) {
      this.renderLevelOverlay(this.lastProfile, h.coinRewardWin ?? 0);
    }

    if (h.coinRewardWin != null) {
      this.rewardWin.textContent = `${formatNumber(h.coinRewardWin)} 🪙`;
      this.rewardWin.style.display = '';
    } else {
      this.rewardWin.textContent = '';
      this.rewardWin.style.display = 'none';
    }

    this.renderShopPanel(h);

    requestAnimationFrame(() => this.applyHudTopBandFromLayout());
  }

  private renderStatsModal(
    kind: 'player' | 'opponent',
    profile: HudState['profile'] | null,
    eb: NonNullable<HudState['eightBall']>,
  ): void {
    const isPlayer = kind === 'player';
    this.statsTitle.textContent = isPlayer ? 'Your stats' : `${eb.opponentName} stats`;
    const entries: { label: string; value: string }[] = [];
    if (isPlayer && profile) {
      entries.push({ label: 'Coins', value: formatNumber(profile.coins) });
      entries.push({ label: 'Rank', value: profile.rankName });
      if (profile.nextRankName) {
        entries.push({
          label: 'Next rank',
          value: `${profile.nextRankName} (${formatPercent(profile.rankProgress01)})`,
        });
      }
      entries.push({ label: 'Wins', value: formatNumber(profile.wins) });
      entries.push({ label: 'Losses', value: formatNumber(profile.losses) });
      entries.push({ label: 'Win rate', value: formatPercent(profile.winRate) });
      entries.push({ label: 'Streak', value: `${profile.currentStreak} (best ${profile.bestStreak})` });
    } else {
      entries.push({ label: 'Coins', value: '—' });
      entries.push({ label: 'Rank', value: eb.opponentTier });
      entries.push({ label: 'Accuracy', value: `${Math.round(eb.opponentAccuracy * 100)}%` });
      entries.push({ label: 'Name', value: eb.opponentName });
    }
    this.statsList.innerHTML = entries
      .map(
        (e) => `
        <div class="hud-stats-row">
          <span class="hud-stats-label">${e.label}</span>
          <span class="hud-stats-value">${e.value}</span>
        </div>`,
      )
      .join('');
  }

  private renderLevelOverlay(profile: HudState['profile'] | null, coinRewardWin: number): void {
    if (!profile) return;
    const progress = Math.max(0, Math.min(1, profile.rankProgress01 ?? 0));
    const nextName = profile.nextRankName;
    const nextAt = profile.nextRankAtWins;
    const wins = profile.wins ?? 0;
    const winsNeeded = nextAt != null ? Math.max(0, nextAt - wins) : 0;
    this.levelTitle.textContent = 'Rank & Level';
    this.levelCurrentRank.textContent = profile.rankName;
    this.levelProgressBar.style.setProperty('--p', `${Math.round(progress * 100)}%`);
    this.levelProgressText.textContent = nextName
      ? `${formatPercent(progress)} toward ${nextName}`
      : `${formatPercent(progress)} — top rank reached`;
    this.levelNextRank.textContent = nextName
      ? `${nextName} at ${formatNumber(nextAt ?? 0)} wins`
      : 'Max rank';
    this.levelWinsNeeded.textContent = nextName
      ? `${formatNumber(winsNeeded)} more win${winsNeeded === 1 ? '' : 's'}`
      : '—';
    this.levelReward.textContent = `${coinRewardWin > 0 ? '+' : ''}${formatNumber(
      coinRewardWin,
    )} 🪙 per win`;
  }

  private showLevelOverlay(): void {
    this.levelVisible = true;
    this.renderLevelOverlay(this.lastProfile, this.getHud().coinRewardWin ?? 0);
    this.levelOverlay.classList.add('show');
  }

  private hideLevelOverlay(): void {
    this.levelVisible = false;
    this.levelOverlay.classList.remove('show');
  }

  private renderShopPanel(h: HudState): void {
    const profile = h.profile;
    if (!profile) return;
    const catalog = h.shop?.catalog ?? SHOP_CUE_CATALOG;
    const owned = new Set(profile.ownedCueIds ?? []);
    const equipped = profile.equippedCueId;
    const coins = profile.coins ?? 0;
    this.shopCoins.textContent = `${formatNumber(coins)} 🪙`;
    /** Skip rebuilds while shop closed or content unchanged so click delegation survives between mousedown/up. */
    const signature = `${coins}|${equipped}|${[...owned].sort().join(',')}|${catalog.map((c) => c.id).join(',')}`;
    const shopVisible = this.shopOverlay.classList.contains('show');
    if (!shopVisible) {
      this.lastShopSignature = signature;
      return;
    }
    if (signature === this.lastShopSignature && this.shopList.childElementCount > 0) return;
    this.lastShopSignature = signature;
    this.shopList.innerHTML = catalog
      .map((item) => {
        const isOwned = owned.has(item.id);
        const isEquipped = equipped === item.id;
        const canBuy = coins >= item.price;
        let actionLabel = '';
        let actionClass = 'ghost';
        let actionData = '';
        let actionDisabled = false;
        if (isOwned) {
          if (isEquipped) {
            actionLabel = 'Equipped';
            actionClass = 'ghost';
            actionDisabled = true;
          } else {
            actionLabel = 'Equip';
            actionClass = 'primary';
            actionData = `data-equip="${item.id}"`;
          }
        } else {
          actionLabel = `${formatNumber(item.price)} 🪙 Buy`;
          actionClass = canBuy ? 'primary' : 'ghost';
          actionData = `data-buy="${item.id}"`;
          actionDisabled = !canBuy;
        }
        const accent = item.accent ? `style="--accent:${item.accent}"` : '';
        const stats = item.stats
          ? `<div class="shop-card-stats">
              <span>Power ${item.stats.power.toFixed(2)}</span>
              <span>Aim ${item.stats.aim.toFixed(2)}</span>
              <span>Spin ${item.stats.spin.toFixed(2)}</span>
            </div>`
          : '';
        return `
        <div class="shop-card" data-cue="${item.id}" ${accent}>
          <div class="shop-card-head">
            <div class="shop-card-name">${item.name}</div>
            <div class="shop-card-price">${formatNumber(item.price)} 🪙</div>
          </div>
          <div class="shop-card-desc">${item.description ?? ''}</div>
          ${stats}
          <div class="shop-card-actions">
            <button class="btn ${actionClass}" ${actionData} ${actionDisabled ? 'data-disabled="true"' : ''}>${actionLabel}</button>
            <div class="shop-card-tag">${isOwned ? (isEquipped ? 'Equipped' : 'Owned') : ''}</div>
          </div>
        </div>`;
      })
      .join('');
  }

  private hideStatsOverlay(): void {
    this.statsVisibleFor = null;
    this.statsOverlay.classList.remove('show');
  }

  private showStatsOverlay(kind: 'player' | 'opponent'): void {
    const eb = this.lastEightBall;
    if (!eb) return;
    this.statsVisibleFor = kind;
    this.renderStatsModal(kind, this.lastProfile, eb);
    this.statsOverlay.classList.add('show');
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

  private startConfetti(): void {
    const layer = this.confettiLayer;
    if (!layer) return;
    if (layer.classList.contains('show') && layer.childElementCount > 0) return;
    layer.innerHTML = '';
    layer.classList.add('show');
    const colors = ['#ffb347', '#ffd166', '#7ee8fa', '#ff6f91', '#9b8cff'];
    const pieces = 70;
    for (let i = 0; i < pieces; i++) {
      const p = document.createElement('span');
      p.className = 'confetti-piece';
      const left = Math.random() * 100;
      const delay = Math.random() * 0.8;
      const duration = 2.4 + Math.random() * 0.9;
      const size = 6 + Math.random() * 6;
      p.style.left = `${left}%`;
      p.style.width = `${size}px`;
      p.style.height = `${size * 0.4}px`;
      p.style.animationDelay = `${delay}s`;
      p.style.animationDuration = `${duration}s`;
      p.style.background = colors[i % colors.length]!;
      layer.appendChild(p);
    }
    if (this.confettiTimeout !== null) {
      window.clearTimeout(this.confettiTimeout);
    }
    this.confettiTimeout = window.setTimeout(() => this.stopConfetti(), 3200);
  }

  private stopConfetti(): void {
    const layer = this.confettiLayer;
    if (!layer) return;
    layer.classList.remove('show');
    layer.innerHTML = '';
    if (this.confettiTimeout !== null) {
      window.clearTimeout(this.confettiTimeout);
      this.confettiTimeout = null;
    }
  }

  private startRingAudio(): void {
    try {
      if (this.ringAudio) {
        this.ringAudio.currentTime = 0;
        this.ringAudio.loop = true;
        void this.ringAudio.play().catch(() => {});
        return;
      }
      const entry = AssetManifest[AssetIds.soundPhoneRing as keyof typeof AssetManifest];
      if (!entry) return;
      const url = resolveBrowserAssetUrl(this.assetBaseUrl, entry.browserUrl);
      const a = new Audio(url);
      a.loop = true;
      a.volume = 0.9;
      this.ringAudio = a;
      void a.play().catch(() => {});
    } catch {
      /* ignore */
    }
  }

  private stopRingAudio(): void {
    if (!this.ringAudio) return;
    try {
      this.ringAudio.pause();
      this.ringAudio.currentTime = 0;
    } catch {
      /* ignore */
    }
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
    const potsRow = this.topStack.querySelector('#hud-top-pots') as HTMLElement;

    for (const el of potUnders) {
      (el as HTMLElement).style.display = '';
    }

    lblL.textContent = ctx.potTargetLabelOpponent;
    lblR.textContent = ctx.potTargetLabelPlayer;

    if (!ctx.showPotProgressStrip) {
      chipsL.innerHTML = '';
      chipsR.innerHTML = '';
      potsRow.style.display = 'none';
      return;
    }

    potsRow.style.removeProperty('display');

    if (pot.kind === 'open') {
      chipsL.innerHTML = stripOrdered(SOLID_NUMBERS, pot.solids, 'solid');
      chipsR.innerHTML = stripOrdered(STRIPE_NUMBERS, pot.stripes, 'stripe');
      return;
    }

    const pg = ctx.playerGroup;
    const ag = ctx.aiGroup;
    if (pg && ag) {
      const playerOrder = pg === 'solid' ? SOLID_NUMBERS : STRIPE_NUMBERS;
      const aiOrder = ag === 'solid' ? SOLID_NUMBERS : STRIPE_NUMBERS;
      chipsL.innerHTML = stripOrdered(aiOrder, pot.ai, ag);
      chipsR.innerHTML = stripOrdered(playerOrder, pot.player, pg);
    } else {
      chipsL.innerHTML = pot.ai.map((n) => chipHtml(n)).join('');
      chipsR.innerHTML = pot.player.map((n) => chipHtml(n)).join('');
    }
  }

  private syncEndOverlay(won: boolean, reason: string, h: HudState): void {
    const title = this.end.querySelector('#end-title')!;
    const sub = this.end.querySelector('#end-sub')!;
    title.textContent = won ? 'YOU WON' : 'YOU LOST';
    title.classList.toggle('end-title-win', won);
    sub.textContent = reason;
    this.btnNext.style.display = won ? 'inline-flex' : 'none';
    this.btnRematch.style.display = won ? 'none' : 'inline-flex';
    const reward = won ? h.coinRewardWin ?? 0 : 0;
    this.endReward.textContent = `${reward > 0 ? '+' : ''}${formatNumber(reward)} 🪙`;
    const coins = h.profile?.coins ?? 0;
    this.endBalance.textContent = `${formatNumber(coins)} 🪙`;
    if (won) {
      this.startConfetti();
    } else {
      this.stopConfetti();
    }
  }

  private hideGame(): void {
    this.topStack.style.display = 'none';
    this.lastOppReactionBeatId = -1;
    this.oppReaction.querySelector('.opp-reaction-stage')?.classList.remove('opp-react-anim');
    this.oppReaction.classList.remove('show');
    this.bubble.style.display = 'none';
    this.end.style.display = 'none';
    this.soundBtn.style.display = 'none';
    this.stopConfetti();
    this.stopRingAudio();
    this.hideShopOverlay();
    this.hideNextMatchModal();
    this.hideLevelOverlay();
    this.clearHudTopBand();
  }

  private syncSoundButtonVisual(): void {
    this.soundBtnIcon.src = this.soundMuted ? SOUND_ICON_OFF_URL : SOUND_ICON_ON_URL;
    this.soundBtn.setAttribute('aria-pressed', this.soundMuted ? 'true' : 'false');
    this.soundBtn.title = this.soundMuted ? 'Sound off' : 'Sound on';
  }

  private showShopOverlay(): void {
    this.shopOverlay.classList.add('show');
    /** Force a fresh paint when re-opening the shop. */
    this.lastShopSignature = '';
    this.renderShopPanel(this.getHud());
  }

  private hideShopOverlay(): void {
    this.shopOverlay.classList.remove('show');
  }

  private showNextMatchModal(): void {
    const next = this.lastEightBall;
    if (!next) return;
    const nextOpp = (this.getHud().nextOpponent ?? null);
    const name = nextOpp?.name ?? 'Next opponent';
    const tier = nextOpp?.tier ?? '';
    this.nextName.textContent = name;
    this.nextTier.textContent = tier.toUpperCase();
    const oppId = nextOpp?.id ?? next.opponentId;
    const avatarUrl = opponentHudAvatarUrl(this.assetBaseUrl, oppId);
    this.nextAvatar.src = avatarUrl;
    this.nextModal.classList.add('show');
    this.startRingAudio();
  }

  private hideNextMatchModal(): void {
    this.nextModal.classList.remove('show');
    this.stopRingAudio();
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

function stripOrdered(
  order: readonly number[],
  potted: number[],
  slotKind: 'solid' | 'stripe',
): string {
  const set = new Set(potted);
  return order.map((n) => (set.has(n) ? chipHtml(n) : slotHtml(slotKind))).join('');
}

function slotHtml(slotKind: 'solid' | 'stripe'): string {
  const src = slotKind === 'solid' ? SOLID_BALL_ICON_URL : STRIPE_BALL_ICON_URL;
  return `<span class="pot-slot pot-slot--icon" aria-hidden="true"><img class="pot-slot-img" src="${src}" alt="" decoding="async" /></span>`;
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

function formatNumber(n: number): string {
  return Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
}

function formatPercent(p: number): string {
  return `${Math.round(Math.max(0, Math.min(1, p)) * 100)}%`;
}
