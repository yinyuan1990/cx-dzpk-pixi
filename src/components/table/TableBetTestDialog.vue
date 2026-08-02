<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

// Bet-chip(#7) + pot(#10) test: pick a seat + amount, fire a bet (chips fly to bet spot),
// then optionally collect into the central pot; or run all seats at once; or reset pot.
defineProps({ show: { type: Boolean, default: false } })
const emit = defineEmits(['close', 'test'])
const { t } = useI18n()

const seat = ref(0)
const amount = ref(3500)
const mode = ref('bet') // bet=只下注 / collect=下注后收池 / all=全员下注收池
const SEATS = [0, 1, 2, 3, 4, 5, 6, 7, 8]
const AMOUNTS = [800, 3500, 12600, 88000, 250000]
</script>

<template>
  <transition name="fade">
    <div v-if="show" class="mask" @click.self="emit('close')">
      <div class="panel">
        <div class="head">
          <span class="title">{{ t('table.betTest') }}</span>
          <button class="close" data-sound="back" @click="emit('close')">×</button>
        </div>

        <div class="label">{{ t('table.seatPos') }}</div>
        <div class="grid">
          <button
            v-for="n in SEATS"
            :key="n"
            class="num"
            :class="{ on: seat === n }"
            @click="seat = n"
          >
            {{ n }}
          </button>
        </div>

        <div class="label">{{ t('table.betMode') }}</div>
        <div class="grid grid3">
          <button class="num" :class="{ on: mode === 'bet' }" @click="mode = 'bet'">
            {{ t('table.betModeBet') }}
          </button>
          <button class="num" :class="{ on: mode === 'collect' }" @click="mode = 'collect'">
            {{ t('table.betModeCollect') }}
          </button>
          <button class="num" :class="{ on: mode === 'all' }" @click="mode = 'all'">
            {{ t('table.betModeAll') }}
          </button>
        </div>

        <div class="label">{{ t('table.betAmount') }}</div>
        <div class="grid grid5">
          <button
            v-for="a in AMOUNTS"
            :key="a"
            class="num small"
            :class="{ on: amount === a }"
            @click="amount = a"
          >
            {{ a.toLocaleString('en-US') }}
          </button>
        </div>

        <button class="test-btn" @click="emit('test', { seat, amount, mode })">
          {{ t('table.startBet') }}
        </button>
        <button class="reset-btn" @click="emit('test', { mode: 'reset' })">
          {{ t('table.betReset') }}
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
  grid-template-columns: repeat(5, 1fr);
  gap: calc(18px * var(--s));
  margin-bottom: calc(30px * var(--s));
}
.grid2 {
  grid-template-columns: repeat(2, 1fr);
}
.grid3 {
  grid-template-columns: repeat(3, 1fr);
}
.num {
  height: calc(96px * var(--s));
  border: calc(3px * var(--s)) solid #39424d;
  border-radius: calc(14px * var(--s));
  background: #273039;
  color: #e8edf2;
  font-size: calc(34px * var(--s));
  cursor: pointer;
}
.num.small {
  font-size: calc(26px * var(--s));
}
.num.on {
  border-color: rgb(1, 175, 168);
  background: rgba(0, 68, 65, 0.45);
  color: rgb(0, 179, 171);
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
.reset-btn {
  width: 100%;
  height: calc(88px * var(--s));
  margin-top: calc(18px * var(--s));
  border: calc(3px * var(--s)) solid #39424d;
  border-radius: calc(16px * var(--s));
  background: transparent;
  color: #c9d2da;
  font-size: calc(34px * var(--s));
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
