<script setup>
import { ref } from 'vue'
import { useGameStore } from '../stores/game.js'
import { appConfigFlow } from '../net/session.js'

// 5 个 tab 页公用顶栏:左 = 头像/昵称/6位ID,右 = 钻石 + 分享。
// 分享地址在管理台「参数配置」share_app_url 配置,点击实时拉取:
// 支持系统分享(navigator.share)则唤起,否则复制链接。
const game = useGameStore()

const tip = ref('')
let tipTimer = null
function showTip(text) {
  tip.value = text
  clearTimeout(tipTimer)
  tipTimer = setTimeout(() => { tip.value = '' }, 2000)
}

const sharing = ref(false)
async function onShare() {
  if (sharing.value) return
  sharing.value = true
  try {
    const { shareUrl } = await appConfigFlow()
    if (!shareUrl) { showTip('分享地址未配置'); return }
    if (navigator.share) {
      await navigator.share({ title: '德州扑克', url: shareUrl }).catch(() => {})
    } else {
      await navigator.clipboard.writeText(shareUrl)
      showTip('链接已复制')
    }
  } catch {
    showTip('分享失败,请重试')
  } finally {
    sharing.value = false
  }
}
</script>

<template>
  <div class="topbar">
    <div class="tb-user">
      <div class="tb-avatar">
        <img v-if="/^https?:\/\//.test(game.user.avatar)" :src="game.user.avatar" alt="" />
      </div>
      <div class="tb-info">
        <div class="tb-nick">{{ game.user.nickname || 'Player' }}</div>
        <div class="tb-id" v-if="game.user.numberId">ID: {{ game.user.numberId }}</div>
      </div>
    </div>
    <div class="tb-right">
      <div class="tb-diamond">
        <span class="tb-gem">&#9670;</span>
        <span class="tb-cnt">{{ game.user.idou }}</span>
      </div>
      <button class="tb-share" :disabled="sharing" @click="onShare">分享</button>
    </div>
    <div v-if="tip" class="tb-tip">{{ tip }}</div>
  </div>
</template>

<style scoped>
.topbar {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: calc(180px * var(--s) + var(--sat, 0px));
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 calc(40px * var(--s));
  padding-top: calc(40px * var(--s) + var(--sat, 0px));
}
.tb-user {
  display: flex;
  align-items: center;
  gap: calc(20px * var(--s));
  min-width: 0;
}
.tb-avatar {
  flex: none;
  width: calc(96px * var(--s));
  height: calc(96px * var(--s));
  border-radius: 50%;
  background: linear-gradient(135deg, #14d3b6, #08c0a0);
  overflow: hidden;
}
.tb-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.tb-info {
  min-width: 0;
}
.tb-nick {
  font-size: calc(38px * var(--s));
  font-weight: 600;
  color: #2b2b2d;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: calc(400px * var(--s));
}
.tb-id {
  margin-top: calc(6px * var(--s));
  font-size: calc(28px * var(--s));
  color: #9aa5a0;
}
.tb-right {
  display: flex;
  align-items: center;
  gap: calc(20px * var(--s));
}
.tb-diamond {
  display: flex;
  align-items: center;
  gap: calc(10px * var(--s));
  height: calc(64px * var(--s));
  padding: 0 calc(26px * var(--s));
  border-radius: calc(32px * var(--s));
  background: #fff;
  box-shadow: 0 calc(2px * var(--s)) calc(8px * var(--s)) rgba(0, 0, 0, 0.06);
}
.tb-gem {
  color: #3bb7f0;
  font-size: calc(32px * var(--s));
}
.tb-cnt {
  font-size: calc(32px * var(--s));
  font-weight: 600;
  color: #2b2b2d;
}
.tb-share {
  height: calc(64px * var(--s));
  padding: 0 calc(30px * var(--s));
  border: none;
  border-radius: calc(32px * var(--s));
  background: linear-gradient(90deg, #14d3b6, #08c0a0);
  color: #fff;
  font-size: calc(30px * var(--s));
  font-weight: 600;
  cursor: pointer;
}
.tb-share:disabled {
  opacity: 0.6;
}
.tb-tip {
  position: absolute;
  top: calc(190px * var(--s) + var(--sat, 0px));
  left: 50%;
  transform: translateX(-50%);
  padding: calc(12px * var(--s)) calc(32px * var(--s));
  border-radius: calc(999px * var(--s));
  background: rgba(0, 0, 0, 0.72);
  color: #fff;
  font-size: calc(28px * var(--s));
  white-space: nowrap;
  z-index: 50;
}
</style>
