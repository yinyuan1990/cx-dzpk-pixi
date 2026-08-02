<script setup>
import { onMounted, onBeforeUnmount, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import * as PIXI from 'pixi.js'
import { loadPixiSpine, getSpineClass } from '../../utils/loadPixiSpine.js'

// 进桌加载页 = 逆向 `SwitchLoadingView`（prefab `pkw/zh_CN/commonPrefab/LoadingView`）：
//   暗色全屏遮罩 + 居中「loading-poker」**Spine 骨骼动画**（卡牌堆，sp.SkeletonData，animation 循环）
//   + 文案「正在进入牌桌, 请稍候」+ 三个点波浪上下跳（label_0/1/2 moveBy 0,10 错峰）。无进度条。
defineProps({
  percent: { type: Number, default: 0 }, // 兼容旧调用；本视觉不显示进度条（对齐 499.jpg）
})
const { t } = useI18n()
const host = shallowRef(null)
let app = null
let spine = null
let onTick = null

function place() {
  if (!app || !spine) return
  spine.position.set(app.screen.width / 2, app.screen.height / 2)
  const s = (app.screen.height * 0.92) / 332 // 骨骼高约 332，留边
  spine.scale.set(s)
}

onMounted(async () => {
  app = new PIXI.Application({
    resizeTo: host.value,
    transparent: true,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  })
  host.value.appendChild(app.view)
  app.renderer.on('resize', place)
  try {
    await loadPixiSpine()
    const Spine = getSpineClass()
    const data = await new Promise((resolve) => {
      const l = new PIXI.Loader()
      l.add('loadingPoker', '/assets/spine/loading/loading-poker.json').load((_, res) => {
        resolve(res && res.loadingPoker && res.loadingPoker.spineData)
      })
    })
    if (data && Spine && app) {
      spine = new Spine(data)
      spine.autoUpdate = false // 本 app 用独立 ticker → 手动 update
      app.stage.addChild(spine)
      place()
      spine.state.setAnimation(0, 'animation', true)
      onTick = () => {
        if (spine && spine.update) spine.update(app.ticker.elapsedMS / 1000)
      }
      app.ticker.add(onTick)
    }
  } catch (e) {
    void e
  }
})

onBeforeUnmount(() => {
  if (app && onTick) app.ticker.remove(onTick)
  if (app) app.renderer.off('resize', place)
  if (spine) {
    try { spine.destroy({ children: true }) } catch (e) { void e }
    spine = null
  }
  if (app) {
    app.destroy(true, { children: true, texture: false, baseTexture: false })
    app = null
  }
})
</script>

<template>
  <div class="table-loading">
    <div ref="host" class="spine-host"></div>
    <div class="des">
      {{ t('table.enteringTable') }}<span class="dots"><i></i><i></i><i></i></span>
    </div>
  </div>
</template>

<style scoped>
.table-loading {
  position: absolute;
  inset: 0;
  z-index: 80;
  /* 暗色遮罩（对齐 499.jpg：近黑径向，中心略亮）*/
  background: radial-gradient(circle at 50% 44%, #2a2e33 0%, #16181b 58%, #0b0c0e 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.spine-host {
  width: calc(280px * var(--s));
  height: calc(340px * var(--s));
}
.spine-host :deep(canvas) {
  width: 100%;
  height: 100%;
  display: block;
}
.des {
  margin-top: calc(40px * var(--s));
  color: #d7dce2;
  font-size: calc(34px * var(--s));
  letter-spacing: calc(1px * var(--s));
  display: inline-flex;
  align-items: flex-end;
}
/* 三个点波浪上下跳（对齐 cocos label_0/1/2 moveBy 0,10 错峰）*/
.dots {
  display: inline-flex;
  margin-left: calc(2px * var(--s));
}
.dots i {
  width: calc(8px * var(--s));
  height: calc(8px * var(--s));
  margin: 0 calc(3px * var(--s));
  border-radius: 50%;
  background: #d7dce2;
  display: inline-block;
  align-self: flex-end;
  animation: dotbob 1.5s infinite ease-in-out;
}
.dots i:nth-child(2) {
  animation-delay: 0.25s;
}
.dots i:nth-child(3) {
  animation-delay: 0.5s;
}
@keyframes dotbob {
  0%,
  60%,
  100% {
    transform: translateY(0);
  }
  30% {
    transform: translateY(calc(-10px * var(--s)));
  }
}
</style>
