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
  MY_RECORDS: 411, INSURANCE_BUY: 412,
  SEAT_RESERVE_LEAVE: 413, SEAT_RESERVE_RESUME: 414, REALTIME_STATS: 415, DISMISS_ROOM: 416,
  CLUB_CREATE: 420, CLUB_LIST: 421, CLUB_APPLY: 422, CLUB_APPLY_LIST: 423,
  CLUB_REVIEW: 424, CLUB_MEMBERS: 425, CLUB_SET_ROLE: 426, CLUB_KICK: 427,
  CLUB_QUIT: 428, CLUB_DISSOLVE: 429,
  CLUB_SCORE_OP: 430, CLUB_SCORE_LOGS: 431,
  LOGIN_RES: 451, ROOM_LIST_RES: 452, CREATE_ROOM_RES: 453, ENTER_ROOM_RES: 454,
  PLAYER_ENTER: 455, PLAYER_SIT: 456, BUY_IN_RES: 457, HAND_START: 458,
  HOLE_CARDS: 459, TURN: 460, ACTION_BC: 461, DEAL: 462, SHOWDOWN: 463,
  SETTLE: 464, PLAYER_STAND: 465, SNAPSHOT_RES: 466, PLAYER_LEAVE: 467,
  PERIOD_SETTLE: 468, ROOM_STATE: 469, STAND_UP_RES: 470, MY_RECORDS_RES: 471,
  INSURANCE_OFFER: 472, INSURANCE_RESULT: 473,
  SEAT_RESERVE_GRACE: 474, REALTIME_STATS_RES: 475, RUN_AWAY_FINE: 476,
  PLAYER_OFFLINE: 477, PLAYER_ONLINE: 478, ROOM_DISMISSED: 479,
  CLUB_CREATE_RES: 480, CLUB_LIST_RES: 481, CLUB_APPLY_RES: 482, CLUB_APPLY_LIST_RES: 483,
  CLUB_REVIEW_RES: 484, CLUB_MEMBERS_RES: 485, CLUB_OP_RES: 486, CLUB_NOTIFY: 487,
  DIAMOND_WARNING: 488, CLUB_SCORE_LOGS_RES: 489,
  ERROR: 499,
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
  _login = {
    userId: res.data.userId,
    nickname: res.data.nickname,
    balance: res.data.balance ?? 0,
    diamond: res.data.diamond ?? 0, // 平台公用钻石(主服账号才有,游客恒 0)
  }
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

/** 房间列表(clubId=0 公开大厅,>0 该俱乐部的房间)。返回 [{roomId,name,clubId,sb,bb,...}] */
export async function roomListFlow(clubId = 0) {
  const sock = await ensureSocket()
  const res = await sock.request(MSG.ROOM_LIST, { clubId }, { resType: MSG.ROOM_LIST_RES })
  return (res.data && res.data.rooms) || []
}

/**
 * 创建房间(clubId>0 = 俱乐部房,需群主/管理员)。返回 {roomId,name,sb,bb,...}
 * params 全量透传后端 RoomRules.parse(对齐老德州建房参数):
 *   sb / maxPlayers / settleTimeMins / rakePercent / inChip / inMinRate / inMaxRate /
 *   opTimeSec / ante / straddleOn / insuranceOn / muckOn / vpOn / autoStartNum /
 *   gameMinTime / aheadLeaveOn / ipLimitOn / gpsLimitOn / jackpotOn / delayOn / clubId
 */
export async function createRoomFlow(params = {}) {
  const sock = await ensureSocket()
  const res = await sock.request(MSG.CREATE_ROOM, { clubId: 0, ...params },
    { resType: MSG.CREATE_ROOM_RES })
  return res.data
}

/** 买保险(领先方,amount=0 放弃) */
export async function insuranceBuy(roomId, amount) {
  const sock = await ensureSocket()
  sock.send(MSG.INSURANCE_BUY, { amount }, roomId)
}

// ---------------------------------------------------------------
// 俱乐部(德州独立俱乐部,规则对齐扯旋)
// ---------------------------------------------------------------

/** 创建俱乐部。返回 {clubId,clubNo,name,myInviteCode,diamondCost,diamond} */
export async function clubCreateFlow({ name, notice = '' }) {
  const sock = await ensureSocket()
  const res = await sock.request(MSG.CLUB_CREATE, { name, notice }, { resType: MSG.CLUB_CREATE_RES })
  if (_login && res.data && res.data.diamond != null) _login.diamond = res.data.diamond
  return res.data
}

/** 我的俱乐部列表。[{clubId,clubNo,name,notice,ownerUserId,myRole,myInviteCode,myPartnerRate,memberCount,pendingCount}] */
export async function clubListFlow() {
  const sock = await ensureSocket()
  const res = await sock.request(MSG.CLUB_LIST, {}, { resType: MSG.CLUB_LIST_RES })
  return (res.data && res.data.clubs) || []
}

