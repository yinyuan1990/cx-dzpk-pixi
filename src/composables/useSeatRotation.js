import { ref, computed } from 'vue'
import { SEAT_POSITIONS, seatPositionsFor, toCx, toCy } from '../config/tableSeats'
import { randomAvatar } from '../config/defaultAvatars'
import { dealHand } from '../config/cards'
import { playSound } from '../utils/sound'

// 客户端牌值(suit*100+rank) → cards.js faceUp 卡片对象。用于自己入座后展示真手牌。
function heroCardObjs(holeCards) {
  if (!Array.isArray(holeCards) || holeCards.length < 2) return null
  return holeCards.map((v) => ({ value: v, faceUp: true, revealed: true }))
}

// A seated player. cards = 2 hole cards { value, faceUp, revealed }.
// isSelf (Hero, bottom seat) => face-up real fronts; others => face-down.
// revealed=false means the card is not shown yet (the deal layer flips it in).
// TableSeat renders cards as CHILDREN of the seat node, so they rotate for free.
let _mockPid = 1
function makePlayer({ isSelf = false, revealed = true } = {}) {
  const hand = isSelf
    ? dealHand(2).map((value) => ({ value, faceUp: true, revealed }))
    : [
        { value: 0, faceUp: false, revealed },
        { value: 0, faceUp: false, revealed },
      ]
  return {
    userId: _mockPid++, // 唯一 id：让 Pixi render 据此判断是否换了人（决定重建 or 原地更新）
    avatar: randomAvatar(),
    name: 'WPK' + Math.floor(1000 + Math.random() * 9000),
    // 身家保存为原始数值；显示由 formatKNotation 格式化（对齐 Holdem_PlayerInfo coinMode==2）。
    stack: Math.floor(50 + Math.random() * 450) * 100,
    isSelf,
    cards: hand,
    // bet: 0, timer: null, status: '' ... (future, no rotation change)
  }
}

