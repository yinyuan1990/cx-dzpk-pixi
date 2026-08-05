<script setup>
import { useI18n } from 'vue-i18n'

// openBtn menu (top-left,对齐扯旋牌局菜单):
//   补充积分 / 牌型提示(开关) / 牌局设置 / 赠送积分 / 站起围观 / 留桌离桌(或回座) / 解散(创建者) / 退出房间。
//   测试按钮已全部移除(调试走桌面右上角虫子图标)。
defineProps({
  show: { type: Boolean, default: false },
  spectating: { type: Boolean, default: false },
  seated: { type: Boolean, default: false },
  inGrace: { type: Boolean, default: false },
  isCreator: { type: Boolean, default: false },
})
defineEmits([
  'close',
  'add-chips',
  'hand-tip',
  'settings',
  'gift',
  'stand-up-spectate',
  'seat-reserve',
  'seat-resume',
  'dismiss',
  'leave-room',
])
const { t } = useI18n()
</script>

<template>
  <transition name="fade">
    <div v-if="show" class="menu-mask" @click.self="$emit('close')">
      <div class="menu-sheet">
        <button v-if="seated" class="menu-row hi" @click="$emit('add-chips')">
          <span class="mr-icon">🪙</span>补充积分
        </button>
        <button class="menu-row" @click="$emit('hand-tip')">
          <span class="mr-icon">💡</span>牌型提示
        </button>
        <button class="menu-row" @click="$emit('settings')">
          <span class="mr-icon">⚙</span>{{ t('table.settings') }}
        </button>
        <button v-if="seated" class="menu-row" @click="$emit('gift')">
          <span class="mr-icon">🎁</span>赠送积分
        </button>
        <button v-if="seated" class="menu-row" @click="$emit('stand-up-spectate')">
          <span class="mr-icon">🪑</span>{{ t('table.standUpSpectate') }}
        </button>
        <button v-if="seated && !inGrace" class="menu-row" @click="$emit('seat-reserve')">
          <span class="mr-icon">🌴</span>{{ t('table.seatReserve') }}
        </button>
        <button v-if="seated && inGrace" class="menu-row hi" @click="$emit('seat-resume')">
          <span class="mr-icon">▶</span>{{ t('table.seatResume') }}
        </button>
        <button v-if="isCreator" class="menu-row danger" @click="$emit('dismiss')">
          <span class="mr-icon">🗑</span>{{ t('table.dismissRoom') }}
        </button>
        <button class="menu-row danger" data-sound="back" @click="$emit('leave-room')">
          <span class="mr-icon">⎋</span>{{ t('table.leaveRoom') }}
        </button>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.menu-mask {
  position: absolute;
  inset: 0;
  z-index: 55;
  background: rgba(0, 0, 0, 0.35);
}
/* anchored under the top-left openBtn */
.menu-sheet {
  position: absolute;
  left: calc(40px * var(--s));
  top: calc(var(--sat, 0px) + 130px * var(--s));
  width: calc(440px * var(--s));
  background: #20262e;
  border-radius: calc(20px * var(--s));
  padding: calc(12px * var(--s));
  box-shadow: 0 calc(10px * var(--s)) calc(32px * var(--s)) rgba(0, 0, 0, 0.5);
}
.menu-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: calc(18px * var(--s));
  padding: calc(22px * var(--s)) calc(20px * var(--s));
  border: none;
  background: transparent;
  color: #e8edf2;
  font-size: calc(36px * var(--s));
  text-align: left;
  cursor: pointer;
  border-radius: calc(12px * var(--s));
}
.menu-row:active {
  background: #2b333d;
}
.menu-row.danger {
  color: #ff6b6b;
}
.menu-row.hi {
  color: rgb(0, 199, 190);
  font-weight: 700;
}
.mr-icon {
  width: calc(40px * var(--s));
  text-align: center;
  font-size: calc(38px * var(--s));
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
