<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { loginFlow } from '../net/session.js'
import { useGameStore } from '../stores/game.js'

// cx-dzpk 登录:游客昵称直连(开发期 allow-guest),或粘贴主服 JWT token。
// 视觉沿用 WePoker 登录壳(logo + 输入行 + 主按钮)。
const router = useRouter()
const { t } = useI18n()
const game = useGameStore()

const nickname = ref('')
const token = ref('')
const showToken = ref(false)
const busy = ref(false)
const errMsg = ref('')

onMounted(() => {
  const saved = localStorage.getItem('dzpk.nickname')
  if (saved) nickname.value = saved
})

async function onLogin() {
  if (busy.value) return
  errMsg.value = ''
  const nick = nickname.value.trim()
  if (!nick && !token.value.trim()) {
    errMsg.value = t('login.phNickname')
    return
  }
  try {
    busy.value = true
    const login = await loginFlow({ nickname: nick, token: token.value.trim() })
    localStorage.setItem('dzpk.nickname', nick)
    game.applyLogin(login)
    router.push('/hall')
  } catch (e) {
    errMsg.value = e.message || t('login.failed')
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

    <div class="form-title">{{ t('login.guestTitle') }}</div>

    <!-- 昵称输入 -->
    <div class="input-row first">
      <input
        v-model="nickname"
        class="edit nopad"
        :placeholder="t('login.phNickname')"
        maxlength="12"
        @keyup.enter="onLogin"
      />
    </div>

    <!-- 可选:主服 JWT token -->
    <button class="link toggle-token" @click="showToken = !showToken">
      {{ showToken ? t('login.hideToken') : t('login.useToken') }}
    </button>
    <div v-if="showToken" class="input-row pwd">
      <input v-model="token" class="edit nopad" :placeholder="t('login.phToken')" />
    </div>

    <!-- 错误提示 -->
    <div v-if="errMsg" class="login-err">{{ errMsg }}</div>

    <!-- 登录按钮 -->
    <button class="login-btn" :disabled="busy" @click="onLogin">
      {{ busy ? t('login.logging') : t('login.enterGame') }}
    </button>
  </div>
</template>

<style scoped>
.login {
  background: #ffffff;
  color: #2b2b2d;
}

.logo-box {
  position: absolute;
  top: calc(260px * var(--s));
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
  top: calc(830px * var(--s));
  left: 50%;
  transform: translateX(-50%);
  font-size: calc(44px * var(--s));
  font-weight: 600;
  color: #2b2b2d;
  white-space: nowrap;
}

.input-row {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  width: calc(920px * var(--s));
  height: calc(136px * var(--s));
  display: flex;
  align-items: center;
  border: 1px solid #e6e6e6;
  border-radius: calc(30px * var(--s));
  background: #f7f7f8;
  padding: 0 calc(36px * var(--s));
}
.input-row.first {
  top: calc(950px * var(--s));
}
.input-row.pwd {
  top: calc(1210px * var(--s));
}
.edit {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-size: calc(42px * var(--s));
  color: #2b2b2d;
}
.edit::placeholder {
  color: #b9b9bb;
}

.link {
  position: absolute;
  border: none;
  background: transparent;
  color: #08c0a0;
  font-size: calc(36px * var(--s));
  cursor: pointer;
}
.link.toggle-token {
  top: calc(1125px * var(--s));
  left: calc(80px * var(--s));
}

.login-err {
  position: absolute;
  top: calc(1400px * var(--s));
  left: 50%;
  transform: translateX(-50%);
  width: calc(920px * var(--s));
  text-align: center;
  color: #ff4d4f;
  font-size: calc(34px * var(--s));
}
.login-btn {
  position: absolute;
  top: calc(1470px * var(--s));
  left: 50%;
  transform: translateX(-50%);
  width: calc(920px * var(--s));
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
</style>
