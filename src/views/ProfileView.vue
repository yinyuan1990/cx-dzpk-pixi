<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import HallBottomBar from '../components/HallBottomBar.vue'
import HallTopBar from '../components/HallTopBar.vue'
import { logout, updateProfileFlow, changePasswordFlow, uploadImageFlow } from '../net/session.js'
import { compressAvatar } from '../utils/imageCompress.js'
import { useGameStore } from '../stores/game.js'
import iconZuanshi from '../assets/icon_zuanshi.png'

// 我的 tab:头像/昵称修改 + 修改登录密码 + 退出登录
const router = useRouter()
const game = useGameStore()

const okMsg = ref('')
const errMsg = ref('')
function toast(msg, ok = true) {
  if (ok) { okMsg.value = msg; setTimeout(() => { okMsg.value = '' }, 3000) }
  else { errMsg.value = msg; setTimeout(() => { errMsg.value = '' }, 4000) }
}

// ===== 修改头像:选图 → 压缩 → MinIO 直传 → 保存资料 =====
const avatarBusy = ref(false)
const fileInput = ref(null)
async function onPickAvatar(e) {
  const file = e.target.files && e.target.files[0]
  e.target.value = ''
  if (!file || avatarBusy.value) return
  avatarBusy.value = true
  try {
    const blob = await compressAvatar(file)
    const url = await uploadImageFlow(blob, 'avatar', 'a.jpg')
    const res = await updateProfileFlow({ username: game.user.nickname, avatar: url })
    game.setUser({ avatar: res.avatar || url })
    toast('头像已更新')
  } catch (err) {
    toast(err.message || '头像更新失败', false)
  } finally {
    avatarBusy.value = false
  }
}

// ===== 修改昵称 =====
const showNick = ref(false)
const nickInput = ref('')
const nickBusy = ref(false)
function openNick() {
  nickInput.value = game.user.nickname || ''
  showNick.value = true
}
async function saveNick() {
  if (nickBusy.value) return
  const name = nickInput.value.trim()
  if (!name) { toast('请输入昵称', false); return }
  nickBusy.value = true
  try {
    const res = await updateProfileFlow({ username: name, avatar: game.user.avatar })
    game.setUser({ nickname: res.nickname })
    showNick.value = false
    toast('昵称已更新')
  } catch (err) {
    toast(err.message || '昵称更新失败', false)
  } finally {
    nickBusy.value = false
  }
}

