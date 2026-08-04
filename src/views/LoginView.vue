<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { accountLoginFlow, accountRegisterFlow, loginFlow, uploadImageFlow } from '../net/session.js'
import { useGameStore } from '../stores/game.js'
import { compressAvatar } from '../utils/imageCompress.js'

// 独立账号登录/注册(dz_user 本地库,注册字段对标扯旋:
//   phone/username/avatar/password/confirmPassword/registerDevice)。
// 头像 = 本地选图 → canvas 压缩(256px/≤100KB) → 预签名直传 MinIO。
// 游客登录已移除;开发模式(vite dev)保留一个游客直连入口方便联调。
const router = useRouter()
const game = useGameStore()

const isDev = import.meta.env.DEV

const mode = ref('login') // login | register
const phone = ref('')
const password = ref('')
const confirmPassword = ref('')
const nickname = ref('')
const avatar = ref('')       // 上传成功后的 MinIO 直链
const avatarBusy = ref(false)
const fileInput = ref(null)
const busy = ref(false)
const errMsg = ref('')

async function onPickAvatar(e) {
  const file = e.target.files && e.target.files[0]
  e.target.value = '' // 允许重选同一文件
  if (!file || avatarBusy.value) return
  avatarBusy.value = true
  errMsg.value = ''
  try {
    const blob = await compressAvatar(file)
    avatar.value = await uploadImageFlow(blob, 'avatar', 'avatar.jpg')
  } catch (err) {
    errMsg.value = err.message || '头像上传失败'
  } finally {
    avatarBusy.value = false
  }
}

onMounted(async () => {
  phone.value = localStorage.getItem('dzpk.phone') || ''
  // 记住的 token 自动登录(过期/无效则留在登录页)
  const saved = localStorage.getItem('dzpk.token')
  if (saved) {
    busy.value = true
    try {
      const login = await loginFlow({ nickname: localStorage.getItem('dzpk.nickname') || '', token: saved })
      game.applyLogin(login)
      router.push('/hall')
      return
    } catch {
      localStorage.removeItem('dzpk.token')
    } finally {
      busy.value = false
    }
  }
})

function remember(res) {
  localStorage.setItem('dzpk.token', res.token)
  localStorage.setItem('dzpk.phone', phone.value.trim())
  localStorage.setItem('dzpk.nickname', res.nickname || '')
}

async function onSubmit() {
  if (busy.value) return
  errMsg.value = ''
  const ph = phone.value.trim()
  if (!ph || !password.value) {
    errMsg.value = '请输入账号和密码'
    return
  }
  if (mode.value === 'register') {
    if (!nickname.value.trim()) { errMsg.value = '请输入昵称'; return }
    if (password.value !== confirmPassword.value) { errMsg.value = '两次密码输入不一致'; return }
    if (!avatar.value) { errMsg.value = '请选择头像'; return }
  }
  busy.value = true
  try {
    const res = mode.value === 'register'
      ? await accountRegisterFlow({
          phone: ph, password: password.value, confirmPassword: confirmPassword.value,
          username: nickname.value.trim(), avatar: avatar.value,
        })
      : await accountLoginFlow({ phone: ph, password: password.value })
    remember(res)
    game.applyLogin(res)
    router.push('/hall')
  } catch (e) {
    errMsg.value = e.message || '登录失败,请重试'
  } finally {
    busy.value = false
  }
}

