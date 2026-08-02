<script setup>
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatKNotation } from '../../utils/format'

/*
 * Pre-action bar — 1:1 逆向 preOpt.prefab + preOpt.js（非你回合的预操作）。
 * 142×142 圆，prefold@-259(让或弃 autoCh_Fold)、preCall@+259(跟注+额 autoCell) / preCheck@+259(自动让牌 autoCheck)。
 * 每键 spNormal=ic_pre_normal(灰) / spHigh=对应彩色(fold红/check绿/call蓝)；点击 toggle 选中→换彩底。
 * 入场 scale 0→1 + moveTo 中心，WPActionTime.preOptBtn=0.16s。
 */
const props = defineProps({
  show: { type: Boolean, default: false },
  right: { type: Object, default: () => ({ type: 'check' }) }, // { type:'check'|'call', amount }
})
const emit = defineEmits(['select'])
const { t } = useI18n()
const fmt = (n) => formatKNotation(n)

const selected = ref('') // '', 'fold', 'check', 'call'
const rightKind = computed(() => (props.right && props.right.type === 'call' ? 'call' : 'check'))
const rightLabel = computed(() => (rightKind.value === 'call' ? t('table.preCall') : t('table.preCheck')))

function toggle(which) {
  selected.value = selected.value === which ? '' : which
  emit('select', selected.value)
}
watch(
  () => props.show,
  (v) => {
    if (!v) selected.value = ''
  },
)
</script>

<template>
  <div v-if="show" class="pre-root">
    <button
      class="pre-btn"
      :class="selected === 'fold' ? 'sel-fold' : 'norm'"
      style="--px: -259"
      @click="toggle('fold')"
    >
      <span class="pb-label">{{ t('table.preFold') }}</span>
    </button>
    <button
      class="pre-btn"
      :class="selected === rightKind ? (rightKind === 'call' ? 'sel-call' : 'sel-check') : 'norm'"
      style="--px: 259"
      @click="toggle(rightKind)"
    >
      <span v-if="rightKind === 'call' && right.amount != null" class="pb-num">{{ fmt(right.amount) }}</span>
      <span class="pb-label">{{ rightLabel }}</span>
    </button>
  </div>
</template>

<style scoped>
/* 与 optUser 同坐标系：锚到自己座位 seat0(屏幕中心 + 732*s)，预操作键叠在头像身前(local y=-80)。 */
.pre-root {
  position: absolute;
  left: 50%;
  top: calc(50% + var(--shift, 0px) + 732px * var(--s));
  width: 0;
  height: 0;
  z-index: 40;
  pointer-events: none;
}
.pre-btn {
  position: absolute;
  left: calc(var(--px, 0) * 1px * var(--s));
  top: calc(80px * var(--s)); /* optUser 局部 y=-80（头像身前下方）→ 下移 80*s */
  width: calc(142px * var(--s));
  height: calc(142px * var(--s));
  border: none;
  border-radius: 50%;
  background: center/100% 100% no-repeat;
  color: #fff;
  cursor: pointer;
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  line-height: 1.04;
  text-shadow: 0 calc(2px * var(--s)) calc(4px * var(--s)) rgba(0, 0, 0, 0.5);
  transform: translate(-50%, -50%);
  animation: preIn 0.16s ease both;
}
@keyframes preIn {
  from {
    transform: translate(-50%, -50%) scale(0);
  }
  to {
    transform: translate(-50%, -50%) scale(1);
  }
}
.pre-btn.norm {
  background-image: url('/assets/table/opt/ic_pre_normal.png');
  color: #e9eef2;
}
.pre-btn.sel-fold {
  background-image: url('/assets/table/opt/ic_fold.png');
}
.pre-btn.sel-check {
  background-image: url('/assets/table/opt/ic_check.png');
}
.pre-btn.sel-call {
  background-image: url('/assets/table/opt/ic_call.png');
}
.pb-label {
  font-size: calc(30px * var(--s));
  font-weight: 700;
}
.pb-num {
  font-size: calc(42px * var(--s));
  font-weight: 800;
}
.pre-btn .pb-num + .pb-label {
  font-size: calc(26px * var(--s));
}
</style>
