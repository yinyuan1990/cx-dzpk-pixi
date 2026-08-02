<script setup>
// 密码显隐眼睛图标：open=可见(睁眼)，否则=隐藏(闭眼带斜线)。
defineProps({ open: { type: Boolean, default: false } })
</script>

<template>
  <svg class="eye-svg" viewBox="0 0 24 24" fill="none" stroke="#9aa0a6" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round">
    <template v-if="open">
      <path d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </template>
    <template v-else>
      <path d="M9.9 5.2A10.6 10.6 0 0 1 12 5c7 0 10.5 7 10.5 7a18 18 0 0 1-2.8 3.6" />
      <path d="M6.3 6.4A18 18 0 0 0 1.5 12S5 19 12 19a10.4 10.4 0 0 0 4.2-.9" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <line x1="3" y1="3" x2="21" y2="21" />
    </template>
  </svg>
</template>

<style scoped>
.eye-svg {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
