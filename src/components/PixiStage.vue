<script setup>
import { onMounted, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import * as PIXI from 'pixi.js'
import { createTable } from '../pixi/table.js'

// 牌桌的 Pixi 渲染层 = 游戏层（桌面/牌/筹码/发牌/DragonBones 统一 z 序画在这里）。
// 规范：onMounted 建 Application、onBeforeUnmount destroy；Pixi 实例 shallowRef 不入 reactive。
// DOM 只留始终在最上的覆盖层 HUD（顶/底按钮、操作条、弹窗、房间信息）。
//
// 数据流：seats 由 useSeatRotation 提供（父组件传入），watch 到变化即 reconcile 到 Pixi；
// 发牌动画由父组件调用 expose 的 playDeal 触发，onReveal 回调翻开座位真牌（驱动 render）。
const props = defineProps({
  seats: { type: Array, default: () => [] },
})
const emit = defineEmits(['pot'])

const { t } = useI18n()
const host = shallowRef(null)
let app = null
let table = null

// DragonBones runtime（webdemo 已验证）：留给后续礼物/骨骼特效，本步不自动播放。
function loadDragonBones() {
  if (window.dragonBones) return Promise.resolve(window.dragonBones)
  window.PIXI = window.PIXI || PIXI
  return new Promise((resolve, reject) => {
    const sc = document.createElement('script')
    sc.src = '/lib/dragonBones.js'
    sc.onload = () => resolve(window.dragonBones)
    sc.onerror = () => reject(new Error('failed to load /lib/dragonBones.js'))
    document.head.appendChild(sc)
  })
}

function onResize() {
  if (table) table.layout()
}

// 消除控制台 "Canvas2D: Multiple readback operations using getImageData ... willReadFrequently" 警告：
//   PIXI TextMetrics 用一块静态 canvas 反复 getImageData 测字体基线。默认 context 未开 willReadFrequently，
//   浏览器每帧文本测量都告警。用一块新建、显式开启 willReadFrequently 的 canvas 替换其静态 context
//   （必须在任何 PIXI.Text 测量之前执行，否则同一 canvas 再取 context 会忽略新属性）。
function patchTextMetricsCanvas() {
  try {
    const TM = PIXI.TextMetrics
    if (!TM || TM._willReadPatched) return
    const c = document.createElement('canvas')
    const ctx = c.getContext('2d', { willReadFrequently: true })
    if (ctx) { TM._canvas = c; TM._context = ctx; TM._willReadPatched = true }
  } catch (e) { void e }
}
patchTextMetricsCanvas()

// 预加载 PKW-Chip 字体（筹码/身家数字）。PIXI 在 canvas 里画文字时若字体未就绪会用回退字体
//   缓存字形 → 之后不再自动重绘。故进桌前先 document.fonts.load 确保字体已就位，加载完再重绘一次。
function preloadChipFonts() {
  if (!document.fonts || !document.fonts.load) return
  Promise.all([
    document.fonts.load('500 38px PKW-Chip'),
    document.fonts.load('400 38px PKW-Chip'),
  ]).then(() => { if (table) table.render(props.seats) }).catch(() => {})
}

onMounted(() => {
  app = new PIXI.Application({
    resizeTo: host.value,
    // Pixi 5.x：透明背景用 transparent:true（v6+ 才有 backgroundAlpha）
    transparent: true,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  })
  host.value.appendChild(app.view)

  table = createTable(app, { t, onPot: (n) => emit('pot', n) })
  table.render(props.seats)
  app.renderer.on('resize', onResize)
  preloadChipFonts()
})

// 响应式 seats -> Pixi reconcile（坐位变化、入座旋转、翻牌都走这里）
watch(
  () => props.seats,
  (seats) => {
    if (table) table.render(seats)
  },
  { deep: true },
)

onBeforeUnmount(() => {
  if (app) {
    app.renderer.off('resize', onResize)
    if (table) {
      table.destroy()
      table = null
    }
    app.destroy(true, { children: true, texture: true, baseTexture: true })
    app = null
  }
})

defineExpose({
  loadDragonBones,
  setHandTip: (v) => table && table.setHandTip(v),
  playDeal: (targets, onReveal) => table && table.playDeal(targets, onReveal),
  clearDeal: () => table && table.clearDeal(),
  playFold: (nodeId) => table && table.playFold(nodeId),
  clearFolds: () => table && table.clearFolds(),
  playShowdown: (participants, opts) => table && table.playShowdown(participants, opts),
  clearShowdown: () => table && table.clearShowdown(),
  playClear: (onDone) => table && table.playClear(onDone),
  clearClears: () => table && table.clearClears(),
  playGift: (fromNodeId, toNodeId, type, onDone) => table && table.playGift(fromNodeId, toNodeId, type, onDone),
  clearGifts: () => table && table.clearGifts(),
  startCountdown: (nodeId, seconds, style) => table && table.startCountdown(nodeId, seconds, style),
  clearCountdown: (nodeId) => table && table.clearCountdown(nodeId),
  clearCountdownExcept: (keepNodeId) => table && table.clearCountdownExcept(keepNodeId),
  hasCountdown: (nodeId) => !!(table && table.hasCountdown(nodeId)),
  playWin: (nodeId, opts) => table && table.playWin(nodeId, opts),
  clearWin: (nodeId) => table && table.clearWin(nodeId),
  clearWins: () => table && table.clearWins(),
  playAllin: (nodeId) => table && table.playAllin(nodeId),
  clearAllin: (nodeId) => table && table.clearAllin(nodeId),
  clearAllins: () => table && table.clearAllins(),
  playCommunity: (round, cards, opts) => table && table.playCommunity(round, cards, opts),
  clearCommunity: () => table && table.clearCommunity(),
  comSlotCount: () => (table ? table.comSlotCount() : -1),
  seatDebug: (nodeId) => (table ? table.seatDebug(nodeId) : null),
  playBet: (nodeId, amount, opts) => table && table.playBet(nodeId, amount, opts),
  collectBet: (nodeId) => table && table.collectBet(nodeId),
  collectAllBets: () => table && table.collectAllBets(),
  clearBets: () => table && table.clearBets(),
  setDealer: (nodeId, animate) => table && table.setDealer(nodeId, animate),
  postBlinds: (sb, bb, sbAmt, bbAmt) => table && table.postBlinds(sb, bb, sbAmt, bbAmt),
  clearDealer: () => table && table.clearDealer(),
  setPot: (n) => table && table.setPot(n),
  addPot: (n) => table && table.addPot(n),
  clearPot: () => table && table.clearPot(),
  setPots: (pots, bigBlind) => table && table.setPots(pots, bigBlind),
  clearPots: () => table && table.clearPots(),
  setSelfAvatarHidden: (hidden) => table && table.setSelfAvatarHidden(hidden),
})
</script>

<template>
  <div ref="host" class="pixi-layer"></div>
</template>

<style scoped>
.pixi-layer {
  position: absolute;
  inset: 0;
  /* 点击穿透：HUD 在更高 z-index 上接收点击，空座位的 DOM 占位也在上层接收入座点击 */
  pointer-events: none;
}
.pixi-layer :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
