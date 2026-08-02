<script setup>
import { useI18n } from 'vue-i18n'

// openBtn menu (top-left). Entries: table settings / stand up spectate / leave room / dev tests.
defineProps({
  show: { type: Boolean, default: false },
  spectating: { type: Boolean, default: false },
  seated: { type: Boolean, default: false },
})
defineEmits([
  'close',
  'settings',
  'stand-up-spectate',
  'leave-room',
  'clear',
  'leave',
  'rotate-test',
  'deal-test',
  'countdown-test',
  'win-test',
  'community-test',
  'bet-test',
  'blind-test',
  'action-test',
  'fold-test',
  'showdown-test',
  'gift-test',
  'allin-test',
  'clear-test',
  'sim-test',
])
const { t } = useI18n()
</script>

<template>
  <transition name="fade">
    <div v-if="show" class="menu-mask" @click.self="$emit('close')">
      <div class="menu-sheet">
        <button class="menu-row" @click="$emit('settings')">
          <span class="mr-icon">⚙</span>{{ t('table.settings') }}
        </button>
        <template v-if="spectating">
          <button v-if="seated" class="menu-row hi" @click="$emit('stand-up-spectate')">
            <span class="mr-icon">🪑</span>{{ t('table.standUpSpectate') }}
          </button>
          <button class="menu-row danger" data-sound="back" @click="$emit('leave-room')">
            <span class="mr-icon">⎋</span>{{ t('table.leaveRoom') }}
          </button>
        </template>
        <button class="menu-row hi" @click="$emit('sim-test')">
          <span class="mr-icon">🎬</span>{{ t('table.simTest') }}
        </button>
        <button class="menu-row" @click="$emit('rotate-test')">
          <span class="mr-icon">🔄</span>{{ t('table.rotateTest') }}
        </button>
        <button class="menu-row" @click="$emit('deal-test')">
          <span class="mr-icon">🂠</span>{{ t('table.dealTest') }}
        </button>
        <button class="menu-row" @click="$emit('countdown-test')">
          <span class="mr-icon">⏱</span>{{ t('table.countdownTest') }}
        </button>
        <button class="menu-row" @click="$emit('community-test')">
          <span class="mr-icon">🃏</span>{{ t('table.communityTest') }}
        </button>
        <button class="menu-row" @click="$emit('win-test')">
          <span class="mr-icon">🏆</span>{{ t('table.winTest') }}
        </button>
        <button class="menu-row" @click="$emit('bet-test')">
          <span class="mr-icon">🪙</span>{{ t('table.betTest') }}
        </button>
        <button class="menu-row" @click="$emit('blind-test')">
          <span class="mr-icon">🅓</span>{{ t('table.blindTest') }}
        </button>
        <button class="menu-row" @click="$emit('action-test')">
          <span class="mr-icon">🎛</span>{{ t('table.actionTest') }}
        </button>
        <button class="menu-row" @click="$emit('fold-test')">
          <span class="mr-icon">🚮</span>{{ t('table.foldTest') }}
        </button>
        <button class="menu-row" @click="$emit('showdown-test')">
          <span class="mr-icon">🎴</span>{{ t('table.showdownTest') }}
        </button>
        <button class="menu-row" @click="$emit('gift-test')">
          <span class="mr-icon">🌹</span>{{ t('table.giftTest') }}
        </button>
        <button class="menu-row" @click="$emit('allin-test')">
          <span class="mr-icon">🔥</span>{{ t('table.allinTest') }}
        </button>
        <button class="menu-row" @click="$emit('clear-test')">
          <span class="mr-icon">🧹</span>{{ t('table.clearTest') }}
        </button>
        <button class="menu-row" @click="$emit('clear')">
          <span class="mr-icon">↺</span>{{ t('table.clearSeats') }}
        </button>
        <button v-if="!spectating" class="menu-row danger" data-sound="back" @click="$emit('leave')">
          <span class="mr-icon">⎋</span>{{ t('table.leave') }}
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
