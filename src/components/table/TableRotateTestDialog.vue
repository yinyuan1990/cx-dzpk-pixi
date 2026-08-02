<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

// Sit-down + seat rotation (#1) test: pick the seat the hero sits into. The rest of the
// ring is filled with other players; sitting rotates that seat down to the bottom
// (useSeatRotation.sitDown / sitdownWithAni), carrying every seat + marker around.
defineProps({ show: { type: Boolean, default: false } })
const emit = defineEmits(['close', 'test'])
const { t } = useI18n()

const seat = ref(5)
const SEATS = [0, 1, 2, 3, 4, 5, 6, 7, 8]
const withBlinds = ref(true)
</script>

<template>
  <transition name="fade">
    <div v-if="show" class="mask" @click.self="emit('close')">
      <div class="panel">
        <div class="head">
          <span class="title">{{ t('table.rotateTest') }}</span>
          <button class="close" data-sound="back" @click="emit('close')">×</button>
        </div>

        <div class="label">{{ t('table.sitSeat') }}</div>
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

        <label class="row">
          <input type="checkbox" v-model="withBlinds" />
          <span>{{ t('table.rotateWithBlinds') }}</span>
        </label>

        <div class="hint">{{ t('table.rotateHint') }}</div>

        <button class="test-btn" @click="emit('test', { seat, withBlinds })">
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
  grid-template-columns: repeat(5, 1fr);
  gap: calc(18px * var(--s));
  margin-bottom: calc(20px * var(--s));
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
.row {
  display: flex;
  align-items: center;
  gap: calc(16px * var(--s));
  font-size: calc(32px * var(--s));
  color: #d8dee4;
  margin-bottom: calc(20px * var(--s));
  cursor: pointer;
}
.row input {
  width: calc(36px * var(--s));
  height: calc(36px * var(--s));
}
.hint {
  font-size: calc(28px * var(--s));
  color: #b9c2cc;
  margin-bottom: calc(28px * var(--s));
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
