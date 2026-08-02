<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

// Deal-animation test: pick player count (2-9), click test to deal.
defineProps({ show: { type: Boolean, default: false } })
const emit = defineEmits(['close', 'test'])
const { t } = useI18n()

const count = ref(6)
const selfSeated = ref(true)
const OPTIONS = [2, 3, 4, 5, 6, 7, 8, 9]
</script>

<template>
  <transition name="fade">
    <div v-if="show" class="mask" @click.self="emit('close')">
      <div class="panel">
        <div class="head">
          <span class="title">{{ t('table.dealTest') }}</span>
          <button class="close" data-sound="back" @click="emit('close')">×</button>
        </div>
        <div class="label">{{ t('table.playerCount') }}</div>
        <div class="grid">
          <button
            v-for="n in OPTIONS"
            :key="n"
            class="num"
            :class="{ on: count === n }"
            @click="count = n"
          >
            {{ n }}
          </button>
        </div>
        <button
          class="self-row"
          :class="{ on: selfSeated }"
          @click="selfSeated = !selfSeated"
        >
          <span>{{ t('table.selfSeated') }}</span>
          <span class="switch" :class="{ on: selfSeated }"><i></i></span>
        </button>
        <button class="test-btn" @click="emit('test', { count, selfSeated })">
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
  font-size: calc(40px * var(--s));
  cursor: pointer;
}
.num.on {
  border-color: rgb(1, 175, 168);
  background: rgba(0, 68, 65, 0.45);
  color: rgb(0, 179, 171);
}
.self-row {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #273039;
  border: none;
  border-radius: calc(14px * var(--s));
  padding: calc(22px * var(--s)) calc(24px * var(--s));
  margin-bottom: calc(24px * var(--s));
  color: #e8edf2;
  font-size: calc(34px * var(--s));
  cursor: pointer;
}
.switch {
  width: calc(84px * var(--s));
  height: calc(44px * var(--s));
  border-radius: calc(22px * var(--s));
  background: #4a5763;
  position: relative;
  transition: background 0.15s;
}
.switch.on {
  background: rgb(1, 175, 168);
}
.switch i {
  position: absolute;
  top: calc(4px * var(--s));
  left: calc(4px * var(--s));
  width: calc(36px * var(--s));
  height: calc(36px * var(--s));
  border-radius: 50%;
  background: #fff;
  transition: left 0.15s;
}
.switch.on i {
  left: calc(44px * var(--s));
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
