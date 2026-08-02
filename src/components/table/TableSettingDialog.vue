<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { faceGridIndex, CARD_SHEET_DIR, CARD_BACK_DIR } from '../../config/cardSkins.js'
import {
  faceSkins,
  backSkins,
  currentFace,
  currentBack,
  setFaceSkin,
  setBackSkin,
} from '../../pixi/cardAtlas.js'

// 牌桌设置：三页签 —— 背景 / 牌面 / 牌背。
//   背景沿用原 SettingTableStyleSelection；牌面/牌背 = 逆向 card_face_setting / card_back_setting，
//   切皮即时生效（cardAtlas 通知牌桌 restyle）并持久化 localStorage。
defineProps({
  show: { type: Boolean, default: false },
  backgrounds: { type: Array, required: true },
  selectedBg: { type: String, default: '' },
})
defineEmits(['close', 'select'])
const { t } = useI18n()

const tab = ref('bg') // 'bg' | 'face' | 'back'
const faceSel = ref(currentFace())
const backSel = ref(currentBack())

// 用 CSS 百分比精灵裁切牌面缩略图（取 A♠ 那一格，分辨率无关）。
function faceThumbStyle(skin) {
  const idx = faceGridIndex(101, skin.joker) // A♠
  const col = idx % skin.cols
  const row = Math.floor(idx / skin.cols)
  return {
    backgroundImage: `url(${CARD_SHEET_DIR + skin.file})`,
    backgroundSize: `${skin.cols * 100}% ${skin.rows * 100}%`,
    backgroundPosition: `${(col / (skin.cols - 1)) * 100}% ${(row / (skin.rows - 1)) * 100}%`,
  }
}
function pickFace(id) {
  faceSel.value = id
  setFaceSkin(id)
}
function pickBack(id) {
  backSel.value = id
  setBackSkin(id)
}
</script>

<template>
  <transition name="fade">
    <div v-if="show" class="setting-mask" @click.self="$emit('close')">
      <div class="setting-panel">
        <div class="sp-head">
          <div class="sp-tabs">
            <button class="sp-tab" :class="{ on: tab === 'bg' }" @click="tab = 'bg'">
              {{ t('table.tabBg') }}
            </button>
            <button class="sp-tab" :class="{ on: tab === 'face' }" @click="tab = 'face'">
              {{ t('table.tabFace') }}
            </button>
            <button class="sp-tab" :class="{ on: tab === 'back' }" @click="tab = 'back'">
              {{ t('table.tabBack') }}
            </button>
          </div>
          <button class="sp-close" data-sound="back" @click="$emit('close')">×</button>
        </div>

        <!-- 背景 -->
        <div v-if="tab === 'bg'" class="sp-grid">
          <button
            v-for="(opt, i) in backgrounds"
            :key="opt.id"
            class="bg-item"
            :class="{ on: selectedBg === opt.id }"
            @click="$emit('select', opt.id)"
          >
            <img class="bg-thumb" :src="opt.src" alt="" />
            <span class="bg-name">{{ t('table.bgStyle') }} {{ i + 1 }}</span>
          </button>
        </div>

        <!-- 牌面 -->
        <div v-else-if="tab === 'face'" class="sp-grid card-grid">
          <button
            v-for="skin in faceSkins()"
            :key="skin.id"
            class="bg-item"
            :class="{ on: faceSel === skin.id }"
            @click="pickFace(skin.id)"
          >
            <span class="card-thumb" :style="faceThumbStyle(skin)"></span>
            <span class="bg-name">{{ skin.label }}</span>
          </button>
        </div>

        <!-- 牌背 -->
        <div v-else class="sp-grid card-grid">
          <button
            v-for="skin in backSkins()"
            :key="skin.id"
            class="bg-item"
            :class="{ on: backSel === skin.id }"
            @click="pickBack(skin.id)"
          >
            <img class="card-thumb" :src="CARD_BACK_DIR + skin.file" alt="" />
          </button>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.setting-mask {
  position: absolute;
  inset: 0;
  z-index: 60;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: calc(40px * var(--s));
}
.setting-panel {
  width: calc(900px * var(--s));
  max-height: 80%;
  background: #20262e;
  border-radius: calc(28px * var(--s));
  padding: calc(36px * var(--s));
  display: flex;
  flex-direction: column;
  box-shadow: 0 calc(12px * var(--s)) calc(40px * var(--s)) rgba(0, 0, 0, 0.5);
}
.sp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: calc(20px * var(--s));
}
.sp-tabs {
  display: flex;
  gap: calc(12px * var(--s));
}
.sp-tab {
  border: none;
  background: #273039;
  color: #c5ccd3;
  font-size: calc(34px * var(--s));
  font-weight: 600;
  padding: calc(14px * var(--s)) calc(28px * var(--s));
  border-radius: calc(12px * var(--s));
  cursor: pointer;
}
.sp-tab.on {
  background: rgb(1, 175, 168);
  color: #06241f;
}
.sp-close {
  width: calc(64px * var(--s));
  height: calc(64px * var(--s));
  border: none;
  background: transparent;
  color: #9aa3ad;
  font-size: calc(56px * var(--s));
  line-height: 1;
  cursor: pointer;
}
.sp-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: calc(24px * var(--s));
  overflow-y: auto;
  padding: calc(4px * var(--s));
}
.card-grid {
  grid-template-columns: repeat(4, 1fr);
}
.bg-item {
  border: calc(4px * var(--s)) solid transparent;
  border-radius: calc(16px * var(--s));
  background: #273039;
  padding: calc(8px * var(--s));
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: calc(10px * var(--s));
}
.bg-item.on {
  border-color: rgb(1, 175, 168);
  background: rgba(0, 68, 65, 0.4);
}
.bg-thumb {
  width: 100%;
  aspect-ratio: 1080 / 1920;
  object-fit: cover;
  border-radius: calc(10px * var(--s));
  display: block;
}
.card-thumb {
  width: 100%;
  aspect-ratio: 127 / 180;
  border-radius: calc(8px * var(--s));
  display: block;
  background-color: #1b2128;
  background-repeat: no-repeat;
  object-fit: contain;
}
.bg-name {
  font-size: calc(26px * var(--s));
  color: #c5ccd3;
}
.bg-item.on .bg-name {
  color: rgb(0, 179, 171);
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
