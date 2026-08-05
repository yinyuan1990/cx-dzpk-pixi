<script setup>
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import PixiStage from '../components/PixiStage.vue'
import TableSeat from '../components/table/TableSeat.vue'
import TableTopMenu from '../components/table/TableTopMenu.vue'
import TableBottomMenu from '../components/table/TableBottomMenu.vue'
import TableCenterOverlay from '../components/table/TableCenterOverlay.vue'
import TableSettingDialog from '../components/table/TableSettingDialog.vue'
import TableMenuPopup from '../components/table/TableMenuPopup.vue'
import TableDealTestDialog from '../components/table/TableDealTestDialog.vue'
import TableCountdownTestDialog from '../components/table/TableCountdownTestDialog.vue'
import TableWinTestDialog from '../components/table/TableWinTestDialog.vue'
import TableCommunityTestDialog from '../components/table/TableCommunityTestDialog.vue'
import TableBetTestDialog from '../components/table/TableBetTestDialog.vue'
import TableBlindTestDialog from '../components/table/TableBlindTestDialog.vue'
import TableRotateTestDialog from '../components/table/TableRotateTestDialog.vue'
import TableActionTestDialog from '../components/table/TableActionTestDialog.vue'
import TableFoldTestDialog from '../components/table/TableFoldTestDialog.vue'
import TableShowdownTestDialog from '../components/table/TableShowdownTestDialog.vue'
import TableGiftTestDialog from '../components/table/TableGiftTestDialog.vue'
import TableAllinTestDialog from '../components/table/TableAllinTestDialog.vue'
import TableClearTestDialog from '../components/table/TableClearTestDialog.vue'
import TableSimTestDialog from '../components/table/TableSimTestDialog.vue'
import TableLoadingOverlay from '../components/table/TableLoadingOverlay.vue'
import TableActionBar from '../components/table/TableActionBar.vue'
import TablePreActionBar from '../components/table/TablePreActionBar.vue'
import { playSound } from '../utils/sound'
import { useSeatRotation } from '../composables/useSeatRotation'
import { useTableBackground } from '../composables/useTableBackground'
import { useGameStore } from '../stores/game.js'
import { spectateFlow, leaveRoom, sitDownSeat, standUpSeat, leaveRoomSeat, addChips, sendAction, insuranceBuy, seatReserveLeave, seatReserveResume, realtimeStatsFlow, dismissRoomFlow, giftListFlow, sendGiftFlow } from '../net/session.js'
import { mapSnapshot, applyEvent, mapBoard, debugServerCard } from '../net/tableModel.js'
import { formatKNotation } from '../utils/format'
import { CARD_VALUES } from '../config/cards'
import { evaluateBest, pickWinners, CAT_I18N } from '../utils/pokerEval'
import { preloadTableAssets } from '../utils/tablePreload'

// Ordinary Texas empty table (gameUI.js equivalent / orchestrator).
// 3 layers: (1) .felt bg -> (2) PixiStage canvas -> (3) .content DOM HUD.
// Seat coords / rotation / backgrounds / avatars live in config + composables;
// each HUD piece is its own component (see components/table/*).
const router = useRouter()
const { t } = useI18n()

const { seats, seatedCount, rotating, sitDown, seatPlayers, seatOne, revealSeatCard, hideSeatCards, reset, applyModelToSeats, rotateSeatToBottom, rotateEmptyToBottom } =
  useSeatRotation()
const { backgrounds, selectedBg, feltStyle, selectBg } = useTableBackground()
const game = useGameStore()

// Pixi game layer renders seats + deal animation; we drive it via this ref.
const pixiStage = ref(null)

// roomInfo fields(进房后由 driveFromModel 用真实快照刷新;演示模式显示占位)。
const room = ref({ blinds: '1/2', roomNum: '', duration: '', name: '', line2: '', url: '' })

// center button: setStartBtn -> master & >=2 players => start, else => invite.
const isMaster = ref(true)
const centerLabel = computed(() =>
  isMaster.value && seatedCount.value >= 2 ? t('table.start') : t('table.invite'),
)

const showMenu = ref(false)
const showSettings = ref(false)
const showDealTest = ref(false)
const showCountdownTest = ref(false)
const showWinTest = ref(false)
const showCommunityTest = ref(false)
const showBetTest = ref(false)
const showBlindTest = ref(false)
const showRotateTest = ref(false)
const showActionTest = ref(false)
const showFoldTest = ref(false)
const showShowdownTest = ref(false)
const showGiftTest = ref(false)
const showAllinTest = ref(false)
const showClearTest = ref(false)
const showSimTest = ref(false)
// in-turn action bar (#5) + pre-action bar (#6)
const actionBar = ref({ show: false, config: {} })
const preActionBar = ref({ show: false, right: { type: 'check' } })
const pot = ref(0) // 总底池金额（由 Pixi 收池回调上抛，缎带显示+跳动）
const boardActive = ref(false) // community board dealt -> hide watermark + invite button
// 坐下/带入（对局）：观战中点空座 → 发 REQ_GAME_SEND_SEAT_ACTION(18) 坐下 → 弹带入 → REQ_GAME_ADD_CHIPS(28)
// 数据对齐 Unity UIAddChipsComponent.AddClipsData：滑条为**整数倍率**（wholeNumbers，min=currentMinRate、
//   max=maxRate 按公式钳制），金额 = rate × unit（unit=DzRoomVo.incp=GameCache.carry_small，无则大盲）。
const buyIn = ref({
  show: false, seatID: -1, busy: false,
  rate: 0, minRate: 0, maxRate: 0, // 滑条整数倍率
  unit: 0,                          // 每 1 倍率的筹码数（分）
  totalCoin: 0,                     // 账户 USDT 余额（分，textTotalCoin）
  tableChips: 0,                    // 已带上桌筹码（分）
  bigBlind: 0,
})
// 带入金额（分）= 倍率 × 单位；余额不足 → 红字 + 禁确认（对齐 Unity needCoin 变红 b82b30）
const buyInAmount = computed(() => (buyIn.value.rate || 0) * (buyIn.value.unit || 0))
const buyInShort = computed(() => buyInAmount.value > (buyIn.value.totalCoin || 0))
const buyInBB = computed(() => {
  const bb = buyIn.value.bigBlind || 0
  return bb > 0 ? Math.round(buyInAmount.value / bb) : 0
})
const heroSeatId = ref(-1) // 自己座位号（坐下/快照/推送同步；供菜单「站起围观」等响应式判断）

// ===== 边缘功能状态(对齐扯旋):暂离/罚金确认/实时战绩/解散 =====
const myGrace = ref({ active: false, deadline: 0, leftSecs: 0 }) // 自己的放假倒计时
let graceTimer = null
const fineConfirm = ref({ show: false, fine: 0, msg: '' })       // 盈利离桌罚金确认弹窗
const statsPanel = ref({ show: false, loading: false, players: [] }) // 实时战绩面板
// 真实送礼面板(对齐扯旋161/351):礼物列表来自后端配置,目标=其他在座玩家
const giftPanel = ref({ show: false, loading: false, gifts: [], sel: null, targets: [], target: 0 })
const isRoomCreator = computed(() => !!(tableModel && tableModel.creatorUserId && tableModel.creatorUserId === game.user.userId))

function startGraceCountdown(deadline) {
  myGrace.value = { active: true, deadline, leftSecs: Math.max(0, Math.round((deadline - Date.now()) / 1000)) }
  graceTimer && clearInterval(graceTimer)
  graceTimer = setInterval(() => {
    const left = Math.max(0, Math.round((myGrace.value.deadline - Date.now()) / 1000))
    myGrace.value.leftSecs = left
    if (left <= 0) stopGraceCountdown()
  }, 1000)
}
function stopGraceCountdown() {
  graceTimer && clearInterval(graceTimer)
  graceTimer = null
  myGrace.value = { active: false, deadline: 0, leftSecs: 0 }
}

// 进桌加载页（对齐 Cocos loadingJs.preScene）：预加载牌桌资源完成前盖加载页 + 真进度条。
const tableLoading = ref(true)
const loadPct = ref(0)
onMounted(async () => {
  const t0 = Date.now()
  try {
    const bg = backgrounds.value.find((b) => b.id === selectedBg.value)
    await preloadTableAssets((p) => (loadPct.value = Math.round(p * 100)), bg ? [bg.src] : [])
  } catch (e) {
    void e
  }
  const wait = 500 - (Date.now() - t0) // 最短展示 0.5s，避免一闪而过
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  loadPct.value = 100
  tableLoading.value = false
  // 加载页揭开后，若是从大厅点房进来则进房观战驱动画面
  if (game.enterTarget) startSpectate()
})

