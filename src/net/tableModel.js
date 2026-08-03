// 把 cx-dzpk 进房快照(ENTER_ROOM_RES)/牌局推送 映射成牌桌视图模型,供 TableView/HUD 渲染。
// 纯函数,无副作用,便于单测(见 tableModel.test.mjs)。
//
// 模型形状与老德州版完全一致(seats[].status 语义/board 存 0-51 字节等),
//   Pixi 渲染层(useSeatRotation.applyModelToSeats / driveFromModel)零改动复用。
// 事件形状由 session.js 适配层从后端 JSON 转换(recvStartInfor/recvAction/recvCards/recvWinner...)。

// 「等待类」座位状态(沿用老语义):
//   8 = 已带入、等下一手开始;18 = 占座(坐下未带入/打光,显示"等待"不显示身家)。
export const WAITING_STATUS = new Set([8, 15, 18])
const isWaitingStatus = (v) => WAITING_STATUS.has(v)

// ---------------- 牌值转换 ----------------
// 后端牌字符串 "AS"(黑桃A) / "TD"(方块10):rank A K Q J T 9..2 + suit D方块 C草花 H红桃 S黑桃。
// 0-51 字节编码与老德州一致:floor(id/13)=花色(0♦ 1♣ 2♥ 3♠),id%13: 0→2 … 11→K 12→A。
//   (后端 Card.id = (suit-1)*13 + (rank-2),suit 1♦2♣3♥4♠、rank 2-14,编码完全相同。)
const RANK_OF = { A: 14, K: 13, Q: 12, J: 11, T: 10 }
const SUIT_OF = { D: 1, C: 2, H: 3, S: 4 }

/** "AS" → 0-51 字节(模型 board/手牌统一存字节,渲染前经 serverCardToClient)。无效 → -1 */
export function cardStrToId(code) {
  if (!code || code.length < 2) return -1
  const rank = RANK_OF[code[0]] ?? (code.charCodeAt(0) - 48)
  const suit = SUIT_OF[code[1]]
  if (!suit || rank < 2 || rank > 14) return -1
  return (suit - 1) * 13 + (rank - 2)
}

// 0-51 字节 → 客户端牌值 suit(1♦2♣3♥4♠)*100 + rank(1=A..13=K)。无牌 → null。
export function serverCardToClient(card) {
  if (card == null || card < 0 || card > 51) return null
  const c = card | 0
  const suit = Math.floor(c / 13) + 1
  const within = c % 13
  const rank = within === 12 ? 1 : within + 2
  return suit * 100 + rank
}

/** 字节数组 → 客户端牌值数组(过滤无牌)。 */
export function mapBoard(cards) {
  return (cards || []).map(serverCardToClient).filter((v) => v != null)
}

// 调试:客户端牌值 → "♦J"
const SUIT_SYM = { 1: '♦', 2: '♣', 3: '♥', 4: '♠' }
const RANK_SYM = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' }
export function clientCardName(value) {
  if (value == null) return '?'
  const suit = Math.floor(value / 100)
  const rank = value % 100
  return (SUIT_SYM[suit] || '?') + (RANK_SYM[rank] || String(rank))
}

// 调试:字节 → "0xNN=♦J"
export function debugServerCard(card) {
  if (card == null || card < 0) return String(card)
  const v = serverCardToClient(card)
  const hex = '0x' + (card & 0xff).toString(16).padStart(2, '0').toUpperCase()
  return `${hex}=${v == null ? '非牌' : clientCardName(v)}`
}

// ---------------- 快照 → 模型 ----------------

/** 快照里的一个玩家 → 座位状态码(老语义) */
function statusOf(p) {
  if (p.awaitingBuyin) return 18
  if (p.inHand && p.folded) return 6
  if (p.inHand && p.allIn) return 4
  if (p.inHand) return 0
  return p.stack > 0 ? 8 : 18 // 未在局:已带入=等下一手(8),没带入=占座(18)
}

/**
 * 进房快照(cx-dzpk ENTER_ROOM_RES/SNAPSHOT_RES data) → 牌桌模型。
 * session.spectateFlow 已把 myUserId 注入 snap。
 */
