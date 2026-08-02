<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

// 送礼物测试：选送礼座位 + 受赠座位 + 礼物类型，触发飞行 + 落点骨骼 burst。
//   spingoAnimationLayer 全 10 个互动礼物骨骼：DragonBones 5 + Spine 5，已悉数恢复。
defineProps({ show: { type: Boolean, default: false } })
const emit = defineEmits(['close', 'test'])
const { t } = useI18n()

const from = ref(4)
const to = ref(0)
const type = ref('meigui')
const SEATS = [0, 1, 2, 3, 4, 5, 6, 7, 8]
const TYPES = [
  { id: 'meigui', key: 'table.giftMeigui' },
  { id: 'xihongshi', key: 'table.giftXihongshi' },
  { id: 'zhuaji', key: 'table.giftZhuaji' },
  { id: 'zhadan', key: 'table.giftZhadan' },
  { id: 'poshui', key: 'table.giftPoshui' },
  { id: 'dianzan', key: 'table.giftDianzan' },
  { id: 'kiss', key: 'table.giftKiss' },
  { id: 'buyu', key: 'table.giftBuyu' },
  { id: 'motou', key: 'table.giftMotou' },
  { id: 'huojiantong', key: 'table.giftHuojiantong' },
]
</script>

<template>
  <transition name="fade">
    <div v-if="show" class="mask" @click.self="emit('close')">
      <div class="panel">
        <div class="head">
          <span class="title">{{ t('table.giftTest') }}</span>
          <button class="close" data-sound="back" @click="emit('close')">×</button>
        </div>

        <div class="label">{{ t('table.giftSender') }}</div>
        <div class="grid">
          <button
            v-for="n in SEATS"
            :key="'f' + n"
            class="num"
            :class="{ on: from === n }"
            @click="from = n"
          >
            {{ n }}
          </button>
        </div>

        <div class="label">{{ t('table.giftReceiver') }}</div>
        <div class="grid">
          <button
            v-for="n in SEATS"
            :key="'t' + n"
            class="num"
            :class="{ on: to === n }"
            @click="to = n"
          >
            {{ n }}
          </button>
        </div>

        <div class="label">{{ t('table.giftType') }}</div>
        <div class="grid grid3">
          <button
            v-for="g in TYPES"
            :key="g.id"
            class="num"
            :class="{ on: type === g.id }"
            @click="type = g.id"
          >
            {{ t(g.key) }}
          </button>
        </div>

        <button class="test-btn" @click="emit('test', { from, to, type })">
          {{ t('table.startGift') }}
        </button>
        <button class="reset-btn" @click="emit('test', { mode: 'reset' })">
          {{ t('table.giftReset') }}
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
  margin-bottom: calc(26px * var(--s));
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
