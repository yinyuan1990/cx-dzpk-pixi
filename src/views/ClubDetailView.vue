<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  clubListFlow, clubMembersFlow, clubApplyListFlow, clubReviewFlow,
  clubSetRoleFlow, clubKickFlow, clubQuitFlow, clubDissolveFlow,
  roomListFlow, createRoomFlow, getLoginInfo,
} from '../net/session.js'
import { useGameStore } from '../stores/game.js'
import { formatKNotation } from '../utils/format'

// 俱乐部详情:牌局(该俱乐部房间) / 成员(角色管理) / 审批。
// 权限对齐扯旋:建房=群主/管理员;设管理员=群主;设合伙人=群主或(管理/合伙人的直推);
// 踢人=群主/管理员任意、合伙人限直推;审批=群主/管理员。
const router = useRouter()
const route = useRoute()
const game = useGameStore()

const clubId = Number(route.params.id)
const me = getLoginInfo()

const ROLE_TXT = { 1: '成员', 2: '管理员', 3: '群主', 4: '合伙人' }
const club = ref(null)      // {clubId,clubNo,name,myRole,myInviteCode,...}
const tab = ref('rooms')    // rooms | members | applies
const errMsg = ref('')
const okMsg = ref('')

const myRole = computed(() => (club.value ? club.value.myRole : 1))
const canManage = computed(() => myRole.value === 3 || myRole.value === 2)
const isOwner = computed(() => myRole.value === 3)

function toast(msg, ok = true) {
  if (ok) { okMsg.value = msg; setTimeout(() => { okMsg.value = '' }, 3000) }
  else { errMsg.value = msg; setTimeout(() => { errMsg.value = '' }, 4000) }
}

async function loadClub() {
  const list = await clubListFlow()
  club.value = list.find((c) => Number(c.clubId) === clubId) || null
  if (!club.value) { router.replace('/club') }
}

// ===== 牌局 =====
const rooms = ref([])
async function loadRooms() {
  try {
    const list = await roomListFlow(clubId)
    rooms.value = list.map((r) => ({
      roomId: r.roomId, name: r.name || '#' + r.roomId, sb: r.sb, bb: r.bb,
      blinds: `${formatKNotation(r.sb)}/${formatKNotation(r.bb)}`,
      seats: `${r.maxPlayers || 9}人桌`, members: `${r.seated || 0}/${r.maxPlayers || 9}`,
      settle: r.settleTimeMins ? `${r.settleTimeMins}分钟` : '',
      stage: r.stage === 'WAITING' ? '等待中' : '进行中',
    }))
  } catch (e) {
    toast(e.message || '加载牌局失败', false)
  }
}
function onEnter(tb) {
  game.setEnterTarget({ roomId: tb.roomId, name: tb.name, sb: tb.sb, bb: tb.bb, incp: tb.bb })
  router.push('/table/' + tb.roomId)
}

// 建房(群主/管理员)
const showCreate = ref(false)
const creating = ref(false)
const form = ref({ name: '', sb: 50, bb: 100, maxPlayers: 9, settleTimeMins: 30, rakePercent: 5 })
const BLIND_PRESETS = [
  { sb: 50, bb: 100 }, { sb: 100, bb: 200 }, { sb: 250, bb: 500 },
  { sb: 500, bb: 1000 }, { sb: 1000, bb: 2000 },
]
const SETTLE_PRESETS = [30, 45, 60, 90, 120]
async function onCreate() {
  if (creating.value) return
  creating.value = true
  try {
    const room = await createRoomFlow({ ...form.value, name: form.value.name || undefined, clubId })
    showCreate.value = false
    onEnter({ roomId: room.roomId, name: room.name, sb: room.sb, bb: room.bb })
  } catch (e) {
    toast(e.message || '创建失败', false)
  } finally {
    creating.value = false
  }
}