// ===== 观战(围观)驱动：进房后用快照 + 推送实时驱动牌桌画面 =====
// 仅当从大厅点房进来(game.enterTarget 已设)时启用；无 target 时保持原 mock/测试行为不变。
const spectating = ref(false)
let _didAutoRotate = false // 观战进房只自动旋转一次（重连重同步不再转）
const specInfo = ref('') // 观战状态条（调试可见）：房号/在座/状态/错误
const eventLog = ref([]) // 观战事件实时日志（最近若干条，调试用）
// 调试面板:默认全部隐藏,点桌面右上角虫子图标才展开(状态条+事件日志+房间参数核实)
const showDebug = ref(false)
const roomRules = ref(null) // 快照 rules(建房全量参数,核实参数是否生效)
const RULE_LABELS = [
  ['sb', '小盲'], ['bb', '大盲'], ['maxPlayers', '人数'], ['settleTimeMins', '时长(分)'],
  ['opTimeSec', '思考时间(秒)'], ['ante', '前注'], ['rakePercent', '费率%'],
  ['minBuyin', '最小带入'], ['maxBuyin', '最大带入'],
  ['straddleOn', 'Straddle'], ['insuranceOn', '保险'], ['muckOn', '埋牌'], ['vpOn', '入池率'],
  ['ipLimitOn', 'IP限制'], ['gpsLimitOn', 'GPS限制'],
  ['autoStartNum', '自动开局人数'], ['gameMinTime', '最短上桌(分)'], ['aheadLeaveOn', '允许提前离桌'],
]
function ruleVal(v) {
  if (typeof v === 'boolean') return v ? '开' : '关'
  return v
}
function logEvent(type, data) {
  let brief = ''
  if (type === 'recvStartInfor') brief = `手#${data.handNo} 庄${data.bankerID} 小盲位${data.smallSeatID} 大盲位${data.bigSeatID} 盲${data.smallChip}/${data.bigChip}`
  else if (type === 'recvTurn') brief = `轮到座${data.seat} 需跟${data.toCall} 最小加注到${data.minRaiseTo} ${data.opTime}s`
  else if (type === 'recvAction') brief = `座${data.seatID} action=${data.action} 额${data.anteNumber} pot=${data.potNumber}`
  else if (type === 'recvCards') brief = `公共牌 ${(data.systemIDArray || []).map(debugServerCard).join(' ')} pot=${data.potNumber}`
  else if (type === 'recvWinner') brief = `赢家=${JSON.stringify(data.seatIDArray)} 赢筹=${JSON.stringify(data.winChipsArray)} (${data.reason})`
  else if (type === 'recvReadyTime') brief = `readyTime=${data.readyTime}`
  else if (type === 'recvSeatDown') brief = `座${data.seatID} ${data.nick}`
  else if (type === 'recvLeave') brief = `座${data.seatID} (${data.reason || ''})`
  else if (type === 'recvBuyin') brief = `带入 uid=${data.userID} +${data.amount} 生效=${data.applied}`
  else if (type === 'recvPeriodSettle') brief = `周期结算 uid=${data.userId} 盈亏=${data.profit} 退回=${data.refund}`
  else if (type === 'recvSidePots') brief = `分池=${JSON.stringify(data.pots)}`
  else if (type === 'recvRoundFinish') brief = '清台'
  else if (type === 'error') brief = data.msg || ''
  else if (data == null) brief = '(无解码体)'
  const line = `${new Date().toLocaleTimeString()} ${type} ${brief}`
  console.debug('[spectate]', type, data)
  eventLog.value = [line, ...eventLog.value].slice(0, 8)
}
let tableModel = null
let winTimer = null // 结算赢家动画延时器（摊牌后再点亮，离场/新一手时清）
let _lastBoardKey = ''
let _lastDealer = -1
let _lastOp = -1
function driveFromModel(m, { animateBoard = false, isSnapshot = false } = {}) {
  tableModel = m
  applyModelToSeats(m)          // 座位：真实昵称/筹码/弃牌
  // 底池缎带:唯一数据源 = 模型 pot(后端 displayPot,已收+各家面前,单调不回跳)。
  //   ⚠️ 不能再让 Pixi 收池动画回调(@pot)同时驱动——两套计数交替写同一数字 = 「总底池乱跳」。
  pot.value = m.pot || 0
  // 房间信息条：盲注 + 房号 + 真实房名/循环结算描述
  room.value = {
    blinds: `${formatKNotation(m.smallBlind || 0)}/${formatKNotation(m.bigBlind || 0)}`,
    roomNum: String(game.enterTarget?.roomId ?? ''),
    duration: m.settleTimeMins ? `${m.settleTimeMins}分钟` : '',
    name: m.roomName || game.enterTarget?.name || '',
    line2: m.settleTimeMins
      ? `循环结算 · ${m.settleTimeMins}分钟/周期 · 抽水${m.rakePercent || 0}%`
      : (m.rakePercent ? `抽水${m.rakePercent}%` : ''),
    url: '',
  }
  const occ = m.seats.filter((s) => s.occupied).length
  const gs = { 0: '倒计时', 1: '游戏中', '-2': '等待开局', '-1': '其他' }[m.gamestatus] ?? m.gamestatus
  const boardDbg = (m.board || []).length ? ` · 公共牌 ${(m.board || []).map(debugServerCard).join(' ')}` : ''
  specInfo.value = `观战 房#${game.enterTarget?.roomId ?? ''} · 在座 ${occ}/${m.seatCount} · ${gs} · 盲 ${formatKNotation(m.smallBlind)}/${formatKNotation(m.bigBlind)} · 底池 ${formatKNotation(m.pot)}${boardDbg}`
  if (m.rules) roomRules.value = m.rules // 建房参数(调试面板核实)
  const board = mapBoard(m.board)
  boardActive.value = board.length > 0
  // 驱动 Pixi 层（带变更追踪，避免重复动画）
  const P = pixiStage.value
  if (!P) return
  // 庄家钮（座位由 applyModelToSeats 改响应式数据，需等 PixiStage watch 渲染完座位节点再挂标记）
  //   庄家转移动画：快照(进房/重连)瞬间到位；实时换庄(新一手)从旧庄位滑到新庄位（setDealer animate）。
  if (m.bankerIndex >= 0 && m.bankerIndex !== _lastDealer) {
    _lastDealer = m.bankerIndex
    const dealerSeat = m.bankerIndex
    nextTick(() => P.setDealer(dealerSeat, !isSnapshot))
  }
  // 公共牌：快照/同步用静态摆放；街变化(recvCards)用翻牌动画播新一街。
  //   变更检测用**排序后**的牌集合（顺序无关）：避免快照/事件把同一批公共牌以不同顺序带来时
  //   boardKey 变化 → 误触发 STATIC 重摆 → 已翻开的公共牌闪烁（"收到下一玩家操作信息时公共牌闪烁"的
  //   潜在来源之一）。渲染仍用真实顺序 board（翻牌顺序正确），只是"要不要重新渲染"的判定按集合。
  const boardKey = [...board].sort((a, b) => a - b).join(',')
  if (boardKey !== _lastBoardKey) {
    const prevLen = _lastBoardKey ? _lastBoardKey.split(',').filter(Boolean).length : 0
    _lastBoardKey = boardKey
    // 渲染异常隔离：公共牌渲染抛错时把 _lastBoardKey 回滚（下次模型刷新重试重摆/重清），
    //   且不让异常中断后面的操作条/倒计时刷新（异常会被 session onEvent 外层吞掉 → 全链停摆）。
    try {
      if (board.length === 0) P.clearCommunity()
      else if (animateBoard && board.length > prevLen) {
        const round = board.length === 3 ? 'FLOP' : board.length === 4 ? 'TURN' : board.length === 5 ? 'RIVER' : 'STATIC'
        P.playCommunity(round, board)
      } else {
        P.playCommunity('STATIC', board)
      }
    } catch (e) {
      _lastBoardKey = ''
      console.error('[spectate] 公共牌渲染异常', e)
    }
  }
  // 分池 pots[] UI（快照 pots / SHOW_SIDE_POTS(120) 推送）：面额配色对齐 Cocos pot.getBetColor（÷大盲阈值）。
  //   setPots 内部按变化增量刷新（换色/改数/增删项），重复调用无动画抖动。
  try { P.setPots(m.pots, m.bigBlind) } catch (e) { console.error('[spectate] 分池渲染异常', e) }
  // 自己座位号跟踪（快照带 mySeatID；坐下成功后本地已置 heroSeatId）
  if (m.mySeatID != null && m.mySeatID >= 0) heroSeatId.value = m.mySeatID
  else if (heroSeatId.value >= 0) {
    // 模型里自己的座位已不在（被踢/离座走 recvLeave 清座、快照重同步等）→ 同步回观战，
    //   否则 heroSeatId 残留 → 菜单仍显示「站起围观」、操作条误判轮到自己。
    const hs = m.seats && m.seats[heroSeatId.value]
    if (!hs || !hs.occupied || !hs.isHero) { heroSeatId.value = -1; closeActionBars() }
  }
  // 轮到自己：operationID===我的座位 → 弹操作条（对局）；否则收起。观战(未坐下)永不触发。
  updateSelfActionBar(m, isSnapshot)
  // 当前操作位倒计时：普通德州 = 导火索(fuse) 燃烧效果（对照 Unity Holdem_PlayerTimer + progress_spark）。
  // 快照那一刻用 leftOperateTime(剩余)；之后每次换操作位用 opTime(整轮时长) 重新点燃。
  const opId = m.operationID
  // 权威停表：每次模型更新都立刻清掉**非当前操作位**的所有导火索（不动当前位 → 不重启/不闪）。
  //   根治「其它玩家操作时旧操作位倒计时还在烧」——无论 _lastOp 是否跟丢、座位是否重建、
  //   是否结算/准备阶段(opId=-1 → 全清)，都不会留下孤儿倒计时。
  P.clearCountdownExcept(opId)
  if (opId !== _lastOp) {
    _lastOp = opId
    const secs = isSnapshot ? (m.leftOperateTime || m.opTime || 0) : (m.opTime || m.leftOperateTime || 0)
    if (opId >= 0 && secs > 0) {
      // 同庄家钮：等座位渲染完再点燃导火索；守卫：nextTick 期间操作位若又变了则不点燃；
      //   已在烧(hasCountdown)则不重启，避免同操作位被重复点燃造成闪烁。
      nextTick(() => { if (_lastOp === opId && !P.hasCountdown(opId)) P.startCountdown(opId, secs, 'fuse') })
    }
  }
}
async function startSpectate() {
  const tgt = game.enterTarget
  if (!tgt) { specInfo.value = '演示模式（未从大厅进入，无房间数据）'; return }
  spectating.value = true
  specInfo.value = `进入房间 #${tgt.roomId} 中…`
  isMaster.value = false
  _lastBoardKey = ''; _lastDealer = -1; _lastOp = -1
  try {
    await spectateFlow({
      roomId: tgt.roomId,
      onStatus: (s) => {
        if (s === 'reconnected') {
          // 重连重同步：重置变更追踪 + 清「瞬态特效」，让随后到达的新快照整体重绘（修复断线丢推送的脱节）。
          // ⚠️ 不再 clearCommunity（对齐 Unity 重连 UpdatePublicCardsNoAnim 的幂等重摆）：
          //   之前重连即清空公共牌 → 新快照到达才 STATIC 重摆，中间一段空板 + 重摆 = 公共牌肉眼闪烁。
          //   现在保留已亮的牌，_lastBoardKey 置空后新快照走 playCommunity('STATIC')——内部 staticIfNeeded
          //   对已正确显示的槽跳过、板变化才换牌/收缩（ensureComSlots 增量语义），同一手重连零闪烁。
          _lastBoardKey = ''; _lastDealer = -1; _lastOp = -1
          winTimer && clearTimeout(winTimer); winTimer = null
          const P = pixiStage.value
          // clearCountdownExcept(-1)=清全部倒计时（原 clearCountdown(_lastOp) 在 _lastOp 已重置为 -1 后是空操作）
          if (P) { P.clearFolds(); P.clearBets(); P.clearShowdown(); P.clearAllins(); P.clearCountdownExcept(-1) }
          specInfo.value = `重连成功，重新同步房间 #${game.enterTarget?.roomId ?? ''}…`
        } else if (s === 'resumed') {
          // WS 已重连且推送流恢复，只是未回全量快照——连接正常，后续事件会持续刷新
          specInfo.value = `重连成功，数据流已恢复 房 #${game.enterTarget?.roomId ?? ''}`
        } else if (s === 'disconnected') {
          specInfo.value = `连接已断开（重连失败），请退出重进房间 #${game.enterTarget?.roomId ?? ''}`
        } else if (typeof s === 'string' && s.startsWith('reconnect-failed')) {
          specInfo.value = `重连后进房失败：${s}`
        }
        logEvent(typeof s === 'string' ? `net:${s}` : 'net', {})
      },
      onSnapshot: (snap) => {
        driveFromModel(mapSnapshot(snap), { isSnapshot: true })
        // 观战进房自动旋转（对齐 Cocos）：首个快照渲染后，把一个空位转到最下（满桌/已在最下不转）。
        //   仅首次进房转；重连重同步不再转（保持用户当前视角）。
        if (!_didAutoRotate) {
          _didAutoRotate = true
          nextTick(() => {
            const mid = tableModel?.mySeatID ?? -1
            if (mid >= 0) {
              rotateSeatToBottom(mid)
              // 对齐 Unity 进房：mainPlayer.status==18 → 再弹 UIAddChips（占座未带入重进房）
              const me = tableModel?.seats?.[mid]
              if (me && me.status === 18) openBuyIn(mid)
            } else {
              rotateEmptyToBottom()
            }
          })
        }
      },
      onEvent: handleGameEvent,
    })
  } catch (e) {
    errMsg.value = e.message || '进入牌局失败'
  }
}
// 牌局推送处理（观战/对局共用）：抽成组件级函数，便于 DEV 复现真实事件流。
// ⚠️ 动画异常隔离：①/③ 两段 Pixi 动画包 try/catch —— session 的 onEvent 外层会吞异常，
//   任何一个动画抛错（如 2026-07-21 clearShowdown 读空手牌崩溃）都会把**整条事件**吃掉：
//   ② driveFromModel 不再执行 → 模型/公共牌/倒计时全部停摆（「公共牌一直不消失」的放大器）。
//   动画失败只丢一帧特效，状态刷新必须走到。
function handleGameEvent(type, data) {
        logEvent(type, data) // 先记录所有事件（含未驱动的），便于慢桌定位
        if (!tableModel || !data) return
        // 错误推送:提示条显示,不进模型
        if (type === 'error') { errMsg.value = data.msg || '操作失败'; return }
        // 保险(河牌保险,两人全下跑马):不进模型,独立面板处理
        if (type === 'recvInsuranceOffer') { onInsuranceOffer(data); return }
        if (type === 'recvInsuranceResult') { onInsuranceResult(data); return }
        // 带入生效:若是自己,同步账户余额(带入弹窗/补带入用)
        if (type === 'recvBuyin' && data.userID === game.user.userId && data.balance != null) {
          game.user.chips = data.balance
        }
        // 周期结算/打光:自己 → 弹结算面板(带补带入倒计时);他人只刷座位模型
        if (type === 'recvPeriodSettle' && data.userId === game.user.userId) {
          openPeriodSettle(data)
        }
        // 自己真正站起(含牌局中申请、局末生效):同步余额 + 结算提示
        if (type === 'recvLeave' && data.userID === game.user.userId) {
          if (data.balance != null) game.user.chips = data.balance
          stopGraceCountdown()
          if (data.refund != null) {
            const pf = data.profit || 0
            const fineTip = data.fine > 0 ? `,扣罚金 ${formatKNotation(data.fine)}` : ''
            errMsg.value = `已站起:本周期盈亏 ${pf >= 0 ? '+' : ''}${formatKNotation(pf)}${fineTip},退回 ${formatKNotation(data.refund)}`
          }
        }
        // 留座暂离状态机(对齐扯旋282):自己 → 倒计时横幅;广播 → applyEvent 刷座位徽标
        if (type === 'recvGrace') {
          if (data.userId === game.user.userId) {
            if (data.state === 'ON_LEAVE') startGraceCountdown(data.deadline || 0)
            else if (data.state === 'NONE') stopGraceCountdown()
            else if (data.state === 'PENDING') errMsg.value = data.msg || '弃牌或本手结束后自动暂离'
            else if (data.state === 'SEAT_LOCKED') { stopGraceCountdown(); errMsg.value = '暂离超时已自动站起,座位为你保留一段时间' }
          }
        }
        // 罚金广播(对齐扯旋284):提示条展示,不进模型
        if (type === 'recvFine') {
          const who = data.userId === game.user.userId ? '你' : `玩家${data.userId}`
          errMsg.value = `${who}${data.kind === 'RUN_AWAY' ? '离线过久离桌' : '盈利提前离桌'},罚金 ${formatKNotation(data.amount)}`
          return
        }
        // 牌局被解散(创建者/管理/后台/停服维护):提示后回大厅
        if (type === 'recvDismissed') {
          errMsg.value = data.reason === 'maintenance'
            ? '服务器维护更新,牌局已结算,请稍后再来'
            : '牌局已被解散'
          setTimeout(() => onLeaveRoom(), 1800)
          return
        }
        // 群主钻石不足:牌局暂停警告
        if (type === 'recvDiamondWarning') {
          errMsg.value = data.msg || '群主钻石不足,牌局暂停'
          return
        }
        // 房间礼物广播(对齐扯旋351):提示条;动画在下方 P 分支;SCORE 扣带入由模型同步筹码
        if (type === 'recvGift') {
          const who = data.fromUserId === game.user.userId ? '你' : (data.fromNickname || `玩家${data.fromUserId}`)
          errMsg.value = data.toNickname
            ? `${who} 送给 ${data.toNickname}「${data.giftName}」`
            : `${who} 送出「${data.giftName}」`
        }
        const P = pixiStage.value
        const m = applyEvent(tableModel, type, data)

        // ① 先于状态刷新触发的动画（需要旧状态 / 顺序在前）
        try {
        if (P) {
          if (type === 'recvStartInfor') {
            // 新一手：清上一手特效（含未触发的赢家延时），重置公共牌追踪，下庄钮 + 下盲
            // clearAllins 必须清：All-In 光环是「常驻到 clearAllin」的座位子节点，上一手的光环/压暗罩
            //   不清会一直挂在头像上带进下一手（对齐 Unity recvStartInfor 各座 SeatStartToPlaying 灭火焰）。
            winTimer && clearTimeout(winTimer); winTimer = null
            // clearWins：上一手 WIN/YouWin/盈利数字若还在淡出（readyTime 可为 0，间隔极短），
            //   立刻收掉，避免叠进新一手画面（状态重叠）。
            P.clearFolds(); P.clearBets(); P.clearShowdown(); P.clearCommunity(); P.clearAllins(); P.clearWins()
            _lastBoardKey = ''
            if (m.bankerIndex >= 0) { _lastDealer = m.bankerIndex; P.setDealer(m.bankerIndex, true) }
            if (m.smallIndex >= 0 && m.bigIndex >= 0) {
              P.postBlinds(m.smallIndex, m.bigIndex, m.smallBlind, m.bigBlind)
            }
          } else if (type === 'recvAction') {
            // 对齐 Unity 动作码：1下注 2跟 3加 4全下 5过牌 6弃 7超时
            const i = data.seatID
            if (data.action === 6) {
              playSound('foldCardSound')                       // 弃牌音（OnPlayerAction Enum_Action_Fold）
              P.playFold(i)                                    // 弃牌：牌飞向中心 + 淡出
            } else if (data.action === 4) {
              if (data.anteNumber > 0) P.playBet(i, data.anteNumber)
              P.playAllin(i)                                   // 全下：筹码上桌 + 光环
            } else if (data.action === 5) {
              playSound('checkSound')                          // 过牌敲桌音（Enum_Action_Check）
            } else if (data.anteNumber > 0) {
              P.playBet(i, data.anteNumber)                    // 下注/跟注/加注：筹码飞上桌（内部已播 chipsToTable）
            }
            // 7超时：不出筹码/无音，座位灰气泡由 buildSeat 据 status 渲染
          } else if (type === 'recvCards') {
            P.collectAllBets()                                 // 进新一街前先把上一轮下注收进底池
          } else if (type === 'recvRoundFinish') {
            // 当前手结束(151，对齐 Unity HANDLER_REQ_CURRENT_ROUND_FINISH)：结算展示后清台——
            //   收掉桌面瞬态节点（弃牌小牌/下注堆/摊牌大牌/All-In 光环），公共牌与底池由模型置空
            //   后经 driveFromModel 清除（board=[] → clearCommunity；pots=[] → clearPots；pot=0）。
            //   头像/身家保留，等 recvReadyTime/recvStartInfor 开下一手。
            P.clearFolds(); P.clearBets(); P.clearShowdown(); P.clearAllins()
          } else if (type === 'recvGift') {
            // 礼物飞行+落点骨骼动画(animKey 未配动画时 playGift 内部静默跳过)
            const anim = data.animKey || data.giftKey
            const from = data.fromSeat
            const to = data.toSeat != null ? data.toSeat : data.fromSeat
            if (anim && from != null) P.playGift(from, to, anim)
          }
        }
        } catch (e) { console.error('[spectate] 事件前置动画异常', type, e) }

        // ② 状态刷新（座位/底池/倒计时；recvCards 让公共牌走翻牌动画）
        driveFromModel(m, { animateBoard: type === 'recvCards' })

        // ③ 状态刷新后触发的动画
        try {
        if (P) {
          if (type === 'recvStartInfor') {
            // 发各座手牌（中心飞向座位，观战看不到点数→落到牌背）。
            // 关键：先把手牌藏起来(hideSeatCards)，否则 applyModelToSeats 已把牌背静态显示，
            //   飞牌会落在已显示的牌背上→看不出"发牌"。藏起后由 playDeal 的 onReveal 逐张发出来才显现。
            nextTick(() => {
              // 只给本手可玩座位发牌（对齐 Unity canPlayStatus==1）；中途坐下 canPlay=0 不飞牌
              const targets = seats.value
                .filter((s) => s.player && !s.player.folded && s.player.canPlay)
                .map((s) => ({ cx: s.cx, cy: s.cy, nodeId: s.nodeId, isSelf: s.player.isSelf, side: s.side }))
              targets.forEach((tg) => hideSeatCards(tg.nodeId))
              P.playDeal(targets, revealSeatCard)
              // 安全兜底：发牌动画时长内若 onReveal 漏掉/被打断（token 抢占、慢桌无后续事件等），
              //   手牌会停在 hideSeatCards 的隐藏态 → 「没弃牌的玩家牌不在了」。发牌结束后强制把
              //   各发牌座位两张手牌补显出来（revealSeatCard 幂等，只置 revealed=true）。
              setTimeout(() => {
                targets.forEach((tg) => { revealSeatCard(tg.nodeId, 0); revealSeatCard(tg.nodeId, 1) })
              }, 800)
            })
          } else if (type === 'recvWinner') {
            // 结算链（对齐 Unity handleWinnerInfoCommon L1430）：
            //   ① 亮他人底牌 → ② 满5公牌时最佳五张高亮(playShowdown 二合一) → ③ 收未中筹码进池 → ④ 赢家筹码从底池飞向赢家。
            const board = mapBoard(m.board)
            // ①② 摊牌参与者：在座、未弃、服务端给了有效底牌(holeCards 非空)的玩家。
            const participants = []
            m.seats.forEach((s, i) => {
              if (!s.occupied || s.folded || !Array.isArray(s.holeCards)) return
              const hole = s.holeCards
              let best5 = [], cat = 0, catLabel = ''
              if (board.length === 5) {
                const ev = evaluateBest(hole.concat(board))
                best5 = ev.best5; cat = ev.cat; catLabel = t(CAT_I18N[ev.cat])
              }
              participants.push({ nodeId: i, hole, best5, cat, catLabel, winner: !!s.isWinner })
            })
            if (participants.length) P.playShowdown(participants)
            // ③ 收未中筹码进池
            P.collectAllBets()
            // ④ 赢家筹码从底池飞向赢家 + YouWin/WIN（摊牌逐座开牌后再点亮，避免抢在亮牌前）
            const fireWin = () => {
              ;(data.seatIDArray || []).forEach((seat, i) => {
                const amt = (data.winChipsArray && data.winChipsArray[i]) || 0
                P.playWin(seat, { isSelf: seat === m.mySeatID, amount: amt, mode: 'holdem' })
              })
            }
            // 赢家动画延时：只给「收池(collectAllBets)」一点时间到位即可，**不再按摊牌人数线性放大**。
            //   原 participants*600+300（可达 2s+）常被下一手 recvStartInfor 取消（服务端 readyTime 可能=0，
            //   手与手间隔很短）→ 赢家动画「很多时候丢失」。固定短延时 → 几乎总能在下一手前点亮。
            const winDelay = 450
            winTimer && clearTimeout(winTimer)
            winTimer = setTimeout(fireWin, winDelay)
          }
        }
        } catch (e) { console.error('[spectate] 事件后置动画异常', type, e) }
}
const errMsg = ref('')

