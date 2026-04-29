/**
 * 2D masa / cep / bant. Merge with {@link DEFAULT_TABLE_LAYOUT}.
 *
 * **Model:** Düz bant segmentleri (cep boşlukları açık) + her cep için masanın *dışına* bakan yay
 * segmentleri; masaya bakan tarafta boğaz açık — top içeri düşebilir, dışarı kaçış yay ile kesilir.
 *
 * **Browser overrides**
 * - Query: `?tl_<field>=<number>` (örn. `tl_horizontalRailExtendAlongPx=4`, `tl_leftLowerVerticalRailExtendTopPx=5`).
 * - `localStorage` key `poolTableLayoutJson`: JSON `{ "pocketOuterWallSegments": 12, ... }`.
 *   URL parametreleri localStorage değerlerini ezer.
 */
export interface TableLayoutConfig {
  tableWidth: number;
  tableHeight: number;
  margin: number;
  feltInset: number;
  pocketRadius: number;
  sidePocketXMul: number;
  cornerAlong: number;
  midHalf: number;
  sideCorner: number;
  potRadiusBallFactor: number;
  headStringYRatio: number;
  /** Only left-side features (pocket centers + left rails) shift +X by this many px. */
  leftSideShiftPx: number;
  /** Only right-side features (pocket centers + right rails) shift −X by this many px. */
  rightSideShiftPx: number;
  /** Bottom pockets + bottom rail shift −Y (yukarı); top pockets + top rail shift +Y (aşağı). */
  bottomSideShiftPx: number;
  topSideShiftPx: number;
  /**
   * Ek +Y sadece üst **köşe** cep merkezleri (id 0, 2) ve bunların dış yayları için; üst bant çizgisi değişmez.
   */
  topCornerPocketExtraDownPx: number;
  /**
   * Ek −Y sadece alt **köşe** cep merkezleri (id 3, 5) ve dış yayları için; alt bant çizgisi (`innerB`) değişmez.
   */
  bottomCornerPocketExtraUpPx: number;
  /**
   * Köşelere yatay sıkıştırma: üst/alt yatay bant uçları +X / −X; köşe cepleri (0,2,3,5) aynı miktarda kayar.
   * Orta yan cepler (1,4) ve uzun kenardaki **cep boşlukları** (dikey bantların `midHalf` aralığı) **değişmez** —
   * dikey bantlar `innerL`/`innerR` (squeeze’sız) üzerinde kalır.
   */
  horizontalEndsSqueezePx: number;
  /**
   * Üst ve alt yatay bantları birlikte uçlardan uzatır: sol uç −X, sağ uç +X (aynı px, iki bantta aynı).
   */
  horizontalRailExtendAlongPx: number;
  /** Sol üst dikey bant: üst uç (küçük Y) −Y; alt uç (cep boşluğuna doğru) +Y. */
  leftUpperVerticalRailExtendTopPx: number;
  leftUpperVerticalRailExtendBottomPx: number;
  /** Sol alt dikey bant: üst uç −Y; alt uç +Y. */
  leftLowerVerticalRailExtendTopPx: number;
  leftLowerVerticalRailExtendBottomPx: number;
  /** Sağ üst dikey bant: üst uç −Y; alt uç +Y. */
  rightUpperVerticalRailExtendTopPx: number;
  rightUpperVerticalRailExtendBottomPx: number;
  /** Sağ alt dikey bant: üst uç −Y; alt uç +Y. */
  rightLowerVerticalRailExtendTopPx: number;
  rightLowerVerticalRailExtendBottomPx: number;
  /**
   * Cep merkezinden masa merkezine doğru yarım açı (radyan). Bu açı aralığında duvar YOK (pot boğazı).
   * Geriye kalan açı aralığı dış duvar yayı ile kapanır.
   */
  pocketThroatHalfAngleRad: number;
  /** Dış cep duvarı yayı: yarıçap = `pocketRadius * pocketOuterWallRadiusScale`. */
  pocketOuterWallRadiusScale: number;
  /** Dış yay kaç düz segmente bölünecek. */
  pocketOuterWallSegments: number;
  /**
   * Köşe cepleri dış duvar yayı: cep merkezi etrafında ek dönüş (derece).
   * Pozitif = saat **tersi** (CCW), negatif = saat **yönü** (CW); `Math.atan2` ile uyumlu.
   */
  cornerPocketOuterWallRotateDegLeftTop: number;
  cornerPocketOuterWallRotateDegLeftBottom: number;
  cornerPocketOuterWallRotateDegRightTop: number;
  cornerPocketOuterWallRotateDegRightBottom: number;
}

export const DEFAULT_TABLE_LAYOUT: TableLayoutConfig = {
  tableWidth: 368,
  tableHeight: 658,
  margin: 27,
  feltInset: 14,
  pocketRadius: 20,
  sidePocketXMul: 1.00,
  cornerAlong: 20,
  midHalf: 28,
  sideCorner: 22,
  potRadiusBallFactor: 0.32,
  headStringYRatio: 0.72,
  leftSideShiftPx: 6,
  rightSideShiftPx: 6,
  bottomSideShiftPx: 8,
  topSideShiftPx: 8,
  topCornerPocketExtraDownPx: 7,
  bottomCornerPocketExtraUpPx: 7,
  horizontalEndsSqueezePx: 6,
  horizontalRailExtendAlongPx: 11,
  leftUpperVerticalRailExtendTopPx: 5,
  leftUpperVerticalRailExtendBottomPx: 13,
  leftLowerVerticalRailExtendTopPx: 13,
  leftLowerVerticalRailExtendBottomPx: 5,
  rightUpperVerticalRailExtendTopPx: 5,
  rightUpperVerticalRailExtendBottomPx: 13,
  rightLowerVerticalRailExtendTopPx: 13,
  rightLowerVerticalRailExtendBottomPx: 5,
  pocketThroatHalfAngleRad: 0.98,
  pocketOuterWallRadiusScale: 0.9,
  pocketOuterWallSegments: 10,
  cornerPocketOuterWallRotateDegLeftTop: -15,
  cornerPocketOuterWallRotateDegLeftBottom: 15,
  cornerPocketOuterWallRotateDegRightTop: 15,
  cornerPocketOuterWallRotateDegRightBottom: -15,
};

export const TABLE_LAYOUT_KEYS = Object.keys(DEFAULT_TABLE_LAYOUT) as (keyof TableLayoutConfig)[];

export function mergeTableLayout(
  base: TableLayoutConfig,
  partial: Partial<TableLayoutConfig>,
): TableLayoutConfig {
  const out = { ...base };
  for (const k of TABLE_LAYOUT_KEYS) {
    const v = partial[k];
    if (v !== undefined && typeof v === 'number' && Number.isFinite(v)) {
      (out as Record<string, number>)[k] = v;
    }
  }
  return out;
}

/** Apply JSON object (e.g. from `localStorage`) — ignores unknown keys. */
export function tableLayoutFromJson(json: unknown): Partial<TableLayoutConfig> {
  if (!json || typeof json !== 'object') return {};
  const o = json as Record<string, unknown>;
  const partial: Partial<TableLayoutConfig> = {};
  for (const key of TABLE_LAYOUT_KEYS) {
    const v = o[key];
    if (typeof v === 'number' && Number.isFinite(v)) partial[key] = v;
  }
  return partial;
}
