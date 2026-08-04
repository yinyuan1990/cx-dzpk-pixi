<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { createRoomFlow, roomOptionsFlow } from '../net/session.js'
import { useGameStore } from '../stores/game.js'
import { formatKNotation } from '../utils/format'

// 建房独立页面(对标 Unity 建房排版,参考 1.jpg):
// 大厅不再建房,只有俱乐部(群主/管理员)从俱乐部详情进入本页;
// 可选档全部来自后台配置(419 ROOM_OPTIONS,管理台「牌局参数」页可改)。
const router = useRouter()
const route = useRoute()
const game = useGameStore()

const clubId = Number(route.params.clubId || 0)
const clubName = String(route.query.clubName || '')

const creating = ref(false)
const errMsg = ref('')
const showAdvanced = ref(false)

const form = ref({
  name: '',
  blindIdx: 0,         // 盲注档下标(滑条)
  maxPlayers: 9,
  settleIdx: 0,        // 时长档下标(滑条)
  rakePercent: 0,      // 服务费%(滑条,后台可配上限)
  opTimeSec: 15,
  anteMode: 0,         // 前注:0无 1半盲 2一个大盲
  inMinRate: 1,        // 带入倍数区间(带入 = 100BB × 倍数)
  inMaxRate: 4,
  straddleOn: false,
  insuranceOn: false,
  muckOn: false,
  vpOn: false,
  ipLimitOn: false,
  gpsLimitOn: false,
  gameMinTime: 0,
  autoStartNum: 2,
})

// 拉取失败时的兜底档(正常都会被后台配置覆盖)
const BLIND_PRESETS = ref([
  { sb: 50, bb: 100 }, { sb: 100, bb: 200 }, { sb: 250, bb: 500 },
  { sb: 500, bb: 1000 }, { sb: 1000, bb: 2000 },
])
const SETTLE_PRESETS = ref([30, 45, 60, 90, 120])
const OPTIME_PRESETS = ref([10, 15, 20, 30])
const RAKE_MAX = ref(5)
const IN_RATE_MAX = ref(8)
const MINTIME_PRESETS = ref([
  { v: 0, label: '不限' }, { v: 30, label: '30分钟' }, { v: 60, label: '60分钟' },
])

const curBlind = computed(() => BLIND_PRESETS.value[form.value.blindIdx] || BLIND_PRESETS.value[0])
const curSettle = computed(() => SETTLE_PRESETS.value[form.value.settleIdx] ?? SETTLE_PRESETS.value[0])

async function loadOptions() {
  try {
    const o = await roomOptionsFlow()
    if (Array.isArray(o.blinds) && o.blinds.length) {
      BLIND_PRESETS.value = o.blinds.map((sb) => ({ sb: Number(sb), bb: Number(sb) * 2 }))
    }
    if (Array.isArray(o.settleTimes) && o.settleTimes.length) SETTLE_PRESETS.value = o.settleTimes.map(Number)
    if (Array.isArray(o.opTimes) && o.opTimes.length) OPTIME_PRESETS.value = o.opTimes.map(Number)
    if (o.rakeMax != null) RAKE_MAX.value = Number(o.rakeMax)
    if (o.inRateMax != null) IN_RATE_MAX.value = Number(o.inRateMax)
    if (Array.isArray(o.minTimes) && o.minTimes.length) {
      MINTIME_PRESETS.value = o.minTimes.map((v) => ({ v: Number(v), label: Number(v) === 0 ? '不限' : `${v}分钟` }))
    }
  } catch (e) {
    console.warn('[createRoom] 建房档位拉取失败,用默认档', e)
  }
  const f = form.value
  if (f.blindIdx >= BLIND_PRESETS.value.length) f.blindIdx = 0
  if (f.settleIdx >= SETTLE_PRESETS.value.length) f.settleIdx = 0
  if (!OPTIME_PRESETS.value.includes(f.opTimeSec)) f.opTimeSec = OPTIME_PRESETS.value[0]
  if (f.rakePercent > RAKE_MAX.value) f.rakePercent = RAKE_MAX.value
  if (f.inMaxRate > IN_RATE_MAX.value) f.inMaxRate = IN_RATE_MAX.value
  if (f.inMinRate > f.inMaxRate) f.inMinRate = 1
  if (!MINTIME_PRESETS.value.some((p) => p.v === f.gameMinTime)) f.gameMinTime = MINTIME_PRESETS.value[0].v
}
onMounted(loadOptions)

