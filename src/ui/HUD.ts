import type { GameInputCommand } from '../core/gameContract.js';
import type { HudState, PotHudState } from '../world/renderTypes.js';
import type { GamePhase } from '../core/types.js';
import { AssetManifest } from '../assets/AssetManifest.js';
import { AssetIds } from '../assets/AssetIds.js';
import { resolveBrowserAssetUrl } from '../assets/resolveBrowserAssetUrl.js';
import { SHOP_CUE_CATALOG } from '../core/ShopCatalog.js';
import { evaluateAchievements } from './AchievementsCatalog.js';
import { getLeaderboard } from './LeaderboardData.js';

const SOUND_ICON_ON_URL = new URL('./sound.png', import.meta.url).href;
const SOUND_ICON_OFF_URL = new URL('./sound_off.png', import.meta.url).href;
const SOLID_BALL_ICON_URL = new URL('./SolidBall.png', import.meta.url).href;
const STRIPE_BALL_ICON_URL = new URL('./StripeBall.png', import.meta.url).href;
const SHOP_ICON_URL = new URL('./shop.png', import.meta.url).href;
const PLAY_AGAIN_ICON_URL = new URL('./play-again.png', import.meta.url).href;

function opponentHudAvatarUrl(assetBaseUrl: string, opponentId: string): string {
  if (opponentId === 'tungo') {
    const e = AssetManifest['ui.opponent.tungo.avatar'];
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
  /** Champion banner: trophy, big earned chips, and total balances. Tournament-final only. */
  private readonly endChampion: HTMLElement;
  private readonly endChampionName: HTMLElement;
  private readonly endChampionPrize: HTMLElement;
  private readonly championEarnedCoin: HTMLElement;
  private readonly championEarnedXp: HTMLElement;
  private readonly championTotalCoin: HTMLElement;
  private readonly championTotalXp: HTMLElement;
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
  /** Optional career-rank badge inside the menu; null if the footer is hidden. */
  private readonly menuLevel: HTMLElement | null;
  private readonly endLevel: HTMLElement;
  private readonly shopOverlay: HTMLElement;
  private readonly shopList: HTMLElement;
  private readonly shopCoins: HTMLElement;
  private lastShopSignature = '';
  private readonly leaderboardOverlay: HTMLElement;
  private readonly leaderboardList: HTMLElement;
  private leaderboardVisible = false;
  private readonly achievementsOverlay: HTMLElement;
  private readonly achievementsList: HTMLElement;
  private achievementsVisible = false;
  private readonly modeSelectOverlay: HTMLElement;
  private readonly modeSelectTrack: HTMLElement;
  private readonly modeSelectDots: HTMLElement;
  private readonly modeSelectBackBtn: HTMLButtonElement;
  private modeSelectVisible = false;
  /** Pointer-drag state: latches true while a drag exceeds the click threshold so the next click is suppressed. */
  private modeSelectSuppressClick = false;
  /** Active card index (0..4) used to highlight the dot indicators. */
  private modeSelectActiveIdx = 0;
  /**
   * Cache key for the last-rendered mode-select track. Skipping the
   * `innerHTML` rewrite when the key is unchanged keeps button DOM nodes
   * stable between `pointerdown` and `click`, which is required for the click
   * event to fire (otherwise the per-frame re-render destroys the button).
   */
  private modeSelectLastRenderKey: string | null = null;
  private readonly tournamentOverlay: HTMLElement;
  private readonly tournamentSlots: HTMLElement;
  private readonly tournamentTitle: HTMLElement;
  private readonly tournamentSub: HTMLElement;
  private readonly tournamentStartBtn: HTMLButtonElement;
  private readonly tournamentExitBtn: HTMLButtonElement;
  private tournamentVisible = false;
  /** Top-of-match strip showing tournament name + bracket dots + counter. */
  private readonly tournamentStrip: HTMLElement;
  private readonly tournamentStripName: HTMLElement;
  private readonly tournamentStripDots: HTMLElement;
  private readonly tournamentStripCounter: HTMLElement;
  /** Match-intro animation banner shown briefly when each tournament round starts. */
  private readonly matchIntro: HTMLElement;
  private readonly matchIntroTitle: HTMLElement;
  private readonly matchIntroSub: HTMLElement;
  private matchIntroTimer: ReturnType<typeof setTimeout> | null = null;
  /** Center yellow popup (group assignment / foul). */
  private readonly hudNotice: HTMLElement;
  private readonly hudNoticeText: HTMLElement;
  private hudNoticeTimer: ReturnType<typeof setTimeout> | null = null;
  private lastHudNoticeBeatId = -1;
  /** `${defId}:${currentRound}` of the most recently introduced match — prevents re-triggering. */
  private lastMatchIntroKey: string | null = null;
  private readonly menuAccountLevel: HTMLElement;
  private readonly menuAccountFill: HTMLElement;
  private readonly menuAccountText: HTMLElement;
  private readonly menuCoinAmount: HTMLElement;
  private readonly menuPlayLabel: HTMLElement;
  private readonly menuPlayBtn: HTMLButtonElement;
  private readonly menuLeaderboardBtn: HTMLButtonElement;
  private readonly menuShopBtn: HTMLButtonElement;
  private readonly menuAchievementsBtn: HTMLButtonElement;
  private readonly menuAccountChip: HTMLElement;
  private readonly rewardWin: HTMLElement;
  private lastProfile: HudState['profile'] | null = null;
  private lastEightBall: HudState['eightBall'] | null = null;
  private statsVisibleFor: 'player' | 'opponent' | null = null;
  private levelVisible = false;
  private soundMuted = false;
  /** Tracks whether the main menu was visible on the previous sync, so the
   *  sequential "is a button" attention pop only fires on each fresh open. */
  private wasMainMenuVisible = false;
  private readonly gameRoot: HTMLElement | null;
  private readonly hudLayoutObserver: ResizeObserver;
  private readonly powerBarWrap: HTMLElement;
  private readonly powerBarTrack: HTMLElement;
  /** True while user has primary pointer down on the power track (avoid HUD sync overwriting `--p`). */
  private powerBarPointerDown = false;

  constructor(
    root: HTMLElement,
    private readonly getHud: () => HudState,
    private readonly pushCommand: (c: GameInputCommand) => void,
    private readonly assetBaseUrl: string,
    private readonly opts?: {
      toggleSound?: () => boolean;
      isSoundMuted?: () => boolean;
      playUiClick?: () => void;
    },
  ) {
    this.root = root;
    this.gameRoot = root.parentElement?.id === 'game-root' ? root.parentElement : null;
    root.innerHTML = '';

    this.menu = el('div', 'panel menu menu-hub interactive');
    this.menu.innerHTML = `
      <div class="menu-bg" aria-hidden="true">
        <div class="menu-stars menu-stars-1"></div>
        <div class="menu-stars menu-stars-2"></div>
      </div>
      <div class="menu-topbar">
        <div class="menu-account interactive" id="menu-account" role="button" tabindex="0" aria-label="Account level details">
          <span class="menu-account-badge"><span id="menu-account-level">1</span></span>
          <div class="menu-account-bar">
            <div class="menu-account-bar-track">
              <div class="menu-account-bar-fill" id="menu-account-fill"></div>
            </div>
            <div class="menu-account-bar-text" id="menu-account-text">0 / 150 EXP</div>
          </div>
        </div>
        <div class="menu-coin-pill" aria-label="Coins">
          <span class="menu-coin-icon" aria-hidden="true"></span>
          <span id="menu-coin-amount">0</span>
        </div>
      </div>
      <div class="menu-hero">
        <div class="menu-hero-logo" role="img" aria-label="8 Balls Pool vs Brainrots"></div>
      </div>
      <div class="menu-actions">
        <button id="menu-btn-play" class="menu-play-btn interactive" aria-label="Play vs Brainrots">
          <span class="menu-play-glyph" aria-hidden="true"></span>
          <span class="menu-play-label" id="menu-play-label">Play</span>
        </button>
        <div class="menu-circle-row">
          <button class="menu-circle-btn interactive" id="menu-circle-leaderboard" aria-label="Leaderboard">
            <span class="menu-circle-icon menu-icon-trophy" aria-hidden="true"></span>
          </button>
          <button class="menu-circle-btn interactive" id="menu-circle-shop" aria-label="Shop">
            <span class="menu-circle-icon menu-icon-shop" aria-hidden="true"></span>
          </button>
          <button class="menu-circle-btn interactive" id="menu-circle-achievements" aria-label="Achievements">
            <span class="menu-circle-icon menu-icon-medal" aria-hidden="true"></span>
          </button>
        </div>
      </div>
    `;

    this.topStack = el('div', 'hud-top-stack');
    this.topStack.innerHTML = `
      <div class="hud-top">
        <div class="hud-tournament-strip" id="hud-tournament-strip" data-accent="pro" data-active="false" aria-hidden="true">
          <span class="hud-tournament-strip-name" id="hud-tournament-strip-name">—</span>
          <ol class="hud-tournament-strip-dots" id="hud-tournament-strip-dots"></ol>
          <span class="hud-tournament-strip-counter" id="hud-tournament-strip-counter">1 / 4</span>
        </div>
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
        <div id="end-opp-react" class="end-opp-react" aria-hidden="true">
          <p id="end-opp-quote" class="end-opp-quote"></p>
        </div>
        <div id="end-champion" class="end-champion" data-active="false" aria-hidden="true">
          <div class="end-champion-trophy" aria-hidden="true"></div>
          <div class="end-champion-name" id="end-champion-name">Tournament</div>
        </div>
        <div class="end-head">
          <div id="end-title" class="title">MATCH OVER</div>
          <div id="end-sub" class="sub">—</div>
          <div class="end-level-row">
            <span class="end-level-label">Your level</span>
            <span id="end-lvl" class="lvl-star lvl-clickable" aria-label="Level">1</span>
          </div>
        </div>
        <div id="end-champion-prize" class="end-champion-prize" data-active="false" aria-hidden="true">
          <div class="prize-earned">
            <div class="prize-earned-coin" id="champion-earned-coin">+0 🪙</div>
            <div class="prize-earned-xp" id="champion-earned-xp">+0 XP</div>
          </div>
          <div class="prize-totals">
            <span class="prize-total-chip" id="champion-total-coin">0 🪙</span>
            <span class="prize-total-sep" aria-hidden="true">·</span>
            <span class="prize-total-chip" id="champion-total-xp">Lv 1 · 0 XP</span>
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
          <button id="btn-shop" class="btn ghost btn-icon-only" aria-label="Open shop" title="Shop">
            <img class="btn-icon" src="${SHOP_ICON_URL}" alt="" decoding="async" draggable="false" />
          </button>
          <div class="end-actions-main">
            <button id="btn-rematch" class="btn ghost btn-icon-only" aria-label="Rematch" title="Rematch">
              <img class="btn-icon" src="${PLAY_AGAIN_ICON_URL}" alt="" decoding="async" draggable="false" />
            </button>
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
    this.endChampion = this.end.querySelector('#end-champion') as HTMLElement;
    this.endChampionName = this.end.querySelector('#end-champion-name') as HTMLElement;
    this.endChampionPrize = this.end.querySelector('#end-champion-prize') as HTMLElement;
    this.championEarnedCoin = this.end.querySelector('#champion-earned-coin') as HTMLElement;
    this.championEarnedXp = this.end.querySelector('#champion-earned-xp') as HTMLElement;
    this.championTotalCoin = this.end.querySelector('#champion-total-coin') as HTMLElement;
    this.championTotalXp = this.end.querySelector('#champion-total-xp') as HTMLElement;

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
    this.menuLevel = this.menu.querySelector('#menu-lvl') as HTMLElement | null;
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

    this.leaderboardOverlay = el('div', 'hud-leaderboard-overlay');
    this.leaderboardOverlay.innerHTML = `
      <div class="hud-leaderboard-backdrop" id="hud-leaderboard-backdrop"></div>
      <div class="hud-leaderboard-modal">
        <div class="hud-leaderboard-header">
          <div class="hud-leaderboard-title">Leaderboard</div>
          <div class="hud-leaderboard-sub">Online ranking — coming soon</div>
          <button class="hud-leaderboard-close" id="hud-leaderboard-close" aria-label="Close leaderboard">×</button>
        </div>
        <div class="hud-leaderboard-list" id="hud-leaderboard-list"></div>
      </div>
    `;
    this.leaderboardList = this.leaderboardOverlay.querySelector('#hud-leaderboard-list') as HTMLElement;

    this.achievementsOverlay = el('div', 'hud-achievements-overlay');
    this.achievementsOverlay.innerHTML = `
      <div class="hud-achievements-backdrop" id="hud-achievements-backdrop"></div>
      <div class="hud-achievements-modal">
        <div class="hud-achievements-header">
          <div class="hud-achievements-title">Achievements</div>
          <div class="hud-achievements-sub" id="hud-achievements-sub">0 / 0 unlocked</div>
          <button class="hud-achievements-close" id="hud-achievements-close" aria-label="Close achievements">×</button>
        </div>
        <div class="hud-achievements-list" id="hud-achievements-list"></div>
      </div>
    `;
    this.achievementsList = this.achievementsOverlay.querySelector('#hud-achievements-list') as HTMLElement;

    this.menuAccountChip = this.menu.querySelector('#menu-account') as HTMLElement;
    this.menuAccountLevel = this.menu.querySelector('#menu-account-level') as HTMLElement;
    this.menuAccountFill = this.menu.querySelector('#menu-account-fill') as HTMLElement;
    this.menuAccountText = this.menu.querySelector('#menu-account-text') as HTMLElement;
    this.menuCoinAmount = this.menu.querySelector('#menu-coin-amount') as HTMLElement;
    this.menuPlayBtn = this.menu.querySelector('#menu-btn-play') as HTMLButtonElement;
    this.menuPlayLabel = this.menu.querySelector('#menu-play-label') as HTMLElement;
    this.menuLeaderboardBtn = this.menu.querySelector('#menu-circle-leaderboard') as HTMLButtonElement;
    this.menuShopBtn = this.menu.querySelector('#menu-circle-shop') as HTMLButtonElement;
    this.menuAchievementsBtn = this.menu.querySelector('#menu-circle-achievements') as HTMLButtonElement;

    this.modeSelectOverlay = el('div', 'hud-modeselect-overlay');
    this.modeSelectOverlay.innerHTML = `
      <div class="hud-modeselect-page">
        <div class="modeselect-header">
          <button class="modeselect-back" id="modeselect-back" type="button" aria-label="Back to menu">
            <span class="modeselect-back-glyph" aria-hidden="true"></span>
            <span class="modeselect-back-label">Back</span>
          </button>
          <div class="modeselect-title">Select Mode</div>
          <div class="modeselect-spacer" aria-hidden="true"></div>
        </div>
        <div class="modeselect-track" id="modeselect-track" role="list"></div>
        <div class="modeselect-dots" id="modeselect-dots" aria-hidden="true"></div>
      </div>
    `;
    this.modeSelectTrack = this.modeSelectOverlay.querySelector('#modeselect-track') as HTMLElement;
    this.modeSelectDots = this.modeSelectOverlay.querySelector('#modeselect-dots') as HTMLElement;
    this.modeSelectBackBtn = this.modeSelectOverlay.querySelector('#modeselect-back') as HTMLButtonElement;

    this.tournamentOverlay = el('div', 'hud-tournament-overlay');
    this.tournamentOverlay.innerHTML = `
      <div class="hud-tournament-modal">
        <div class="hud-tournament-header">
          <button class="modeselect-back hud-tournament-back" id="hud-tournament-exit" type="button" aria-label="Back to mode select">
            <span class="modeselect-back-glyph" aria-hidden="true"></span>
            <span class="modeselect-back-label">Back</span>
          </button>
          <div>
            <div class="hud-tournament-title" id="hud-tournament-title">Tournament Bracket</div>
            <div class="hud-tournament-sub" id="hud-tournament-sub">Match 1 of 4</div>
          </div>
          <div class="modeselect-spacer" aria-hidden="true"></div>
        </div>
        <div class="hud-tournament-slots" id="hud-tournament-slots"></div>
        <button class="btn primary hud-tournament-start" id="hud-tournament-start" type="button">Start Match 1</button>
      </div>
    `;
    this.tournamentSlots = this.tournamentOverlay.querySelector('#hud-tournament-slots') as HTMLElement;
    this.tournamentTitle = this.tournamentOverlay.querySelector('#hud-tournament-title') as HTMLElement;
    this.tournamentSub = this.tournamentOverlay.querySelector('#hud-tournament-sub') as HTMLElement;
    this.tournamentStartBtn = this.tournamentOverlay.querySelector('#hud-tournament-start') as HTMLButtonElement;
    this.tournamentExitBtn = this.tournamentOverlay.querySelector('#hud-tournament-exit') as HTMLButtonElement;

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
    this.tournamentStrip = this.topStack.querySelector('#hud-tournament-strip') as HTMLElement;
    this.tournamentStripName = this.topStack.querySelector('#hud-tournament-strip-name') as HTMLElement;
    this.tournamentStripDots = this.topStack.querySelector('#hud-tournament-strip-dots') as HTMLElement;
    this.tournamentStripCounter = this.topStack.querySelector('#hud-tournament-strip-counter') as HTMLElement;

    this.matchIntro = el('div', 'hud-match-intro');
    this.matchIntro.setAttribute('aria-hidden', 'true');
    this.matchIntro.innerHTML = `
      <div class="hud-match-intro-card">
        <div class="hud-match-intro-sub" id="hud-match-intro-sub">Tournament</div>
        <div class="hud-match-intro-title" id="hud-match-intro-title">Match 1 / 4</div>
      </div>
    `;
    this.matchIntroTitle = this.matchIntro.querySelector('#hud-match-intro-title') as HTMLElement;
    this.matchIntroSub = this.matchIntro.querySelector('#hud-match-intro-sub') as HTMLElement;

    this.hudNotice = el('div', 'hud-notice');
    this.hudNotice.setAttribute('aria-hidden', 'true');
    this.hudNotice.innerHTML = `<div class="hud-notice-text" id="hud-notice-text"></div>`;
    this.hudNoticeText = this.hudNotice.querySelector('#hud-notice-text') as HTMLElement;

    this.powerBarWrap = el('div', 'hud-power-bar interactive');
    this.powerBarWrap.setAttribute('aria-label', 'Shot power — drag cue down, release to shoot');
    this.powerBarWrap.innerHTML = `
      <div class="hud-power-bar-inner">
        <div class="hud-power-track" id="hud-power-track">
          <div class="hud-power-chrome">
            <div class="hud-power-groove">
              <div class="hud-power-bg-muted" aria-hidden="true"></div>
              <div class="hud-power-bg-spectrum" aria-hidden="true"></div>
              <div class="hud-power-heat" aria-hidden="true"></div>
              <div class="hud-power-handle hud-power-cue" role="slider" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" tabindex="0" aria-hidden="true">
                <span class="hud-power-cue-tip"></span>
                <span class="hud-power-cue-ferrule"></span>
                <span class="hud-power-cue-shaft"></span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    this.powerBarTrack = this.powerBarWrap.querySelector('#hud-power-track') as HTMLElement;
    const mutedTrack = resolveBrowserAssetUrl(this.assetBaseUrl, 'ui/power-meter/track-muted.png');
    const spectrumTrack = resolveBrowserAssetUrl(this.assetBaseUrl, 'ui/power-meter/track-spectrum.png');
    this.powerBarTrack.style.setProperty('--hud-power-muted-img', `url("${mutedTrack}")`);
    this.powerBarTrack.style.setProperty('--hud-power-spectrum-img', `url("${spectrumTrack}")`);
    this.powerBarWrap.style.display = 'none';

    /** Menu background — Tungo lounge art under the hub. */
    const menuBgUrl = resolveBrowserAssetUrl(this.assetBaseUrl, 'ui/bg.png');
    this.menu.style.setProperty('--menu-bg-image', `url("${menuBgUrl}")`);

    /** Hero logo — full "8 Balls Pool vs Brainrots" lockup over the menu hub. */
    const menuLogoUrl = resolveBrowserAssetUrl(this.assetBaseUrl, 'ui/8ballslogo.png');
    this.menu.style.setProperty('--menu-hero-logo-image', `url("${menuLogoUrl}")`);

    /** Round action buttons — Leaderboard / Shop / Achievements ball art. */
    const btnLeaderboardUrl = resolveBrowserAssetUrl(this.assetBaseUrl, 'ui/button_leaderboards.png');
    const btnShopUrl = resolveBrowserAssetUrl(this.assetBaseUrl, 'ui/button_shop.png');
    const btnAchievementsUrl = resolveBrowserAssetUrl(this.assetBaseUrl, 'ui/button_achivement.png');
    this.menu.style.setProperty('--menu-circle-leaderboard-image', `url("${btnLeaderboardUrl}")`);
    this.menu.style.setProperty('--menu-circle-shop-image', `url("${btnShopUrl}")`);
    this.menu.style.setProperty('--menu-circle-achievements-image', `url("${btnAchievementsUrl}")`);

    /** Play button — yellow pill art with built-in play arrow. */
    const btnPlayUrl = resolveBrowserAssetUrl(this.assetBaseUrl, 'ui/button_play.png');
    this.menu.style.setProperty('--menu-play-image', `url("${btnPlayUrl}")`);

    root.append(
      this.menu,
      this.topStack,
      this.oppReaction,
      this.bubble,
      this.end,
      this.statsOverlay,
      this.levelOverlay,
      this.shopOverlay,
      this.leaderboardOverlay,
      this.achievementsOverlay,
      this.modeSelectOverlay,
      this.tournamentOverlay,
      this.matchIntro,
      this.hudNotice,
      this.nextModal,
      this.soundBtn,
      this.powerBarWrap,
    );
    this.soundMuted = this.opts?.isSoundMuted?.() ?? false;
    this.syncSoundButtonVisual();
    this.hudLayoutObserver = new ResizeObserver(() => this.applyHudTopBandFromLayout());
    this.hudLayoutObserver.observe(this.topStack);
    this.hideGame();
  }

  private playHudClickSound(): void {
    if (this.soundMuted) return;
    this.opts?.playUiClick?.();
  }

  bindHandlers(): void {
    this.btnNext.addEventListener('click', () => {
      this.playHudClickSound();
      const t = this.getHud().tournament;
      if (t?.status === 'won') {
        /** Champion → end-of-run, drop straight back to the menu. */
        this.pushCommand({ type: 'tournament.exit' });
        return;
      }
      if (t?.status === 'active') {
        /** Mid-tournament win → re-open bracket; "Start Match N" advances the run. */
        this.showTournamentOverlay();
        return;
      }
      /** Casual win: no "next match" popup, just return to home. */
      this.pushCommand({ type: 'tournament.exit' });
    });
    this.btnRematch.addEventListener('click', () => {
      this.playHudClickSound();
      const t = this.getHud().tournament;
      if (t?.status === 'lost') {
        /** Eliminated branch — Rematch button is repurposed to "Back to Menu". */
        this.pushCommand({ type: 'tournament.exit' });
        return;
      }
      this.pushCommand({ type: 'menu.restart' });
    });
    this.btnShop.addEventListener('click', () => {
      this.playHudClickSound();
      this.showShopOverlay();
    });

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
    statsClose.addEventListener('click', () => {
      this.playHudClickSound();
      this.hideStatsOverlay();
    });
    statsBackdrop.addEventListener('click', () => {
      this.playHudClickSound();
      this.hideStatsOverlay();
    });

    const levelClose = this.levelOverlay.querySelector('#hud-level-close') as HTMLElement;
    const levelBackdrop = this.levelOverlay.querySelector('#hud-level-backdrop') as HTMLElement;
    levelClose.addEventListener('click', () => {
      this.playHudClickSound();
      this.hideLevelOverlay();
    });
    levelBackdrop.addEventListener('click', () => {
      this.playHudClickSound();
      this.hideLevelOverlay();
    });

    const shopClose = this.shopOverlay.querySelector('#hud-shop-close') as HTMLElement;
    const shopBackdrop = this.shopOverlay.querySelector('#hud-shop-backdrop') as HTMLElement;
    shopClose.addEventListener('click', () => {
      this.playHudClickSound();
      this.hideShopOverlay();
    });
    shopBackdrop.addEventListener('click', () => {
      this.playHudClickSound();
      this.hideShopOverlay();
    });
    this.shopList.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const btn = t.closest('[data-buy],[data-equip]') as HTMLElement | null;
      if (!btn) return;
      const buy = btn.dataset.buy;
      const equip = btn.dataset.equip;
      if (buy) {
        this.playHudClickSound();
        this.pushCommand({ type: 'shop.buyCue', cueId: buy });
      }
      if (equip) {
        this.playHudClickSound();
        this.pushCommand({ type: 'shop.equipCue', cueId: equip });
      }
    });

    const nextBackdrop = this.nextModal.querySelector('#hud-next-backdrop') as HTMLElement;
    nextBackdrop.addEventListener('click', () => {
      this.playHudClickSound();
      this.hideNextMatchModal();
    });
    this.nextAccept.addEventListener('click', () => {
      this.playHudClickSound();
      this.hideNextMatchModal();
      this.pushCommand({ type: 'menu.next' });
    });

    const plAvatar = this.topStack.querySelector('#pl-avatar-frame') as HTMLElement;
    const aiAvatar = this.topStack.querySelector('#ai-avatar-frame') as HTMLElement;
    const plLevel = this.topStack.querySelector('#pl-lvl') as HTMLElement | null;
    plAvatar.addEventListener('click', () => {
      this.playHudClickSound();
      this.showStatsOverlay('player');
    });
    aiAvatar.addEventListener('click', () => {
      this.playHudClickSound();
      this.showStatsOverlay('opponent');
    });
    if (plLevel) {
      plLevel.classList.add('lvl-clickable');
      plLevel.setAttribute('role', 'button');
      plLevel.setAttribute('tabindex', '0');
      plLevel.addEventListener('click', () => {
        this.playHudClickSound();
        this.showLevelOverlay();
      });
      plLevel.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.playHudClickSound();
          this.showLevelOverlay();
        }
      });
    }
    if (this.menuLevel) {
      this.menuLevel.setAttribute('role', 'button');
      this.menuLevel.setAttribute('tabindex', '0');
      this.menuLevel.addEventListener('click', () => {
        this.playHudClickSound();
        this.showLevelOverlay();
      });
      this.menuLevel.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.playHudClickSound();
          this.showLevelOverlay();
        }
      });
    }
    if (this.endLevel) {
      this.endLevel.setAttribute('role', 'button');
      this.endLevel.setAttribute('tabindex', '0');
      this.endLevel.addEventListener('click', () => {
        this.playHudClickSound();
        this.showLevelOverlay();
      });
      this.endLevel.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.playHudClickSound();
          this.showLevelOverlay();
        }
      });
    }

    this.soundBtn.addEventListener('click', () => {
      this.playHudClickSound();
      this.soundMuted = this.opts?.toggleSound?.() ?? !this.soundMuted;
      this.syncSoundButtonVisual();
    });

    this.menuPlayBtn.addEventListener('click', () => {
      this.playHudClickSound();
      this.showModeSelectOverlay();
    });
    this.menuLeaderboardBtn.addEventListener('click', () => {
      this.playHudClickSound();
      this.showLeaderboardOverlay();
    });
    this.menuShopBtn.addEventListener('click', () => {
      this.playHudClickSound();
      this.showShopOverlay();
    });
    this.menuAchievementsBtn.addEventListener('click', () => {
      this.playHudClickSound();
      this.showAchievementsOverlay();
    });

    this.menuAccountChip.setAttribute('role', 'button');
    this.menuAccountChip.setAttribute('tabindex', '0');
    this.menuAccountChip.addEventListener('click', () => {
      this.playHudClickSound();
      this.showLevelOverlay();
    });
    this.menuAccountChip.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.playHudClickSound();
        this.showLevelOverlay();
      }
    });

    const lbClose = this.leaderboardOverlay.querySelector('#hud-leaderboard-close') as HTMLElement;
    const lbBackdrop = this.leaderboardOverlay.querySelector('#hud-leaderboard-backdrop') as HTMLElement;
    lbClose.addEventListener('click', () => {
      this.playHudClickSound();
      this.hideLeaderboardOverlay();
    });
    lbBackdrop.addEventListener('click', () => {
      this.playHudClickSound();
      this.hideLeaderboardOverlay();
    });

    const achClose = this.achievementsOverlay.querySelector('#hud-achievements-close') as HTMLElement;
    const achBackdrop = this.achievementsOverlay.querySelector('#hud-achievements-backdrop') as HTMLElement;
    achClose.addEventListener('click', () => {
      this.playHudClickSound();
      this.hideAchievementsOverlay();
    });
    achBackdrop.addEventListener('click', () => {
      this.playHudClickSound();
      this.hideAchievementsOverlay();
    });

    this.modeSelectBackBtn.addEventListener('click', () => {
      this.playHudClickSound();
      this.hideModeSelectOverlay();
    });

    this.attachModeSelectDrag();

    /** Card click is delegated; cards are rendered dynamically from the catalog. */
    this.modeSelectTrack.addEventListener('click', (e) => {
      if (this.modeSelectSuppressClick) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const cta = target.closest('[data-mode-action]') as HTMLElement | null;
      if (!cta) return;
      if (cta.getAttribute('data-disabled') === 'true') return;
      const action = cta.getAttribute('data-mode-action') ?? '';
      if (action === 'casual') {
        this.playHudClickSound();
        this.hideModeSelectOverlay();
        this.pushCommand({ type: 'menu.startCasual' });
        return;
      }
      if (action.startsWith('tournament:')) {
        const id = action.slice('tournament:'.length);
        const def = this.getHud().tournamentCatalog?.find((d) => d.id === id);
        const coins = this.getHud().profile?.coins ?? 0;
        if (!def) return;
        if (coins < def.entryFeeCoins) return;
        this.playHudClickSound();
        this.hideModeSelectOverlay();
        this.pushCommand({ type: 'menu.startTournament', tournamentId: id });
        this.showTournamentOverlay();
      }
    });

    this.modeSelectTrack.addEventListener('scroll', () => this.updateModeSelectDots(), {
      passive: true,
    });

    this.tournamentStartBtn.addEventListener('click', () => {
      this.playHudClickSound();
      this.hideTournamentOverlay();
      this.pushCommand({ type: 'tournament.advance' });
    });
    this.tournamentExitBtn.addEventListener('click', () => {
      this.playHudClickSound();
      const t = this.getHud().tournament;
      const untouchedRun =
        !!t &&
        t.status === 'active' &&
        t.currentRound === 0 &&
        t.record.every((r) => r === 'pending');
      if (untouchedRun) {
        /** Tournament entry page back action → return to mode select. */
        this.hideTournamentOverlay();
        this.pushCommand({ type: 'tournament.exit' });
        this.showModeSelectOverlay();
        return;
      }
      this.hideTournamentOverlay();
      this.pushCommand({ type: 'tournament.exit' });
    });

    this.bindPowerBarHandlers();
  }

  private bindPowerBarHandlers(): void {
    const track = this.powerBarTrack;
    const valueFromClientY = (clientY: number): number => {
      const r = track.getBoundingClientRect();
      if (r.height < 1) return 0;
      return Math.max(0, Math.min(1, (clientY - r.top) / r.height));
    };
    const setVisual = (v: number): void => {
      const p = Math.max(0, Math.min(1, v));
      track.style.setProperty('--p', String(p));
      track.style.setProperty('--heat', String(p));
      const handle = track.querySelector('.hud-power-handle') as HTMLElement;
      handle?.setAttribute('aria-valuenow', String(Math.round(p * 100)));
    };

    const finishDrag = (e: PointerEvent, phase: 'up' | 'cancel'): void => {
      if (!this.powerBarPointerDown) return;
      this.powerBarPointerDown = false;
      const v = phase === 'cancel' ? 0 : valueFromClientY(e.clientY);
      this.pushCommand({
        type: 'power.drag',
        phase,
        value01: phase === 'cancel' ? 0 : v,
      });
      setVisual(0);
      try {
        track.releasePointerCapture(e.pointerId);
      } catch {
        /* not capturing */
      }
    };

    track.addEventListener('pointerdown', (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.powerBarPointerDown = true;
      try {
        track.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      const v = valueFromClientY(e.clientY);
      this.pushCommand({ type: 'power.drag', phase: 'down', value01: v });
      setVisual(v);
    });

    track.addEventListener('pointermove', (e: PointerEvent) => {
      if (!this.powerBarPointerDown) return;
      const v = valueFromClientY(e.clientY);
      this.pushCommand({ type: 'power.drag', phase: 'move', value01: v });
      setVisual(v);
    });

    track.addEventListener('pointerup', (e: PointerEvent) => {
      finishDrag(e, 'up');
    });

    track.addEventListener('pointercancel', (e: PointerEvent) => {
      finishDrag(e, 'cancel');
    });
  }

  syncFromState(): void {
    const h = this.getHud();
    const eb = h.eightBall;
    if (!eb) {
      this.applyPowerBarVisibility(h);
      return;
    }

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

    const isMainMenu = phase === 'MainMenu';
    if (isMainMenu && !this.wasMainMenuVisible) {
      this.playMenuButtonAttention();
    }
    this.wasMainMenuVisible = isMainMenu;

    /** Tournament strip + match intro are tournament-aware regardless of menu/match. */
    this.renderTournamentStrip(h, phase);
    this.maybePlayMatchIntro(h, phase);

    if (phase === 'MainMenu') {
      this.renderMenuPanel(h);
    }

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
      this.applyPowerBarVisibility(h);
      if (this.leaderboardVisible) this.renderLeaderboardOverlay(h);
      if (this.achievementsVisible) this.renderAchievementsOverlay(h);
      if (this.tournamentVisible) this.renderTournamentOverlay(h);
      if (this.modeSelectVisible) this.renderModeSelectPage(h);
      return;
    }

    this.stopConfetti();
    this.stopRingAudio();
    this.hideNextMatchModal();

    const inMatch = phase !== 'MainMenu';
    this.topStack.style.display = inMatch ? 'flex' : 'none';
    this.bubble.style.display = inMatch ? 'block' : 'none';

    if (!inMatch) {
      this.oppReaction.classList.remove('show');
      this.clearHudTopBand();
      if (this.menuLevel) this.menuLevel.textContent = levelLabel;
      if (this.endLevel) this.endLevel.textContent = levelLabel;
      this.applyPowerBarVisibility(h);
      if (this.leaderboardVisible) this.renderLeaderboardOverlay(h);
      if (this.achievementsVisible) this.renderAchievementsOverlay(h);
      if (this.tournamentVisible) this.renderTournamentOverlay(h);
      if (this.modeSelectVisible) this.renderModeSelectPage(h);
      return;
    }

    /** In active gameplay we always close overlays that can block the table. */
    this.hideShopOverlay();

    /**
     * Mode-select / bracket overlays only make sense in the menu/end-card
     * phases — once an actual match is in progress we force-hide them so the
     * play table stays interactive.
     */
    this.hideTournamentOverlay();
    this.hideModeSelectOverlay();

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
    if (opp.id === 'tungo') {
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

    this.syncHudNotice(eb);

    this.renderShopPanel(h);

    this.applyPowerBarVisibility(h);
    requestAnimationFrame(() => this.applyHudTopBandFromLayout());
  }

  private applyPowerBarVisibility(h: HudState): void {
    const eb = h.eightBall;
    const show =
      eb != null &&
      eb.phase === 'PlayerTurn' &&
      !h.cueBallInHandCursorHint &&
      !eb.opponentReaction;
    if (!show) {
      this.powerBarWrap.style.display = 'none';
      this.powerBarWrap.classList.remove('hint');
      this.powerBarTrack.style.setProperty('--p', '0');
      this.powerBarTrack.style.setProperty('--heat', '0');
      return;
    }
    this.powerBarWrap.style.display = 'flex';
    this.powerBarWrap.classList.toggle('hint', eb.powerBarHint === true);
    if (!this.powerBarPointerDown) {
      this.powerBarTrack.style.setProperty('--p', '0');
      this.powerBarTrack.style.setProperty('--heat', '0');
    }
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
        const styleParts: string[] = [];
        if (item.accent) styleParts.push(`--accent:${item.accent}`);
        const prev = item.preview;
        if (prev) {
          styleParts.push(`--cue-shaft:${prev.shaft}`);
          styleParts.push(`--cue-butt:${prev.butt}`);
          styleParts.push(`--cue-tip:${prev.tip}`);
        }
        const cardStyle = styleParts.length > 0 ? `style="${styleParts.join(';')}"` : '';
        return `
        <div class="shop-card" data-cue="${item.id}" ${cardStyle}>
          <div class="shop-card-head">
            <div class="shop-card-name">${item.name}</div>
            <div class="shop-card-price">${formatNumber(item.price)} 🪙</div>
          </div>
          <div class="shop-card-cue" aria-hidden="true">
            <span class="shop-card-cue-tip"></span>
            <span class="shop-card-cue-ferrule"></span>
            <span class="shop-card-cue-shaft"></span>
            <span class="shop-card-cue-accent"></span>
            <span class="shop-card-cue-butt"></span>
            <span class="shop-card-cue-cap"></span>
          </div>
          <div class="shop-card-actions">
            <button class="btn ${actionClass}" ${actionData} ${actionDisabled ? 'data-disabled="true"' : ''}>${actionLabel}</button>
          </div>
        </div>`;
      })
      .join('');
  }

  /** Quick staggered "I'm a button" pop on the four menu actions, fired each
   *  time the main menu becomes visible. Targets the inner icon span on circle
   *  buttons (their hover transform lives there) and the play button itself. */
  private playMenuButtonAttention(): void {
    const targets: (HTMLElement | null)[] = [
      this.menuLeaderboardBtn.querySelector('.menu-circle-icon'),
      this.menuShopBtn.querySelector('.menu-circle-icon'),
      this.menuAchievementsBtn.querySelector('.menu-circle-icon'),
      this.menuPlayBtn,
    ];
    targets.forEach((el, i) => {
      if (!el) return;
      el.classList.remove('menu-btn-attention');
      void el.offsetWidth;
      el.style.setProperty('--menu-btn-attention-delay', `${i * 110}ms`);
      el.classList.add('menu-btn-attention');
    });
  }

  private renderMenuPanel(h: HudState): void {
    const profile = h.profile;
    const accountLevel = profile?.accountLevel ?? 1;
    const xpInLevel = profile?.xpInLevel ?? 0;
    const xpToNext = Math.max(1, profile?.xpToNextLevel ?? 150);
    const progress = Math.max(0, Math.min(1, profile?.accountProgress01 ?? 0));
    const coins = profile?.coins ?? 0;
    this.menuAccountLevel.textContent = String(accountLevel);
    this.menuAccountFill.style.setProperty('--p', `${Math.round(progress * 100)}%`);
    this.menuAccountText.textContent = `${formatNumber(xpInLevel)} / ${formatNumber(xpToNext)} EXP`;
    this.menuCoinAmount.textContent = formatNumber(coins);
    this.menuPlayLabel.textContent = 'Play';
  }

  private renderLeaderboardOverlay(h: HudState): void {
    const profile = h.profile;
    if (!profile) {
      this.leaderboardList.innerHTML = '';
      return;
    }
    const entries = getLeaderboard('You', profile.xp);
    this.leaderboardList.innerHTML = entries
      .map((e) => {
        const rankCls =
          e.rank === 1
            ? 'lb-rank lb-rank-gold'
            : e.rank === 2
              ? 'lb-rank lb-rank-silver'
              : e.rank === 3
                ? 'lb-rank lb-rank-bronze'
                : 'lb-rank';
        const rowCls = e.isPlayer ? 'lb-row lb-row-player' : 'lb-row';
        const safeName = escapeHtml(e.name);
        const safeFlag = escapeHtml(e.flag);
        return `
          <div class="${rowCls}">
            <div class="${rankCls}">${e.rank}</div>
            <div class="lb-avatar" style="--lb-hue:${e.hue}">${safeFlag}</div>
            <div class="lb-meta">
              <div class="lb-name">${safeName}${e.isPlayer ? '<span class="lb-you">YOU</span>' : ''}</div>
              <div class="lb-sub">Level ${e.accountLevel}</div>
            </div>
            <div class="lb-xp">${formatNumber(e.xp)} XP</div>
          </div>`;
      })
      .join('');
  }

  private showLeaderboardOverlay(): void {
    this.leaderboardVisible = true;
    this.renderLeaderboardOverlay(this.getHud());
    this.leaderboardOverlay.classList.add('show');
  }

  private hideLeaderboardOverlay(): void {
    this.leaderboardVisible = false;
    this.leaderboardOverlay.classList.remove('show');
  }

  private renderAchievementsOverlay(h: HudState): void {
    const profile = h.profile;
    if (!profile) {
      this.achievementsList.innerHTML = '';
      return;
    }
    const rows = evaluateAchievements(profile);
    const unlockedCount = rows.filter((r) => r.unlocked).length;
    const sub = this.achievementsOverlay.querySelector('#hud-achievements-sub') as HTMLElement;
    if (sub) sub.textContent = `${unlockedCount} / ${rows.length} unlocked`;
    this.achievementsList.innerHTML = rows
      .map((r) => {
        const cls = r.unlocked ? 'ach-row ach-unlocked' : 'ach-row ach-locked';
        const pct = Math.round(r.progress01 * 100);
        const reward = r.def.rewardLabel ? `<span class="ach-reward">${escapeHtml(r.def.rewardLabel)}</span>` : '';
        return `
          <div class="${cls}">
            <div class="ach-icon ach-icon-${r.def.iconKind}" aria-hidden="true">
              <span class="ach-icon-glyph"></span>
            </div>
            <div class="ach-meta">
              <div class="ach-name">${escapeHtml(r.def.name)}${reward}</div>
              <div class="ach-desc">${escapeHtml(r.def.desc)}</div>
              ${r.unlocked
                ? '<div class="ach-status ach-status-done">Unlocked</div>'
                : `<div class="ach-progress"><div class="ach-progress-bar" style="width:${pct}%"></div><span class="ach-progress-text">${pct}%</span></div>`}
            </div>
          </div>`;
      })
      .join('');
  }

  private showAchievementsOverlay(): void {
    this.achievementsVisible = true;
    this.renderAchievementsOverlay(this.getHud());
    this.achievementsOverlay.classList.add('show');
  }

  private hideAchievementsOverlay(): void {
    this.achievementsVisible = false;
    this.achievementsOverlay.classList.remove('show');
  }

  private showModeSelectOverlay(): void {
    this.modeSelectVisible = true;
    this.renderModeSelectPage(this.getHud());
    this.modeSelectOverlay.classList.add('show');
    /** Reset to the first card (Casual) on each open so the entry point is consistent. */
    requestAnimationFrame(() => {
      this.modeSelectTrack.scrollLeft = 0;
      this.modeSelectActiveIdx = 0;
      this.updateModeSelectDots();
    });
  }

  private hideModeSelectOverlay(): void {
    this.modeSelectVisible = false;
    this.modeSelectOverlay.classList.remove('show');
    /** Force a fresh render on the next open so coin/catalog changes are picked up. */
    this.modeSelectLastRenderKey = null;
  }

  private attachModeSelectDrag(): void {
    const track = this.modeSelectTrack;
    let startX = 0;
    let startScroll = 0;
    let dragging = false;
    let movedFar = false;
    const DRAG_THRESHOLD_PX = 6;

    track.addEventListener('pointerdown', (e) => {
      /** Mouse-only drag scroll; touch already uses native scroll-snap so we let it pass through. */
      if (e.pointerType !== 'mouse') return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-mode-action]')) {
        /** Pointerdown on a CTA — let the click pass through, no drag. */
        return;
      }
      dragging = true;
      movedFar = false;
      startX = e.clientX;
      startScroll = track.scrollLeft;
      track.classList.add('modeselect-track-dragging');
      try {
        track.setPointerCapture(e.pointerId);
      } catch {
        /* setPointerCapture can throw on stale ids; ignore. */
      }
    });

    const finishDrag = (e: PointerEvent): void => {
      if (!dragging) return;
      dragging = false;
      track.classList.remove('modeselect-track-dragging');
      try {
        track.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      if (movedFar) {
        /**
         * Suppress the click that browsers fire on pointerup after drag — it
         * would otherwise bubble to a card CTA and start a match accidentally.
         */
        this.modeSelectSuppressClick = true;
        setTimeout(() => {
          this.modeSelectSuppressClick = false;
        }, 0);
      }
    };

    track.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > DRAG_THRESHOLD_PX) movedFar = true;
      track.scrollLeft = startScroll - dx;
    });

    track.addEventListener('pointerup', finishDrag);
    track.addEventListener('pointercancel', finishDrag);
    track.addEventListener('lostpointercapture', () => {
      dragging = false;
      track.classList.remove('modeselect-track-dragging');
    });

    /** Allow keyboard navigation between cards for accessibility. */
    track.tabIndex = 0;
    track.addEventListener('keydown', (e) => {
      const cards = this.getModeSelectCards();
      if (cards.length === 0) return;
      const cur = this.getCurrentCardIdx(cards);
      let next = cur;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') next = Math.min(cards.length - 1, cur + 1);
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') next = Math.max(0, cur - 1);
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = cards.length - 1;
      else return;
      e.preventDefault();
      this.scrollModeSelectToIdx(next, cards);
    });
  }

  private getModeSelectCards(): HTMLElement[] {
    return Array.from(this.modeSelectTrack.querySelectorAll<HTMLElement>('.modeselect-card'));
  }

  private getCurrentCardIdx(cards: readonly HTMLElement[]): number {
    if (cards.length === 0) return 0;
    const trackRect = this.modeSelectTrack.getBoundingClientRect();
    const center = trackRect.left + trackRect.width / 2;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < cards.length; i++) {
      const r = cards[i]!.getBoundingClientRect();
      const cardCenter = r.left + r.width / 2;
      const dist = Math.abs(cardCenter - center);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    return best;
  }

  private scrollModeSelectToIdx(idx: number, cards?: readonly HTMLElement[]): void {
    const list = cards ?? this.getModeSelectCards();
    const target = list[idx];
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }

  private updateModeSelectDots(): void {
    const cards = this.getModeSelectCards();
    if (cards.length === 0) return;
    const idx = this.getCurrentCardIdx(cards);
    if (idx === this.modeSelectActiveIdx) {
      /** Make sure the data-active attribute exists on first paint even when no scroll happened. */
      const dots = this.modeSelectDots.querySelectorAll<HTMLElement>('.modeselect-dot');
      dots.forEach((d, i) => d.setAttribute('data-active', i === idx ? 'true' : 'false'));
      return;
    }
    this.modeSelectActiveIdx = idx;
    const dots = this.modeSelectDots.querySelectorAll<HTMLElement>('.modeselect-dot');
    dots.forEach((d, i) => d.setAttribute('data-active', i === idx ? 'true' : 'false'));
  }

  private renderTournamentStrip(h: HudState, phase: GamePhase | string): void {
    const t = h.tournament;
    const inMatch =
      phase === 'PlayerTurn' ||
      phase === 'AITurn' ||
      phase === 'BallSimulation' ||
      phase === 'TurnEnd' ||
      phase === 'MatchStart';
    if (!t || !inMatch) {
      this.tournamentStrip.setAttribute('data-active', 'false');
      this.tournamentStrip.setAttribute('aria-hidden', 'true');
      return;
    }
    this.tournamentStrip.setAttribute('data-active', 'true');
    this.tournamentStrip.setAttribute('aria-hidden', 'false');
    this.tournamentStrip.setAttribute('data-accent', t.defAccent ?? 'pro');
    this.tournamentStripName.textContent = t.defName ?? 'Tournament';
    const safeRound = Math.min(t.currentRound, Math.max(0, t.size - 1));
    this.tournamentStripCounter.textContent = `${safeRound + 1} / ${t.size}`;
    let dotsHtml = '';
    for (let i = 0; i < t.size; i++) {
      const result = t.record[i] ?? 'pending';
      const status = i === t.currentRound && t.status === 'active' ? 'current' : result;
      dotsHtml += `<li class="bracket-dot bracket-dot-${status}" aria-label="Match ${i + 1} ${status}"></li>`;
    }
    this.tournamentStripDots.innerHTML = dotsHtml;
  }

  private maybePlayMatchIntro(h: HudState, phase: GamePhase | string): void {
    const t = h.tournament;
    const inMatch =
      phase === 'PlayerTurn' ||
      phase === 'AITurn' ||
      phase === 'BallSimulation' ||
      phase === 'TurnEnd' ||
      phase === 'MatchStart';
    if (!t || !inMatch) {
      /** Reset between matches so the next round re-triggers the intro. */
      this.lastMatchIntroKey = null;
      return;
    }
    const key = `${t.defId}:${t.currentRound}`;
    if (key === this.lastMatchIntroKey) return;
    this.lastMatchIntroKey = key;
    this.showMatchIntro(t.defName ?? 'Tournament', t.currentRound + 1, t.size, t.defAccent ?? 'pro');
  }

  private showMatchIntro(name: string, round: number, total: number, accent: string): void {
    if (this.matchIntroTimer != null) {
      clearTimeout(this.matchIntroTimer);
      this.matchIntroTimer = null;
    }
    this.matchIntroSub.textContent = name;
    this.matchIntroTitle.textContent = `Match ${round} / ${total}`;
    this.matchIntro.setAttribute('data-accent', accent);
    /** Force restart the CSS animation by toggling the class across a frame. */
    this.matchIntro.classList.remove('show');
    void this.matchIntro.offsetWidth;
    this.matchIntro.classList.add('show');
    this.matchIntroTimer = setTimeout(() => {
      this.matchIntro.classList.remove('show');
      this.matchIntroTimer = null;
    }, 1300);
  }

  private hideMatchIntro(): void {
    if (this.matchIntroTimer != null) {
      clearTimeout(this.matchIntroTimer);
      this.matchIntroTimer = null;
    }
    this.matchIntro.classList.remove('show');
    this.lastMatchIntroKey = null;
  }

  private syncHudNotice(eb: NonNullable<HudState['eightBall']>): void {
    const notice = eb.hudNotice;
    /** Reaction varsa popup'ı küçük + yukarıda göster (kapatma değil; üst üste binmesin). */
    const compact = eb.opponentReaction != null;
    this.hudNotice.classList.toggle('hud-notice--compact', compact);
    if (!notice) {
      if (this.lastHudNoticeBeatId !== -1) {
        this.hideHudNotice();
      }
      return;
    }
    if (notice.beatId === this.lastHudNoticeBeatId) return;
    this.lastHudNoticeBeatId = notice.beatId;
    this.showHudNotice(notice.kind, notice.text, notice.durationSec);
  }

  private showHudNotice(kind: 'group' | 'foul', text: string, durationSec: number): void {
    if (this.hudNoticeTimer != null) {
      clearTimeout(this.hudNoticeTimer);
      this.hudNoticeTimer = null;
    }
    this.hudNoticeText.textContent = text;
    this.hudNotice.setAttribute('data-kind', kind);
    this.hudNotice.style.setProperty('--hud-notice-dur', `${durationSec}s`);
    this.hudNotice.classList.remove('show');
    void this.hudNotice.offsetWidth;
    this.hudNotice.classList.add('show');
    this.hudNoticeTimer = setTimeout(() => {
      this.hudNotice.classList.remove('show');
      this.hudNoticeTimer = null;
    }, Math.round(durationSec * 1000));
  }

  private hideHudNotice(): void {
    if (this.hudNoticeTimer != null) {
      clearTimeout(this.hudNoticeTimer);
      this.hudNoticeTimer = null;
    }
    this.hudNotice.classList.remove('show');
    this.lastHudNoticeBeatId = -1;
  }

  private renderModeSelectPage(h: HudState): void {
    const coins = h.profile?.coins ?? 0;
    const catalog = h.tournamentCatalog ?? [];
    /**
     * Render key includes everything that affects card content (coin balance
     * for affordability, plus the catalog identity). When unchanged, skip the
     * innerHTML rewrite so the button DOM stays stable across frames — this
     * is what keeps click events alive between pointerdown and pointerup.
     */
    const key = `${coins}|${catalog.map((d) => d.id).join(',')}`;
    if (key === this.modeSelectLastRenderKey) return;
    this.modeSelectLastRenderKey = key;

    const cards: string[] = [];
    cards.push(this.renderCasualCard(coins));
    for (const def of catalog) cards.push(this.renderTournamentCard(def, coins));
    this.modeSelectTrack.innerHTML = cards.join('');
    const total = cards.length;
    let dotsHtml = '';
    for (let i = 0; i < total; i++) {
      dotsHtml += `<span class="modeselect-dot" data-active="${i === 0 ? 'true' : 'false'}"></span>`;
    }
    this.modeSelectDots.innerHTML = dotsHtml;
  }

  private renderCasualCard(_coins: number): string {
    void _coins;
    return `
      <article class="modeselect-card modeselect-card-casual" data-card-idx="0" role="listitem">
        <div class="modeselect-tier-badge">CASUAL</div>
        <div class="modeselect-name">Casual</div>
        <div class="modeselect-tagline">Quick career match</div>
        <div class="modeselect-blurb">A single match against your current career opponent. Win to climb the ladder.</div>
        <div class="modeselect-stats">
          <div class="modeselect-stat">
            <span class="modeselect-stat-label">MATCHES</span>
            <span class="modeselect-stat-value">1</span>
          </div>
        </div>
        <div class="modeselect-prize">
          <div class="modeselect-prize-label">REWARD</div>
          <div class="modeselect-prize-value">+50 coin · +60 XP per win</div>
        </div>
        <div class="modeselect-fee modeselect-fee-free">FREE</div>
        <button class="btn primary modeselect-cta" type="button" data-mode-action="casual">Play</button>
      </article>
    `;
  }

  private renderTournamentCard(
    def: NonNullable<HudState['tournamentCatalog']>[number],
    coins: number,
  ): string {
    const canAfford = coins >= def.entryFeeCoins;
    const tierLabel = TIER_LABELS[def.id] ?? `${def.id.toUpperCase()} TIER`;
    const ctaLabel = canAfford
      ? `Enter — ${formatNumber(def.entryFeeCoins)} 🪙`
      : `Need ${formatNumber(def.entryFeeCoins)} 🪙`;
    const ctaDisabled = canAfford ? '' : 'data-disabled="true"';
    return `
      <article class="modeselect-card modeselect-card-${escapeHtml(def.accent)}" data-card-tournament-id="${escapeHtml(def.id)}" role="listitem">
        <div class="modeselect-tier-badge">${escapeHtml(tierLabel)}</div>
        <div class="modeselect-name">${escapeHtml(def.name)}</div>
        <div class="modeselect-tagline">${escapeHtml(def.tagline)}</div>
        <div class="modeselect-blurb">${escapeHtml(def.blurb)}</div>
        <div class="modeselect-stats">
          <div class="modeselect-stat">
            <span class="modeselect-stat-label">MATCHES</span>
            <span class="modeselect-stat-value">${def.matchCount}</span>
          </div>
          <div class="modeselect-stat">
            <span class="modeselect-stat-label">DIFFICULTY</span>
            <span class="modeselect-stat-value">${renderDifficultyDots(def.difficulty)}</span>
          </div>
        </div>
        <div class="modeselect-prize">
          <div class="modeselect-prize-label">CHAMPION BONUS</div>
          <div class="modeselect-prize-value">+${formatNumber(def.championBonusCoins)} 🪙 · +${formatNumber(def.championBonusXp)} XP</div>
        </div>
        <div class="modeselect-fee${canAfford ? '' : ' modeselect-fee-locked'}">
          ENTRY ${formatNumber(def.entryFeeCoins)} 🪙
        </div>
        <button class="btn ${canAfford ? 'primary' : 'ghost'} modeselect-cta" type="button"
          data-mode-action="tournament:${escapeHtml(def.id)}" ${ctaDisabled}>
          ${escapeHtml(ctaLabel)}
        </button>
      </article>
    `;
  }

  private renderTournamentOverlay(h: HudState): void {
    const t = h.tournament;
    if (!t) {
      this.tournamentSlots.innerHTML = '';
      this.tournamentTitle.textContent = 'Tournament Bracket';
      this.tournamentSub.textContent = '—';
      this.tournamentStartBtn.style.display = 'none';
      return;
    }
    const round = Math.min(t.currentRound, t.size - 1);
    const stillRunning = t.status === 'active' && t.currentRound < t.size;
    const defName = t.defName ?? 'Tournament';
    /** Sync accent class so the bracket modal matches the chosen tournament colour. */
    this.tournamentOverlay.setAttribute('data-accent', t.defAccent ?? 'pro');
    this.tournamentTitle.textContent =
      t.status === 'won'
        ? `${defName} — Champion`
        : t.status === 'lost'
          ? `${defName} — Ended`
          : defName;
    this.tournamentSub.textContent = stillRunning
      ? `Match ${t.currentRound + 1} of ${t.size}`
      : t.status === 'won'
        ? `Cleared all ${t.size} matches`
        : `Eliminated in match ${round + 1}`;
    this.tournamentStartBtn.style.display = stillRunning ? 'inline-flex' : 'none';
    this.tournamentStartBtn.textContent = `Start Match ${t.currentRound + 1}`;
    const untouchedRun =
      t.status === 'active' &&
      t.currentRound === 0 &&
      t.record.every((r) => r === 'pending');
    const exitLabel = this.tournamentExitBtn.querySelector('.modeselect-back-label') as HTMLElement | null;
    const exitText = untouchedRun ? 'Back' : stillRunning ? 'Forfeit' : 'Close';
    if (exitLabel) exitLabel.textContent = exitText;
    else this.tournamentExitBtn.textContent = exitText;

    this.tournamentSlots.innerHTML = t.opponents
      .map((opp, i) => {
        const result = t.record[i] ?? 'pending';
        const isCurrent = stillRunning && i === t.currentRound;
        const status = isCurrent ? 'current' : result;
        const initial = (opp.name?.[0] ?? '?').toUpperCase();
        let hue = 0;
        for (let k = 0; k < opp.id.length; k++) hue = (hue + opp.id.charCodeAt(k) * 37) % 360;
        const pillLabel =
          status === 'won'
            ? 'Won'
            : status === 'lost'
              ? 'Lost'
              : status === 'current'
                ? 'Up Next'
                : 'Locked';
        return `
          <div class="tournament-slot tournament-slot-${status}">
            <div class="tournament-slot-index">M${i + 1}</div>
            <div class="tournament-slot-avatar" style="--t-hue:${hue}">${escapeHtml(initial)}</div>
            <div class="tournament-slot-meta">
              <div class="tournament-slot-name">${escapeHtml(opp.name)}</div>
              <div class="tournament-slot-tier">${escapeHtml(opp.tier.toUpperCase())}</div>
            </div>
            <div class="tournament-slot-pill tournament-pill-${status}">${pillLabel}</div>
          </div>`;
      })
      .join('');
  }

  private showTournamentOverlay(): void {
    this.tournamentVisible = true;
    this.renderTournamentOverlay(this.getHud());
    this.tournamentOverlay.classList.add('show');
  }

  private hideTournamentOverlay(): void {
    this.tournamentVisible = false;
    this.tournamentOverlay.classList.remove('show');
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
    const oppReact = this.end.querySelector('#end-opp-react') as HTMLElement;
    const oppQuote = this.end.querySelector('#end-opp-quote') as HTMLElement;
    const me = h.eightBall?.matchEndOpponentPortrait;
    if (won && me?.portraitAssetId) {
      const entry = AssetManifest[me.portraitAssetId as keyof typeof AssetManifest];
      const src = entry ? resolveBrowserAssetUrl(this.assetBaseUrl, entry.browserUrl) : '';
      oppReact.style.backgroundImage = src ? `url("${src}")` : '';
      oppQuote.textContent = me.text ?? '';
      oppReact.classList.add('show');
      oppReact.setAttribute('aria-hidden', 'false');
    } else {
      oppReact.classList.remove('show');
      oppReact.style.backgroundImage = '';
      oppQuote.textContent = '';
      oppReact.setAttribute('aria-hidden', 'true');
    }
    const t = h.tournament;
    const isTournamentChamp = won && t?.status === 'won';
    const isTournamentMidWin = won && t?.status === 'active';
    const isTournamentLoss = !won && t?.status === 'lost';

    if (isTournamentChamp) {
      title.textContent = 'TOURNAMENT CHAMPION';
    } else if (isTournamentLoss) {
      title.textContent = 'ELIMINATED';
    } else {
      title.textContent = won ? 'YOU WON' : 'YOU LOST';
    }
    title.classList.toggle('end-title-win', won);
    title.classList.toggle('end-title-champion', isTournamentChamp);

    if (isTournamentChamp) {
      const bonusCoin = t?.championBonusCoins ?? 0;
      const bonusXp = t?.championBonusXp ?? 0;
      sub.textContent = `Champion bonus +${formatNumber(bonusCoin)} coin · +${formatNumber(bonusXp)} XP`;
    } else if (isTournamentMidWin && t) {
      sub.textContent = `Match ${t.currentRound} of ${t.size} cleared — ${reason}`;
    } else if (isTournamentLoss && t) {
      const matchNo = Math.min(t.currentRound + 1, t.size);
      sub.textContent = `Eliminated in match ${matchNo} — ${reason}`;
    } else {
      sub.textContent = reason;
    }

    if (isTournamentChamp) {
      this.btnNext.textContent = 'Back to Menu';
    } else if (isTournamentMidWin && t) {
      this.btnNext.textContent = `Next Match (${Math.min(t.currentRound + 1, t.size)}/${t.size})`;
    } else {
      this.btnNext.textContent = 'Return to Home';
    }
    this.btnRematch.textContent = isTournamentLoss ? 'Back to Menu' : 'Rematch';

    this.btnNext.style.display = won ? 'inline-flex' : 'none';
    this.btnRematch.style.display = won ? 'none' : 'inline-flex';
    const reward = won ? h.coinRewardWin ?? 0 : 0;
    /** Champion bonus is awarded by the engine; surface it in the reward chip too. */
    const champBonus = isTournamentChamp ? t?.championBonusCoins ?? 0 : 0;
    const rewardTotal = reward + champBonus;
    this.endReward.textContent = `${rewardTotal > 0 ? '+' : ''}${formatNumber(rewardTotal)} 🪙`;
    const coins = h.profile?.coins ?? 0;
    this.endBalance.textContent = `${formatNumber(coins)} 🪙`;

    /**
     * Champion celebration: a single big "earned" chip (coin + XP) plus
     * lifetime totals. Tournament rounds don't pay per-match, so the only
     * earnings here are the championship bonus, which keeps the math simple
     * and the visual punchy.
     */
    this.endChampion.setAttribute('data-active', isTournamentChamp ? 'true' : 'false');
    this.endChampion.setAttribute('aria-hidden', isTournamentChamp ? 'false' : 'true');
    this.endChampionPrize.setAttribute('data-active', isTournamentChamp ? 'true' : 'false');
    this.endChampionPrize.setAttribute('aria-hidden', isTournamentChamp ? 'false' : 'true');
    /** Champions get a hero treatment — hide the standard reward/balance rows. */
    const endCoins = this.end.querySelector('.end-coins') as HTMLElement | null;
    if (endCoins) endCoins.style.display = isTournamentChamp ? 'none' : '';
    if (isTournamentChamp && t) {
      const accent = t.defAccent ?? 'pro';
      this.end.setAttribute('data-champion-accent', accent);
      this.endChampion.setAttribute('data-accent', accent);
      this.endChampionPrize.setAttribute('data-accent', accent);
      this.endChampionName.textContent = t.defName ?? 'Tournament';

      const earnedCoins = t.championBonusCoins ?? 0;
      const earnedXp = t.championBonusXp ?? 0;
      this.championEarnedCoin.textContent = `+${formatNumber(earnedCoins)} 🪙`;
      this.championEarnedXp.textContent = `+${formatNumber(earnedXp)} XP`;

      const profile = h.profile;
      const totalCoins = profile?.coins ?? 0;
      const accountLevel = profile?.accountLevel ?? 1;
      const totalXp = profile?.xp ?? 0;
      this.championTotalCoin.textContent = `${formatNumber(totalCoins)} 🪙`;
      this.championTotalXp.textContent = `Lv ${accountLevel} · ${formatNumber(totalXp)} XP`;
    } else {
      this.end.removeAttribute('data-champion-accent');
    }

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
    this.powerBarPointerDown = false;
    this.powerBarWrap.style.display = 'none';
    this.powerBarWrap.classList.remove('hint');
    this.powerBarTrack.style.setProperty('--p', '0');
    this.powerBarTrack.style.setProperty('--heat', '0');
    this.stopConfetti();
    this.stopRingAudio();
    this.hideShopOverlay();
    this.hideLeaderboardOverlay();
    this.hideAchievementsOverlay();
    this.hideModeSelectOverlay();
    this.hideTournamentOverlay();
    this.hideMatchIntro();
    this.hideHudNotice();
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Pretty tier label per catalog id. Falls back to `${id.toUpperCase()} TIER` when missing. */
const TIER_LABELS: Readonly<Record<string, string>> = {
  rookie: 'ROOKIE TIER',
  pro: 'PRO TIER',
  elite: 'ELITE TIER',
  grandslam: 'MASTERS',
};

function renderDifficultyDots(level: number): string {
  const max = 5;
  const filled = Math.max(0, Math.min(max, Math.round(level)));
  let out = '';
  for (let i = 0; i < max; i++) {
    out += `<span class="diff-dot${i < filled ? ' diff-dot-on' : ''}"></span>`;
  }
  return out;
}
