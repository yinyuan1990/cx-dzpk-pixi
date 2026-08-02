<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatKNotation } from '../../utils/format'
import { playSound } from '../../utils/sound'

/*
 * In-turn action bar — 1:1 逆向 optUser.prefab + optUser.js / raiseOpt.js / allinBase.js
 * （本桌 = 共享 optUser 操作条；非臆造）。三层真实结构：
 *   ① optNode  : fold(红圈 -259) / check(绿圈 +259) / call(蓝圈 +259, 跟注+额) /
 *                allin(蓝圈 +259) / raise_allin(蓝圈 中心 0,+0, 短码加注=allin)
 *   ② raiseNode: raiseOpt 快捷加注「弧形」一排 5 键(btns5Style)，每键 = 顶 lblTxt「底池」
 *                + lblTxtX_X 比例(1/3·1/2·2/3·1·1.2) + lblBetX_X 实际下注额(K)；超出 [min..stack] 置灰
 *   ③ allinBaseNode: btn_raise「加注/下注」(蓝圈 中心) → 点开竖向 slider(allinBase)：
 *                左侧 handle 气泡 lblBet「N%」(占总码比) + lblPotRatio「Nx D/P」(底池比)，
 *                竖轨 + ¼/½/¾ 刻度 + 顶部 All-In(火焰高亮 + slider_top 音) + add_allin「确定」。
 * 按钮真值：142×142 圆形(btn_raise 172)；StyleNormal 真底图 ic_fold(红)/ic_check(绿)/ic_call(蓝)。
 * 入场：scale 0→1 + moveTo 从中心，时长 WPActionTime.optBtn=0.2s（showOptBtn 时直接定位不动画）。
 */
const props = defineProps({
  show: { type: Boolean, default: false },
  // {
  //   fold:Boolean,
  //   right:{ type:'check'|'call'|'allin', amount },
  //   center:{ type:'raise'|'bet'|'allin' },         // raise/bet→可开滑条+快捷; allin→短码 raise_allin
  //   bet:{ totalPot, callScore, seatScore, minRaise, stack, BB, SB },
  //   countdown:{ secs, total },                     // 轮到自己的剩余操作秒数（按钮 edge 倒计时环）
  // }
  config: { type: Object, default: () => ({}) },
})
const emit = defineEmits(['fold', 'check', 'call', 'allin', 'raise'])
const { t } = useI18n()

const fmt = (n) => formatKNotation(n)
const cfg = computed(() => props.config || {})
const hasFold = computed(() => !!cfg.value.fold)
const right = computed(() => cfg.value.right || null)
const center = computed(() => cfg.value.center || null)
const bet = computed(() => cfg.value.bet || null)

const rightLabel = computed(() => {
  const r = right.value
  if (!r) return ''
  if (r.type === 'check') return t('table.actCheck')
  if (r.type === 'allin') return t('table.actAllin')
  return t('table.actCall')
})
// 跟注键背景：check=绿(ic_check)，call/allin=蓝(ic_call)
const rightBg = computed(() => (right.value && right.value.type === 'check' ? 'check' : 'call'))

// 中心键：raise/bet → btn_raise「加注/下注」(蓝)；allin → raise_allin「All in」(蓝, 短码)
const centerIsRaise = computed(() => center.value && (center.value.type === 'raise' || center.value.type === 'bet'))
const centerIsAllin = computed(() => center.value && center.value.type === 'allin')
const raiseLabel = computed(() => (center.value && center.value.type === 'bet' ? t('table.actBet') : t('table.actRaise')))

// ───────── raiseOpt 快捷加注（默认 levels5 = [34,50,67,100,120]，pot% 含 call，向上取整到 SB）─────────
const QUICK_RATIOS = [34, 50, 67, 100, 120]
// btns5Style 弧形坐标（optUser.prefab）：两端低、中间高
const QUICK_POS = [
  { x: -312, y: 178 },
  { x: -156, y: 256 },
  { x: 0, y: 265 },
  { x: 156, y: 256 },
  { x: 312, y: 178 },
]
function betRateLabel(r) {
  if (r === 34) return '1/3'
  if (r === 50) return '1/2'
  if (r === 67) return '2/3'
  return String(r / 100)
}
const quickBtns = computed(() => {
  const b = bet.value
  if (!centerIsRaise.value || !b) return []
  const SB = b.SB || 1
  const stack = b.stack
  const call = b.callScore || 0
  const seat = b.seatScore || 0
  return QUICK_RATIOS.map((r, i) => {
    // is_cal_include_pot=1：base=ceil(floor((pot+call)*r%)/SB)*SB；下注额 = base + call
    let base = Math.floor((b.totalPot + call) * r * 0.01)
    base = Math.ceil(base / SB) * SB
    const amount = base + call
    const enabled = amount >= b.minRaise && amount <= stack
    return {
      pos: QUICK_POS[i],
      top: t('table.potLabel'),
      ratio: betRateLabel(r),
      bet: fmt(amount + seat),
      amount,
      enabled,
    }
  })
})
function clickQuick(q) {
  if (!q.enabled) return
  if (q.amount >= (bet.value.stack || Infinity)) emit('allin')
  else emit('raise', q.amount)
}

