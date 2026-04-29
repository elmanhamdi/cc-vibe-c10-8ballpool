export type CueShopItem = {
  id: string;
  name: string;
  price: number;
  description?: string;
  accent?: string;
  stats: {
    /** Power scaling multiplier (1 = baseline). */
    power: number;
    /** Aim stability / noise reduction (higher = more stable). */
    aim: number;
    /** Spin effectiveness multiplier. */
    spin: number;
  };
};

/** Five-tier catalog; ids must stay stable for saves/opponent assignment. */
export const SHOP_CUE_CATALOG: readonly CueShopItem[] = [
  {
    id: 'classic',
    name: 'Classic',
    price: 0,
    description: 'Standard wood cue',
    accent: '#f2c542',
    stats: { power: 1, aim: 1, spin: 1 },
  },
  {
    id: 'street',
    name: 'Street Maple',
    price: 80,
    description: 'Balanced starter upgrade',
    accent: '#b58b5a',
    stats: { power: 1.05, aim: 1.05, spin: 1.02 },
  },
  {
    id: 'pro',
    name: 'Pro Fiber',
    price: 140,
    description: 'Lightweight modern fiber build',
    accent: '#5cf0c2',
    stats: { power: 1.08, aim: 1.08, spin: 1.06 },
  },
  {
    id: 'neon',
    name: 'Neon Glow',
    price: 220,
    description: 'Bright neon club finish',
    accent: '#ff6f91',
    stats: { power: 1.12, aim: 1.1, spin: 1.1 },
  },
  {
    id: 'carbon',
    name: 'Carbon Edge',
    price: 320,
    description: 'Low-deflection carbon with laser sight decals',
    accent: '#66b6ff',
    stats: { power: 1.15, aim: 1.18, spin: 1.14 },
  },
  {
    id: 'legend',
    name: 'Legend Forged',
    price: 480,
    description: 'Tour-grade forged shaft and inlays',
    accent: '#f4d35e',
    stats: { power: 1.2, aim: 1.24, spin: 1.2 },
  },
];
