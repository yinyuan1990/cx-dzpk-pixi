<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

// 清场 / 下一手(#15) 测试：复刻 gameUI.cleanNotify。可先「布置样例牌局」(坐人 + 5 张公牌 +
//   下注堆/底池 + 庄盲标记 + 摊牌亮牌) 再播清场，直观看到公牌/手牌/摊牌牌淡出收向中心 + 底池/
//   下注/标记/特效一并复位；也可对当前牌局直接清场。
defineProps({ show: { type: Boolean, default: false } })
const emit = defineEmits(['close', 'test'])
const { t } = useI18n()

const setup = ref(true) // 先布置样例牌局，再清场
</script>

<template>
  <transition name="fade">
    <div v-if="show" class="mask" @click.self="emit('close')">
      <div class="panel">
        <div class="head">
          <span class="title">{{ t('table.clearTest') }}</span>
          <button class="close" data-sound="back" @click="emit('close')">×</button>
        </div>

        <div class="label">{{ t('table.clearMode') }}</div>
        <div class="grid grid2">
          <button class="num" :class="{ on: setup }" @click="setup = true">
            {{ t('table.clearSetup') }}
          </button>
          <button class="num" :class="{ on: !setup }" @click="setup = false">
            {{ t('table.clearCurrent') }}
          </button>
        </div>

        <p class="hint">{{ t('table.clearHint') }}</p>

        <button class="test-btn" @click="emit('test', { setup })">
          {{ t('table.startClear') }}
        </button>
        <button class="reset-btn" @click="emit('test', { mode: 'reset' })">
          {{ t('table.clearReset') }}
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
  grid-template-columns: repeat(2, 1fr);
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
  font-size: calc(32px * var(--s));
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
