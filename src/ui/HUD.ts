import type { GameInputCommand } from '../core/gameContract.js';
import type { HudState, PotHudState } from '../world/renderTypes.js';
import type { GamePhase } from '../core/types.js';
import { AssetManifest } from '../assets/AssetManifest.js';
import { AssetIds } from '../assets/AssetIds.js';
import { resolveBrowserAssetUrl } from '../assets/resolveBrowserAssetUrl.js';
import { XP_REWARD_LOSS, XP_REWARD_PER_BALL_POTTED, XP_REWARD_WIN } from '../core/AccountLevel.js';
import { COIN_REWARD_LOSS, COIN_REWARD_WIN } from '../core/Profile.js';
import { SHOP_CUE_CATALOG } from '../core/ShopCatalog.js';
import { portraitReactionAssetId } from '../opponents/opponentPortraitReactions.js';
import type { StorageAdapter } from '../core/StorageAdapter.js';
import { evaluateAchievements } from './AchievementsCatalog.js';
import { getLeaderboard } from './LeaderboardData.js';

function manifestUrl(assetBaseUrl: string, id: string): string {
  const entry = AssetManifest[id as keyof typeof AssetManifest];
  if (!entry) throw new Error(`[HUD] Missing asset manifest id: ${id}`);
  return resolveBrowserAssetUrl(assetBaseUrl, entry.browserUrl);
}

