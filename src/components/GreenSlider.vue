<script setup>
import { computed } from 'vue'

// 统一滑条(对齐 Unity 参考样式):细圆角轨道,已滑过段绿色渐变、
// 剩余段浅灰,白色大圆把手带阴影。填充比例用 --pct 打进 track 渐变。
const props = defineProps({
  modelValue: { type: Number, required: true },
  min: { type: Number, default: 0 },
  max: { type: Number, default: 100 },
  step: { type: Number, default: 1 },
})
const emit = defineEmits(['update:modelValue'])

const pct = computed(() => {
  const span = props.max - props.min
  if (span <= 0) return 0
  return Math.min(100, Math.max(0, ((props.modelValue - props.min) / span) * 100))
})
function onInput(e) {
  emit('update:modelValue', Number(e.target.value))
}
</script>

<template>
  <input type="range" class="gslider" :min="min" :max="max" :step="step"
    :value="modelValue" :style="{ '--pct': pct + '%' }" @input="onInput" />
</template>

<style scoped>
.gslider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: calc(56px * var(--s));
  background: transparent;
  cursor: pointer;
  margin: 0;
}

/* WebKit 轨道:填充比例由 --pct 控制 */
.gslider::-webkit-slider-runnable-track {
  height: calc(12px * var(--s));
  border-radius: calc(6px * var(--s));
  background: linear-gradient(
    to right,
    #14d3b6 0%,
    #08c0a0 var(--pct),
    #e6e6e8 var(--pct),
    #e6e6e8 100%
  );
}
.gslider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: calc(44px * var(--s));
  height: calc(44px * var(--s));
  margin-top: calc(-16px * var(--s));
  border-radius: 50%;
  background: #ffffff;
  border: none;
  box-shadow: 0 calc(3px * var(--s)) calc(10px * var(--s)) rgba(0, 0, 0, 0.25);
}

/* Firefox */
.gslider::-moz-range-track {
  height: calc(12px * var(--s));
  border-radius: calc(6px * var(--s));
  background: #e6e6e8;
}
.gslider::-moz-range-progress {
  height: calc(12px * var(--s));
  border-radius: calc(6px * var(--s));
  background: linear-gradient(90deg, #14d3b6, #08c0a0);
}
.gslider::-moz-range-thumb {
  width: calc(44px * var(--s));
  height: calc(44px * var(--s));
  border-radius: 50%;
  background: #ffffff;
  border: none;
  box-shadow: 0 calc(3px * var(--s)) calc(10px * var(--s)) rgba(0, 0, 0, 0.25);
}
</style>
