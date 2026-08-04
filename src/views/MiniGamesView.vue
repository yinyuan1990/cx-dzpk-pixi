<script setup>
import HallBottomBar from '../components/HallBottomBar.vue'
import HallTopBar from '../components/HallTopBar.vue'

// 小游戏 tab:占位页(后续接入钻石小游戏列表)
</script>

<template>
  <div class="stage-root minigames">
    <HallTopBar />
    <div class="mg-body">
      <div class="mg-icon">&#127918;</div>
      <div class="mg-text">小游戏敬请期待</div>
    </div>
    <HallBottomBar active="game" />
  </div>
</template>

<style scoped>
.minigames {
  background: #fff8f9;
  color: #2b2b2d;
}
.mg-body {
  position: absolute;
  top: calc(180px * var(--s) + var(--sat, 0px));
  left: 0;
  width: 100%;
  bottom: calc(250px * var(--s) + var(--sab, 0px));
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: calc(24px * var(--s));
}
.mg-icon {
  font-size: calc(120px * var(--s));
}
.mg-text {
  font-size: calc(38px * var(--s));
  color: #9a9a9c;
}
</style>