// ===== 保险(河牌保险) — 后端 INSURANCE_OFFER/RESULT,规则见 InsuranceRule =====
// 领先方:弹购买面板(outs/赔率/额度/倒计时);其他人:顶部横幅"保险决策中"。
const insOffer = ref(null) // {leaderUserId,outs,outCards,oddsX100,maxInsure,deadline,mine}
const insAmount = ref(0)
const insLeftSecs = ref(0)
let insTicker = null
function closeInsurance() {
  insOffer.value = null
  if (insTicker) { clearInterval(insTicker); insTicker = null }
}
function onInsuranceOffer(d) {
  const mine = d.leaderUserId === game.user.userId
  insOffer.value = { ...d, mine }
  insAmount.value = Math.floor((d.maxInsure || 0) / 2)
  const tick = () => {
    insLeftSecs.value = Math.max(0, Math.round(((d.deadline || 0) - Date.now()) / 1000))
    if (insLeftSecs.value <= 0) closeInsurance()
  }
  tick()
  if (insTicker) clearInterval(insTicker)
  insTicker = setInterval(tick, 250)
}
/** 保费 = 投保额 ÷ 赔率(向上取整,同后端 InsuranceRule.premium) */
function insPremium(amount) {
  const odds = insOffer.value ? insOffer.value.oddsX100 : 0
  if (!odds) return 0
  return Math.ceil((amount * 100) / odds)
}
async function buyInsurance(amount) {
  const roomId = game.enterTarget?.roomId
  if (roomId == null) return
  try {
    await insuranceBuy(roomId, amount)
  } catch (e) {
    errMsg.value = e.message || '保险操作失败'
  }
  closeInsurance()
}
function onInsuranceResult(d) {
  if (d.phase === 'decided') {
    closeInsurance()
    if (d.insured > 0) {
      errMsg.value = `保险已购买:投保 ${formatKNotation(d.insured)},保费 ${formatKNotation(d.premium)}`
    }
  } else if (d.phase === 'settled' && d.insured > 0) {
    errMsg.value = d.outHit
      ? `被反超!保险赔付 +${formatKNotation(d.insured)}`
      : `守住了,扣保费 -${formatKNotation(d.premium)}`
  }
}

// Pixi 收池动画的底池回调:仅演示/测试模式使用;观战/对局时底池由模型唯一驱动(防双头写乱跳)。
function onPixiPot(v) {
  if (!spectating.value) pot.value = v
}

// ===== 对局：坐下 + 带入 + 轮到自己操作 =====
// 座位点击：观战中点空座 → 真实坐下(18) + 带入弹窗；非观战(测试) → 原 mock 旋转坐下。
function onSeatTap(nodeId) {
  if (!spectating.value) { sitDown(nodeId); return }
  if (!tableModel) return
  if (nodeId >= (tableModel.seatCount || 9)) return // 超出本房座位数
  const s = tableModel.seats[nodeId]
  if (s && s.occupied) return // 已有人
  doRealSitDown(nodeId)
}
async function doRealSitDown(seatID) {
  const tgt = game.enterTarget
  if (!tgt) return
  try {
    const resp = await sitDownSeat({ seatID, roomId: tgt.roomId })
    if (resp.status !== 0) {
      errMsg.value = `坐下失败(status=${resp.status})`
      return
    }
    heroSeatId.value = seatID
    // cx-dzpk:坐下即 stack=0 占座,需带入(40BB~400BB)才能入局。
    const chips = resp.stack ?? 0
    const minPlay = ((tableModel && tableModel.bigBlind) || 0) + ((tableModel && tableModel.ante) || 0)
    const needBuyIn = chips <= minPlay
    const seatStatus = needBuyIn ? 18 : 0
    // ① 先本地入座（头像/昵称立刻出现在所选座位；18=等待字+藏身家，0=显示身家无等待字）
    if (tableModel) {
      const m = { ...tableModel, seats: tableModel.seats.map((s) => ({ ...s })), mySeatID: seatID }
      const me = m.seats[seatID]
      if (me) {
        Object.assign(me, {
          occupied: true,
          userId: game.user.userId,
          nick: game.user.nickname || game.user.account || ('WPK' + game.user.userId),
          headPic: game.user.headPic || '',
          chips,
          sex: game.user.sex || 0,
          isHero: true,
          status: seatStatus,
          // 对齐 Unity SEAT_ACTION：canPlayStatus=0 + GetEnptyHandCards，本手不参与 → 无手牌/无牌型
          canPlay: false,
          bet: 0, folded: false, allin: false, holeCards: null,
        })
      }
      driveFromModel(m)
    }
    // ② 入座音 + 整环旋转把自己的座位转到最下（复刻 Cocos sitdownWithAni）
    playSound('ruzuo')
    await rotateSeatToBottom(seatID)
    // ③ 仅筹码不足时才弹带入（对齐 Unity chips≤GetMinPlayChips → Show UIAddChips）
    if (needBuyIn) openBuyIn(seatID)
  } catch (e) {
    errMsg.value = e.message || '坐下失败'
  }
}
// 打开带入弹窗（数据对齐 Unity UIAddChipsComponent.OnShow）：
//   unit = DzRoomVo.incp（GameCache.carry_small，每 1 倍率的筹码数），无则回退大盲；
//   maxRate = clamp(((currentMaxRate+1)×unit − 已带上桌筹码) / unit, [minRate, currentMaxRate])——
//   补充带入时上限扣掉已带的部分；滑条整数倍率、初值 = minRate。
function openBuyIn(seatID, over = {}) {
  const m = tableModel
  const bb = (m && m.bigBlind) || 0
  const unit = over.unit ?? ((game.enterTarget && game.enterTarget.incp) || bb || 100)
  const minRate = over.minRate ?? ((m && m.currentMinRate) || 20)
  const maxCfg = over.maxRate ?? ((m && m.currentMaxRate) || 200)
  const me = m && m.seats ? m.seats[seatID] : null
  const tableChips = (me && me.chips) || 0
  let maxRate = Math.floor(((maxCfg + 1) * unit - tableChips) / unit)
  if (maxRate > maxCfg) maxRate = maxCfg
  if (maxRate < minRate) maxRate = minRate
  buyIn.value = {
    show: true, seatID, busy: false,
    rate: minRate, minRate, maxRate, unit,
    totalCoin: over.totalCoin ?? (game.user.chips || 0),
    tableChips, bigBlind: bb || unit,
  }
}
async function confirmBuyIn() {
  const b = buyIn.value
  if (b.busy || buyInShort.value) return // 余额不足禁确认（对齐 Unity gold<anteNumber 拦截）
  const tgt = game.enterTarget
  if (!tgt) return
  buyIn.value = { ...b, busy: true }
  try {
    const resp = await addChips({ seatID: b.seatID, anteNumber: buyInAmount.value, roomId: tgt.roomId })
    if (resp.status !== 0 && resp.status !== 2) { // 0成功 2等房主确认
      errMsg.value = `带入失败(status=${resp.status})`
      buyIn.value = { ...buyIn.value, busy: false }
      return
    }
    if (resp.status === 2) {
      errMsg.value = '带入申请已提交，等待确认'
      buyIn.value = { ...buyIn.value, show: false, seatID: -1, busy: false }
      return
    }
    // 带入成功先本地刷筹码 + 状态 18(占座)→8(已带入等下一手)（对齐 Unity HANDLER_REQ_GAME_ADD_CHIPS：
    //   Player.chips=rec.Chips；status==18→8；GameCache.gold=rec.allChips）。「等待」字保留到下一手自己真正入局。
    if (resp.allChips != null) game.user.chips = resp.allChips // 账户余额（再次带入弹窗用）
    if (resp.status === 0 && tableModel && b.seatID >= 0) {
      const m = { ...tableModel, seats: tableModel.seats.map((s) => ({ ...s })) }
      const me = m.seats[b.seatID]
      if (me && me.occupied) {
        if (resp.chips != null) me.chips = resp.chips
        if (me.status === 18) me.status = 8
      }
      driveFromModel(m)
    }
    buyIn.value = { ...buyIn.value, show: false, seatID: -1, busy: false }
    // 坐下+带入后服务端会推 recvSeatDown / 下一手 recvStartInfor 带 mySeatID，界面随推送刷新。
  } catch (e) {
    errMsg.value = e.message || '带入失败'
    buyIn.value = { ...buyIn.value, busy: false }
  }
}
// 关闭带入（点遮罩，对齐 Cocos backgroundNode TOUCH_START 关闭 + Unity UIAddChips.onClickClose）：
//   占座未带入(status 18)关闭 = 放弃坐下 → 发站起(action 2)，本地清座回观战。
async function cancelBuyIn() {
  const b = buyIn.value
  buyIn.value = { ...b, show: false }
  const m = tableModel
  const me = m && b.seatID >= 0 && m.seats ? m.seats[b.seatID] : null
  if (spectating.value && me && me.isHero && me.status === 18 && !periodSettle.value.show) {
    const tgt = game.enterTarget
    if (tgt) {
      try { await standUpSeat({ seatID: b.seatID, roomId: tgt.roomId }) } catch (e) { void e }
    }
    standUpHeroLocal(b.seatID)
  }
}

