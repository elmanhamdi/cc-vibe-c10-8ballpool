/**
 * Canonical spin / "english" presets — offsets match design JSON (9 hit areas).
 * Spin pad input is snapped to the nearest non-center preset; small drifts map
 * to Center Hit via a capture radius.
 */

export interface SpinPreset {
  readonly hitArea: string;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly cueBallReaction: string;
  readonly objectBallReaction: string;
  readonly commonUse: string;
  readonly riskLevel: string;
}

export const SPIN_PRESETS: readonly SpinPreset[] = [
  {
    hitArea: 'Center Hit',
    offsetX: 0,
    offsetY: 0,
    cueBallReaction: 'Straight movement no spin',
    objectBallReaction: 'Normal angle transfer',
    commonUse: 'Basic shots',
    riskLevel: 'Very Low',
  },
  {
    hitArea: 'Top Spin',
    offsetX: 0,
    offsetY: 0.6,
    cueBallReaction: 'Continues rolling forward after hit',
    objectBallReaction: 'More forward energy',
    commonUse: 'Follow shots',
    riskLevel: 'Low',
  },
  {
    hitArea: 'Back Spin',
    offsetX: 0,
    offsetY: -0.6,
    cueBallReaction: 'Pulls backward after collision',
    objectBallReaction: 'Reduced forward transfer',
    commonUse: 'Positioning draw shots',
    riskLevel: 'Medium',
  },
  {
    hitArea: 'Left Spin',
    offsetX: -0.7,
    offsetY: 0,
    cueBallReaction: 'Curves left during travel and after bounce',
    objectBallReaction: 'Alters rebound angles',
    commonUse: 'Rail control',
    riskLevel: 'Medium',
  },
  {
    hitArea: 'Right Spin',
    offsetX: 0.7,
    offsetY: 0,
    cueBallReaction: 'Curves right during travel and after bounce',
    objectBallReaction: 'Alters rebound angles',
    commonUse: 'Rail control',
    riskLevel: 'Medium',
  },
  {
    hitArea: 'Top Left',
    offsetX: -0.5,
    offsetY: 0.5,
    cueBallReaction: 'Forward and left curve',
    objectBallReaction: 'Modified rebound and follow',
    commonUse: 'Advanced positioning',
    riskLevel: 'High',
  },
  {
    hitArea: 'Top Right',
    offsetX: 0.5,
    offsetY: 0.5,
    cueBallReaction: 'Forward and right curve',
    objectBallReaction: 'Modified rebound and follow',
    commonUse: 'Advanced positioning',
    riskLevel: 'High',
  },
  {
    hitArea: 'Bottom Left',
    offsetX: -0.5,
    offsetY: -0.5,
    cueBallReaction: 'Backward and left curve',
    objectBallReaction: 'Reduced transfer and side angle',
    commonUse: 'Escape shots',
    riskLevel: 'Very High',
  },
  {
    hitArea: 'Bottom Right',
    offsetX: 0.5,
    offsetY: -0.5,
    cueBallReaction: 'Backward and right curve',
    objectBallReaction: 'Reduced transfer and side angle',
    commonUse: 'Escape shots',
    riskLevel: 'Very High',
  },
] as const;

const CENTER_PRESET = SPIN_PRESETS[0]!;
const NON_CENTER_PRESETS = SPIN_PRESETS.slice(1) as readonly SpinPreset[];

/** Inside this radius (normalized spin space) => Center Hit */
const CENTER_CAPTURE_R = 0.22;

function clampUnit(v: number): number {
  return Math.max(-1, Math.min(1, v));
}

export interface ResolvedSpin {
  x: number;
  y: number;
  preset: SpinPreset;
}

/**
 * Map raw pad coordinates to the nearest preset offset + metadata.
 */
export function resolveSpinInput(nx: number, ny: number): ResolvedSpin {
  const x = clampUnit(nx);
  const y = clampUnit(ny);
  const r2 = x * x + y * y;
  if (r2 <= CENTER_CAPTURE_R * CENTER_CAPTURE_R) {
    return { x: CENTER_PRESET.offsetX, y: CENTER_PRESET.offsetY, preset: CENTER_PRESET };
  }
  let best: SpinPreset = NON_CENTER_PRESETS[0]!;
  let bestD = Infinity;
  for (const p of NON_CENTER_PRESETS) {
    const dx = x - p.offsetX;
    const dy = y - p.offsetY;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return { x: best.offsetX, y: best.offsetY, preset: best };
}

/** Curl / rail throw scaling from preset risk */
export function spinRiskCurlMultiplier(preset: SpinPreset): number {
  switch (preset.riskLevel) {
    case 'Very Low':
      return 0.88;
    case 'Low':
      return 0.94;
    case 'Medium':
      return 1.0;
    case 'High':
      return 1.06;
    case 'Very High':
      return 1.12;
    default:
      return 1.0;
  }
}
