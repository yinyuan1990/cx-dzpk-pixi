<script setup>
// 牌型提示(德州比牌规则):十个档位从大到小,每档一个示例(用真实牌面图)。
// 牌值编码 = suit(1♦ 2♣ 3♥ 4♠)×100 + rank(1=A,2-10,11=J,12=Q,13=K),同 cards.js。
defineProps({ show: { type: Boolean, default: false } })
defineEmits(['close'])

const front = (v) => `/assets/table/cards/front/${v}.png`

const HAND_RANKS = [
  { name: '皇家同花顺', desc: '同花色 A K Q J 10', cards: [401, 413, 412, 411, 410] },
  { name: '同花顺', desc: '同花色五张连续', cards: [309, 308, 307, 306, 305] },
  { name: '四条', desc: '四张相同点数', cards: [412, 312, 212, 112, 305] },
  { name: '葫芦', desc: '三条 + 一对', cards: [411, 311, 211, 108, 408] },
  { name: '同花', desc: '同花色任意五张', cards: [201, 211, 208, 206, 203] },
  { name: '顺子', desc: '五张连续(花色不限)', cards: [410, 309, 208, 107, 306] },
  { name: '三条', desc: '三张相同点数', cards: [407, 307, 207, 413, 102] },
  { name: '两对', desc: '两组对子', cards: [413, 313, 209, 109, 404] },
  { name: '一对', desc: '一组对子', cards: [401, 301, 211, 107, 403] },
  { name: '高牌', desc: '以上都不是,比最大单张', cards: [401, 313, 209, 106, 304] },
]
</script>

<template>
  <transition name="fade">
    <div v-if="show" class="ht-mask" @click.self="$emit('close')">
      <div class="ht-box">
        <div class="ht-title">牌型大小(从大到小)</div>
        <div class="ht-list">
          <div v-for="(h, i) in HAND_RANKS" :key="h.name" class="ht-row">
            <span class="ht-no">{{ i + 1 }}</span>
            <span class="ht-info">
              <i class="ht-name">{{ h.name }}</i>
              <i class="ht-desc">{{ h.desc }}</i>
            </span>
            <span class="ht-cards">
              <img v-for="v in h.cards" :key="v" :src="front(v)" class="ht-card" />
            </span>
          </div>
        </div>
        <button class="ht-close" @click="$emit('close')">关闭</button>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.ht-mask {
  position: absolute;
  inset: 0;
  z-index: 60;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
}
.ht-box {
  width: calc(880px * var(--s));
  max-height: 86%;
  display: flex;
  flex-direction: column;
  background: rgba(10, 32, 24, 0.97);
  border: 1px solid rgba(92, 224, 192, 0.25);
  border-radius: calc(24px * var(--s));
  padding: calc(28px * var(--s)) calc(26px * var(--s)) calc(20px * var(--s));
}
.ht-title {
  text-align: center;
  font-size: calc(40px * var(--s));
  font-weight: 700;
  color: #ffd76a;
  margin-bottom: calc(18px * var(--s));
}
.ht-list {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}
.ht-row {
  display: flex;
  align-items: center;
  gap: calc(14px * var(--s));
  padding: calc(12px * var(--s)) calc(6px * var(--s));
}
.ht-row:nth-child(even) {
  background: rgba(255, 255, 255, 0.04);
}
.ht-no {
  flex: none;
  width: calc(40px * var(--s));
  text-align: center;
  color: #88a89c;
  font-size: calc(28px * var(--s));
}
.ht-info {
  flex: none;
  width: calc(220px * var(--s));
  display: flex;
  flex-direction: column;
}
.ht-name {
  font-style: normal;
  font-size: calc(30px * var(--s));
  font-weight: 600;
  color: #eaf5ee;
}
.ht-desc {
  font-style: normal;
  font-size: calc(20px * var(--s));
  color: #88a89c;
  margin-top: calc(2px * var(--s));
}
.ht-cards {
  flex: 1;
  display: flex;
  gap: calc(6px * var(--s));
  justify-content: flex-end;
}
.ht-card {
  width: calc(88px * var(--s));
  height: calc(125px * var(--s));
  object-fit: contain;
}
.ht-close {
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
