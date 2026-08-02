<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import HallBottomBar from '../components/HallBottomBar.vue'
import { clubListFlow, clubCreateFlow, clubApplyFlow, getLoginInfo, onClubNotify } from '../net/session.js'

// 俱乐部列表页:我的俱乐部 / 创建 / 申请加入(421 / 420 / 422)。
const router = useRouter()

const ROLE_TXT = { 1: '成员', 2: '管理员', 3: '群主', 4: '合伙人' }

const clubs = ref([])
const loading = ref(false)
const errMsg = ref('')
const okMsg = ref('')

async function loadClubs() {
  loading.value = true
  errMsg.value = ''
  try {
    clubs.value = await clubListFlow()
  } catch (e) {
    errMsg.value = e.message || '加载俱乐部失败'
  } finally {
    loading.value = false
  }
}

let offNotify = null
onMounted(() => {
  if (!getLoginInfo()) { router.replace('/login'); return }
  loadClubs()
  // 审批结果推送:通过则刷新列表
  offNotify = onClubNotify((d) => {
    okMsg.value = d.approve
      ? `已加入俱乐部「${d.clubName}」`
      : `俱乐部「${d.clubName}」拒绝了你的申请`
    if (d.approve) loadClubs()
    setTimeout(() => { okMsg.value = '' }, 4000)
  })
})
onBeforeUnmount(() => { if (offNotify) offNotify() })

function openClub(c) {
  router.push('/club/' + c.clubId)
}

// ===== 创建俱乐部 =====
const showCreate = ref(false)
const creating = ref(false)
const createForm = ref({ name: '', notice: '' })
async function onCreate() {
  if (creating.value) return
  if (!createForm.value.name.trim()) { errMsg.value = '请输入俱乐部名称'; return }
  creating.value = true
  errMsg.value = ''
  try {
    const res = await clubCreateFlow({ name: createForm.value.name.trim(), notice: createForm.value.notice })
    showCreate.value = false
    createForm.value = { name: '', notice: '' }
    okMsg.value = `俱乐部创建成功,编号 ${res.clubNo}`
    setTimeout(() => { okMsg.value = '' }, 4000)
    await loadClubs()
  } catch (e) {
    errMsg.value = e.message || '创建失败'
  } finally {
    creating.value = false
  }
}

// ===== 申请加入 =====
const showApply = ref(false)
const applying = ref(false)
const applyCode = ref('')
async function onApply() {
  if (applying.value) return
  const code = applyCode.value.trim()
  if (!/^\d{6}$/.test(code)) { errMsg.value = '请输入 6 位俱乐部号或邀请码'; return }
  applying.value = true
  errMsg.value = ''
  try {
    const res = await clubApplyFlow(code)
    showApply.value = false
    applyCode.value = ''
    okMsg.value = `已申请加入「${res.clubName}」,等待审批`
    setTimeout(() => { okMsg.value = '' }, 4000)
  } catch (e) {
    errMsg.value = e.message || '申请失败'
  } finally {
    applying.value = false
  }
}

function onTab(key) {
  if (key === 'hall') router.push('/hall')
  else if (key === 'friend') router.push('/friend')
}
</script>

<template>
  <div class="stage-root clubpage">
    <div class="top">
      <div class="title">俱乐部</div>
      <div class="top-btns">
        <button class="tbtn ghost" @click="showApply = true; errMsg = ''">申请加入</button>
        <button class="tbtn" @click="showCreate = true; errMsg = ''">+ 创建</button>
      </div>
    </div>

    <div v-if="okMsg" class="okbar">{{ okMsg }}</div>
    <div v-if="errMsg && !showCreate && !showApply" class="errbar">{{ errMsg }}</div>

    <div class="list">
      <div class="item" v-for="c in clubs" :key="c.clubId" @click="openClub(c)">
        <div class="badge">{{ (c.name || '?')[0] }}</div>
        <div class="mid">
          <div class="row1">
            <span class="cname">{{ c.name }}</span>
            <span class="cno">#{{ c.clubNo }}</span>
          </div>
          <div class="row2">
            <span class="role" :class="'r' + c.myRole">{{ ROLE_TXT[c.myRole] || '成员' }}</span>
            <span class="cnt">{{ c.memberCount }} 人</span>
            <span v-if="c.pendingCount > 0" class="pending">{{ c.pendingCount }} 条申请待审</span>
          </div>
        </div>
        <div class="arrow">&#8250;</div>
      </div>
      <div v-if="!loading && clubs.length === 0" class="empty">
        还没有俱乐部<br />创建一个,或输入俱乐部号/邀请码申请加入
      </div>
    </div>

    <!-- 创建俱乐部弹窗 -->
    <div v-if="showCreate" class="create-mask" @click.self="showCreate = false">
      <div class="create-box">
        <div class="c-title">创建俱乐部</div>
        <div class="c-label">名称</div>
        <input v-model="createForm.name" class="c-input" placeholder="俱乐部名称" maxlength="16" />
        <div class="c-label">公告(选填)</div>
        <input v-model="createForm.notice" class="c-input" placeholder="俱乐部公告" maxlength="64" />
        <div v-if="errMsg" class="c-err">{{ errMsg }}</div>
        <button class="c-confirm" :disabled="creating" @click="onCreate">
          {{ creating ? '创建中…' : '创建' }}
        </button>
      </div>
    </div>

    <!-- 申请加入弹窗 -->
    <div v-if="showApply" class="create-mask" @click.self="showApply = false">
      <div class="create-box">
        <div class="c-title">申请加入俱乐部</div>
        <div class="c-label">俱乐部号 / 邀请码</div>
        <input v-model="applyCode" class="c-input" placeholder="6 位数字" maxlength="6" inputmode="numeric" />
        <div v-if="errMsg" class="c-err">{{ errMsg }}</div>
        <button class="c-confirm" :disabled="applying" @click="onApply">
          {{ applying ? '提交中…' : '提交申请' }}
        </button>
      </div>
    </div>

    <HallBottomBar active="game" @change="onTab" />
  </div>
