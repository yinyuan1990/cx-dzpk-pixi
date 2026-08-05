<script setup>
import { computed } from 'vue'
import { cardStrToId, serverCardToClient } from '../../net/tableModel.js'
import { formatKNotation } from '../../utils/format'

// 牌型回顾(老德州90的简化版):每手一张静态快照——公共牌 + 各玩家手牌/牌型/盈亏。
// 可见性由后端控制:自己的牌总给,他人只有摊牌亮过才给(没给的画牌背)。
// 视觉风格与实时战绩面板统一:半透明黑 + 金标题 + PKW-Chip 数字 + 真实牌面图。
const props = defineProps({
  show: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  data: { type: Object, default: null }, // {handNo,minHandNo,maxHandNo,board,players}
})
defineEmits(['close', 'nav'])

// "AS,KD,..." → 牌面图 src 列表
function cardSrcs(str) {
  if (!str) return []
  return String(str).split(',').filter(Boolean).map((s) => {
    const v = serverCardToClient(cardStrToId(s.trim()))
    return v != null ? `/assets/table/cards/front/${v}.png` : null
  }).filter(Boolean)
}

const boardSrcs = computed(() => (props.data ? cardSrcs(props.data.board) : []))
const canPrev = computed(() => props.data && props.data.handNo > props.data.minHandNo)
const canNext = computed(() => props.data && props.data.handNo < props.data.maxHandNo)
</script>

<template>
  <transition name="fade">
    <div v-if="show" class="hr-mask" @click.self="$emit('close')">
      <div class="hr-box">
        <!-- 标题 + 翻手 -->
        <div class="hr-head">
          <button class="hr-nav" :disabled="!canPrev" @click="$emit('nav', data.handNo - 1)">‹</button>
          <span class="hr-title">牌局回顾<b v-if="data && data.handNo">第 {{ data.handNo }} 手</b></span>
          <button class="hr-nav" :disabled="!canNext" @click="$emit('nav', data.handNo + 1)">›</button>
        </div>

        <div v-if="loading" class="hr-empty">加载中…</div>
        <template v-else-if="data && data.players && data.players.length">
          <!-- 公共牌 -->
          <div class="hr-board">
            <template v-if="boardSrcs.length">
              <img v-for="(src, i) in boardSrcs" :key="i" :src="src" class="hr-card" />
            </template>
            <span v-else class="hr-noboard">翻牌前结束</span>
          </div>

          <!-- 玩家快照 -->
          <div class="hr-list">
            <div v-for="p in data.players" :key="p.userId" class="hr-row" :class="{ folded: p.folded }">
              <span class="hr-player">
                <i class="hr-name">{{ p.nickname }}</i>
                <i class="hr-sub">{{ p.folded ? '弃牌' : (p.showdown ? '摊牌' : '未亮') }}</i>
              </span>
              <span class="hr-hole">
                <template v-if="cardSrcs(p.holeCards).length">
                  <img v-for="(src, i) in cardSrcs(p.holeCards)" :key="i" :src="src" class="hr-card sm" />
                </template>
                <template v-else>
                  <img src="/assets/table/cards/card_back.png" class="hr-card sm" />
                  <img src="/assets/table/cards/card_back.png" class="hr-card sm" />
                </template>
              </span>
              <span class="hr-type">{{ p.handName || '' }}</span>
              <span class="hr-win" :class="{ win: p.netWin > 0, lose: p.netWin < 0 }">
                {{ p.netWin > 0 ? '+' : '' }}{{ formatKNotation(p.netWin) }}
              </span>
            </div>
          </div>
        </template>
        <div v-else class="hr-empty">这一桌还没有打过牌</div>

        <button class="hr-close" @click="$emit('close')">关闭</button>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.hr-mask {
  position: absolute;
  inset: 0;
  z-index: 60;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
}
.hr-box {
  width: calc(880px * var(--s));
  max-height: 84%;
  display: flex;
  flex-direction: column;
  background: rgba(0, 0, 0, 0.72);
  backdrop-filter: blur(2px);
  border: 1px solid rgba(92, 224, 192, 0.25);
  border-radius: calc(24px * var(--s));
  padding: calc(24px * var(--s)) calc(26px * var(--s)) calc(20px * var(--s));
}
.hr-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: calc(16px * var(--s));
}
.hr-title {
  font-size: calc(40px * var(--s));
  font-weight: 700;
  color: #ffd76a;
}
.hr-title b {
  font-family: 'PKW-Chip', 'Microsoft YaHei', sans-serif;
  font-weight: 400;
  font-size: calc(30px * var(--s));
  color: #cfe0d6;
  margin-left: calc(16px * var(--s));
}
.hr-nav {
  width: calc(72px * var(--s));
  height: calc(72px * var(--s));
  border: none;
  border-radius: 50%;
  background: rgba(92, 224, 192, 0.15);
  color: #5ce0c0;
  font-size: calc(44px * var(--s));
  line-height: 1;
  cursor: pointer;
}
.hr-nav:disabled {
  opacity: 0.25;
}
.hr-board {
  display: flex;
  justify-content: center;
  gap: calc(10px * var(--s));
  padding: calc(10px * var(--s)) 0 calc(18px * var(--s));
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}
.hr-noboard {
  color: #88a89c;
  font-size: calc(28px * var(--s));
  padding: calc(20px * var(--s)) 0;
}
.hr-card {
  width: calc(104px * var(--s));
  height: calc(148px * var(--s));
  object-fit: contain;
}
.hr-card.sm {
  width: calc(76px * var(--s));
  height: calc(108px * var(--s));
}
.hr-list {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  margin-top: calc(8px * var(--s));
}
.hr-row {
  display: flex;
  align-items: center;
  gap: calc(14px * var(--s));
  padding: calc(12px * var(--s)) calc(6px * var(--s));
}
.hr-row:nth-child(even) {
  background: rgba(255, 255, 255, 0.04);
}
.hr-row.folded {
  opacity: 0.55;
}
.hr-player {
  flex: 1.2;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.hr-name {
  font-style: normal;
  font-size: calc(28px * var(--s));
  color: #eaf5ee;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hr-sub {
  font-style: normal;
  font-size: calc(20px * var(--s));
  color: #88a89c;
}
.hr-hole {
  flex: none;
  display: flex;
  gap: calc(6px * var(--s));
}
.hr-type {
  flex: 1;
  text-align: center;
  font-size: calc(26px * var(--s));
  color: #ffd76a;
}
.hr-win {
  flex: 0.9;
  text-align: right;
  font-family: 'PKW-Chip', 'Microsoft YaHei', sans-serif;
  font-size: calc(30px * var(--s));
  color: #dfe9e4;
}
.hr-win.win {
  color: #6cd08c;
}
.hr-win.lose {
  color: #ff8a8a;
}
.hr-close {
  margin-top: calc(16px * var(--s));
  border: none;
  background: #164a38;
  color: #9fe8d0;
  font-size: calc(32px * var(--s));
  padding: calc(16px * var(--s)) 0;
  border-radius: calc(14px * var(--s));
  cursor: pointer;
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.16s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