// 开发模式游客直连(联调后端用,生产构建不含此入口)
const guestNick = ref('')
async function onGuestLogin() {
  if (busy.value || !guestNick.value.trim()) return
  busy.value = true
  errMsg.value = ''
  try {
    const login = await loginFlow({ nickname: guestNick.value.trim() })
    game.applyLogin(login)
    router.push('/hall')
  } catch (e) {
    errMsg.value = e.message || '登录失败'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="stage-root login">
    <!-- logo -->
    <div class="logo-box">
      <img class="logo-icon" src="/assets/login/wpk_logo.png" alt="logo" />
      <img class="logo-word" src="/assets/login/wpk_wordmark.png" alt="wordmark" />
    </div>

    <div class="form-title">{{ mode === 'register' ? '注册账号' : '账号密码登录' }}</div>

    <div class="form-box">
      <div class="input-row">
        <input v-model="phone" class="edit nopad" placeholder="请输入手机号" maxlength="11" inputmode="numeric" @keyup.enter="onSubmit" />
      </div>
      <div class="input-row">
        <input v-model="password" class="edit nopad" type="password" placeholder="请输入密码(字母+数字 6-20位)" maxlength="20" @keyup.enter="onSubmit" />
      </div>
      <template v-if="mode === 'register'">
        <div class="input-row">
          <input v-model="confirmPassword" class="edit nopad" type="password" placeholder="请再次输入密码" maxlength="20" @keyup.enter="onSubmit" />
        </div>
        <div class="input-row">
          <input v-model="nickname" class="edit nopad" placeholder="昵称(最长4个汉字,不能纯数字)" maxlength="8" @keyup.enter="onSubmit" />
        </div>
        <div class="avatar-pick" @click="fileInput && fileInput.click()">
          <div class="av-preview">
            <img v-if="avatar" :src="avatar" alt="" />
            <span v-else class="av-plus">+</span>
          </div>
          <span class="av-tip">{{ avatarBusy ? '上传中…' : avatar ? '点击更换头像' : '选择头像(必选,自动压缩)' }}</span>
          <input ref="fileInput" type="file" accept="image/*" class="av-file" @change="onPickAvatar" />
        </div>
      </template>

      <div v-if="errMsg" class="login-err">{{ errMsg }}</div>

      <button class="login-btn" :disabled="busy" @click="onSubmit">
        {{ busy ? '登录中…' : mode === 'register' ? '注册并进入游戏' : '登录' }}
      </button>

      <button class="link" @click="mode = mode === 'register' ? 'login' : 'register'; errMsg = ''">
        {{ mode === 'register' ? '已有账号?返回登录' : '没有账号?注册一个' }}
      </button>

      <!-- 开发模式游客直连(生产不显示) -->
      <div v-if="isDev" class="dev-guest">
        <input v-model="guestNick" class="edit dev-edit" placeholder="DEV 游客昵称" maxlength="12" @keyup.enter="onGuestLogin" />
        <button class="dev-btn" :disabled="busy" @click="onGuestLogin">游客直连</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login {
  background: #ffffff;
  color: #2b2b2d;
}

.logo-box {
  position: absolute;
  top: calc(220px * var(--s));
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: calc(24px * var(--s));
}
.logo-icon {
  width: calc(240px * var(--s));
  height: calc(240px * var(--s));
  object-fit: contain;
}
.logo-word {
  width: calc(420px * var(--s));
  height: calc(104px * var(--s));
  object-fit: contain;
}

.form-title {
  position: absolute;
  top: calc(760px * var(--s));
  left: 50%;
  transform: translateX(-50%);
  font-size: calc(44px * var(--s));
  font-weight: 600;
  color: #2b2b2d;
  white-space: nowrap;
}

.form-box {
  position: absolute;
  top: calc(860px * var(--s));
  left: 50%;
  transform: translateX(-50%);
  width: calc(920px * var(--s));
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: calc(28px * var(--s));
}
.input-row {
  width: 100%;
  height: calc(128px * var(--s));
  display: flex;
  align-items: center;
  border: 1px solid #e6e6e6;
  border-radius: calc(30px * var(--s));
  background: #f7f7f8;
  padding: 0 calc(36px * var(--s));
}
.edit {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-size: calc(40px * var(--s));
  color: #2b2b2d;
}
.edit::placeholder {
  color: #b9b9bb;
}

.login-err {
  width: 100%;
  text-align: center;
  color: #ff4d4f;
  font-size: calc(32px * var(--s));
}
.login-btn {
  width: 100%;
  height: calc(124px * var(--s));
  border: none;
  border-radius: calc(62px * var(--s));
  background: linear-gradient(90deg, #14d3b6, #08c0a0);
  color: #fff;
  font-size: calc(46px * var(--s));
  font-weight: 600;
  cursor: pointer;
}
.login-btn:disabled {
  opacity: 0.6;
}
.link {
  border: none;
  background: transparent;
  color: #08c0a0;
  font-size: calc(34px * var(--s));
  cursor: pointer;
}

.avatar-pick {
  width: 100%;
  display: flex;
  align-items: center;
  gap: calc(24px * var(--s));
  cursor: pointer;
}
.av-preview {
  flex: none;
  width: calc(120px * var(--s));
  height: calc(120px * var(--s));
  border-radius: 50%;
  background: #f0f2f1;
  border: calc(3px * var(--s)) dashed #cfd6d2;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.av-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.av-plus {
  font-size: calc(56px * var(--s));
  color: #b0bab4;
}
.av-tip {
  font-size: calc(30px * var(--s));
  color: #8a9a93;
}
.av-file {
  display: none;
}

.dev-guest {
  width: 100%;
  display: flex;
  gap: calc(16px * var(--s));
  margin-top: calc(20px * var(--s));
  padding-top: calc(24px * var(--s));
  border-top: 1px dashed #e0e0e0;
}
.dev-edit {
  flex: 1;
  height: calc(88px * var(--s));
  border: 1px solid #e6e6e6;
  border-radius: calc(20px * var(--s));
  background: #f7f7f8;
  padding: 0 calc(24px * var(--s));
  font-size: calc(32px * var(--s));
}
.dev-btn {
  height: calc(88px * var(--s));
  padding: 0 calc(32px * var(--s));
  border: 1px solid #d0d0d0;
  border-radius: calc(20px * var(--s));
  background: #fff;
  color: #777;
  font-size: calc(30px * var(--s));
  cursor: pointer;
}
</style>
