<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

// Community-card test: pick which street to reveal (FLOP 3 / TURN 4 / RIVER 5 / 全程 ALL).
defineProps({ show: { type: Boolean, default: false } })
const emit = defineEmits(['close', 'test'])
const { t } = useI18n()

import { computed } from 'vue'
const round = ref('ALL')
const peek = ref(false) // 河牌「搓牌」(All-In peek)：仅 RIVER / 全程 时生效
const ROUNDS = [
  { id: 'FLOP', key: 'table.roundFlop' },
  { id: 'TURN', key: 'table.roundTurn' },
  { id: 'RIVER', key: 'table.roundRiver' },
  { id: 'ALL', key: 'table.roundAll' },
]
const peekable = computed(() => round.value === 'RIVER' || round.value === 'ALL')
</script>

<template>
  <transition name="fade">
    <div v-if="show" class="mask" @click.self="emit('close')">
      <div class="panel">
        <div class="head">
          <span class="title">{{ t('table.communityTest') }}</span>
          <button class="close" data-sound="back" @click="emit('close')">×</button>
        </div>

        <div class="label">{{ t('table.communityRound') }}</div>
        <div class="grid">
          <button
            v-for="r in ROUNDS"
            :key="r.id"
            class="num"
            :class="{ on: round === r.id }"
            @click="round = r.id"
          >
            {{ t(r.key) }}
          </button>
        </div>

        <label class="peek-row" :class="{ disabled: !peekable }">
          <input v-model="peek" type="checkbox" :disabled="!peekable" />
          <span>{{ t('table.communityPeek') }}</span>
        </label>

        <button class="test-btn" @click="emit('test', { round, peek: peek && peekable })">
          {{ t('table.startTest') }}
        </button>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.mask {
  position: absolute;
  inset: 0;
  z-index: 60;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: calc(40px * var(--s));
}
.panel {
  width: calc(720px * var(--s));
  background: #20262e;
  border-radius: calc(28px * var(--s));
  padding: calc(36px * var(--s));
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: calc(24px * var(--s));
}
.title {
  font-size: calc(44px * var(--s));
  font-weight: 700;
  color: #fff;
}
.close {
  width: calc(64px * var(--s));
  height: calc(64px * var(--s));
  border: none;
  background: transparent;
  color: #9aa3ad;
  font-size: calc(56px * var(--s));
  line-height: 1;
  cursor: pointer;
}
.label {
  font-size: calc(32px * var(--s));
  color: #8e9395;
  margin-bottom: calc(18px * var(--s));
}
.grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: calc(18px * var(--s));
  margin-bottom: calc(30px * var(--s));
}
.num {
  height: calc(96px * var(--s));
  border: calc(3px * var(--s)) solid #39424d;
  border-radius: calc(14px * var(--s));
  background: #273039;
  color: #e8edf2;
  font-size: calc(32px * var(--s));
  cursor: pointer;
}
.num.on {
  border-color: rgb(1, 175, 168);
  background: rgba(0, 68, 65, 0.45);
  color: rgb(0, 179, 171);
}
.peek-row {
  display: flex;
  align-items: center;
  gap: calc(16px * var(--s));
  margin-bottom: calc(28px * var(--s));
  color: #e8edf2;
  font-size: calc(30px * var(--s));
  cursor: pointer;
  user-select: none;
}
.peek-row input {
  width: calc(40px * var(--s));
  height: calc(40px * var(--s));
  accent-color: rgb(1, 175, 168);
  cursor: pointer;
}
.peek-row.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.test-btn {
  width: 100%;
  height: calc(104px * var(--s));
  border: none;
  border-radius: calc(16px * var(--s));
  background: rgb(1, 175, 168);
  color: #06241f;
  font-size: calc(40px * var(--s));
  font-weight: 700;
  cursor: pointer;
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.18s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
