<script setup>
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

// 1:1 还原自 HallBottomBar 打包 prefab（main/_packed/a6db0f97）：
// 整条 1080×250 吸底；content 1000 宽水平 Layout，padding L/R 30；
// 5 个 tab：大厅 / 小游戏 / 好友局 / 生涯 / 我的。
// 路由统一在本组件内跳转(各页不再各写 onTab,修复来回切不动的问题)。
// 图标=逆向真图(atlas 17247d922 裁出 56×56)，用 CSS mask 上色：选中青绿/未选灰。
const { t } = useI18n()
const router = useRouter()
const props = defineProps({ active: { type: String, default: 'hall' } })
const emit = defineEmits(['change'])

const TABS = [
  { key: 'hall', icon: 'tab_hall', label: () => t('hall.tabHall'), route: '/hall' },
  { key: 'game', icon: 'tab_game', label: () => t('hall.tabGame'), route: '/minigames' },
  { key: 'friend', icon: 'tab_friend', label: () => t('hall.tabFriend'), route: '/friend' },
  { key: 'career', icon: 'tab_career', label: () => t('hall.tabCareer'), route: '/career' },
  { key: 'profile', icon: 'tab_profile', label: () => t('hall.tabProfile'), route: '/profile' },
]

function onClick(tb) {
  emit('change', tb.key)
  if (tb.key !== props.active) router.push(tb.route)
}
</script>

<template>
  <div class="bottombar">
    <!-- content：深色圆角胶囊浮条（bg_bottom_bar #1e1e1e），1000×160 -->
    <div class="content">
      <button
        v-for="tb in TABS"
        :key="tb.key"
        class="tabitem"
        :class="{ on: active === tb.key }"
        @click="onClick(tb)"
      >
        <!-- 未选：只白字；选中：薄荷胶囊(bg_hall_bottom_active #84F9CC) 内 图标+文字 横向 -->
        <template v-if="active === tb.key">
          <span class="pill">
            <i class="ti-icon" :style="{ '--icon': `url(/assets/hall/${tb.icon}.png)` }"></i>
            <span class="ti-label-on">{{ tb.label() }}</span>
          </span>
        </template>
        <span v-else class="ti-label">{{ tb.label() }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
/* HallBottomBar 1080×250 吸底；整条透明，深色胶囊浮在上 */
.bottombar {
  position: absolute;
  /* 齐刘海适配：整条上抬一个底部安全区高度，避开 home 指示条 */
  bottom: var(--sab, 0px);
  left: 0;
  width: 100%;
  height: calc(250px * var(--s));
  pointer-events: none;
}
/* content 1000 宽×160：深色圆角胶囊（bg_bottom_bar 实测 #1e1e1e、胶囊形），content 顶距 26 */
.content {
  position: absolute;
  top: calc(26px * var(--s));
  left: 50%;
  transform: translateX(-50%);
  width: calc(1000px * var(--s));
  height: calc(160px * var(--s));
  /* 逆向 content 节点：水平 Layout，paddingLeft/Right=30（prefab a6db0f97）。
     box-sizing:border-box 保证总宽仍 1000，内宽 940 被 5 个 tab 等分（188 each），
     首/尾 tab 因此各内缩 30，与原生 App 的左右边距一致 */
  box-sizing: border-box;
  padding: 0 calc(30px * var(--s));
  display: flex;
  background: #1e1e1e;
  border-radius: calc(80px * var(--s));
  pointer-events: auto;
}
.tabitem {
  flex: 1 1 0;
  /* min-width:0 关键：默认 min-width:auto 会让选中态(更宽的胶囊)的槽位撑大，
     挤压其它 tab 导致文字位移；归 0 后五个槽位恒等宽，胶囊只在自身槽位内居中 */
  min-width: 0;
  height: 100%;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
/* 未选：白色文字 */
.ti-label {
  font-size: calc(32px * var(--s));
  color: #ffffff;
}
/* 选中：薄荷绿胶囊 + 图标+文字 横向 */
.pill {
  display: flex;
  align-items: center;
  gap: calc(8px * var(--s));
  height: calc(110px * var(--s));
  padding: 0 calc(30px * var(--s));
  background: #84f9cc;
  border-radius: calc(55px * var(--s));
}
.ti-icon {
  width: calc(52px * var(--s));
  height: calc(52px * var(--s));
  background-color: #1b2a23;
  -webkit-mask: var(--icon) center / contain no-repeat;
  mask: var(--icon) center / contain no-repeat;
}
.ti-label-on {
  font-size: calc(34px * var(--s));
  color: #1b2a23;
  font-weight: 600;
  white-space: nowrap;
}
</style>
