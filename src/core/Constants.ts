/** Shared simulation / camera framing constants (no platform APIs). */

/** Oyuncu kadrajı: +Y’den hafif polar (rad). 45° sadece rakip preset’lerinde. */
export const CAMERA_ORBIT_RAD = 0.11;
export const CAMERA_FOV_DEG = 24;
export const CAMERA_NEAR = 40;
export const CAMERA_FAR = 12000;

/** >1 moves camera back — table fills less of the canvas (HUD stays large in CSS). */
export const CAMERA_TABLE_DISTANCE_SCALE = 1.08;

/**
 * Y-up world: camera looks at table center. Spherical from +Y (polar) then rotate in XZ (azimuth, 0 = +X).
 * Player: hafif eğim (+Y’den ~6.3°), azimuth π/2 (YZ düzleminde, x = 0).
 */
export const CAMERA_PLAYER_POLAR_RAD = CAMERA_ORBIT_RAD;
export const CAMERA_PLAYER_AZIMUTH_RAD = Math.PI / 2;

/**
 * Rakip turu: `AI_CAMERA_CINEMATIC_CHANCE` ile bu preset’e blend; aksi halde oyuncuya yakın kadraj.
 * `'a'` ≈ (0°, 45°, 90°) — YZ düzleminde, +Y’den 45° (x=0, daha yandan).
 * `'b'` ≈ (45°, 45°) — XZ’de 45° azimut, +Y’den 45° (köşegen).
 */
export type AiCameraPresetId = 'a' | 'b';
export const AI_CAMERA_PRESET: AiCameraPresetId = 'a';

export const AI_CAMERA_PRESET_A_POLAR_RAD = Math.PI / 4;
export const AI_CAMERA_PRESET_A_AZIMUTH_RAD = Math.PI / 2;

export const AI_CAMERA_PRESET_B_POLAR_RAD = Math.PI / 4;
export const AI_CAMERA_PRESET_B_AZIMUTH_RAD = Math.PI / 4;

/**
 * Rakip vuruşunda XZ’de “sağa” (azimuth +, rad). GameEngine’de ~%28 taban + sinematik blend ile tamına çıkar.
 * Ekranda ters gelirse negatif yap.
 */
export const AI_CAMERA_OPPONENT_YAW_OFFSET_RAD = 0.24;

/**
 * Rakip turunda preset “sinematik” kadraja geçme olasılığı (0–1).
 * `0` = rakip vururken kamera açısı değişmez (oyuncu kadrajı). Ara sıra için örn. `0.1`.
 */
export const AI_CAMERA_CINEMATIC_CHANCE = 0.3;

/**
 * Rakip kadrajına doğru blend hızı (üstel). Daha yüksek = daha hızlı.
 */
export const AI_CAMERA_BLEND_EXP = 2.0;

/**
 * Sıra oyuncuya dönünce preset’ten çıkış — daha düşük = daha yavaş, yumuşak dönüş.
 */
export const AI_CAMERA_BLEND_EXP_RETURN = 1.25;
