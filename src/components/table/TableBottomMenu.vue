<script setup>
// bottomMenu (1080x101, bottom-aligned): score / chat / mic / emoji at real x coords.
const BUTTONS = [
  { key: 'score', icon: '/assets/table/btn_score.png', x: -456, size: 64 },
  { key: 'chat', icon: '/assets/table/btn_chat.png', x: -245, size: 80 },
  { key: 'speak', icon: '/assets/table/btn_speak.png', x: 245, size: 64 },
  { key: 'emoji', icon: '/assets/table/btn_emoji.png', x: 460, size: 64 },
]
</script>

<template>
  <div class="bottomMenu">
    <button
      v-for="b in BUTTONS"
      :key="b.key"
      class="bm-btn"
      :style="{ '--bx': b.x }"
    >
      <img :style="{ width: `calc(${b.size}px * var(--s))`, height: `calc(${b.size}px * var(--s))` }" :src="b.icon" alt="" />
    </button>
  </div>
</template>

<style scoped>
.bottomMenu {
  position: absolute;
  left: 50%;
  bottom: calc(var(--sab, 0px) + 20px * var(--s));
  transform: translate(-50%, 0);
  width: calc(1080px * var(--s));
  height: calc(101px * var(--s));
}
.bm-btn {
  position: absolute;
  top: 50%;
  left: calc((540 + var(--bx)) * 1px * var(--s));
  transform: translate(-50%, -50%);
  width: calc(120px * var(--s));
  height: calc(120px * var(--s));
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.bm-btn img {
  object-fit: contain;
}
</style>
