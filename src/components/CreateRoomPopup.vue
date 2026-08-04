<script setup>
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { createRoomFlow, roomOptionsFlow } from '../net/session.js'
import { formatKNotation } from '../utils/format'

// 建房弹窗(大厅/俱乐部共用):全量参数对齐老德州建房,可选档全部来自
// 后台配置(419 ROOM_OPTIONS,管理台「牌局参数」页可改),避免写死档位
// 与后端校验不一致导致"点创建没反应"。
const props = defineProps({
  show: { type: Boolean, default: false },
  clubId: { type: Number, default: 0 },     // 0=大厅公开房,>0=俱乐部房
  title: { type: String, default: '' },
  namePlaceholder: { type: String, default: '牌局名称' },
})
const emit = defineEmits(['close', 'created'])
const { t } = useI18n()

const creating = ref(false)
const errMsg = ref('')
const form = ref({
  name: '', sb: 100, maxPlayers: 9, settleTimeMins: 30,
  rakePercent: 0,      // 费率%:拖动条(对齐Unity 0~5默认0);仅俱乐部房可设,大厅强制0
  opTimeSec: 15,       // 思考时间(秒)
  anteMode: 0,         // 前注:0无 1半盲 2一个大盲
  inMinRate: 1,        // 带入倍数区间下限(对齐Unity双把手)
  inMaxRate: 4,        // 带入倍数区间上限;带入 = 100BB × 倍数
  straddleOn: false,   // 抓头
  insuranceOn: false,  // 保险(河牌保险)
  muckOn: false,       // 埋牌(只亮赢家)
  vpOn: false,         // 入池率
  ipLimitOn: false,    // 同 IP 限同桌
  gpsLimitOn: false,   // GPS 防火牌(同桌距离限制)
  gameMinTime: 0,      // 最短上桌(分钟,0=不限)
  autoStartNum: 2,     // 自动开局人数
})

// 拉取失败时的兜底档(正常都会被后台配置覆盖)
const BLIND_PRESETS = ref([
  { sb: 50, bb: 100 }, { sb: 100, bb: 200 }, { sb: 250, bb: 500 },
  { sb: 500, bb: 1000 }, { sb: 1000, bb: 2000 },
])
const SETTLE_PRESETS = ref([30, 45, 60, 90, 120])
const OPTIME_PRESETS = ref([10, 15, 20, 30])
const RAKE_MAX = ref(5)      // 费率拖动条上限(后台可配)
const IN_RATE_MAX = ref(8)   // 带入倍数区间上限(后台可配)
const MINTIME_PRESETS = ref([
  { v: 0, label: '不限' }, { v: 30, label: '30分钟' }, { v: 60, label: '60分钟' },
])
const ANTE_MODES = [
  { v: 0, label: '无' }, { v: 1, label: '半盲' }, { v: 2, label: '1大盲' },
]
const RULE_SWITCHES = [
  { key: 'straddleOn', label: '抓头' },
  { key: 'insuranceOn', label: '保险' },
  { key: 'muckOn', label: '埋牌' },
  { key: 'vpOn', label: '入池率' },
  { key: 'ipLimitOn', label: 'IP限制' },
  { key: 'gpsLimitOn', label: 'GPS限制' },
]

// 弹出时拉取后台档位;当前选中值不在档内时吸附到第一档
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
  if (!BLIND_PRESETS.value.some((p) => p.sb === f.sb)) f.sb = BLIND_PRESETS.value[0].sb
  if (!SETTLE_PRESETS.value.includes(f.settleTimeMins)) f.settleTimeMins = SETTLE_PRESETS.value[0]
  if (!OPTIME_PRESETS.value.includes(f.opTimeSec)) f.opTimeSec = OPTIME_PRESETS.value[0]
  if (f.rakePercent > RAKE_MAX.value) f.rakePercent = RAKE_MAX.value
  if (f.inMaxRate > IN_RATE_MAX.value) f.inMaxRate = IN_RATE_MAX.value
  if (f.inMinRate > f.inMaxRate) f.inMinRate = 1
  if (!MINTIME_PRESETS.value.some((p) => p.v === f.gameMinTime)) f.gameMinTime = MINTIME_PRESETS.value[0].v
}

