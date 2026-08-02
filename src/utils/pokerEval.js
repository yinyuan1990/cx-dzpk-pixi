// 7 张取最佳 5 张评估器（摊牌亮牌 #13 用）。
// 牌值编码与全工程一致：value = suit*100 + rank（suit 1..4，rank 1..13，1=A）。
// 评估时 A 记为 14（高），A-2-3-4-5 顺子里再回落为 1。
//
// evaluateBest(seven) -> { cat, score, best5 }
//   cat   : 牌型等级 0..8（高牌→同花顺）
//   score : 可比较数组 [cat, ...踢脚]，逐项比大小定胜负
//   best5 : 组成最佳牌型的 5 张原始 value（用于摊牌时高亮：在 best5 内的手牌不盖暗罩）
//
// pickWinners(hands) -> 赢家下标数组（并列全返回），hands[i] = { score }

export const HAND_CAT = {
  HIGH_CARD: 0,
  PAIR: 1,
  TWO_PAIR: 2,
  THREE_OF_A_KIND: 3,
  STRAIGHT: 4,
  FLUSH: 5,
  FULL_HOUSE: 6,
  FOUR_OF_A_KIND: 7,
  STRAIGHT_FLUSH: 8,
}

// 牌型 -> i18n key（与 cocos WPGame.cardType.* 对齐；高牌起步）
export const CAT_I18N = [
  'table.ct.highCard',
  'table.ct.pair',
  'table.ct.twoPair',
  'table.ct.threeKind',
  'table.ct.straight',
  'table.ct.flush',
  'table.ct.fullHouse',
  'table.ct.fourKind',
  'table.ct.straightFlush',
]

const suitOf = (v) => Math.floor(v / 100)
const rankOf = (v) => v % 100
const aceHigh = (r) => (r === 1 ? 14 : r)

// 比较两个 score 数组（字典序），返回 >0 表示 a 大。
export function cmpScore(a, b) {
  const n = Math.max(a.length, b.length)
  for (let i = 0; i < n; i++) {
    const d = (a[i] || 0) - (b[i] || 0)
    if (d) return d
  }
  return 0
}

// 评估恰好 5 张牌，返回 { cat, score, cards } —— cards 与传入 5 张相同（顺序无关）。
function evaluate5(five) {
  const ranks = five.map((v) => aceHigh(rankOf(v))).sort((a, b) => b - a)
  const suited = five.every((v) => suitOf(v) === suitOf(five[0]))

  // 顺子判定（含 A-5 轮子）。返回顺子最高牌点（轮子=5），否则 0。
  const uniq = [...new Set(ranks)].sort((a, b) => b - a)
  let straightHigh = 0
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0]
    else if (uniq[0] === 14 && uniq[1] === 5 && uniq[4] === 2) straightHigh = 5 // A2345 轮子
  }

  // 各点数计数 -> [ [count, rank], ... ] 按 (count desc, rank desc) 排序
  const cnt = new Map()
  for (const r of ranks) cnt.set(r, (cnt.get(r) || 0) + 1)
  const groups = [...cnt.entries()]
    .map(([r, c]) => [c, r])
    .sort((a, b) => b[0] - a[0] || b[1] - a[1])
  const counts = groups.map((g) => g[0])
  const byCount = groups.map((g) => g[1])

  let cat
  if (straightHigh && suited) cat = HAND_CAT.STRAIGHT_FLUSH
  else if (counts[0] === 4) cat = HAND_CAT.FOUR_OF_A_KIND
  else if (counts[0] === 3 && counts[1] === 2) cat = HAND_CAT.FULL_HOUSE
  else if (suited) cat = HAND_CAT.FLUSH
  else if (straightHigh) cat = HAND_CAT.STRAIGHT
  else if (counts[0] === 3) cat = HAND_CAT.THREE_OF_A_KIND
  else if (counts[0] === 2 && counts[1] === 2) cat = HAND_CAT.TWO_PAIR
  else if (counts[0] === 2) cat = HAND_CAT.PAIR
  else cat = HAND_CAT.HIGH_CARD

  // 踢脚：顺子/同花顺按顺子最高牌；其余按 (成组点数, 散牌点数 desc)
  let tiebreak
  if (cat === HAND_CAT.STRAIGHT || cat === HAND_CAT.STRAIGHT_FLUSH) tiebreak = [straightHigh]
  else tiebreak = byCount

  return { cat, score: [cat, ...tiebreak], cards: five.slice() }
}

// 从 ≥5 张里枚举 C(n,5) 找出最佳，返回 { cat, score, best5 }
export function evaluateBest(cards) {
  const n = cards.length
  if (n < 5) {
    const r = evaluate5(cards.concat(cards).slice(0, 5))
    return { cat: r.cat, score: r.score, best5: cards.slice() }
  }
  let best = null
  // 经典 5-of-n 组合枚举
  for (let a = 0; a < n - 4; a++)
    for (let b = a + 1; b < n - 3; b++)
      for (let c = b + 1; c < n - 2; c++)
        for (let d = c + 1; d < n - 1; d++)
          for (let e = d + 1; e < n; e++) {
            const r = evaluate5([cards[a], cards[b], cards[c], cards[d], cards[e]])
            if (!best || cmpScore(r.score, best.score) > 0) best = r
          }
  return { cat: best.cat, score: best.score, best5: best.cards }
}

// hands: [{ score }] -> 赢家下标（并列全返回）
export function pickWinners(hands) {
  let bestIdx = []
  let bestScore = null
  hands.forEach((h, i) => {
    if (!bestScore || cmpScore(h.score, bestScore) > 0) {
      bestScore = h.score
      bestIdx = [i]
    } else if (cmpScore(h.score, bestScore) === 0) {
      bestIdx.push(i)
    }
  })
  return bestIdx
}
