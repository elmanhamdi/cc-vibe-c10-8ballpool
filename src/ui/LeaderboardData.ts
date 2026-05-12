import { accountFromXp } from '../core/AccountLevel.js';
import { MemoryStorageAdapter, type StorageAdapter } from '../core/StorageAdapter.js';

/**
 * Placeholder XP-focused leaderboard. There is no real online matchmaking yet,
 * so we generate a deterministic snapshot of fake players the first time the
 * board is opened, persist it via the injected storage adapter, and slot the
 * player in based on their live XP. This way "Online" eventually replacing this
 * module needs only the data source to change.
 */

const LB_STORAGE_KEY = 'vertical-eight-ball.leaderboard.v1';
const FALLBACK_STORAGE = new MemoryStorageAdapter();

interface FakeEntrySeed {
  name: string;
  flag: string; // emoji flag for visual flair only
  /** Stable accent for the avatar swatch. */
  hue: number;
  /** Base XP at snapshot creation time. */
  xp: number;
}

const FAKE_SEEDS: readonly FakeEntrySeed[] = [
  { name: 'Phantom Cue', flag: '🇺🇸', hue: 12, xp: 9420 },
  { name: 'Crimson Eagle', flag: '🇩🇪', hue: 350, xp: 7180 },
  { name: 'Tungo Fan #1', flag: '🇮🇹', hue: 28, xp: 5320 },
  { name: 'NeonShark', flag: '🇰🇷', hue: 320, xp: 4210 },
  { name: 'BulletPocket', flag: '🇧🇷', hue: 200, xp: 3560 },
  { name: 'Sharkbite', flag: '🇦🇺', hue: 180, xp: 2880 },
  { name: 'NightHustler', flag: '🇲🇽', hue: 280, xp: 2200 },
  { name: 'Balleeina4Life', flag: '🇫🇷', hue: 300, xp: 1740 },
  { name: 'CueGhost', flag: '🇯🇵', hue: 220, xp: 1320 },
  { name: 'IronRail', flag: '🇸🇪', hue: 50, xp: 1010 },
  { name: 'Spinmaster', flag: '🇪🇸', hue: 30, xp: 820 },
  { name: 'GoldChalk', flag: '🇨🇦', hue: 45, xp: 640 },
  { name: 'PixelPro', flag: '🇳🇱', hue: 160, xp: 510 },
  { name: 'BillyTheCue', flag: '🇮🇪', hue: 100, xp: 380 },
  { name: 'TableShark', flag: '🇿🇦', hue: 195, xp: 280 },
  { name: 'BumperKing', flag: '🇵🇱', hue: 240, xp: 210 },
  { name: 'BankShot', flag: '🇨🇭', hue: 130, xp: 150 },
  { name: 'SoftBreak', flag: '🇦🇷', hue: 70, xp: 95 },
  { name: 'NewHustler', flag: '🇹🇷', hue: 15, xp: 60 },
  { name: 'BeginnerLuck', flag: '🇬🇧', hue: 0, xp: 25 },
];

interface PersistedSnapshot {
  v: 1;
  entries: { name: string; flag: string; hue: number; xp: number }[];
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  flag: string;
  hue: number;
  xp: number;
  accountLevel: number;
  isPlayer: boolean;
}

function loadPersisted(storage: StorageAdapter): PersistedSnapshot | null {
  try {
    const raw = storage.getItem(LB_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      (parsed as PersistedSnapshot).v !== 1
    ) {
      return null;
    }
    const arr = (parsed as PersistedSnapshot).entries;
    if (!Array.isArray(arr)) return null;
    return { v: 1, entries: arr };
  } catch {
    return null;
  }
}

function savePersisted(storage: StorageAdapter, snap: PersistedSnapshot): void {
  try {
    storage.setItem(LB_STORAGE_KEY, JSON.stringify(snap));
  } catch {
    /* ignore */
  }
}

function buildSnapshotFromSeeds(): PersistedSnapshot {
  const entries = FAKE_SEEDS.map((s) => ({
    name: s.name,
    flag: s.flag,
    hue: s.hue,
    /** Add small deterministic jitter so the list feels organic. */
    xp: Math.max(0, Math.round(s.xp * (0.92 + ((s.hue % 17) / 100)))),
  }));
  return { v: 1, entries };
}

/** Returns a sorted leaderboard with the player slotted in by live XP. */
export function getLeaderboard(
  playerName: string,
  playerXp: number,
  storage: StorageAdapter = FALLBACK_STORAGE,
): LeaderboardEntry[] {
  let snap = loadPersisted(storage);
  if (!snap) {
    snap = buildSnapshotFromSeeds();
    savePersisted(storage, snap);
  }
  const fakes: LeaderboardEntry[] = snap.entries.map((e) => ({
    rank: 0,
    name: e.name,
    flag: e.flag,
    hue: e.hue,
    xp: e.xp,
    accountLevel: accountFromXp(e.xp).level,
    isPlayer: false,
  }));
  const playerEntry: LeaderboardEntry = {
    rank: 0,
    name: playerName || 'You',
    flag: '🏠',
    hue: 140,
    xp: Math.max(0, Math.floor(playerXp)),
    accountLevel: accountFromXp(playerXp).level,
    isPlayer: true,
  };
  const merged = [...fakes, playerEntry].sort((a, b) => b.xp - a.xp);
  merged.forEach((e, i) => {
    e.rank = i + 1;
  });
  return merged;
}