// ===== 周期结算面板(cx-dzpk 循环玩法核心:到点结算不离座,限时补带入) =====
const periodSettle = ref({ show: false, data: null, leftSecs: 0 })
let psTimer = null
function openPeriodSettle(d) {
  closeActionBars()
  if (buyIn.value.show) buyIn.value = { ...buyIn.value, show: false }
  periodSettle.value = { show: true, data: d, leftSecs: d.awaitBuyinSecs || 30 }
  psTimer && clearInterval(psTimer)
  psTimer = setInterval(() => {
    const left = d.deadline ? Math.max(0, Math.round((d.deadline - Date.now()) / 1000)) : periodSettle.value.leftSecs - 1
    periodSettle.value = { ...periodSettle.value, leftSecs: left }
    if (left <= 0) { clearInterval(psTimer); psTimer = null; periodSettle.value = { show: false, data: null, leftSecs: 0 } }
  }, 1000)
}
function psFmtSecs(secs) {
  const m = Math.floor((secs || 0) / 60)
  const s = (secs || 0) % 60
  return `${m}分${s}秒`
}
// 重新带入:关面板 → 弹带入(新周期)
function onPsRebuy() {
  const sid = periodSettle.value.data ? periodSettle.value.data.seat : heroSeatId.value
  psTimer && clearInterval(psTimer); psTimer = null
  periodSettle.value = { show: false, data: null, leftSecs: 0 }
  openBuyIn(sid)
}
// 站起离桌
async function onPsStand() {
  const sid = periodSettle.value.data ? periodSettle.value.data.seat : heroSeatId.value
  psTimer && clearInterval(psTimer); psTimer = null
  periodSettle.value = { show: false, data: null, leftSecs: 0 }
  const tgt = game.enterTarget
  if (tgt) {
    try { await standUpSeat({ seatID: sid, roomId: tgt.roomId }) } catch (e) { void e }
  }
  standUpHeroLocal(sid)
}
// 本地清 Hero 座回观战（主动站起 / 放弃带入 / 被系统强制站起共用）：清座位模型 + heroSeatId + 操作条/带入弹窗。
function standUpHeroLocal(sid) {
  heroSeatId.value = -1
  closeActionBars()
  if (buyIn.value.show) buyIn.value = { ...buyIn.value, show: false, seatID: -1, busy: false }
  if (!tableModel || sid == null || sid < 0 || !tableModel.seats[sid]) return
  const next = { ...tableModel, seats: tableModel.seats.map((s) => ({ ...s })), mySeatID: -1 }
  Object.assign(next.seats[sid], {
    occupied: false, userId: null, nick: '', headPic: '', chips: 0,
    status: -1, bet: 0, isHero: false, holeCards: null, folded: false, allin: false, canPlay: false,
  })
  driveFromModel(next)
}
// 轮到自己：据模型算操作条 config（对齐 optUser.setOptV：右键 check/call、中心 raise/bet/allin）。
function updateSelfActionBar(m, isSnapshot = false) {
  const isMyTurn = spectating.value && heroSeatId.value >= 0 && m.operationID === heroSeatId.value
  if (!isMyTurn) {
    if (actionBar.value.show) actionBar.value = { show: false, config: {} }
    return
  }
  const me = m.seats[heroSeatId.value]
  if (!me || !me.occupied || me.folded) { actionBar.value = { show: false, config: {} }; return }
  const stack = me.chips || 0
  const call = m.callAmount || 0        // 本轮最高注（房间级）
  const seatBet = me.bet || 0           // 本轮我已下注
  const toCall = Math.max(0, call - seatBet)
  const minRaise = m.minAnteNum || (m.bigBlind || 0)  // = 最小加注到(raise-to)
  const BB = m.bigBlind || 0
  const SB = m.smallBlind || 0
  // 滑条金额语义 = 本轮加注到(raise-to):上限 = 我的筹码+已下注(全下 raise-to)
  const cfg = { bet: { totalPot: m.pot || 0, callScore: toCall, seatScore: seatBet, minRaise, stack: stack + seatBet, BB, SB } }
  // 自己的倒计时（对齐 Cocos optUser.setOptV → edge.startCountdown）：中心「加注」键(0,0)正好盖住
  //   自己头像 → 座位导火索被按钮挡住看不见，Cocos 真值是把倒计时画在操作按钮圆边上——
  //   可过牌时在「过牌」键、面对下注在「弃牌」键（decrypted L908290/L908324）。
  //   TableActionBar 在 show=false→true 时启动内部计时（后续模型刷新不重启，不会闪/重置）。
  const secs = isSnapshot ? (m.leftOperateTime || m.opTime || 0) : (m.opTime || m.leftOperateTime || 0)
  cfg.countdown = { secs, total: m.opTime || secs }
  if (toCall <= 0) {
    // 无需跟注：右键=过牌；中心=下注（若还有筹码）
    cfg.fold = false
    cfg.right = { type: 'check' }
    cfg.center = stack > 0 ? (m.canRaise !== 0 ? { type: 'raise' } : { type: 'bet' }) : null
    if (stack > 0 && m.pot != null) cfg.center = { type: 'bet' }
  } else {
    // 面对下注：可弃/跟；跟注额 ≥ 身家 → 只能 all-in
    cfg.fold = true
    if (toCall >= stack) {
      cfg.right = { type: 'allin', amount: stack }
      cfg.center = null
    } else {
      cfg.right = { type: 'call', amount: toCall }
      cfg.center = (minRaise < stack && m.canRaise !== 0) ? { type: 'raise' } : { type: 'allin' }
    }
  }
  actionBar.value = { show: true, config: cfg }
}
// 操作条回调 → ACTION(409)。action: 1下注 2跟 3加 4全下 5过 6弃(老码,session 转 act 字符串)。
// 加注 amount = 本轮加注到的总额(raise-to);错误由 ERROR 推送经 onEvent('error') 提示。
async function onSelfAction(action, amount = 0) {
  const tgt = game.enterTarget
  const m = tableModel
  if (!tgt || !m) return
  closeActionBars()
  try {
    await sendAction({ action, anteNumber: amount, roomId: tgt.roomId })
  } catch (e) {
    errMsg.value = e.message || '操作失败'
  }
}
// 从操作条各事件映射到动作码（下注/加注都带金额；跟注金额由服务端定，传 callAmount 增量）。
function onActFold() { onSelfAction(6, 0) }
function onActCheck() { onSelfAction(5, 0) }
function onActCall() {
  const m = tableModel
  const me = m && m.seats[heroSeatId.value]
  const toCall = m ? Math.max(0, (m.callAmount || 0) - ((me && me.bet) || 0)) : 0
  onSelfAction(2, toCall)
}
function onActAllin() {
  const me = tableModel && tableModel.seats[heroSeatId.value]
  onSelfAction(4, (me && me.chips) || 0)
}
function onActRaise(amount) { onSelfAction(3, amount) }

function onClearSeats() {
  stopSim()
  reset()
  if (pixiStage.value) {
    pixiStage.value.clearDeal()
    pixiStage.value.clearCommunity()
    pixiStage.value.clearBets()
    pixiStage.value.clearDealer()
    pixiStage.value.clearPot()
    pixiStage.value.clearFolds()
    pixiStage.value.clearShowdown()
    pixiStage.value.clearGifts()
    pixiStage.value.clearAllins()
  }
  boardActive.value = false
  closeActionBars()
  showMenu.value = false
}
function onOpenSettings() {
  showMenu.value = false
  showSettings.value = true
}
function onOpenDealTest() {
  showMenu.value = false
  showDealTest.value = true
}
function onOpenCountdownTest() {
  showMenu.value = false
  showCountdownTest.value = true
}
function onOpenWinTest() {
  showMenu.value = false
  showWinTest.value = true
}
function onOpenCommunityTest() {
  showMenu.value = false
  showCommunityTest.value = true
}
function onOpenBetTest() {
  showMenu.value = false
  showBetTest.value = true
}
function onOpenBlindTest() {
  showMenu.value = false
  showBlindTest.value = true
}
function onOpenRotateTest() {
  showMenu.value = false
  showRotateTest.value = true
}
function onOpenActionTest() {
  showMenu.value = false
  showActionTest.value = true
}
function onOpenFoldTest() {
  showMenu.value = false
  showFoldTest.value = true
}
function onOpenShowdownTest() {
  showMenu.value = false
  showShowdownTest.value = true
}
function onOpenGiftTest() {
  showMenu.value = false
  showGiftTest.value = true
}
function onOpenAllinTest() {
  showMenu.value = false
  showAllinTest.value = true
}
function onOpenClearTest() {
  showMenu.value = false
  showClearTest.value = true
}
function onOpenSimTest() {
  showMenu.value = false
  showSimTest.value = true
}
// action bar(#5) + pre-action(#6): show the bar matching the chosen scene.
function onRunActionTest({ scene }) {
  showActionTest.value = false
  actionBar.value = { show: false, config: {} }
  preActionBar.value = { show: false, right: { type: 'check' } }
  // 复刻「轮到你」场景：自己(底部 seat0)入座 + 亮手牌（对照 200.jpg），否则操作条中心「加注」键
  // 会叠在空座的虚线「+」占位上（用户反馈点①）。再坐 2 个对手让牌桌更接近真机。
  reset()
  if (pixiStage.value) {
    pixiStage.value.clearBets()
    pixiStage.value.clearDealer()
  }
  seatOne(0, true)
  seatOne(2, false)
  seatOne(6, false)
  // 真值字段对照 optUser.setOptV / raiseOpt.init / allinBase.init：
  //   totalPot 底池, callScore 跟注额, seatScore 本轮已下注, minRaise 最小加注, stack 身家(=maxBet/allin), BB/SB 盲注
  const POT = 24000
  const BB = 2000
  const SB = 1000
  const STACK = 120000
  if (scene === 'pre') {
    preActionBar.value = { show: true, right: { type: 'call', amount: 4000 } }
    return
  }
  if (scene === 'check') {
    // 可过牌（无人下注）：下注=底池%，无 fold
    actionBar.value = {
      show: true,
      config: {
        fold: false,
        right: { type: 'check' },
        center: { type: 'bet' },
        bet: { totalPot: POT, callScore: 0, seatScore: 0, minRaise: BB, stack: STACK, BB, SB },
      },
    }
  } else if (scene === 'short') {
    // 短码：只能跟或 all-in（raise_allin 中心键 = All in）
    actionBar.value = {
      show: true,
      config: {
        fold: true,
        right: { type: 'call', amount: 4000 },
        center: { type: 'allin' },
      },
    }
  } else {
    // betFacing：面对下注，可弃/跟/加（加注开滑条 + 快捷加注行）
    actionBar.value = {
      show: true,
      config: {
        fold: true,
        right: { type: 'call', amount: 4000 },
        center: { type: 'raise' },
        bet: { totalPot: POT, callScore: 4000, seatScore: 0, minRaise: 8000, stack: STACK, BB, SB },
      },
    }
  }
  playSound('onTurn')
}
function closeActionBars() {
  actionBar.value = { show: false, config: {} }
  preActionBar.value = { show: false, right: { type: 'check' } }
}
// bet chips(#7) + pot(#10): chips fly seat->bet-spot, then optionally collect into the pot.
function onRunBetTest({ seat, amount, mode }) {
  showBetTest.value = false
  if (!pixiStage.value) return
  if (mode === 'reset') {
    pixiStage.value.clearBets()
    pixiStage.value.clearPot()
    return
  }
  if (mode === 'all') {
    seatPlayers(9, true)
    nextTick(() => {
      for (let i = 0; i < 9; i++) pixiStage.value.playBet(i, amount, { collect: true })
    })
    return
  }
  seatOne(seat, seat === 0)
  nextTick(() => {
    pixiStage.value.playBet(seat, amount, { collect: mode === 'collect' })
  })
}
// dealer button(#3) + blinds: seat 9 players, place D at dealer seat, post SB(d+1)/BB(d+2).
function onRunBlindTest({ dealer, sbAmount, bbAmount }) {
  showBlindTest.value = false
  if (!pixiStage.value) return
  seatPlayers(9, true)
  const sb = (dealer + 1) % 9
  const bb = (dealer + 2) % 9
  nextTick(() => {
    pixiStage.value.setDealer(dealer, false)
    pixiStage.value.postBlinds(sb, bb, sbAmount, bbAmount)
  })
}
// sit-down + seat rotation(#1): fill every other seat, then sit hero into `seat` so the
// whole ring rotates it down to the bottom (sitdownWithAni). Optional D/SB/BB to show
// markers + bet stacks riding the rotation.
function onRunRotateTest({ seat, withBlinds }) {
  showRotateTest.value = false
  if (!pixiStage.value) return
  reset()
  pixiStage.value.clearBets()
  pixiStage.value.clearPot()
  pixiStage.value.clearDealer()
  for (let i = 0; i < 9; i++) if (i !== seat) seatOne(i, false)
  nextTick(() => {
    if (withBlinds) {
      const dealer = (seat + 6) % 9
      pixiStage.value.setDealer(dealer, false)
      pixiStage.value.postBlinds((dealer + 1) % 9, (dealer + 2) % 9, 500, 1000)
    }
    sitDown(seat)
  })
}
// deal community cards at the center board (FLOP/TURN/RIVER/ALL), in-place flip reveal
function onRunCommunityTest({ round, peek }) {
  showCommunityTest.value = false
  boardActive.value = true // hide watermark + invite button (mid-hand)
  pixiStage.value && pixiStage.value.playCommunity(round, null, { peek })
}
// seat a player at the chosen position (self/other) then play the win/settlement effect there
function onRunWinTest({ seat, isSelf, amount, mode }) {
  showWinTest.value = false
  seatOne(seat, isSelf)
  nextTick(() => {
    pixiStage.value && pixiStage.value.playWin(seat, { isSelf, amount, mode: mode || 'holdem' })
  })
}
// seat a player at the chosen position (if empty) then start the timer-ring effect there
function onRunCountdownTest({ seat, seconds, style }) {
  showCountdownTest.value = false
  seatOne(seat, seat === 0)
  nextTick(() => {
    pixiStage.value && pixiStage.value.startCountdown(seat, seconds, style || 'fuse')
  })
}
// fold/muck(#12): seat player(s) then play the fold animation.
//   one    = 该座位弃牌（座位0=自己→手牌原地灰罩；其它→小牌背飞向中心 logo + 淡出）
//   others = 其余全部弃牌（保留所选座位不弃）
function onRunFoldTest({ seat, mode }) {
  showFoldTest.value = false
  if (!pixiStage.value) return
  if (mode === 'reset') {
    reset()
    pixiStage.value.clearFolds()
    return
  }
  reset()
  pixiStage.value.clearFolds()
  if (mode === 'others') {
    for (let i = 0; i < 9; i++) seatOne(i, i === 0)
    nextTick(() => {
      for (let i = 0; i < 9; i++) if (i !== seat) pixiStage.value.playFold(i)
    })
    return
  }
  seatOne(seat, seat === 0)
  nextTick(() => pixiStage.value.playFold(seat))
}
// 摊牌亮牌(#13): 坐 count 个玩家 + 发 5 张公牌，逐座开牌 → 最佳五张高亮、闲牌变暗，
//   真正胜者(7 张取最佳比大小)牌型转金 + 金环。
function onRunShowdownTest({ count, selfIn, mode }) {
  showShowdownTest.value = false
  if (!pixiStage.value) return
  if (mode === 'reset') {
    reset()
    pixiStage.value.clearShowdown()
    pixiStage.value.clearCommunity()
    boardActive.value = false
    return
  }
  reset()
  pixiStage.value.clearShowdown()
  pixiStage.value.clearCommunity()
  // 一副牌洗牌后切出 5 张公牌 + 每人 2 张底牌（互不重复）。
  const deck = [...CARD_VALUES]
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  const community = deck.splice(0, 5)
  const holes = []
  for (let i = 0; i < count; i++) holes.push([deck.shift(), deck.shift()])
  // 评估每座最佳五张 + 选出胜者（含并列）
  const hands = holes.map((h) => evaluateBest(h.concat(community)))
  const winnerSet = new Set(pickWinners(hands))
  for (let i = 0; i < count; i++) seatOne(i, selfIn && i === 0)
  boardActive.value = true
  nextTick(() => {
    pixiStage.value.playCommunity('STATIC', community)
    const participants = holes.map((hole, i) => ({
      nodeId: i,
      hole,
      best5: hands[i].best5,
      cat: hands[i].cat,
      catLabel: t(CAT_I18N[hands[i].cat]),
      winner: winnerSet.has(i),
    }))
    pixiStage.value.playShowdown(participants)
  })
}
// 送礼物(DragonBones)：坐上送礼/受赠双方(若空)，触发飞行 + 落点骨骼 burst。
function onRunGiftTest({ from, to, type, mode }) {
  showGiftTest.value = false
  if (!pixiStage.value) return
  if (mode === 'reset') {
    pixiStage.value.clearGifts()
    return
  }
  if (!seats.value[from] || !seats.value[from].player) seatOne(from, from === 0)
  if (from !== to && (!seats.value[to] || !seats.value[to].player)) seatOne(to, to === 0)
  nextTick(() => pixiStage.value.playGift(from, to, type))
}
// All-In 光环(#11)：坐上该座位(若空)后播 allin_action（入场扩散环 + 持续呼吸环 + 头像压暗）。
function onRunAllinTest({ seat, mode }) {
  showAllinTest.value = false
  if (!pixiStage.value) return
  if (mode === 'reset') {
    pixiStage.value.clearAllins()
    return
  }
  if (!seats.value[seat] || !seats.value[seat].player) seatOne(seat, seat === 0)
  nextTick(() => pixiStage.value.playAllin(seat))
}
// 清场 / 下一手(#15): 复刻 gameUI.cleanNotify。setup=true 先布置样例牌局(坐人 + 5 张公牌 +
//   下注堆/底池 + 庄盲标记 + 摊牌亮牌)再播清场，直观看到收牌+复位；setup=false 对当前牌局直接清场。
function onRunClearTest({ setup, mode }) {
  showClearTest.value = false
  if (!pixiStage.value) return
  const P = pixiStage.value
  if (mode === 'reset') {
    reset()
    P.clearClears()
    P.clearCommunity()
    P.clearShowdown()
    P.clearBets()
    P.clearDealer()
    P.clearPot()
    P.clearAllins()
    P.clearFolds()
    boardActive.value = false
    return
  }
  // 收牌动画跑完后由 playClear 的 onDone 复位 board/pot 标志（pixi 侧已重置 board/下注/标记/特效）。
  const runClear = () =>
    P.playClear(() => {
      boardActive.value = false
      pot.value = 0
    })
  if (!setup) {
    runClear()
    return
  }
  reset()
  P.clearShowdown()
  P.clearCommunity()
  P.clearBets()
  P.clearDealer()
  P.clearPot()
  const seatsIdx = [0, 2, 4, 6]
  const deck = [...CARD_VALUES]
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  const community = deck.splice(0, 5)
  const holes = seatsIdx.map(() => [deck.shift(), deck.shift()])
  const hands = holes.map((h) => evaluateBest(h.concat(community)))
  const winnerSet = new Set(pickWinners(hands))
  seatsIdx.forEach((s) => seatOne(s, s === 0))
  boardActive.value = true
  nextTick(() => {
    P.playCommunity('STATIC', community)
    P.setDealer(seatsIdx[0], false)
    P.postBlinds(seatsIdx[1], seatsIdx[2], 500, 1000) // sb/bb 飞筹码上桌
    P.playBet(seatsIdx[0], 1000)
    P.playBet(seatsIdx[3], 1000)
    P.setPot(7500)
    const participants = holes.map((hole, k) => ({
      nodeId: seatsIdx[k],
      hole,
      best5: hands[k].best5,
      cat: hands[k].cat,
      catLabel: t(CAT_I18N[hands[k].cat]),
      winner: winnerSet.has(k),
    }))
    P.playShowdown(participants)
    setTimeout(runClear, 1600) // 样例牌局先呈现 ~1.6s 再清场
  })
}

