// cx-dzpk 会话层:登录 / 大厅(房间列表/创建) / 进房观战 / 对局操作。
//
// 协议:GameMessage JSON {type, roomId, sequence, data},命令号 4xx(见 MSG)。
// 关键设计:把后端 JSON 推送**适配成老德州事件形状**(recvStartInfor/recvAction/recvCards/
//   recvWinner/recvSeatDown/recvLeave...),TableView 的动画链与 tableModel 事件语义得以完整复用。
import { DzpkSocket } from './socket.js'
import { cardStrToId } from './tableModel.js'

// 与后端 MsgType.java 一一对应
export const MSG = {
  LOGIN: 401, ROOM_LIST: 402, CREATE_ROOM: 403, ENTER_ROOM: 404, LEAVE_ROOM: 405,
  SIT_DOWN: 406, BUY_IN: 407, STAND_UP: 408, ACTION: 409, SNAPSHOT: 410,
  LOGIN_RES: 451, ROOM_LIST_RES: 452, CREATE_ROOM_RES: 453, ENTER_ROOM_RES: 454,
  PLAYER_ENTER: 455, PLAYER_SIT: 456, BUY_IN_RES: 457, HAND_START: 458,
  HOLE_CARDS: 459, TURN: 460, ACTION_BC: 461, DEAL: 462, SHOWDOWN: 463,
  SETTLE: 464, PLAYER_STAND: 465, SNAPSHOT_RES: 466, PLAYER_LEAVE: 467,
  PERIOD_SETTLE: 468, ROOM_STATE: 469, ERROR: 499,
}

let _sock = null
let _login = null       // { userId, nickname, balance }
let _cred = null        // { nickname, token } 重连重登录用

export function getLoginInfo() {
  return _login
}
export function getSocket() {
  return _sock
}

async function ensureSocket() {
  if (_sock && _sock.connected) return _sock
  if (_sock) _sock.close()
  _sock = new DzpkSocket({ autoReconnect: true, maxReconnect: 12 })
  await _sock.connect()
  return _sock
}

async function doLogin(sock) {
  const data = _cred.token ? { token: _cred.token, nickname: _cred.nickname } : { guest: _cred.nickname }
  const res = await sock.request(MSG.LOGIN, data, { resType: MSG.LOGIN_RES })
  _login = { userId: res.data.userId, nickname: res.data.nickname, balance: res.data.balance ?? 0 }
  return _login
}

/**
 * 登录(游客昵称 / 主服 JWT token)。返回 { userId, nickname, balance }。
 */
export async function loginFlow({ nickname, token } = {}) {
  _cred = { nickname: nickname || '玩家', token: token || '' }
  const sock = await ensureSocket()
  return doLogin(sock)
}

export function logout() {
  if (_sock) { _sock.close(); _sock = null }
  _login = null
  _cred = null
}

/** 房间列表。返回 [{roomId,name,sb,bb,maxPlayers,settleTimeMins,seated,stage}] */
export async function roomListFlow() {
  const sock = await ensureSocket()
  const res = await sock.request(MSG.ROOM_LIST, {}, { resType: MSG.ROOM_LIST_RES })
  return (res.data && res.data.rooms) || []
}

/** 创建房间。返回 {roomId,name,sb,bb,maxPlayers,settleTimeMins,rakePercent,minBuyin,maxBuyin} */
export async function createRoomFlow({ name, sb, bb, maxPlayers = 9, settleTimeMins = 30, rakePercent = 5 }) {
  const sock = await ensureSocket()
  const res = await sock.request(MSG.CREATE_ROOM,
    { name, sb, bb, maxPlayers, settleTimeMins, rakePercent },
    { resType: MSG.CREATE_ROOM_RES })
  return res.data
}

// ---------------------------------------------------------------
// 进房观战/对局:推送适配器(后端 JSON → 老德州事件形状)
// ---------------------------------------------------------------

let _room = null // { roomId, offs: [取消函数], timers: [], pendingStart, onEvent, onSnapshot }

/** 老德州动作码:1下注 2跟 3加 4全下 5过牌 6弃 7超时 */
const ACT_CODE = { bet: 1, call: 2, raise: 3, allin: 4, check: 5, fold: 6 }

function cardIds(list) {
  return (list || []).map(cardStrToId)
}