// ===== 修改登录密码 =====
const showPwd = ref(false)
const pwdBusy = ref(false)
const oldPwd = ref('')
const newPwd = ref('')
const newPwd2 = ref('')
function openPwd() {
  oldPwd.value = ''
  newPwd.value = ''
  newPwd2.value = ''
  showPwd.value = true
}
async function savePwd() {
  if (pwdBusy.value) return
  if (!oldPwd.value) { toast('请输入原密码', false); return }
  if (!newPwd.value) { toast('请输入新密码', false); return }
  if (newPwd.value !== newPwd2.value) { toast('两次新密码输入不一致', false); return }
  pwdBusy.value = true
  try {
    await changePasswordFlow({
      oldPassword: oldPwd.value, newPassword: newPwd.value, confirmPassword: newPwd2.value,
    })
    showPwd.value = false
    toast('密码已修改,下次登录请用新密码')
  } catch (err) {
    toast(err.message || '密码修改失败', false)
  } finally {
    pwdBusy.value = false
  }
}

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
      <div v-if="okMsg" class="okbar">{{ okMsg }}</div>
      <div v-if="errMsg" class="errbar">{{ errMsg }}</div>

      <div class="pf-card">
        <!-- 头像:点击换图(压缩+MinIO直传) -->
        <div class="pf-row clickable" @click="fileInput && fileInput.click()">
          <span>头像</span>
          <span class="pf-right">
            <i class="pf-hint">{{ avatarBusy ? '上传中…' : '点击更换' }}</i>
            <span class="pf-av">
              <img v-if="/^https?:\/\//.test(game.user.avatar)" :src="game.user.avatar" alt="" />
            </span>
            <i class="pf-arrow">&#8250;</i>
          </span>
          <input ref="fileInput" type="file" accept="image/*" class="pf-file" @change="onPickAvatar" />
        </div>
        <!-- 昵称:点击弹窗改 -->
        <div class="pf-row clickable" @click="openNick">
          <span>昵称</span>
          <span class="pf-right"><b>{{ game.user.nickname || '-' }}</b><i class="pf-arrow">&#8250;</i></span>
        </div>
        <div class="pf-row"><span>ID</span><b>{{ game.user.numberId || '-' }}</b></div>
        <div class="pf-row"><span>钻石</span><b class="pf-gem-val"><img class="pf-gem" :src="iconZuanshi" alt="" />{{ game.user.idou }}</b></div>
        <!-- 修改密码 -->
        <div class="pf-row clickable" @click="openPwd">
          <span>登录密码</span>
          <span class="pf-right"><i class="pf-hint">修改</i><i class="pf-arrow">&#8250;</i></span>
        </div>
      </div>
      <button class="pf-logout" @click="onLogout">退出登录</button>
    </div>

    <!-- 修改昵称弹窗 -->
    <div v-if="showNick" class="pf-mask" @click.self="showNick = false">
      <div class="pf-box">
        <div class="pb-title">修改昵称</div>
        <div class="pb-label">最长 4 个汉字(或等宽字符),不能纯数字</div>
        <input v-model="nickInput" class="pb-input" placeholder="输入新昵称" maxlength="8" @keyup.enter="saveNick" />
        <button class="pb-confirm" :disabled="nickBusy" @click="saveNick">
          {{ nickBusy ? '保存中…' : '保存' }}
        </button>
      </div>
    </div>

    <!-- 修改密码弹窗 -->
    <div v-if="showPwd" class="pf-mask" @click.self="showPwd = false">
      <div class="pf-box">
        <div class="pb-title">修改登录密码</div>
        <div class="pb-label">原密码</div>
        <input v-model="oldPwd" class="pb-input" type="password" placeholder="输入原密码" maxlength="20" />
        <div class="pb-label">新密码(字母+数字,6-20位)</div>
        <input v-model="newPwd" class="pb-input" type="password" placeholder="输入新密码" maxlength="20" />
        <div class="pb-label">确认新密码</div>
        <input v-model="newPwd2" class="pb-input" type="password" placeholder="再次输入新密码" maxlength="20" @keyup.enter="savePwd" />
        <button class="pb-confirm" :disabled="pwdBusy" @click="savePwd">
          {{ pwdBusy ? '提交中…' : '确认修改' }}
        </button>
      </div>
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
.okbar,
.errbar {
  margin-bottom: calc(16px * var(--s));
  padding: calc(16px * var(--s)) calc(28px * var(--s));
  border-radius: calc(16px * var(--s));
  font-size: calc(28px * var(--s));
  text-align: center;
}
.okbar {
  background: #e8faf5;
  color: #08a88c;
}
.errbar {
  background: #fdecec;
  color: #e05a5a;
}
.pf-card {
  background: #fff;
  border-radius: calc(24px * var(--s));
  box-shadow: 0 calc(4px * var(--s)) calc(16px * var(--s)) rgba(0, 0, 0, 0.05);
  padding: calc(10px * var(--s)) calc(36px * var(--s));
}
.pf-row {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: calc(110px * var(--s));
  border-bottom: 1px solid #f3f3f4;
  font-size: calc(34px * var(--s));
}
.pf-gem-val {
  display: flex;
  align-items: center;
  gap: calc(10px * var(--s));
}
.pf-gem {
  width: calc(38px * var(--s));
  height: calc(38px * var(--s));
  object-fit: contain;
}
.pf-row:last-child {
  border-bottom: none;
}
.pf-row span:first-child {
  color: #9a9a9c;
}
.pf-row.clickable {
  cursor: pointer;
}
.pf-right {
  display: flex;
  align-items: center;
  gap: calc(16px * var(--s));
}
.pf-hint {
  font-style: normal;
  font-size: calc(28px * var(--s));
  color: #08a88c;
}
.pf-arrow {
  font-style: normal;
  font-size: calc(40px * var(--s));
  color: #ccc;
}
.pf-av {
  width: calc(76px * var(--s));
  height: calc(76px * var(--s));
  border-radius: 50%;
  background: linear-gradient(135deg, #14d3b6, #08c0a0);
  overflow: hidden;
  flex: none;
}
.pf-av img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.pf-file {
  display: none;
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

/* 弹窗 */
.pf-mask {
  position: absolute;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
}
.pf-box {
  width: calc(880px * var(--s));
  max-height: 86%;
  overflow-y: auto;
  padding: calc(44px * var(--s)) calc(45px * var(--s));
  border-radius: calc(24px * var(--s));
  background: #fff;
  box-shadow: 0 calc(8px * var(--s)) calc(30px * var(--s)) rgba(0, 0, 0, 0.25);
}
.pb-title {
  font-size: calc(44px * var(--s));
  font-weight: 700;
  margin-bottom: calc(16px * var(--s));
}
.pb-label {
  font-size: calc(30px * var(--s));
  color: #888;
  margin: calc(24px * var(--s)) 0 calc(12px * var(--s));
}
.pb-input {
  width: 100%;
  height: calc(96px * var(--s));
  border: 1px solid #e6e6e6;
  border-radius: calc(16px * var(--s));
  background: #f7f7f8;
  padding: 0 calc(28px * var(--s));
  font-size: calc(36px * var(--s));
  outline: none;
}
.pb-confirm {
  width: 100%;
  height: calc(104px * var(--s));
  margin-top: calc(40px * var(--s));
  border: none;
  border-radius: calc(52px * var(--s));
  background: linear-gradient(90deg, #14d3b6, #08c0a0);
  color: #fff;
  font-size: calc(38px * var(--s));
  font-weight: 600;
  cursor: pointer;
}
.pb-confirm:disabled {
  opacity: 0.6;
}
</style>
