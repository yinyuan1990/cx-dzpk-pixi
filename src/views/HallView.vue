<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import HallBottomBar from '../components/HallBottomBar.vue'
import { roomListFlow, createRoomFlow, getLoginInfo } from '../net/session.js'
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

// ===== 创建房间 =====
const showCreate = ref(false)
const creating = ref(false)
const form = ref({ name: '', sb: 50, bb: 100, maxPlayers: 9, settleTimeMins: 30, rakePercent: 5 })
const BLIND_PRESETS = [
  { sb: 50, bb: 100 },
  { sb: 100, bb: 200 },
  { sb: 250, bb: 500 },
  { sb: 500, bb: 1000 },
  { sb: 1000, bb: 2000 },
]
const SETTLE_PRESETS = [30, 45, 60, 90, 120]

async function onCreate() {
  if (creating.value) return
  creating.value = true
  errMsg.value = ''
  try {
    const room = await createRoomFlow({
      name: form.value.name || undefined,
      sb: form.value.sb,
      bb: form.value.bb,
      maxPlayers: form.value.maxPlayers,
      settleTimeMins: form.value.settleTimeMins,
      rakePercent: form.value.rakePercent,
    })
    showCreate.value = false
    onEnter({ roomId: room.roomId, name: room.name, sb: room.sb, bb: room.bb })
  } catch (e) {
    errMsg.value = e.message || '创建失败'
  } finally {
    creating.value = false
  }
}

const activeTab = ref('hall')
function onTab(key) {
  if (key === 'friend') router.push('/friend')
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
      <button class="create-btn" @click="showCreate = true">+ {{ t('hall.create') }}</button>
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
            v-for="n in [2, 6, 9]"
            :key="n"
            class="c-opt"
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
            v-for="r in [0, 3, 5, 10]"
            :key="r"
            class="c-opt"
            :class="{ on: form.rakePercent === r }"
            @click="form.rakePercent = r"
          >{{ r }}%</button>
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
</style>