/** 申请加入(code=俱乐部号或邀请码)。返回 {clubId,clubName,codeType} */
export async function clubApplyFlow(code) {
  const sock = await ensureSocket()
  const res = await sock.request(MSG.CLUB_APPLY, { code: Number(code) }, { resType: MSG.CLUB_APPLY_RES })
  return res.data
}

/** 待审批列表(群主/管理员)。[{requestId,userId,nickname,codeType,inviterUserId,time}] */
export async function clubApplyListFlow(clubId) {
  const sock = await ensureSocket()
  const res = await sock.request(MSG.CLUB_APPLY_LIST, { clubId }, { resType: MSG.CLUB_APPLY_LIST_RES })
  return (res.data && res.data.requests) || []
}

/** 审批入会申请 */
export async function clubReviewFlow({ clubId, requestId, approve }) {
  const sock = await ensureSocket()
  const res = await sock.request(MSG.CLUB_REVIEW, { clubId, requestId, approve: !!approve },
    { resType: MSG.CLUB_REVIEW_RES })
  return res.data
}

/** 成员列表。[{userId,nickname,role,parentUserId,level,inviteCode,partnerRate}] */
export async function clubMembersFlow(clubId) {
  const sock = await ensureSocket()
  const res = await sock.request(MSG.CLUB_MEMBERS, { clubId }, { resType: MSG.CLUB_MEMBERS_RES })
  return (res.data && res.data.members) || []
}

/** 设置角色:role 1成员 2管理员 4合伙人(带 partnerRate) */
export async function clubSetRoleFlow({ clubId, userId, role, partnerRate = 0 }) {
  const sock = await ensureSocket()
  const res = await sock.request(MSG.CLUB_SET_ROLE, { clubId, userId, role, partnerRate },
    { resType: MSG.CLUB_OP_RES })
  return res.data
}

/** 踢出成员 */
export async function clubKickFlow({ clubId, userId }) {
  const sock = await ensureSocket()
  const res = await sock.request(MSG.CLUB_KICK, { clubId, userId }, { resType: MSG.CLUB_OP_RES })
  return res.data
}

/** 退出俱乐部 */
export async function clubQuitFlow(clubId) {
  const sock = await ensureSocket()
  const res = await sock.request(MSG.CLUB_QUIT, { clubId }, { resType: MSG.CLUB_OP_RES })
  return res.data
}

/** 解散俱乐部(仅群主) */
export async function clubDissolveFlow(clubId) {
  const sock = await ensureSocket()
  const res = await sock.request(MSG.CLUB_DISSOLVE, { clubId }, { resType: MSG.CLUB_OP_RES })
  return res.data
}

