// 牌面 / 牌背皮肤（逆向自 WePoker `resources/mtt/poker_card/`）。
//
// 原版牌面 = 多张网格 sheet（`card_face_setting` 选皮），每张布局都是「[2 Joker] + ♦♣♥♠ 各 2→A」，
//   行列/是否含 Joker 因 sheet 而异（见各项 cols/rows/joker）。我们按网格数学切片，每套皮肤只用 1 张纹理。
// 原版牌背 = `card_back/poker_card_back_altas`（`card_back_setting` 选皮），12 款（frame_1~6 + _pkw），
//   已用 extract/extract_card_backs.py 从打包图集裁成独立 PNG。
//
// 牌值编码（与 tableModel.serverCardToClient / Unity PokerUtility.cs 一致）：
//   value = suit*100 + rank，suit 1=♦方块 2=♣梅花 3=♥红桃 4=♠黑桃，rank 1=A,2..10,11=J,12=Q,13=K。

export const CARD_SHEET_DIR = '/assets/table/cards/sheets/'
export const CARD_BACK_DIR = '/assets/table/cards/backs/'

// sheet 像素尺寸内置，使切片不依赖纹理加载完成即可算出像素 frame。
export const FACE_SKINS = [
  { id: 'color4', file: 'cards_pkw.png', w: 767, h: 1628, cols: 6, rows: 9, joker: 2, label: '四色' },
  { id: 'color4b', file: 'cards2_pkw.png', w: 767, h: 1628, cols: 6, rows: 9, joker: 2, label: '四色 II' },
  { id: 'color4c', file: 'cards4_pkw.png', w: 767, h: 1628, cols: 6, rows: 9, joker: 2, label: '四色 III' },
  { id: 'classic', file: 'cards.png', w: 1143, h: 1080, cols: 9, rows: 6, joker: 2, label: '经典' },
  { id: 'classic2', file: 'cards2.png', w: 1143, h: 1080, cols: 9, rows: 6, joker: 2, label: '经典 II' },
  { id: 'classic3', file: 'cards3.png', w: 1143, h: 1080, cols: 9, rows: 6, joker: 2, label: '经典 III' },
  { id: 'classic3b', file: 'cards3_pkw.png', w: 1143, h: 1080, cols: 9, rows: 6, joker: 1, label: '经典 IV' },
  { id: 'pineapple', file: 'pineapple_card.png', w: 1143, h: 1080, cols: 9, rows: 6, joker: 2, label: '菠萝' },
  { id: 'big5', file: 'cards5_pkw.png', w: 992, h: 1260, cols: 8, rows: 7, joker: 0, label: '粗体 I' },
  { id: 'big6', file: 'cards6_pkw.png', w: 992, h: 1260, cols: 8, rows: 7, joker: 0, label: '粗体 II' },
]

export const BACK_SKINS = [
  { id: 'b1pkw', file: 'poker_back_frame_1_pkw.png' },
  { id: 'b2pkw', file: 'poker_back_frame_2_pkw.png' },
  { id: 'b3pkw', file: 'poker_back_frame_3_pkw.png' },
  { id: 'b4pkw', file: 'poker_back_frame_4_pkw.png' },
  { id: 'b5pkw', file: 'poker_back_frame_5_pkw.png' },
  { id: 'b6pkw', file: 'poker_back_frame_6_pkw.png' },
  { id: 'b1', file: 'poker_back_frame_1.png' },
  { id: 'b2', file: 'poker_back_frame_2.png' },
  { id: 'b3', file: 'poker_back_frame_3.png' },
  { id: 'b4', file: 'poker_back_frame_4.png' },
  { id: 'b5', file: 'poker_back_frame_5.png' },
  { id: 'b6', file: 'poker_back_frame_6.png' },
]

export const DEFAULT_FACE = 'color4' // 默认 4 色（cards_pkw）
export const DEFAULT_BACK = 'b1pkw' // 默认蓝底黑桃（与 4 色搭）

// 牌值 → sheet 网格序号：joker 偏移 + 花色段(♦♣♥♠)*13 + 点数位(2..10,J,Q,K,A)。
// sheet 段顺序 = ♦♣♥♠；牌值 suit 1=♦ 2=♣ 3=♥ 4=♠（与 serverCardToClient/Unity 一致）→ 段位 = suit-1。
const SUIT_POS = { 1: 0, 2: 1, 3: 2, 4: 3 } // ♦→0 ♣→1 ♥→2 ♠→3
export function faceGridIndex(value, joker) {
  const suit = Math.floor(value / 100)
  const rank = value % 100
  const rankPos = rank === 1 ? 12 : rank - 2 // A 排最后
  return joker + (SUIT_POS[suit] ?? 0) * 13 + rankPos
}