/** HAND_START(+HOLE_CARDS 合并) → recvStartInfor */
function buildStartInfor(d, holeCards, mySeat, maxPlayers) {
  const n = maxPlayers
  const chipsArray = new Array(n).fill(-1)
  const betArray = new Array(n).fill(0)
  const canPlayStatus = new Array(n).fill(0)
  const firstCardArray = new Array(n).fill(-1)
  const secondCardArray = new Array(n).fill(-1)
  for (const p of d.players || []) {
    const i = p.seat
    if (i == null || i < 0 || i >= n) continue
    chipsArray[i] = p.stack ?? -1
    betArray[i] = p.betThisRound ?? 0
    canPlayStatus[i] = p.inHand ? 1 : 0
  }
  if (holeCards && holeCards.length === 2 && mySeat >= 0 && mySeat < n) {
    firstCardArray[mySeat] = cardStrToId(holeCards[0])
    secondCardArray[mySeat] = cardStrToId(holeCards[1])
  }
  return {
    handNo: d.handNo,
    bankerID: d.button,
    smallSeatID: d.sbSeat,
    bigSeatID: d.bbSeat,
    smallChip: d.sb,
    bigChip: d.bb,
    operationID: -1,          // 首操作位由紧随其后的 TURN(recvTurn) 设置
    callAmount: d.bb,
    minAnteNum: d.bb * 2,     // 翻前最小加注到 2BB
    operationRound: 0,
    chipsArray,
    betArray,
    canPlayStatus,
    firstCardArray,
    secondCardArray,
  }
}

/** SETTLE → recvWinner(老结算事件形状) */
function buildWinner(d) {
  const results = d.results || []
  const allplayerID = []
  const allPlayerchip = []
  const firstCardArray = []
  const secondCardArray = []
  const cardTypesArray = []
  const seatByUid = {}
  for (const r of results) {
    allplayerID.push(r.userId)
    allPlayerchip.push(r.stack ?? 0)
    const cards = cardIds(r.cards)
    firstCardArray.push(cards.length === 2 ? cards[0] : -1)
    secondCardArray.push(cards.length === 2 ? cards[1] : -1)
    cardTypesArray.push(r.handType ?? 0)
    seatByUid[r.userId] = r.seat
  }
  // 赢家座位 + 赢得筹码
  const winBySeat = {}
  if (d.reason === 'fold') {
    const seat = seatByUid[d.winnerUserId]
    if (seat != null) winBySeat[seat] = d.pot ?? 0
  } else {
    for (const pot of d.pots || []) {
      const winners = pot.winners || []
      if (!winners.length) continue
      const share = Math.floor((pot.amount ?? 0) / winners.length)
      for (const uid of winners) {
        const seat = seatByUid[uid]
        if (seat != null) winBySeat[seat] = (winBySeat[seat] || 0) + share
      }
    }
  }
  const seatIDArray = Object.keys(winBySeat).map(Number)
  const winChipsArray = seatIDArray.map((s) => winBySeat[s])
  return { allplayerID, allPlayerchip, firstCardArray, secondCardArray, cardTypesArray, seatIDArray, winChipsArray, reason: d.reason }
}

function clearRoomAdapter() {
  if (!_room) return
  _room.offs.forEach((off) => off())
  _room.timers.forEach(clearTimeout)
  _room = null
}

/**
 * 进入房间并驱动牌桌(观战/对局共用,对齐老 spectateFlow 接口)。
 * @param {object} p { roomId, maxPlayers?, onSnapshot(snap), onEvent(type,data), onStatus(s) }
 */
