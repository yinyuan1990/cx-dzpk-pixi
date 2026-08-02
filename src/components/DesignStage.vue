<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { DESIGN_WIDTH, DESIGN_HEIGHT } from '../config/design.js'

// 全站统一适配 = Cocos「整页等比 contain」（不变形/不走位）。
// 固定设计盒 DESIGN_WIDTH×DESIGN_HEIGHT 居中，整体 scale(fit)，fit = min(W/designW, H/designH)
// （取受限维度 = 按长或宽）。盒内一切用纯设计 px（--s 覆写为 1），缩放交给盒的 transform，
// 背景与前景锁在同一缩放里 → 任何窗口比例只改 fit 与居中，内部布局冻结。盒外 = letterbox。
const root = ref(null)
function applyFit() {
  const fit = Math.min(window.innerWidth / DESIGN_WIDTH, window.innerHeight / DESIGN_HEIGHT)
  if (root.value) root.value.style.setProperty('--fit', String(fit))
}
onMounted(() => {
  applyFit()
  window.addEventListener('resize', applyFit)
  window.addEventListener('orientationchange', applyFit)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', applyFit)
  window.removeEventListener('orientationchange', applyFit)
})
</script>

<template>
  <div ref="root" class="design-viewport">
    <div class="design-stage" :style="{ width: DESIGN_WIDTH + 'px', height: DESIGN_HEIGHT + 'px' }">
      <slot />
    </div>
  </div>
</template>

<style scoped>
/* 视口铺满；设计盒未覆盖区域 = letterbox（黑，等价 Cocos 画布外底色） */
.design-viewport {
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: #000;
  --fit: 1;
}
/* 固定设计盒：尺寸恒为设计分辨率 px，居中后整体 scale(fit)。
   盒内 --s 归一：所有页面已有的 calc(px*var(--s)) 代码无需改动，缩放整体交给这里的 transform。
   transform 祖先会成为后代 position:fixed 的包含块 → 弹框遮罩落在盒内（letterbox 不变暗，符合 contain）。 */
.design-stage {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%) scale(var(--fit, 1));
  transform-origin: center center;
  overflow: hidden;
  --s: 1;
}
</style>
