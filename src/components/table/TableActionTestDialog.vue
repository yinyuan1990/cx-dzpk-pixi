<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

// Action bar (#5) + pre-action (#6) test: pick a scene and show the matching bar.
defineProps({ show: { type: Boolean, default: false } })
const emit = defineEmits(['close', 'test'])
const { t } = useI18n()

const scene = ref('betFacing')
const SCENES = [
  { id: 'betFacing', key: 'sceneBetFacing' },
  { id: 'check', key: 'sceneCheck' },
  { id: 'short', key: 'sceneShort' },
  { id: 'pre', key: 'scenePre' },
]
</script>

<template>
  <transition name="fade">
    <div v-if="show" class="mask" @click.self="emit('close')">
      <div class="panel">
        <div class="head">
          <span class="title">{{ t('table.actionTest') }}</span>
          <button class="close" data-sound="back" @click="emit('close')">×</button>
        </div>

        <div class="label">{{ t('table.actionScene') }}</div>
        <div class="list">
          <button
            v-for="s in SCENES"
            :key="s.id"
            class="row"
            :class="{ on: scene === s.id }"
            @click="scene = s.id"
          >
            {{ t('table.' + s.key) }}
          </button>
        </div>

        <button class="test-btn" @click="emit('test', { scene })">
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
.list {
  display: flex;
  flex-direction: column;
  gap: calc(14px * var(--s));
  margin-bottom: calc(28px * var(--s));
}
.row {
  height: calc(96px * var(--s));
  border: calc(3px * var(--s)) solid #39424d;
  border-radius: calc(14px * var(--s));
  background: #273039;
  color: #e8edf2;
  font-size: calc(34px * var(--s));
  cursor: pointer;
}
.row.on {
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
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.18s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