/** 订阅审批结果推送({clubId,clubName,approve})。返回取消函数。 */
export function onClubNotify(fn) {
  if (!_sock) return () => {}
  return _sock.on(MSG.CLUB_NOTIFY, (d) => { try { fn(d) } catch { /* noop */ } })
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

  // ---- 保险(河牌保险,两人全下跑马):报价/决定/结算透传视图层 ----
  on(MSG.INSURANCE_OFFER, (d) => emit('recvInsuranceOffer', d))
  on(MSG.INSURANCE_RESULT, (d) => emit('recvInsuranceResult', d))

  // ---- 座位变动 ----
  on(MSG.PLAYER_SIT, (d) => emit('recvSeatDown', {
    seatID: d.seat, userID: d.userId, nick: d.nickname || '', headPic: '', chips: d.stack ?? 0, sex: 0,
  }))
  on(MSG.PLAYER_STAND, (d) => {
    // 自己真正站起(含 pending 局末生效):同步钱包余额 + 清本地座位
    if (d.userId === me) {
      if (_login && d.balance != null) _login.balance = d.balance
      if (_room) _room.mySeat = -1
    }
    emit('recvLeave', {
      seatID: d.seat, userID: d.userId, reason: d.reason, refund: d.refund, balance: d.balance,
      profit: d.profit, rake: d.rake, bringIn: d.bringIn, fine: d.fine || 0,
    })
  })
  on(MSG.BUY_IN_RES, (d) => emit('recvBuyin', {
    userID: d.userId, amount: d.amount, applied: !!d.applied, stackAbs: d.stack, balance: d.balance,
  }))
  on(MSG.PERIOD_SETTLE, (d) => emit('recvPeriodSettle', d))

  // ---- 边缘功能推送(对齐扯旋):暂离/罚金/断线/解散/钻石警告 ----
  on(MSG.SEAT_RESERVE_GRACE, (d) => emit('recvGrace', d))       // {userId,seat,state:PENDING|ON_LEAVE|SEAT_LOCKED|NONE,deadline?}
  on(MSG.RUN_AWAY_FINE, (d) => emit('recvFine', d))             // {userId,kind:EARLY_LEAVE|RUN_AWAY,amount}
  on(MSG.PLAYER_OFFLINE, (d) => emit('recvOffline', d))         // {userId,seat}
  on(MSG.PLAYER_ONLINE, (d) => emit('recvOnline', d))           // {userId,seat}
  on(MSG.ROOM_DISMISSED, (d) => emit('recvDismissed', d))       // {byUserId}
  on(MSG.DIAMOND_WARNING, (d) => emit('recvDiamondWarning', d)) // {clubId,needed,msg}

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

/**
 * 站起(留在房间观战)。后端即时回执 STAND_UP_RES:
 *   status=92 → 盈利离桌要扣罚金,需前端确认后带 confirmFine=true 重发(对齐扯旋 ack 92);
 *   pending=true → 牌局中申请,这手打完自动站起(座位保留,PLAYER_STAND 局末才来);
 *   pending=false → 已立即站起(PLAYER_STAND 广播随后清座)。
 * 返回 {status, pending, needConfirm, fine, msg}。
 */
export async function standUpSeat({ seatID, roomId, confirmFine = false }) {
  void seatID
  const sock = await ensureSocket()
  const p = observeResult((ok) => [
    sock.on(MSG.STAND_UP_RES, (d) => {
      if (d && d.status === 92) ok({ status: 92, needConfirm: true, fine: d.fine ?? 0, msg: d.msg || '' })
      else ok({ status: 0, pending: !!(d && d.pending), msg: (d && d.msg) || '' })
    }),
  ])
  sock.send(MSG.STAND_UP, confirmFine ? { confirmFine: true } : {}, roomId)
  const r = await p
  if (_room && !r.needConfirm && !r.pending) _room.mySeat = -1
  return r
}

/** 留座暂离(放假):空闲立即生效;牌局中未弃牌先 PENDING,弃牌/局末生效。结果走 recvGrace 事件。 */
export async function seatReserveLeave(roomId) {
  const sock = await ensureSocket()
  sock.send(MSG.SEAT_RESERVE_LEAVE, {}, roomId)
}

/** 暂离中回到座位(重连不会自动回,必须主动发,对齐扯旋)。结果走 recvGrace(state=NONE)。 */
export async function seatReserveResume(roomId) {
  const sock = await ensureSocket()
  sock.send(MSG.SEAT_RESERVE_RESUME, {}, roomId)
}

/** 实时战绩:{players:[{userId,nickname,seat,bringIn,stack,profit,handCount,...}],room,history} */
export async function realtimeStatsFlow(roomId) {
  const sock = await ensureSocket()
  const res = await sock.request(MSG.REALTIME_STATS, {}, { roomId, resType: MSG.REALTIME_STATS_RES })
  return res.data || { players: [] }
}

/** 解散牌局(创建者/俱乐部管理)。全房收 recvDismissed。 */
export async function dismissRoomFlow(roomId) {
  const sock = await ensureSocket()
  sock.send(MSG.DISMISS_ROOM, {}, roomId)
}

// ---------------------------------------------------------------
// 俱乐部积分(每俱乐部独立一本账,对齐扯旋)
// ---------------------------------------------------------------

/**
 * 积分操作。op: ownerAdd 群主增发 / ownerBurn 群主核销 / distribute 上分 /
 *   collect 下分 / transfer 赠送。返回后端 CLUB_OP_RES data(含最新余额)。
 */
export async function clubScoreOpFlow({ clubId, op, userId = 0, amount }) {
  const sock = await ensureSocket()
  const res = await sock.request(MSG.CLUB_SCORE_OP, { clubId, op, userId, amount },
    { resType: MSG.CLUB_OP_RES })
  return res.data
}

/** 积分明细(自己;群主/管理员可带 userId 查成员)。[{type,typeName,amount,before,after,remark,time}] */
export async function clubScoreLogsFlow({ clubId, userId = 0, limit = 50 }) {
  const sock = await ensureSocket()
  const res = await sock.request(MSG.CLUB_SCORE_LOGS, { clubId, userId, limit },
    { resType: MSG.CLUB_SCORE_LOGS_RES })
  return (res.data && res.data.logs) || []
}

/** 我的战绩:{records:[周期/站起结算列表], stats:{sessions,totalProfit,totalHands,...}} */
export async function myRecordsFlow(limit = 20) {
  const sock = await ensureSocket()
  const res = await sock.request(MSG.MY_RECORDS, { limit }, { resType: MSG.MY_RECORDS_RES })
  return res.data || { records: [], stats: {} }
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
