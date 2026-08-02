// 座位布局 — 对齐 Unity 老德州 GameUtil.SeatPosV3 + SeatUIInfos:
//   14 个固定锚点,按房间人数(2~9)取固定子集;Hero 恒在锚点0(中下)。
//   锚点坐标沿用本项目 gameTable.fire 设计空间微调版(2026-06-28 与用户调过:
//   顶排抬高、Hero 下移、侧列加宽),缺的 5 个锚点按现有等距(左右列行距 198)插值补齐。
//
// 锚点语义(同 Unity 注释):
//   0中下 1左下 2左中下 3左中 4左中上 5左上 6中上偏左 7中上 8中上偏右
//   9右上 10右中上 11右中 12右中下 13右下
export const SEAT_ANCHORS = [
  { x: 0, y: -732 },    // 0 中下 (Hero)
  { x: -446, y: -198 }, // 1 左下
  { x: -446, y: 0 },    // 2 左中下
  { x: -446, y: 198 },  // 3 左中
  { x: -446, y: 396 },  // 4 左中上
  { x: -446, y: 594 },  // 5 左上
  { x: -126, y: 817 },  // 6 中上偏左
  { x: 0, y: 817 },     // 7 中上
  { x: 126, y: 817 },   // 8 中上偏右
  { x: 446, y: 594 },   // 9 右上
  { x: 446, y: 396 },   // 10 右中上
  { x: 446, y: 198 },   // 11 右中
  { x: 446, y: 0 },     // 12 右中下
  { x: 446, y: -198 },  // 13 右下
]

// 各人数使用的锚点子集(环序,slot0=中下 Hero) — 1:1 Unity GameUtil.SeatUIInfos。
export const SEAT_SUBSETS = {
  2: [0, 7],
  3: [0, 4, 10],
  4: [0, 3, 7, 11],
  5: [0, 3, 6, 8, 11],
  6: [0, 2, 4, 7, 10, 12],
  7: [0, 2, 4, 6, 8, 10, 12],
  8: [0, 1, 3, 5, 7, 9, 11, 13],
  9: [0, 1, 3, 5, 6, 8, 9, 11, 13],
}

/** 按房间座位数返回环序座位坐标(index=slot,slot0=中下 Hero) */
export function seatPositionsFor(n) {
  const subset = SEAT_SUBSETS[n] || SEAT_SUBSETS[9]
  return subset.map((a, i) => ({ id: i, ...SEAT_ANCHORS[a] }))
}

// 9 人桌(默认) — 与旧 SEAT_POSITIONS 完全一致,测试弹窗等静态场景沿用。
export const SEAT_POSITIONS = seatPositionsFor(9)

// scene (x up-y) -> CSS node vars. Screen y is flipped.
export const toCx = (x) => x
export const toCy = (y) => -y