// Sit-down rotation, faithful to gameUI.js `sitdownWithAni`.
// positions = SEAT_POSITIONS in ring order (index = slot, slot0 = bottom/Hero).
// Each seat NODE rides a slot; sitting rotates the whole ring one slot at a time
// (0.11s linear move, 0.15s between steps, nearest direction) until the clicked
// node reaches slot0 -- its avatar travels down with it.
const STEP_INTERVAL_MS = 150
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export function useSeatRotation() {
  // 座位坐标环 — 按房间人数切换(对齐 Unity SeatUIInfos 子集,见 tableSeats.js)。
  //   默认 9 人;进房快照后由 setSeatCount(model.seatCount) 重建。
  const positions = ref(SEAT_POSITIONS)
  const seatSlot = ref(SEAT_POSITIONS.map((_, i) => i)) // seatSlot[nodeId] = slot
  const players = ref(SEAT_POSITIONS.map(() => null)) // players[nodeId] = player | null
  const rotating = ref(false)
  const N = () => positions.value.length

  /** 按房间座位数重建座位环(2/6/9 人桌…)。人数没变则不动(保护进行中的旋转/座位状态)。 */
  function setSeatCount(n) {
    const count = Math.min(9, Math.max(2, n | 0 || 9))
    if (positions.value.length === count) return
    positions.value = seatPositionsFor(count)
    seatSlot.value = positions.value.map((_, i) => i)
    players.value = positions.value.map(() => null)
    rotating.value = false
  }

  // view model consumed by the template: one entry per seat NODE.
  // `side` lets the seat flip child layout per ring position (left/right/top/bottom)
  // -- mirrors Cocos updateLeftOrRightSeatRatio; pure layout, no rotation impact.
  function sideOfSlot(slot) {
    const x = positions.value[slot].x
    const y = positions.value[slot].y
    if (x < -1) return 'left'
    if (x > 1) return 'right'
    return y > 0 ? 'top' : 'bottom'
  }

  const seats = computed(() =>
    positions.value.map((s, nodeId) => {
      const slot = seatSlot.value[nodeId]
      const p = positions.value[slot]
      return {
        id: s.id,
        nodeId,
        cx: toCx(p.x),
        cy: toCy(p.y),
        side: sideOfSlot(slot),
        player: players.value[nodeId],
      }
    }),
  )

  const seatedCount = computed(() => players.value.filter(Boolean).length)

  // 核心旋转（复刻 gameUI.sitdownWithAni）：整环逐格转动（每步 0.11s tween + 0.15s 间隔，最近方向），
  //   直到 nodeId 对应座位转到 slot0（屏幕最下）。观战自动旋转/点击坐下/mock 坐下共用。
  async function rotateSeatToBottom(nodeId) {
    const n = N()
    const slot = seatSlot.value[nodeId]
    if (slot === 0 || rotating.value) return
    const dir = slot <= n / 2 ? -1 : 1 // nearest: slot steps vs n-slot steps
    const steps = dir === -1 ? slot : n - slot
    rotating.value = true
    for (let s = 0; s < steps; s++) {
      seatSlot.value = seatSlot.value.map((x) => (x + dir + n) % n)
      await sleep(STEP_INTERVAL_MS)
    }
    rotating.value = false
  }

  // _sitDownFun: assemble self -> updateSeatInfo("selfSit") + playEffect("ruzuo") + rotate.
  // The player who sits is "self" (Hero) -> face-up hand shown instantly.
  async function sitDown(nodeId) {
    if (rotating.value || players.value[nodeId]) return
    players.value = players.value.map((p, i) =>
      i === nodeId ? makePlayer({ isSelf: true, revealed: true }) : p,
    )
    playSound('ruzuo')
    await rotateSeatToBottom(nodeId)
  }

  // Seat the first n players instantly at natural positions (no rotation), for the
  // deal test. seat0 (bottom) = self/Hero (face-up). cards revealed=false so the
  // deal layer flips them in as it deals.
  function seatPlayers(n, selfSeated = true) {
    seatSlot.value = positions.value.map((_, i) => i)
    players.value = positions.value.map((_, i) =>
      i < n ? makePlayer({ isSelf: selfSeated && i === 0, revealed: false }) : null,
    )
    rotating.value = false
  }

  // seat a single player at nodeId (no rotation), used by the countdown test so there is
  // an avatar to draw the timer ring around.
  function seatOne(nodeId, isSelf = false) {
    if (players.value[nodeId]) return
    players.value = players.value.map((p, i) =>
      i === nodeId ? makePlayer({ isSelf, revealed: true }) : p,
    )
  }

  // flip a dealt card into view (called by the deal animation on arrival)
  function revealSeatCard(nodeId, cardIdx) {
    const p = players.value[nodeId]
    if (p && p.cards[cardIdx]) p.cards[cardIdx].revealed = true
  }

  // 隐藏某座两张手牌（开局发牌前调用：先藏起来，让 playDeal 把牌"发"出来才显现，
  // 对齐 Unity 新一手 PlayDealAnimation 之前手牌不可见）。
  function hideSeatCards(nodeId) {
    const p = players.value[nodeId]
    if (p && Array.isArray(p.cards)) p.cards.forEach((c) => { if (c) c.revealed = false })
  }

  function reset() {
    seatSlot.value = positions.value.map((_, i) => i)
    players.value = positions.value.map(() => null)
    rotating.value = false
  }

  // 观战自动旋转（对齐 Cocos 观战进房）：把一个**空位**转到屏幕最下（有空位才转，选转动步数最少的）。
  //   进房快照后调用一次；满桌不转。
  function rotateEmptyToBottom() {
    if (rotating.value) return
    if (!players.value.some((p) => !p)) return // 满桌无空位
    if (!players.value[/* nodeId at slot0 */ seatSlot.value.indexOf(0)]) {
      // slot0（最下）已是空位 → 不用转。seatSlot[nodeId]=slot → 找 slot0 的 nodeId 用 indexOf。
      return
    }
    let best = -1, bestSteps = Infinity
    const n = N()
    for (let nodeId = 0; nodeId < n; nodeId++) {
      if (players.value[nodeId]) continue
      const slot = seatSlot.value[nodeId]
      const steps = Math.min(slot, n - slot)
      if (steps < bestSteps) { bestSteps = steps; best = nodeId }
    }
    if (best >= 0) rotateSeatToBottom(best)
  }

  // 观战驱动：用真实快照映射模型(net/tableModel.mapSnapshot)填充座位。
  // model.seats[i] = { occupied, nick, headPic, chips, status, bet, isHero, canPlay, folded, allin, sex, holeCards }
  //
  // ★关键：**原地更新**而非每个事件都整表重建（否则：①每次 randomAvatar 换头像；②每次新建 cards 对象
  //   会把 hideSeatCards/revealSeatCard/弃牌 设过的 revealed/牌面状态冲回默认 → 发牌/弃牌后下一条事件
  //   到达时手牌/小牌背「闪」一下）。同一 userId 留座时：复用旧 player 对象与其 cards（保留动画驱动的
  //   revealed 状态、头像不变），仅刷新会变的字段（stack/bet/folded/allin/status）。换人/空出才重建。
  // ★旋转保持：**不重置 seatSlot**（曾每次事件都重置 → 观战自动旋转/坐下旋转被瞬间打回原位 =「旋转被破坏」）。
  //   nodeId=模型座位号 恒定不变，旋转只改 nodeId→slot(屏幕位) 映射，两者互不干扰。
  const backCard = () => ({ value: 0, faceUp: false, revealed: true })
  // 等待类状态（8已带入等下一手/15留座/18占座）：本手不参与 → 座位不显示手牌（对齐 Cocos
  //   selfSit handCards=[] / Unity canPlayStatus==0 不发牌），头像中央由 Pixi 显示「等待」状态字。
  const isWaitingStatus = (v) => v === 8 || v === 15 || v === 18
  function applyModelToSeats(model) {
    if (!model || !Array.isArray(model.seats)) return
    if (model.seatCount) setSeatCount(model.seatCount)
    const prev = players.value
    players.value = positions.value.map((_, i) => {
      const s = model.seats[i]
      if (!s || !s.occupied) return null
      const old = prev[i]
      const uid = s.userId || 0
      const sameUser = !!(old && old.userId === uid)
      // 对齐 Unity：canPlayStatus==0 / GetEnptyHandCards → 不显示手牌与牌型（中途坐下未参与本手）。
      //   仅 canPlay===true 且非等待态才挂牌；否则空数组（无牌背、无「高牌/对子」牌型字）。
      const inHand = !!s.canPlay && !isWaitingStatus(s.status)
      let cards
      if (!inHand) {
        cards = []
      } else if (s.isHero) {
        cards = heroCardObjs(s.holeCards) || (sameUser && old.cards && old.cards.length ? old.cards : [backCard(), backCard()])
      } else if (sameUser && old.cards && old.cards.length && !old.isSelf) {
        cards = old.cards // 复用他人两张牌背对象，保留发牌/弃牌动画设过的 revealed 状态
      } else {
        cards = [backCard(), backCard()]
      }
      if (sameUser) {
        // 原地更新旧对象（保持引用/头像不变），供 Pixi render 走「同 userId → update」分支。
        old.userId = uid
        old.name = s.nick || ('WPK' + uid)
        old.stack = s.chips || 0
        old.isSelf = !!s.isHero
        old.cards = cards
        old.bet = s.bet || 0
        old.folded = !!s.folded
        old.allin = !!s.allin
        old.status = s.status
        old.canPlay = !!s.canPlay
        old.offline = !!s.offline
        old.sittingOut = !!s.sittingOut
        return old
      }
      return {
        userId: uid,
        avatar: randomAvatar(),
        name: s.nick || ('WPK' + uid),
        stack: s.chips || 0,
        isSelf: !!s.isHero,
        cards,
        bet: s.bet || 0,
        folded: !!s.folded,
        allin: !!s.allin,
        status: s.status,
        canPlay: !!s.canPlay,
        offline: !!s.offline,
        sittingOut: !!s.sittingOut,
      }
    })
    // 不动 rotating 标志：旋转状态由 rotateSeatToBottom 独占管理（原先每次事件置 false 会破坏进行中的旋转）。
  }

  return { seats, seatedCount, rotating, sitDown, seatPlayers, seatOne, revealSeatCard, hideSeatCards, reset, applyModelToSeats, rotateSeatToBottom, rotateEmptyToBottom, setSeatCount }
}