export function mapSnapshot(snap) {
  const me = snap.myUserId
  const seatCount = snap.maxPlayers || 9
  const bb = snap.bb || 0
  const byName = ['PREFLOP', 'FLOP', 'TURN', 'RIVER', 'SHOWDOWN', 'SETTLING']
  const inGame = byName.includes(snap.stage)

  const seats = []
  for (let i = 0; i < seatCount; i++) {
    seats.push({
      seat: i, occupied: false, userId: null, nick: '', headPic: '', chips: 0,
      status: -1, bet: 0, sex: 0, isHero: false, canPlay: false, holeCards: null,
      folded: false, allin: false, offline: false, sittingOut: false, graceDeadline: 0,
    })
  }
  let mySeatID = -1
  for (const p of snap.seats || []) {
    const i = p.seat
    if (i == null || i < 0 || i >= seatCount) continue
    const isHero = me != null && p.userId === me
    if (isHero) mySeatID = i
    const cards = (p.cards || []).map(cardStrToId).filter((c) => c >= 0)
    seats[i] = {
      seat: i,
      occupied: true,
      userId: p.userId,
      nick: p.nickname || '',
      headPic: p.avatar || '',
      chips: p.stack ?? 0,
      status: statusOf(p),
      bet: Math.max(0, p.betThisRound ?? 0),
      sex: 0,
      isHero,
      canPlay: !!p.inHand,
      holeCards: isHero && cards.length === 2 ? cards.map(serverCardToClient) : null,
      folded: !!p.folded,
      allin: !!p.allIn,
      offline: !!p.offline,
      sittingOut: !!p.sittingOut,
      graceDeadline: p.graceDeadline || 0,
    }
  }

  const leftMs = snap.actionDeadline ? snap.actionDeadline - Date.now() : 0
  return {
    seatCount,
    seats,
    board: (snap.board || []).map(cardStrToId).filter((c) => c >= 0),
    pot: snap.pot ?? 0,
    pots: [],
    smallBlind: snap.sb ?? 0,
    bigBlind: bb,
    ante: 0,
    bankerIndex: snap.button ?? -1,
    bigIndex: -1,
    smallIndex: -1,
    operationID: inGame ? (snap.actingSeat ?? -1) : -1,
    operationRound: 0,
    mySeatID,
    gamestatus: inGame ? 1 : snap.stage === 'WAITING' ? -2 : -1,
    callAmount: snap.currentBet ?? 0,
    minAnteNum: (snap.currentBet ?? 0) + bb,
    leftOperateTime: Math.max(0, Math.round(leftMs / 1000)),
    opTime: 0,
    roomOwner: 0,
    roomMode: 0,
    canRaise: 1,
    // 带入滑条(整数倍率 × 大盲):后端 minBuyin=40BB / maxBuyin=400BB
    currentMinRate: bb > 0 ? Math.round((snap.minBuyin ?? bb * 40) / bb) : 40,
    currentMaxRate: bb > 0 ? Math.round((snap.maxBuyin ?? bb * 400) / bb) : 400,
    // cx-dzpk 附加(HUD 用)
    roomName: snap.name || '',
    settleTimeMins: snap.settleTimeMins ?? 0,
    rakePercent: snap.rakePercent ?? 0,
    handNo: snap.handNo ?? 0,
    creatorUserId: snap.creatorUserId ?? 0,
    clubId: snap.clubId ?? 0,
  }
}

// ---------------- 事件 → 模型(返回新引用,便于 Vue 响应式) ----------------

/**
 * @param {object} m mapSnapshot 的结果
 * @param {string} type 适配层事件名
 * @param {object} d 事件数据
 */