</template>

<style scoped>
.clubpage {
  background: #fff8f9;
  color: #2b2b2d;
}
.top {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: calc(160px * var(--s) + var(--sat, 0px));
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 calc(40px * var(--s));
  padding-top: calc(40px * var(--s) + var(--sat, 0px));
}
.title {
  font-size: calc(52px * var(--s));
  font-weight: 700;
}
.top-btns {
  display: flex;
  gap: calc(20px * var(--s));
}
.tbtn {
  height: calc(72px * var(--s));
  padding: 0 calc(32px * var(--s));
  border: none;
  border-radius: calc(36px * var(--s));
  background: linear-gradient(90deg, #14d3b6, #08c0a0);
  color: #fff;
  font-size: calc(32px * var(--s));
  font-weight: 600;
  cursor: pointer;
}
.tbtn.ghost {
  background: #fff;
  color: #08a88c;
  border: 1px solid #9be5d5;
}
.okbar,
.errbar {
  position: absolute;
  top: calc(170px * var(--s) + var(--sat, 0px));
  left: calc(32px * var(--s));
  right: calc(32px * var(--s));
  z-index: 5;
  padding: calc(18px * var(--s)) calc(28px * var(--s));
  border-radius: calc(16px * var(--s));
  font-size: calc(30px * var(--s));
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
.list {
  position: absolute;
  top: calc(240px * var(--s) + var(--sat, 0px));
  left: 0;
  width: 100%;
  bottom: calc(250px * var(--s) + var(--sab, 0px));
  overflow-y: auto;
  padding: calc(10px * var(--s)) calc(32px * var(--s));
}
.item {
  display: flex;
  align-items: center;
  gap: calc(28px * var(--s));
  height: calc(190px * var(--s));
  margin-bottom: calc(20px * var(--s));
  border-radius: calc(20px * var(--s));
  background: #fff;
  box-shadow: 0 calc(4px * var(--s)) calc(16px * var(--s)) rgba(0, 0, 0, 0.05);
  padding: 0 calc(36px * var(--s));
  cursor: pointer;
}
.badge {
  width: calc(100px * var(--s));
  height: calc(100px * var(--s));
  border-radius: calc(24px * var(--s));
  background: linear-gradient(135deg, #14d3b6, #08c0a0);
  color: #fff;
  font-size: calc(48px * var(--s));
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
.mid {
  flex: 1;
  min-width: 0;
}
.row1 {
  display: flex;
  align-items: baseline;
  gap: calc(18px * var(--s));
}
.cname {
  font-size: calc(44px * var(--s));
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cno {
  font-size: calc(30px * var(--s));
  color: #b0b0b0;
}
.row2 {
  display: flex;
  align-items: center;
  gap: calc(20px * var(--s));
  margin-top: calc(12px * var(--s));
  font-size: calc(30px * var(--s));
  color: #888;
}
.role {
  padding: calc(4px * var(--s)) calc(18px * var(--s));
  border-radius: 999px;
  font-size: calc(26px * var(--s));
  background: #f0f0f0;
  color: #777;
}
.role.r3 {
  background: #fff3dd;
  color: #d29018;
}
.role.r2 {
  background: #e5f0ff;
  color: #3d7fd8;
}
.role.r4 {
  background: #f3e8ff;
  color: #9a55e0;
}
.pending {
  color: #e08a3a;
  font-weight: 600;
}
.arrow {
  font-size: calc(52px * var(--s));
  color: #ccc;
}
.empty {
  text-align: center;
  color: #9a9a9c;
  font-size: calc(34px * var(--s));
  line-height: 1.8;
  padding: calc(120px * var(--s)) 0;
}

/* 弹窗(与大厅一致) */
.create-mask {
  position: absolute;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
}
.create-box {
  width: calc(938px * var(--s));
  max-height: 86%;
  overflow-y: auto;
  padding: calc(44px * var(--s)) calc(45px * var(--s));
  border-radius: calc(24px * var(--s));
  background: #fff;
  box-shadow: 0 calc(8px * var(--s)) calc(30px * var(--s)) rgba(0, 0, 0, 0.25);
}
.c-title {
  font-size: calc(48px * var(--s));
  font-weight: 700;
  margin-bottom: calc(24px * var(--s));
}
.c-label {
  font-size: calc(34px * var(--s));
  color: #888;
  margin: calc(28px * var(--s)) 0 calc(14px * var(--s));
}
.c-input {
  width: 100%;
  height: calc(100px * var(--s));
  border: 1px solid #e6e6e6;
  border-radius: calc(16px * var(--s));
  background: #f7f7f8;
  padding: 0 calc(28px * var(--s));
  font-size: calc(38px * var(--s));
  outline: none;
}
.c-err {
  margin-top: calc(20px * var(--s));
  color: #e05a5a;
  font-size: calc(30px * var(--s));
}
.c-confirm {
  width: 100%;
  height: calc(112px * var(--s));
  margin-top: calc(44px * var(--s));
  border: none;
  border-radius: calc(56px * var(--s));
  background: linear-gradient(90deg, #14d3b6, #08c0a0);
  color: #fff;
  font-size: calc(42px * var(--s));
  font-weight: 600;
  cursor: pointer;
}
.c-confirm:disabled {
  opacity: 0.6;
}
</style>
