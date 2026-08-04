<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  clubListFlow, clubMembersFlow, clubApplyListFlow, clubReviewFlow,
  clubSetRoleFlow, clubKickFlow, clubQuitFlow, clubDissolveFlow,
  roomListFlow, getLoginInfo,
  clubScoreOpFlow, clubScoreLogsFlow,
} from '../net/session.js'
import { useGameStore } from '../stores/game.js'
import { formatKNotation } from '../utils/format'
import CreateRoomPopup from '../components/CreateRoomPopup.vue'

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

// 建房(群主/管理员):与大厅共用 CreateRoomPopup,全量参数 + 后台档位驱动
const showCreate = ref(false)
function onCreated(room) {
  showCreate.value = false
  onEnter({ roomId: room.roomId, name: room.name, sb: room.sb, bb: room.bb })
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

// ===== 俱乐部积分(每俱乐部独立一本账,对齐扯旋;带入游戏桌就用它) =====
const myScore = computed(() => {
  const m = members.value.find((x) => Number(x.userId) === Number(me.userId))
  return m ? m.score || 0 : 0
})

// 积分操作弹层:mode = ownerAdd 增发 / ownerBurn 核销 / distribute 上分 / collect 下分 / transfer 赠送
const scoreOp = ref(null) // { mode, target(可空=自己), amount }
const SCORE_OP_TXT = { ownerAdd: '增发积分', ownerBurn: '核销积分', distribute: '上分', collect: '下分', transfer: '赠送积分' }
function openScoreOp(mode, target = null) {
  scoreOp.value = { mode, target, amount: '' }
}
async function confirmScoreOp() {
  const op = scoreOp.value
  if (!op) return
  const amount = Math.floor(Number(op.amount))
  if (!amount || amount <= 0) { toast('请输入正确的积分数量', false); return }
  try {
    await clubScoreOpFlow({ clubId, op: op.mode, userId: op.target ? op.target.userId : 0, amount })
    scoreOp.value = null
    toast(`${SCORE_OP_TXT[op.mode]}成功`)
    await loadMembers()
  } catch (e) {
    toast(e.message || '操作失败', false)
  }
}
/** 对某成员可执行的积分操作:群主/管理员 → 上分/下分;任何人 → 赠送(不能给自己) */
function scoreOpsOf(m) {
  if (m.userId === me.userId) return []
  const ops = []
  if (canManage.value) { ops.push('distribute'); ops.push('collect') }
  ops.push('transfer')
  return ops
}

// 积分明细(自己;群主/管理员可查成员)
const scoreLogs = ref(null) // { title, logs }
async function openScoreLogs(m = null) {
  try {
    const logs = await clubScoreLogsFlow({ clubId, userId: m ? m.userId : 0, limit: 50 })
    scoreLogs.value = { title: m ? `「${m.nickname}」积分明细` : '我的积分明细', logs }
  } catch (e) {
    toast(e.message || '加载明细失败', false)
  }
}
function fmtLogTime(ts) {
  const d = new Date(ts)
  return `${d.getMonth() + 1}-${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
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
      <img v-if="club && club.avatar" :src="club.avatar" class="cav" />
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
        <!-- 我的积分卡:带入游戏桌就用它(每俱乐部独立,对齐扯旋) -->
        <div class="score-card">
          <div class="sc-left">
            <div class="sc-label">我的积分(本俱乐部)</div>
            <div class="sc-value">{{ formatKNotation(myScore) }}</div>
          </div>
          <div class="sc-btns">
            <button class="mop" @click="openScoreLogs()">明细</button>
            <template v-if="isOwner">
              <button class="mop ok" @click="openScoreOp('ownerAdd')">增发</button>
              <button class="mop danger" @click="openScoreOp('ownerBurn')">核销</button>
            </template>
          </div>
        </div>

        <div class="mem" v-for="m in members" :key="m.userId">
          <div class="mleft">
            <div class="mname">
              {{ m.nickname }}
              <span class="role" :class="'r' + m.role">{{ ROLE_TXT[m.role] }}</span>
              <span v-if="m.role === 4" class="rate">{{ m.partnerRate }}%</span>
            </div>
            <div class="msub">ID {{ m.userId }} · 邀请码 {{ m.inviteCode }} · 积分 {{ formatKNotation(m.score || 0) }}</div>
          </div>
          <div class="mops">
            <button v-for="op in scoreOpsOf(m)" :key="'s' + op" class="mop score"
              @click="openScoreOp(op, m)">{{ SCORE_OP_TXT[op] }}</button>
            <button v-if="canManage && m.userId !== me.userId" class="mop"
              @click="openScoreLogs(m)">明细</button>
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

    <!-- 建牌局弹窗(与大厅共用组件,全量参数,多挂 clubId) -->
    <CreateRoomPopup
      :show="showCreate"
      :club-id="clubId"
      title="创建俱乐部牌局"
      :name-placeholder="(club ? club.name : '') + '的牌局'"
      @close="showCreate = false"
      @created="onCreated"
    />

    <!-- 积分操作弹窗(增发/核销/上分/下分/赠送) -->
    <div v-if="scoreOp" class="create-mask" @click.self="scoreOp = null">
      <div class="create-box">
        <div class="c-title">
          {{ SCORE_OP_TXT[scoreOp.mode] }}<template v-if="scoreOp.target"> · {{ scoreOp.target.nickname }}</template>
        </div>
        <div class="c-label">
          <template v-if="scoreOp.mode === 'ownerAdd'">给自己账上增发积分(凭空造分,只有群主能操作)</template>
          <template v-else-if="scoreOp.mode === 'ownerBurn'">从自己账上销毁积分(只有群主能操作)</template>
          <template v-else-if="scoreOp.mode === 'distribute'">从我的积分转给成员(上分)</template>
          <template v-else-if="scoreOp.mode === 'collect'">从成员积分收回到我账上(下分)</template>
          <template v-else>从我的积分赠送给对方</template>
        </div>
        <input v-model="scoreOp.amount" class="c-input" type="number" min="1" placeholder="积分数量" />
        <div class="c-label">我的积分:{{ formatKNotation(myScore) }}<template v-if="scoreOp.target"> · 对方积分:{{ formatKNotation(scoreOp.target.score || 0) }}</template></div>
        <button class="c-confirm" @click="confirmScoreOp">确定</button>
      </div>
    </div>

    <!-- 积分明细弹窗(type 对齐扯旋 game_score_log) -->
    <div v-if="scoreLogs" class="create-mask" @click.self="scoreLogs = null">
      <div class="create-box">
        <div class="c-title">{{ scoreLogs.title }}</div>
        <div v-if="!scoreLogs.logs.length" class="empty">暂无积分流水</div>
        <div v-for="(lg, i) in scoreLogs.logs" :key="i" class="log-row">
          <div class="log-left">
            <div class="log-type">{{ lg.typeName || '积分变动' }}</div>
            <div class="log-sub">{{ fmtLogTime(lg.time) }}<template v-if="lg.remark"> · {{ lg.remark }}</template></div>
          </div>
          <div class="log-right">
            <div class="log-amt" :class="{ plus: lg.amount > 0, minus: lg.amount < 0 }">
              {{ lg.amount > 0 ? '+' : '' }}{{ formatKNotation(lg.amount) }}
            </div>
            <div class="log-after">余 {{ formatKNotation(lg.after) }}</div>
          </div>
        </div>
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
.cav {
  width: calc(84px * var(--s));
  height: calc(84px * var(--s));
  border-radius: calc(20px * var(--s));
  object-fit: cover;
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

/* 我的积分卡 */
.score-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(16px * var(--s));
  background: linear-gradient(90deg, #eafcf7, #f2fbff);
  border: 1px solid #bfeee2;
  border-radius: calc(20px * var(--s));
  padding: calc(26px * var(--s)) calc(32px * var(--s));
  margin-bottom: calc(20px * var(--s));
}
.sc-label {
  font-size: calc(26px * var(--s));
  color: #6d8a83;
}
.sc-value {
  font-size: calc(52px * var(--s));
  font-weight: 700;
  color: #08a88c;
  margin-top: calc(6px * var(--s));
}
.sc-btns {
  display: flex;
  gap: calc(12px * var(--s));
}
.mop.score {
  border-color: #bfe0f5;
  background: #f0f8ff;
  color: #3d7fd8;
}

/* 积分明细行 */
.log-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: calc(20px * var(--s)) calc(8px * var(--s));
  border-bottom: 1px solid #f0f0f0;
}
.log-type {
  font-size: calc(32px * var(--s));
  font-weight: 600;
}
.log-sub {
  font-size: calc(24px * var(--s));
  color: #9a9a9c;
  margin-top: calc(6px * var(--s));
}
.log-right {
  text-align: right;
}
.log-amt {
  font-size: calc(36px * var(--s));
  font-weight: 700;
}
.log-amt.plus { color: #08a88c; }
.log-amt.minus { color: #e05a5a; }
.log-after {
  font-size: calc(24px * var(--s));
  color: #9a9a9c;
  margin-top: calc(4px * var(--s));
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
