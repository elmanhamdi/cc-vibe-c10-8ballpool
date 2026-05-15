export type CueShopItem = {
  id: string;
  name: string;
  price: number;
  description?: string;
  accent?: string;
  /** Shop preview only — colors mirror `CUE_STYLE_TABLE` (`ThreeSceneAdapter.ts`). */
  preview?: {
    shaft: string;
    butt: string;
    tip: string;
  };
  stats: {
    /** Power scaling multiplier (1 = baseline). */
    power: number;
    /** Aim stability / noise reduction (higher = more stable). */
    aim: number;
    /** Spin effectiveness multiplier. */
    spin: number;
  };
};

/** Shop cue catalog (stable ids for saves). */
export const SHOP_CUE_CATALOG: readonly CueShopItem[] = [
  {
    id: 'classic',
    name: 'Classic',
    price: 0,
    description: 'Standard wood cue',
    accent: '#f2c542',
    preview: { shaft: '#8b5a2b', butt: '#3a2614', tip: '#4d6fa8' },
    stats: { power: 1, aim: 1, spin: 1 },
  },
  {
    id: 'street',
    name: 'Street Maple',
    price: 899,
    description: 'Balanced starter upgrade',
    accent: '#b58b5a',
    preview: { shaft: '#c8a273', butt: '#6b4423', tip: '#4d6fa8' },
    stats: { power: 1.05, aim: 1.05, spin: 1.02 },
  },
  {
    id: 'pro',
    name: 'Pro Fiber',
    price: 1899,
    description: 'Lightweight modern fiber build',
    accent: '#5cf0c2',
    preview: { shaft: '#e8efe9', butt: '#2c4d44', tip: '#3f6a98' },
    stats: { power: 1.08, aim: 1.08, spin: 1.06 },
  },
  {
    id: 'neon',
    name: 'Neon Glow',
    price: 3499,
    description: 'Bright neon club finish',
    accent: '#ff6f91',
    preview: { shaft: '#ff6f91', butt: '#ff3d72', tip: '#3a2230' },
    stats: { power: 1.12, aim: 1.1, spin: 1.1 },
  },
];
