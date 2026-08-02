<script setup>
import { onMounted } from 'vue'
import DesignStage from './components/DesignStage.vue'
import { installButtonSound } from './utils/sound.js'

// 全局按钮点击音效（逆向真实音频）
onMounted(() => installButtonSound())
</script>

<template>
  <!-- 全站统一 Cocos「整页等比 contain」适配：所有路由都跑在固定设计盒里（不变形/不走位）。
       不加页面级过渡：各页背景色不同，out-in 过渡会在切换间隙露出底色造成黑闪。 -->
  <DesignStage>
    <router-view />
  </DesignStage>
</template>