// ───────── allinBase 竖向滑条 ─────────
const sliderOpen = ref(false)
const betValue = ref(0)
const dragFrac = ref(0) // 0(min)..1(max=allin)
let lastBet = -1

const sMin = computed(() => (bet.value ? bet.value.minRaise : 0))
const sMax = computed(() => (bet.value ? bet.value.stack : 0)) // _maxBet = currentScore
const seatScore = computed(() => (bet.value ? bet.value.seatScore || 0 : 0))
const callScore = computed(() => (bet.value ? bet.value.callScore || 0 : 0))
const totalPot = computed(() => (bet.value ? bet.value.totalPot || 0 : 0))
const isAllinBet = computed(() => betValue.value >= sMax.value)

// allinBase 加注挡位表（1:1 逆向 index.js ~673353 reiseConfig 默认表，单位=BB 倍数）。
// init() 按 minBet 选第一个 maxBB*BB >= minBet 的挡位档，再把 step*BB 落在 [minBet+seat, maxBet+seat] 内的留下。
const RAISE_TIERS = [50, 100, 200, 300, 500, 10000]
const RAISE_STEP_TABLE = {
  50: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24, 26, 28, 30, 32, 35, 38, 40, 42, 45, 48, 50, 55, 60, 70, 80, 90, 100, 120, 140, 160, 180, 200, 225, 250, 275, 300, 325, 350, 400, 500, 600, 700, 800, 1000, 1200, 1400, 1600, 1800, 2000],
  100: [50, 52, 55, 58, 60, 62, 65, 68, 70, 75, 80, 85, 90, 95, 100, 105, 110, 115, 120, 125, 130, 135, 140, 150, 160, 170, 180, 190, 200, 210, 220, 230, 250, 275, 300, 325, 350, 375, 400, 450, 500, 550, 600, 650, 700, 800, 900, 1000, 1200, 1400, 1600, 1800, 2000, 2500, 3000],
  200: [100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200, 210, 220, 230, 250, 275, 300, 325, 350, 375, 400, 450, 500, 550, 600, 650, 700, 800, 900, 1000, 1200, 1400, 1600, 1800, 2000, 2500, 30000],
  300: [200, 210, 220, 230, 240, 250, 260, 270, 280, 290, 300, 310, 325, 350, 375, 400, 450, 500, 550, 600, 650, 700, 800, 900, 1000, 1200, 1400, 1600, 1800, 2000, 2500, 3000],
  500: [310, 320, 330, 340, 350, 360, 370, 380, 390, 400, 420, 440, 460, 480, 500, 520, 540, 560, 580, 600, 650, 700, 800, 900, 1000, 1200, 1400, 1600, 1800, 2000, 2500, 3000],
  10000: [500, 520, 540, 560, 580, 600, 620, 640, 660, 680, 700, 725, 750, 800, 850, 900, 950, 1000, 1100, 1200, 1400, 1600, 1800, 2000, 2200, 2500, 3000],
}
// _myStepsArr：实际可落点（单位=筹码，已含 seatScore）
const myStepsArr = computed(() => {
  const b = bet.value
  if (!b) return []
  const element = b.BB || 1 // createRoomType 0/3 → element=BB
  const minBet = b.minRaise || 0
  const maxBet = b.stack || 0
  const seat = b.seatScore || 0
  let table = []
  for (const mx of RAISE_TIERS) {
    if (minBet <= mx * element) {
      table = RAISE_STEP_TABLE[mx] || []
      break
    }
  }
  const arr = []
  for (const s of table) {
    const v = s * element
    if (v >= minBet + seat && v <= maxBet + seat) arr.push(v)
  }
  return arr
})

