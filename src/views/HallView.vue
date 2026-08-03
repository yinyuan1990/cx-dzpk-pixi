<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import HallBottomBar from '../components/HallBottomBar.vue'
import { roomListFlow, createRoomFlow, getLoginInfo, myRecordsFlow, roomOptionsFlow } from '../net/session.js'
import { useGameStore } from '../stores/game.js'
import { formatKNotation } from '../utils/format'

// 大厅:cx-dzpk WS 房间列表(402/452) + 创建房间(403/453)。
// 壳还原自 hallCommon.fire + findView.prefab + HallBottomBar。
const router = useRouter()
const { t } = useI18n()
const game = useGameStore()

const filters = ['NLHE']
const activeFilter = ref('NLHE')

const tables = ref([])
const loading = ref(false)
const errMsg = ref('')

function vmOf(r) {
  return {
    roomId: r.roomId,
    name: r.name || '#' + r.roomId,
    sb: r.sb,
    bb: r.bb,
    blinds: `${formatKNotation(r.sb)}/${formatKNotation(r.bb)}`,
    seats: `${r.maxPlayers || 9}人桌`,
    members: `${r.seated || 0}/${r.maxPlayers || 9}`,
    settle: r.settleTimeMins ? `${r.settleTimeMins}${t('hall.mins')}` : '',
    stage: r.stage === 'WAITING' ? t('hall.stageWaiting') : t('hall.stagePlaying'),
  }
}

async function loadRooms() {
  loading.value = true
  errMsg.value = ''
  try {
    const list = await roomListFlow()
    tables.value = list.map(vmOf)
  } catch (e) {
    errMsg.value = e.message || '加载牌局失败'
  } finally {
    loading.value = false
  }
}

let pollTimer = null
onMounted(() => {
  // 未登录(直接刷到 /hall)回登录页
  if (!getLoginInfo()) { router.replace('/login'); return }
  loadRooms()
  pollTimer = setInterval(loadRooms, 5000)
})
onBeforeUnmount(() => clearInterval(pollTimer))

function onEnter(tb) {
  game.setEnterTarget({
    roomId: tb.roomId,
    name: tb.name,
    sb: tb.sb,
    bb: tb.bb,
    incp: tb.bb, // 带入滑条单位 = 大盲
  })
  router.push('/table/' + tb.roomId)
}

// ===== 创建房间(参数对齐老德州建房,后端 RoomRules.parse 全量校验) =====
const showCreate = ref(false)
const creating = ref(false)
const form = ref({
  name: '', sb: 50, bb: 100, maxPlayers: 9, settleTimeMins: 30, rakePercent: 5,
  opTimeSec: 15,       // 思考时间(秒)
  anteMode: 0,         // 前注:0无 1半盲 2一个大盲
  inMaxRate: 4,        // 最大带入 = 100BB × 倍数(后端 inChip=100BB, inMinRate=1)
  straddleOn: false,   // 抓头
  insuranceOn: false,  // 保险(河牌保险)
  muckOn: false,       // 埋牌(只亮赢家)
  vpOn: false,         // 入池率
  ipLimitOn: false,    // 同 IP 限同桌
  gameMinTime: 0,      // 最短上桌(分钟,0=不限;>0 时关闭提前离桌)
  autoStartNum: 2,     // 自动开局人数
})
// 可选档全部来自后台配置(419 ROOM_OPTIONS,管理台「牌局参数」页可改);以下仅为拉取失败的兜底
const BLIND_PRESETS = ref([
  { sb: 50, bb: 100 },
  { sb: 100, bb: 200 },
  { sb: 250, bb: 500 },
  { sb: 500, bb: 1000 },
  { sb: 1000, bb: 2000 },
])
const SETTLE_PRESETS = ref([30, 45, 60, 90, 120])
const OPTIME_PRESETS = ref([10, 15, 20, 30])
const MAXRATE_PRESETS = ref([
  { rate: 2, label: '200BB' },
  { rate: 4, label: '400BB' },
  { rate: 10, label: '1000BB' },
])
const RAKE_PRESETS = ref([0, 3, 5, 10])
const ANTE_MODES = [
  { v: 0, label: '无' },
  { v: 1, label: '半盲' },
  { v: 2, label: '1大盲' },
]
const MINTIME_PRESETS = ref([
  { v: 0, label: '不限' },
  { v: 30, label: '30分钟' },
  { v: 60, label: '60分钟' },
])

