<script setup>
import { computed } from 'vue'
import { cardStrToId, serverCardToClient } from '../../net/tableModel.js'
import { formatKNotation } from '../../utils/format'

// 牌型回顾(对齐扯旋 CHEXUANTableRecordPanel):右侧滑出面板,每页一手。
//   顶部公共牌 → 玩家卡片网格(头像/昵称/两张牌/牌型/下注/输赢/状态) →
//   底部:对局时间 + 分页(‹ 第X手 ›) + 强制秀牌(付费解锁本手全部手牌)。
// 可见性由后端控制:自己的总给,他人只有摊牌亮过才给,强制秀牌后全给。
const props = defineProps({
  show: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  data: { type: Object, default: null }, // {handNo,minHandNo,maxHandNo,board,roundTime,forceShown,forceShowCost,players}
})
defineEmits(['close', 'nav', 'force-show'])

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
// 已有未亮的牌才需要"强制秀牌"按钮
const hasHidden = computed(() =>
  props.data && (props.data.players || []).some((p) => !p.holeCards) && !props.data.forceShown)

function fmtTime(ms) {
  if (!ms) return ''
  const d = new Date(ms)
  const p2 = (n) => String(n).padStart(2, '0')
  return `${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`
}
</script>

<template>
  <transition name="slide-right">
    <div v-if="show" class="hr-mask" @click.self="$emit('close')">
      <div class="hr-side">
        <!-- 顶部:标题 + 关闭 -->
        <div class="hr-head">
          <span class="hr-title">牌局回顾<b v-if="data && data.handNo">第 {{ data.handNo }} 手</b></span>
          <span class="hr-x" @click="$emit('close')">✕</span>
        </div>

        <div v-if="loading" class="hr-empty">加载中…</div>
        <template v-else-if="data && data.players && data.players.length">
          <!-- 公共牌 -->
          <div class="hr-board">
            <template v-if="boardSrcs.length">
              <img v-for="(src, i) in boardSrcs" :key="i" :src="src" class="hr-bcard" />
            </template>
            <span v-else class="hr-noboard">翻牌前结束</span>
          </div>

          <!-- 玩家卡片网格(对齐扯旋 item1~8 双列) -->
          <div class="hr-grid">
            <div v-for="p in data.players" :key="p.userId" class="hr-item" :class="{ folded: p.folded }">
              <div class="hi-top">
                <img v-if="p.avatar" :src="p.avatar" class="hi-av" />
                <span v-else class="hi-av hi-av-txt">{{ (p.nickname || '?')[0] }}</span>
                <span class="hi-info">
                  <i class="hi-name">{{ p.nickname }}</i>
                  <i class="hi-bet">下注:{{ formatKNotation(p.totalBet) }}</i>
                </span>
                <span class="hi-win" :class="{ win: p.netWin > 0, lose: p.netWin < 0 }">
                  {{ p.netWin > 0 ? '+' : '' }}{{ formatKNotation(p.netWin) }}
                </span>
              </div>
              <div class="hi-cards">
                <template v-if="cardSrcs(p.holeCards).length">
                  <img v-for="(src, i) in cardSrcs(p.holeCards)" :key="i" :src="src" class="hi-card" />
                </template>
                <template v-else>
                  <img src="/assets/table/cards/card_back.png" class="hi-card" />
                  <img src="/assets/table/cards/card_back.png" class="hi-card" />
                </template>
                <span class="hi-type">{{ p.handName || (p.folded ? '弃牌' : '') }}</span>
              </div>
            </div>
          </div>

          <!-- 底部:对局时间 + 分页 + 强制秀牌 -->
          <div class="hr-time">对局时间:{{ fmtTime(data.roundTime) }}</div>
          <div class="hr-foot">
            <button class="hr-nav" :disabled="!canPrev" @click="$emit('nav', data.handNo - 1)">‹</button>
            <span class="hr-page">{{ data.handNo }} / {{ data.maxHandNo }}</span>
            <button class="hr-nav" :disabled="!canNext" @click="$emit('nav', data.handNo + 1)">›</button>
            <button v-if="hasHidden" class="hr-force" @click="$emit('force-show', data.handNo)">
              强制秀牌<i>{{ formatKNotation(data.forceShowCost || 0) }}积分</i>
            </button>
          </div>
        </template>
        <div v-else class="hr-empty">这一桌还没有打过牌</div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.hr-mask {
  position: absolute;
  inset: 0;
  z-index: 60;
  background: rgba(0, 0, 0, 0.2);
  display: flex;
  justify-content: flex-end;
  align-items: stretch;
}
/* 右侧滑出面板(对齐扯旋 startAni:从右滑入) */
.hr-side {
  width: calc(780px * var(--s));
  max-width: 84%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: rgba(0, 0, 0, 0.72);
  backdrop-filter: blur(2px);
  border-left: 1px solid rgba(92, 224, 192, 0.25);
  padding: calc(30px * var(--s) + var(--sat, 0px)) calc(22px * var(--s)) calc(20px * var(--s) + var(--sab, 0px));
}
.slide-right-enter-active,
.slide-right-leave-active {
  transition: opacity 0.25s ease;
}
.slide-right-enter-active .hr-side,
.slide-right-leave-active .hr-side {
  transition: transform 0.25s ease-out;
}
.slide-right-enter-from,
.slide-right-leave-to {
  opacity: 0;
}
.slide-right-enter-from .hr-side,
.slide-right-leave-to .hr-side {
  transform: translateX(100%);
}
.hr-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: calc(12px * var(--s));
}
.hr-title {
  font-size: calc(40px * var(--s));
  font-weight: 700;
  color: #ffd76a;
}
.hr-title b {
  font-family: 'PKW-Chip', 'Microsoft YaHei', sans-serif;
  font-weight: 400;
  font-size: calc(28px * var(--s));
  color: #cfe0d6;
  margin-left: calc(16px * var(--s));
}
.hr-x {
  color: #88a89c;
  font-size: calc(36px * var(--s));
  cursor: pointer;
  padding: calc(4px * var(--s)) calc(10px * var(--s));
}
.hr-board {
  display: flex;
  justify-content: center;
  gap: calc(8px * var(--s));
  padding: calc(8px * var(--s)) 0 calc(14px * var(--s));
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}
.hr-noboard {
  color: #88a89c;
  font-size: calc(26px * var(--s));
  padding: calc(14px * var(--s)) 0;
}
.hr-bcard {
  width: calc(90px * var(--s));
  height: calc(128px * var(--s));
  object-fit: contain;
}
/* 玩家卡片网格:双列(对齐扯旋 item 布局) */
.hr-grid {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: calc(12px * var(--s));
  align-content: start;
  padding-top: calc(12px * var(--s));
}
.hr-item {
  background: rgba(255, 255, 255, 0.05);
  border-radius: calc(14px * var(--s));
  padding: calc(12px * var(--s));
}
.hr-item.folded {
  opacity: 0.55;
}
.hi-top {
  display: flex;
  align-items: center;
  gap: calc(10px * var(--s));
  min-width: 0;
}
.hi-av {
  width: calc(56px * var(--s));
  height: calc(56px * var(--s));
  border-radius: 50%;
  object-fit: cover;
  flex: none;
}
.hi-av-txt {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #1c4a3a;
  color: #9fe8d0;
  font-size: calc(24px * var(--s));
}
.hi-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.hi-name {
  font-style: normal;
  font-size: calc(24px * var(--s));
  color: #eaf5ee;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hi-bet {
  font-style: normal;
  font-size: calc(19px * var(--s));
  color: #88a89c;
}
.hi-win {
  flex: none;
  font-family: 'PKW-Chip', 'Microsoft YaHei', sans-serif;
  font-size: calc(26px * var(--s));
  color: #dfe9e4;
}
.hi-win.win { color: #6cd08c; }
.hi-win.lose { color: #ff8a8a; }
.hi-cards {
  display: flex;
  align-items: center;
  gap: calc(6px * var(--s));
  margin-top: calc(10px * var(--s));
}
.hi-card {
  width: calc(70px * var(--s));
  height: calc(100px * var(--s));
  object-fit: contain;
}
.hi-type {
  margin-left: calc(8px * var(--s));
  font-size: calc(22px * var(--s));
  color: #ffd76a;
}
.hr-time {
  text-align: center;
  color: #88a89c;
  font-size: calc(22px * var(--s));
  padding: calc(10px * var(--s)) 0 calc(4px * var(--s));
  border-top: 1px solid rgba(255, 255, 255, 0.12);
}
.hr-foot {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: calc(20px * var(--s));
  padding-top: calc(8px * var(--s));
}
.hr-nav {
  width: calc(68px * var(--s));
  height: calc(68px * var(--s));
  border: none;
  border-radius: 50%;
  background: rgba(92, 224, 192, 0.15);
  color: #5ce0c0;
  font-size: calc(40px * var(--s));
  line-height: 1;
  cursor: pointer;
}
.hr-nav:disabled {
  opacity: 0.25;
}
.hr-page {
  min-width: calc(120px * var(--s));
  text-align: center;
  font-family: 'PKW-Chip', 'Microsoft YaHei', sans-serif;
  font-size: calc(28px * var(--s));
  color: #cfe0d6;
}
.hr-force {
  border: 1px solid rgba(255, 215, 106, 0.5);
  border-radius: calc(26px * var(--s));
  background: rgba(0, 0, 0, 0.5);
  color: #ffd76a;
  font-size: calc(26px * var(--s));
  padding: calc(10px * var(--s)) calc(24px * var(--s));
  cursor: pointer;
}
.hr-force i {
  font-style: normal;
  margin-left: calc(8px * var(--s));
  font-size: calc(20px * var(--s));
  color: #9fb5ab;
}
.hr-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #88a89c;
  font-size: calc(30px * var(--s));
}
</style>