// 滑块 frac(0..1) → 下注额（allinBase.callback：c=h/(len+1)，u=floor(y/c)，挡位映射；顶部=all-in）
function fracToBet(f) {
  const steps = myStepsArr.value
  const n = steps.length
  if (f >= 1 - 1e-4) return sMax.value // 到顶 = all-in
  const u = Math.floor(f * (n + 1))
  if (u <= 0) return sMin.value
  if (u - 1 < n) {
    const v = steps[u - 1] - seatScore.value
    return Math.min(sMax.value, Math.max(sMin.value, v))
  }
  return sMax.value
}
function setFrac(f) {
  f = Math.min(1, Math.max(0, f))
  dragFrac.value = f
  const v = fracToBet(f)
  if (v !== betValue.value) {
    betValue.value = v
    // callback：跨挡播 slider，封顶 all-in 播 slider_top
    if (v >= sMax.value) {
      if (lastBet < sMax.value) playSound('sliderTop')
    } else {
      playSound('slider')
    }
    lastBet = v
  }
}
// handle 气泡 ic_silder_handle：lblBet「N%」(大) = (bet+seat)/(stack+seat)*100 ；lblPotRatio「Nx D/P」(小)
const betRateText = computed(() => {
  const tot = sMax.value + seatScore.value
  if (!tot) return '1%'
  let n = Math.floor(((betValue.value + seatScore.value) / tot) * 100)
  return (n < 1 ? 1 : n) + '%'
})
const potRatioText = computed(() => {
  const unit = t('table.potRatioUnit') // D / P
  // is_cal_include_pot：(bet-call)/(totalPot+call)
  const num = betValue.value - callScore.value
  const den = totalPot.value + callScore.value
  if (num <= 0 || den <= 0) return '0x ' + unit
  let o = num / den
  if (o > 0 && o < 0.1) o = 0.1
  o = o < 10 ? Math.round(o * 10) / 10 : Math.round(o)
  return o + 'x ' + unit
})
// 顶部 raise_all_bg 的 lblCurBetScore：随滑条实时变化的「实际下注总额」(bet+seat)，封顶=All-In 时火焰高亮(#EDFF21)
const curBetText = computed(() => fmt(betValue.value + seatScore.value))

function openSlider() {
  if (!bet.value) return
  betValue.value = sMin.value
  dragFrac.value = 0
  lastBet = sMin.value
  sliderOpen.value = true
}
function closeSlider() {
  sliderOpen.value = false
}
function confirmRaise() {
  const v = Math.floor(betValue.value)
  sliderOpen.value = false
  if (v >= sMax.value) emit('allin')
  else emit('raise', v)
}

// 竖轨拖拽（pointer）。轨道顶 = max，底 = min。
// slider_track 贴图两端是圆角帽，把手只在中间直段行进 → 映射到 [TRAVEL_LO, TRAVEL_HI]。
// 初始态把手「中心」停在距柱底 TRAVEL_LO 处。柱底 = 确定按钮中心(top=0)，把手 106 半高 53，
// 要让把手「下缘」贴住确定按钮顶边(top=-86*s) → 把手中心 top=-139*s → TRAVEL_LO = 139/870 ≈ 0.16。
const TRAVEL_LO = 0.16
const TRAVEL_HI = 0.95
const handleBottomPct = computed(() => (TRAVEL_LO + dragFrac.value * (TRAVEL_HI - TRAVEL_LO)) * 100)
// 挡位蓝点（allinBase 竖轨刻度近似）：13 颗，均匀落在可行进段 [TRAVEL_LO, TRAVEL_HI]
const DOT_COUNT = 13
const sliderDots = computed(() =>
  Array.from({ length: DOT_COUNT }, (_, i) =>
    ((TRAVEL_LO + (i / (DOT_COUNT - 1)) * (TRAVEL_HI - TRAVEL_LO)) * 100).toFixed(2),
  ),
)
const trackEl = ref(null)
let dragging = false
function fracFromEvent(e) {
  const el = trackEl.value
  if (!el) return 0
  const r = el.getBoundingClientRect()
  const p = (r.bottom - e.clientY) / r.height // 0(底)..1(顶)
  return (p - TRAVEL_LO) / (TRAVEL_HI - TRAVEL_LO)
}
function onTrackDown(e) {
  dragging = true
  setFrac(fracFromEvent(e))
  window.addEventListener('pointermove', onTrackMove)
  window.addEventListener('pointerup', onTrackUp)
}
function onTrackMove(e) {
  if (dragging) setFrac(fracFromEvent(e))
}
function onTrackUp() {
  dragging = false
  window.removeEventListener('pointermove', onTrackMove)
  window.removeEventListener('pointerup', onTrackUp)
}

function onCenter() {
  if (!center.value) return
  if (centerIsAllin.value) emit('allin')
  else openSlider()
}
function onRight() {
  if (!right.value) return
  if (right.value.type === 'check') emit('check')
  else if (right.value.type === 'allin') emit('allin')
  else emit('call')
}