// ===== 成员 =====
const members = ref([])
async function loadMembers() {
  try {
    members.value = await clubMembersFlow(clubId)
  } catch (e) {
    toast(e.message || '加载成员失败', false)
  }
}
/** 对某成员可执行的操作(对齐扯旋权限) */
function opsOf(m) {
  if (!club.value || m.userId === me.userId || m.role === 3) return []
  const ops = []
  const r = myRole.value
  const direct = Number(m.parentUserId) === Number(me.userId)
  if (r === 3) {
    if (m.role === 1) ops.push('setAdmin')
    if (m.role === 2) ops.push('unsetAdmin')
    if (m.role !== 2) ops.push('setPartner')
    if (m.role === 4) ops.push('unsetPartner')
    ops.push('kick')
  } else if (r === 2) {
    if (direct && m.role !== 2) ops.push('setPartner')
    ops.push('kick')
  } else if (r === 4) {
    if (direct && m.role !== 2) ops.push('setPartner')
    if (direct) ops.push('kick')
  }
  return ops
}
const OP_TXT = { setAdmin: '设管理', unsetAdmin: '撤管理', setPartner: '设合伙人', unsetPartner: '撤合伙人', kick: '移除' }

// 设合伙人弹层(选比例)
const partnerTarget = ref(null)
const partnerRate = ref(50)
async function doOp(m, op) {
  errMsg.value = ''
  try {
    if (op === 'setAdmin') await clubSetRoleFlow({ clubId, userId: m.userId, role: 2 })
    else if (op === 'unsetAdmin' || op === 'unsetPartner') await clubSetRoleFlow({ clubId, userId: m.userId, role: 1 })
    else if (op === 'setPartner') {
      partnerTarget.value = m
      partnerRate.value = Math.max(m.partnerRate || 0, 50)
      return
    } else if (op === 'kick') {
      if (!confirm(`确定把「${m.nickname}」移出俱乐部?`)) return
      await clubKickFlow({ clubId, userId: m.userId })
    }
    toast('操作成功')
    await loadMembers()
  } catch (e) {
    toast(e.message || '操作失败', false)
  }
}
async function confirmPartner() {
  const m = partnerTarget.value
  if (!m) return
  try {
    await clubSetRoleFlow({ clubId, userId: m.userId, role: 4, partnerRate: partnerRate.value })
    partnerTarget.value = null
    toast('已设为合伙人')
    await loadMembers()
  } catch (e) {
    toast(e.message || '设置失败', false)
  }
}

// ===== 审批 =====
const applies = ref([])
async function loadApplies() {
  if (!canManage.value) return
  try {
    applies.value = await clubApplyListFlow(clubId)
  } catch (e) {
    toast(e.message || '加载申请失败', false)
  }
}
async function review(r, approve) {
  try {
    await clubReviewFlow({ clubId, requestId: r.requestId, approve })
    toast(approve ? `已同意「${r.nickname}」加入` : '已拒绝')
    await Promise.all([loadApplies(), loadMembers(), loadClub()])
  } catch (e) {
    toast(e.message || '审批失败', false)
  }
}

// ===== 退出 / 解散 =====
async function onQuit() {
  if (!confirm('确定退出该俱乐部?')) return
  try {
    await clubQuitFlow(clubId)
    router.replace('/club')
  } catch (e) {
    toast(e.message || '退出失败', false)
  }
}
async function onDissolve() {
  if (!confirm('确定解散俱乐部?所有成员将被移除,不可恢复!')) return
  try {
    await clubDissolveFlow(clubId)
    router.replace('/club')
  } catch (e) {
    toast(e.message || '解散失败', false)
  }
}

function copyInvite() {
  const code = club.value && club.value.myInviteCode
  if (!code) return
  try { navigator.clipboard.writeText(String(code)) } catch { /* noop */ }
  toast(`邀请码 ${code} 已复制`)
}

function switchTab(k) {
  tab.value = k
  if (k === 'members') loadMembers()
  else if (k === 'applies') loadApplies()
  else loadRooms()
}

let pollTimer = null
onMounted(async () => {
  if (!me) { router.replace('/login'); return }
  await loadClub()
  if (!club.value) return
  loadRooms()
  pollTimer = setInterval(() => { if (tab.value === 'rooms') loadRooms() }, 5000)
})
onBeforeUnmount(() => clearInterval(pollTimer))
</script>