// 带入倍数双把手:拖动时互相约束(min ≤ max)
function onMinRate(v) {
  form.value.inMinRate = Number(v)
  if (form.value.inMaxRate < form.value.inMinRate) form.value.inMaxRate = form.value.inMinRate
}
function onMaxRate(v) {
  form.value.inMaxRate = Number(v)
  if (form.value.inMinRate > form.value.inMaxRate) form.value.inMinRate = form.value.inMaxRate
}

async function onCreate() {
  if (creating.value) return
  creating.value = true
  errMsg.value = ''
  const f = form.value
  const sb = curBlind.value.sb
  const bb = curBlind.value.bb
  try {
    const room = await createRoomFlow({
      name: f.name || undefined,
      sb,
      maxPlayers: f.maxPlayers,
      settleTimeMins: curSettle.value,
      rakePercent: f.rakePercent,
      opTimeSec: f.opTimeSec,
      ante: f.anteMode === 2 ? bb : f.anteMode === 1 ? sb : 0,
      inChip: bb * 100,
      inMinRate: f.inMinRate,
      inMaxRate: f.inMaxRate,
      straddleOn: f.straddleOn ? 1 : 0,
      insuranceOn: f.insuranceOn ? 1 : 0,
      muckOn: f.muckOn ? 1 : 0,
      vpOn: f.vpOn ? 1 : 0,
      ipLimitOn: f.ipLimitOn ? 1 : 0,
      gpsLimitOn: f.gpsLimitOn ? 1 : 0,
      gameMinTime: f.gameMinTime,
      aheadLeaveOn: f.gameMinTime > 0 ? 0 : 1,
      autoStartNum: Math.min(f.autoStartNum, f.maxPlayers),
      clubId,
    })
    game.setEnterTarget({ roomId: room.roomId, name: room.name, sb: room.sb, bb: room.bb, incp: room.bb })
    router.replace('/table/' + room.roomId)
  } catch (e) {
    errMsg.value = e.message || '创建失败'
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div class="stage-root cr-page">
    <!-- 顶栏 -->
    <div class="cr-top">
      <button class="cr-back" @click="router.back()">&lt;</button>
      <span class="cr-title">德州</span>
      <span v-if="clubName" class="cr-club">{{ clubName }}</span>
    </div>

    <!-- 滚动表单 -->
    <div class="cr-scroll">
      <!-- 卡片:盲注 / Straddle / 前注 -->
      <div class="cr-card">
        <div class="cr-attr-row">
          <span class="cr-attr-label">牌桌属性</span>
          <span class="cr-attr-pill">俱乐部局</span>
        </div>
        <div class="cr-divider"></div>

        <div class="cr-head3">
          <span class="cr-h3-label">小盲/大盲:</span>
          <span class="cr-h3-label cr-center">Straddle
            <button class="cr-toggle" :class="{ on: form.straddleOn }" @click="form.straddleOn = !form.straddleOn"><i></i></button>
          </span>
          <span class="cr-h3-label cr-right">Ante
            <select v-model.number="form.anteMode" class="cr-select cr-select-sm">
              <option :value="0">0</option>
              <option :value="1">半盲</option>
              <option :value="2">1BB</option>
            </select>
          </span>
        </div>
        <div class="cr-big">{{ formatKNotation(curBlind.sb) }}/{{ formatKNotation(curBlind.bb) }}</div>
        <input type="range" class="cr-slider" min="0" :max="BLIND_PRESETS.length - 1" step="1"
          v-model.number="form.blindIdx" />
        <div class="cr-ticks">
          <span v-for="(p, i) in BLIND_PRESETS" :key="p.sb" :class="{ on: i === form.blindIdx }">
            {{ formatKNotation(p.sb) }}
          </span>
        </div>
      </div>

      <!-- 卡片:带入范围(双滑条) -->
      <div class="cr-card">
        <div class="cr-cols">
          <div class="cr-col">
            <div class="cr-sub">最小带入</div>
            <div class="cr-big">{{ form.inMinRate * 100 }}BB</div>
            <input type="range" class="cr-slider" min="1" :max="IN_RATE_MAX" step="1"
              :value="form.inMinRate" @input="onMinRate($event.target.value)" />
          </div>
          <div class="cr-col">
            <div class="cr-sub">最大带入</div>
            <div class="cr-big">{{ form.inMaxRate * 100 }}BB</div>
            <input type="range" class="cr-slider" min="1" :max="IN_RATE_MAX" step="1"
              :value="form.inMaxRate" @input="onMaxRate($event.target.value)" />
          </div>
        </div>
      </div>

      <!-- 卡片:时长(滑条+刻度) -->
      <div class="cr-card">
        <div class="cr-sub">时长</div>
        <div class="cr-big">{{ curSettle }}分钟</div>
        <input type="range" class="cr-slider" min="0" :max="SETTLE_PRESETS.length - 1" step="1"
          v-model.number="form.settleIdx" />
        <div class="cr-ticks">
          <span v-for="(m, i) in SETTLE_PRESETS" :key="m" :class="{ on: i === form.settleIdx }">{{ m }}</span>
        </div>
      </div>

      <!-- 卡片:人数 -->
      <div class="cr-card cr-row-card">
        <span class="cr-row-label">牌桌人数</span>
        <select v-model.number="form.maxPlayers" class="cr-select">
          <option v-for="n in [2, 3, 4, 5, 6, 7, 8, 9]" :key="n" :value="n">{{ n }}</option>
        </select>
      </div>

      <!-- 开关卡片 -->
      <div class="cr-card cr-row-card">
        <span class="cr-row-label">保险(河牌保险)</span>
        <button class="cr-toggle" :class="{ on: form.insuranceOn }" @click="form.insuranceOn = !form.insuranceOn"><i></i></button>
      </div>
      <div class="cr-card cr-row-card">
        <span class="cr-row-label">埋牌(只亮赢家)</span>
        <button class="cr-toggle" :class="{ on: form.muckOn }" @click="form.muckOn = !form.muckOn"><i></i></button>
      </div>

      <!-- 高级设置(可折叠) -->
      <div class="cr-card cr-row-card cr-adv-head" @click="showAdvanced = !showAdvanced">
        <span class="cr-row-label">高级设置</span>
        <span class="cr-adv-arrow">{{ showAdvanced ? '收起 ∧' : '展开 ∨' }}</span>
      </div>
      <template v-if="showAdvanced">
        <div class="cr-card">
          <div class="cr-sub">服务费(费率) <b class="cr-val">{{ form.rakePercent }}%</b></div>
          <input type="range" class="cr-slider" min="0" :max="RAKE_MAX" step="1" v-model.number="form.rakePercent" />
          <div class="cr-ticks">
            <span v-for="i in RAKE_MAX + 1" :key="i" :class="{ on: i - 1 === form.rakePercent }">{{ i - 1 }}</span>
          </div>
        </div>
        <div class="cr-card cr-row-card">
          <span class="cr-row-label">思考时间</span>
          <select v-model.number="form.opTimeSec" class="cr-select">
            <option v-for="s in OPTIME_PRESETS" :key="s" :value="s">{{ s }}秒</option>
          </select>
        </div>
        <div class="cr-card cr-row-card">
          <span class="cr-row-label">最短上桌</span>
          <select v-model.number="form.gameMinTime" class="cr-select">
            <option v-for="p in MINTIME_PRESETS" :key="p.v" :value="p.v">{{ p.label }}</option>
          </select>
        </div>
        <div class="cr-card cr-row-card">
          <span class="cr-row-label">自动开局人数</span>
          <select v-model.number="form.autoStartNum" class="cr-select">
            <option v-for="n in form.maxPlayers - 1" :key="n" :value="n + 1">{{ n + 1 }}人</option>
          </select>
        </div>
        <div class="cr-card cr-row-card">
          <span class="cr-row-label">入池率显示</span>
          <button class="cr-toggle" :class="{ on: form.vpOn }" @click="form.vpOn = !form.vpOn"><i></i></button>
        </div>
        <div class="cr-card cr-row-card">
          <span class="cr-row-label">同IP限同桌</span>
          <button class="cr-toggle" :class="{ on: form.ipLimitOn }" @click="form.ipLimitOn = !form.ipLimitOn"><i></i></button>
        </div>
        <div class="cr-card cr-row-card">
          <span class="cr-row-label">GPS防火牌</span>
          <button class="cr-toggle" :class="{ on: form.gpsLimitOn }" @click="form.gpsLimitOn = !form.gpsLimitOn"><i></i></button>
        </div>
      </template>

      <div v-if="errMsg" class="cr-err">{{ errMsg }}</div>
      <div class="cr-scroll-pad"></div>
    </div>

    <!-- 底部:牌局名 + 立即开局 -->
    <div class="cr-footer">
      <input v-model="form.name" class="cr-name" maxlength="16"
        :placeholder="(clubName || game.user.nickname || '') + '的牌局'" />
      <button class="cr-go" :disabled="creating" @click="onCreate">{{ creating ? '创建中…' : '立即开局' }}</button>
    </div>
  </div>
</template>

<style scoped>
.cr-page {
  background: #eef4f1;
  color: #2b2b2d;
  display: flex;
  flex-direction: column;
}

.cr-top {
  flex: none;
  display: flex;
  align-items: center;
  gap: calc(20px * var(--s));
  padding: calc(24px * var(--s)) calc(36px * var(--s)) calc(12px * var(--s));
  padding-top: calc(24px * var(--s) + var(--sat));
}
.cr-back {
  border: none;
  background: transparent;
  font-size: calc(52px * var(--s));
  font-weight: 700;
  color: #2b2b2d;
  cursor: pointer;
  padding: 0 calc(12px * var(--s));
}
.cr-title {
  font-size: calc(48px * var(--s));
  font-weight: 700;
}
.cr-club {
  font-size: calc(32px * var(--s));
  color: #8a9a93;
}

.cr-scroll {
  flex: 1;
  overflow-y: auto;
  padding: calc(8px * var(--s)) calc(30px * var(--s));
}
.cr-scroll-pad {
  height: calc(40px * var(--s));
}

.cr-card {
  background: #fff;
  border-radius: calc(28px * var(--s));
  padding: calc(30px * var(--s)) calc(34px * var(--s));
  margin-bottom: calc(22px * var(--s));
}
.cr-row-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.cr-row-label {
  font-size: calc(36px * var(--s));
  font-weight: 600;
}

.cr-attr-row {
  display: flex;
  align-items: center;
  gap: calc(28px * var(--s));
}
.cr-attr-label {
  font-size: calc(34px * var(--s));
  color: #6b7b74;
}
.cr-attr-pill {
  padding: calc(10px * var(--s)) calc(30px * var(--s));
  border-radius: calc(30px * var(--s));
  background: #f1f4f2;
  font-size: calc(32px * var(--s));
  font-weight: 600;
}
.cr-divider {
  height: 1px;
  background: #eef1ef;
  margin: calc(26px * var(--s)) 0;
}

.cr-head3 {
  display: flex;
  align-items: center;
}
.cr-h3-label {
  flex: 1;
  display: flex;
  align-items: center;
  gap: calc(14px * var(--s));
  font-size: calc(30px * var(--s));
  color: #8a9a93;
}
.cr-center { justify-content: center; }
.cr-right { justify-content: flex-end; }

.cr-big {
  font-size: calc(56px * var(--s));
  font-weight: 700;
  margin: calc(14px * var(--s)) 0 calc(8px * var(--s));
}
.cr-sub {
  font-size: calc(30px * var(--s));
  color: #8a9a93;
}
.cr-val {
  color: #08a88c;
}

.cr-slider {
  width: 100%;
  height: calc(56px * var(--s));
  accent-color: #2fc9a7;
  cursor: pointer;
}
.cr-ticks {
  display: flex;
  justify-content: space-between;
  padding: 0 calc(8px * var(--s));
  font-size: calc(26px * var(--s));
  color: #a9b6b0;
}
.cr-ticks span.on {
  color: #08a88c;
  font-weight: 700;
}

.cr-cols {
  display: flex;
  gap: calc(40px * var(--s));
}
.cr-col {
  flex: 1;
  min-width: 0;
}

.cr-select {
  border: none;
  outline: none;
  background: #f1f4f2;
  border-radius: calc(16px * var(--s));
  padding: calc(14px * var(--s)) calc(24px * var(--s));
  font-size: calc(32px * var(--s));
  font-weight: 600;
  color: #2b2b2d;
}
.cr-select-sm {
  padding: calc(6px * var(--s)) calc(14px * var(--s));
  font-size: calc(28px * var(--s));
}

.cr-toggle {
  flex: none;
  width: calc(96px * var(--s));
  height: calc(52px * var(--s));
  border: none;
  border-radius: calc(26px * var(--s));
  background: #dfe5e2;
  position: relative;
  cursor: pointer;
  transition: background 0.15s;
}
.cr-toggle i {
  position: absolute;
  top: calc(6px * var(--s));
  left: calc(6px * var(--s));
  width: calc(40px * var(--s));
  height: calc(40px * var(--s));
  border-radius: 50%;
  background: #fff;
  transition: left 0.15s;
}
.cr-toggle.on {
  background: #2fc9a7;
}
.cr-toggle.on i {
  left: calc(50px * var(--s));
}

.cr-adv-head {
  cursor: pointer;
}
.cr-adv-arrow {
  font-size: calc(30px * var(--s));
  color: #8a9a93;
}

.cr-err {
  margin: calc(8px * var(--s)) 0;
  padding: calc(14px * var(--s)) calc(24px * var(--s));
  border-radius: calc(14px * var(--s));
  background: #fdecec;
  color: #e05a5a;
  font-size: calc(30px * var(--s));
  text-align: center;
}

.cr-footer {
  flex: none;
  display: flex;
  gap: calc(20px * var(--s));
  padding: calc(20px * var(--s)) calc(30px * var(--s));
  padding-bottom: calc(20px * var(--s) + var(--sab));
  background: #eef4f1;
}
.cr-name {
  flex: 1;
  min-width: 0;
  height: calc(108px * var(--s));
  border: none;
  outline: none;
  border-radius: calc(24px * var(--s));
  background: #fff;
  padding: 0 calc(30px * var(--s));
  font-size: calc(34px * var(--s));
}
.cr-go {
  flex: none;
  width: calc(320px * var(--s));
  height: calc(108px * var(--s));
  border: none;
  border-radius: calc(24px * var(--s));
  background: linear-gradient(90deg, #4bd9b8, #2fc9a7);
  color: #fff;
  font-size: calc(40px * var(--s));
  font-weight: 700;
  cursor: pointer;
}
.cr-go:disabled {
  opacity: 0.6;
}
</style>