// 打开建房弹窗时拉取后台档位;当前选中值不在档内时吸附到第一档
async function openCreate() {
  showCreate.value = true
  try {
    const o = await roomOptionsFlow()
    if (Array.isArray(o.blinds) && o.blinds.length) {
      BLIND_PRESETS.value = o.blinds.map((sb) => ({ sb: Number(sb), bb: Number(sb) * 2 }))
    }
    if (Array.isArray(o.settleTimes) && o.settleTimes.length) SETTLE_PRESETS.value = o.settleTimes.map(Number)
    if (Array.isArray(o.opTimes) && o.opTimes.length) OPTIME_PRESETS.value = o.opTimes.map(Number)
    if (Array.isArray(o.maxRates) && o.maxRates.length) {
      MAXRATE_PRESETS.value = o.maxRates.map((r) => ({ rate: Number(r), label: `${Number(r) * 100}BB` }))
    }
    if (Array.isArray(o.rakePercents) && o.rakePercents.length) RAKE_PRESETS.value = o.rakePercents.map(Number)
    if (Array.isArray(o.minTimes) && o.minTimes.length) {
      MINTIME_PRESETS.value = o.minTimes.map((v) => ({ v: Number(v), label: Number(v) === 0 ? '不限' : `${v}分钟` }))
    }
    const f = form.value
    if (!BLIND_PRESETS.value.some((p) => p.sb === f.sb)) {
      f.sb = BLIND_PRESETS.value[0].sb
      f.bb = BLIND_PRESETS.value[0].bb
    }
    if (!SETTLE_PRESETS.value.includes(f.settleTimeMins)) f.settleTimeMins = SETTLE_PRESETS.value[0]
    if (!OPTIME_PRESETS.value.includes(f.opTimeSec)) f.opTimeSec = OPTIME_PRESETS.value[0]
    if (!MAXRATE_PRESETS.value.some((p) => p.rate === f.inMaxRate)) f.inMaxRate = MAXRATE_PRESETS.value[0].rate
    if (!RAKE_PRESETS.value.includes(f.rakePercent)) f.rakePercent = RAKE_PRESETS.value[0]
    if (!MINTIME_PRESETS.value.some((p) => p.v === f.gameMinTime)) f.gameMinTime = MINTIME_PRESETS.value[0].v
  } catch (e) {
    console.warn('[hall] 建房档位拉取失败,用默认档', e)
  }
}
// 玩法开关(chips 行)
const RULE_SWITCHES = [
  { key: 'straddleOn', label: '抓头' },
  { key: 'insuranceOn', label: '保险' },
  { key: 'muckOn', label: '埋牌' },
  { key: 'vpOn', label: '入池率' },
  { key: 'ipLimitOn', label: 'IP限制' },
]

async function onCreate() {
  if (creating.value) return
  creating.value = true
  errMsg.value = ''
  const f = form.value
  const bb = f.sb * 2
  try {
    const room = await createRoomFlow({
      name: f.name || undefined,
      sb: f.sb,
      maxPlayers: f.maxPlayers,
      settleTimeMins: f.settleTimeMins,
      rakePercent: f.rakePercent,
      opTimeSec: f.opTimeSec,
      ante: f.anteMode === 2 ? bb : f.anteMode === 1 ? f.sb : 0,
      inChip: bb * 100,
      inMinRate: 1,
      inMaxRate: f.inMaxRate,
      straddleOn: f.straddleOn ? 1 : 0,
      insuranceOn: f.insuranceOn ? 1 : 0,
      muckOn: f.muckOn ? 1 : 0,
      vpOn: f.vpOn ? 1 : 0,
      ipLimitOn: f.ipLimitOn ? 1 : 0,
      gameMinTime: f.gameMinTime,
      aheadLeaveOn: f.gameMinTime > 0 ? 0 : 1,
      autoStartNum: Math.min(f.autoStartNum, f.maxPlayers),
    })
    showCreate.value = false
    onEnter({ roomId: room.roomId, name: room.name, sb: room.sb, bb: room.bb })
  } catch (e) {
    errMsg.value = e.message || '创建失败'
  } finally {
    creating.value = false
  }
}

