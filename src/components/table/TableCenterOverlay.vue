<script setup>
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toCx, toCy } from '../../config/tableSeats'
import { formatKNotation } from '../../utils/format'

// Static center HUD: total-pot ribbon, WePoker watermark, center invite/start
// button, and the roomInfo block. All placed by real scene coords.
const props = defineProps({
  room: { type: Object, required: true },
  centerLabel: { type: String, required: true },
  // mid-hand (community board on table): hide the empty-table watermark + invite/start button
  boardActive: { type: Boolean, default: false },
  pot: { type: Number, default: 0 }, // 总底池金额（#10）：>0 时缎带显示数字并跳动
})
defineEmits(['center-click'])
const { t } = useI18n()

// 缎带数字跳动：底池累计时数字从旧值滚动到新值 + 一次弹缩(pop)。
const potDisplay = ref(0)
const potPop = ref(false)
let rollRaf = 0
watch(
  () => props.pot,
  (to, from) => {
    cancelAnimationFrame(rollRaf)
    const start = from || 0
    const t0 = performance.now()
    const dur = 450
    potPop.value = false
    requestAnimationFrame(() => (potPop.value = true))
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur)
      const e = 1 - Math.pow(1 - k, 3) // easeOutCubic
      potDisplay.value = Math.round(start + (to - start) * e)
      if (k < 1) rollRaf = requestAnimationFrame(step)
      else setTimeout(() => (potPop.value = false), 160)
    }
    rollRaf = requestAnimationFrame(step)
  },
)
// 底池数字格式化 = WPK FormatKNotation（113k / 12.6k / 88k …），与 Holdem 真机一致。
const fmt = (n) => formatKNotation(n)
</script>

<template>
  <!-- WePoker watermark logoNode(0,300) — hidden once the community board is dealt -->
  <div
    v-if="!boardActive"
    class="t-node logoNode"
    :style="{ '--cx': toCx(0), '--cy': toCy(300) }"
  >
    <img class="wpk-logo-img" src="/assets/table/wpk_logo.png" alt="WePoker" />
    <div class="wpk-url">www.wpk.com</div>
  </div>

  <!-- total pot ribbon ndTotalPot (raised to y=530 per 4.jpg) -->
  <div class="t-node ndTotalPot" :style="{ '--cx': toCx(0), '--cy': toCy(530) }">
    <span class="pot-text" :class="{ pop: potPop }">
      {{ t('table.totalPot') }}<template v-if="pot > 0"> {{ fmt(potDisplay) }}</template>
    </span>
  </div>

  <!-- center button start_game(0,75): invite/start — hidden once the board is dealt -->
  <button
    v-if="!boardActive"
    class="t-node start-game"
    :style="{ '--cx': toCx(0), '--cy': toCy(75) }"
    @click="$emit('center-click')"
  >
    {{ centerLabel }}
  </button>

  <!-- roomInfo(0,-88): blinds/roomNum/duration row + multiline info -->
  <div class="t-node roomInfo" :style="{ '--cx': toCx(0), '--cy': toCy(-88) }">
    <div class="ri-iconrow">
      <span class="ri-item"><img class="ic ic32" src="/assets/table/bet_step.png" alt="" />{{ room.blinds }}</span>
      <span class="ri-item"><img class="ic ic32" src="/assets/table/room_num.png" alt="" />{{ room.roomNum }}</span>
      <span class="ri-item"><img class="ic ic32" src="/assets/table/room_duration.png" alt="" />{{ room.duration }}</span>
    </div>
    <div class="ri-name">{{ room.name || t('table.demoRoomName') }}</div>
    <div v-if="room.line2" class="ri-line">{{ room.line2 }}</div>
    <div v-if="room.url" class="ri-line">{{ room.url }}</div>
  </div>
</template>

<style scoped>
.logoNode {
  width: calc(228px * var(--s));
  text-align: center;
  opacity: 0.5;
  pointer-events: none;
}
.wpk-logo-img {
  width: calc(228px * var(--s));
  height: calc(224px * var(--s));
  object-fit: contain;
  margin: 0 auto;
}
.wpk-url {
  margin-top: calc(6px * var(--s));
  font-size: calc(26px * var(--s));
  color: #cfe0d6;
  letter-spacing: calc(1px * var(--s));
}
.ndTotalPot {
  width: calc(276px * var(--s));
  height: calc(70px * var(--s));
  display: flex;
  align-items: center;
  justify-content: center;
  background: url(/assets/table/ic_pot.png) center / 100% 100% no-repeat;
}
.pot-text {
  font-size: calc(34px * var(--s));
  color: #e8f1ea;
  letter-spacing: calc(2px * var(--s));
  white-space: nowrap;
  transition: transform 0.16s ease;
}
.pot-text.pop {
  transform: scale(1.22);
  color: #ffd23b;
}
.start-game {
  width: calc(477px * var(--s));
  height: calc(144px * var(--s));
  border: none;
  background: url(/assets/table/ic_btn_start.png) center / 100% 100% no-repeat;
  color: #eaf5ee;
  font-size: calc(46px * var(--s));
  font-weight: 500;
  letter-spacing: calc(2px * var(--s));
  cursor: pointer;
}
.roomInfo {
  width: calc(620px * var(--s));
  text-align: center;
  color: rgba(220, 235, 226, 0.72);
  pointer-events: none;
}
.ri-iconrow {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: calc(28px * var(--s));
}
.ri-item {
  display: inline-flex;
  align-items: center;
  gap: calc(8px * var(--s));
  font-size: calc(30px * var(--s));
}
.ri-name {
  margin-top: calc(14px * var(--s));
  font-size: calc(30px * var(--s));
}
.ri-line {
  margin-top: calc(6px * var(--s));
  font-size: calc(28px * var(--s));
}
.ic {
  display: inline-block;
  object-fit: contain;
}
.ic32 {
  width: calc(32px * var(--s));
  height: calc(32px * var(--s));
}
</style>