export async function spectateFlow({ roomId, onSnapshot, onEvent, onStatus }) {
  const sock = await ensureSocket()
  if (!_login) throw new Error('请先登录')
  clearRoomAdapter()

  const room = { roomId, offs: [], timers: [], pendingStart: null, startTimer: null, mySeat: -1, maxPlayers: 9 }
  _room = room
  const me = _login.userId
  const emit = (type, data) => { try { onEvent && onEvent(type, data) } catch (e) { console.error('[session] onEvent 异常', type, e) } }
  const on = (type, fn) => room.offs.push(sock.on(type, (data, msg) => {
    if (msg.roomId != null && Number(msg.roomId) !== Number(roomId)) return
    fn(data, msg)
  }))

  // ---- 开局:HAND_START 与私发 HOLE_CARDS 合并成一条 recvStartInfor(手牌跟随发牌动画)----
  const flushStart = () => {
    if (!room.pendingStart) return
    const { d, hole } = room.pendingStart
    room.pendingStart = null
    if (room.startTimer) { clearTimeout(room.startTimer); room.startTimer = null }
    emit('recvStartInfor', buildStartInfor(d, hole, room.mySeat, room.maxPlayers))
  }
  on(MSG.HAND_START, (d) => {
    // 记录自己座位(HAND_START players 带全量在座)
    for (const p of d.players || []) if (p.userId === me) room.mySeat = p.seat
    room.pendingStart = { d, hole: null }
    room.startTimer = setTimeout(flushStart, 150) // 观战收不到 HOLE_CARDS,150ms 后直接开
    room.timers.push(room.startTimer)
  })
  on(MSG.HOLE_CARDS, (d) => {
    if (room.pendingStart) {
      room.pendingStart.hole = d.cards
      flushStart()
    }
  })

  // ---- 行动/换街/结算 ----
  on(MSG.TURN, (d) => emit('recvTurn', {
    seat: d.seat, userId: d.userId, toCall: d.toCall ?? 0,
    minRaiseTo: d.minRaiseTo ?? 0, opTime: d.timeoutSecs ?? 0,
    leftSecs: d.deadline ? Math.max(0, Math.round((d.deadline - Date.now()) / 1000)) : (d.timeoutSecs ?? 0),
  }))
  on(MSG.ACTION_BC, (d) => emit('recvAction', {
    seatID: d.seat,
    action: ACT_CODE[d.act] ?? 0,
    anteNumber: d.paid ?? 0,
    potNumber: d.pot,
    callAmount: d.currentBet,
    stackAbs: d.stack,
    betAbs: d.betThisRound,
    auto: !!d.auto,
  }))
  on(MSG.DEAL, (d) => emit('recvCards', {
    systemIDArray: cardIds(d.board),
    potNumber: d.pot,
    stage: d.stage,
  }))
  on(MSG.SETTLE, (d) => emit('recvWinner', buildWinner(d)))

  // ---- 座位变动 ----
  on(MSG.PLAYER_SIT, (d) => emit('recvSeatDown', {
    seatID: d.seat, userID: d.userId, nick: d.nickname || '', headPic: '', chips: d.stack ?? 0, sex: 0,
  }))
  on(MSG.PLAYER_STAND, (d) => emit('recvLeave', {
    seatID: d.seat, userID: d.userId, reason: d.reason, refund: d.refund, balance: d.balance,
  }))
  on(MSG.BUY_IN_RES, (d) => emit('recvBuyin', {
    userID: d.userId, amount: d.amount, applied: !!d.applied, stackAbs: d.stack, balance: d.balance,
  }))
  on(MSG.PERIOD_SETTLE, (d) => emit('recvPeriodSettle', d))

  // ---- 房态:WAITING(人不够) → 延时清台;FINISHED → 下一手 HAND_START 自会清 ----
  let waitingTimer = null
  on(MSG.ROOM_STATE, (d) => {
    if (d.stage === 'WAITING') {
      waitingTimer = setTimeout(() => emit('recvRoundFinish', {}), 2500)
      room.timers.push(waitingTimer)
    } else if (waitingTimer) {
      clearTimeout(waitingTimer)
      waitingTimer = null
    }
  })

  // ---- 错误推送(未被 observe 消费的) ----
  on(MSG.ERROR, (d) => emit('error', { msg: (d && d.msg) || '操作失败' }))

  // ---- 重连:重登录 + 重进房拉新快照整体重同步 ----
  sock.onReconnect = async () => {
    onStatus && onStatus('reconnected')
    try {
      await doLogin(sock)
      const res = await sock.request(MSG.ENTER_ROOM, {}, { roomId, resType: MSG.ENTER_ROOM_RES, timeoutMs: 5000 })
      const snap = res.data
      snap.myUserId = me
      room.maxPlayers = snap.maxPlayers || room.maxPlayers
      onSnapshot && onSnapshot(snap)
    } catch (e) {
      onStatus && onStatus('reconnect-failed:' + (e && e.message))
    }
  }
  sock.onClose = () => { onStatus && onStatus('disconnected') }

  // ---- 进房拿快照 ----
  const res = await sock.request(MSG.ENTER_ROOM, {}, { roomId, resType: MSG.ENTER_ROOM_RES })
  const snapshot = res.data
  snapshot.myUserId = me
  room.maxPlayers = snapshot.maxPlayers || 9
  const mySeatInfo = (snapshot.seats || []).find((s) => s.userId === me)
  room.mySeat = mySeatInfo ? mySeatInfo.seat : -1
  onSnapshot && onSnapshot(snapshot)
  return { sock, snapshot }
}

