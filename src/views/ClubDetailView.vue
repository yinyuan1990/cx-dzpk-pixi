<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  clubListFlow, clubMembersFlow, clubApplyListFlow, clubReviewFlow,
  clubSetRoleFlow, clubKickFlow, clubQuitFlow, clubDissolveFlow, clubUpdateFlow,
  roomListFlow, getLoginInfo, myRecordsFlow,
  clubScoreOpFlow, clubScoreLogsFlow, uploadImageFlow,
} from '../net/session.js'
import { useGameStore } from '../stores/game.js'
import { formatKNotation } from '../utils/format'
import { compressAvatar } from '../utils/imageCompress.js'

// 俱乐部详情(对齐扯旋 ClubMainView):
//   顶部 = 俱乐部头像/名称(编号)/角色角标 + 我的积分 + 公告跑马灯;
//   中间 = 牌局列表(好友局卡片样式,已坐玩家头像列);
//   左下角 = 「战绩」「俱乐部」两个菜单,点开从底部弹框。
const router = useRouter()
const route = useRoute()
const game = useGameStore()

const clubId = Number(route.params.id)
const me = getLoginInfo()

const ROLE_TXT = { 1: '成员', 2: '管理员', 3: '群主', 4: '合伙人' }
const club = ref(null)
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
  if (!club.value) { router.replace('/friend') }
}

// ===== 牌局列表(好友局卡片样式) =====
const rooms = ref([])
async function loadRooms() {
  try {
    const list = await roomListFlow(clubId)
    rooms.value = list.map((r) => ({
      roomId: r.roomId, name: r.name || '#' + r.roomId, sb: r.sb, bb: r.bb,
      blinds: `${formatKNotation(r.sb)}/${formatKNotation(r.bb)}`,
      maxPlayers: r.maxPlayers || 9,
      members: `${r.seated || 0}/${r.maxPlayers || 9}`,
      settle: r.settleTimeMins ? `${r.settleTimeMins}分钟` : '',
      waiting: r.stage === 'WAITING',
      stage: r.stage === 'WAITING' ? '等待中' : '进行中',
      players: r.players || [],
    }))
  } catch (e) {
    toast(e.message || '加载牌局失败', false)
  }
}
function onEnter(tb) {
  game.setEnterTarget({ roomId: tb.roomId, name: tb.name, sb: tb.sb, bb: tb.bb, incp: tb.bb })
  router.push('/table/' + tb.roomId)
}
function onCreateRoom() {
  router.push({ path: `/create-room/${clubId}`, query: { clubName: club.value ? club.value.name : '' } })
}

