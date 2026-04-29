/** Shared simulation / camera framing constants (no platform APIs). */

/** Oyuncu kadrajı: +Y ekseninden polar (rad). `0` = tam üstten. */
export const CAMERA_ORBIT_RAD = 0;
export const CAMERA_FOV_DEG = 24;
export const CAMERA_NEAR = 40;
export const CAMERA_FAR = 12000;

/** >1 moves camera back — table fills less of the canvas (HUD stays large in CSS). */
export const CAMERA_TABLE_DISTANCE_SCALE = 1.08;

/**
 * Y-up world: camera looks at table center. Spherical from +Y (polar) then rotate in XZ (azimuth, 0 = +X).
 * Player: `CAMERA_ORBIT_RAD` eğimi, azimuth π/2 (YZ düzleminde, x = 0).
 */
export const CAMERA_PLAYER_POLAR_RAD = CAMERA_ORBIT_RAD;
export const CAMERA_PLAYER_AZIMUTH_RAD = Math.PI / 2;

/**
 * Sinematik / açılış kadrajı: `AI_CAMERA_CINEMATIC_CHANCE` ile rakip turunda blend.
 * `'a'`: polar π/3 (60°), azimuth π/2.
 * `'b'`: polar π/2, azimuth π/4.
 */
export type AiCameraPresetId = 'a' | 'b';
export const AI_CAMERA_PRESET: AiCameraPresetId = 'a';

export const AI_CAMERA_PRESET_A_POLAR_RAD = Math.PI / 3;
export const AI_CAMERA_PRESET_A_AZIMUTH_RAD = Math.PI / 2;

/**
 * İlk break öncesi: kamera konumuna dünya +Y eklenir (uzaklaştırmaz, sadece yukarı kaldırır).
 */
export const AI_CAMERA_OPENING_BREAK_Y_OFFSET = 68;

/**
 * İlk break: `lookAt` merkezden uzun kenara kayar (orta yerine üst uç kadrajı).
 * Hedef Z = `-(th/2) * scale` (dünya Z). Düşük = daha az köşeye, daha çok merkeze yakın bakış.
 */
export const AI_CAMERA_OPENING_BREAK_LOOK_AT_Z_SCALE = 0.52;

export const AI_CAMERA_PRESET_B_POLAR_RAD = Math.PI / 2;
export const AI_CAMERA_PRESET_B_AZIMUTH_RAD = Math.PI / 4;

/** Azimuth’a eklenir; 0 = ek yaw yok. */
export const AI_CAMERA_OPPONENT_YAW_OFFSET_RAD = 0;

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

/**
 * İlk break vuruşundan sonra üst kadraja dönüş (BallSimulation sırasında).
 * Düşük = daha yavaş; `AI_CAMERA_BLEND_EXP_RETURN`’dan ayrı tutulur.
 */
export const OPENING_BREAK_CAMERA_BLEND_RETURN_EXP = 1.05;

/** Orta ekran reaction beat (portre + satır); HUD `--opp-react-dur` ile aynı. CSS: 2s’te orta plato 1s. */
export const OPPONENT_REACTION_TTL_MIN_SEC = 2;
export const OPPONENT_REACTION_TTL_RANDOM_SEC = 0.12;

/** Tung 3D: üst (-Z) rail’in biraz gerisi (dünya Z); Y = felt + `OPPONENT_TUNG_WORLD_Y_OFFSET`. */
export const OPPONENT_TUNG_PLACEHOLDER_PAST_RAIL_Z = 44;
export const OPPONENT_TUNG_PLACEHOLDER_OFFSET_X = 0;
/** Felt tabanına göre ekstra Y (negatif = karakter aşağı). */
export const OPPONENT_TUNG_WORLD_Y_OFFSET = -358;
/** FBX yüksekliği bu hedefe ölçeklenir (dünya birimi; taban ~165 × 3). */
export const OPPONENT_TUNG_MODEL_TARGET_HEIGHT = 420;