// ───────── 自己的操作倒计时（1:1 Cocos edge 组件，decrypted L759080）─────────
// 真值：轮到自己时倒计时不画在座位上（中心「加注」键正好盖住自己头像），而是画在操作按钮的
//   圆边上（edge.betCounter 环 + ndPoint 光点 + lblTimer「Ns」）：可过牌 → 「过牌」键
//   （setOptV case CHECK → startCountdown(btnCheck)）；有跟注/全下 → 「弃牌」键
//   （setOptV s=true → startCountdown(btnFold)）。show=false→true 启动一次；同一回合内
//   config 刷新（driveFromModel 每事件都会重算）不重启，避免环被重置闪跳。
const cdRemaining = ref(0)
const cdTotal = ref(0)
let cdTimer = null
function stopCountdown() {
  if (cdTimer) { clearInterval(cdTimer); cdTimer = null }
}
function startCountdown() {
  stopCountdown()
  const cd = cfg.value.countdown
  const secs = cd && cd.secs > 0 ? cd.secs : 0
  cdTotal.value = cd && cd.total > 0 ? cd.total : secs
  cdRemaining.value = secs
  if (secs <= 0) return
  const t0 = performance.now()
  cdTimer = setInterval(() => {
    const left = secs - (performance.now() - t0) / 1000
    cdRemaining.value = Math.max(0, left)
    if (left <= 0) stopCountdown() // 超时由服务端推 action=7，前端只停表
  }, 100)
}
const cdActive = computed(() => props.show && cdTotal.value > 0 && cdRemaining.value > 0)
const cdProgress = computed(() => (cdTotal.value > 0 ? cdRemaining.value / cdTotal.value : 0))
// 倒计时画在哪个键：过牌键（可过牌）> 弃牌键（面对下注）> 右键兜底
const cdTarget = computed(() => {
  if (right.value && right.value.type === 'check') return 'right'
  return hasFold.value ? 'fold' : 'right'
})
const CD_CIRC = 2 * Math.PI * 56 // viewBox 120 下 r=56 的周长
const cdColor = computed(() => {
  // 绿(满)→红(空) 线性过渡（edge.changeColor 语义）
  const p = cdProgress.value
  const ch = (a, b) => Math.round(a + (b - a) * (1 - p))
  return `rgb(${ch(57, 255)},${ch(231, 77)},${ch(95, 77)})`
})
const cdBarStyle = computed(() => ({
  strokeDasharray: `${CD_CIRC}`,
  strokeDashoffset: `${CD_CIRC * (1 - cdProgress.value)}`,
  stroke: cdColor.value,
}))
const cdSecsText = computed(() => Math.ceil(cdRemaining.value) + 's')
onBeforeUnmount(stopCountdown)

watch(
  () => props.show,
  (v) => {
    if (v) startCountdown()
    else { stopCountdown(); sliderOpen.value = false }
  },
)
</script>

<template>
  <div v-if="show" class="opt-root">
    <!-- ② raiseOpt 快捷加注弧形一排（raise/bet 时常驻；开滑条后留在 shade 之下变暗，对照 201/202.jpg） -->
    <template v-if="centerIsRaise">
      <button
        v-for="(q, i) in quickBtns"
        :key="i"
        class="quick-btn"
        :class="{ off: !q.enabled, dim: sliderOpen }"
        :style="{ '--qx': q.pos.x, '--qy': q.pos.y }"
        @click="clickQuick(q)"
      >
        <span class="q-top">{{ q.top }}</span>
        <span class="q-ratio">{{ q.ratio }}</span>
        <span class="q-bet">{{ q.bet }}</span>
      </button>
    </template>

    <!-- ③ allinBase 竖向滑条（点 shade 关闭 = cocos clickClose）。真 sprite：sliderBg/Handle/raise_all_bg -->
    <template v-if="sliderOpen">
      <div class="allin-shade" data-sound="back" @click="closeSlider"></div>
      <div class="allin-layer">
        <!-- 顶部 raise_all_bg：实时下注总额 + 封顶火焰高亮（lblCurBetScore + numBgAni 近似） -->
        <div class="allin-top" :class="{ on: isAllinBet }" style="--by: 905">
          <div v-if="isAllinBet" class="flame-top" aria-hidden="true">
            <i class="ember e1"></i><i class="ember e2"></i><i class="ember e3"></i>
            <i class="ember e4"></i><i class="ember e5"></i><i class="ember e6"></i>
          </div>
          <span class="at-num">{{ curBetText }}</span>
        </div>

        <!-- 竖轨 sliderBg（真贴图，含挡位点 + 蓝/橙边光）+ handle -->
        <div
          ref="trackEl"
          class="sld-track"
          :class="{ allin: isAllinBet }"
          @pointerdown.prevent="onTrackDown"
        >
          <!-- 挡位点(蓝点)：沿竖轨可行进段均匀分布，对照 201.jpg -->
          <i
            v-for="d in sliderDots"
            :key="d"
            class="sld-dot"
            :class="{ allin: isAllinBet }"
            :style="{ bottom: d + '%' }"
          ></i>
          <!-- handle = 真 Handle sprite(橙圆+▲)；左侧气泡 ic_silder_handle（% 大 + 池比 小） -->
          <div class="sld-handle" :class="{ allin: isAllinBet }" :style="{ bottom: handleBottomPct + '%' }">
            <div v-if="isAllinBet" class="handle-fire" aria-hidden="true">
              <i class="hf hf1"></i><i class="hf hf2"></i><i class="hf hf3"></i><i class="hf hf4"></i>
            </div>
            <span v-if="isAllinBet" class="handle-allin">{{ t('table.actAllin') }}</span>
            <div class="sld-bubble">
              <span class="bub-bet">{{ betRateText }}</span>
              <span class="bub-pot">{{ potRatioText }}</span>
            </div>
          </div>
        </div>

        <!-- 确定(add_allin)：替换「加注」位（optUser y=0） -->
        <button class="opt-btn center call allin-done" style="--bx: 0; --by: 0" @click="confirmRaise">
          <span class="ob-label">{{ t('table.actDone') }}</span>
        </button>
      </div>
    </template>

    <!-- ① optNode 主按钮（圆形真 sprite）。开滑条时 fold/call 留在 shade 之下变暗，仅「加注」换成「确定」 -->
    <button
      v-if="hasFold"
      class="opt-btn fold"
      :class="{ dim: sliderOpen }"
      style="--bx: -259; --by: -80"
      @click="emit('fold')"
    >
      <!-- 自己的倒计时环（edge）：面对下注时画在弃牌键圆边 -->
      <svg v-if="cdActive && cdTarget === 'fold'" class="cd-ring" viewBox="0 0 120 120" aria-hidden="true">
        <circle class="cd-track" cx="60" cy="60" r="56" />
        <circle class="cd-bar" cx="60" cy="60" r="56" :style="cdBarStyle" />
      </svg>
      <span v-if="cdActive && cdTarget === 'fold'" class="cd-secs">{{ cdSecsText }}</span>
      <span class="ob-label">{{ t('table.actFold') }}</span>
    </button>

    <button
      v-if="right"
      class="opt-btn"
      :class="[rightBg, { dim: sliderOpen }]"
      style="--bx: 259; --by: -80"
      @click="onRight"
    >
      <!-- 自己的倒计时环（edge）：可过牌时画在过牌键圆边 -->
      <svg v-if="cdActive && cdTarget === 'right'" class="cd-ring" viewBox="0 0 120 120" aria-hidden="true">
        <circle class="cd-track" cx="60" cy="60" r="56" />
        <circle class="cd-bar" cx="60" cy="60" r="56" :style="cdBarStyle" />
      </svg>
      <span v-if="cdActive && cdTarget === 'right'" class="cd-secs">{{ cdSecsText }}</span>
      <span v-if="right.amount != null && right.type !== 'check'" class="ob-num">{{ fmt(right.amount) }}</span>
      <span class="ob-label">{{ rightLabel }}</span>
    </button>

    <button
      v-if="center && !sliderOpen"
      class="opt-btn center call"
      style="--bx: 0; --by: 0"
      @click="onCenter"
    >
      <span class="ob-label">{{ centerIsAllin ? t('table.actAllin') : raiseLabel }}</span>
    </button>
  </div>
