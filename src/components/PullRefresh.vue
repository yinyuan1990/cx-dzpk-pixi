<script setup>
import { ref } from 'vue'

// 下拉刷新容器:本组件自身是滚动容器(替换页面原来的滚动 div,布局类从外部传入)。
// 手势:scrollTop=0 时下拉出现指示器,超过阈值松手触发 onRefresh(async)。
const props = defineProps({
  onRefresh: { type: Function, required: true },
})

const THRESHOLD = 56 // px(实际像素,非设计稿单位)
const el = ref(null)
const pull = ref(0)        // 当前下拉距离(px)
const refreshing = ref(false)

let startY = 0
let pulling = false

function onTouchStart(e) {
  if (refreshing.value) return
  if (el.value && el.value.scrollTop > 0) { pulling = false; return }
  startY = e.touches[0].clientY
  pulling = true
}
function onTouchMove(e) {
  if (!pulling || refreshing.value) return
  const dy = e.touches[0].clientY - startY
  if (dy <= 0 || (el.value && el.value.scrollTop > 0)) { pull.value = 0; return }
  e.preventDefault() // 阻止浏览器原生下拉(回弹/整页刷新)
  pull.value = Math.min(120, dy * 0.5) // 阻尼
}
async function onTouchEnd() {
  if (!pulling) return
  pulling = false
  if (pull.value >= THRESHOLD && !refreshing.value) {
    refreshing.value = true
    pull.value = THRESHOLD
    try {
      await props.onRefresh()
    } finally {
      refreshing.value = false
      pull.value = 0
    }
  } else {
    pull.value = 0
  }
}
</script>

<template>
  <div ref="el" class="pr-wrap" @touchstart="onTouchStart" @touchmove="onTouchMove"
    @touchend="onTouchEnd" @touchcancel="onTouchEnd">
    <div class="pr-indicator" :class="{ show: pull > 0 || refreshing }"
      :style="{ height: (refreshing ? THRESHOLD : pull) + 'px' }">
      <span v-if="refreshing" class="pr-spin"></span>
      <span v-else class="pr-text">{{ pull >= THRESHOLD ? '释放刷新' : '下拉刷新' }}</span>
    </div>
    <slot />
  </div>
</template>

<style scoped>
.pr-wrap {
  overflow-y: auto;
  overscroll-behavior-y: contain;
}
.pr-indicator {
  height: 0;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: height 0.15s ease-out;
  color: #9aa5a0;
  font-size: calc(28px * var(--s));
}
.pr-indicator.show {
  transition: none;
}
.pr-spin {
  width: calc(36px * var(--s));
  height: calc(36px * var(--s));
  border: calc(4px * var(--s)) solid #cfe9e1;
  border-top-color: #08c0a0;
  border-radius: 50%;
  animation: prspin 0.8s linear infinite;
}
@keyframes prspin {
  to { transform: rotate(360deg); }
}
</style>
