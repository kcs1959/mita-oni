/** 1 マスの大きさ（ワールド座標 px）。キャンバスは画面に合わせて拡大縮小される */
export const CELL = 40

/** 視界の半径 x[px]（ワールド座標）。自分を中心にこの円の内側だけが見える */
export const VISION_RADIUS_PX = 120

export const COLORS = {
  field: 0x091322,
  road: 0xe8eaca,
  wall: 0x405b65,
  wallHighlight: 0x61888c,
  marker: 0x61888c,
  runner: 0x78e8f0,
  oni: 0xff797e,
  eye: 0x101728,
  ring: 0x78e8f0,
  landmarkBg: 0x151f35,
  text: '#eaf5ff',
} as const

/** Figma「05 · 盤面デザイン」の三田の名所。座標はマス単位 */
export const LANDMARKS = [
  { label: '東京タワー', icon: '▲', color: 0xff797e, x: 1.08, y: 1.35, w: 2.85, h: 1.96 },
  { label: '田町駅', icon: 'JR', color: 0x78e8f0, x: 8.65, y: 5.6, w: 2.85, h: 1.96 },
  { label: '三田二郎', icon: 'ラ', color: 0xffe37a, x: 2.0, y: 12.2, w: 2.85, h: 1.96 },
] as const