</template>

<style scoped>
/*
 * 坐标系（重要，2026-06-29 重做）：optUser 操作条的局部原点（中心 btn_raise/raise_allin = y=0）
 * 在 Cocos 里被定位在「自己座位」上 → 中心「加注」键正好**叠在自己头像上(重合)**，不是隐藏头像。
 * 自己头像 = Pixi 渲染的 seat0(scene 0,-732) = 屏幕中心下方 732*s。旧版用 `bottom:0 + --oy0:320`
 * 把操作条锚在「屏幕底边」，而头像是「屏幕中心」相对定位——两套参照系在任何屏高都对不上，
 * 所以加注键永远不与头像重合。现改为：.opt-root 锚到 seat0(中心相对)，子元素按 optUser 局部坐标
 * （bx 右正 / by 上正）相对该原点用 left/top 定位 → 中心键 (0,0) 与头像精确重合。
 */
.opt-root {
  position: absolute;
  left: 50%;
  /* seat0(Hero) 头像中心 = 屏幕中心 + 732*s（含刘海 shift，与 .t-node 座位一致） */
  top: calc(50% + var(--shift, 0px) + 732px * var(--s));
  width: 0;
  height: 0;
  z-index: 40;
  pointer-events: none;
}

/* 圆形主按钮（142px，真 StyleNormal 底图）。left/top = optUser 局部 (bx, by[上正]) 相对 seat0 原点 */
.opt-btn {
  position: absolute;
  left: calc(var(--bx, 0) * 1px * var(--s));
  top: calc(var(--by, 0) * -1px * var(--s));
  width: calc(142px * var(--s));
  height: calc(142px * var(--s));
  border: none;
  background: center/100% 100% no-repeat;
  border-radius: 50%;
  color: #fff;
  cursor: pointer;
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  line-height: 1.02;
  text-shadow: 0 calc(2px * var(--s)) calc(4px * var(--s)) rgba(0, 0, 0, 0.45);
  transform: translate(-50%, -50%);
  transform-origin: center center;
  animation: optIn 0.2s ease both;
}
.opt-btn.center {
  width: calc(172px * var(--s));
  height: calc(172px * var(--s));
}
.opt-btn.fold {
  background-image: url('/assets/table/opt/ic_fold.png');
}
.opt-btn.check {
  background-image: url('/assets/table/opt/ic_check.png');
}
.opt-btn.call {
  background-image: url('/assets/table/opt/ic_call.png');
}
/* 入场：scale 0→1 + moveTo 从中心(头像处)滑到各自槽位（WPActionTime.optBtn=0.2s） */
@keyframes optIn {
  from {
    transform: translate(
        calc(-50% - var(--bx, 0) * 1px * var(--s)),
        calc(-50% + var(--by, 0) * 1px * var(--s))
      )
      scale(0);
  }
  to {
    transform: translate(-50%, -50%) scale(1);
  }
}
.ob-label {
  font-size: calc(38px * var(--s));
  font-weight: 700;
  letter-spacing: calc(2px * var(--s));
}
/* 自己的倒计时环（edge.betCounter）：贴在按钮圆边外侧一圈，从顶部顺时针收缩，绿→红。 */
.cd-ring {
  position: absolute;
  inset: calc(-6px * var(--s));
  width: auto;
  height: auto;
  transform: rotate(-90deg);
  pointer-events: none;
  overflow: visible;
}
.cd-ring circle {
  fill: none;
  stroke-width: 7;
  stroke-linecap: round;
}
.cd-track {
  stroke: rgba(0, 0, 0, 0.35);
}
/* lblTimer「Ns」：按钮上方居中 */
.cd-secs {
  position: absolute;
  top: calc(-44px * var(--s));
  left: 50%;
  transform: translateX(-50%);
  font-size: calc(28px * var(--s));
  font-weight: 700;
  color: #fff;
  text-shadow: 0 calc(2px * var(--s)) calc(4px * var(--s)) rgba(0, 0, 0, 0.6);
  pointer-events: none;
}
.ob-num {
  font-size: calc(46px * var(--s));
  font-weight: 800;
  margin-bottom: calc(-2px * var(--s));
}
.opt-btn .ob-num + .ob-label {
  font-size: calc(30px * var(--s));
}