/** 离开房间(回大厅):发 LEAVE_ROOM + 撤适配器;连接保留给大厅复用。 */
export function leaveRoom() {
  if (_room && _sock && _sock.connected) {
    try { _sock.send(MSG.LEAVE_ROOM, {}, _room.roomId) } catch { /* noop */ }
  }
  if (_sock) _sock.onReconnect = null
  clearRoomAdapter()
}

// ---------------------------------------------------------------
// 对局操作。成功以广播回执确认(observe 不消费,推送仍走适配器刷模型)。
// ---------------------------------------------------------------

function observeResult(matchOk, timeoutMs = 8000) {
  // 等待:匹配的成功广播 or 本房间 ERROR。不消费消息(推送照常分发)。
  const sock = _sock
  return new Promise((resolve, reject) => {
    const offs = []
    const done = (fn, v) => { offs.forEach((o) => o()); clearTimeout(timer); fn(v) }
    const timer = setTimeout(() => done(reject, new Error('操作超时')), timeoutMs)
    offs.push(sock.on(MSG.ERROR, (d) => done(reject, new Error((d && d.msg) || '操作失败'))))
    offs.push(...matchOk((v) => done(resolve, v)))
  })
}

/** 坐下。返回 {status:0, stack} */
export async function sitDownSeat({ seatID, roomId }) {
  const sock = await ensureSocket()
  const me = _login.userId
  const p = observeResult((ok) => [
    sock.on(MSG.PLAYER_SIT, (d) => {
      if (d.userId === me && d.seat === seatID) ok({ status: 0, stack: d.stack ?? 0, minBuyin: d.minBuyin, maxBuyin: d.maxBuyin })
    }),
  ])
  sock.send(MSG.SIT_DOWN, { seat: seatID }, roomId)
  const r = await p
  if (_room) _room.mySeat = seatID
  return r
}

/** 带入。返回 {status:0, chips(桌上筹码), allChips(账户余额)} */
export async function addChips({ seatID, anteNumber, roomId }) {
  void seatID
  const sock = await ensureSocket()
  const me = _login.userId
  const p = observeResult((ok) => [
    sock.on(MSG.BUY_IN_RES, (d) => {
      if (d.userId === me) {
        if (_login) _login.balance = d.balance ?? _login.balance
        ok({ status: 0, chips: d.stack ?? 0, allChips: d.balance ?? 0, applied: !!d.applied })
      }
    }),
  ])
  sock.send(MSG.BUY_IN, { amount: anteNumber }, roomId)
  return p
}

/** 站起(留在房间观战)。返回 {status:0} */
export async function standUpSeat({ seatID, roomId }) {
  void seatID
  const sock = await ensureSocket()
  const me = _login.userId
  const p = observeResult((ok) => [
    sock.on(MSG.PLAYER_STAND, (d) => {
      if (d.userId === me) {
        if (_login) _login.balance = d.balance ?? _login.balance
        ok({ status: 0, refund: d.refund, balance: d.balance })
      }
    }),
  ])
  sock.send(MSG.STAND_UP, {}, roomId)
  const r = await p
  if (_room) _room.mySeat = -1
  return r
}

/** 离开房间(先站起结算再离开,由后端处理)。 */
export async function leaveRoomSeat({ seatID, roomId }) {
  void seatID
  const sock = await ensureSocket()
  sock.send(MSG.LEAVE_ROOM, {}, roomId)
  if (_room) _room.mySeat = -1
  return { status: 0 }
}

/**
 * 自己行动。action: 1下注 2跟 3加 4全下 5过牌 6弃(老动作码,TableView 原样传)。
 * 加注 amount = 本轮加注到的总额(raise-to);错误经 ERROR 推送 → onEvent('error')。
 */
export async function sendAction({ action, anteNumber = 0, roomId }) {
  const sock = await ensureSocket()
  const ACT = { 1: 'raise', 2: 'call', 3: 'raise', 4: 'allin', 5: 'check', 6: 'fold' }
  const act = ACT[action]
  if (!act) throw new Error('非法操作 ' + action)
  sock.send(MSG.ACTION, { act, amount: anteNumber }, roomId)
  return { status: 0 }
}
