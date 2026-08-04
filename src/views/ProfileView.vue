<script setup>
import { useRouter } from 'vue-router'
import HallBottomBar from '../components/HallBottomBar.vue'
import HallTopBar from '../components/HallTopBar.vue'
import { logout } from '../net/session.js'
import { useGameStore } from '../stores/game.js'

// 我的 tab:账号信息 + 退出登录(资料编辑后续接入)
const router = useRouter()
const game = useGameStore()

function onLogout() {
  logout()
  localStorage.removeItem('dzpk.token')
  router.replace('/login')
}
</script>

<template>
  <div class="stage-root profile">
    <HallTopBar />

    <div class="pf-body">
      <div class="pf-card">
        <div class="pf-row"><span>昵称</span><b>{{ game.user.nickname || '-' }}</b></div>
        <div class="pf-row"><span>ID</span><b>{{ game.user.numberId || '-' }}</b></div>
        <div class="pf-row"><span>钻石</span><b>{{ game.user.idou }}</b></div>
      </div>
      <button class="pf-logout" @click="onLogout">退出登录</button>
    </div>

    <HallBottomBar active="profile" />
  </div>
</template>

<style scoped>
.profile {
  background: #fff8f9;
  color: #2b2b2d;
}
.pf-body {
  position: absolute;
  top: calc(200px * var(--s) + var(--sat, 0px));
  left: 0;
  width: 100%;
  bottom: calc(250px * var(--s) + var(--sab, 0px));
  overflow-y: auto;
  padding: calc(10px * var(--s)) calc(32px * var(--s));
}
.pf-card {
  background: #fff;
  border-radius: calc(24px * var(--s));
  box-shadow: 0 calc(4px * var(--s)) calc(16px * var(--s)) rgba(0, 0, 0, 0.05);
  padding: calc(10px * var(--s)) calc(36px * var(--s));
}
.pf-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: calc(110px * var(--s));
  border-bottom: 1px solid #f3f3f4;
  font-size: calc(34px * var(--s));
}
.pf-row:last-child {
  border-bottom: none;
}
.pf-row span {
  color: #9a9a9c;
}
.pf-logout {
  width: 100%;
  height: calc(110px * var(--s));
  margin-top: calc(40px * var(--s));
  border: none;
  border-radius: calc(24px * var(--s));
  background: #fff;
  color: #e05a5a;
  font-size: calc(36px * var(--s));
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 calc(4px * var(--s)) calc(16px * var(--s)) rgba(0, 0, 0, 0.05);
}
</style>
