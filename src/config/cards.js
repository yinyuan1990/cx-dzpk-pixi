// Card sprites (reverse-engineered). Back = textures/cardBack/ic_card_bg_0.
// Fronts = textures/cardsTP/cards1_img atlas, named {suit}{rank}: suit 1-4, rank 01-13.
export const CARD_BACK = '/assets/table/cards/card_back.png'

// Seat layout faithful to the WP runtime seat (seatNode.prefab + optUser.prefab +
// useInfo.js / handCards.js / otherHdCards.js). All offsets are design px from the
// seat node center; on screen dy>0 = DOWN, dy<0 = UP.
//
// Vertical order:
//   SELF (Hero):  nickname(top) -> avatar -> BIG hole cards -> card-type(高牌) -> stack
//   OTHER:        nickname(top) -> avatar(+ small face-down cards at bottom corner) -> stack
//
// Cards use DIFFERENT nodes per Cocos seat.dealCardWithAni:
//   self  -> optUser/handCards  : big cards centered below the avatar (handCards y -192)
//   others -> otherHdCards      : small face-down backs at the avatar's bottom corner
//                                 (node ±64,-42; bottom-LEFT for left seats, else bottom-RIGHT)

// holdem_player_pkw.prefab photo_sprite/photo_mask = 144 squircle (both self/other on table).
export const SELF_AVATAR = 144
export const OTHER_AVATAR = 144

// nickname above avatar (useInfo ndNameLayout.y: self +118 / other +104) -> screen up
export const NAME_DY = { self: -118, other: -104 }
// stack/score: other = sorce_bg (0,-109.5); self (playing) drops below the card-type
export const SCORE_DY = { self: 372, other: 110 }
// card-type label "高牌" (self only): handCards y -192 + cardType_bg -120 => -312 -> dy 312
export const CARD_TYPE_DY = 300

// SELF hole cards: handCards card0 (-63.5,0) / card1 (+63.5,0), 127x181, ~192 below center.
const SELF_CARDS = {
  size: { w: 124, h: 176 },
  anchor: { dx: 0, dy: 188 }, // deal converge point (handCards center)
  slots: [
    { dx: -62, dy: 188, rot: 0 },
    { dx: 62, dy: 188, rot: 0 },
  ],
}

// OTHER hole cards: otherHdCards node at (±64,-42); cards fan toward the avatar center.
//   他人盖住的两张牌背比自己手牌小很多（对齐真机小牌背）：用户要求再缩小一倍 → 25×36。
//   同步把两张牌的错峰间距 fan 减半，保持小牌背的叠放比例一致、不散开也不过度重叠。
function otherCards(side) {
  const left = side === 'left'
  const nx = left ? -64 : 64 // node x: bottom-left for left seats, bottom-right otherwise
  const fan = left ? 12 : -12 // 2nd card offset toward center（随牌大小同比例）
  return {
    size: { w: 33, h: 48 },
    anchor: { dx: nx, dy: 44 },
    slots: [
      { dx: nx, dy: 44, rot: left ? -7 : 7 },
      { dx: nx + fan, dy: 44, rot: left ? 4 : -4 },
    ],
  }
}

export const handLayout = (isSelf, side = 'bottom') => (isSelf ? SELF_CARDS : otherCards(side))

const SUITS = [1, 2, 3, 4]
const RANKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]

export const CARD_VALUES = SUITS.flatMap((s) => RANKS.map((r) => s * 100 + r))

export const frontSrc = (value) => `/assets/table/cards/front/${value}.png`

// deal a hand of `n` distinct face-up cards
export function dealHand(n = 2) {
  const pool = [...CARD_VALUES]
  const hand = []
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(Math.random() * pool.length)
    hand.push(pool.splice(idx, 1)[0])
  }
  return hand
}

// made-hand label for the 2 hole cards (preflop): pair vs high card (WPGame.cardType.*)
export function handTypeKey(cards) {
  if (!cards || cards.length < 2) return 'table.handHighCard'
  const r0 = cards[0].value % 100
  const r1 = cards[1].value % 100
  return r0 === r1 ? 'table.handPair' : 'table.handHighCard'
}