/* ② 快捷加注（108px 圆，弧形排列；StyleNormal 蓝底 ic_call）。同 optUser 局部坐标 (qx, qy[上正]) */
.quick-btn {
  position: absolute;
  left: calc(var(--qx, 0) * 1px * var(--s));
  top: calc(var(--qy, 0) * -1px * var(--s));
  width: calc(108px * var(--s));
  height: calc(108px * var(--s));
  border: none;
  border-radius: 50%;
  background: url('/assets/table/opt/ic_call.png') center/100% 100% no-repeat;
  color: #fff;
  cursor: pointer;
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  line-height: 1;
  text-shadow: 0 calc(2px * var(--s)) calc(3px * var(--s)) rgba(0, 0, 0, 0.5);
  transform: translate(-50%, -50%) scale(1);
  transform-origin: center center;
  animation: quickIn 0.2s ease both;
}
@keyframes quickIn {
  from {
    transform: translate(-50%, -50%) scale(0);
  }
  to {
    transform: translate(-50%, -50%) scale(1);
  }
}
.quick-btn.off {
  filter: grayscale(0.7) brightness(0.6);
  opacity: 0.5;
  cursor: default;
}
/* 开滑条时快捷加注键留在 shade 之下变暗（不可点），对照 201/202.jpg 的弱化弧形按钮 */
.quick-btn.dim {
  filter: brightness(0.45) saturate(0.7);
  pointer-events: none;
}
.q-top {
  font-size: calc(22px * var(--s));
  opacity: 0.9;
  margin-top: calc(-4px * var(--s));
}
.q-ratio {
  font-size: calc(34px * var(--s));
  font-weight: 800;
}
.q-bet {
  font-size: calc(24px * var(--s));
  opacity: 0.95;
}

/* 主按钮在 shade 之下变暗（faithful：cocos 全屏 shade 压住底牌/操作区） */
.opt-btn.dim {
  filter: brightness(0.45) saturate(0.7);
  pointer-events: none;
}

/* ③ 竖向滑条（坐标沿用 opt-root --oy0：optUser y 向上） */
.allin-shade {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  pointer-events: auto;
  z-index: 5;
  animation: shadeIn 0.18s ease both;
}
@keyframes shadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
.allin-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 6;
  animation: sldRise 0.2s cubic-bezier(0.2, 0.9, 0.25, 1) both;
}
@keyframes sldRise {
  from { opacity: 0; transform: translateY(calc(60px * var(--s))); }
  to { opacity: 1; transform: translateY(0); }
}