// 带入倍数双把手:拖动时互相约束(min ≤ max)
function onMinRate(v) {
  form.value.inMinRate = Number(v)
  if (form.value.inMaxRate < form.value.inMinRate) form.value.inMaxRate = form.value.inMinRate
}
function onMaxRate(v) {
  form.value.inMaxRate = Number(v)
  if (form.value.inMinRate > form.value.inMaxRate) form.value.inMinRate = form.value.inMaxRate
}
watch(() => props.show, (v) => { if (v) { errMsg.value = ''; loadOptions() } })

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
      rakePercent: props.clubId > 0 ? f.rakePercent : 0, // 大厅房强制0(对齐Unity)
      opTimeSec: f.opTimeSec,
      ante: f.anteMode === 2 ? bb : f.anteMode === 1 ? f.sb : 0,
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
      clubId: props.clubId,
    })
    emit('created', room)
  } catch (e) {
    errMsg.value = e.message || '创建失败'
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div v-if="show" class="create-mask" @click.self="emit('close')">
    <div class="create-box">
      <div class="c-title">{{ title || t('hall.create') }}</div>

      <div class="c-label">{{ t('hall.roomName') }}</div>
      <input v-model="form.name" class="c-input" :placeholder="namePlaceholder" maxlength="16" />

      <div class="c-label">{{ t('hall.blinds') }}</div>
      <div class="c-opts">
        <button v-for="p in BLIND_PRESETS" :key="p.bb" class="c-opt" :class="{ on: form.sb === p.sb }"
          @click="form.sb = p.sb">{{ formatKNotation(p.sb) }}/{{ formatKNotation(p.bb) }}</button>
      </div>

      <div class="c-label">{{ t('hall.seatsLabel') }}</div>
      <div class="c-opts">
        <button v-for="n in [2, 3, 4, 5, 6, 7, 8, 9]" :key="n" class="c-opt c-opt-sm"
          :class="{ on: form.maxPlayers === n }" @click="form.maxPlayers = n">{{ n }}人</button>
      </div>

      <div class="c-label">{{ t('hall.settleTime') }}</div>
      <div class="c-opts">
        <button v-for="m in SETTLE_PRESETS" :key="m" class="c-opt" :class="{ on: form.settleTimeMins === m }"
          @click="form.settleTimeMins = m">{{ m }}{{ t('hall.mins') }}</button>
      </div>

      <!-- 费率:拖动条(对齐Unity 服务费0~5%);仅俱乐部房显示,大厅房强制0 -->
      <template v-if="props.clubId > 0">
        <div class="c-label">服务费(费率) <span class="c-val">{{ form.rakePercent }}%</span></div>
        <input type="range" class="c-slider" min="0" :max="RAKE_MAX" step="1" v-model.number="form.rakePercent" />
        <div class="c-ticks">
          <span v-for="i in RAKE_MAX + 1" :key="i">{{ i - 1 }}</span>
        </div>
      </template>

      <div class="c-label">思考时间</div>
      <div class="c-opts">
        <button v-for="s in OPTIME_PRESETS" :key="s" class="c-opt" :class="{ on: form.opTimeSec === s }"
          @click="form.opTimeSec = s">{{ s }}秒</button>
      </div>

      <!-- 带入倍数:双把手区间(对齐Unity inmnr/inmxr),带入 = 100BB × 倍数 -->
      <div class="c-label">
        带入范围 <span class="c-val">{{ form.inMinRate * 100 }}BB ~ {{ form.inMaxRate * 100 }}BB</span>
      </div>
      <div class="c-range-row">
        <span class="c-range-tag">最小</span>
        <input type="range" class="c-slider" min="1" :max="IN_RATE_MAX" step="1"
          :value="form.inMinRate" @input="onMinRate($event.target.value)" />
      </div>
      <div class="c-range-row">
        <span class="c-range-tag">最大</span>
        <input type="range" class="c-slider" min="1" :max="IN_RATE_MAX" step="1"
          :value="form.inMaxRate" @input="onMaxRate($event.target.value)" />
      </div>

      <div class="c-label">前注</div>
      <div class="c-opts">
        <button v-for="a in ANTE_MODES" :key="a.v" class="c-opt" :class="{ on: form.anteMode === a.v }"
          @click="form.anteMode = a.v">{{ a.label }}</button>
      </div>

      <div class="c-label">最短上桌</div>
      <div class="c-opts">
        <button v-for="p in MINTIME_PRESETS" :key="p.v" class="c-opt" :class="{ on: form.gameMinTime === p.v }"
          @click="form.gameMinTime = p.v">{{ p.label }}</button>
      </div>

      <div class="c-label">玩法开关</div>
      <div class="c-opts">
        <button v-for="sw in RULE_SWITCHES" :key="sw.key" class="c-opt c-opt-sm" :class="{ on: form[sw.key] }"
          @click="form[sw.key] = !form[sw.key]">{{ sw.label }}</button>
      </div>

      <div v-if="errMsg" class="c-err">{{ errMsg }}</div>

      <button class="c-confirm" :disabled="creating" @click="onCreate">
        {{ creating ? t('hall.creating') : t('hall.createConfirm') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
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
  color: #2b2b2d;
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
.c-val {
  color: #08a88c;
  font-weight: 700;
}
.c-slider {
  width: 100%;
  height: calc(56px * var(--s));
  accent-color: #08c0a0;
  cursor: pointer;
}
.c-ticks {
  display: flex;
  justify-content: space-between;
  padding: 0 calc(10px * var(--s));
  font-size: calc(26px * var(--s));
  color: #aaa;
}
.c-range-row {
  display: flex;
  align-items: center;
  gap: calc(20px * var(--s));
}
.c-range-tag {
  flex: none;
  font-size: calc(28px * var(--s));
  color: #888;
  width: calc(80px * var(--s));
}
.c-err {
  margin-top: calc(24px * var(--s));
  padding: calc(14px * var(--s)) calc(24px * var(--s));
  border-radius: calc(14px * var(--s));
  background: #fdecec;
  color: #e05a5a;
  font-size: calc(30px * var(--s));
  text-align: center;
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