// ===== 「战绩」底部弹框(对齐扯旋 CHEXUANRecordPanel,俱乐部维度) =====
const showRecords = ref(false)
const recData = ref({ records: [], stats: {} })
const recLoading = ref(false)
const REASON_TXT = { period: '周期结算', standup: '站起', leave: '离房', buyin_timeout: '超时站起' }
async function openRecords() {
  showRecords.value = true
  recLoading.value = true
  try {
    recData.value = await myRecordsFlow(50, clubId)
  } catch (e) {
    toast(e.message || '战绩加载失败', false)
  } finally {
    recLoading.value = false
  }
}
function recTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const p2 = (n) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}.${d.getDate()} ${p2(d.getHours())}:${p2(d.getMinutes())}`
}
function signed(n) {
  return (n > 0 ? '+' : '') + formatKNotation(n || 0)
}

// ===== 「俱乐部」设置底部弹框(对齐扯旋 ClubSettingPanel,Tab 按角色) =====
const showSetting = ref(false)
const setTab = ref('member') // member | partner | scorelog | settings
const settingTabs = computed(() => {
  const tabs = [{ key: 'member', label: '成员管理' }]
  if (myRole.value !== 1) tabs.push({ key: 'partner', label: '合伙人' })
  tabs.push({ key: 'scorelog', label: '积分明细' })
  if (canManage.value) tabs.push({ key: 'settings', label: '俱乐部设置' })
  return tabs
})
function openSetting() {
  showSetting.value = true
  switchSetTab('member')
}
function switchSetTab(k) {
  setTab.value = k
  if (k === 'member' || k === 'partner') loadMembers()
  else if (k === 'scorelog') loadMyLogs()
  else if (k === 'settings') initEditForm()
}

function copyInvite() {
  const code = club.value && club.value.myInviteCode
  if (!code) return
  try { navigator.clipboard.writeText(String(code)) } catch { /* noop */ }
  toast(`专属ID ${code} 已复制`)
}

// ----- 成员管理 -----
const members = ref([])
async function loadMembers() {
  try {
    members.value = await clubMembersFlow(clubId)
  } catch (e) {
    toast(e.message || '加载成员失败', false)
  }
}
const partners = computed(() => members.value.filter((m) => m.role === 4))
const myScore = computed(() => {
  const m = members.value.find((x) => Number(x.userId) === Number(me.userId))
  return m ? m.score || 0 : (club.value ? club.value.myScore || 0 : 0)
})

/** 角色管理操作(对齐扯旋权限矩阵) */
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

const partnerTarget = ref(null)
const partnerRate = ref(50)
async function doOp(m, op) {
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

// ----- 积分操作(增发/核销/上分/下分/赠送,快捷额对齐扯旋 50~5000) -----
const scoreOp = ref(null)
const SCORE_OP_TXT = { ownerAdd: '增发积分', ownerBurn: '核销积分', distribute: '上分', collect: '下分', transfer: '赠送积分' }
const QUICK_AMOUNTS = [50, 100, 500, 1000, 5000]
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
function scoreOpsOf(m) {
  if (m.userId === me.userId) return []
  const ops = []
  if (canManage.value) { ops.push('distribute'); ops.push('collect') }
  ops.push('transfer')
  return ops
}

// ----- 积分明细(自己 / 群主管理员可查成员;type 着色对齐扯旋) -----
const myLogs = ref([])
async function loadMyLogs() {
  try {
    myLogs.value = await clubScoreLogsFlow({ clubId, userId: 0, limit: 50 })
  } catch (e) {
    toast(e.message || '加载明细失败', false)
  }
}
const scoreLogs = ref(null) // 弹窗查成员 { title, logs }
async function openScoreLogs(m) {
  try {
    const logs = await clubScoreLogsFlow({ clubId, userId: m.userId, limit: 50 })
    scoreLogs.value = { title: `「${m.nickname}」积分明细`, logs }
  } catch (e) {
    toast(e.message || '加载明细失败', false)
  }
}
function fmtLogTime(ts) {
  const d = new Date(ts)
  return `${d.getMonth() + 1}-${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ----- 俱乐部设置(改资料,群主/管理员;对齐扯旋 ClubUpdateInfoContent) -----
const editForm = ref({ name: '', remark: '', avatar: '', notice: '' })
const editBusy = ref(false)
const editFileInput = ref(null)
function initEditForm() {
  const c = club.value
  if (!c) return
  editForm.value = { name: c.name || '', remark: c.remark || '', avatar: c.avatar || '', notice: c.notice || '' }
}
async function onPickEditAvatar(e) {
  const file = e.target.files && e.target.files[0]
  e.target.value = ''
  if (!file || editBusy.value) return
  editBusy.value = true
  try {
    const blob = await compressAvatar(file)
    editForm.value.avatar = await uploadImageFlow(blob, 'avatar', 'club.jpg')
  } catch (err) {
    toast(err.message || '头像上传失败', false)
  } finally {
    editBusy.value = false
  }
}
async function saveClubInfo() {
  const f = editForm.value
  if (!f.name.trim()) { toast('请输入俱乐部名称', false); return }
  if (!f.remark.trim()) { toast('请输入俱乐部简介', false); return }
  if (!f.avatar) { toast('请上传俱乐部头像', false); return }
  try {
    await clubUpdateFlow({ clubId, name: f.name.trim(), remark: f.remark.trim(), avatar: f.avatar, notice: f.notice.trim() })
    toast('已保存')
    await loadClub()
  } catch (e) {
    toast(e.message || '保存失败', false)
  }
}
async function onQuit() {
  if (!confirm('确定退出该俱乐部?')) return
  try {
    await clubQuitFlow(clubId)
    router.replace('/friend')
  } catch (e) {
    toast(e.message || '退出失败', false)
  }
}
async function onDissolve() {
  if (!confirm('确定解散俱乐部?所有成员将被移除,不可恢复!')) return
  try {
    await clubDissolveFlow(clubId)
    router.replace('/friend')
  } catch (e) {
    toast(e.message || '解散失败', false)
  }
}

// ----- 待审批(群主/管理员,设置面板成员页顶部) -----
const applies = ref([])
async function loadApplies() {
  if (!canManage.value) return
  try {
    applies.value = await clubApplyListFlow(clubId)
  } catch { /* 静默 */ }
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

let pollTimer = null
onMounted(async () => {
  if (!me) { router.replace('/login'); return }
  await loadClub()
  if (!club.value) return
  loadRooms()
  loadMembers()
  loadApplies()
  pollTimer = setInterval(() => { if (!showSetting.value && !showRecords.value) loadRooms() }, 5000)
})
onBeforeUnmount(() => clearInterval(pollTimer))
</script>

<template>
  <div class="stage-root clubdetail">
    <!-- 顶部(对齐扯旋 ClubTop):返回 + 俱乐部头像 + 名称(编号) + 角色角标 | 我的积分 -->
    <div class="top">
      <button class="back" @click="router.push('/friend')">&#8249;</button>
      <img v-if="club && club.avatar" :src="club.avatar" class="cav" />
      <div class="tinfo" v-if="club">
        <div class="tname-row">
          <span class="tname">{{ club.name }}</span>
          <span class="tno">({{ club.clubNo }})</span>
          <span class="trole" :class="'r' + club.myRole">{{ ROLE_TXT[club.myRole] }}</span>
        </div>
        <div class="tscore">我的积分 <b>{{ formatKNotation(myScore) }}</b></div>
      </div>
      <button v-if="canManage" class="tbtn" @click="onCreateRoom">+ 建牌局</button>
    </div>

    <!-- 公告跑马灯(对齐扯旋 addMarquee) -->
    <div v-if="club && club.notice" class="marquee">
      <span class="mq-text">{{ club.notice }}</span>
    </div>

    <div v-if="okMsg" class="okbar">{{ okMsg }}</div>
    <div v-if="errMsg" class="errbar">{{ errMsg }}</div>

    <!-- 牌局列表(好友局卡片样式 + 已坐玩家头像列) -->
    <div class="body" :class="{ nonotice: !(club && club.notice) }">
      <button v-for="(tb, idx) in rooms" :key="tb.roomId" class="room" @click="onEnter(tb)">
        <div class="room-top">
          <span class="room-idx">{{ idx + 1 }}</span>
          <span class="room-master">{{ tb.name }}</span>
          <span class="room-tags">
            <span class="rtag rtag-type">德州</span>
            <span class="rtag" :class="tb.waiting ? 'rtag-wait' : 'rtag-live'">{{ tb.stage }}</span>
          </span>
        </div>
        <div class="room-name">#{{ tb.roomId }} · 盲注 {{ tb.blinds }}<template v-if="tb.settle"> · {{ tb.settle }}</template></div>
        <div class="room-stats">
          <div class="room-heads">
            <template v-for="p in tb.players.slice(0, 6)" :key="p.userId">
              <img v-if="p.avatar" :src="p.avatar" class="rhead" :title="p.nickname" />
              <span v-else class="rhead rhead-txt">{{ (p.nickname || '?')[0] }}</span>
            </template>
            <span v-if="tb.players.length === 0" class="rhead-empty">虚位以待</span>
          </div>
          <span class="rstat rperson">{{ tb.members }}</span>
        </div>
      </button>
      <div v-if="rooms.length === 0" class="empty">
        俱乐部还没有牌局<template v-if="canManage">,点右上「建牌局」开一桌</template>
      </div>
    </div>

    <!-- 左下角两个菜单(对齐扯旋 AT_Bottom:AT_RecordBtn 战绩 / AT_SettingBtn 俱乐部) -->
    <div class="bottom-menus">
      <button class="bm-btn" @click="openRecords">
        <span class="bm-ic">&#128202;</span>战绩
      </button>
      <button class="bm-btn" @click="openSetting">
        <span class="bm-ic">&#127963;</span>俱乐部
      </button>
    </div>

    <!-- ============ 「战绩」底部弹框 ============ -->
    <div v-if="showRecords" class="sheet-mask" @click.self="showRecords = false">
      <div class="sheet">
        <div class="sheet-bar"></div>
        <div class="sheet-title">俱乐部战绩</div>
        <div class="rec-stats" v-if="recData.stats && recData.stats.sessions > 0">
          <div class="rs-item"><b>{{ recData.stats.winSessions || 0 }}</b><span>胜利</span></div>
          <div class="rs-item"><b>{{ recData.stats.loseSessions || 0 }}</b><span>失败</span></div>
          <div class="rs-item"><b>{{ recData.stats.totalHands || 0 }}</b><span>总手数</span></div>
          <div class="rs-item"><b>{{ recData.stats.sessions || 0 }}</b><span>总局数</span></div>
        </div>
        <div class="sheet-body">
          <div v-if="recLoading" class="empty">加载中…</div>
          <template v-else>
            <div class="rec-item" v-for="(r, i) in recData.records" :key="i">
              <div class="ri-l">
                <div class="ri-name">房间号:{{ r.roomId }}<span class="ri-reason">{{ REASON_TXT[r.reason] || r.reason }}</span></div>
                <div class="ri-sub">{{ recTime(r.time) }} · 带入 {{ formatKNotation(r.bringIn) }} · {{ r.handCount }}手 · 服务费 {{ formatKNotation(r.rake) }}</div>
              </div>
              <div class="ri-r" :class="{ win: r.profit > 0, lose: r.profit < 0 }">{{ signed(r.profit) }}</div>
            </div>
            <div v-if="recData.records.length === 0" class="empty">本俱乐部还没有战绩</div>
          </template>
        </div>
      </div>
    </div>

    <!-- ============ 「俱乐部」设置底部弹框(对齐扯旋 ClubSettingPanel) ============ -->
    <div v-if="showSetting" class="sheet-mask" @click.self="showSetting = false">
      <div class="sheet sheet-tall">
        <div class="sheet-bar"></div>
        <div class="sheet-head">
          <span class="sheet-title">俱乐部</span>
          <span class="invite" @click="copyInvite">专属ID {{ club ? club.myInviteCode : '' }} <i>复制</i></span>
        </div>
        <div class="set-tabs">
          <button v-for="tb in settingTabs" :key="tb.key" class="set-tab"
            :class="{ on: setTab === tb.key }" @click="switchSetTab(tb.key)">{{ tb.label }}</button>
        </div>

        <div class="sheet-body">
          <!-- Tab:成员管理 -->
          <template v-if="setTab === 'member'">
            <!-- 待审申请(群主/管理员) -->
            <template v-if="canManage && applies.length">
              <div class="sec-sub">待审申请</div>
              <div class="mem" v-for="r in applies" :key="'a' + r.requestId">
                <div class="mleft">
                  <div class="mname">{{ r.nickname }}</div>
                  <div class="msub">ID:{{ r.userId }} · {{ r.codeType === 2 ? '邀请码申请' : '俱乐部号申请' }}</div>
                </div>
                <div class="mops">
                  <button class="mop ok" @click="review(r, true)">同意</button>
                  <button class="mop danger" @click="review(r, false)">拒绝</button>
                </div>
              </div>
            </template>

            <!-- 我的积分卡 -->
            <div class="score-card">
              <div>
                <div class="sc-label">我的积分(本俱乐部)</div>
                <div class="sc-value">{{ formatKNotation(myScore) }}</div>
              </div>
              <div class="mops">
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
                <div class="msub">ID:{{ m.userId }} · 积分 {{ formatKNotation(m.score || 0) }}</div>
              </div>
              <div class="mops">
                <button v-for="op in scoreOpsOf(m)" :key="'s' + op" class="mop score"
                  @click="openScoreOp(op, m)">{{ SCORE_OP_TXT[op] }}</button>
                <button v-if="canManage && m.userId !== me.userId" class="mop"
                  @click="openScoreLogs(m)">积分记录</button>
                <button v-for="op in opsOf(m)" :key="op" class="mop" :class="{ danger: op === 'kick' }"
                  @click="doOp(m, op)">{{ OP_TXT[op] }}</button>
              </div>
            </div>
          </template>

          <!-- Tab:合伙人 -->
          <template v-else-if="setTab === 'partner'">
            <div class="mem" v-for="m in partners" :key="m.userId">
              <div class="mleft">
                <div class="mname">{{ m.nickname }} <span class="rate">让利 {{ m.partnerRate }}%</span></div>
                <div class="msub">ID:{{ m.userId }} · 积分 {{ formatKNotation(m.score || 0) }}</div>
              </div>
              <div class="mops" v-if="canManage">
                <button class="mop" @click="doOp(m, 'setPartner')">调比例</button>
                <button class="mop" @click="openScoreLogs(m)">积分记录</button>
                <button class="mop danger" @click="doOp(m, 'kick')">移除</button>
              </div>
            </div>
            <div v-if="partners.length === 0" class="empty">暂无合伙人</div>
          </template>

          <!-- Tab:积分明细(自己,type 对齐扯旋 game_score_log) -->
          <template v-else-if="setTab === 'scorelog'">
            <div v-if="!myLogs.length" class="empty">暂无积分流水</div>
            <div v-for="(lg, i) in myLogs" :key="i" class="log-row">
              <div>
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
          </template>

          <!-- Tab:俱乐部设置(改资料;群主/管理员) -->
          <template v-else-if="setTab === 'settings'">
            <div class="c-label">头像</div>
            <div class="av-up" @click="editFileInput && editFileInput.click()">
              <div class="av-box">
                <img v-if="editForm.avatar" :src="editForm.avatar" alt="" />
                <span v-else class="av-plus">+</span>
              </div>
              <span class="av-hint">{{ editBusy ? '上传中…' : '点击更换' }}</span>
              <input ref="editFileInput" type="file" accept="image/*" class="av-file" @change="onPickEditAvatar" />
            </div>
            <div class="c-label">名称(最长 4 个汉字,不能纯数字)</div>
            <input v-model="editForm.name" class="c-input" maxlength="8" />
            <div class="c-label">简介</div>
            <input v-model="editForm.remark" class="c-input" maxlength="100" />
            <div class="c-label">公告(进俱乐部跑马灯展示,可留空)</div>
            <input v-model="editForm.notice" class="c-input" maxlength="200" placeholder="输入公告内容" />
            <button class="c-confirm" @click="saveClubInfo">保存</button>

            <div class="danger-zone">
              <button v-if="!isOwner" class="dz-btn" @click="onQuit">退出俱乐部</button>
              <button v-else class="dz-btn" @click="onDissolve">解散俱乐部</button>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- 积分操作弹窗(增发/核销/上分/下分/赠送 + 快捷额) -->
    <div v-if="scoreOp" class="create-mask" @click.self="scoreOp = null">
      <div class="create-box">
        <div class="c-title">
          {{ SCORE_OP_TXT[scoreOp.mode] }}<template v-if="scoreOp.target"> · {{ scoreOp.target.nickname }}</template>
        </div>
        <div class="c-label">
          <template v-if="scoreOp.mode === 'ownerAdd'">给自己账上增发积分(只有群主能操作)</template>
          <template v-else-if="scoreOp.mode === 'ownerBurn'">从自己账上销毁积分(只有群主能操作)</template>
          <template v-else-if="scoreOp.mode === 'distribute'">从我的积分转给成员(上分)</template>
          <template v-else-if="scoreOp.mode === 'collect'">从成员积分收回到我账上(下分)</template>
          <template v-else>从我的积分赠送给对方</template>
        </div>
        <div class="c-opts">
          <button v-for="q in QUICK_AMOUNTS" :key="q" class="c-opt"
            :class="{ on: Number(scoreOp.amount) === q }" @click="scoreOp.amount = q">{{ q }}</button>
        </div>
        <input v-model="scoreOp.amount" class="c-input" type="number" min="1" placeholder="积分数量" />
        <div class="c-label">我的积分:{{ formatKNotation(myScore) }}<template v-if="scoreOp.target"> · 对方积分:{{ formatKNotation(scoreOp.target.score || 0) }}</template></div>
        <button class="c-confirm" @click="confirmScoreOp">确定</button>
      </div>
    </div>

    <!-- 查成员积分明细弹窗 -->
    <div v-if="scoreLogs" class="create-mask" @click.self="scoreLogs = null">
      <div class="create-box">
        <div class="c-title">{{ scoreLogs.title }}</div>
        <div v-if="!scoreLogs.logs.length" class="empty">暂无积分流水</div>
        <div v-for="(lg, i) in scoreLogs.logs" :key="i" class="log-row">
          <div>
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

/* 顶部 */
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
  width: calc(90px * var(--s));
  height: calc(90px * var(--s));
  border-radius: calc(22px * var(--s));
  object-fit: cover;
  flex: none;
}
.tinfo {
  flex: 1;
  min-width: 0;
}
.tname-row {
  display: flex;
  align-items: center;
  gap: calc(12px * var(--s));
}
.tname {
  font-size: calc(42px * var(--s));
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tno {
  font-size: calc(28px * var(--s));
  color: #b0b0b0;
}
.trole {
  padding: calc(2px * var(--s)) calc(16px * var(--s));
  border-radius: 999px;
  font-size: calc(24px * var(--s));
  background: #f0f0f0;
  color: #777;
  flex: none;
}
.trole.r3 { background: #e8faf5; color: #08a88c; }
.trole.r2 { background: #f3e8ff; color: #9a55e0; }
.trole.r4 { background: #fff3dd; color: #d29018; }
.tscore {
  font-size: calc(28px * var(--s));
  color: #999;
  margin-top: calc(8px * var(--s));
}
.tscore b {
  color: #08a88c;
  font-size: calc(34px * var(--s));
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

/* 公告跑马灯 */
.marquee {
  position: absolute;
  top: calc(180px * var(--s) + var(--sat, 0px));
  left: calc(32px * var(--s));
  right: calc(32px * var(--s));
  height: calc(64px * var(--s));
  line-height: calc(64px * var(--s));
  border-radius: calc(32px * var(--s));
  background: #fff7e8;
  color: #c98a2a;
  font-size: calc(28px * var(--s));
  overflow: hidden;
  white-space: nowrap;
}
.mq-text {
  display: inline-block;
  padding-left: 100%;
  animation: mq 14s linear infinite;
}
@keyframes mq {
  to { transform: translateX(-100%); }
}

.okbar,
.errbar {
  position: absolute;
  top: calc(268px * var(--s) + var(--sat, 0px));
  left: calc(32px * var(--s));
  right: calc(32px * var(--s));
  z-index: 95;
  padding: calc(16px * var(--s)) calc(28px * var(--s));
  border-radius: calc(16px * var(--s));
  font-size: calc(28px * var(--s));
  text-align: center;
}
.okbar { background: #e8faf5; color: #08a88c; }
.errbar { background: #fdecec; color: #e05a5a; }

/* 牌局列表 */
.body {
  position: absolute;
  top: calc(270px * var(--s) + var(--sat, 0px));
  left: 0;
  width: 100%;
  bottom: calc(160px * var(--s) + var(--sab, 0px));
  overflow-y: auto;
  padding: calc(20px * var(--s)) calc(32px * var(--s)) calc(40px * var(--s));
}
.body.nonotice {
  top: calc(190px * var(--s) + var(--sat, 0px));
}

/* 牌局卡片(好友局 FriendGameRoomListItem 样式) */
.room {
  position: relative;
  width: 100%;
  border: none;
  border-radius: calc(24px * var(--s));
  background: #fff;
  box-shadow: 0 calc(4px * var(--s)) calc(16px * var(--s)) rgba(0, 0, 0, 0.05);
  padding: calc(24px * var(--s)) calc(28px * var(--s));
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  margin-bottom: calc(20px * var(--s));
}
.room-top {
  display: flex;
  align-items: center;
  gap: calc(14px * var(--s));
}
.room-idx {
  flex: none;
  width: calc(48px * var(--s));
  height: calc(48px * var(--s));
  line-height: calc(48px * var(--s));
  text-align: center;
  border-radius: calc(14px * var(--s));
  background: #eafcf7;
  color: #08a88c;
  font-size: calc(28px * var(--s));
  font-weight: 700;
}
.room-master {
  font-size: calc(32px * var(--s));
  font-weight: 600;
  color: #2b2b2d;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.room-tags {
  margin-left: auto;
  display: flex;
  gap: calc(10px * var(--s));
  flex: none;
}
.rtag {
  height: calc(50px * var(--s));
  line-height: calc(50px * var(--s));
  padding: 0 calc(18px * var(--s));
  border-radius: calc(25px * var(--s));
  font-size: calc(26px * var(--s));
  font-weight: 500;
}
.rtag-type {
  background: rgba(8, 192, 160, 0.18);
  color: #08c0a0;
}
.rtag-wait {
  background: rgba(244, 183, 64, 0.16);
  color: #d29018;
}
.rtag-live {
  background: rgba(255, 36, 80, 0.1);
  color: #ff2450;
}
.room-name {
  margin-top: calc(16px * var(--s));
  font-size: calc(32px * var(--s));
  font-weight: 700;
  color: #2b2b2d;
}
.room-stats {
  margin-top: calc(18px * var(--s));
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.room-heads {
  display: flex;
  align-items: center;
}
.rhead {
  width: calc(60px * var(--s));
  height: calc(60px * var(--s));
  border-radius: 50%;
  border: calc(3px * var(--s)) solid #fff;
  object-fit: cover;
  margin-right: calc(-16px * var(--s));
  background: #eee;
}
.rhead-txt {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #8ec5ff, #5b8def);
  color: #fff;
  font-size: calc(26px * var(--s));
  font-style: normal;
}
.rhead-empty {
  font-size: calc(26px * var(--s));
  color: #b8b8ba;
}
.rstat.rperson {
  padding: 0 calc(18px * var(--s));
  height: calc(48px * var(--s));
  line-height: calc(48px * var(--s));
  border: calc(2px * var(--s)) solid #a6e0cb;
  border-radius: calc(24px * var(--s));
  color: #6b6b6d;
  font-size: calc(28px * var(--s));
}
.empty {
  text-align: center;
  color: #9a9a9c;
  font-size: calc(32px * var(--s));
  padding: calc(100px * var(--s)) 0;
}

/* 左下角两个菜单 */
.bottom-menus {
  position: absolute;
  left: calc(32px * var(--s));
  bottom: calc(30px * var(--s) + var(--sab, 0px));
  display: flex;
  gap: calc(20px * var(--s));
  z-index: 10;
}
.bm-btn {
  height: calc(96px * var(--s));
  padding: 0 calc(40px * var(--s));
  border: none;
  border-radius: calc(48px * var(--s));
  background: #fff;
  box-shadow: 0 calc(6px * var(--s)) calc(20px * var(--s)) rgba(0, 0, 0, 0.12);
  font-size: calc(32px * var(--s));
  font-weight: 600;
  color: #2b2b2d;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: calc(12px * var(--s));
}
.bm-ic {
  font-size: calc(36px * var(--s));
}

/* 底部弹框(bottom sheet) */
.sheet-mask {
  position: absolute;
  inset: 0;
  z-index: 90;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: flex-end;
}
.sheet {
  width: 100%;
  max-height: 72%;
  background: #fff;
  border-radius: calc(36px * var(--s)) calc(36px * var(--s)) 0 0;
  padding: calc(16px * var(--s)) calc(36px * var(--s)) calc(40px * var(--s));
  display: flex;
  flex-direction: column;
}
.sheet-tall {
  max-height: 86%;
  height: 86%;
}
.sheet-bar {
  width: calc(90px * var(--s));
  height: calc(10px * var(--s));
  border-radius: 999px;
  background: #e4e4e6;
  margin: 0 auto calc(20px * var(--s));
  flex: none;
}
.sheet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: none;
}
.sheet-title {
  font-size: calc(42px * var(--s));
  font-weight: 700;
  flex: none;
}
.invite {
  font-size: calc(28px * var(--s));
  color: #08a88c;
  cursor: pointer;
}
.invite i {
  font-style: normal;
  border: 1px solid #9be5d5;
  border-radius: 999px;
  padding: calc(2px * var(--s)) calc(14px * var(--s));
  margin-left: calc(8px * var(--s));
}
.sheet-body {
  flex: 1;
  overflow-y: auto;
  margin-top: calc(20px * var(--s));
}

/* 战绩汇总 */
.rec-stats {
  display: flex;
  gap: calc(14px * var(--s));
  margin-top: calc(20px * var(--s));
  flex: none;
}
.rs-item {
  flex: 1;
  background: #f8f8f9;
  border-radius: calc(18px * var(--s));
  padding: calc(20px * var(--s)) 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: calc(6px * var(--s));
}
.rs-item b {
  font-size: calc(38px * var(--s));
}
.rs-item span {
  font-size: calc(24px * var(--s));
  color: #999;
}
.rec-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: calc(24px * var(--s)) calc(8px * var(--s));
  border-bottom: 1px solid #f0f0f0;
}
.ri-name {
  font-size: calc(32px * var(--s));
  font-weight: 600;
}
.ri-reason {
  margin-left: calc(14px * var(--s));
  font-size: calc(24px * var(--s));
  color: #9a9a9c;
  font-weight: 400;
}
.ri-sub {
  font-size: calc(24px * var(--s));
  color: #9a9a9c;
  margin-top: calc(8px * var(--s));
}
.ri-r {
  font-size: calc(38px * var(--s));
  font-weight: 700;
  color: #666;
}
.win { color: #0aa06e; }
.lose { color: #e05a5a; }

/* 设置面板 tabs */
.set-tabs {
  display: flex;
  gap: calc(32px * var(--s));
  border-bottom: 1px solid #f0f0f0;
  margin-top: calc(20px * var(--s));
  flex: none;
}
.set-tab {
  border: none;
  background: transparent;
  font-size: calc(32px * var(--s));
  color: #9a9a9c;
  padding: calc(16px * var(--s)) 0;
  cursor: pointer;
}
.set-tab.on {
  color: #2b2b2d;
  font-weight: 700;
  box-shadow: inset 0 calc(-6px * var(--s)) 0 #08c0a0;
}
.sec-sub {
  font-size: calc(30px * var(--s));
  font-weight: 700;
  color: #e08a3a;
  margin: calc(16px * var(--s)) 0;
}

/* 成员行 */
.mem {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(16px * var(--s));
  background: #fafafa;
  border-radius: calc(20px * var(--s));
  padding: calc(24px * var(--s)) calc(28px * var(--s));
  margin-bottom: calc(14px * var(--s));
}
.mleft { min-width: 0; }
.mname {
  font-size: calc(34px * var(--s));
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: calc(12px * var(--s));
}
.msub {
  font-size: calc(24px * var(--s));
  color: #9a9a9c;
  margin-top: calc(8px * var(--s));
}
.role {
  padding: calc(2px * var(--s)) calc(14px * var(--s));
  border-radius: 999px;
  font-size: calc(22px * var(--s));
  background: #f0f0f0;
  color: #777;
  font-weight: 400;
}
.role.r3 { background: #e8faf5; color: #08a88c; }
.role.r2 { background: #f3e8ff; color: #9a55e0; }
.role.r4 { background: #fff3dd; color: #d29018; }
.rate {
  font-size: calc(24px * var(--s));
  color: #d29018;
}
.mops {
  display: flex;
  flex-wrap: wrap;
  gap: calc(10px * var(--s));
  justify-content: flex-end;
}
.mop {
  height: calc(56px * var(--s));
  padding: 0 calc(20px * var(--s));
  border: 1px solid #d8d8d8;
  border-radius: calc(28px * var(--s));
  background: #fff;
  font-size: calc(24px * var(--s));
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
.mop.score {
  border-color: #bfe0f5;
  background: #f0f8ff;
  color: #3d7fd8;
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
  padding: calc(22px * var(--s)) calc(28px * var(--s));
  margin: calc(16px * var(--s)) 0 calc(20px * var(--s));
}
.sc-label {
  font-size: calc(24px * var(--s));
  color: #6d8a83;
}
.sc-value {
  font-size: calc(46px * var(--s));
  font-weight: 700;
  color: #08a88c;
  margin-top: calc(4px * var(--s));
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
  font-size: calc(30px * var(--s));
  font-weight: 600;
}
.log-sub {
  font-size: calc(22px * var(--s));
  color: #9a9a9c;
  margin-top: calc(6px * var(--s));
}
.log-right { text-align: right; }
.log-amt {
  font-size: calc(34px * var(--s));
  font-weight: 700;
}
.log-amt.plus { color: #08a88c; }
.log-amt.minus { color: #e05a5a; }
.log-after {
  font-size: calc(22px * var(--s));
  color: #9a9a9c;
  margin-top: calc(4px * var(--s));
}

/* 设置表单 */
.c-label {
  font-size: calc(30px * var(--s));
  color: #888;
  margin: calc(24px * var(--s)) 0 calc(12px * var(--s));
}
.c-input {
  width: 100%;
  height: calc(96px * var(--s));
  border: 1px solid #e6e6e6;
  border-radius: calc(16px * var(--s));
  background: #f7f7f8;
  padding: 0 calc(28px * var(--s));
  font-size: calc(34px * var(--s));
  outline: none;
}
.c-confirm {
  width: 100%;
  height: calc(104px * var(--s));
  margin-top: calc(36px * var(--s));
  border: none;
  border-radius: calc(52px * var(--s));
  background: linear-gradient(90deg, #14d3b6, #08c0a0);
  color: #fff;
  font-size: calc(38px * var(--s));
  font-weight: 600;
  cursor: pointer;
}
.av-up {
  display: flex;
  align-items: center;
  gap: calc(24px * var(--s));
  cursor: pointer;
}
.av-box {
  width: calc(110px * var(--s));
  height: calc(110px * var(--s));
  border-radius: calc(24px * var(--s));
  background: #f0f2f1;
  border: calc(3px * var(--s)) dashed #cfd6d2;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex: none;
}
.av-box img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.av-plus {
  font-size: calc(52px * var(--s));
  color: #b0bab4;
}
.av-hint {
  font-size: calc(28px * var(--s));
  color: #8a9a93;
}
.av-file { display: none; }
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

/* 居中弹窗 */
.create-mask {
  position: absolute;
  inset: 0;
  z-index: 96;
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
.c-err {
  margin-top: calc(20px * var(--s));
  color: #e05a5a;
  font-size: calc(30px * var(--s));
}
.c-opts {
  display: flex;
  flex-wrap: wrap;
  gap: calc(16px * var(--s));
  margin-bottom: calc(20px * var(--s));
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
</style>
