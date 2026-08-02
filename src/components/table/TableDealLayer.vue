<script setup>
// Flying deal cards (real card back). Each card is anchored at its seat target (--cx,--cy)
// and a CSS @keyframes animation tweens its transform from the center deal origin
// (--ox,--oy) to the target over DEAL_CARD. Using an animation (not a transition) means it
// starts the moment the element mounts -- no two-frame trigger dance, no risk of teleport --
// so all in-flight cards animate together (parallel burst), matching cocos.
defineProps({
  cards: { type: Array, required: true }, // [{ key, cx, cy, ox, oy, w, h }]
})
</script>

<template>
  <div class="deal-layer">
    <img
      v-for="c in cards"
      :key="c.key"
      class="t-node deal-card"
      :style="{
        '--cx': c.cx,
        '--cy': c.cy,
        '--ox': c.ox,
        '--oy': c.oy,
        width: `calc(${c.w}px * var(--s))`,
        height: `calc(${c.h}px * var(--s))`,
      }"
      src="/assets/table/cards/card_back.png"
      alt=""
    />
  </div>
</template>

<style scoped>
.deal-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.deal-card {
  object-fit: contain;
  z-index: 5;
  /* fly (transform) + flash (opacity); DEAL_CARD = 0.34s, easeSineOut approximation */
  animation: deal-fly 0.34s cubic-bezier(0.39, 0.575, 0.565, 1) forwards,
    deal-flash 0.34s linear forwards;
}
/* travel from the center origin to the seat target; combines with the .t-node -50% centering */
@keyframes deal-fly {
  from {
    transform: translate(
      calc(-50% + (var(--ox) - var(--cx)) * 1px * var(--s)),
      calc(-50% + (var(--oy) - var(--cy)) * 1px * var(--s))
    );
  }
  to {
    transform: translate(-50%, -50%);
  }
}
@keyframes deal-flash {
  0% { opacity: 0; }
  12% { opacity: 1; }
  78% { opacity: 1; }
  100% { opacity: 0; }
}
</style>
