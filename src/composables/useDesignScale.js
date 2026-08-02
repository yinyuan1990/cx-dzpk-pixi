import { onMounted, onBeforeUnmount, ref } from 'vue'
import { DESIGN_WIDTH, computeScale } from '../config/design.js'

// 把「设计分辨率 → 屏幕」的缩放比写到一个 CSS 变量 --s 上（挂在 document.documentElement），
// 所有页面用 calc(<设计px> * var(--s)) 做尺寸/锚定偏移，等价 Cocos 的 fitWidth + Widget。
// 返回一个响应式 scale，供需要在 JS 里读缩放比的地方（如 Pixi 层对齐）使用。
export function useDesignScale() {
  const scale = ref(computeScale())

  function apply() {
    scale.value = computeScale()
    document.documentElement.style.setProperty('--s', String(scale.value))
    document.documentElement.style.setProperty('--design-w', `${DESIGN_WIDTH}px`)
  }

  onMounted(() => {
    apply()
    window.addEventListener('resize', apply)
    window.addEventListener('orientationchange', apply)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('resize', apply)
    window.removeEventListener('orientationchange', apply)
  })

  return { scale }
}