export function applyEvent(m, type, d) {
  const next = { ...m, seats: m.seats.map((s) => ({ ...s })) }
  const seat = (i) => next.seats[i]
  const seatByUid = (uid) => next.seats.find((s) => s.occupied && s.userId === uid)
  switch (type) {
    case 'recvStartInfor': {
      // 新一手:设庄/盲位、盲注;清上一手状态、清公共牌。首操作位由 recvTurn 设置。
      next.bankerIndex = d.bankerID ?? next.bankerIndex
      next.bigIndex = d.bigSeatID ?? next.bigIndex
      next.smallIndex = d.smallSeatID ?? next.smallIndex
      next.operationID = -1
      next.smallBlind = d.smallChip ?? next.smallBlind
      next.bigBlind = d.bigChip ?? next.bigBlind
      next.minAnteNum = d.minAnteNum ?? next.minAnteNum
      next.callAmount = d.callAmount ?? 0
      next.board = []
      next.pots = []
      next.pot = 0
      next.gamestatus = 1
      next.handNo = d.handNo ?? next.handNo
      const ca = d.chipsArray || []
      const ba = d.betArray || []
      const first = d.firstCardArray || []
      const second = d.secondCardArray || []
      const canPlay = d.canPlayStatus || []
      next.seats.forEach((s, i) => {
        const playing = canPlay[i] === 1
        const keepWaiting = isWaitingStatus(s.status) && !playing
        s.bet = playing ? (ba[i] ?? 0) : 0
        s.folded = false; s.allin = false; s.isWinner = false; s.winAmount = 0
        s.canPlay = !!(s.occupied && playing)
        if (!keepWaiting) s.status = 0
        if (s.occupied && ca[i] != null && ca[i] >= 0) s.chips = ca[i]
        if (s.isHero && playing) {
          const c1 = serverCardToClient(first[i])
          const c2 = serverCardToClient(second[i])
          s.holeCards = c1 != null && c2 != null ? [c1, c2] : null
        } else {
          s.holeCards = null
        }
      })
      break
    }
    case 'recvTurn': {
      // 轮到某座行动:开表 + 刷跟注/最小加注(callAmount = 房间级"本轮最高注")
      next.operationID = d.seat ?? -1
      next.opTime = d.opTime || next.opTime
      next.leftOperateTime = d.leftSecs ?? d.opTime ?? 0
      const p = d.seat != null ? seat(d.seat) : null
      next.callAmount = (d.toCall ?? 0) + ((p && p.bet) || 0)
      if (d.minRaiseTo != null) next.minAnteNum = d.minRaiseTo
      break
    }
    case 'recvAction': {
      // 某座位行动:动作标记 + 权威 stack/bet 刷新 + 底池
      const i = d.seatID
      if (seat(i)) {
        const s = seat(i)
        s.status = d.action // 1下注 2跟 3加 4全下 5过牌 6弃
        if (d.action === 6) s.folded = true
        if (d.action === 4) s.allin = true
        if (d.betAbs != null) s.bet = d.betAbs
        else if (d.anteNumber > 0) s.bet = (s.bet || 0) + d.anteNumber
        if (d.stackAbs != null) s.chips = d.stackAbs
        else if (d.anteNumber > 0) s.chips = Math.max(0, (s.chips || 0) - d.anteNumber)
      }
      next.callAmount = d.callAmount ?? next.callAmount
      if (d.potNumber != null) next.pot = d.potNumber
      break
    }
    case 'recvCards': {
      // 新一街公共牌:去重追加(适配层给的是累计全板)
      if (Array.isArray(d.systemIDArray)) {
        const cur = next.board || []
        const add = d.systemIDArray.filter((c) => c >= 0 && !cur.includes(c))
        next.board = [...cur, ...add]
      }
      if (d.potNumber != null) next.pot = d.potNumber
      next.callAmount = 0
      // 新一街:清各座本轮下注 + 动作标记(弃牌/全下/等待类保留)
      next.seats.forEach((s) => {
        s.bet = 0
        if (!s.folded && !s.allin && !isWaitingStatus(s.status)) s.status = 0
      })
      break
    }
    case 'recvWinner': {
      // 一手结算:刷最终筹码 + 标记赢家 + 摊牌亮底牌
      const ids = d.allplayerID || []
      const finalChips = d.allPlayerchip || []
      const first = d.firstCardArray || []
      const second = d.secondCardArray || []
      const cardTypes = d.cardTypesArray || []
      const winnerSeats = new Set(d.seatIDArray || [])
      const winAmtBySeat = {}
      ;(d.seatIDArray || []).forEach((s, k) => { winAmtBySeat[s] = (d.winChipsArray || [])[k] ?? 0 })
      next.seats.forEach((s, i) => {
        if (!s.occupied) { s.isWinner = false; s.holeCards = null; return }
        const idx = ids.indexOf(s.userId)
        if (idx >= 0) {
          if (finalChips[idx] != null) s.chips = finalChips[idx]
          const c1 = serverCardToClient(first[idx])
          const c2 = serverCardToClient(second[idx])
          s.holeCards = c1 != null && c2 != null ? [c1, c2] : null
          s.cardType = cardTypes[idx] ?? null
        } else {
          s.holeCards = null
        }
        s.isWinner = winnerSeats.has(i)
        s.winAmount = winnerSeats.has(i) ? winAmtBySeat[i] : 0
        s.bet = 0
        if (!s.folded && !isWaitingStatus(s.status)) s.status = 0
      })
      next.gamestatus = -1
      next.operationID = -1 // 结算:无人操作,停所有倒计时
      break
    }
    case 'recvSeatDown': {
      const i = d.seatID
      if (seat(i)) {
        const prev = seat(i)
        const isSelf = !!(prev.isHero || next.mySeatID === i || (prev.userId != null && prev.userId === d.userID))
        const chips = d.chips ?? 0
        let status = chips <= 0 ? 18 : 8 // 坐下未带入=占座(18);带着筹码=等下一手(8)
        if (isSelf && isWaitingStatus(prev.status)) status = prev.status
        Object.assign(seat(i), {
          occupied: true,
          userId: d.userID,
          nick: d.nick || prev.nick || '',
          headPic: d.headPic || prev.headPic || '',
          chips,
          sex: d.sex ?? 0,
          status,
          bet: 0,
          folded: false,
          allin: false,
          isHero: isSelf,
          canPlay: false,
          holeCards: null,
        })
        if (isSelf) next.mySeatID = i
      }
      break
    }
    case 'recvLeave': {
      const i = d.seatID
      if (seat(i)) {
        const wasHero = seat(i).isHero
        Object.assign(seat(i), {
          occupied: false, userId: null, nick: '', headPic: '', chips: 0, status: -1, bet: 0,
          isHero: false, holeCards: null, folded: false, allin: false, canPlay: false,
        })
        if (wasHero || next.mySeatID === i) next.mySeatID = -1
      }
      break
    }
    case 'recvBuyin': {
      // 带入生效:刷桌上筹码;占座(18) → 已带入等下一手(8)
      const s = seatByUid(d.userID)
      if (s) {
        if (d.applied && d.stackAbs != null) s.chips = d.stackAbs
        if (d.applied && s.status === 18) s.status = 8
      }
      break
    }
    case 'recvPeriodSettle': {
      // 周期结算/打光:桌面筹码已退回钱包,进补带入等待(占座 18,倒计时由面板显示)
      const s = seatByUid(d.userId)
      if (s) {
        s.chips = 0
        s.status = 18
        s.bet = 0
        s.canPlay = false
        s.holeCards = null
        s.folded = false
        s.allin = false
      }
      break
    }
    case 'recvReadyTime':
      next.gamestatus = 0
      next.operationID = -1
      break
    case 'recvSidePots': {
      next.pots = Array.isArray(d.pots) ? d.pots.filter((p) => p > 0) : []
      break
    }
    case 'recvGrace': {
      // 留座暂离状态机(对齐扯旋282):ON_LEAVE 进放假 / NONE 回座 / SEAT_LOCKED 已站起物理锁座
      const s = seatByUid(d.userId)
      if (s) {
        if (d.state === 'ON_LEAVE') {
          s.sittingOut = true
          s.graceDeadline = d.deadline || 0
        } else if (d.state === 'NONE') {
          s.sittingOut = false
          s.graceDeadline = 0
        }
        // SEAT_LOCKED:座位由随后的 recvLeave 清,不在这里动
      }
      break
    }
    case 'recvOffline': {
      const s = seatByUid(d.userId)
      if (s) s.offline = true
      break
    }
    case 'recvOnline': {
      const s = seatByUid(d.userId)
      if (s) s.offline = false
      break
    }
    case 'recvGift': {
      // 送礼扣桌面带入(costType=SCORE)时同步发送方筹码;其它扣费源桌面不变
      if (d.costType === 'SCORE') {
        const s = seatByUid(d.fromUserId)
        if (s && d.fromStack != null) s.chips = d.fromStack
      }
      break
    }
    case 'recvRoundFinish': {
      // 清台(人不够进 WAITING 后延时触发):清公共牌/底池/本轮下注/动作状态
      next.gamestatus = -2
      next.operationID = -1
      next.board = []
      next.pot = 0
      next.pots = []
      next.callAmount = 0
      next.seats.forEach((s) => {
        if (!s.occupied) return
        s.bet = 0
        s.canPlay = false
        s.holeCards = null
        s.isWinner = false
        if (!isWaitingStatus(s.status)) s.status = s.chips > 0 ? 8 : 18
      })
      break
    }
    default:
      break
  }
  return next
}