// ===== 整局演示 / 模拟（把 #0~#15 阶段串成一局自动流程，兼做集成测试）=====
//   时序：入座 → 庄位D+下盲 → 发手牌 → PRE_FLOP(倒计时+下注+收池) → FLOP/TURN/RIVER(每街下注收池)
//        → 摊牌亮牌 → 结算赢得效果 → 清场，loop=true 时清场后自动开下一手。
const handTimers = []
let handToken = 0
function clearHandTimers() {
  handTimers.forEach(clearTimeout)
  handTimers.length = 0
}
function stopSim() {
  handToken++
  clearHandTimers()
}
function runFullHand(opts = {}) {
  const P = pixiStage.value
  if (!P) return
  const n = Math.max(2, Math.min(6, opts.count || 4))
  const loop = !!opts.loop
  const token = ++handToken
  clearHandTimers()
  const at = (ms, fn) => handTimers.push(setTimeout(() => token === handToken && fn(), ms))

  // 0) 重置上一手 + 坐 n 人（seat0=自己），公牌/底池/标记/特效清空。
  reset()
  P.clearClears(); P.clearShowdown(); P.clearCommunity(); P.clearBets()
  P.clearDealer(); P.clearPot(); P.clearAllins(); P.clearFolds(); P.clearCountdown(0)
  boardActive.value = false
  pot.value = 0
  seatPlayers(n, true)
  const occupied = Array.from({ length: n }, (_, i) => i)

  // 从一副牌发：自己手牌沿用座位模型(已 faceUp)，其余从剩余牌堆发，保证摊牌与展示一致、不撞牌。
  const selfHole = (seats.value[0].player.cards || []).map((c) => c.value).filter(Boolean)
  const deck = CARD_VALUES.filter((v) => !selfHole.includes(v))
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  const board = deck.splice(0, 5)
  const holes = occupied.map((s) => (s === 0 ? selfHole : [deck.shift(), deck.shift()]))
  const hands = holes.map((h) => evaluateBest(h.concat(board)))
  const winners = pickWinners(hands)
  const winNode = occupied[winners[0]] ?? 0

  const sb = 1 % n
  const bb = 2 % n
  // 每街下注：各占用座位飞筹码上桌(错峰)，随后整桌收入底池。
  const betRound = (base, amt) => {
    occupied.forEach((s, i) => at(base + i * 130, () => P.playBet(s, amt)))
    at(base + occupied.length * 130 + 520, () => P.collectAllBets())
    return occupied.length * 130 + 520 + 360
  }

  let c = 0
  // 1) 庄位 D + 下盲
  at(c + 60, () => { P.setDealer(0, false); if (n >= 3) P.postBlinds(sb, bb, 500, 1000) })
  c += 750
  // 2) 发手牌（中心飞向各座，途中翻出真牌）
  at(c, () => {
    const targets = seats.value
      .filter((s) => s.player)
      .map((s) => ({ cx: s.cx, cy: s.cy, nodeId: s.nodeId, isSelf: s.player.isSelf, side: s.side }))
    P.playDeal(targets, revealSeatCard)
  })
  c += 1150
  // 3) PRE_FLOP：自己倒计时(德州圆环) + 一轮下注收池
  at(c, () => P.startCountdown(0, 6, 'ring'))
  c += betRound(c + 200, 1000) + 200
  // 4) FLOP
  at(c, () => { boardActive.value = true; P.playCommunity('FLOP', board) })
  c += 1500
  c += betRound(c, 1000)
  // 5) TURN
  at(c, () => P.playCommunity('TURN', board))
  c += 900
  c += betRound(c, 1500)
  // 6) RIVER
  at(c, () => P.playCommunity('RIVER', board))
  c += 900
  c += betRound(c, 2000)
  // 7) 摊牌亮牌（清掉残留倒计时）
  at(c, () => {
    P.clearCountdown(0)
    const participants = occupied.map((s, k) => ({
      nodeId: s,
      hole: holes[k],
      best5: hands[k].best5,
      cat: hands[k].cat,
      catLabel: t(CAT_I18N[hands[k].cat]),
      winner: winners.includes(k),
    }))
    P.playShowdown(participants)
  })
  c += occupied.length * 300 + 1300
  // 8) 结算：赢得效果（自己赢走 YouWin 滑入，否则单张 WIN），金额取当前底池
  at(c, () => P.playWin(winNode, { isSelf: winNode === 0, amount: pot.value, mode: 'holdem' }))
  c += 3600
  // 9) 清场 → 下一手
  at(c, () => P.playClear(() => { boardActive.value = false; pot.value = 0 }))
  c += 700
  if (loop) at(c + 900, () => runFullHand({ count: n, loop: true }))
}
function onRunSimTest({ count, loop, mode }) {
  showSimTest.value = false
  if (mode === 'stop') { stopSim(); return }
  nextTick(() => runFullHand({ count, loop }))
}
// seat n players then run the deal animation to each occupied seat
function onRunDealTest({ count, selfSeated }) {
  showDealTest.value = false
  reset()
  pixiStage.value && pixiStage.value.clearDeal()
  seatPlayers(count, selfSeated)
  nextTick(() => {
    const targets = seats.value
      .filter((s) => s.player)
      .map((s) => ({ cx: s.cx, cy: s.cy, nodeId: s.nodeId, isSelf: s.player.isSelf, side: s.side }))
    pixiStage.value && pixiStage.value.playDeal(targets, revealSeatCard)
  })
}
// 站起围观(对齐扯旋):
//   牌局中未弃牌 → 后端回 pending,这手继续打完,局末 PLAYER_STAND 才清座(recvLeave 驱动);
//   已弃牌/局间 → 立即站起,PLAYER_STAND 随后清座。两种都不在这里本地强清。
async function onStandUpSpectate(confirmFine = false) {
  showMenu.value = false
  const tgt = game.enterTarget
  const sid = heroSeatId.value
  if (!spectating.value || sid < 0 || !tgt) return
  try {
    const resp = await standUpSeat({ seatID: sid, roomId: tgt.roomId, confirmFine })
    // 盈利离桌罚金报价(对齐扯旋 ack 92):弹确认,确认后带 confirmFine 重发
    if (resp.needConfirm) {
      fineConfirm.value = { show: true, fine: resp.fine || 0, msg: resp.msg || '' }
      return
    }
    if (resp.status !== 0) {
      errMsg.value = `站起失败(status=${resp.status})`
      return
    }
    if (resp.pending) {
      errMsg.value = resp.msg || '本手结束后自动站起'
      return
    }
    standUpHeroLocal(sid)
  } catch (e) {
    errMsg.value = e.message || '站起失败'
  }
}
function onFineConfirm() {
  fineConfirm.value.show = false
  onStandUpSpectate(true)
}

// 留座暂离(放假):牌局中未弃牌先 PENDING,弃牌/局末生效;结果走 recvGrace 事件
async function onSeatReserveLeave() {
  showMenu.value = false
  const tgt = game.enterTarget
  if (!spectating.value || heroSeatId.value < 0 || !tgt) return
  try { await seatReserveLeave(tgt.roomId) } catch (e) { errMsg.value = e.message || '暂离失败' }
}
async function onSeatReserveResume() {
  const tgt = game.enterTarget
  if (!tgt) return
  try { await seatReserveResume(tgt.roomId) } catch (e) { errMsg.value = e.message || '回座失败' }
}

