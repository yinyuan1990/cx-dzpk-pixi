<script setup>
// topMenu (1080x101, top-aligned). Left = openBtn (hamburger) -> opens the table menu.
// Right = review(牌局回顾,已接) / invite / shop(待接). Safe-area aware.
defineEmits(['open-menu', 'review'])
</script>

<template>
  <div class="topMenu">
    <button class="tm-btn open" data-sound="click" @click="$emit('open-menu')">
      <img class="ic ic60" src="/assets/table/btn_open.png" alt="menu" />
    </button>
    <div class="tm-right">
      <button class="tm-btn" data-sound="click" @click="$emit('review')">
        <img class="ic ic60" src="/assets/table/btn_review.png" alt="回顾" />
      </button>
      <button class="tm-btn"><img class="ic ic60" src="/assets/table/btn_invite.png" alt="" /></button>
      <button class="tm-btn"><img class="ic ic60" src="/assets/table/btn_shop.png" alt="" /></button>
    </div>
  </div>
</template>

<style scoped>
.topMenu {
  position: absolute;
  left: 50%;
  top: calc(var(--sat, 0px) + 20px * var(--s));
  transform: translate(-50%, 0);
  width: calc(1080px * var(--s));
  height: calc(101px * var(--s));
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 calc(40px * var(--s));
}
.tm-right {
  display: flex;
  gap: calc(8px * var(--s));
}
.tm-btn {
  width: calc(115px * var(--s));
  height: calc(101px * var(--s));
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.ic {
  display: inline-block;
  object-fit: contain;
}
.ic60 {
  width: calc(60px * var(--s));
  height: calc(60px * var(--s));
}
</style>
