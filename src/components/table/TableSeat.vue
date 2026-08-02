<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  CARD_BACK,
  frontSrc,
  handLayout,
  handTypeKey,
  SELF_AVATAR,
  OTHER_AVATAR,
  NAME_DY,
  SCORE_DY,
  CARD_TYPE_DY,
} from '../../config/cards'
import { formatKNotation } from '../../utils/format'

// One seat node (= Cocos seatNode). The seat node itself is what the rotation animates
// (its left/top), so EVERYTHING rendered inside here -- avatar, hole cards, nickname,
// stack, card-type -- moves together for free. Adding a new seat-attached node later =
// add markup in this file; the rotation logic never changes.
const props = defineProps({
  cx: { type: Number, required: true },
  cy: { type: Number, required: true },
  player: { type: Object, default: null }, // { avatar, name, stack, isSelf, cards }
  side: { type: String, default: 'bottom' }, // ring side (left/right/top/bottom)
  rotating: { type: Boolean, default: false },
  // pixiMode: occupied-seat visuals are rendered by the Pixi game layer instead; the DOM
  // seat keeps only the empty "+" placeholder + click hit-area (sit-down).
  pixiMode: { type: Boolean, default: false },
})
defineEmits(['sit'])
const { t } = useI18n()

const isSelf = computed(() => !!(props.player && props.player.isSelf))
const layout = computed(() => handLayout(isSelf.value, props.side))
const key = computed(() => (isSelf.value ? 'self' : 'other'))

// self => big cards flip in (handCards _showDealFlopCardAni); others => pop instantly.
function cardStyle(ci, revealed, faceUp) {
  const s = layout.value
  const slot = s.slots[ci]
  return {
    width: `calc(${s.size.w}px * var(--s))`,
    height: `calc(${s.size.h}px * var(--s))`,
    transform:
      `translate(-50%, -50%)` +
      ` translate(calc(${slot.dx}px * var(--s)), calc(${slot.dy}px * var(--s)))` +
      ` rotate(${slot.rot || 0}deg)` +
      ` scaleX(${revealed ? 1 : 0})`,
  }
}
const offY = (dy) => ({ transform: `translate(-50%, -50%) translateY(calc(${dy}px * var(--s)))` })
const nameStyle = computed(() => offY(NAME_DY[key.value]))
const scoreStyle = computed(() => offY(SCORE_DY[key.value]))
const cardTypeStyle = computed(() => offY(CARD_TYPE_DY))
const avatarStyle = computed(() => {
  const d = isSelf.value ? SELF_AVATAR : OTHER_AVATAR
  return {
    width: `calc(${d}px * var(--s))`,
    height: `calc(${d}px * var(--s))`,
    borderRadius: `calc(${Math.round(d * 0.3)}px * var(--s))`,
  }
})
</script>

<template>
  <button
    class="t-node seat"
    :class="[{ rotating, self: isSelf }, 'side-' + side]"
    :style="{ '--cx': cx, '--cy': cy }"
    @click="$emit('sit')"
  >
    <!-- empty: dashed "+" placeholder. In pixiMode the Pixi layer draws the (circular)
         placeholder; the DOM button stays as a transparent click hit-area for sit-down. -->
    <img v-if="!player && !pixiMode" class="seat-empty" src="/assets/table/ic_seat_empty_bg.png" alt="" />

    <!-- occupied: seat-attached child nodes (all rotate with the seat).
         In pixiMode the Pixi game layer renders these instead (unified z with effects). -->
    <template v-else-if="!pixiMode">
      <!-- hole cards: self = big below avatar (flip in); others = small backs at corner -->
      <img
        v-for="(c, ci) in player.cards"
        :key="ci"
        class="card"
        :class="{ flip: c.faceUp && isSelf }"
        :style="cardStyle(ci, c.revealed, c.faceUp)"
        :src="c.faceUp ? frontSrc(c.value) : CARD_BACK"
        alt=""
      />

      <img class="avatar" :style="avatarStyle" :src="player.avatar" alt="" />

      <!-- nickname above the avatar -->
      <div class="np-name" :style="nameStyle">{{ player.name }}</div>

      <!-- self only: made-hand label (高牌) below the cards -->
      <div v-if="isSelf" class="np-cardtype" :style="cardTypeStyle">
        {{ t(handTypeKey(player.cards)) }}
      </div>

      <!-- stack / score plate below -->
      <div class="np-score" :style="scoreStyle">{{ formatKNotation(player.stack) }}</div>

      <!-- extension points (future, no rotation change needed):
           bet-chips (toward pot) / timer-ring (CommonCircularProgressBar) / status-tag -->
    </template>
  </button>
</template>

<style scoped>
.seat {
  width: calc(144px * var(--s));
  height: calc(144px * var(--s));
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;
}
/* sitdownWithAni: each step moves the seat node to its neighbor slot over 0.11s */
.seat.rotating {
  transition: left 0.11s linear, top 0.11s linear;
}
.seat-empty {
  width: calc(144px * var(--s));
  height: calc(144px * var(--s));
  object-fit: contain;
}

/* avatar = rounded-square (squircle), like the seat frame (Cocos masks head to seat shape) */
.avatar {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  object-fit: cover;
  background: #2f3a44;
  z-index: 3;
}

/* hole cards rest at their slots (position/size via inline style); start collapsed
   (scaleX 0). self's cards flip in (.2s); others pop instantly.
   Z-ORDER (faithful to seatNode.prefab child order, all _localZOrder=0 so paint order
   = sibling order): userInfo (avatar+name+score) is painted FIRST, then otherHdCards /
   otherOpCards. So other players' cards render ON TOP of the avatar (their corner backs
   overlap the bottom edge of the head), above the name/score plate too. */
.card {
  position: absolute;
  left: 50%;
  top: 50%;
  object-fit: contain;
  transform-origin: center;
  border-radius: calc(6px * var(--s));
  box-shadow: 0 calc(1px * var(--s)) calc(4px * var(--s)) rgba(0, 0, 0, 0.4);
  z-index: 5;
}
.card.flip {
  transition: transform 0.2s ease;
}
/* self's big cards sit below the avatar (no overlap); keep them under the avatar/labels
   so the made-hand label & stack stay readable (Cocos optUser is a separate top node). */
.seat.self .card {
  z-index: 2;
}

/* nickname / card-type / stack share an absolute-center anchor + per-element translateY */
.np-name,
.np-cardtype,
.np-score {
  position: absolute;
  left: 50%;
  top: 50%;
  white-space: nowrap;
  text-align: center;
  z-index: 4;
  pointer-events: none;
}
.np-name {
  font-size: calc(26px * var(--s));
  color: #eaf3ee;
  text-shadow: 0 calc(1px * var(--s)) calc(3px * var(--s)) rgba(0, 0, 0, 0.7);
}
.np-cardtype {
  font-size: calc(34px * var(--s));
  color: #ffe08a;
  font-weight: 600;
  text-shadow: 0 calc(1px * var(--s)) calc(3px * var(--s)) rgba(0, 0, 0, 0.7);
}
.np-score {
  font-size: calc(30px * var(--s));
  color: #ffd23b;
  background: rgba(8, 22, 16, 0.72);
  border-radius: calc(10px * var(--s));
  padding: calc(3px * var(--s)) calc(16px * var(--s));
}
</style>
