<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

// 整局演示 / 模拟：把 #0~#15 阶段串成一局自动流程（入座 → 庄盲 → 发牌 → PRE_FLOP 倒计时+下注 →
//   FLOP/TURN/RIVER 每街下注收池 → 摊牌亮牌 → 结算赢得效果 → 清场）。可选人数 + 是否自动循环下一手。
defineProps({ show: { type: Boolean, default: false } })
const emit = defineEmits(['close', 'test'])
const { t } = useI18n()

const count = ref(4)
const loop = ref(false)
const COUNTS = [2, 3, 4, 5, 6]
</script>

<template>
  <transition name="fade">
    <div v-if="show" class="mask" @click.self="emit('close')">
      <div class="panel">
        <div class="head">
          <span class="title">{{ t('table.simTest') }}</span>
          <button class="close" data-sound="back" @click="emit('close')">×</button>
        </div>

        <div class="label">{{ t('table.simCount') }}</div>
        <div class="grid">
          <button
            v-for="n in COUNTS"
            :key="n"
            class="num"
            :class="{ on: count === n }"
            @click="count = n"
          >
            {{ n }}
          </button>
        </div>

        <div class="label">{{ t('table.simLoop') }}</div>
        <div class="grid grid2">
          <button class="num" :class="{ on: !loop }" @click="loop = false">
            {{ t('table.simOnce') }}
          </button>
          <button class="num" :class="{ on: loop }" @click="loop = true">
            {{ t('table.simLoopOn') }}
          </button>
        </div>

        <p class="hint">{{ t('table.simHint') }}</p>

        <button class="test-btn" @click="emit('test', { count, loop })">
          {{ t('table.startSim') }}
        </button>
        <button class="reset-btn" @click="emit('test', { mode: 'stop' })">
          {{ t('table.simStop') }}
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
  margin-bottom: calc(24px * var(--s));
}
.grid2 {
  grid-template-columns: repeat(2, 1fr);
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
.num.on {
  border-color: rgb(1, 175, 168);
  background: rgba(0, 68, 65, 0.45);
  color: rgb(0, 179, 171);
}
.hint {
  font-size: calc(26px * var(--s));
  color: #6f767d;
  line-height: 1.5;
  margin: 0 0 calc(28px * var(--s));
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