function opponentHudAvatarUrl(assetBaseUrl: string, opponentId: string): string {
  if (opponentId === 'tungo') {
    const e = AssetManifest['ui.opponent.tungo.avatar'];
    return resolveBrowserAssetUrl(assetBaseUrl, e.browserUrl);
  }
  if (opponentId === 'torta_tartaruga') {
    const e = AssetManifest['ui.opponent.torta_tartaruga.avatar'];
    return resolveBrowserAssetUrl(assetBaseUrl, e.browserUrl);
  }
  if (opponentId === 'gattotto_otto') {
    const e = AssetManifest['ui.opponent.gattotto_otto.avatar'];
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

function opponentSmileReactionUrl(assetBaseUrl: string, opponentId: string): string {
  const smileManifestByOpponentId: Readonly<Record<string, keyof typeof AssetManifest>> = {
    tungo: 'ui.opponent.tungo.reaction.smile',
    torta_tartaruga: 'ui.opponent.torta_tartaruga.reaction.smile',
    gattotto_otto: 'ui.opponent.gattotto_otto.reaction.smile',
  };
  const key = smileManifestByOpponentId[opponentId];
  if (key) {
    const entry = AssetManifest[key];
    if (entry) return resolveBrowserAssetUrl(assetBaseUrl, entry.browserUrl);
  }
  return opponentHudAvatarUrl(assetBaseUrl, opponentId);
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
  private readonly endRewardLabel: HTMLElement;
  private readonly endBalance: HTMLElement;
  /** End-screen headline assets replace plain YOU WON / YOU LOST text. */
  private readonly endTitleWrap: HTMLElement;
  private readonly endTitleImg: HTMLImageElement;
  private readonly urlEndYouWon: string;
  private readonly urlEndYouLose: string;
  private readonly endPlayerName: HTMLElement;
  private readonly endPlayerNameText: HTMLElement;
  private readonly endModeWinBadge: HTMLImageElement;
  private readonly endLossOpponentPortrait: HTMLImageElement;
  private readonly btnPlayAgain: HTMLButtonElement;
  private readonly btnNext: HTMLButtonElement;
  private readonly btnRematch: HTMLButtonElement;
  private readonly urlEndNextGame: string;
  private readonly btnShop: HTMLButtonElement;
  private readonly confettiLayer: HTMLElement;
  /** Legacy row (CSS trophy + tier label) — hidden; tier cup art is `end-mode-win-badge` (`Win_*.png`). */
  private readonly endChampion: HTMLElement;
  private readonly endChampionPrize: HTMLElement;
  private readonly championEarnedCoin: HTMLElement;
  private readonly championEarnedXp: HTMLElement;
  private readonly championTotalCoin: HTMLElement;
  private readonly championTotalXp: HTMLElement;
  private readonly urlChampionRibbonMatch: string;
  private readonly urlChampionRibbonTournament: string;
  private readonly endChampionRibbonImg: HTMLImageElement;
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
  private readonly modeSelectTitleEl: HTMLElement;
  private modeSelectVisible = false;
  /** Pointer-drag state: latches true while a drag exceeds the click threshold so the next click is suppressed. */
  private modeSelectSuppressClick = false;
  /** Last-opened mode-select slice (casual-only vs tournament catalog). */
  private modeSelectFilter: 'casual' | 'tournaments' = 'casual';
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
  private readonly tournamentCupImg: HTMLImageElement;
  private readonly tournamentTitleRow: HTMLElement;
  private readonly tournamentStartBtn: HTMLButtonElement;
  private readonly tournamentStartLabel: HTMLElement;
  private readonly tournamentEntryFeeEl: HTMLElement;
  private readonly tournamentEntryFeeNumEl: HTMLElement;
  private readonly tournamentChampionPrizeEl: HTMLElement;
  private readonly tournamentExitBtn: HTMLButtonElement;
  private tournamentVisible = false;
  /**
   * "Casual Showcase" overlay — replaces the legacy mode-select page when the
   * player taps PLAY from the main menu hub. Shows a single anonymous
   * opponent silhouette and a free "Start Game" CTA. The actual opponent id
   * is still rolled inside `beginCareer` (server-side), so nothing about who
   * the player will face leaks through the DOM — this is the "anonim" intent.
   */
  private readonly casualOverlay: HTMLElement;
  private readonly casualStartBtn: HTMLButtonElement;
  private readonly casualBackBtn: HTMLButtonElement;
  private casualVisible = false;
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
  private readonly ballInHandHintLabel: HTMLElement;
  private readonly ballInHandConfirmBtn: HTMLButtonElement;
  private hudNoticeTimer: ReturnType<typeof setTimeout> | null = null;
  private lastHudNoticeBeatId = -1;
  /** `${defId}:${currentRound}` of the most recently introduced match — prevents re-triggering. */
  private lastMatchIntroKey: string | null = null;
  private readonly menuAccountLevel: HTMLElement;
  private readonly menuAccountFill: HTMLElement;
  private readonly menuAccountText: HTMLElement;
  private readonly menuCoinAmount: HTMLElement;
  private readonly menuPlayBtn: HTMLButtonElement;
  private readonly menuTournamentsBtn: HTMLButtonElement;
  private readonly menuLeaderboardBtn: HTMLButtonElement;
  private readonly menuShopBtn: HTMLButtonElement;
  private readonly menuAchievementsBtn: HTMLButtonElement;
  private readonly menuAccountChip: HTMLElement;
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
  /** Floating cursor hint next to the power bar during first-run tutorial. */
  private readonly tutorialPowerDrag: HTMLElement;
  private readonly powerBarTrack: HTMLElement;
  /** True while user has primary pointer down on the power track (avoid HUD sync overwriting `--p`). */
  private powerBarPointerDown = false;
  /** Active pointer id while dragging inside the spin popup pad; null when idle. */
  private spinPopupDragId: number | null = null;
  private spinPopupVisible = false;
  private readonly spinOpenBtn: HTMLButtonElement;
  private readonly spinPopupOverlay: HTMLElement;
  private readonly spinPopupBackdrop: HTMLElement;
  private readonly spinPopupPanel: HTMLElement;
  private readonly spinPopupPad: HTMLElement;
  private readonly spinPopupBall: HTMLElement;
  private readonly spinPopupDot: HTMLElement;
  private readonly spinPopupReadout: HTMLElement;
  private readonly spinPopupClose: HTMLButtonElement;
  private readonly spinPopupReset: HTMLButtonElement;
  private lastSpinPadTapMs = 0;
  private lastSpinPadTapLen = 10;
  private readonly storage: StorageAdapter | null;
  private readonly aimIntroOverlay: HTMLElement;
  private readonly aimIntroTitle: HTMLElement;
  private readonly aimIntroBody: HTMLElement;
  private readonly aimIntroConfirm: HTMLButtonElement;
  /** In-game currency uses `public/ui/money.png` everywhere (replaces legacy coin emoji / glyph). */
  private readonly coinIconUrl: string;

  constructor(
    root: HTMLElement,
    private readonly getHud: () => HudState,
    private readonly pushCommand: (c: GameInputCommand) => void,
    private readonly assetBaseUrl: string,
    private readonly opts?: {
      toggleSound?: () => boolean;
      isSoundMuted?: () => boolean;
      playUiClick?: () => void;
      storage?: StorageAdapter;
    },
  ) {
    this.coinIconUrl = manifestUrl(this.assetBaseUrl, AssetIds.uiMoney);
    this.root = root;
    this.storage = opts?.storage ?? null;
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
        <div class="menu-primary-btns">
          <button id="menu-btn-play" class="menu-play-btn interactive" type="button" aria-label="Casual — pick a quick match"></button>
          <button id="menu-btn-tournaments" class="menu-tournaments-btn interactive" type="button" aria-label="Tournaments"></button>
          <button id="menu-btn-shop" class="menu-shop-main-btn interactive" type="button" aria-label="Shop"></button>
        </div>
        <div class="menu-circle-row menu-circle-row--pair">
          <button class="menu-circle-btn interactive" id="menu-circle-leaderboard" type="button" aria-label="Leaderboard">
            <span class="menu-circle-icon menu-icon-trophy" aria-hidden="true"></span>
          </button>
          <button class="menu-circle-btn interactive" id="menu-circle-achievements" type="button" aria-label="Achievements">
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
          <span class="hud-tournament-strip-counter" id="hud-tournament-strip-counter">1 / 3</span>
        </div>
        <div class="hud-top-main">
          <div class="hud-side hud-side-ai">
            <div class="hud-ident-block">
              <div class="hud-ident-row hud-ident-row--meta">
                <div class="hud-side-text hud-ident-text">
                  <div class="side-line">
                    <span id="opp-name" class="side-name">—</span>
                    <span id="opp-lvl" class="lvl-star lvl-star-ai" aria-label="Opponent level">1</span>
                  </div>
                </div>
              </div>
              <div class="hud-pot-below-name hud-pot-below-name--ai" aria-hidden="true">
                <div id="pot-chips-left" class="pot-chips pot-chips--under-name pot-chips-end"></div>
                <div id="pot-opponent-group-label" class="pot-opponent-group-label"></div>
              </div>
            </div>
          </div>
          <div class="hud-center-col">
            <div class="hud-match-duel">
              <div class="hud-duel-side hud-duel-side--ai">
                <div class="avatar-frame interactive" id="ai-avatar-frame" aria-hidden="true">
                  <div class="avatar-inner">
                    <img id="ai-avatar-img" class="avatar-photo" src="${resolveBrowserAssetUrl(this.assetBaseUrl, AssetManifest['ui.avatar.genericOpponent'].browserUrl)}" alt="" decoding="async" />
                  </div>
                </div>
              </div>
              <img class="hud-vs-flare" src="${manifestUrl(this.assetBaseUrl, AssetIds.uiVsFlare)}" alt="" decoding="async" draggable="false" />
              <div class="hud-duel-side hud-duel-side--pl">
                <div class="hud-duel-pl-anchor">
                  <div class="avatar-frame interactive" id="pl-avatar-frame" aria-hidden="true">
                    <div class="avatar-inner">
                      <img id="pl-avatar-img" class="avatar-photo" src="${resolveBrowserAssetUrl(this.assetBaseUrl, AssetManifest['ui.avatar.player'].browserUrl)}" alt="" decoding="async" />
                    </div>
                  </div>
                  <div class="hud-your-turn-indicator-float">
                    <div
                      class="hud-your-turn-indicator"
                      id="hud-your-turn-indicator"
                      hidden
                      data-active="false"
                      role="status"
                      aria-live="polite"
                      aria-atomic="true"
                    >
                      <span class="hud-your-turn-indicator__bloom" aria-hidden="true"></span>
                      <span class="hud-your-turn-indicator__inner">
                        <span class="hud-your-turn-indicator__shine" aria-hidden="true"></span>
                        <span class="hud-your-turn-indicator__text">YOUR TURN!</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="spin spin-top spin-center spin-top-wrap" id="spin-top-wrap">
              <button
                type="button"
                class="spin-open-btn interactive"
                id="spin-open-btn"
                aria-label="Hit position and spin"
                aria-haspopup="dialog"
                aria-expanded="false"
              >
                <span class="cue-mini cue-spin-main" aria-hidden="true"><span id="spin-dot" class="spin-dot"></span></span>
              </button>
            </div>
          </div>
          <div class="hud-side hud-side-player">
            <div class="hud-ident-block hud-ident-block--end">
              <div class="hud-ident-row hud-ident-row--meta">
                <div class="hud-side-text hud-ident-text">
                  <div class="side-line side-line-end">
                    <span id="pl-name" class="side-name">You</span>
                    <span id="pl-lvl" class="lvl-star" aria-label="Level">1</span>
                  </div>
                </div>
              </div>
              <div class="hud-pot-below-name hud-pot-below-name--pl" aria-hidden="true">
                <div id="pot-chips-right" class="pot-chips pot-chips--under-name"></div>
                <div id="pot-player-group-label" class="pot-player-group-label"></div>
              </div>
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

    this.urlChampionRibbonMatch = manifestUrl(this.assetBaseUrl, AssetIds.uiChampionRibbonMatch);
    this.urlChampionRibbonTournament = manifestUrl(this.assetBaseUrl, AssetIds.uiChampionRibbonTournament);
    this.end = el('div', 'panel end interactive');
    const endPlayCtaUrl = manifestUrl(this.assetBaseUrl, AssetIds.uiPlayCta);
    const endPlayAgainUrl = manifestUrl(this.assetBaseUrl, AssetIds.uiPlayAgain);
    this.urlEndNextGame = manifestUrl(this.assetBaseUrl, AssetIds.uiNextGame);
    this.end.innerHTML = `
      <div class="end-result-hero" aria-hidden="false">
        <div id="end-title-wrap" class="end-title-wrap">
          <img id="end-title-img" class="end-title-img" src="" alt="" decoding="async" draggable="false" />
        </div>
      </div>
      <div class="end-champion-ribbon-surface" aria-hidden="true">
        <div id="end-champion-ribbon-wrap" class="end-champion-ribbon-wrap" hidden>
          <img
            id="end-champion-ribbon-img"
            class="end-champion-ribbon-img"
            src="${this.urlChampionRibbonMatch}"
            alt=""
            decoding="async"
            draggable="false"
          />
        </div>
      </div>
      <div class="end-card">
        <div id="end-champion" class="end-champion" data-active="false" aria-hidden="true"></div>
        <div id="end-player-name" class="end-player-name">
          <span id="end-player-name-text" class="end-player-name-text">You</span>
          <img
            id="end-mode-win-badge"
            class="end-mode-win-badge"
            src=""
            alt=""
            decoding="async"
            draggable="false"
          />
          <img
            id="end-loss-opponent-portrait"
            class="end-loss-opponent-portrait"
            src=""
            alt=""
            decoding="async"
            draggable="false"
          />
        </div>
        <div class="end-head">
          <div id="end-sub" class="sub end-reason-sub">—</div>
          <div class="end-level-row">
            <span class="end-level-label">Your level</span>
            <span id="end-lvl" class="lvl-star lvl-clickable end-lvl-badge" aria-label="Level">1</span>
          </div>
          <div class="end-xp-block">
            <div class="end-xp-track" aria-hidden="true">
              <div id="end-xp-fill" class="end-xp-fill"></div>
            </div>
            <div id="end-xp-delta" class="end-xp-delta">+0 EXP</div>
          </div>
        </div>
        <div id="end-champion-prize" class="end-champion-prize" data-active="false" aria-hidden="true">
          <div class="prize-earned">
            <div class="prize-earned-coin" id="champion-earned-coin"><span class="prize-earned-coin-amount">+0</span><img class="hud-inline-coin-icon hud-inline-coin-icon--prize" src="${escapeHtml(this.coinIconUrl)}" alt="" width="34" height="34" decoding="async" draggable="false" /></div>
            <div class="prize-earned-xp" id="champion-earned-xp">+0 XP</div>
          </div>
          <div class="prize-totals">
            <span class="prize-total-chip prize-total-chip--coin" id="champion-total-coin">0<img class="hud-inline-coin-icon hud-inline-coin-icon--total" src="${escapeHtml(this.coinIconUrl)}" alt="" width="22" height="22" decoding="async" draggable="false" /></span>
            <span class="prize-total-sep" aria-hidden="true">·</span>
            <span class="prize-total-chip" id="champion-total-xp">Lv 1 · 0 XP</span>
          </div>
        </div>
        <div class="end-coins">
          <div class="end-coins-row">
            <span class="end-coins-label" id="end-reward-label">Reward</span>
            <span id="end-reward" class="end-coins-value">+0</span>
          </div>
          <div class="end-coins-row">
            <span class="end-coins-label">Balance</span>
            <span id="end-balance" class="end-coins-value">0</span>
          </div>
        </div>
        <div class="end-actions">
          <button id="btn-shop" class="btn ghost btn-icon-only end-icon-btn end-icon-btn--shop" aria-label="Open shop" title="Shop">
            <img class="btn-icon" src="${manifestUrl(this.assetBaseUrl, AssetIds.uiButtonShop)}" alt="" decoding="async" draggable="false" />
          </button>
          <div class="end-actions-mid">
            <button id="btn-play-again" type="button" class="end-play-again-btn interactive" aria-label="Play Again" title="Play Again">
              <img
                class="end-play-again-img"
                src="${endPlayAgainUrl}"
                alt=""
                decoding="async"
                draggable="false"
              />
            </button>
          </div>
          <div class="end-actions-main">
            <button id="btn-rematch" class="btn ghost btn-icon-only end-icon-btn end-icon-btn--home" aria-label="Back to main menu" title="Back to Main Menu">
              <img class="btn-icon" src="${manifestUrl(this.assetBaseUrl, AssetIds.uiButtonMainMenu)}" alt="" decoding="async" draggable="false" />
            </button>
            <button id="btn-next" class="btn btn-next primary" aria-label="Next match" title="Next Match">
              <img class="btn-next-home-icon" src="${manifestUrl(this.assetBaseUrl, AssetIds.uiButtonMainMenu)}" alt="" decoding="async" draggable="false" />
              <span class="btn-next-label">Next Match</span>
            </button>
          </div>
        </div>
      </div>
      <div id="confetti-layer" class="confetti-layer" aria-hidden="true"></div>
    `;
    this.endReward = this.end.querySelector('#end-reward') as HTMLElement;
    this.endRewardLabel = this.end.querySelector('#end-reward-label') as HTMLElement;
    this.endBalance = this.end.querySelector('#end-balance') as HTMLElement;
    this.endTitleWrap = this.end.querySelector('#end-title-wrap') as HTMLElement;
    this.endTitleImg = this.end.querySelector('#end-title-img') as HTMLImageElement;
    this.urlEndYouWon = manifestUrl(this.assetBaseUrl, AssetIds.uiYouWon);
    this.urlEndYouLose = manifestUrl(this.assetBaseUrl, AssetIds.uiYouLose);
    this.endPlayerName = this.end.querySelector('#end-player-name') as HTMLElement;
    this.endPlayerNameText = this.end.querySelector('#end-player-name-text') as HTMLElement;
    this.endModeWinBadge = this.end.querySelector('#end-mode-win-badge') as HTMLImageElement;
    this.endLossOpponentPortrait = this.end.querySelector('#end-loss-opponent-portrait') as HTMLImageElement;
    this.end.style.setProperty('--end-play-cta-url', `url("${endPlayCtaUrl}")`);
    this.btnPlayAgain = this.end.querySelector('#btn-play-again') as HTMLButtonElement;
    this.btnNext = this.end.querySelector('#btn-next') as HTMLButtonElement;
    this.btnRematch = this.end.querySelector('#btn-rematch') as HTMLButtonElement;
    this.btnShop = this.end.querySelector('#btn-shop') as HTMLButtonElement;
    this.confettiLayer = this.end.querySelector('#confetti-layer') as HTMLElement;
    this.endChampion = this.end.querySelector('#end-champion') as HTMLElement;
    this.endChampionPrize = this.end.querySelector('#end-champion-prize') as HTMLElement;
    this.championEarnedCoin = this.end.querySelector('#champion-earned-coin') as HTMLElement;
    this.championEarnedXp = this.end.querySelector('#champion-earned-xp') as HTMLElement;
    this.championTotalCoin = this.end.querySelector('#champion-total-coin') as HTMLElement;
    this.championTotalXp = this.end.querySelector('#champion-total-xp') as HTMLElement;
    this.endChampionRibbonImg = this.end.querySelector('#end-champion-ribbon-img') as HTMLImageElement;

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
      </div>
    `;
    this.levelTitle = this.levelOverlay.querySelector('#hud-level-title') as HTMLElement;
    this.levelProgressBar = this.levelOverlay.querySelector('#hud-level-progress-bar') as HTMLElement;
    this.levelProgressText = this.levelOverlay.querySelector('#hud-level-progress-text') as HTMLElement;
    this.levelCurrentRank = this.levelOverlay.querySelector('#hud-level-current') as HTMLElement;
    this.levelNextRank = this.levelOverlay.querySelector('#hud-level-next') as HTMLElement;
    this.levelWinsNeeded = this.levelOverlay.querySelector('#hud-level-wins-needed') as HTMLElement;
    this.menuLevel = this.menu.querySelector('#menu-lvl') as HTMLElement | null;
    this.endLevel = this.end.querySelector('#end-lvl') as HTMLElement;

    this.shopOverlay = el('div', 'hud-shop-overlay');
    const shopBannerArt = manifestUrl(this.assetBaseUrl, AssetIds.uiShopBanner);
    this.shopOverlay.innerHTML = `
      <div class="hud-shop-backdrop" id="hud-shop-backdrop"></div>
      <div class="hud-shop-modal">
        <div class="hud-shop-topbar">
          <div class="hud-shop-title">Cue Shop</div>
          <div class="hud-shop-balance" id="hud-shop-coins">0<img class="hud-inline-coin-icon hud-inline-coin-icon--shop-bar" src="${escapeHtml(this.coinIconUrl)}" alt="" width="22" height="22" decoding="async" draggable="false" /></div>
          <button class="hud-shop-close" id="hud-shop-close" aria-label="Close shop">×</button>
        </div>
        <div class="hud-shop-banner" aria-hidden="true">
          <img class="hud-shop-banner-img" src="${shopBannerArt}" alt="" decoding="async" draggable="false" />
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
        <div class="hud-leaderboard-topbar hud-shop-topbar">
          <div class="hud-shop-title">Leaderboard</div>
          <div class="hud-shop-balance hud-lb-top-pill">Online ranking — coming soon</div>
          <button class="hud-shop-close" id="hud-leaderboard-close" type="button" aria-label="Close leaderboard">×</button>
        </div>
        <div class="hud-leaderboard-grid hud-shop-grid" id="hud-leaderboard-list"></div>
      </div>
    `;
    this.leaderboardList = this.leaderboardOverlay.querySelector('#hud-leaderboard-list') as HTMLElement;

    this.achievementsOverlay = el('div', 'hud-achievements-overlay');
    this.achievementsOverlay.innerHTML = `
      <div class="hud-achievements-backdrop" id="hud-achievements-backdrop"></div>
      <div class="hud-achievements-modal">
        <div class="hud-achievements-topbar hud-shop-topbar">
          <div class="hud-shop-title">Achievements</div>
          <div class="hud-shop-balance" id="hud-achievements-sub">0 / 0 unlocked</div>
          <button class="hud-shop-close" id="hud-achievements-close" type="button" aria-label="Close achievements">×</button>
        </div>
        <div class="hud-achievements-grid hud-shop-grid" id="hud-achievements-list"></div>
      </div>
    `;
    this.achievementsList = this.achievementsOverlay.querySelector('#hud-achievements-list') as HTMLElement;

    this.menuAccountChip = this.menu.querySelector('#menu-account') as HTMLElement;
    this.menuAccountLevel = this.menu.querySelector('#menu-account-level') as HTMLElement;
    this.menuAccountFill = this.menu.querySelector('#menu-account-fill') as HTMLElement;
    this.menuAccountText = this.menu.querySelector('#menu-account-text') as HTMLElement;
    this.menuCoinAmount = this.menu.querySelector('#menu-coin-amount') as HTMLElement;
    this.menuPlayBtn = this.menu.querySelector('#menu-btn-play') as HTMLButtonElement;
    this.menuTournamentsBtn = this.menu.querySelector('#menu-btn-tournaments') as HTMLButtonElement;
    this.menuLeaderboardBtn = this.menu.querySelector('#menu-circle-leaderboard') as HTMLButtonElement;
    this.menuShopBtn = this.menu.querySelector('#menu-btn-shop') as HTMLButtonElement;
    this.menuAchievementsBtn = this.menu.querySelector('#menu-circle-achievements') as HTMLButtonElement;

    this.modeSelectOverlay = el('div', 'hud-modeselect-overlay');
    this.modeSelectOverlay.innerHTML = `
      <div class="hud-modeselect-page">
        <div class="hud-modeselect-bg" aria-hidden="true"></div>
        <div class="hud-modeselect-fx" aria-hidden="true"></div>
        <div class="hud-modeselect-content">
          <div class="modeselect-header">
            <button class="modeselect-back" id="modeselect-back" type="button" aria-label="Back to menu">
              <span class="modeselect-back-glyph" aria-hidden="true"></span>
              <span class="modeselect-back-label">Back</span>
            </button>
            <div class="modeselect-title" id="modeselect-title">Select Mode</div>
            <div class="modeselect-spacer" aria-hidden="true"></div>
          </div>
          <div class="modeselect-track-scrim">
            <div class="modeselect-track" id="modeselect-track" role="list"></div>
          </div>
          <div class="modeselect-dots" id="modeselect-dots" aria-hidden="true"></div>
        </div>
      </div>
    `;
    this.modeSelectTrack = this.modeSelectOverlay.querySelector('#modeselect-track') as HTMLElement;
    this.modeSelectDots = this.modeSelectOverlay.querySelector('#modeselect-dots') as HTMLElement;
    this.modeSelectBackBtn = this.modeSelectOverlay.querySelector('#modeselect-back') as HTMLButtonElement;
    this.modeSelectTitleEl = this.modeSelectOverlay.querySelector('#modeselect-title') as HTMLElement;

    this.tournamentOverlay = el('div', 'hud-tournament-overlay');
    const tournamentPlayIcon = manifestUrl(this.assetBaseUrl, AssetIds.uiButtonStart);
    this.tournamentOverlay.innerHTML = `
      <div class="hud-tournament-overlay-bg" aria-hidden="true"></div>
      <div class="hud-tournament-overlay-fx" aria-hidden="true"></div>
      <div class="hud-tournament-modal">
        <div class="hud-tournament-header">
          <button class="modeselect-back hud-tournament-back" id="hud-tournament-exit" type="button" aria-label="Back to mode select">
            <span class="modeselect-back-glyph" aria-hidden="true"></span>
            <span class="modeselect-back-label">Back</span>
          </button>
            <div class="hud-tournament-head-center">
              <div class="hud-tournament-title-row" id="hud-tournament-title-row">
                <img class="hud-tournament-cup hud-tournament-cup--hidden" id="hud-tournament-cup" alt="" decoding="async" draggable="false" />
              </div>
            </div>
          <div class="modeselect-spacer" aria-hidden="true"></div>
        </div>
        <div class="hud-tournament-slots" id="hud-tournament-slots"></div>
        <p id="hud-tournament-champion-prize" class="hud-tournament-champion-prize" aria-live="polite"></p>
        <button class="hud-tournament-start interactive" id="hud-tournament-start" type="button" aria-label="Start Match 1">
          <span class="hud-tournament-start-inner">
            <img class="hud-tournament-start-plate" src="${tournamentPlayIcon}" alt="" decoding="async" draggable="false" />
            <span class="hud-tournament-start-overlay-col">
              <span id="hud-tournament-start-label" class="hud-tournament-start-label">Start Match 1</span>
              <span id="hud-tournament-entry-fee" class="hud-tournament-entry-fee" hidden aria-live="polite">
                <span id="hud-tournament-entry-fee-num" class="hud-tournament-entry-fee-num"></span>
                <img class="hud-tournament-entry-fee-coin" src="${escapeHtml(this.coinIconUrl)}" alt="" width="24" height="24" decoding="async" draggable="false" />
              </span>
            </span>
          </span>
        </button>
      </div>
    `;
    this.tournamentSlots = this.tournamentOverlay.querySelector('#hud-tournament-slots') as HTMLElement;
    this.tournamentCupImg = this.tournamentOverlay.querySelector('#hud-tournament-cup') as HTMLImageElement;
    this.tournamentTitleRow = this.tournamentOverlay.querySelector('#hud-tournament-title-row') as HTMLElement;
    this.tournamentStartBtn = this.tournamentOverlay.querySelector('#hud-tournament-start') as HTMLButtonElement;
    this.tournamentStartLabel = this.tournamentOverlay.querySelector('#hud-tournament-start-label') as HTMLElement;
    this.tournamentEntryFeeEl = this.tournamentOverlay.querySelector('#hud-tournament-entry-fee') as HTMLElement;
    this.tournamentEntryFeeNumEl = this.tournamentOverlay.querySelector('#hud-tournament-entry-fee-num') as HTMLElement;
    this.tournamentChampionPrizeEl = this.tournamentOverlay.querySelector('#hud-tournament-champion-prize') as HTMLElement;
    this.tournamentExitBtn = this.tournamentOverlay.querySelector('#hud-tournament-exit') as HTMLButtonElement;

    /**
     * Casual showcase overlay — single anonymous opponent + reward chips +
     * Start Game CTA. Reuses the same `button-start.png` plate as the
     * tournament Start button to stay visually consistent. The avatar is
     * pure CSS (`?` glyph on a radial gradient) so no opponent image is
     * preloaded — guarantees the matchup stays a surprise until in-match.
     */
    const casualStartPlate = manifestUrl(this.assetBaseUrl, AssetIds.uiButtonStart);
    this.casualOverlay = el('div', 'hud-casual-overlay');
    this.casualOverlay.setAttribute('role', 'dialog');
    this.casualOverlay.setAttribute('aria-modal', 'true');
    this.casualOverlay.setAttribute('aria-label', 'Casual match — mystery opponent');
    this.casualOverlay.innerHTML = `
      <div class="hud-casual-overlay-bg" aria-hidden="true"></div>
      <div class="hud-casual-overlay-fx" aria-hidden="true"></div>
      <div class="hud-casual-modal">
        <div class="hud-casual-header">
          <button class="modeselect-back hud-casual-back" id="hud-casual-exit" type="button" aria-label="Back to main menu">
            <span class="modeselect-back-glyph" aria-hidden="true"></span>
            <span class="modeselect-back-label">Back</span>
          </button>
          <div class="hud-casual-head-center">
            <div class="hud-casual-title">Casual Match</div>
            <div class="hud-casual-kicker">Free play</div>
          </div>
          <span class="modeselect-spacer" aria-hidden="true"></span>
        </div>
        <div class="hud-casual-stage">
          <div class="hud-casual-opponent">
            <div class="hud-casual-anon-avatar" aria-hidden="true">
              <span class="hud-casual-anon-avatar-ring" aria-hidden="true"></span>
              <span class="hud-casual-anon-avatar-glyph">?</span>
            </div>
            <div class="hud-casual-anon-meta">
              <div class="hud-casual-anon-name">???</div>
              <div class="hud-casual-anon-sub">Mystery Opponent</div>
            </div>
          </div>
          <div class="hud-casual-rewards" role="group" aria-label="Match rewards">
            <div class="hud-casual-rewards-label">Match rewards</div>
            <div class="hud-casual-rewards-row">
              <div class="hud-casual-reward-pill hud-casual-reward-pill--coin">
                <img class="hud-casual-reward-icon" src="${escapeHtml(this.coinIconUrl)}" alt="" width="26" height="26" decoding="async" draggable="false" />
                <span class="hud-casual-reward-num">+${formatNumber(COIN_REWARD_WIN)}</span>
                <span class="hud-casual-reward-unit">coins on win</span>
              </div>
              <div class="hud-casual-reward-pill hud-casual-reward-pill--coin hud-casual-reward-pill--muted">
                <img class="hud-casual-reward-icon" src="${escapeHtml(this.coinIconUrl)}" alt="" width="26" height="26" decoding="async" draggable="false" />
                <span class="hud-casual-reward-num">+${formatNumber(COIN_REWARD_LOSS)}</span>
                <span class="hud-casual-reward-unit">if you lose</span>
              </div>
              <div class="hud-casual-reward-pill hud-casual-reward-pill--xp">
                <span class="hud-casual-reward-xp-badge" aria-hidden="true">XP</span>
                <span class="hud-casual-reward-num">+${formatNumber(XP_REWARD_WIN)}</span>
                <span class="hud-casual-reward-unit">base on win</span>
              </div>
            </div>
            <div class="hud-casual-rewards-sub">+${formatNumber(XP_REWARD_PER_BALL_POTTED)} XP per ball you pocket · +${formatNumber(XP_REWARD_LOSS)} XP if you lose (still counts balls)</div>
          </div>
        </div>
        <button class="hud-casual-start interactive" id="hud-casual-start" type="button" aria-label="Start game">
          <span class="hud-casual-start-inner">
            <img class="hud-casual-start-plate" src="${casualStartPlate}" alt="" decoding="async" draggable="false" />
            <span class="hud-casual-start-overlay-col">
              <span class="hud-casual-start-label">Start Game</span>
            </span>
          </span>
        </button>
      </div>
    `;
    this.casualStartBtn = this.casualOverlay.querySelector('#hud-casual-start') as HTMLButtonElement;
    this.casualBackBtn = this.casualOverlay.querySelector('#hud-casual-exit') as HTMLButtonElement;

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
    this.soundBtn.setAttribute('aria-label', 'Toggle music');
    this.soundBtnIcon = document.createElement('img');
    this.soundBtnIcon.className = 'hud-sound-btn-icon';
    this.soundBtnIcon.alt = '';
    this.soundBtnIcon.decoding = 'async';
    this.soundBtn.append(this.soundBtnIcon);

    this.tournamentStrip = this.topStack.querySelector('#hud-tournament-strip') as HTMLElement;
    this.tournamentStripName = this.topStack.querySelector('#hud-tournament-strip-name') as HTMLElement;
    this.tournamentStripDots = this.topStack.querySelector('#hud-tournament-strip-dots') as HTMLElement;
    this.tournamentStripCounter = this.topStack.querySelector('#hud-tournament-strip-counter') as HTMLElement;

    this.matchIntro = el('div', 'hud-match-intro');
    this.matchIntro.setAttribute('aria-hidden', 'true');
    this.matchIntro.innerHTML = `
      <div class="hud-match-intro-card">
        <div class="hud-match-intro-sub" id="hud-match-intro-sub">Tournament</div>
        <div class="hud-match-intro-title" id="hud-match-intro-title">Match 1 / 3</div>
      </div>
    `;
    this.matchIntroTitle = this.matchIntro.querySelector('#hud-match-intro-title') as HTMLElement;
    this.matchIntroSub = this.matchIntro.querySelector('#hud-match-intro-sub') as HTMLElement;

    this.spinOpenBtn = this.topStack.querySelector('#spin-open-btn') as HTMLButtonElement;
    this.spinPopupOverlay = el('div', 'hud-spin-popup');
    this.spinPopupOverlay.setAttribute('aria-hidden', 'true');
    this.spinPopupOverlay.innerHTML = `
      <div class="hud-spin-popup-backdrop" id="spin-popup-backdrop"></div>
      <div class="hud-spin-popup-panel" role="dialog" aria-modal="true" aria-labelledby="spin-popup-title">
        <button type="button" class="hud-spin-popup-close interactive" id="spin-popup-close" aria-label="Close hit position popup">×</button>
        <div id="spin-popup-title" class="hud-spin-popup-title">Hit position</div>
        <div id="spin-popup-readout" class="hud-spin-popup-readout">X +0.00 | Y +0.00</div>
        <div class="spin spin-popup-inner interactive" id="spin-popup-pad" aria-label="Choose hit position on cue ball">
          <div class="cue-spin-popup-ball" id="spin-popup-ball"><div id="spin-popup-dot" class="spin-dot spin-dot--popup"></div></div>
        </div>
        <button type="button" class="hud-spin-popup-reset interactive" id="spin-popup-reset">Reset</button>
      </div>
    `;
    this.spinPopupBackdrop = this.spinPopupOverlay.querySelector('#spin-popup-backdrop') as HTMLElement;
    this.spinPopupPanel = this.spinPopupOverlay.querySelector('.hud-spin-popup-panel') as HTMLElement;
    this.spinPopupPad = this.spinPopupOverlay.querySelector('#spin-popup-pad') as HTMLElement;
    this.spinPopupBall = this.spinPopupOverlay.querySelector('#spin-popup-ball') as HTMLElement;
    this.spinPopupDot = this.spinPopupOverlay.querySelector('#spin-popup-dot') as HTMLElement;
    this.spinPopupReadout = this.spinPopupOverlay.querySelector('#spin-popup-readout') as HTMLElement;
    this.spinPopupClose = this.spinPopupOverlay.querySelector('#spin-popup-close') as HTMLButtonElement;
    this.spinPopupReset = this.spinPopupOverlay.querySelector('#spin-popup-reset') as HTMLButtonElement;

    this.hudNotice = el('div', 'hud-notice');
    this.hudNotice.setAttribute('aria-hidden', 'true');
    this.hudNotice.innerHTML = `<div class="hud-notice-text" id="hud-notice-text"></div>`;
    this.hudNoticeText = this.hudNotice.querySelector('#hud-notice-text') as HTMLElement;
    this.ballInHandHintLabel = el('div', 'hud-ballinhand-hint');
    this.ballInHandHintLabel.textContent = 'Drag to Place';
    this.ballInHandHintLabel.setAttribute('aria-hidden', 'true');
    this.ballInHandConfirmBtn = document.createElement('button');
    this.ballInHandConfirmBtn.type = 'button';
    this.ballInHandConfirmBtn.className = 'hud-ballinhand-confirm interactive';
    this.ballInHandConfirmBtn.textContent = 'Confirm';
    this.ballInHandConfirmBtn.setAttribute('aria-label', 'Confirm cue ball placement');
    this.ballInHandConfirmBtn.setAttribute('aria-hidden', 'true');

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
    const mutedTrack = manifestUrl(this.assetBaseUrl, AssetIds.uiPowerTrackMuted);
    const spectrumTrack = manifestUrl(this.assetBaseUrl, AssetIds.uiPowerTrackSpectrum);
    this.powerBarTrack.style.setProperty('--hud-power-muted-img', `url("${mutedTrack}")`);
    this.powerBarTrack.style.setProperty('--hud-power-spectrum-img', `url("${spectrumTrack}")`);
    this.powerBarWrap.style.display = 'none';

    const powerInner = this.powerBarWrap.querySelector('.hud-power-bar-inner') as HTMLElement;
    this.tutorialPowerDrag = el('div', 'hud-tutorial-power-drag');
    this.tutorialPowerDrag.setAttribute('aria-hidden', 'true');
    const tutImg = document.createElement('img');
    tutImg.className = 'hud-tutorial-power-drag-img';
    tutImg.alt = '';
    tutImg.decoding = 'async';
    tutImg.src = manifestUrl(this.assetBaseUrl, AssetIds.tutorialDragFinger);
    tutImg.addEventListener(
      'error',
      () => {
        tutImg.src = manifestUrl(this.assetBaseUrl, AssetIds.uiButtonPlayLegacy);
      },
      { once: true },
    );
    this.tutorialPowerDrag.append(tutImg);
    powerInner.append(this.tutorialPowerDrag);

    /** Menu background — lounge art under the hub (`public/ui/bg.jpg`). */
    const menuBgUrl = manifestUrl(this.assetBaseUrl, AssetIds.uiMenuBg);
    this.menu.style.setProperty('--menu-bg-image', `url("${menuBgUrl}")`);

    /** Hero logo — full "8 Balls Pool vs Brainrots" lockup over the menu hub. */
    const menuLogoUrl = manifestUrl(this.assetBaseUrl, AssetIds.uiMenuLogo);
    this.menu.style.setProperty('--menu-hero-logo-image', `url("${menuLogoUrl}")`);

    /** Secondary row — Leaderboard / Achievements (shop moved to main banner stack). */
    const btnLeaderboardUrl = manifestUrl(this.assetBaseUrl, AssetIds.uiButtonLeaderboards);
    const btnAchievementsUrl = manifestUrl(this.assetBaseUrl, AssetIds.uiButtonAchievements);
    this.menu.style.setProperty('--menu-circle-leaderboard-image', `url("${btnLeaderboardUrl}")`);
    this.menu.style.setProperty('--menu-circle-achievements-image', `url("${btnAchievementsUrl}")`);

    const btnPlayUrl = manifestUrl(this.assetBaseUrl, AssetIds.uiButtonPlayMain);
    this.menu.style.setProperty('--menu-play-image', `url("${btnPlayUrl}")`);

    const btnTournamentsUrl = manifestUrl(this.assetBaseUrl, AssetIds.uiButtonTournamentsMain);
    this.menu.style.setProperty('--menu-tournaments-image', `url("${btnTournamentsUrl}")`);

    const btnShopMainUrl = manifestUrl(this.assetBaseUrl, AssetIds.uiButtonShopMain);
    this.menu.style.setProperty('--menu-shop-main-image', `url("${btnShopMainUrl}")`);

    this.menu.style.setProperty('--menu-coin-icon-image', `url("${this.coinIconUrl}")`);

    this.aimIntroOverlay = el('div', 'hud-aim-intro-overlay');
    this.aimIntroOverlay.setAttribute('role', 'dialog');
    this.aimIntroOverlay.setAttribute('aria-modal', 'true');
    this.aimIntroOverlay.setAttribute('aria-hidden', 'true');
    this.aimIntroOverlay.innerHTML = `
      <div class="hud-aim-intro-backdrop" aria-hidden="true"></div>
      <div class="hud-aim-intro-panel">
        <div class="hud-aim-intro-top">
          <h2 class="hud-aim-intro-title" id="aim-intro-title"></h2>
          <p class="hud-aim-intro-body" id="aim-intro-body"></p>
        </div>
        <button type="button" class="hud-aim-intro-confirm interactive" id="aim-intro-confirm">Got it</button>
      </div>
    `;
    this.aimIntroTitle = this.aimIntroOverlay.querySelector('#aim-intro-title') as HTMLElement;
    this.aimIntroBody = this.aimIntroOverlay.querySelector('#aim-intro-body') as HTMLElement;
    this.aimIntroConfirm = this.aimIntroOverlay.querySelector('#aim-intro-confirm') as HTMLButtonElement;

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
      this.casualOverlay,
      this.matchIntro,
      this.spinPopupOverlay,
      this.hudNotice,
      this.ballInHandHintLabel,
      this.ballInHandConfirmBtn,
      this.nextModal,
      this.soundBtn,
      this.powerBarWrap,
      this.aimIntroOverlay,
    );
    this.soundMuted = this.opts?.isSoundMuted?.() ?? false;
    this.syncSoundButtonVisual();
    this.hudLayoutObserver = new ResizeObserver(() => this.applyHudTopBandFromLayout());
    this.hudLayoutObserver.observe(this.topStack);
    this.hideGame();
  }

  private playHudClickSound(): void {
    this.opts?.playUiClick?.();
  }

  bindHandlers(): void {
    this.aimIntroConfirm.addEventListener('click', () => {
      this.playHudClickSound();
      const eb = this.lastEightBall;
      if (eb?.eightBallIntro?.visible) {
        this.pushCommand({ type: 'tutorialEightIntro.dismiss' });
      } else {
        this.pushCommand({ type: 'aimIntro.dismiss' });
      }
    });
    this.ballInHandConfirmBtn.addEventListener('click', () => {
      this.playHudClickSound();
      this.pushCommand({ type: 'ballInHand.confirm' });
    });
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
      /** Match-end secondary action is now always "Back to Main Menu". */
      this.pushCommand({ type: 'tournament.exit' });
    });
    this.btnPlayAgain.addEventListener('click', () => {
      this.playHudClickSound();
      const h = this.getHud();
      const t = h.tournament;
      /** Casual end-screen → instant new casual match. */
      if (!t) {
        this.pushCommand({ type: 'tournament.exit' });
        this.pushCommand({ type: 'menu.startCasual' });
        return;
      }
      /** Tournament final (won/lost) → re-enter same tournament flow with fee/start page. */
      if (t.status === 'won' || t.status === 'lost') {
        const def = h.tournamentCatalog?.find((d) => d.id === t.defId);
        const coins = h.profile?.coins ?? 0;
        if (def && coins >= def.entryFeeCoins) {
          this.pushCommand({ type: 'tournament.exit' });
          this.pushCommand({ type: 'menu.startTournament', tournamentId: t.defId });
          this.showTournamentOverlay();
          return;
        }
        /** Not enough coins (or missing def) → fallback to tournament picker. */
        this.pushCommand({ type: 'tournament.exit' });
        this.showModeSelectOverlay('tournaments');
        return;
      }
      /** Mid-tournament screens are handled via Next Match flow; keep a safe fallback. */
      this.showTournamentOverlay();
    });
    this.btnShop.addEventListener('click', () => {
      this.playHudClickSound();
      this.showShopOverlay();
    });

    /**
     * Map pointer to a point inside the unit disk (continuous hit position).
     * Clicks outside the circle are projected onto the rim — matches aiming on a round cue ball.
     */
    const pushSpinFromPadElement = (padEl: HTMLElement, pe: PointerEvent): { nx: number; ny: number; len: number } => {
      const r = padEl.getBoundingClientRect();
      const cx = r.left + r.width * 0.5;
      const cy = r.top + r.height * 0.5;
      const radiusPx = Math.max(12, Math.min(r.width, r.height) * 0.46);
      let nx = (pe.clientX - cx) / radiusPx;
      let ny = (pe.clientY - cy) / radiusPx;
      const len = Math.hypot(nx, ny);
      if (len > 1) {
        nx /= len;
        ny /= len;
      }
      this.pushCommand({ type: 'spin.set', nx, ny });
      return { nx, ny, len: Math.min(1, len) };
    };

    this.spinOpenBtn.addEventListener('click', (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.spinOpenBtn.disabled) return;
      this.playHudClickSound();
      this.showSpinPopup();
    });

    this.spinPopupBackdrop.addEventListener('pointerdown', (e: PointerEvent) => {
      e.preventDefault();
      this.playHudClickSound();
      this.hideSpinPopup();
    });
    this.spinPopupPanel.addEventListener('pointerdown', (e: PointerEvent) => {
      e.stopPropagation();
    });

    this.spinPopupPad.addEventListener('pointerdown', (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const now = performance.now();
      const tap = pushSpinFromPadElement(this.spinPopupPad, e);
      if (
        tap.len <= 0.2 &&
        this.lastSpinPadTapLen <= 0.2 &&
        now - this.lastSpinPadTapMs <= 280
      ) {
        this.pushCommand({ type: 'spin.set', nx: 0, ny: 0 });
        this.syncSpinPopupResetVisibility();
      }
      this.lastSpinPadTapMs = now;
      this.lastSpinPadTapLen = tap.len;
      this.spinPopupDragId = e.pointerId;
      try {
        this.spinPopupPad.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    });
    this.spinPopupPad.addEventListener('pointermove', (e: PointerEvent) => {
      if (this.spinPopupDragId !== e.pointerId) return;
      pushSpinFromPadElement(this.spinPopupPad, e);
    });
    const finishSpinPopupDrag = (e: PointerEvent): void => {
      if (this.spinPopupDragId !== e.pointerId) return;
      this.spinPopupDragId = null;
      try {
        this.spinPopupPad.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };
    this.spinPopupPad.addEventListener('pointerup', finishSpinPopupDrag);
    this.spinPopupPad.addEventListener('pointercancel', finishSpinPopupDrag);

    this.spinPopupReset.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
      this.playHudClickSound();
      this.pushCommand({ type: 'spin.set', nx: 0, ny: 0 });
      this.syncSpinPopupResetVisibility();
    });
    this.spinPopupClose.addEventListener('click', (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.playHudClickSound();
      this.hideSpinPopup();
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
      if (btn.getAttribute('data-disabled') === 'true') return;
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
      this.showCasualShowcaseOverlay();
    });
    this.menuTournamentsBtn.addEventListener('click', () => {
      this.playHudClickSound();
      this.showModeSelectOverlay('tournaments');
    });

    /** Casual showcase: Start Game → fire the same `menu.startCasual` command
     *  the legacy mode-select casual CTA fires. Engine rolls the random
     *  opponent inside `beginCareer`, preserving the surprise. */
    this.casualStartBtn.addEventListener('click', () => {
      this.playHudClickSound();
      this.hideCasualShowcaseOverlay();
      this.pushCommand({ type: 'menu.startCasual' });
    });
    this.casualBackBtn.addEventListener('click', () => {
      this.playHudClickSound();
      this.hideCasualShowcaseOverlay();
    });
    /** Tapping the dim scrim (anything outside `.hud-casual-modal`) closes
     *  the showcase back to the main menu — matches mobile expectation. */
    this.casualOverlay.addEventListener('click', (e) => {
      if (!this.casualVisible) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('.hud-casual-modal')) return;
      this.playHudClickSound();
      this.hideCasualShowcaseOverlay();
    });
    /** Escape closes the showcase like every other dialog in this HUD. */
    window.addEventListener('keydown', (e) => {
      if (!this.casualVisible) return;
      if (e.key !== 'Escape') return;
      e.preventDefault();
      this.hideCasualShowcaseOverlay();
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
        this.showModeSelectOverlay('tournaments');
        return;
      }
      this.hideTournamentOverlay();
      this.pushCommand({ type: 'tournament.exit' });
    });

    this.bindPowerBarHandlers();
  }

  private showSpinPopup(): void {
    if (this.spinPopupVisible) return;
    this.spinPopupVisible = true;
    this.spinPopupOverlay.classList.add('show');
    this.spinPopupOverlay.setAttribute('aria-hidden', 'false');
    this.spinOpenBtn.setAttribute('aria-expanded', 'true');
    const h = this.getHud();
    const eb = h.eightBall;
    if (eb) {
      const lx = `${50 + eb.spinX * 46}%`;
      const ty = `${50 + eb.spinY * 46}%`;
      this.spinPopupDot.style.left = lx;
      this.spinPopupDot.style.top = ty;
      this.applySpinVisualFeedback(eb.spinX, eb.spinY);
    }
    this.syncSpinPopupResetVisibility();
  }

  private hideSpinPopup(): void {
    if (!this.spinPopupVisible) return;
    this.spinPopupVisible = false;
    this.spinPopupDragId = null;
    this.spinPopupOverlay.classList.remove('show');
    this.spinPopupOverlay.setAttribute('aria-hidden', 'true');
    this.spinOpenBtn.setAttribute('aria-expanded', 'false');
  }

  private syncSpinPopupResetVisibility(): void {
    const eb = this.getHud().eightBall;
    const sx = eb?.spinX ?? 0;
    const sy = eb?.spinY ?? 0;
    const centered = Math.hypot(sx, sy) < 0.035;
    this.spinPopupReset.style.display = centered ? 'none' : '';
  }

  private applySpinVisualFeedback(spinX: number, spinY: number): void {
    const sx = Math.max(-1, Math.min(1, spinX));
    const sy = Math.max(-1, Math.min(1, spinY));
    const len = Math.max(0, Math.min(1, Math.hypot(sx, sy)));
    const rot = ((performance.now() * (0.06 + len * 0.2)) % 360) + Math.atan2(sy, sx) * (180 / Math.PI);
    this.spinPopupBall.style.setProperty('--spin-rot', `${rot.toFixed(1)}deg`);
    this.spinPopupBall.style.setProperty('--spin-energy', len.toFixed(3));
    this.spinOpenBtn.style.setProperty('--spin-energy', len.toFixed(3));
    this.spinPopupReadout.textContent = `X ${sx >= 0 ? '+' : ''}${sx.toFixed(2)} | Y ${sy >= 0 ? '+' : ''}${sy.toFixed(2)}`;
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
      this.syncYourTurnIndicator(false);
      this.applyPowerBarVisibility(h);
      this.hideSpinPopup();
      return;
    }

    const phase = eb.phase;
    if (phase === 'MainMenu' || phase === 'MatchEnd') {
      this.aimIntroOverlay.classList.remove('show');
      this.aimIntroOverlay.setAttribute('aria-hidden', 'true');
    }
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
      this.hideSpinPopup();
      this.syncYourTurnIndicator(false);
      return;
    }

    this.stopConfetti();
    this.stopRingAudio();
    this.hideNextMatchModal();

    const inMatch = phase !== 'MainMenu';
    this.topStack.style.display = inMatch ? 'flex' : 'none';
    /** Üst-sol diyalog balonu kapalı — sadece metinli mini karakter satırları. */
    this.bubble.style.display = 'none';

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
      this.hideSpinPopup();
      this.syncYourTurnIndicator(false);
      return;
    }

    /** In active gameplay we always close overlays that can block the table. */
    this.hideShopOverlay();

    /**
     * Mode-select / bracket / casual-showcase overlays only make sense in
     * the menu/end-card phases — once an actual match is in progress we
     * force-hide them so the play table stays interactive.
     */
    this.hideTournamentOverlay();
    this.hideModeSelectOverlay();
    this.hideCasualShowcaseOverlay();

    const fullScreenShotTutorialOn =
      eb.aimIntro?.visible === true || eb.eightBallIntro?.visible === true;
    if (fullScreenShotTutorialOn) {
      this.hideSpinPopup();
    }
    this.aimIntroOverlay.classList.toggle('show', fullScreenShotTutorialOn);
    this.aimIntroOverlay.setAttribute('aria-hidden', fullScreenShotTutorialOn ? 'false' : 'true');
    const introCopy = eb.eightBallIntro?.visible ? eb.eightBallIntro : eb.aimIntro;
    if (introCopy) {
      this.aimIntroTitle.textContent = introCopy.title;
      this.aimIntroBody.textContent = introCopy.body;
      this.aimIntroConfirm.textContent = introCopy.confirmLabel;
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
    this.syncYourTurnIndicator(playerRingOn);

    this.topStack.querySelector('#pl-name')!.textContent = 'You';
    this.topStack.querySelector('#pl-lvl')!.textContent = levelLabel;
    if (this.menuLevel) this.menuLevel.textContent = levelLabel;
    if (this.endLevel) this.endLevel.textContent = levelLabel;

    this.topStack.querySelector('#opp-name')!.textContent = opp.name;
    this.topStack.querySelector('#opp-lvl')!.textContent = String(
      Math.min(99, eb.levelIndex + 3 + Math.floor(opp.accuracy * 40)),
    );

    const aiImg = this.topStack.querySelector('#ai-avatar-img') as HTMLImageElement;
    aiImg.src = opponentHudAvatarUrl(this.assetBaseUrl, opp.id);
    if (opp.id === 'tungo' || opp.id === 'torta_tartaruga' || opp.id === 'gattotto_otto') {
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
      bubbleText.textContent = '';
      this.bubble.classList.remove('show');
      this.bubble.style.display = 'none';
    }

    const dot = this.topStack.querySelector('#spin-dot') as HTMLElement;
    /** Dot travel radius inside the circular cue (% of ball diameter) */
    const lx = `${50 + eb.spinX * 46}%`;
    const ty = `${50 + eb.spinY * 46}%`;
    dot.style.left = lx;
    dot.style.top = ty;
    this.spinPopupDot.style.left = lx;
    this.spinPopupDot.style.top = ty;
    this.applySpinVisualFeedback(eb.spinX, eb.spinY);

    const canPickSpin =
      eb.phase === 'PlayerTurn' &&
      !h.cueBallInHandCursorHint &&
      eb.activePlayer === 'player' &&
      !eb.aimIntro?.visible &&
      !eb.eightBallIntro?.visible;
    this.spinOpenBtn.disabled = !canPickSpin;
    this.spinOpenBtn.style.opacity = canPickSpin ? '' : '0.5';
    if (this.spinPopupVisible && !canPickSpin) {
      this.hideSpinPopup();
    }
    if (this.spinPopupVisible) {
      this.syncSpinPopupResetVisibility();
    }

    if (this.statsVisibleFor) {
      this.renderStatsModal(this.statsVisibleFor, this.lastProfile, eb);
    }
    if (this.levelVisible) {
      this.renderLevelOverlay(this.lastProfile);
    }

    this.syncHudNotice(eb);
    this.syncBallInHandHint(h);

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
      !eb.opponentReaction &&
      !eb.aimIntro?.visible &&
      !eb.eightBallIntro?.visible;
    if (!show) {
      this.powerBarWrap.style.display = 'none';
      this.powerBarWrap.classList.remove('hint');
      this.tutorialPowerDrag.classList.remove('show');
      this.powerBarTrack.style.setProperty('--p', '0');
      this.powerBarTrack.style.setProperty('--heat', '0');
      return;
    }
    this.powerBarWrap.style.display = 'flex';
    this.powerBarWrap.classList.toggle(
      'hint',
      eb.powerBarHint === true || eb.tutorialShootHint === true,
    );
    const tutShow = eb.tutorialShootHint === true;
    this.tutorialPowerDrag.classList.toggle('show', tutShow);
    this.tutorialPowerDrag.setAttribute('aria-hidden', tutShow ? 'false' : 'true');
    if (!this.powerBarPointerDown) {
      const pull = Math.max(0, Math.min(1, eb.powerBarPull01 ?? 0));
      this.powerBarTrack.style.setProperty('--p', String(pull));
      this.powerBarTrack.style.setProperty('--heat', String(pull));
      const handle = this.powerBarTrack.querySelector('.hud-power-handle') as HTMLElement;
      handle?.setAttribute('aria-valuenow', String(Math.round(pull * 100)));
    }
  }

  private syncBallInHandHint(h: HudState): void {
    const show =
      h.cueBallInHandCursorHint === true &&
      h.eightBall?.phase === 'PlayerTurn' &&
      h.eightBall?.activePlayer === 'player';
    const showConfirm = show && h.cueBallInHandCanConfirm === true;
    this.ballInHandHintLabel.classList.toggle('show', show);
    this.ballInHandHintLabel.setAttribute('aria-hidden', show ? 'false' : 'true');
    this.ballInHandConfirmBtn.classList.toggle('show', showConfirm);
    this.ballInHandConfirmBtn.setAttribute('aria-hidden', showConfirm ? 'false' : 'true');
    this.ballInHandConfirmBtn.disabled = !showConfirm;
  }

  private renderStatsModal(
    kind: 'player' | 'opponent',
    profile: HudState['profile'] | null,
    eb: NonNullable<HudState['eightBall']>,
  ): void {
    const isPlayer = kind === 'player';
    this.statsTitle.textContent = isPlayer ? 'Your stats' : `${eb.opponentName} stats`;
    const entries: { label: string; valueHtml: string }[] = [];
    if (isPlayer && profile) {
      entries.push({
        label: 'Coins',
        valueHtml: `${formatNumber(profile.coins)}${this.coinIconImg('hud-inline-coin-icon hud-inline-coin-icon--stats', 16)}`,
      });
      entries.push({ label: 'Rank', valueHtml: escapeHtml(profile.rankName) });
      if (profile.nextRankName) {
        entries.push({
          label: 'Next rank',
          valueHtml: `${escapeHtml(profile.nextRankName)} (${escapeHtml(formatPercent(profile.rankProgress01))})`,
        });
      }
      entries.push({ label: 'Wins', valueHtml: escapeHtml(formatNumber(profile.wins)) });
      entries.push({ label: 'Losses', valueHtml: escapeHtml(formatNumber(profile.losses)) });
      entries.push({ label: 'Win rate', valueHtml: escapeHtml(formatPercent(profile.winRate)) });
      entries.push({
        label: 'Streak',
        valueHtml: escapeHtml(`${profile.currentStreak} (best ${profile.bestStreak})`),
      });
    } else {
      entries.push({ label: 'Coins', valueHtml: escapeHtml('—') });
      entries.push({ label: 'Rank', valueHtml: escapeHtml(eb.opponentTier) });
      entries.push({
        label: 'Accuracy',
        valueHtml: escapeHtml(`${Math.round(eb.opponentAccuracy * 100)}%`),
      });
      entries.push({ label: 'Name', valueHtml: escapeHtml(eb.opponentName) });
    }
    this.statsList.innerHTML = entries
      .map(
        (e) => `
        <div class="hud-stats-row">
          <span class="hud-stats-label">${escapeHtml(e.label)}</span>
          <span class="hud-stats-value hud-stats-value--inline">${e.valueHtml}</span>
        </div>`,
      )
      .join('');
  }

  private renderLevelOverlay(profile: HudState['profile'] | null): void {
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
  }

  private showLevelOverlay(): void {
    this.levelVisible = true;
    this.renderLevelOverlay(this.lastProfile);
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
    this.shopCoins.innerHTML = `${formatNumber(coins)}${this.coinIconImg('hud-inline-coin-icon hud-inline-coin-icon--shop-bar', 22)}`;
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
        let actionInnerHtml = '';
        let actionData = '';
        let actionDisabled = false;
        let ctaClasses = 'btn shop-cta';
        if (isOwned) {
          if (isEquipped) {
            actionLabel = 'Equipped';
            actionInnerHtml = escapeHtml(actionLabel);
            ctaClasses += ' ghost shop-cta--equipped-state';
            actionDisabled = true;
          } else {
            actionLabel = 'Equip';
            actionInnerHtml = escapeHtml(actionLabel);
            ctaClasses += ' primary shop-cta--equip';
            actionData = `data-equip="${item.id}"`;
          }
        } else {
          if (item.price <= 0) {
            actionLabel = 'Buy — Free';
            actionInnerHtml = escapeHtml(actionLabel);
          } else {
            actionLabel = `Buy — ${formatNumber(item.price)}`;
            actionInnerHtml = `${escapeHtml(`Buy — ${formatNumber(item.price)}`)}${this.coinIconImg('hud-inline-coin-icon hud-inline-coin-icon--shop-cta', 18)}`;
          }
          ctaClasses += canBuy ? ' primary shop-cta--buy' : ' ghost shop-cta--buy shop-cta--buy-off';
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
        const rarityClass = shopCueRarityClass(item.id);
        const cueArtUrl = shopCueShowcaseImageUrl(this.assetBaseUrl, item.id);
        const showcaseInner = cueArtUrl
          ? `<img class="shop-card-cue-img" src="${escapeHtml(cueArtUrl)}" alt="" decoding="async" draggable="false" />`
          : `<div class="shop-card-cue shop-card-cue--procedural" aria-hidden="true">
            <span class="shop-card-cue-tip"></span>
            <span class="shop-card-cue-ferrule"></span>
            <span class="shop-card-cue-shaft"></span>
            <span class="shop-card-cue-accent"></span>
            <span class="shop-card-cue-butt"></span>
            <span class="shop-card-cue-cap"></span>
          </div>`;
        return `
        <div class="shop-card ${rarityClass}${isEquipped ? ' shop-card--equipped' : ''}" data-cue="${item.id}" aria-label="${escapeHtml(item.name)}" ${cardStyle}>
          <div class="shop-card-glow" aria-hidden="true"></div>
          <div class="shop-card-frame" aria-hidden="true"></div>
          <div class="shop-card-inner">
            <div class="shop-card-head">
              <div class="shop-card-name">${escapeHtml(item.name)}</div>
            </div>
            <div class="shop-card-visual-block">
              <div class="shop-card-showcase">${showcaseInner}</div>
              <div class="shop-card-actions">
                <button type="button" class="${ctaClasses}" ${actionData} ${actionDisabled ? 'data-disabled="true"' : ''}>${actionInnerHtml}</button>
              </div>
            </div>
          </div>
        </div>`;
      })
      .join('');
  }

  /** Premium capsule above the player avatar when it is the player's shot. */
  private syncYourTurnIndicator(active: boolean): void {
    const el = this.topStack.querySelector('#hud-your-turn-indicator') as HTMLElement | null;
    if (!el) return;
    if (active) {
      el.removeAttribute('hidden');
      el.dataset.active = 'true';
      el.setAttribute('aria-hidden', 'false');
    } else {
      el.setAttribute('hidden', '');
      el.dataset.active = 'false';
      el.setAttribute('aria-hidden', 'true');
    }
  }

  /** Quick staggered "I'm a button" pop on menu actions when the hub opens. */
  private playMenuButtonAttention(): void {
    const targets: (HTMLElement | null)[] = [
      this.menuPlayBtn,
      this.menuTournamentsBtn,
      this.menuShopBtn,
      this.menuLeaderboardBtn.querySelector('.menu-circle-icon'),
      this.menuAchievementsBtn.querySelector('.menu-circle-icon'),
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
  }

  private renderLeaderboardOverlay(h: HudState): void {
    const profile = h.profile;
    if (!profile) {
      this.leaderboardList.innerHTML = '';
      return;
    }
    const entries = getLeaderboard('You', profile.xp, this.storage ?? undefined);
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
        const iconBlock =
          r.def.iconKind === 'coin'
            ? `<div class="ach-icon ach-icon-coin" aria-hidden="true"><img class="ach-icon-coin-img" src="${escapeHtml(this.coinIconUrl)}" alt="" width="26" height="26" decoding="async" draggable="false" /></div>`
            : `<div class="ach-icon ach-icon-${escapeHtml(r.def.iconKind)}" aria-hidden="true"><span class="ach-icon-glyph"></span></div>`;
        return `
          <div class="${cls}">
            ${iconBlock}
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

  /** Inline stack-of-cash art (`ui/money.png`) for labels that previously used the coin emoji. */
  private coinIconImg(className: string, size: number): string {
    return `<img class="${className}" src="${escapeHtml(this.coinIconUrl)}" alt="" width="${size}" height="${size}" decoding="async" draggable="false" />`;
  }

  private syncModeSelectMenuBackdrop(): void {
    const page = this.modeSelectOverlay.querySelector('.hud-modeselect-page') as HTMLElement | null;
    if (!page) return;
    const v = this.menu.style.getPropertyValue('--menu-bg-image').trim();
    if (v) page.style.setProperty('--menu-bg-image', v);
    else page.style.removeProperty('--menu-bg-image');
  }

  private showModeSelectOverlay(filter: 'casual' | 'tournaments'): void {
    this.modeSelectFilter = filter;
    this.modeSelectVisible = true;
    this.modeSelectLastRenderKey = null;
    this.modeSelectTitleEl.textContent = filter === 'casual' ? 'Casual' : 'Tournaments';
    this.renderModeSelectPage(this.getHud());
    this.syncModeSelectMenuBackdrop();
    this.modeSelectOverlay.classList.add('show');
    /** Reset to the first visible card on each open. */
    requestAnimationFrame(() => {
      this.modeSelectTrack.scrollLeft = 0;
      this.modeSelectActiveIdx = 0;
      this.updateModeSelectDots();
    });
  }

  private hideModeSelectOverlay(): void {
    this.modeSelectVisible = false;
    (this.modeSelectOverlay.querySelector('.hud-modeselect-page') as HTMLElement | null)?.style.removeProperty(
      '--menu-bg-image',
    );
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
         * Presentation-only microtask guard; does not affect authoritative gameplay state.
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
    /** Browser HUD presentation timer only; gameplay truth remains in GameEngine/HudState. */
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
    /** Browser HUD presentation timer only; does not drive game rules or simulation. */
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
    const filter = this.modeSelectFilter;
    /**
     * Render key includes everything that affects card content (coin balance
     * for affordability, plus the catalog identity). When unchanged, skip the
     * innerHTML rewrite so the button DOM stays stable across frames — this
     * is what keeps click events alive between pointerdown and pointerup.
     */
    const key = `${filter}|${coins}|${catalog.map((d) => d.id).join(',')}`;
    if (key === this.modeSelectLastRenderKey) return;
    this.modeSelectLastRenderKey = key;

    const cards: string[] = [];
    if (filter === 'casual') {
      cards.push(this.renderCasualCard(coins));
    } else {
      for (const def of catalog) cards.push(this.renderTournamentCard(def, coins));
      if (cards.length === 0) {
        cards.push(`
      <article class="modeselect-card modeselect-card-empty" role="listitem">
        <div class="modeselect-card-body modeselect-card-body-empty">
          <p class="modeselect-empty-msg">No tournaments available.</p>
        </div>
      </article>`);
      }
    }
    this.modeSelectTrack.innerHTML = cards.join('');
    const total = cards.length;
    this.modeSelectDots.style.display = total > 1 ? '' : 'none';
    let dotsHtml = '';
    for (let i = 0; i < total; i++) {
      dotsHtml += `<span class="modeselect-dot" data-active="${i === 0 ? 'true' : 'false'}"></span>`;
    }
    this.modeSelectDots.innerHTML = dotsHtml;
  }

  private modeSelectHeroPortraitUrl(catalogId: 'casual' | string): string {
    if (catalogId === 'casual') {
      return resolveBrowserAssetUrl(this.assetBaseUrl, AssetManifest['ui.avatar.player'].browserUrl);
    }
    const oppByTier: Readonly<Record<string, string>> = {
      rookie: 'tungo',
      pro: 'torta_tartaruga',
      elite: 'gattotto_otto',
      grandslam: 'balleeina',
    };
    return opponentHudAvatarUrl(this.assetBaseUrl, oppByTier[catalogId] ?? 'tungo');
  }

  /** Mode-select trophy art — see `AssetManifest` `ui.modeselect.cup.*`. */
  private modeSelectTournamentCupUrl(defId: string): string {
    const k = TOURNAMENT_MODE_CUP_MANIFEST[defId];
    if (k) {
      const e = AssetManifest[k];
      if (e) return resolveBrowserAssetUrl(this.assetBaseUrl, e.browserUrl);
    }
    return this.modeSelectHeroPortraitUrl(defId);
  }

  private renderCasualCard(_coins: number): string {
    void _coins;
    const heroUrl = escapeHtml(this.modeSelectHeroPortraitUrl('casual'));
    return `
      <article class="modeselect-card modeselect-card-casual" data-card-idx="0" role="listitem">
        <div class="modeselect-card-body">
          <header class="modeselect-card-head">
            <div class="modeselect-head-main">
              <div class="modeselect-name">Casual</div>
              <div class="modeselect-tagline">Quick career match</div>
            </div>
            <div class="modeselect-tier-badge modeselect-tier-badge--capsule">CASUAL</div>
          </header>
          <div class="modeselect-blurb">A single match against your current career opponent. Win to climb the ladder.</div>
          <div class="modeselect-stat-grid" data-cols="1">
            <div class="modeselect-stat">
              <span class="modeselect-stat-label">MATCHES</span>
              <span class="modeselect-stat-value"><span class="modeselect-stat-num">1</span></span>
            </div>
          </div>
          <div class="modeselect-prize">
            <div class="modeselect-prize-label">Casual payouts</div>
            <div class="modeselect-prize-line">
              <span class="modeselect-prize-num">+${formatNumber(COIN_REWARD_WIN)}</span>
              <span class="modeselect-prize-unit">coins</span>
              <span class="modeselect-prize-sep" aria-hidden="true">·</span>
              <span class="modeselect-prize-num">+${formatNumber(COIN_REWARD_LOSS)}</span>
              <span class="modeselect-prize-unit">if you lose</span>
            </div>
            <div class="modeselect-prize-line modeselect-prize-line--secondary">
              <span class="modeselect-prize-num">+${formatNumber(XP_REWARD_WIN)}</span>
              <span class="modeselect-prize-unit">XP win</span>
              <span class="modeselect-prize-sep" aria-hidden="true">·</span>
              <span class="modeselect-prize-num">+${formatNumber(XP_REWARD_LOSS)}</span>
              <span class="modeselect-prize-unit">XP loss</span>
            </div>
            <div class="modeselect-prize-sub">+${formatNumber(XP_REWARD_PER_BALL_POTTED)} XP per ball you pocket · tournaments pay only the champion bonus</div>
          </div>
          <div class="modeselect-fee-row">
            <div class="modeselect-fee modeselect-fee-free modeselect-fee--wide">FREE TO PLAY</div>
          </div>
          <div class="modeselect-hero" aria-hidden="true">
            <div class="modeselect-hero-bloom" aria-hidden="true"></div>
            <div class="modeselect-hero-rim" aria-hidden="true"></div>
            <img class="modeselect-hero-img" src="${heroUrl}" alt="" decoding="async" />
          </div>
          <button class="btn primary modeselect-cta" type="button" data-mode-action="casual">Play</button>
        </div>
      </article>
    `;
  }

  private renderTournamentCard(
    def: NonNullable<HudState['tournamentCatalog']>[number],
    coins: number,
  ): string {
    const canAfford = coins >= def.entryFeeCoins;
    const tierLabel = TIER_LABELS[def.id] ?? `${def.id.toUpperCase()} TIER`;
    const ctaText = canAfford ? `Enter — ${formatNumber(def.entryFeeCoins)}` : `Need ${formatNumber(def.entryFeeCoins)}`;
    const ctaHtml = `${escapeHtml(ctaText)}${this.coinIconImg('hud-inline-coin-icon hud-inline-coin-icon--modeselect-cta', 20)}`;
    const ctaDisabled = canAfford ? '' : 'data-disabled="true"';
    const heroUrl = escapeHtml(this.modeSelectTournamentCupUrl(def.id));
    return `
      <article class="modeselect-card modeselect-card-${escapeHtml(def.accent)}" data-card-tournament-id="${escapeHtml(def.id)}" role="listitem">
        <div class="modeselect-card-body">
          <header class="modeselect-card-head">
            <div class="modeselect-head-main">
              <div class="modeselect-name">${escapeHtml(def.name)}</div>
              <div class="modeselect-tagline">${escapeHtml(def.tagline)}</div>
            </div>
            <div class="modeselect-tier-badge modeselect-tier-badge--capsule">${escapeHtml(tierLabel)}</div>
          </header>
          <div class="modeselect-blurb">${escapeHtml(def.blurb)}</div>
          <div class="modeselect-stat-grid" data-cols="2">
            <div class="modeselect-stat">
              <span class="modeselect-stat-label">MATCHES</span>
              <span class="modeselect-stat-value"><span class="modeselect-stat-num">${def.matchCount}</span></span>
            </div>
            <div class="modeselect-stat">
              <span class="modeselect-stat-label">DIFFICULTY</span>
              <span class="modeselect-stat-value modeselect-stat-value--dots">${renderDifficultyDots(def.difficulty)}</span>
            </div>
          </div>
          <div class="modeselect-prize">
            <div class="modeselect-prize-label">Champion payout (final win)</div>
            <div class="modeselect-prize-line">
              <span class="modeselect-prize-num">+${formatNumber(def.championBonusCoins)}</span>
              <span class="modeselect-prize-unit">coins</span>
            </div>
            <div class="modeselect-prize-line modeselect-prize-line--secondary">
              <span class="modeselect-prize-num">+${formatNumber(def.championBonusXp)}</span>
              <span class="modeselect-prize-unit">XP</span>
            </div>
            <div class="modeselect-prize-sub">No coins or XP for mid-bracket wins · Net coins if you win all: +${formatNumber(Math.max(0, def.championBonusCoins - def.entryFeeCoins))}</div>
          </div>
          <div class="modeselect-hero modeselect-hero--trophy" aria-hidden="true">
            <div class="modeselect-hero-bloom" aria-hidden="true"></div>
            <div class="modeselect-hero-rim" aria-hidden="true"></div>
            <img class="modeselect-hero-img" src="${heroUrl}" alt="" decoding="async" />
          </div>
          <button class="btn ${canAfford ? 'primary' : 'ghost'} modeselect-cta" type="button"
            data-mode-action="tournament:${escapeHtml(def.id)}" ${ctaDisabled}>
            ${ctaHtml}
          </button>
        </div>
      </article>
    `;
  }

  private renderTournamentOverlay(h: HudState): void {
    const t = h.tournament;
    if (!t) {
      this.tournamentSlots.innerHTML = '';
      this.tournamentStartBtn.style.display = 'none';
      this.tournamentStartBtn.removeAttribute('aria-describedby');
      this.tournamentEntryFeeEl.hidden = true;
      this.tournamentEntryFeeEl.removeAttribute('aria-label');
      this.tournamentEntryFeeNumEl.textContent = '';
      this.tournamentChampionPrizeEl.textContent = '';
      this.tournamentChampionPrizeEl.hidden = true;
      this.tournamentOverlay.setAttribute('data-accent', 'pro');
      this.tournamentTitleRow.setAttribute('aria-label', 'Tournament Bracket');
      this.tournamentCupImg.alt = '';
      this.tournamentCupImg.classList.add('hud-tournament-cup--hidden');
      this.tournamentCupImg.removeAttribute('src');
      return;
    }
    const stillRunning = t.status === 'active' && t.currentRound < t.size;
    const defName = t.defName ?? 'Tournament';
    /** Sync accent class so the bracket modal matches the chosen tournament colour. */
    this.tournamentOverlay.setAttribute('data-accent', t.defAccent ?? 'pro');
    const cupUrl = tournamentBracketCupUrl(this.assetBaseUrl, t.defId);
    if (cupUrl) {
      this.tournamentCupImg.src = cupUrl;
      this.tournamentCupImg.classList.remove('hud-tournament-cup--hidden');
    } else {
      this.tournamentCupImg.removeAttribute('src');
      this.tournamentCupImg.classList.add('hud-tournament-cup--hidden');
    }
    const bracketLabel =
      t.status === 'won'
        ? `${defName} — Champion`
        : t.status === 'lost'
          ? `${defName} — Ended`
          : defName;
    this.tournamentTitleRow.setAttribute('aria-label', bracketLabel);
    this.tournamentCupImg.alt = bracketLabel;
    this.tournamentStartBtn.style.display = stillRunning ? 'block' : 'none';
    const startCta = `Start Match ${t.currentRound + 1}`;
    this.tournamentStartLabel.textContent = startCta;
    this.tournamentStartBtn.setAttribute('aria-label', startCta);
    /** Entry fee is charged once at run start; only show it under the CTA for Match 1. */
    const showEntryFeeUnderStart = stillRunning && t.currentRound === 0;
    if (showEntryFeeUnderStart) {
      this.tournamentEntryFeeEl.hidden = false;
      this.tournamentEntryFeeNumEl.textContent = formatNumber(t.entryFeeCoins);
      this.tournamentEntryFeeEl.setAttribute(
        'aria-label',
        `Entry fee ${formatNumber(t.entryFeeCoins)} coins`,
      );
      this.tournamentStartBtn.setAttribute('aria-describedby', 'hud-tournament-entry-fee');
    } else {
      this.tournamentEntryFeeEl.hidden = true;
      this.tournamentEntryFeeEl.removeAttribute('aria-label');
      this.tournamentEntryFeeNumEl.textContent = '';
      this.tournamentStartBtn.removeAttribute('aria-describedby');
    }
    const untouchedRun =
      t.status === 'active' &&
      t.currentRound === 0 &&
      t.record.every((r) => r === 'pending');
    const exitLabel = this.tournamentExitBtn.querySelector('.modeselect-back-label') as HTMLElement | null;
    const exitText = untouchedRun ? 'Back' : stillRunning ? 'Back' : 'Close';
    if (exitLabel) exitLabel.textContent = exitText;
    else this.tournamentExitBtn.textContent = exitText;

    const urlTournamentUpNext = manifestUrl(this.assetBaseUrl, AssetIds.uiTournamentUpNext);
    const urlTournamentLocked = manifestUrl(this.assetBaseUrl, AssetIds.uiTournamentLocked);

    this.tournamentSlots.innerHTML = t.opponents
      .map((opp, i) => {
        const result = t.record[i] ?? 'pending';
        const isCurrent = stillRunning && i === t.currentRound;
        const status = isCurrent ? 'current' : result;
        const avatarUrl = status === 'won'
          ? tournamentSlotReactionUrl(this.assetBaseUrl, opp.id, 'cry')
          : opponentHudAvatarUrl(this.assetBaseUrl, opp.id);
        const pillIsBadge = status === 'current' || status === 'pending';
        const pillInner =
          status === 'current'
            ? `<img class="tournament-slot-pill-img" src="${urlTournamentUpNext}" alt="Up next" decoding="async" />`
            : status === 'pending'
              ? `<img class="tournament-slot-pill-img" src="${urlTournamentLocked}" alt="Locked" decoding="async" />`
              : status === 'won'
                ? 'Won'
                : 'Lost';
        const pillClass = pillIsBadge
          ? `tournament-slot-pill tournament-slot-pill--badge tournament-pill-${status}`
          : `tournament-slot-pill tournament-pill-${status}`;
        const pillWrapClass =
          pillIsBadge && status === 'current'
            ? 'tournament-slot-pill-outer tournament-slot-pill-outer--current'
            : pillIsBadge
              ? 'tournament-slot-pill-outer tournament-slot-pill-outer--pending'
              : 'tournament-slot-pill-outer tournament-slot-pill-outer--text';
        return `
          <div class="tournament-slot tournament-slot-${status}">
            <div class="tournament-slot-main">
              <div class="tournament-slot-avatar-frame" aria-hidden="true">
                <span class="tournament-slot-avatar-ring" aria-hidden="true"></span>
                <img class="tournament-slot-avatar-img" src="${avatarUrl}" alt="" decoding="async" />
              </div>
              <div class="tournament-slot-titles">
                <div class="tournament-slot-match-line">Match ${i + 1}</div>
                <div class="tournament-slot-name">${escapeHtml(opp.name)}</div>
                <div class="tournament-slot-tier-badge">${escapeHtml(opp.tier.toUpperCase())}</div>
              </div>
            </div>
            <div class="${pillWrapClass}">
              <div class="${pillClass}">${pillInner}</div>
            </div>
          </div>`;
      })
      .join('');
    const netCoins = Math.max(0, (t.championBonusCoins ?? 0) - (t.entryFeeCoins ?? 0));
    this.tournamentChampionPrizeEl.hidden = false;
    if (t.status === 'won') {
      this.tournamentChampionPrizeEl.textContent = `Champion bonus earned: +${formatNumber(t.championBonusCoins)} coins and +${formatNumber(t.championBonusXp)} XP (no per-round payouts).`;
    } else if (t.status === 'lost') {
      this.tournamentChampionPrizeEl.textContent = `Champion reward was +${formatNumber(t.championBonusCoins)} coins and +${formatNumber(t.championBonusXp)} XP. Mid-round wins pay no coins or XP.`;
    } else {
      this.tournamentChampionPrizeEl.textContent = `Win the final match for +${formatNumber(t.championBonusCoins)} coins and +${formatNumber(t.championBonusXp)} XP. Earlier wins pay nothing. Net if you sweep: +${formatNumber(netCoins)} coins after your entry fee.`;
    }
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

  private showCasualShowcaseOverlay(): void {
    /**
     * Only meaningful from the main menu hub; bail out gracefully if some
     * other phase (match in progress, end card, tutorial) accidentally
     * triggers this — we never want it to layer over gameplay.
     */
    const phase = this.getHud().eightBall?.phase;
    if (phase !== 'MainMenu') return;
    this.casualVisible = true;
    this.casualOverlay.classList.add('show');
    /** Move keyboard focus to the primary CTA so Enter/Space immediately
     *  starts the match (mirrors tournament Start UX). */
    requestAnimationFrame(() => {
      try {
        this.casualStartBtn.focus({ preventScroll: true });
      } catch {
        /* ignore focus errors in older browsers */
      }
    });
  }

  private hideCasualShowcaseOverlay(): void {
    this.casualVisible = false;
    this.casualOverlay.classList.remove('show');
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
    const colors = ['#ffd76a', '#ffaa22', '#ffe8b0', '#f4c430', '#ff8c42', '#e8c866', '#c9a227', '#fff2c8'];
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
    /** Browser-only visual timeout for confetti lifecycle; gameplay already resolved before this. */
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
    const wrapL = chipsL.closest('.hud-pot-below-name') as HTMLElement | null;
    const wrapR = chipsR.closest('.hud-pot-below-name') as HTMLElement | null;
    const groupLabel = this.topStack.querySelector('#pot-player-group-label') as HTMLElement | null;
    const groupLabelOpp = this.topStack.querySelector('#pot-opponent-group-label') as HTMLElement | null;

    const setPlayerGroupLabel = (text: string): void => {
      if (!groupLabel) return;
      groupLabel.textContent = text;
      groupLabel.style.display = text ? '' : 'none';
    };
    const setOpponentGroupLabel = (text: string): void => {
      if (!groupLabelOpp) return;
      groupLabelOpp.textContent = text;
      groupLabelOpp.style.display = text ? '' : 'none';
    };

    if (!ctx.showPotProgressStrip) {
      chipsL.innerHTML = '';
      chipsR.innerHTML = '';
      setPlayerGroupLabel('');
      setOpponentGroupLabel('');
      if (wrapL) wrapL.style.display = 'none';
      if (wrapR) wrapR.style.display = 'none';
      return;
    }

    if (wrapL) wrapL.style.removeProperty('display');
    if (wrapR) wrapR.style.removeProperty('display');

    if (pot.kind === 'open') {
      chipsL.innerHTML = stripUnknown(this.assetBaseUrl);
      chipsR.innerHTML = stripUnknown(this.assetBaseUrl);
      setPlayerGroupLabel('');
      setOpponentGroupLabel('');
      return;
    }

    const pg = ctx.playerGroup;
    const ag = ctx.aiGroup;
    if (pg && ag) {
      const playerOrder = pg === 'solid' ? SOLID_NUMBERS : STRIPE_NUMBERS;
      const aiOrder = ag === 'solid' ? SOLID_NUMBERS : STRIPE_NUMBERS;
      chipsL.innerHTML = stripOrdered(aiOrder, pot.ai, this.assetBaseUrl);
      chipsR.innerHTML = stripOrdered(playerOrder, pot.player, this.assetBaseUrl);
      setPlayerGroupLabel(pg === 'solid' ? 'SOLIDS' : 'STRIPES');
      setOpponentGroupLabel(ag === 'solid' ? 'SOLIDS' : 'STRIPES');
    } else {
      chipsL.innerHTML = stripUnknown(this.assetBaseUrl);
      chipsR.innerHTML = stripUnknown(this.assetBaseUrl);
      setPlayerGroupLabel('');
      setOpponentGroupLabel('');
    }
  }

  private syncEndOverlay(won: boolean, reason: string, h: HudState): void {
    const sub = this.end.querySelector('#end-sub')!;
    const t = h.tournament;
    const eb = h.eightBall;
    const isTournamentChamp = won && t?.status === 'won';
    const isTournamentMidWin = won && t?.status === 'active';
    const isTournamentLoss = !won && t?.status === 'lost';
    const isTournamentFinal = t?.status === 'won' || t?.status === 'lost';
    const isFirstTutorialEnd = (eb?.tutorialActive ?? false) && !t;
    /** Play Again: casual veya turnuva run bitti (şampiyonluk / elendi); ara tur galibiyetinde yok. */
    const showPlayAgain = !isFirstTutorialEnd && (!t || isTournamentFinal);

    if (won) {
      this.endTitleImg.src = this.urlEndYouWon;
      this.endTitleImg.alt = isTournamentChamp ? 'Tournament champion' : 'You won';
    } else {
      this.endTitleImg.src = this.urlEndYouLose;
      this.endTitleImg.alt = isTournamentLoss ? 'Eliminated' : 'You lost';
    }

    /** Mode win badge: sadece casual veya turnuva şampiyonluğu; ara tur galibiyetinde "You" metni. */
    if (won) {
      this.endPlayerName.classList.remove('end-player-name--loss-opponent');
      const showWinModeBadge = !t || isTournamentChamp;
      if (showWinModeBadge) {
        this.endPlayerName.classList.add('end-player-name--win-badge');
        this.endModeWinBadge.src = endCardModeWinBadgeUrl(this.assetBaseUrl, t?.defId);
        this.endModeWinBadge.alt = t?.defName ? `${t.defName} win` : 'Casual win';
      } else {
        this.endPlayerName.classList.remove('end-player-name--win-badge');
        this.endModeWinBadge.removeAttribute('src');
        this.endModeWinBadge.alt = '';
        this.endPlayerNameText.textContent = 'You';
      }
      this.endLossOpponentPortrait.removeAttribute('src');
      this.endLossOpponentPortrait.alt = '';
    } else {
      this.endPlayerName.classList.remove('end-player-name--win-badge');
      this.endPlayerName.classList.add('end-player-name--loss-opponent');
      this.endModeWinBadge.removeAttribute('src');
      this.endModeWinBadge.alt = '';
      const oppId = eb?.opponentId ?? 'tungo';
      const oppName = eb?.opponentName ?? 'Opponent';
      this.endLossOpponentPortrait.src = opponentSmileReactionUrl(this.assetBaseUrl, oppId);
      this.endLossOpponentPortrait.alt = `${oppName} smiling`;
    }
    this.endTitleWrap.classList.toggle('end-title-wrap--win', won);
    this.endTitleWrap.classList.toggle('end-title-wrap--champion', isTournamentChamp);

    if (isTournamentChamp) {
      const bonusCoin = t?.championBonusCoins ?? 0;
      const bonusXp = t?.championBonusXp ?? 0;
      sub.textContent = `Champion bonus +${formatNumber(bonusCoin)} coins · +${formatNumber(bonusXp)} XP`;
    } else if (isTournamentMidWin && t) {
      sub.textContent = `Match ${t.currentRound} of ${t.size} cleared — ${reason}`;
    } else if (isTournamentLoss && t) {
      const matchNo = Math.min(t.currentRound + 1, t.size);
      sub.textContent = `Eliminated in match ${matchNo} — ${reason}`;
    } else {
      sub.textContent = reason;
    }

    const nextLabel = this.btnNext.querySelector('.btn-next-label') as HTMLElement | null;
    if (isTournamentChamp) {
      if (nextLabel) nextLabel.textContent = 'Back to Menu';
      this.btnNext.setAttribute('aria-label', 'Back to menu');
      this.btnNext.setAttribute('title', 'Back to Menu');
      this.btnNext.setAttribute('data-home-icon', 'true');
      this.btnNext.classList.remove('btn-next--play-asset');
      this.btnNext.style.removeProperty('--end-play-cta-url');
    } else if (isTournamentMidWin && t) {
      const text = `Next Match (${Math.min(t.currentRound + 1, t.size)}/${t.size})`;
      if (nextLabel) nextLabel.textContent = text;
      this.btnNext.setAttribute('aria-label', text);
      this.btnNext.setAttribute('title', text);
      this.btnNext.setAttribute('data-home-icon', 'false');
      this.btnNext.classList.add('btn-next--play-asset');
      this.btnNext.style.setProperty('--end-play-cta-url', `url("${this.urlEndNextGame}")`);
    } else {
      const text = 'Return to Home';
      if (nextLabel) nextLabel.textContent = text;
      this.btnNext.setAttribute('aria-label', text);
      this.btnNext.setAttribute('title', text);
      this.btnNext.setAttribute('data-home-icon', 'true');
      this.btnNext.classList.remove('btn-next--play-asset');
      this.btnNext.style.removeProperty('--end-play-cta-url');
    }
    const nextIconOnly = this.btnNext.getAttribute('data-home-icon') === 'true';
    this.btnNext.classList.toggle('primary', !nextIconOnly);
    this.btnNext.classList.toggle('ghost', nextIconOnly);
    this.btnNext.classList.toggle(
      'btn-next--play-asset',
      won && !nextIconOnly,
    );
    const endActions = this.end.querySelector('.end-actions') as HTMLElement | null;
    endActions?.classList.toggle('end-actions--with-play-again', showPlayAgain);
    this.btnPlayAgain.style.display = showPlayAgain ? 'inline-block' : 'none';
    /** Shop + Next / Home — Play Again ekstra; Next’i asla gizleme (turnuva ara tur vb.). */
    this.btnNext.style.display = won ? 'inline-flex' : 'none';
    this.btnRematch.style.display = won ? 'none' : 'inline-flex';
    const coinIconEnd = this.coinIconImg('hud-inline-coin-icon hud-inline-coin-icon--end-screen', 18);
    if (!isTournamentChamp) {
      if (won && isTournamentMidWin) {
        this.endRewardLabel.textContent = 'Coins & XP';
        this.endReward.textContent = 'Paid when you win the final';
      } else if (won && !t) {
        this.endRewardLabel.textContent = 'Match reward';
        const rw = h.coinRewardWin ?? 0;
        this.endReward.innerHTML = `+${formatNumber(rw)}${coinIconEnd}`;
      } else if (!won && !t) {
        this.endRewardLabel.textContent = 'Consolation';
        const rl = h.coinRewardLoss ?? 0;
        this.endReward.innerHTML = `+${formatNumber(rl)}${coinIconEnd}`;
      } else if (!won && t) {
        this.endRewardLabel.textContent = 'Coin payout';
        this.endReward.textContent = '—';
      } else {
        this.endRewardLabel.textContent = 'Reward';
        this.endReward.textContent = '—';
      }
    }
    const coins = h.profile?.coins ?? 0;
    this.endBalance.innerHTML = `${formatNumber(coins)}${this.coinIconImg('hud-inline-coin-icon hud-inline-coin-icon--end-screen', 18)}`;

    /**
     * Champion celebration: earned chip (coin + XP) + totals. Synthetic trophy
     * row stays off — tier cup art is only `end-mode-win-badge` (`Win_*.png`).
     */
    this.endChampion.setAttribute('data-active', 'false');
    this.endChampion.setAttribute('aria-hidden', 'true');
    this.endChampionPrize.setAttribute('data-active', isTournamentChamp ? 'true' : 'false');
    this.endChampionPrize.setAttribute('aria-hidden', isTournamentChamp ? 'false' : 'true');
    /** Champions get a hero treatment — hide the standard reward/balance rows. */
    const endCoins = this.end.querySelector('.end-coins') as HTMLElement | null;
    if (endCoins) endCoins.style.display = isTournamentChamp ? 'none' : '';
    if (isTournamentChamp && t) {
      const accent = t.defAccent ?? 'pro';
      this.end.setAttribute('data-champion-accent', accent);
      this.endChampionPrize.setAttribute('data-accent', accent);

      const earnedCoins = t.championBonusCoins ?? 0;
      const earnedXp = t.championBonusXp ?? 0;
      this.championEarnedCoin.innerHTML = `<span class="prize-earned-coin-amount">+${formatNumber(earnedCoins)}</span>${this.coinIconImg('hud-inline-coin-icon hud-inline-coin-icon--prize', 34)}`;
      this.championEarnedXp.textContent = `+${formatNumber(earnedXp)} XP`;

      const profile = h.profile;
      const totalCoins = profile?.coins ?? 0;
      const accountLevel = profile?.accountLevel ?? 1;
      const totalXp = profile?.xp ?? 0;
      this.championTotalCoin.innerHTML = `${formatNumber(totalCoins)}${this.coinIconImg('hud-inline-coin-icon hud-inline-coin-icon--total', 22)}`;
      this.championTotalXp.textContent = `Lv ${accountLevel} · ${formatNumber(totalXp)} XP`;
    } else {
      this.end.removeAttribute('data-champion-accent');
    }

    this.end.classList.toggle('end-screen--win', won);
    this.end.classList.toggle('end-screen--loss', !won);

    const ribbonWrap = this.end.querySelector('#end-champion-ribbon-wrap') as HTMLElement | null;
    const ribbonSurface = this.end.querySelector('.end-champion-ribbon-surface') as HTMLElement | null;
    const ribbonUrl = isTournamentChamp ? this.urlChampionRibbonTournament : this.urlChampionRibbonMatch;
    this.endChampionRibbonImg.src = ribbonUrl;
    this.endChampionRibbonImg.alt = isTournamentChamp ? 'Tournament champion' : 'Match champion';
    /** Şerit: normal galibiyette MATCH CHAMPION; turnuva şampiyonluğunda TOURNAMENT CHAMPION görseli. */
    const showChampionRibbon = won;
    this.end.classList.toggle('end--champion-ribbon', showChampionRibbon);
    if (ribbonWrap) {
      ribbonWrap.hidden = !showChampionRibbon;
      ribbonWrap.setAttribute('aria-hidden', showChampionRibbon ? 'false' : 'true');
    }
    if (ribbonSurface) {
      ribbonSurface.setAttribute('aria-hidden', showChampionRibbon ? 'false' : 'true');
    }
    const xpFill = this.end.querySelector('#end-xp-fill') as HTMLElement | null;
    const xpDelta = this.end.querySelector('#end-xp-delta') as HTMLElement | null;
    const prof = h.profile;
    if (xpFill && prof) {
      const p01 = Math.max(0, Math.min(1, prof.accountProgress01 ?? 0));
      xpFill.style.width = `${Math.round(p01 * 100)}%`;
    }
    if (xpDelta) {
      if (won) {
        if (isTournamentChamp && t) {
          xpDelta.textContent = `+${formatNumber(t.championBonusXp ?? 0)} EXP`;
          xpDelta.classList.add('end-xp-delta--win');
        } else if (isTournamentMidWin) {
          xpDelta.textContent = 'XP on champion win only';
          xpDelta.classList.remove('end-xp-delta--win');
        } else {
          xpDelta.textContent = `+${formatNumber(XP_REWARD_WIN)} EXP (win)`;
          xpDelta.classList.add('end-xp-delta--win');
        }
      } else {
        if (t) {
          xpDelta.textContent = 'No XP (tournament)';
        } else {
          xpDelta.textContent = `+${formatNumber(XP_REWARD_LOSS)} EXP`;
        }
        xpDelta.classList.remove('end-xp-delta--win');
      }
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
    this.end.classList.remove('end-screen--win', 'end-screen--loss', 'end--champion-ribbon');
    this.endPlayerName.classList.remove('end-player-name--win-badge');
    this.endPlayerName.classList.remove('end-player-name--loss-opponent');
    this.endModeWinBadge.removeAttribute('src');
    this.endModeWinBadge.alt = '';
    this.endLossOpponentPortrait.removeAttribute('src');
    this.endLossOpponentPortrait.alt = '';
    this.btnPlayAgain.style.display = 'none';
    this.end.querySelector('.end-actions')?.classList.remove('end-actions--with-play-again');
    this.end.style.display = 'none';
    this.soundBtn.style.display = 'none';
    this.powerBarPointerDown = false;
    this.spinPopupDragId = null;
    this.hideSpinPopup();
    this.powerBarWrap.style.display = 'none';
    this.powerBarWrap.classList.remove('hint');
    this.tutorialPowerDrag.classList.remove('show');
    this.powerBarTrack.style.setProperty('--p', '0');
    this.powerBarTrack.style.setProperty('--heat', '0');
    this.stopConfetti();
    this.stopRingAudio();
    this.hideShopOverlay();
    this.hideLeaderboardOverlay();
    this.hideAchievementsOverlay();
    this.hideModeSelectOverlay();
    this.hideTournamentOverlay();
    this.hideCasualShowcaseOverlay();
    this.hideMatchIntro();
    this.hideHudNotice();
    this.ballInHandHintLabel.classList.remove('show');
    this.ballInHandHintLabel.setAttribute('aria-hidden', 'true');
    this.ballInHandConfirmBtn.classList.remove('show');
    this.ballInHandConfirmBtn.setAttribute('aria-hidden', 'true');
    this.ballInHandConfirmBtn.disabled = true;
    this.aimIntroOverlay.classList.remove('show');
    this.aimIntroOverlay.setAttribute('aria-hidden', 'true');
    this.hideNextMatchModal();
    this.hideLevelOverlay();
    this.clearHudTopBand();
  }

  private syncSoundButtonVisual(): void {
    this.soundBtnIcon.src = this.soundMuted
      ? manifestUrl(this.assetBaseUrl, AssetIds.uiSoundOff)
      : manifestUrl(this.assetBaseUrl, AssetIds.uiSoundOn);
    this.soundBtn.setAttribute('aria-pressed', this.soundMuted ? 'true' : 'false');
    this.soundBtn.title = this.soundMuted ? 'Music off' : 'Music on';
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

function stripOrdered(
  order: readonly number[],
  potted: number[],
  assetBaseUrl: string,
): string {
  const pottedSet = new Set(potted);
  /** Sırada kalan (atılmamış) toplar renkli; atılan slotta `no-ball` placeholder. */
  return order.map((n) => potStripSlotHtml(n, assetBaseUrl, pottedSet.has(n))).join('');
}

function potStripSlotHtml(n: number, assetBaseUrl: string, isPotted: boolean): string {
  if (isPotted) {
    const emptySrc = manifestUrl(assetBaseUrl, AssetIds.uiNoBall);
    return `<span class="pot-slot pot-slot--icon" aria-hidden="true"><img class="pot-slot-img" src="${emptySrc}" alt="" decoding="async" /></span>`;
  }
  const ballSrc = manifestUrl(assetBaseUrl, AssetIds.uiBallSprite(n));
  return `<span class="pot-slot pot-slot--icon" aria-hidden="true"><img class="pot-slot-img" src="${ballSrc}" alt="" decoding="async" /></span>`;
}

function stripUnknown(assetBaseUrl: string): string {
  const emptySrc = manifestUrl(assetBaseUrl, AssetIds.uiNoBall);
  const slot = `<span class="pot-slot pot-slot--icon" aria-hidden="true"><img class="pot-slot-img" src="${emptySrc}" alt="" decoding="async" /></span>`;
  return new Array(7).fill(slot).join('');
}

/** Cue shop showcase art (full card PNGs); other catalog ids use procedural preview. */
function shopCueShowcaseImageUrl(assetBaseUrl: string, cueId: string): string | null {
  const rel: Record<string, keyof typeof AssetManifest> = {
    classic: AssetIds.uiCueClassicCard,
    street: AssetIds.uiCueStreetCard,
    pro: AssetIds.uiCueProCard,
    neon: AssetIds.uiCueNeonCard,
  };
  const key = rel[cueId];
  return key ? manifestUrl(assetBaseUrl, key) : null;
}

function shopCueRarityClass(cueId: string): string {
  switch (cueId) {
    case 'classic':
      return 'shop-card--rarity-classic';
    case 'street':
      return 'shop-card--rarity-street';
    case 'pro':
      return 'shop-card--rarity-pro';
    case 'neon':
      return 'shop-card--rarity-neon';
    default:
      return 'shop-card--rarity-classic';
  }
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

/** Kart üstü "You" satırı — mod kazanım rozeti (`public/ui/Win_*.png`); casual = turnuva yok. */
function endCardModeWinBadgeUrl(assetBaseUrl: string, tournamentDefId: string | undefined): string {
  const fileByDef: Readonly<Record<string, keyof typeof AssetManifest>> = {
    rookie: AssetIds.uiWinRookieCup,
    pro: AssetIds.uiWinProSeries,
    elite: AssetIds.uiWinEliteBrawl,
    grandslam: AssetIds.uiWinGrandSlam,
  };
  const key =
    tournamentDefId && fileByDef[tournamentDefId] ? fileByDef[tournamentDefId]! : AssetIds.uiWinCasual;
  return manifestUrl(assetBaseUrl, key);
}

function tournamentSlotReactionUrl(assetBaseUrl: string, opponentId: string, kind: 'cry'): string {
  const key = portraitReactionAssetId(opponentId, kind);
  const entry = AssetManifest[key as keyof typeof AssetManifest];
  if (entry) return resolveBrowserAssetUrl(assetBaseUrl, entry.browserUrl);
  return opponentHudAvatarUrl(assetBaseUrl, opponentId);
}

/** Maps `TournamentCatalog` tier id → mode-select trophy manifest key. */
const TOURNAMENT_MODE_CUP_MANIFEST: Readonly<Record<string, keyof typeof AssetManifest>> = {
  rookie: 'ui.modeselect.cup.rookie',
  pro: 'ui.modeselect.cup.pro',
  elite: 'ui.modeselect.cup.elite',
  grandslam: 'ui.modeselect.cup.grandslam',
};

function tournamentBracketCupUrl(assetBaseUrl: string, defId: string): string | null {
  const k = TOURNAMENT_MODE_CUP_MANIFEST[defId];
  if (!k) return null;
  const e = AssetManifest[k];
  return e ? resolveBrowserAssetUrl(assetBaseUrl, e.browserUrl) : null;
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