// ===== 我的战绩(周期/站起结算记录,411/471) =====
const showRecords = ref(false)
const recLoading = ref(false)
const recData = ref({ records: [], stats: {} })
const REASON_TXT = { period: '周期结算', standup: '站起', leave: '离房', buyin_timeout: '超时站起' }
async function openRecords() {
  showRecords.value = true
  recLoading.value = true
  try {
    recData.value = await myRecordsFlow(30)
  } catch (e) {
    errMsg.value = e.message || '战绩加载失败'
  } finally {
    recLoading.value = false
  }
}
function recTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const p2 = (n) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${p2(d.getHours())}:${p2(d.getMinutes())}`
}
function signed(n) {
  return (n > 0 ? '+' : '') + formatKNotation(n || 0)
}

const activeTab = ref('hall')
function onTab(key) {
  if (key === 'friend') router.push('/friend')
  else if (key === 'game') router.push('/club')
  else activeTab.value = key
}
</script>

<template>
  <div class="stage-root hall">
    <!-- 顶部:头像 / 昵称 / 余额 -->
    <div class="top">
      <div class="user">
        <div class="avatar"></div>
        <div class="uinfo">
          <div class="nick">{{ game.user.nickname || 'Player' }}</div>
          <div class="balance">
            <span class="coin">&#9679;</span>
            <span class="amt">{{ formatKNotation(game.user.chips) }}</span>
          </div>
        </div>
      </div>
      <div class="top-icons">
        <button class="ic rec" @click="openRecords">战绩</button>
        <button class="ic" :disabled="loading" @click="loadRooms">&#8635;</button>
      </div>
    </div>

    <!-- Banner -->
    <div class="banner">
      <div class="banner-inner">德州扑克</div>
      <div class="dots"><i class="on"></i><i></i><i></i></div>
    </div>

    <!-- 玩法筛选 + 创建按钮 -->
    <div class="filters">
      <button
        v-for="f in filters"
        :key="f"
        class="filter"
        :class="{ on: activeFilter === f }"
        @click="activeFilter = f"
      >
        <span class="ftext" :data-text="f">{{ f }}</span>
        <span class="fline" v-show="activeFilter === f"></span>
      </button>
      <button class="create-btn" @click="openCreate">+ {{ t('hall.create') }}</button>
    </div>

    <!-- 牌局列表 -->
    <div class="list">
      <div class="item" v-for="tb in tables" :key="tb.roomId" @click="onEnter(tb)">
        <div class="row1">
          <span class="tname">{{ tb.name }}</span>
          <span class="tid">#{{ tb.roomId }}</span>
          <span class="tstage">{{ tb.stage }}</span>
        </div>
        <div class="row2">
          <span class="chip">&#9679;</span>
          <span class="blinds">{{ tb.blinds }}</span>
          <span class="seats">{{ tb.seats }}<template v-if="tb.settle"> · {{ tb.settle }}</template></span>
          <span class="members">{{ tb.members }}</span>
        </div>
      </div>
      <div v-if="!loading && tables.length === 0" class="hall-empty">{{ t('hall.emptyCreate') }}</div>
      <div v-if="errMsg" class="hall-err">{{ errMsg }}</div>
    </div>

    <!-- 我的战绩弹窗 -->
    <div v-if="showRecords" class="create-mask" @click.self="showRecords = false">
      <div class="create-box rec-box">
        <div class="c-title">我的战绩</div>
        <div v-if="recLoading" class="rec-loading">加载中…</div>
        <template v-else>
          <div class="rec-stats" v-if="recData.stats && recData.stats.sessions > 0">
            <div class="rs-item"><span>场次</span><b>{{ recData.stats.sessions }}</b></div>
            <div class="rs-item"><span>总手数</span><b>{{ recData.stats.totalHands }}</b></div>
            <div class="rs-item">
              <span>总盈亏</span>
              <b :class="{ win: recData.stats.totalProfit > 0, lose: recData.stats.totalProfit < 0 }">
                {{ signed(recData.stats.totalProfit) }}
              </b>
            </div>
          </div>
          <div class="rec-list">
            <div class="rec-item" v-for="(r, i) in recData.records" :key="i">
              <div class="ri-l">
                <div class="ri-name">{{ r.roomName || '#' + r.roomId }}</div>
                <div class="ri-sub">{{ REASON_TXT[r.reason] || r.reason }} · {{ r.handCount }}手({{ r.winCount }}胜{{ r.loseCount }}负) · {{ recTime(r.time) }}</div>
              </div>
              <div class="ri-r" :class="{ win: r.profit > 0, lose: r.profit < 0 }">{{ signed(r.profit) }}</div>
            </div>
            <div v-if="recData.records.length === 0" class="rec-empty">还没有完赛记录,打一局吧</div>
          </div>
        </template>
      </div>
    </div>

    <!-- 创建房间弹窗 -->
    <div v-if="showCreate" class="create-mask" @click.self="showCreate = false">
      <div class="create-box">
        <div class="c-title">{{ t('hall.create') }}</div>

        <div class="c-label">{{ t('hall.roomName') }}</div>
        <input v-model="form.name" class="c-input" :placeholder="game.user.nickname ? game.user.nickname + '的牌局' : '牌局名称'" maxlength="16" />

        <div class="c-label">{{ t('hall.blinds') }}</div>
        <div class="c-opts">
          <button
            v-for="p in BLIND_PRESETS"
            :key="p.bb"
            class="c-opt"
            :class="{ on: form.sb === p.sb }"
            @click="form.sb = p.sb; form.bb = p.bb"
          >{{ formatKNotation(p.sb) }}/{{ formatKNotation(p.bb) }}</button>
        </div>

        <div class="c-label">{{ t('hall.seatsLabel') }}</div>
        <div class="c-opts">
          <button
            v-for="n in [2, 3, 4, 5, 6, 7, 8, 9]"
            :key="n"
            class="c-opt c-opt-sm"
            :class="{ on: form.maxPlayers === n }"
            @click="form.maxPlayers = n"
          >{{ n }}人</button>
        </div>

        <div class="c-label">{{ t('hall.settleTime') }}</div>
        <div class="c-opts">
          <button
            v-for="m in SETTLE_PRESETS"
            :key="m"
            class="c-opt"
            :class="{ on: form.settleTimeMins === m }"
            @click="form.settleTimeMins = m"
          >{{ m }}{{ t('hall.mins') }}</button>
        </div>

        <div class="c-label">{{ t('hall.rake') }}</div>
        <div class="c-opts">
          <button
            v-for="r in RAKE_PRESETS"
            :key="r"
            class="c-opt"
            :class="{ on: form.rakePercent === r }"
            @click="form.rakePercent = r"
          >{{ r }}%</button>
        </div>

        <div class="c-label">思考时间</div>
        <div class="c-opts">
          <button
            v-for="s in OPTIME_PRESETS"
            :key="s"
            class="c-opt"
            :class="{ on: form.opTimeSec === s }"
            @click="form.opTimeSec = s"
          >{{ s }}秒</button>
        </div>

        <div class="c-label">最大带入(最小 100BB)</div>
        <div class="c-opts">
          <button
            v-for="p in MAXRATE_PRESETS"
            :key="p.rate"
            class="c-opt"
            :class="{ on: form.inMaxRate === p.rate }"
            @click="form.inMaxRate = p.rate"
          >{{ p.label }}</button>
        </div>

        <div class="c-label">前注</div>
        <div class="c-opts">
          <button
            v-for="a in ANTE_MODES"
            :key="a.v"
            class="c-opt"
            :class="{ on: form.anteMode === a.v }"
            @click="form.anteMode = a.v"
          >{{ a.label }}</button>
        </div>

        <div class="c-label">最短上桌</div>
        <div class="c-opts">
          <button
            v-for="p in MINTIME_PRESETS"
            :key="p.v"
            class="c-opt"
            :class="{ on: form.gameMinTime === p.v }"
            @click="form.gameMinTime = p.v"
          >{{ p.label }}</button>
        </div>

        <div class="c-label">玩法开关</div>
        <div class="c-opts">
          <button
            v-for="sw in RULE_SWITCHES"
            :key="sw.key"
            class="c-opt c-opt-sm"
            :class="{ on: form[sw.key] }"
            @click="form[sw.key] = !form[sw.key]"
          >{{ sw.label }}</button>
        </div>

        <button class="c-confirm" :disabled="creating" @click="onCreate">
          {{ creating ? t('hall.creating') : t('hall.createConfirm') }}
        </button>
      </div>
    </div>

    <HallBottomBar :active="activeTab" @change="onTab" />
  </div>
</template>

<style scoped>
.hall {
  background: #fff8f9;
  color: #2b2b2d;
}

.top {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: calc(180px * var(--s) + var(--sat, 0px));
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 calc(40px * var(--s));
  padding-top: calc(40px * var(--s) + var(--sat, 0px));
}
.user {
  display: flex;
  align-items: center;
  gap: calc(20px * var(--s));
}
.avatar {
  width: calc(96px * var(--s));
  height: calc(96px * var(--s));
  border-radius: 50%;
  background: linear-gradient(135deg, #14d3b6, #08c0a0);
}
.nick {
  font-size: calc(38px * var(--s));
  font-weight: 600;
}
.balance {
  display: flex;
  align-items: center;
  gap: calc(10px * var(--s));
  margin-top: calc(6px * var(--s));
}
.coin {
  color: #f4b740;
  font-size: calc(34px * var(--s));
}
.amt {
  font-size: calc(34px * var(--s));
  color: #555;
}
.top-icons {
  display: flex;
  gap: calc(24px * var(--s));
}
.ic {
  width: calc(72px * var(--s));
  height: calc(72px * var(--s));
  border: none;
  border-radius: 50%;
  background: #fff;
  font-size: calc(36px * var(--s));
  cursor: pointer;
}

.banner {
  position: absolute;
  top: calc(200px * var(--s) + var(--sat, 0px));
  left: 50%;
  transform: translateX(-50%);
  width: calc(1000px * var(--s));
  height: calc(334px * var(--s));
}
.banner-inner {
  width: 100%;
  height: 100%;
  border-radius: calc(24px * var(--s));
  background: linear-gradient(120deg, #0b3, #084 60%, #052);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: calc(64px * var(--s));
  font-weight: 700;
  letter-spacing: 2px;
}
.dots {
  position: absolute;
  bottom: calc(16px * var(--s));
  right: calc(24px * var(--s));
  display: flex;
  gap: calc(8px * var(--s));
}
.dots i {
  width: calc(14px * var(--s));
  height: calc(14px * var(--s));
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.5);
}
.dots i.on {
  background: #fff;
  width: calc(28px * var(--s));
  border-radius: 999px;
}

.filters {
  position: absolute;
  top: calc(580px * var(--s) + var(--sat, 0px));
  left: 0;
  width: 100%;
  height: calc(110px * var(--s));
  display: flex;
  align-items: center;
  gap: calc(40px * var(--s));
  padding: 0 calc(50px * var(--s));
  border-bottom: 1px solid #f0e8ea;
}
.filter {
  position: relative;
  border: none;
  background: transparent;
  font-size: calc(42px * var(--s));
  color: #9a9a9c;
  cursor: pointer;
}
.filter.on {
  color: #2b2b2d;
  font-weight: 700;
}
.ftext {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
}
.ftext::after {
  content: attr(data-text);
  height: 0;
  font-weight: 700;
  visibility: hidden;
  overflow: hidden;
  pointer-events: none;
}
.fline {
  position: absolute;
  bottom: calc(-20px * var(--s));
  left: 50%;
  transform: translateX(-50%);
  width: calc(60px * var(--s));
  height: calc(8px * var(--s));
  border-radius: 999px;
  background: #08c0a0;
}
.create-btn {
  margin-left: auto;
  height: calc(72px * var(--s));
  padding: 0 calc(36px * var(--s));
  border: none;
  border-radius: calc(36px * var(--s));
  background: linear-gradient(90deg, #14d3b6, #08c0a0);
  color: #fff;
  font-size: calc(36px * var(--s));
  font-weight: 600;
  cursor: pointer;
}

.list {
  position: absolute;
  top: calc(700px * var(--s) + var(--sat, 0px));
  left: 0;
  width: 100%;
  bottom: calc(250px * var(--s) + var(--sab, 0px));
  overflow-y: auto;
  padding: calc(20px * var(--s)) calc(32px * var(--s));
}
.item {
  height: calc(214px * var(--s));
  margin-bottom: calc(20px * var(--s));
  border-radius: calc(20px * var(--s));
  background: #fff;
  box-shadow: 0 calc(4px * var(--s)) calc(16px * var(--s)) rgba(0, 0, 0, 0.05);
  padding: calc(36px * var(--s)) calc(40px * var(--s));
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: calc(28px * var(--s));
  cursor: pointer;
}
.row1 {
  display: flex;
  align-items: center;
  gap: calc(20px * var(--s));
}
.tname {
  font-size: calc(46px * var(--s));
  font-weight: 700;
}
.tid {
  font-size: calc(34px * var(--s));
  color: #b0b0b0;
}
.tstage {
  margin-left: auto;
  font-size: calc(32px * var(--s));
  color: #08c0a0;
}
.row2 {
  display: flex;
  align-items: center;
  gap: calc(28px * var(--s));
  font-size: calc(38px * var(--s));
  color: #666;
}
.chip {
  color: #f4b740;
}
.members {
  margin-left: auto;
  color: #08c0a0;
  font-weight: 600;
}
.hall-empty {
  text-align: center;
  color: #9a9a9c;
  font-size: calc(36px * var(--s));
  padding: calc(80px * var(--s)) 0;
}
.hall-err {
  text-align: center;
  color: #e06a6a;
  font-size: calc(32px * var(--s));
  padding: calc(20px * var(--s));
}

/* 创建房间弹窗 */
.create-mask {
  position: absolute;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
}
.create-box {
  width: calc(938px * var(--s));
  max-height: 86%;
  overflow-y: auto;
  padding: calc(44px * var(--s)) calc(45px * var(--s));
  border-radius: calc(24px * var(--s));
  background: #fff;
  box-shadow: 0 calc(8px * var(--s)) calc(30px * var(--s)) rgba(0, 0, 0, 0.25);
}
.c-title {
  font-size: calc(48px * var(--s));
  font-weight: 700;
  margin-bottom: calc(24px * var(--s));
}
.c-label {
  font-size: calc(34px * var(--s));
  color: #888;
  margin: calc(28px * var(--s)) 0 calc(14px * var(--s));
}
.c-input {
  width: 100%;
  height: calc(100px * var(--s));
  border: 1px solid #e6e6e6;
  border-radius: calc(16px * var(--s));
  background: #f7f7f8;
  padding: 0 calc(28px * var(--s));
  font-size: calc(38px * var(--s));
  outline: none;
}
.c-opts {
  display: flex;
  flex-wrap: wrap;
  gap: calc(16px * var(--s));
}
.c-opt {
  height: calc(76px * var(--s));
  padding: 0 calc(28px * var(--s));
  border: 1px solid #e0e0e0;
  border-radius: calc(38px * var(--s));
  background: #fff;
  font-size: calc(32px * var(--s));
  color: #555;
  cursor: pointer;
}
.c-opt.on {
  border-color: #08c0a0;
  background: #e8faf5;
  color: #08a88c;
  font-weight: 600;
}
.c-opt-sm {
  padding: 0 calc(20px * var(--s));
  font-size: calc(28px * var(--s));
}
.c-confirm {
  width: 100%;
  height: calc(112px * var(--s));
  margin-top: calc(44px * var(--s));
  border: none;
  border-radius: calc(56px * var(--s));
  background: linear-gradient(90deg, #14d3b6, #08c0a0);
  color: #fff;
  font-size: calc(42px * var(--s));
  font-weight: 600;
  cursor: pointer;
}
.c-confirm:disabled {
  opacity: 0.6;
}

/* 我的战绩 */
.ic.rec {
  width: auto;
  padding: 0 calc(28px * var(--s));
  border-radius: calc(36px * var(--s));
  font-size: calc(30px * var(--s));
  color: #08a88c;
  font-weight: 600;
}
.rec-box {
  max-height: 78%;
}
.rec-loading,
.rec-empty {
  text-align: center;
  color: #9a9a9c;
  font-size: calc(34px * var(--s));
  padding: calc(60px * var(--s)) 0;
}
.rec-stats {
  display: flex;
  gap: calc(16px * var(--s));
  margin: calc(20px * var(--s)) 0 calc(28px * var(--s));
}
.rs-item {
  flex: 1;
  background: #f7f7f8;
  border-radius: calc(16px * var(--s));
  padding: calc(20px * var(--s)) 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: calc(8px * var(--s));
}
.rs-item span {
  font-size: calc(28px * var(--s));
  color: #999;
}
.rs-item b {
  font-size: calc(38px * var(--s));
}
.rec-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: calc(24px * var(--s)) calc(8px * var(--s));
  border-bottom: 1px solid #f0f0f0;
}
.ri-name {
  font-size: calc(36px * var(--s));
  font-weight: 600;
}
.ri-sub {
  font-size: calc(28px * var(--s));
  color: #9a9a9c;
  margin-top: calc(6px * var(--s));
}
.ri-r {
  font-size: calc(40px * var(--s));
  font-weight: 700;
  color: #666;
}
.win {
  color: #0aa06e;
}
.lose {
  color: #e05a5a;
}
</style>