/* 顶部 raise_all_bg（266×110 真贴图）：实时下注总额；封顶橙红火焰高亮(numBgAni play_in 近似) */
.allin-top {
  position: absolute;
  left: 0;
  top: calc(var(--by, 905) * -1px * var(--s));
  transform: translate(-50%, -50%);
  width: calc(266px * var(--s));
  height: calc(110px * var(--s));
  display: flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  background: url('/assets/table/opt/slider_top.png') center/100% 100% no-repeat;
  pointer-events: none;
}
.allin-top .at-num {
  font-size: calc(54px * var(--s));
  font-weight: 800;
  color: #fff;
  line-height: 1;
  margin-top: calc(-10px * var(--s)); /* 贴图底部有小尾巴，文字上移居中 */
}
/* 封顶 All-In：总额牌本体变橙红发光火球(对照 202.jpg「199」橙红牌)，非头顶蜡烛火 */
.allin-top.on {
  filter: drop-shadow(0 0 calc(26px * var(--s)) rgba(255, 90, 12, 0.95))
    drop-shadow(0 0 calc(10px * var(--s)) rgba(255, 200, 60, 0.8));
  animation: topbreathe 0.7s ease-in-out infinite alternate;
}
/* 橙红渐变叠在 slider_top 贴图上：把深蓝牌染成火牌 */
.allin-top.on::after {
  content: '';
  position: absolute;
  inset: calc(6px * var(--s)) calc(10px * var(--s));
  border-radius: calc(46px * var(--s));
  background: linear-gradient(180deg, #ffb01e 0%, #ff6a14 46%, #e8350c 100%);
  box-shadow: inset 0 0 calc(10px * var(--s)) rgba(255, 235, 150, 0.9),
    0 0 calc(18px * var(--s)) rgba(255, 90, 12, 0.85);
  z-index: 0;
}
/* 外圈火光晕 */
.allin-top.on::before {
  content: '';
  position: absolute;
  inset: calc(-14px * var(--s));
  border-radius: calc(70px * var(--s));
  background: radial-gradient(ellipse at 50% 50%, rgba(255, 140, 25, 0.7), rgba(255, 60, 10, 0) 70%);
  z-index: -1;
  animation: glowpulse 0.6s ease-in-out infinite alternate;
}
.allin-top.on .at-num {
  position: relative;
  z-index: 1;
  color: #fff;
  text-shadow: 0 calc(1px * var(--s)) calc(2px * var(--s)) rgba(150, 30, 0, 0.95),
    0 0 calc(14px * var(--s)) rgba(255, 220, 120, 0.9);
}
@keyframes glowpulse {
  from { opacity: 0.7; transform: scale(0.96); }
  to { opacity: 1; transform: scale(1.06); }
}
@keyframes topbreathe {
  from { filter: drop-shadow(0 0 calc(18px * var(--s)) rgba(255, 90, 12, 0.85)) drop-shadow(0 0 calc(8px * var(--s)) rgba(255, 200, 60, 0.7)); }
  to { filter: drop-shadow(0 0 calc(30px * var(--s)) rgba(255, 110, 14, 1)) drop-shadow(0 0 calc(14px * var(--s)) rgba(255, 210, 80, 0.95)); }
}
/* 上升火星(粒子近似)：从火牌四周往上飘 */
.flame-top {
  position: absolute;
  inset: calc(-12px * var(--s));
  pointer-events: none;
  z-index: 2;
}
.flame-top .ember {
  position: absolute;
  bottom: calc(18px * var(--s));
  width: calc(9px * var(--s));
  height: calc(9px * var(--s));
  border-radius: 50%;
  background: radial-gradient(circle, #fff2b0 0%, #ffb43a 55%, rgba(255, 110, 14, 0) 80%);
  animation: ember 1.05s ease-in infinite;
}
.flame-top .e1 { left: 22%; animation-delay: 0s; }
.flame-top .e2 { left: 38%; animation-delay: -0.35s; }
.flame-top .e3 { left: 52%; animation-delay: -0.6s; }
.flame-top .e4 { left: 66%; animation-delay: -0.2s; }
.flame-top .e5 { left: 78%; animation-delay: -0.8s; }
.flame-top .e6 { left: 46%; animation-delay: -0.5s; }
@keyframes flame {
  from { transform: scaleY(0.82) scaleX(1.05) translateY(calc(4px * var(--s))); opacity: 0.85; }
  to { transform: scaleY(1.12) scaleX(0.9) translateY(0); opacity: 1; }
}
@keyframes ember {
  from { transform: translateY(0) scale(1); opacity: 1; }
  to { transform: translateY(calc(-52px * var(--s))) scale(0.3); opacity: 0; }
}

/* 竖轨 = 真 sliderBg 贴图(210×1030，含挡位点 + 蓝边光)。把手在直段行进 */
.sld-track {
  position: absolute;
  left: 50%;
  /* 竖轨：顶边 = seat0 上方 870*s，向下到 seat0 处(top=0) → 底边正好落在「确定」(by=0,172 圆)中心点
     （对照 300.png：柱子底部与下注按钮中心重合，柱底没入按钮上半部、被按钮压住）。height = 870。 */
  top: calc(-870px * var(--s));
  /* 柱子宽度按真值 sliderBg=203（> 把手 106），原 150 太窄使把手三角看起来比柱子大 */
  width: calc(200px * var(--s));
  height: calc(870px * var(--s));
  transform: translateX(-50%);
  pointer-events: auto;
  touch-action: none;
}
/* 轨道贴图放 ::before，封顶 hue 旋转只染贴图、不污染挡位点/把手 */
.sld-track::before {
  content: '';
  position: absolute;
  inset: 0;
  background: url('/assets/table/opt/slider_track.png') center/100% 100% no-repeat;
}
/* 挡位蓝点：竖轨中线均匀分布的发光圆点(201.jpg) */
.sld-dot {
  position: absolute;
  left: 50%;
  width: calc(12px * var(--s));
  height: calc(12px * var(--s));
  border-radius: 50%;
  transform: translate(-50%, 50%);
  background: #4db5ff;
  box-shadow: 0 0 calc(6px * var(--s)) rgba(77, 181, 255, 0.85);
  pointer-events: none;
}
.sld-dot.allin {
  background: #5ee06a;
  box-shadow: 0 0 calc(6px * var(--s)) rgba(80, 220, 90, 0.9);
}
/* 封顶 all-in：蓝边光转橙红(hue 旋转 仅作用贴图) + 橙色外发光 */
.sld-track.allin::before {
  filter: hue-rotate(150deg) saturate(1.5) brightness(1.05)
    drop-shadow(0 0 calc(14px * var(--s)) rgba(255, 120, 20, 0.8));
}
/* 把手 = 真 Handle 贴图(106×106 橙圆 + ▲) */
.sld-handle {
  position: absolute;
  left: 50%;
  width: calc(106px * var(--s));
  height: calc(106px * var(--s));
  background: url('/assets/table/opt/slider_handle.png') center/100% 100% no-repeat;
  transform: translate(-50%, 50%);
  display: flex;
  align-items: center;
  justify-content: center;
}
.sld-handle.allin {
  filter: drop-shadow(0 0 calc(18px * var(--s)) rgba(255, 140, 20, 0.95));
}
.handle-allin {
  font-size: calc(22px * var(--s));
  font-weight: 800;
  color: #fff;
  letter-spacing: calc(0.5px * var(--s));
  text-shadow: 0 calc(1px * var(--s)) calc(2px * var(--s)) rgba(120, 30, 0, 0.95);
  z-index: 1;
}
/* 把手火焰环（huo_loop 近似）：橙红发光环 + 顶部火舌 */
.handle-fire {
  position: absolute;
  inset: calc(-14px * var(--s));
  pointer-events: none;
}
.handle-fire::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 140, 20, 0) 52%, rgba(255, 120, 20, 0.75) 68%, rgba(255, 60, 10, 0) 84%);
  animation: glowpulse 0.5s ease-in-out infinite alternate;
}
.handle-fire .hf {
  position: absolute;
  left: 50%;
  top: calc(-10px * var(--s));
  width: calc(22px * var(--s));
  height: calc(40px * var(--s));
  background: radial-gradient(ellipse at 50% 100%, #fff7c2 0%, #ffd23d 30%, #ff7a1e 62%, rgba(255, 80, 10, 0) 80%);
  border-radius: 50% 50% 45% 45%;
  transform-origin: 50% 100%;
  animation: flame 0.45s ease-in-out infinite alternate;
}
.handle-fire .hf1 { transform: translateX(calc(-50% - 28px * var(--s))); }
.handle-fire .hf2 { transform: translateX(-50%); animation-delay: -0.2s; height: calc(48px * var(--s)); }
.handle-fire .hf3 { transform: translateX(calc(-50% + 28px * var(--s))); animation-delay: -0.35s; }
.handle-fire .hf4 { display: none; }
/*
 * handle 左侧气泡 = 真 sprite ic_silder_handle.png(271×172, 圆角云朵+右尾巴)。
 * prefab 真值：节点 271×172，pos x=-188.5（相对 Handle 中心），尾巴在右指向把手。
 * 定位：把手中心(left/top 50%) 向左平移 188.5px → 气泡中心落在 -188.5，尾巴贴把手左缘。
 * 文案在 prefab 内偏左 x=-8（避开右尾巴）：lblBet「N%」fs65(深) 在上, lblPotRatio「Nx 底池」(橙) 在下。
 */
.sld-bubble {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(calc(-50% - 188.5px * var(--s)), -50%);
  width: calc(271px * var(--s));
  height: calc(172px * var(--s));
  background: url('/assets/table/opt/slider_bubble.png') center/100% 100% no-repeat;
  /* 内容偏左 16px 避开右尾巴(≈ prefab 文案 x=-8) */
  padding-right: calc(32px * var(--s));
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  pointer-events: none;
}
/* % 字号缩小（对照 201.jpg：% 与池比两行字号接近，原 64 偏大压过下行） */
.bub-bet {
  font-size: calc(42px * var(--s));
  font-weight: 800;
  color: #1b2730;
  line-height: 1.05;
}
.bub-pot {
  font-size: calc(30px * var(--s));
  color: #ff7a1e;
  font-weight: 700;
  margin-top: calc(4px * var(--s));
}
/* 确定按钮（add_allin）走 .opt-btn.center 样式，确保可点 */
.opt-btn.allin-done {
  pointer-events: auto;
  animation: none;
}
</style>