// 实时战绩(对齐扯旋 CHEXUANPlayerList,左侧侧滑):
//   顶部总带入/总积分 → 玩家列表(头像/昵称/ID/手数/周期倒计时/带入/输赢) →
//   围观人员网格 → 底部对局时长(走秒)。周期按每个玩家自己的累计游戏时间独立计。
let statsTick = null
const gameDuration = ref('')
async function onOpenStats() {
  showMenu.value = false
  const tgt = game.enterTarget
  if (!tgt) return
  statsPanel.value = { show: true, loading: true, players: [], viewers: [], settleTimeMins: 0, totalBringIn: 0, totalStack: 0, gameStartMs: 0 }
  try {
    const d = await realtimeStatsFlow(tgt.roomId)
    statsPanel.value = {
      show: true, loading: false,
      players: (d.players || []).sort((a, b) => b.profit - a.profit),
      viewers: d.viewers || [],
      settleTimeMins: (d.room && d.room.settleTimeMins) || 0,
      totalBringIn: (d.room && d.room.totalBringIn) || 0,
      totalStack: (d.room && d.room.totalStack) || 0,
      // 对局时长起点=本段第一手开局;0=还没开过局 → 隐藏计时(对齐扯旋 lastGameTime)
      gameStartMs: (d.room && d.room.gameStartMs) || 0,
    }
    // 面板打开期间:各玩家周期倒计时本地递减 + 底部对局时长走秒
    clearInterval(statsTick)
    const tick = () => {
      if (!statsPanel.value.show) { clearInterval(statsTick); return }
      for (const p of statsPanel.value.players) {
        if (p.remainingSecs > 0 && !p.awaitingBuyin && !p.sittingOut) p.remainingSecs--
      }
      if (statsPanel.value.gameStartMs > 0) {
        const ts = Math.max(0, Math.floor((Date.now() - statsPanel.value.gameStartMs) / 1000))
        const p2 = (n) => String(n).padStart(2, '0')
        gameDuration.value = `${p2(Math.floor(ts / 3600))}:${p2(Math.floor((ts % 3600) / 60))}:${p2(ts % 60)}`
      } else {
        gameDuration.value = ''
      }
    }
    tick()
    statsTick = setInterval(tick, 1000)
  } catch (e) {
    statsPanel.value.show = false
    errMsg.value = e.message || '获取战绩失败'
  }
}
function fmtRemain(secs) {
  if (secs == null) return '—'
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
onBeforeUnmount(() => clearInterval(statsTick))
// 底部菜单栏:score=实时战绩;chat/speak/emoji 待接
function onBottomMenu(key) {
  if (key === 'score') onOpenStats()
}

// 送礼(对齐扯旋161):列表来自后端 dz_gift_config,目标=其他在座玩家
async function onOpenGift() {
  showMenu.value = false
  const targets = []
  if (tableModel && Array.isArray(tableModel.seats)) {
    for (const s of tableModel.seats) {
      if (s && s.occupied && s.userId && s.userId !== game.user.userId) {
        targets.push({ userId: s.userId, nick: s.nick || `玩家${s.userId}`, seat: s.seat })
      }
    }
  }
  if (!targets.length) { errMsg.value = '桌上没有其他玩家可送'; return }
  giftPanel.value = { show: true, loading: true, gifts: [], sel: null, targets, target: targets[0].userId }
  try {
    const gifts = await giftListFlow()
    giftPanel.value.gifts = gifts
    giftPanel.value.sel = gifts.length ? gifts[0].id : null
  } catch (e) {
    giftPanel.value.show = false
    errMsg.value = e.message || '礼物列表加载失败'
  } finally {
    giftPanel.value.loading = false
  }
}

async function onSendGift() {
  const gp = giftPanel.value
  const tgt = game.enterTarget
  if (!gp.sel || !tgt) return
  try {
    await sendGiftFlow({ roomId: tgt.roomId, giftId: gp.sel, toUserId: gp.target })
    gp.show = false // 成功与否走 recvGift 广播/ERROR 提示
  } catch (e) {
    errMsg.value = e.message || '送礼失败'
  }
}

// 解散牌局(创建者/俱乐部管理):全房收 recvDismissed 回大厅
async function onDismissRoom() {
  showMenu.value = false
  const tgt = game.enterTarget
  if (!tgt) return
  try { await dismissRoomFlow(tgt.roomId) } catch (e) { errMsg.value = e.message || '解散失败' }
}
// 离开房间：已入座先发 action=3，再断 room 长连接回大厅。
async function onLeaveRoom() {
  showMenu.value = false
  stopSim()
  winTimer && clearTimeout(winTimer); winTimer = null
  closeInsurance()
  stopGraceCountdown()
  statsPanel.value.show = false
  fineConfirm.value.show = false
  const tgt = game.enterTarget
  if (spectating.value && tgt && heroSeatId.value >= 0) {
    try {
      await leaveRoomSeat({ seatID: heroSeatId.value, roomId: tgt.roomId })
    } catch (e) { void e }
    heroSeatId.value = -1
  }
  if (spectating.value) { leaveRoom(); game.clearEnterTarget(); spectating.value = false }
  router.push('/hall')
}
function onLeave() {
  if (spectating.value) { onLeaveRoom(); return }
  stopSim()
  winTimer && clearTimeout(winTimer); winTimer = null
  router.push('/hall')
}
function onCenterBtn() {}

// DEV-only test harness: lets screenshot scripts drive seating/rotation + dealer/blinds
// directly (e.g. verify D/SB/BB markers ride the seat ring during 入座旋转).
if (import.meta.env.DEV) {
  onMounted(() => {
    window.__tableTest = {
      reset,
      seatPlayers,
      seatOne,
      sitDown,
      setDealer: (...a) => pixiStage.value && pixiStage.value.setDealer(...a),
      postBlinds: (...a) => pixiStage.value && pixiStage.value.postBlinds(...a),
      clearDealer: () => pixiStage.value && pixiStage.value.clearDealer(),
      playFold: (...a) => pixiStage.value && pixiStage.value.playFold(...a),
      clearFolds: () => pixiStage.value && pixiStage.value.clearFolds(),
      playShowdown: (...a) => pixiStage.value && pixiStage.value.playShowdown(...a),
      clearShowdown: () => pixiStage.value && pixiStage.value.clearShowdown(),
      playCommunity: (...a) => pixiStage.value && pixiStage.value.playCommunity(...a),
      clearCommunity: () => pixiStage.value && pixiStage.value.clearCommunity(),
      playGift: (...a) => pixiStage.value && pixiStage.value.playGift(...a),
      clearGifts: () => pixiStage.value && pixiStage.value.clearGifts(),
      playAllin: (...a) => pixiStage.value && pixiStage.value.playAllin(...a),
      clearAllins: () => pixiStage.value && pixiStage.value.clearAllins(),
      playClear: (...a) => pixiStage.value && pixiStage.value.playClear(...a),
      clearClears: () => pixiStage.value && pixiStage.value.clearClears(),
      playBet: (...a) => pixiStage.value && pixiStage.value.playBet(...a),
      collectBet: (...a) => pixiStage.value && pixiStage.value.collectBet(...a),
      collectAllBets: () => pixiStage.value && pixiStage.value.collectAllBets(),
      clearBets: () => pixiStage.value && pixiStage.value.clearBets(),
      setPot: (...a) => pixiStage.value && pixiStage.value.setPot(...a),
      addPot: (...a) => pixiStage.value && pixiStage.value.addPot(...a),
      clearPot: () => pixiStage.value && pixiStage.value.clearPot(),
      setPots: (...a) => pixiStage.value && pixiStage.value.setPots(...a),
      clearPots: () => pixiStage.value && pixiStage.value.clearPots(),
      playHand: (opts) => runFullHand(opts || {}),
      stopHand: () => stopSim(),
      // 对局调试：直接弹带入弹窗（Unity 数据语义：倍率/单位/余额）/ 用一个 mock 模型驱动「轮到自己」操作条
      showBuyIn: (minRate = 20, maxRate = 200, unit = 2000, totalCoin = 400000, seatID = 0) =>
        openBuyIn(seatID, { minRate, maxRate, unit, totalCoin }),
      driveMock: (m) => driveFromModel(m, { isSnapshot: true }),
      driveMock2: (m, animateBoard) => driveFromModel(m, { animateBoard: !!animateBoard }),
      // 复现真实事件流：先 feedModel 建模型，再 feedEvent 走 handleGameEvent（含 playBet/collect/翻牌）
      feedModel: (m) => driveFromModel(m, { isSnapshot: true }),
      feedEvent: (type, data) => { spectating.value = true; handleGameEvent(type, data) },
      setMySeat: (id) => { heroSeatId.value = id; if (tableModel) tableModel.mySeatID = id },
      hasCountdown: (id) => !!(pixiStage.value && pixiStage.value.hasCountdown(id)),
      comSlotCount: () => (pixiStage.value ? pixiStage.value.comSlotCount() : -1),
      seatDebug: (id) => (pixiStage.value ? pixiStage.value.seatDebug(id) : null),
      setSpectating: (v) => { spectating.value = !!v },
      rotateTo: (nodeId) => rotateSeatToBottom(nodeId),
      rotateEmpty: () => rotateEmptyToBottom(),
      myUserId: game.user.userId,
    }
  })
}
</script>

<template>
  <div class="stage-root table">
    <!-- 进桌加载页：预加载牌桌资源时盖在最上，加载完揭开牌桌（对齐 Cocos preScene 进度条）-->
    <TableLoadingOverlay v-if="tableLoading" :percent="loadPct" />

    <!-- (1) bg layer: green felt or chosen tablecloth + bottom dark band -->
    <div class="felt" :class="{ 'has-bg': !!selectedBg }" :style="feltStyle">
      <div class="felt-bottom"></div>
    </div>

    <!-- (2) Pixi game layer: renders seats + deal animation + (later) effects -->
    <PixiStage ref="pixiStage" :seats="seats" @pot="onPixiPot" />

    <!-- 观战/进房错误提示 -->
    <div v-if="errMsg" class="table-err" @click="errMsg = ''">{{ errMsg }}</div>

    <!-- 保险(河牌保险):领先方购买面板 / 其他人决策中横幅 -->
    <div v-if="insOffer && !insOffer.mine" class="ins-banner">
      保险决策中… {{ insLeftSecs }}s
    </div>
    <div v-if="insOffer && insOffer.mine" class="ins-panel">
      <div class="ins-title">河牌保险 <span class="ins-timer">{{ insLeftSecs }}s</span></div>
      <div class="ins-row">
        反超牌 <b>{{ insOffer.outs }}</b> 张 · 赔率 <b>1:{{ (insOffer.oddsX100 / 100).toFixed(1) }}</b>
      </div>
      <div class="ins-row ins-outs">{{ (insOffer.outCards || []).join(' ') }}</div>
      <div class="ins-amounts">
        <button
          v-for="r in [0.25, 0.5, 1]"
          :key="r"
          class="ins-amt"
          :class="{ on: insAmount === Math.floor(insOffer.maxInsure * r) }"
          @click="insAmount = Math.floor(insOffer.maxInsure * r)"
        >{{ r === 1 ? '满池' : r === 0.5 ? '1/2池' : '1/4池' }}</button>
      </div>
      <div class="ins-row">
        投保 <b>{{ formatKNotation(insAmount) }}</b> · 保费 <b>{{ formatKNotation(insPremium(insAmount)) }}</b>
      </div>
      <div class="ins-btns">
        <button class="ins-btn pass" @click="buyInsurance(0)">不买</button>
        <button class="ins-btn buy" @click="buyInsurance(insAmount)">购买保险</button>
      </div>
    </div>

    <!-- 调试入口:右上角虫子图标,点开才显示调试信息(默认全部隐藏,不挡牌桌) -->
    <button class="dbg-btn" :class="{ on: showDebug }" @click="showDebug = !showDebug" aria-label="调试">🐛</button>
    <div v-if="showDebug" class="dbg-panel" @click.self="showDebug = false">
      <div class="dbg-box">
        <div class="dbg-title">调试信息 <span class="dbg-close" @click="showDebug = false">✕</span></div>
        <div v-if="specInfo" class="dbg-status">{{ specInfo }}</div>

        <template v-if="roomRules">
          <div class="dbg-sec">房间参数(建房时设置,服务端实际生效值)</div>
          <div class="dbg-rules">
            <span v-for="[k, label] in RULE_LABELS" :key="k" class="dbg-rule">
              {{ label }}<b>{{ ruleVal(roomRules[k]) }}</b>
            </span>
          </div>
        </template>

        <div class="dbg-sec">事件流(最近)</div>
        <div class="dbg-log">
          <div v-for="(line, i) in eventLog" :key="i" class="dbg-log-line">{{ line }}</div>
          <div v-if="!eventLog.length" class="dbg-log-line">暂无事件</div>
        </div>
      </div>
    </div>

    <!-- (3) HUD: centered design box; nodes placed by real scene coords -->
    <div class="content">
      <TableCenterOverlay
        :room="room"
        :center-label="centerLabel"
        :board-active="boardActive"
        :pot="pot"
        @center-click="onCenterBtn"
      />

      <!-- DOM seats now only provide the empty "+" placeholder + sit-down hit-area;
           occupied-seat visuals (avatar/cards/labels) are drawn by the Pixi game layer. -->
      <TableSeat
        v-for="s in seats"
        :key="s.id"
        :cx="s.cx"
        :cy="s.cy"
        :player="s.player"
        :side="s.side"
        :rotating="rotating"
        :pixi-mode="true"
        @sit="onSeatTap(s.nodeId)"
      />

      <TableTopMenu @open-menu="showMenu = true" />
      <TableBottomMenu @menu="onBottomMenu" />

      <!-- in-turn action bar (#5) + pre-action bar (#6) -->
      <TableActionBar
        :show="actionBar.show"
        :config="actionBar.config"
        @fold="onActFold"
        @check="onActCheck"
        @call="onActCall"
        @allin="onActAllin"
        @raise="onActRaise"
      />
      <TablePreActionBar :show="preActionBar.show" :right="preActionBar.right" />

      <!-- 带入弹窗（坐下成功后）→ REQ_GAME_ADD_CHIPS(28)。
           布局 1:1 Cocos buyin_panel.prefab（buyin_bring_layout 938 宽）：
           标题「带入(美元)」→ 金额框 848×212（icon 56 + 金额 fs100 左、xxBB fs56 右）→
           「货币余额」行（icon 35 + 余额；不足时右侧红字）→ 滑条 652×84 + 右端「最大 xx」→
           确认大按钮 848×124。数据对齐 Unity UIAddChipsComponent（整数倍率滑条）。
           点遮罩关闭 = Cocos backgroundNode TOUCH_START；占座(18)时关闭即站起（Unity onClickClose）。 -->
      <div v-if="buyIn.show" class="buyin-mask" @click.self="cancelBuyIn">
        <div class="buyin-box">
          <div class="buyin-title">{{ t('table.buyInTitle') }}</div>
          <div class="buyin-amount-frame" :class="{ short: buyInShort }">
            <img class="buyin-usd-icon" src="/assets/table/buyin/icon_usd.png" alt="" />
            <div class="buyin-amount">{{ formatKNotation(buyInAmount) }}</div>
            <div class="buyin-bb">{{ buyInBB }}BB</div>
          </div>
          <div class="buyin-balance-row">
            <span class="buyin-balance-title">{{ t('table.buyInBalance') }}</span>
            <span v-if="buyInShort" class="buyin-recharge">{{ t('table.buyInRecharge') }}</span>
          </div>
          <div class="buyin-balance-amount">
            <img class="buyin-coin-icon" src="/assets/table/buyin/icon_coin.png" alt="" />
            <span>{{ formatKNotation(buyIn.totalCoin) }}</span>
          </div>
          <div class="buyin-line"></div>
          <div class="buyin-slider-row">
            <input
              class="buyin-slider"
              type="range"
              :min="buyIn.minRate"
              :max="buyIn.maxRate"
              :step="1"
              v-model.number="buyIn.rate"
            />
            <span class="buyin-max">{{ t('table.buyInMax', { n: formatKNotation(buyIn.maxRate * buyIn.unit) }) }}</span>
          </div>
          <button class="buyin-confirm" :disabled="buyIn.busy || buyInShort" @click="confirmBuyIn">
            {{ t('table.buyInConfirm') }}
          </button>
        </div>
      </div>

      <!-- 放假(留座暂离)横幅:倒计时 + 回到座位(对齐扯旋282,重连不自动回座必须点) -->
      <div v-if="myGrace.active" class="grace-banner">
        <span>暂离中,{{ myGrace.leftSecs }}s 后自动站起</span>
        <button class="grace-resume" @click="onSeatReserveResume">回到座位</button>
      </div>

      <!-- 盈利离桌罚金确认(对齐扯旋 ack 92):确认后带 confirmFine 重发站起 -->
      <div v-if="fineConfirm.show" class="fine-mask" @click.self="fineConfirm.show = false">
        <div class="fine-box">
          <div class="fine-title">离桌罚金</div>
          <div class="fine-text">{{ fineConfirm.msg || `盈利离桌将扣除罚金 ${formatKNotation(fineConfirm.fine)}` }}</div>
          <div class="fine-btns">
            <button class="fine-btn cancel" @click="fineConfirm.show = false">再玩会儿</button>
            <button class="fine-btn ok" @click="onFineConfirm">确认站起</button>
          </div>
        </div>
      </div>

      <!-- 实时战绩(对齐扯旋 CHEXUANPlayerList):左侧侧滑面板 -->
      <div v-if="statsPanel.show" class="stats-mask side" @click.self="statsPanel.show = false">
        <div class="stats-side">
          <div class="stats-title">实时战绩</div>
          <div class="stats-total">
            <span>总带入 <b>{{ formatKNotation(statsPanel.totalBringIn) }}</b></span>
            <span>总积分 <b>{{ formatKNotation(statsPanel.totalStack) }}</b></span>
          </div>
          <div v-if="statsPanel.loading" class="stats-loading">加载中…</div>
          <template v-else>
            <div class="stats-head">
              <span class="c-player">玩家</span><span class="c-sm">手数</span><span class="c-sm">时间</span><span class="c-md">带入</span><span class="c-md">输赢</span>
            </div>
            <!-- 玩家列表区(占上方固定比例,独立滚动) -->
            <div class="stats-scroll">
              <div v-for="p in statsPanel.players" :key="p.userId" class="stats-row">
                <span class="c-player">
                  <img v-if="p.avatar" :src="p.avatar" class="sp-av" />
                  <span v-else class="sp-av sp-av-txt">{{ (p.nickname || '?')[0] }}</span>
                  <span class="sp-nick">
                    <i class="sp-name">{{ p.nickname }}{{ p.userId === game.user.userId ? '(我)' : '' }}</i>
                    <i class="sp-id">ID:{{ p.numberId || p.userId }}</i>
                  </span>
                </span>
                <span class="c-sm">{{ p.handCount || 0 }}</span>
                <span class="c-sm countdown" :class="{ soon: p.remainingSecs != null && p.remainingSecs < 300 }">
                  {{ p.awaitingBuyin ? '待补' : fmtRemain(p.remainingSecs) }}
                </span>
                <span class="c-md">{{ formatKNotation(p.bringIn) }}</span>
                <span class="c-md" :class="{ win: p.profit > 0, lose: p.profit < 0 }">
                  {{ p.profit > 0 ? '+' : '' }}{{ formatKNotation(p.profit) }}
                </span>
              </div>
              <div v-if="!statsPanel.players.length" class="stats-loading">暂无在座玩家</div>
            </div>

            <!-- 围观人员区(底部固定比例,独立滚动;对齐扯旋 viewers 网格) -->
            <div class="viewers-area">
              <div class="viewers-title">围观人员 ({{ statsPanel.viewers.length }})</div>
              <div class="viewers-scroll">
                <div v-if="statsPanel.viewers.length" class="viewers-grid">
                  <div v-for="v in statsPanel.viewers" :key="v.userId" class="viewer">
                    <img v-if="v.avatar" :src="v.avatar" class="vw-av" />
                    <span v-else class="vw-av vw-av-txt">{{ (v.nickname || '?')[0] }}</span>
                    <span class="vw-nick">{{ v.nickname }}</span>
                  </div>
                </div>
                <div v-else class="stats-loading small">暂无围观</div>
              </div>
            </div>
            <div v-if="gameDuration" class="stats-duration">对局时长 {{ gameDuration }}</div>
          </template>
        </div>
      </div>

      <!-- 送礼面板(对齐扯旋161/351):选礼物+受赠人,扣费源由后端配置决定 -->
      <div v-if="giftPanel.show" class="stats-mask" @click.self="giftPanel.show = false">
        <div class="gift-box">
          <div class="stats-title">送礼物</div>
          <div v-if="giftPanel.loading" class="stats-loading">加载中…</div>
          <template v-else>
            <div class="gift-label">选择礼物</div>
            <div class="gift-grid">
              <button
                v-for="g in giftPanel.gifts"
                :key="g.id"
                class="gift-item"
                :class="{ on: giftPanel.sel === g.id }"
                @click="giftPanel.sel = g.id"
              >
                <span class="g-name">{{ g.name }}</span>
                <span class="g-cost">{{ g.costScore }}</span>
              </button>
            </div>
            <div v-if="!giftPanel.gifts.length" class="stats-loading">暂无上架礼物</div>
            <div class="gift-label">送给</div>
            <div class="gift-grid">
              <button
                v-for="p in giftPanel.targets"
                :key="p.userId"
                class="gift-item"
                :class="{ on: giftPanel.target === p.userId }"
                @click="giftPanel.target = p.userId"
              >
                <span class="g-name">{{ p.nick }}</span>
              </button>
            </div>
            <button class="gift-send" :disabled="!giftPanel.sel || !giftPanel.target" @click="onSendGift">送出</button>
          </template>
          <button class="stats-close" @click="giftPanel.show = false">关闭</button>
        </div>
      </div>

      <!-- 周期结算面板(循环玩法):到点结算不离座 倒计时内补带入开新周期 超时自动站起 -->
      <div v-if="periodSettle.show" class="ps-mask">
        <div class="ps-box">
          <div class="ps-title">{{ periodSettle.data && periodSettle.data.reason === 'busted' ? t('table.psBusted') : t('table.psTitle') }}</div>
          <template v-if="periodSettle.data && periodSettle.data.reason === 'period'">
            <div class="ps-row"><span>{{ t('table.psPlayed') }}</span><b>{{ psFmtSecs(periodSettle.data.playedSecs) }}</b></div>
            <div class="ps-row"><span>{{ t('table.psBring') }}</span><b>{{ formatKNotation(periodSettle.data.bringIn) }}</b></div>
            <div class="ps-row"><span>{{ t('table.psFinal') }}</span><b>{{ formatKNotation(periodSettle.data.finalStack) }}</b></div>
            <div class="ps-row profit" :class="{ win: periodSettle.data.profit > 0, lose: periodSettle.data.profit < 0 }">
              <span>{{ t('table.psProfit') }}</span>
              <b>{{ periodSettle.data.profit > 0 ? '+' : '' }}{{ formatKNotation(periodSettle.data.profit) }}</b>
            </div>
            <div class="ps-row"><span>{{ t('table.psRake') }}</span><b>{{ formatKNotation(periodSettle.data.rake) }}</b></div>
            <div class="ps-row"><span>{{ t('table.psRefund') }}</span><b>{{ formatKNotation(periodSettle.data.refund) }}</b></div>
            <div class="ps-row"><span>{{ t('table.psHands') }}</span><b>{{ periodSettle.data.handCount }}（{{ periodSettle.data.winCount }}/{{ periodSettle.data.loseCount }}）</b></div>
          </template>
          <div class="ps-await">{{ t('table.psAwait', { n: periodSettle.leftSecs }) }}</div>
          <div class="ps-btns">
            <button class="ps-btn stand" @click="onPsStand">{{ t('table.psStand') }}</button>
            <button class="ps-btn rebuy" @click="onPsRebuy">{{ t('table.psRebuy') }}</button>
          </div>
        </div>
      </div>

      <TableMenuPopup
        :show="showMenu"
        :spectating="spectating"
        :seated="heroSeatId >= 0"
        :in-grace="myGrace.active"
        :is-creator="isRoomCreator"
        @close="showMenu = false"
        @settings="onOpenSettings"
        @stand-up-spectate="onStandUpSpectate()"
        @seat-reserve="onSeatReserveLeave"
        @seat-resume="onSeatReserveResume"
        @stats="onOpenStats"
        @gift="onOpenGift"
        @dismiss="onDismissRoom"
        @leave-room="onLeaveRoom"
        @rotate-test="onOpenRotateTest"
        @deal-test="onOpenDealTest"
        @countdown-test="onOpenCountdownTest"
        @community-test="onOpenCommunityTest"
        @win-test="onOpenWinTest"
        @bet-test="onOpenBetTest"
        @blind-test="onOpenBlindTest"
        @action-test="onOpenActionTest"
        @fold-test="onOpenFoldTest"
        @showdown-test="onOpenShowdownTest"
        @gift-test="onOpenGiftTest"
        @allin-test="onOpenAllinTest"
        @clear-test="onOpenClearTest"
        @sim-test="onOpenSimTest"
        @clear="onClearSeats"
        @leave="onLeave"
      />
      <TableSettingDialog
        :show="showSettings"
        :backgrounds="backgrounds"
        :selected-bg="selectedBg"
        @close="showSettings = false"
        @select="selectBg"
      />
      <TableDealTestDialog
        :show="showDealTest"
        @close="showDealTest = false"
        @test="onRunDealTest"
      />
      <TableCountdownTestDialog
        :show="showCountdownTest"
        @close="showCountdownTest = false"
        @test="onRunCountdownTest"
      />
      <TableWinTestDialog
        :show="showWinTest"
        @close="showWinTest = false"
        @test="onRunWinTest"
      />
      <TableBetTestDialog
        :show="showBetTest"
        @close="showBetTest = false"
        @test="onRunBetTest"
      />
      <TableBlindTestDialog
        :show="showBlindTest"
        @close="showBlindTest = false"
        @test="onRunBlindTest"
      />
      <TableRotateTestDialog
        :show="showRotateTest"
        @close="showRotateTest = false"
        @test="onRunRotateTest"
      />
      <TableActionTestDialog
        :show="showActionTest"
        @close="showActionTest = false"
        @test="onRunActionTest"
      />
      <TableFoldTestDialog
        :show="showFoldTest"
        @close="showFoldTest = false"
        @test="onRunFoldTest"
      />
      <TableShowdownTestDialog
        :show="showShowdownTest"
        @close="showShowdownTest = false"
        @test="onRunShowdownTest"
      />
      <TableGiftTestDialog
        :show="showGiftTest"
        @close="showGiftTest = false"
        @test="onRunGiftTest"
      />
      <TableAllinTestDialog
        :show="showAllinTest"
        @close="showAllinTest = false"
        @test="onRunAllinTest"
      />
      <TableClearTestDialog
        :show="showClearTest"
        @close="showClearTest = false"
        @test="onRunClearTest"
      />
      <TableSimTestDialog
        :show="showSimTest"
        @close="showSimTest = false"
        @test="onRunSimTest"
      />
      <TableCommunityTestDialog
        :show="showCommunityTest"
        @close="showCommunityTest = false"
        @test="onRunCommunityTest"
      />
    </div>
  </div>
</template>

<style scoped>
.table {
  background: #0c3a24;
}
.felt {
  position: absolute;
  inset: 0;
  background-color: #517a5d;
  background-image: radial-gradient(ellipse 85% 55% at 50% 40%, rgba(140, 175, 145, 0.5) 0%, rgba(140, 175, 145, 0) 70%);
}
.felt.has-bg {
  background-position: center;
  background-size: cover;
  background-repeat: no-repeat;
}
.felt-bottom {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 24%;
  background: linear-gradient(180deg, rgba(8, 40, 24, 0) 0%, rgba(7, 32, 19, 0.65) 100%);
}
.content {
  position: absolute;
  inset: 0;
  pointer-events: none;
  /* notch shift: long screens push the whole table down with the safe area */
  --shift: calc((var(--sat, 0px) - var(--sab, 0px)) / 2);
}
.content > * {
  pointer-events: auto;
}
/* 调试:虫子图标(右上角,半透明不挡视线) + 点开的面板 */
.dbg-btn {
  position: absolute;
  top: calc(96px * var(--s) + var(--sat, 0px));
  right: calc(12px * var(--s));
  z-index: 70;
  width: calc(64px * var(--s));
  height: calc(64px * var(--s));
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.35);
  font-size: calc(34px * var(--s));
  line-height: 1;
  opacity: 0.5;
  cursor: pointer;
}
.dbg-btn.on {
  opacity: 1;
  background: rgba(8, 192, 160, 0.35);
}
.dbg-panel {
  position: absolute;
  inset: 0;
  z-index: 69;
  background: rgba(0, 0, 0, 0.45);
}
.dbg-box {
  position: absolute;
  top: calc(170px * var(--s) + var(--sat, 0px));
  left: 50%;
  transform: translateX(-50%);
  width: calc(920px * var(--s));
  max-height: 62%;
  overflow-y: auto;
  padding: calc(24px * var(--s)) calc(28px * var(--s));
  border-radius: calc(20px * var(--s));
  background: rgba(10, 24, 18, 0.95);
  border: 1px solid rgba(92, 224, 192, 0.3);
}
.dbg-title {
  display: flex;
  justify-content: space-between;
  color: #5ce0c0;
  font-size: calc(32px * var(--s));
  font-weight: 600;
  margin-bottom: calc(14px * var(--s));
}
.dbg-close {
  cursor: pointer;
  color: #88a89c;
}
.dbg-status {
  color: #5ce0c0;
  font-size: calc(24px * var(--s));
  margin-bottom: calc(12px * var(--s));
  word-break: break-all;
}
.dbg-sec {
  color: #88a89c;
  font-size: calc(24px * var(--s));
  margin: calc(14px * var(--s)) 0 calc(8px * var(--s));
}
.dbg-rules {
  display: flex;
  flex-wrap: wrap;
  gap: calc(8px * var(--s));
}
.dbg-rule {
  background: rgba(92, 224, 192, 0.12);
  border-radius: calc(10px * var(--s));
  padding: calc(6px * var(--s)) calc(14px * var(--s));
  color: #b8d8cc;
  font-size: calc(22px * var(--s));
}
.dbg-rule b {
  color: #ffd23b;
  margin-left: calc(6px * var(--s));
}
.dbg-log {
  font-family: monospace;
  font-size: calc(20px * var(--s));
  line-height: 1.6;
  color: #9fe8d0;
}
.dbg-log-line {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.table-err {
  position: absolute;
  top: calc(120px * var(--s) + var(--sat, 0px));
  left: 50%;
  transform: translateX(-50%);
  z-index: 50;
  max-width: 80%;
  padding: calc(16px * var(--s)) calc(32px * var(--s));
  border-radius: calc(16px * var(--s));
  background: rgba(0, 0, 0, 0.75);
  color: #ff6b6b;
  font-size: calc(32px * var(--s));
  text-align: center;
}

/* 保险面板/横幅(河牌保险) */
.ins-banner {
  position: absolute;
  top: calc(200px * var(--s) + var(--sat, 0px));
  left: 50%;
  transform: translateX(-50%);
  z-index: 60;
  padding: calc(14px * var(--s)) calc(36px * var(--s));
  border-radius: calc(30px * var(--s));
  background: rgba(20, 39, 32, 0.9);
  border: 1px solid rgba(255, 200, 87, 0.5);
  color: #ffc857;
  font-size: calc(30px * var(--s));
}
.ins-panel {
  position: absolute;
  left: 50%;
  bottom: calc(520px * var(--s));
  transform: translateX(-50%);
  z-index: 72;
  width: calc(720px * var(--s));
  padding: calc(32px * var(--s)) calc(40px * var(--s));
  border-radius: calc(24px * var(--s));
  background: linear-gradient(180deg, #223c33 0%, #142720 100%);
  border: 1px solid rgba(255, 200, 87, 0.35);
  box-shadow: 0 calc(8px * var(--s)) calc(30px * var(--s)) rgba(0, 0, 0, 0.6);
  color: #fff;
}
.ins-title {
  font-size: calc(40px * var(--s));
  font-weight: 700;
  color: #ffc857;
  display: flex;
  justify-content: space-between;
  margin-bottom: calc(16px * var(--s));
}
.ins-timer { color: #ff6b6b; }
.ins-row {
  font-size: calc(30px * var(--s));
  color: #cfe3d8;
  margin: calc(8px * var(--s)) 0;
}
.ins-row b { color: #ffc857; }
.ins-outs {
  font-size: calc(26px * var(--s));
  color: #8fb3a3;
  word-break: break-all;
}
.ins-amounts {
  display: flex;
  gap: calc(16px * var(--s));
  margin: calc(16px * var(--s)) 0;
}
.ins-amt {
  flex: 1;
  padding: calc(14px * var(--s)) 0;
  border-radius: calc(12px * var(--s));
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: calc(28px * var(--s));
}
.ins-amt.on {
  border-color: #ffc857;
  background: rgba(255, 200, 87, 0.18);
  color: #ffc857;
}
.ins-btns {
  display: flex;
  gap: calc(20px * var(--s));
  margin-top: calc(20px * var(--s));
}
.ins-btn {
  flex: 1;
  padding: calc(18px * var(--s)) 0;
  border-radius: calc(14px * var(--s));
  border: none;
  font-size: calc(32px * var(--s));
  font-weight: 700;
}
.ins-btn.pass {
  background: rgba(255, 255, 255, 0.12);
  color: #cfe3d8;
}
.ins-btn.buy {
  background: linear-gradient(180deg, #ffd76e 0%, #f0a93c 100%);
  color: #4a2f00;
}
/* 带入弹窗 —— 布局 1:1 Cocos buyin_panel.prefab（尺寸按设计稿像素 × var(--s)）：
   buyin_bring_layout 938 宽；金额框 848×212（icon 56×58 + chou_ma_label fs100 左、bb fs56 右）；
   「货币余额」fs36 行 + 余额行（icon 35×37 + fs46）；分割线 808×2；滑条 652×84 + 右端最大额；
   confirm_button 848×124 fs50。配色贴 Cocos 深色面板（弹窗深灰绿 + 白字 + 边框）。 */
.buyin-mask {
  position: absolute;
  inset: 0;
  z-index: 70;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.7);
}
.buyin-box {
  width: calc(938px * var(--s));
  padding: calc(44px * var(--s)) calc(45px * var(--s));
  border-radius: calc(24px * var(--s));
  background: linear-gradient(180deg, #223c33 0%, #142720 100%);
  box-shadow: 0 calc(8px * var(--s)) calc(30px * var(--s)) rgba(0, 0, 0, 0.6);
  color: #fff;
  text-align: left;
}
/* bring_title：左上角 fs48 加粗 */
.buyin-title {
  font-size: calc(48px * var(--s));
  font-weight: 700;
  margin-bottom: calc(24px * var(--s));
}
/* bring_amount_container 848×212 带边框：icon + 大金额左、BB 右 */
.buyin-amount-frame {
  display: flex;
  align-items: center;
  height: calc(212px * var(--s));
  padding: 0 calc(40px * var(--s));
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: calc(16px * var(--s));
  background: rgba(0, 0, 0, 0.18);
}
.buyin-amount-frame.short {
  border-color: #b82b30; /* currency_not_enough_border：余额不足红框（Unity needCoin 红 b82b30） */
}
.buyin-usd-icon {
  width: calc(56px * var(--s));
  height: calc(58px * var(--s));
  margin-right: calc(24px * var(--s));
}
/* chou_ma_label fs100 */
.buyin-amount {
  font-size: calc(100px * var(--s));
  font-weight: 700;
  line-height: 1;
  color: #fff;
}
/* bb_chou_ma_label fs56 右端，色偏粉白(255,234,234) */
.buyin-bb {
  margin-left: auto;
  font-size: calc(56px * var(--s));
  color: rgb(255, 234, 234);
  opacity: 0.9;
}
/* balance_title fs36 + 不足红字（recharge_btn 文案色 255,61,78） */
.buyin-balance-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: calc(34px * var(--s));
  font-size: calc(36px * var(--s));
}
.buyin-balance-title {
  color: #cfe0d8;
}
.buyin-recharge {
  color: rgb(255, 61, 78);
}
/* main_currency：icon 35×37 + 金额 */
.buyin-balance-amount {
  display: flex;
  align-items: center;
  gap: calc(14px * var(--s));
  margin-top: calc(18px * var(--s));
  font-size: calc(40px * var(--s));
  color: #fff;
}
.buyin-coin-icon {
  width: calc(35px * var(--s));
  height: calc(37px * var(--s));
}
/* line 808×2 分割线 */
.buyin-line {
  height: 1px;
  margin: calc(28px * var(--s)) 0 calc(30px * var(--s));
  background: rgba(255, 255, 255, 0.18);
}
/* buyin_slider 652×84 + 右端 slider_max_text */
.buyin-slider-row {
  display: flex;
  align-items: center;
  gap: calc(24px * var(--s));
}
.buyin-slider {
  flex: 1;
  height: calc(24px * var(--s));
  accent-color: #ffb01e;
}
.buyin-max {
  font-size: calc(30px * var(--s));
  color: #d3a5a5;
  white-space: nowrap;
}
/* confirm_button 848×124 fs50 */
.buyin-confirm {
  width: 100%;
  height: calc(124px * var(--s));
  margin-top: calc(40px * var(--s));
  border: none;
  border-radius: calc(16px * var(--s));
  font-size: calc(50px * var(--s));
  font-weight: 700;
  cursor: pointer;
  background: linear-gradient(180deg, #ffc24b 0%, #ff8a1e 100%);
  color: #4a2600;
}
.buyin-confirm:disabled {
  opacity: 0.5;
  cursor: default;
}
/* ===== 送礼面板 ===== */
.gift-box {
  width: calc(760px * var(--s));
  max-height: 82%;
  overflow-y: auto;
  background: #20262e;
  border-radius: calc(24px * var(--s));
  padding: calc(36px * var(--s));
}
.gift-label {
  font-size: calc(30px * var(--s));
  color: #8e9395;
  margin: calc(18px * var(--s)) 0 calc(12px * var(--s));
}
.gift-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: calc(14px * var(--s));
}
.gift-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: calc(6px * var(--s));
  padding: calc(16px * var(--s)) calc(8px * var(--s));
  border: calc(3px * var(--s)) solid #39424d;
  border-radius: calc(14px * var(--s));
  background: #273039;
  cursor: pointer;
}
.gift-item.on {
  border-color: rgb(1, 175, 168);
  background: rgba(0, 68, 65, 0.45);
}
.g-name {
  color: #e8edf2;
  font-size: calc(30px * var(--s));
}
.g-cost {
  color: #ffd76a;
  font-size: calc(26px * var(--s));
}
.gift-send {
  width: 100%;
  height: calc(96px * var(--s));
  margin-top: calc(24px * var(--s));
  border: none;
  border-radius: calc(16px * var(--s));
  background: rgb(1, 175, 168);
  color: #06241f;
  font-size: calc(38px * var(--s));
  font-weight: 700;
  cursor: pointer;
}
.gift-send:disabled {
  background: #39424d;
  color: #8e9395;
}

/* 周期结算面板 */
.ps-mask {
  position: absolute;
  inset: 0;
  z-index: 72;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.7);
}
.ps-box {
  width: calc(880px * var(--s));
  padding: calc(44px * var(--s)) calc(50px * var(--s));
  border-radius: calc(24px * var(--s));
  background: linear-gradient(180deg, #223c33 0%, #142720 100%);
  box-shadow: 0 calc(8px * var(--s)) calc(30px * var(--s)) rgba(0, 0, 0, 0.6);
  color: #fff;
}
.ps-title {
  font-size: calc(48px * var(--s));
  font-weight: 700;
  text-align: center;
  margin-bottom: calc(30px * var(--s));
}
.ps-row {
  display: flex;
  justify-content: space-between;
  padding: calc(12px * var(--s)) 0;
  font-size: calc(36px * var(--s));
  color: #cfe0d8;
}
.ps-row b {
  color: #fff;
  font-weight: 600;
}
.ps-row.profit.win b {
  color: #5ce08c;
}
.ps-row.profit.lose b {
  color: #ff6b6b;
}
.ps-await {
  margin-top: calc(24px * var(--s));
  text-align: center;
  font-size: calc(30px * var(--s));
  color: #ffb01e;
}
.ps-btns {
  display: flex;
  gap: calc(24px * var(--s));
  margin-top: calc(30px * var(--s));
}
.ps-btn {
  flex: 1;
  height: calc(112px * var(--s));
  border: none;
  border-radius: calc(16px * var(--s));
  font-size: calc(42px * var(--s));
  font-weight: 700;
  cursor: pointer;
}
.ps-btn.stand {
  background: rgba(255, 255, 255, 0.14);
  color: #dfe9e4;
}
.ps-btn.rebuy {
  background: linear-gradient(180deg, #ffc24b 0%, #ff8a1e 100%);
  color: #4a2600;
}

/* ===== 暂离横幅 ===== */
.grace-banner {
  position: absolute;
  left: 50%;
  top: calc(var(--sat, 0px) + 220px * var(--s));
  transform: translateX(-50%);
  z-index: 52;
  display: flex;
  align-items: center;
  gap: calc(24px * var(--s));
  background: rgba(0, 0, 0, 0.75);
  border: 1px solid rgba(255, 215, 106, 0.5);
  border-radius: calc(999px * var(--s));
  padding: calc(14px * var(--s)) calc(30px * var(--s));
  color: #ffd76a;
  font-size: calc(32px * var(--s));
}
.grace-resume {
  border: none;
  border-radius: calc(999px * var(--s));
  padding: calc(10px * var(--s)) calc(28px * var(--s));
  background: linear-gradient(180deg, #ffc24b 0%, #ff8a1e 100%);
  color: #4a2600;
  font-size: calc(30px * var(--s));
  font-weight: 700;
  cursor: pointer;
}

/* ===== 罚金确认弹窗 ===== */
.fine-mask, .stats-mask {
  position: absolute;
  inset: 0;
  z-index: 60;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
}
.fine-box {
  width: calc(640px * var(--s));
  background: #20262e;
  border-radius: calc(24px * var(--s));
  padding: calc(40px * var(--s));
  text-align: center;
}
.fine-title {
  font-size: calc(44px * var(--s));
  font-weight: 700;
  color: #ffd76a;
  margin-bottom: calc(24px * var(--s));
}
.fine-text {
  font-size: calc(34px * var(--s));
  color: #dfe9e4;
  margin-bottom: calc(40px * var(--s));
  line-height: 1.5;
}
.fine-btns {
  display: flex;
  gap: calc(24px * var(--s));
}
.fine-btn {
  flex: 1;
  height: calc(104px * var(--s));
  border: none;
  border-radius: calc(16px * var(--s));
  font-size: calc(38px * var(--s));
  font-weight: 700;
  cursor: pointer;
}
.fine-btn.cancel {
  background: rgba(255, 255, 255, 0.14);
  color: #dfe9e4;
}
.fine-btn.ok {
  background: linear-gradient(180deg, #ff7a6b 0%, #e04638 100%);
  color: #fff;
}

/* ===== 实时战绩面板 ===== */
.stats-box {
  width: calc(780px * var(--s));
  max-height: 76%;
  overflow-y: auto;
  background: #20262e;
  border-radius: calc(24px * var(--s));
  padding: calc(36px * var(--s));
}
.stats-title {
  font-size: calc(44px * var(--s));
  font-weight: 700;
  color: #ffd76a;
  text-align: center;
  margin-bottom: calc(24px * var(--s));
}
.countdown {
  color: #5ce0c0;
  font-family: 'PKW-Chip', monospace;
}
.countdown.soon {
  color: #ffb14d;
}
/* 数字列统一用牌桌筹码字体 */
.stats-row .c-md {
  font-family: 'PKW-Chip', 'Microsoft YaHei', sans-serif;
}
.stats-row .c-sm {
  font-family: 'PKW-Chip', 'Microsoft YaHei', sans-serif;
}

/* 实时战绩左侧侧滑(对齐扯旋 CHEXUANPlayerList) */
.stats-mask.side {
  justify-content: flex-start;
  align-items: stretch;
  background: rgba(0, 0, 0, 0.2); /* 右侧留视野,遮罩轻一点 */
}
.stats-side {
  width: calc(760px * var(--s));
  max-width: 82%;
  height: 100%;
  display: flex;
  flex-direction: column;
  /* 对齐扯旋:面板 = 半透明黑 alpha 阴影,透出牌桌底色 */
  background: rgba(0, 0, 0, 0.62);
  backdrop-filter: blur(2px);
  padding: calc(30px * var(--s) + var(--sat, 0px)) calc(20px * var(--s)) calc(20px * var(--s) + var(--sab, 0px));
  animation: statsSlideIn 0.25s ease-out;
}
@keyframes statsSlideIn {
  from { transform: translateX(-100%); }
  to { transform: translateX(0); }
}
/* 汇总条(对齐扯旋 topGroup):深色横带,标签浅灰 + 数字白色大字(牌桌字体) */
.stats-total {
  display: flex;
  align-items: center;
  justify-content: space-evenly;
  background: rgba(0, 0, 0, 0.45);
  border-radius: calc(10px * var(--s));
  padding: calc(16px * var(--s)) 0;
  margin-bottom: calc(12px * var(--s));
  font-size: calc(26px * var(--s));
  color: #9fb5ab;
}
.stats-total b {
  font-family: 'PKW-Chip', 'Microsoft YaHei', sans-serif;
  font-weight: 400;
  font-size: calc(38px * var(--s));
  color: #ffffff;
  margin-left: calc(12px * var(--s));
}
/* 玩家列表:围观区 ≈ 3:1 固定比例(对齐扯旋排版),各自独立滚动 */
.stats-scroll {
  flex: 3;
  overflow-y: auto;
  min-height: 0;
}
.viewers-area {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  margin-top: calc(12px * var(--s));
}
.viewers-scroll {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}
.c-player {
  flex: 1.9;
  display: flex;
  align-items: center;
  gap: calc(10px * var(--s));
  min-width: 0;
}
.c-sm {
  flex: 0.7;
  text-align: center;
}
.c-md {
  flex: 1;
  text-align: right;
}
.sp-av {
  width: calc(64px * var(--s));
  height: calc(64px * var(--s));
  border-radius: 50%;
  object-fit: cover;
  flex: none;
}
.sp-av-txt {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #1c4a3a;
  color: #9fe8d0;
  font-size: calc(28px * var(--s));
}
.sp-nick {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.sp-name {
  font-style: normal;
  font-size: calc(26px * var(--s));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sp-id {
  font-style: normal;
  font-size: calc(20px * var(--s));
  color: #88a89c;
}
.viewers-title {
  padding: calc(14px * var(--s)) 0 calc(4px * var(--s));
  color: #cfe0d6;
  font-size: calc(28px * var(--s));
  font-weight: 600;
}
.viewers-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: calc(16px * var(--s)) calc(8px * var(--s));
  margin-top: calc(14px * var(--s));
}
.viewer {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: calc(6px * var(--s));
  min-width: 0;
}
.vw-av {
  width: calc(84px * var(--s));
  height: calc(84px * var(--s));
  border-radius: calc(18px * var(--s));
  object-fit: cover;
}
.vw-av-txt {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #1c4a3a;
  color: #9fe8d0;
  font-size: calc(32px * var(--s));
}
.vw-nick {
  max-width: 100%;
  font-size: calc(20px * var(--s));
  color: #b8d0c6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.stats-loading.small {
  padding: calc(20px * var(--s)) 0;
}
.stats-duration {
  text-align: center;
  padding-top: calc(16px * var(--s));
  color: #cfe0d6;
  font-size: calc(28px * var(--s));
  font-family: 'PKW-Chip', monospace;
}
.stats-loading {
  text-align: center;
  color: #9fb0c0;
  font-size: calc(32px * var(--s));
  padding: calc(30px * var(--s)) 0;
}
.stats-head, .stats-row {
  display: flex;
  align-items: center;
  padding: calc(14px * var(--s)) calc(8px * var(--s));
  font-size: calc(30px * var(--s));
}
.stats-head {
  color: #9fb0c0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}
.stats-row {
  color: #dfe9e4;
}
.stats-row:nth-child(even) {
  background: rgba(255, 255, 255, 0.04);
}
.c-name {
  flex: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.c-num {
  flex: 1;
  text-align: right;
}
.c-num.win { color: #6cd08c; }
.c-num.lose { color: #ff8a8a; }
.stats-close {
  display: block;
  width: 100%;
  margin-top: calc(28px * var(--s));
  height: calc(96px * var(--s));
  border: none;
  border-radius: calc(16px * var(--s));
  background: rgba(255, 255, 255, 0.14);
  color: #dfe9e4;
  font-size: calc(36px * var(--s));
  cursor: pointer;
}
</style>

<!-- shared (global) coordinate system: any .t-node placed by scene coords (--cx,--cy) -->
<style>
.t-node {
  position: absolute;
  left: calc(50% + var(--cx) * 1px * var(--s));
  top: calc(50% + var(--shift, 0px) + var(--cy) * 1px * var(--s));
  transform: translate(-50%, -50%);
}
</style>
