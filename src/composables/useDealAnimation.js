import { ref } from 'vue'
import { toCy } from '../config/tableSeats'
import { handLayout } from '../config/cards'
import { playSound } from '../utils/sound'

// Deal animation, faithful to gameUI._showDealAnimation + handCards._showCardBackAnimation.
// Cards fly from the center logo (deal origin) to each seat's hand, staggered:
//   - players staggered by DEAL_INTERVAL
//   - a player's 2 cards staggered by DEAL_CARD_INTERVAL
//   - each card flies for DEAL_CARD seconds with an ease-out (easeSineOut)
//   - "dealcards2" sound per card
// WPActionTime (WPGameModel.js): dealCard .34, dealCardInterval .06, dealInterval .07
const DEAL_CARD = 0.34
const DEAL_CARD_INTERVAL = 0.06
const DEAL_INTERVAL = 0.07

// Deal origin = the table-center deal point (Cocos ndLogo). In gameTable.fire that is
// node "center" (0,50), a child of logoNode (0,300) -> scene (0, 350): the middle of the
// WePoker watermark, i.e. the table center. gameUI._showDealAnimation flies every card
// from ndLogo.convertToWorldSpaceAR(0,0), so both self & others fan out from this point.
const ORIGIN_CX = 0
const ORIGIN_CY = toCy(350)
const CARDS_PER_PLAYER = 2

export function useDealAnimation() {
  const cards = ref([]) // { key, cx, cy }
  const dealing = ref(false)
  let timers = []
  let seq = 0

  function clear() {
    timers.forEach(clearTimeout)
    timers = []
    cards.value = []
    dealing.value = false
  }

  // occupiedSeats: [{ cx, cy, nodeId, isSelf }]; onReveal(nodeId, cardIdx) flips the seat card in.
  // Cocos: card-back FLASH flies from center (above self) to the seat's hand anchor and fades,
  // then at dealCard/2 the real hole card materializes at the seat (self big & flips, others small).
  function deal(occupiedSeats, onReveal) {
    clear()
    if (!occupiedSeats.length) return
    dealing.value = true
    let lastEnd = 0

    // gameUI._showDealAnimation: every player is scheduled UP FRONT (not awaited) so the
    // card-backs are all in flight at once -- a parallel burst from the center, only
    // staggered by dealInterval (player) + dealCardInterval (the 2 cards). The motion is
    // a pure CSS @keyframes transform (mounts already playing) so it can't be skipped by a
    // flaky transition trigger; multiple cards animate together on the GPU.
    occupiedSeats.forEach((seat, p) => {
      const lay = handLayout(seat.isSelf, seat.side)
      for (let c = 0; c < CARDS_PER_PLAYER; c++) {
        const startDelay = (p * DEAL_INTERVAL + c * DEAL_CARD_INTERVAL) * 1000
        // both card-backs converge to the seat's hand anchor (Cocos moveTo (0,0))
        const target = { cx: seat.cx + lay.anchor.dx, cy: seat.cy + lay.anchor.dy }
        const w = lay.size.w
        const h = lay.size.h
        lastEnd = Math.max(lastEnd, startDelay + DEAL_CARD * 1000)

        timers.push(
          setTimeout(() => {
            const key = ++seq
            // card rests at the target; the CSS fly animation tweens its transform from
            // the center origin (ox,oy) to the target over DEAL_CARD.
            cards.value.push({ key, cx: target.cx, cy: target.cy, ox: ORIGIN_CX, oy: ORIGIN_CY, w, h })
            playSound('dealcards2')
            timers.push(
              setTimeout(() => {
                cards.value = cards.value.filter((k) => k.key !== key)
              }, DEAL_CARD * 1000),
            )
          }, startDelay),
        )

        timers.push(
          setTimeout(
            () => onReveal && onReveal(seat.nodeId, c),
            startDelay + (DEAL_CARD / 2) * 1000,
          ),
        )
      }
    })

    timers.push(setTimeout(() => (dealing.value = false), lastEnd + 60))
  }

  return { cards, dealing, deal, clear, DEAL_CARD }
}