<template>
  <div class="stage-root clubdetail">
    <div class="top">
      <button class="back" @click="router.push('/club')">&#8249;</button>
      <div class="tinfo" v-if="club">
        <div class="tname">{{ club.name }}</div>
        <div class="tsub">
          #{{ club.clubNo }} · {{ ROLE_TXT[club.myRole] }} ·
          <span class="invite" @click="copyInvite">邀请码 {{ club.myInviteCode }}</span>
        </div>
      </div>
      <button v-if="canManage" class="tbtn" @click="showCreate = true">+ 建牌局</button>
    </div>

    <div class="tabs">
      <button class="tabbtn" :class="{ on: tab === 'rooms' }" @click="switchTab('rooms')">牌局</button>
      <button class="tabbtn" :class="{ on: tab === 'members' }" @click="switchTab('members')">
        成员<template v-if="club"> {{ club.memberCount }}</template>
      </button>
      <button v-if="canManage" class="tabbtn" :class="{ on: tab === 'applies' }" @click="switchTab('applies')">
        审批<span v-if="club && club.pendingCount > 0" class="dot">{{ club.pendingCount }}</span>
      </button>
    </div>

    <div v-if="okMsg" class="okbar">{{ okMsg }}</div>
    <div v-if="errMsg" class="errbar">{{ errMsg }}</div>

    <div class="body">
      <!-- 牌局 -->
      <template v-if="tab === 'rooms'">
        <div class="item" v-for="tb in rooms" :key="tb.roomId" @click="onEnter(tb)">
          <div class="row1">
            <span class="rname">{{ tb.name }}</span>
            <span class="rid">#{{ tb.roomId }}</span>
            <span class="rstage">{{ tb.stage }}</span>
          </div>
          <div class="row2">
            <span class="chip">&#9679;</span>
            <span>{{ tb.blinds }}</span>
            <span>{{ tb.seats }}<template v-if="tb.settle"> · {{ tb.settle }}</template></span>
            <span class="mcnt">{{ tb.members }}</span>
          </div>
        </div>
        <div v-if="rooms.length === 0" class="empty">
          俱乐部还没有牌局<template v-if="canManage">,点右上「建牌局」开一桌</template>
        </div>
      </template>

      <!-- 成员 -->
      <template v-else-if="tab === 'members'">
        <div class="mem" v-for="m in members" :key="m.userId">
          <div class="mleft">
            <div class="mname">
              {{ m.nickname }}
              <span class="role" :class="'r' + m.role">{{ ROLE_TXT[m.role] }}</span>
              <span v-if="m.role === 4" class="rate">{{ m.partnerRate }}%</span>
            </div>
            <div class="msub">ID {{ m.userId }} · 邀请码 {{ m.inviteCode }}</div>
          </div>
          <div class="mops">
            <button v-for="op in opsOf(m)" :key="op" class="mop" :class="{ danger: op === 'kick' }"
              @click="doOp(m, op)">{{ OP_TXT[op] }}</button>
          </div>
        </div>
      </template>

      <!-- 审批 -->
      <template v-else>
        <div class="mem" v-for="r in applies" :key="r.requestId">
          <div class="mleft">
            <div class="mname">{{ r.nickname }}</div>
            <div class="msub">ID {{ r.userId }} · {{ r.codeType === 2 ? '邀请码申请' : '俱乐部号申请' }}</div>
          </div>
          <div class="mops">
            <button class="mop ok" @click="review(r, true)">同意</button>
            <button class="mop danger" @click="review(r, false)">拒绝</button>
          </div>
        </div>
        <div v-if="applies.length === 0" class="empty">暂无待审批申请</div>
      </template>

      <!-- 底部危险区 -->
      <div class="danger-zone">
        <button v-if="!isOwner" class="dz-btn" @click="onQuit">退出俱乐部</button>
        <button v-else class="dz-btn" @click="onDissolve">解散俱乐部</button>
      </div>
    </div>

    <!-- 建牌局弹窗(与大厅一致,多挂 clubId) -->
    <div v-if="showCreate" class="create-mask" @click.self="showCreate = false">
      <div class="create-box">
        <div class="c-title">创建俱乐部牌局</div>
        <div class="c-label">牌局名称</div>
        <input v-model="form.name" class="c-input" :placeholder="(club ? club.name : '') + '的牌局'" maxlength="16" />
        <div class="c-label">盲注</div>
        <div class="c-opts">
          <button v-for="p in BLIND_PRESETS" :key="p.bb" class="c-opt" :class="{ on: form.sb === p.sb }"
            @click="form.sb = p.sb; form.bb = p.bb">{{ formatKNotation(p.sb) }}/{{ formatKNotation(p.bb) }}</button>
        </div>
        <div class="c-label">人数</div>
        <div class="c-opts">
          <button v-for="n in [2, 6, 9]" :key="n" class="c-opt" :class="{ on: form.maxPlayers === n }"
            @click="form.maxPlayers = n">{{ n }}人</button>
        </div>
        <div class="c-label">结算时间</div>
        <div class="c-opts">
          <button v-for="mm in SETTLE_PRESETS" :key="mm" class="c-opt" :class="{ on: form.settleTimeMins === mm }"
            @click="form.settleTimeMins = mm">{{ mm }}分钟</button>
        </div>
        <div class="c-label">抽水(分给群主/合伙人)</div>
        <div class="c-opts">
          <button v-for="r in [0, 3, 5, 10]" :key="r" class="c-opt" :class="{ on: form.rakePercent === r }"
            @click="form.rakePercent = r">{{ r }}%</button>
        </div>
        <button class="c-confirm" :disabled="creating" @click="onCreate">
          {{ creating ? '创建中…' : '创建' }}
        </button>
      </div>
    </div>

    <!-- 设合伙人比例弹窗 -->
    <div v-if="partnerTarget" class="create-mask" @click.self="partnerTarget = null">
      <div class="create-box">
        <div class="c-title">设「{{ partnerTarget.nickname }}」为合伙人</div>
        <div class="c-label">让利比例(上级抽水分给他的占比,只能上调)</div>
        <div class="c-opts">
          <button v-for="r in [10, 20, 30, 40, 50, 60, 70, 80]" :key="r" class="c-opt"
            :class="{ on: partnerRate === r }" @click="partnerRate = r">{{ r }}%</button>
        </div>
        <button class="c-confirm" @click="confirmPartner">确定</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.clubdetail {
  background: #fff8f9;
  color: #2b2b2d;
}
.top {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: calc(170px * var(--s) + var(--sat, 0px));
  display: flex;
  align-items: center;
  gap: calc(20px * var(--s));
  padding: 0 calc(32px * var(--s));
  padding-top: calc(40px * var(--s) + var(--sat, 0px));
}
.back {
  width: calc(72px * var(--s));
  height: calc(72px * var(--s));
  border: none;
  border-radius: 50%;
  background: #fff;
  font-size: calc(44px * var(--s));
  cursor: pointer;
  flex: none;
}
.tinfo {
  flex: 1;
  min-width: 0;
}
.tname {
  font-size: calc(44px * var(--s));
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tsub {
  font-size: calc(28px * var(--s));
  color: #999;
  margin-top: calc(6px * var(--s));
}
.invite {
  color: #08a88c;
  cursor: pointer;
  text-decoration: underline;
}
.tbtn {
  height: calc(72px * var(--s));
  padding: 0 calc(30px * var(--s));
  border: none;
  border-radius: calc(36px * var(--s));
  background: linear-gradient(90deg, #14d3b6, #08c0a0);
  color: #fff;
  font-size: calc(30px * var(--s));
  font-weight: 600;
  cursor: pointer;
  flex: none;
}
.tabs {
  position: absolute;
  top: calc(180px * var(--s) + var(--sat, 0px));
  left: 0;
  width: 100%;
  height: calc(100px * var(--s));
  display: flex;
  gap: calc(40px * var(--s));
  padding: 0 calc(50px * var(--s));
  border-bottom: 1px solid #f0e8ea;
}
.tabbtn {
  position: relative;
  border: none;
  background: transparent;
  font-size: calc(38px * var(--s));
  color: #9a9a9c;
  cursor: pointer;
}
.tabbtn.on {
  color: #2b2b2d;
  font-weight: 700;
  box-shadow: inset 0 calc(-6px * var(--s)) 0 #08c0a0;
}
.dot {
  margin-left: calc(8px * var(--s));
  padding: calc(2px * var(--s)) calc(12px * var(--s));
  border-radius: 999px;
  background: #e05a5a;
  color: #fff;
  font-size: calc(24px * var(--s));
}
.okbar,
.errbar {
  position: absolute;
  top: calc(290px * var(--s) + var(--sat, 0px));
  left: calc(32px * var(--s));
  right: calc(32px * var(--s));
  z-index: 5;
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
.body {
  position: absolute;
  top: calc(300px * var(--s) + var(--sat, 0px));
  left: 0;
  width: 100%;
  bottom: 0;
  overflow-y: auto;
  padding: calc(20px * var(--s)) calc(32px * var(--s)) calc(60px * var(--s));
}

/* 牌局卡片 */
.item {
  border-radius: calc(20px * var(--s));
  background: #fff;
  box-shadow: 0 calc(4px * var(--s)) calc(16px * var(--s)) rgba(0, 0, 0, 0.05);
  padding: calc(32px * var(--s)) calc(36px * var(--s));
  margin-bottom: calc(20px * var(--s));
  display: flex;
  flex-direction: column;
  gap: calc(22px * var(--s));
  cursor: pointer;
}
.row1 {
  display: flex;
  align-items: center;
  gap: calc(20px * var(--s));
}
.rname {
  font-size: calc(42px * var(--s));
  font-weight: 700;
}
.rid {
  font-size: calc(30px * var(--s));
  color: #b0b0b0;
}
.rstage {
  margin-left: auto;
  font-size: calc(30px * var(--s));
  color: #08c0a0;
}
.row2 {
  display: flex;
  align-items: center;
  gap: calc(24px * var(--s));
  font-size: calc(34px * var(--s));
  color: #666;
}
.chip {
  color: #f4b740;
}
.mcnt {
  margin-left: auto;
  color: #08c0a0;
  font-weight: 600;
}

/* 成员/申请行 */
.mem {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(16px * var(--s));
  background: #fff;
  border-radius: calc(20px * var(--s));
  box-shadow: 0 calc(4px * var(--s)) calc(16px * var(--s)) rgba(0, 0, 0, 0.05);
  padding: calc(28px * var(--s)) calc(32px * var(--s));
  margin-bottom: calc(16px * var(--s));
}
.mleft {
  min-width: 0;
}
.mname {
  font-size: calc(38px * var(--s));
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: calc(14px * var(--s));
}
.msub {
  font-size: calc(26px * var(--s));
  color: #9a9a9c;
  margin-top: calc(8px * var(--s));
}
.role {
  padding: calc(2px * var(--s)) calc(16px * var(--s));
  border-radius: 999px;
  font-size: calc(24px * var(--s));
  background: #f0f0f0;
  color: #777;
  font-weight: 400;
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
.rate {
  font-size: calc(26px * var(--s));
  color: #9a55e0;
}
.mops {
  display: flex;
  flex-wrap: wrap;
  gap: calc(12px * var(--s));
  justify-content: flex-end;
}
.mop {
  height: calc(60px * var(--s));
  padding: 0 calc(22px * var(--s));
  border: 1px solid #d8d8d8;
  border-radius: calc(30px * var(--s));
  background: #fff;
  font-size: calc(26px * var(--s));
  color: #555;
  cursor: pointer;
  white-space: nowrap;
}
.mop.ok {
  border-color: #08c0a0;
  background: #e8faf5;
  color: #08a88c;
}
.mop.danger {
  border-color: #f2c2c2;
  background: #fdf2f2;
  color: #e05a5a;
}
.empty {
  text-align: center;
  color: #9a9a9c;
  font-size: calc(32px * var(--s));
  padding: calc(100px * var(--s)) 0;
}
.danger-zone {
  margin-top: calc(40px * var(--s));
  display: flex;
  justify-content: center;
}
.dz-btn {
  height: calc(80px * var(--s));
  padding: 0 calc(60px * var(--s));
  border: 1px solid #f2c2c2;
  border-radius: calc(40px * var(--s));
  background: transparent;
  color: #e05a5a;
  font-size: calc(30px * var(--s));
  cursor: pointer;
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
  font-size: calc(44px * var(--s));
  font-weight: 700;
  margin-bottom: calc(20px * var(--s));
}
.c-label {
  font-size: calc(32px * var(--s));
  color: #888;
  margin: calc(26px * var(--s)) 0 calc(14px * var(--s));
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
.c-opts {
  display: flex;
  flex-wrap: wrap;
  gap: calc(16px * var(--s));
}
.c-opt {
  height: calc(76px * var(--s));
  padding: 0 calc(28px * var(--s));
  border: 1px solid #e0e0e0;
  border-radius: calc(38px * var(--s));
  background: #fff;
  font-size: calc(32px * var(--s));
  color: #555;
  cursor: pointer;
}
.c-opt.on {
  border-color: #08c0a0;
  background: #e8faf5;
  color: #08a88c;
  font-weight: 600;
}
.c-confirm {
  width: 100%;
  height: calc(112px * var(--s));
  margin-top: calc(40px * var(--s));
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
