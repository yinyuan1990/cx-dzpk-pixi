<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import HallBottomBar from '../components/HallBottomBar.vue'
import HallTopBar from '../components/HallTopBar.vue'
import PullRefresh from '../components/PullRefresh.vue'
import {
  clubListFlow, clubCreateFlow, clubApplyFlow,
  getLoginInfo, onClubNotify, uploadImageFlow,
} from '../net/session.js'
import { compressAvatar } from '../utils/imageCompress.js'
import { useGameStore } from '../stores/game.js'

// 好友局页(对齐扯旋 FriendGameRoomHome 布局):
//   TopArea(创建牌局/加入牌局/俱乐部卡) → middleArea(钻石小游戏/钻石大厅) →
//   俱乐部列表(我创建的 / 我加入的,数据 421 CLUB_LIST)。
const router = useRouter()
const { t } = useI18n()
const game = useGameStore()

const ROLE_TXT = { 1: '成员', 2: '管理员', 3: '群主', 4: '合伙人' }

const clubs = ref([])
const loading = ref(false)
const errMsg = ref('')
const okMsg = ref('')

function toast(msg, ok = true) {
  if (ok) { okMsg.value = msg; setTimeout(() => { okMsg.value = '' }, 4000) }
  else { errMsg.value = msg; setTimeout(() => { errMsg.value = '' }, 4000) }
}

// 我创建的 = 我是群主;我加入的 = 其它角色
const myCreated = computed(() => clubs.value.filter((c) => Number(c.myRole) === 3))
const myJoined = computed(() => clubs.value.filter((c) => Number(c.myRole) !== 3))

async function loadClubs() {
  loading.value = true
  try {
    clubs.value = await clubListFlow()
  } catch (e) {
    toast(e.message || '加载俱乐部失败', false)
  } finally {
    loading.value = false
  }
}

let offNotify = null
onMounted(() => {
  if (!getLoginInfo()) { router.replace('/login'); return }
  loadClubs()
  offNotify = onClubNotify((d) => {
    toast(d.approve ? `已加入俱乐部「${d.clubName}」` : `俱乐部「${d.clubName}」拒绝了你的申请`)
    if (d.approve) loadClubs()
  })
})
onBeforeUnmount(() => { if (offNotify) offNotify() })

function openClub(c) {
  router.push('/club/' + c.clubId)
}

const diamondGamesOnline = ref(0)
const diamondHallOnline = ref(0)

// ===== 创建牌局:先选俱乐部(仅群主/管理员可建) =====
const showPickClub = ref(false)
const manageableClubs = computed(() => clubs.value.filter((c) => c.myRole === 3 || c.myRole === 2))
function onCreateGame() {
  if (manageableClubs.value.length === 0) {
    toast('先创建一个俱乐部(或成为管理员)才能开牌局', false)
    return
  }
  if (manageableClubs.value.length === 1) {
    const c = manageableClubs.value[0]
    router.push({ path: `/create-room/${c.clubId}`, query: { clubName: c.name } })
    return
  }
  showPickClub.value = true
}
function pickClub(c) {
  showPickClub.value = false
  router.push({ path: `/create-room/${c.clubId}`, query: { clubName: c.name } })
}

// ===== 加入牌局:输房间号直接进桌(快照会补齐盲注/名称) =====
const showJoinRoom = ref(false)
const joinRoomId = ref('')
function onJoinRoom() {
  const id = Number(joinRoomId.value)
  if (!id) { toast('请输入房间号', false); return }
  showJoinRoom.value = false
  joinRoomId.value = ''
  game.setEnterTarget({ roomId: id, name: '#' + id })
  router.push('/table/' + id)
}

// ===== 创建俱乐部(名称+简介+头像,对齐扯旋;头像压缩后 MinIO 直传) =====
const showCreate = ref(false)
const creating = ref(false)
const createForm = ref({ name: '', remark: '', avatar: '' })
const avatarBusy = ref(false)
const clubFileInput = ref(null)
async function onPickClubAvatar(e) {
  const file = e.target.files && e.target.files[0]
  e.target.value = ''
  if (!file || avatarBusy.value) return
  avatarBusy.value = true
  try {
    const blob = await compressAvatar(file)
    createForm.value.avatar = await uploadImageFlow(blob, 'avatar', 'club.jpg')
  } catch (err) {
    toast(err.message || '头像上传失败', false)
  } finally {
    avatarBusy.value = false
  }
}
async function onCreate() {
  if (creating.value) return
  const f = createForm.value
  if (!f.avatar) { toast('请上传俱乐部头像', false); return }
  if (!f.name.trim()) { toast('请输入俱乐部名称', false); return }
  if (!f.remark.trim()) { toast('请输入俱乐部简介', false); return }
  creating.value = true
  try {
    const res = await clubCreateFlow({ name: f.name.trim(), remark: f.remark.trim(), avatar: f.avatar })
    showCreate.value = false
    createForm.value = { name: '', remark: '', avatar: '' }
    toast(`俱乐部创建成功,编号 ${res.clubNo}`)
    await loadClubs()
  } catch (e) {
    toast(e.message || '创建失败', false)
  } finally {
    creating.value = false
  }
}

// ===== 申请加入俱乐部 =====
const showApply = ref(false)
const applying = ref(false)
const applyCode = ref('')
async function onApply() {
  if (applying.value) return
  const code = applyCode.value.trim()
  if (!/^\d{6}$/.test(code)) { toast('请输入 6 位俱乐部号或邀请码', false); return }
  applying.value = true
  try {
    const res = await clubApplyFlow(code)
    showApply.value = false
    applyCode.value = ''
    toast(`已申请加入「${res.clubName}」,等待审批`)
  } catch (e) {
    toast(e.message || '申请失败', false)
  } finally {
    applying.value = false
  }
}
</script>

<template>
  <div class="stage-root friend">
    <!-- 顶部公用栏:头像/昵称/6位ID + 钻石/消息/分享 -->
    <HallTopBar />

    <PullRefresh class="main" :on-refresh="loadClubs">
      <!-- TopArea:创建牌局 / 加入牌局 / 俱乐部(右侧高卡) -->
      <div class="toparea">
        <button class="card createRoom" @click="onCreateGame">
          <div class="card-text">
            <div class="card-title">{{ t('friend.create') }}</div>
            <div class="card-sub">{{ t('friend.createTip') }}</div>
          </div>
        </button>

        <button class="card joinGame" @click="showJoinRoom = true">
          <div class="card-text">
            <div class="card-title">{{ t('friend.join') }}</div>
            <div class="card-sub">{{ t('friend.joinTip') }}</div>
          </div>
        </button>

        <button class="card ndClub">
          <div class="card-title club">{{ t('friend.club') }}</div>
          <div class="card-sub club">{{ t('friend.clubTip') }}</div>
          <div class="club-btns">
            <span class="club-btn ghost" @click.stop="showCreate = true">{{ t('friend.clubCreate') }}</span>
            <span class="club-btn solid" @click.stop="showApply = true">{{ t('friend.clubJoin') }}</span>
          </div>
        </button>
      </div>

      <!-- middleArea:钻石小游戏 / 钻石大厅 -->
      <div class="middlearea">
        <button class="dcard">
          <div class="dc-top">
            <span class="dc-title">{{ t('friend.diamondGames') }}</span>
            <span class="dc-arrow">&#8250;</span>
          </div>
          <div class="dc-bottom">
            <span class="dc-online"><b>{{ diamondGamesOnline }}</b> {{ t('friend.online') }}</span>
          </div>
        </button>
        <button class="dcard">
          <div class="dc-top">
            <span class="dc-title">{{ t('friend.diamondHall') }}</span>
            <span class="dc-arrow">&#8250;</span>
          </div>
          <div class="dc-bottom">
            <span class="dc-online"><b>{{ diamondHallOnline }}</b> {{ t('friend.online') }}</span>
          </div>
        </button>
      </div>

      <div v-if="okMsg" class="okbar">{{ okMsg }}</div>
      <div v-if="errMsg" class="errbar">{{ errMsg }}</div>

      <!-- 俱乐部列表(对齐扯旋 getAllMyClubs;分「我创建的/我加入的」) -->
      <div class="clublist">
        <template v-if="myCreated.length">
          <div class="sec-title">我创建的</div>
          <div class="citem" v-for="c in myCreated" :key="c.clubId" @click="openClub(c)">
            <img v-if="c.avatar" :src="c.avatar" class="cbadge cbadge-img" />
            <div v-else class="cbadge">{{ (c.name || '?')[0] }}</div>
            <div class="cmid">
              <div class="crow1">
                <span class="cname">{{ c.name }}</span>
                <span class="cno">({{ c.clubNo }})</span>
                <span class="crole r3">群主</span>
              </div>
              <div class="cremark">简介:{{ c.remark || '—' }}</div>
              <div class="crow2">
                <span class="ccnt">{{ c.memberCount }} 人</span>
                <span v-if="c.pendingCount > 0" class="cpending">{{ c.pendingCount }} 条申请待审</span>
              </div>
            </div>
            <div class="carrow">&#8250;</div>
          </div>
        </template>

        <template v-if="myJoined.length">
          <div class="sec-title">我加入的</div>
          <div class="citem" v-for="c in myJoined" :key="c.clubId" @click="openClub(c)">
            <img v-if="c.avatar" :src="c.avatar" class="cbadge cbadge-img" />
            <div v-else class="cbadge">{{ (c.name || '?')[0] }}</div>
            <div class="cmid">
              <div class="crow1">
                <span class="cname">{{ c.name }}</span>
                <span class="cno">({{ c.clubNo }})</span>
                <span class="crole" :class="'r' + c.myRole">{{ ROLE_TXT[c.myRole] || '成员' }}</span>
              </div>
              <div class="cremark">简介:{{ c.remark || '—' }}</div>
              <div class="crow2">
                <span class="ccnt">{{ c.memberCount }} 人</span>
                <span v-if="c.pendingCount > 0" class="cpending">{{ c.pendingCount }} 条申请待审</span>
              </div>
            </div>
            <div class="carrow">&#8250;</div>
          </div>
        </template>

        <div v-if="!loading && clubs.length === 0" class="cempty">
          还没有俱乐部<br />点上方「创建俱乐部」,或输入俱乐部号/邀请码申请加入
        </div>
      </div>
    </PullRefresh>

    <!-- 选俱乐部弹窗(创建牌局用) -->
    <div v-if="showPickClub" class="create-mask" @click.self="showPickClub = false">
      <div class="create-box">
        <div class="c-title">选择俱乐部开局</div>
        <div class="pick-item" v-for="c in manageableClubs" :key="c.clubId" @click="pickClub(c)">
          <img v-if="c.avatar" :src="c.avatar" class="pick-av" />
          <span class="pick-name">{{ c.name }}</span>
          <span class="pick-no">({{ c.clubNo }})</span>
        </div>
      </div>
    </div>

    <!-- 加入牌局弹窗 -->
    <div v-if="showJoinRoom" class="create-mask" @click.self="showJoinRoom = false">
      <div class="create-box">
        <div class="c-title">加入牌局</div>
        <div class="c-label">房间号</div>
        <input v-model="joinRoomId" class="c-input" placeholder="输入房间号" inputmode="numeric" @keyup.enter="onJoinRoom" />
        <button class="c-confirm" @click="onJoinRoom">进入</button>
      </div>
    </div>

    <!-- 创建俱乐部弹窗 -->
    <div v-if="showCreate" class="create-mask" @click.self="showCreate = false">
      <div class="create-box">
        <div class="c-title">创建俱乐部</div>
        <div class="c-label">头像(必传,自动压缩)</div>
        <div class="av-up" @click="clubFileInput && clubFileInput.click()">
          <div class="av-box">
            <img v-if="createForm.avatar" :src="createForm.avatar" alt="" />
            <span v-else class="av-plus">+</span>
          </div>
          <span class="av-hint">{{ avatarBusy ? '上传中…' : createForm.avatar ? '点击更换' : '选择图片' }}</span>
          <input ref="clubFileInput" type="file" accept="image/*" class="av-file" @change="onPickClubAvatar" />
        </div>
        <div class="c-label">名称(最长 4 个汉字,不能纯数字)</div>
        <input v-model="createForm.name" class="c-input" placeholder="俱乐部名称" maxlength="8" />
        <div class="c-label">简介(必填)</div>
        <input v-model="createForm.remark" class="c-input" placeholder="一句话介绍你的俱乐部" maxlength="100" />
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
        <input v-model="applyCode" class="c-input" placeholder="6 位数字" maxlength="6" inputmode="numeric" @keyup.enter="onApply" />
        <div v-if="errMsg" class="c-err">{{ errMsg }}</div>
        <button class="c-confirm" :disabled="applying" @click="onApply">
          {{ applying ? '提交中…' : '提交申请' }}
        </button>
      </div>
    </div>

    <HallBottomBar active="friend" />
  </div>
</template>

<style scoped>
.friend {
  background: #fff6f2;
  color: #2b2b2d;
}

/* mainInfo 滚动主体(顶部让位给公用顶栏 180px) */
.main {
  position: absolute;
  top: calc(190px * var(--s) + var(--sat, 0px));
  left: 0;
  width: 100%;
  bottom: calc(250px * var(--s) + var(--sab, 0px));
  overflow-y: auto;
  padding: calc(30px * var(--s)) calc(40px * var(--s));
}

/* TopArea:3 卡(左两叠 + 右高卡) */
.toparea {
  display: grid;
  grid-template-columns: calc(510px * var(--s)) calc(470px * var(--s));
  grid-template-rows: calc(213px * var(--s)) calc(213px * var(--s));
  gap: calc(11px * var(--s)) calc(20px * var(--s));
}
.card {
  border: none;
  border-radius: calc(24px * var(--s));
  cursor: pointer;
  text-align: left;
  color: #fff;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: calc(34px * var(--s)) calc(36px * var(--s));
  background-size: 100% 100%;
  background-repeat: no-repeat;
  background-position: center;
}
.createRoom {
  grid-column: 1;
  grid-row: 1;
  background-image: url(/assets/hall/card_create.png);
  color: #0a6b45;
}
.joinGame {
  grid-column: 1;
  grid-row: 2;
  background-image: url(/assets/hall/card_join.png);
  color: #0a6b45;
}
.ndClub {
  grid-column: 2;
  grid-row: 1 / span 2;
  background-image: url(/assets/hall/card_club.png);
  justify-content: flex-start;
  color: #7a521d;
  padding-left: calc(56px * var(--s));
}
.createRoom .card-text,
.joinGame .card-text {
  max-width: calc(300px * var(--s));
}
.card-title {
  font-size: calc(48px * var(--s));
  font-weight: 800;
  letter-spacing: calc(1px * var(--s));
}
.card-sub {
  margin-top: calc(10px * var(--s));
  font-size: calc(26px * var(--s));
  font-weight: 500;
  opacity: 0.85;
}
.card-title.club {
  margin-top: calc(4px * var(--s));
  font-size: calc(46px * var(--s));
  color: #7a521d;
}
.card-sub.club {
  color: #9a7b4a;
  opacity: 1;
  max-width: calc(240px * var(--s));
  font-size: calc(25px * var(--s));
  line-height: 1.35;
  white-space: pre-line;
}
.club-btns {
  position: absolute;
  left: calc(36px * var(--s));
  right: calc(36px * var(--s));
  bottom: calc(30px * var(--s));
  display: flex;
  gap: calc(18px * var(--s));
}
.club-btn {
  flex: 1;
  text-align: center;
  height: calc(76px * var(--s));
  line-height: calc(76px * var(--s));
  border-radius: calc(38px * var(--s));
  font-size: calc(32px * var(--s));
  font-weight: 600;
}
.club-btn.ghost {
  background: #ffffff;
  border: calc(2px * var(--s)) solid #e8a23d;
  color: #c9821f;
}
.club-btn.solid {
  background: linear-gradient(135deg, #ffb13d, #f7901e);
  color: #fff;
}

/* middleArea:2 钻石卡 */
.middlearea {
  margin-top: calc(30px * var(--s));
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: calc(20px * var(--s));
}
.dcard {
  height: calc(181px * var(--s));
  border: none;
  border-radius: calc(24px * var(--s));
  background: #fff;
  box-shadow: 0 calc(4px * var(--s)) calc(16px * var(--s)) rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: calc(30px * var(--s)) calc(30px * var(--s));
  cursor: pointer;
  position: relative;
  overflow: hidden;
}
.dc-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.dc-title {
  font-size: calc(38px * var(--s));
  font-weight: 700;
  color: #2b2b2d;
}
.dc-arrow {
  font-size: calc(40px * var(--s));
  line-height: 1;
  color: #c2c2c4;
  font-weight: 400;
}
.dc-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.dc-online {
  font-size: calc(26px * var(--s));
  color: #9a9a9c;
}
.dc-online b {
  font-size: calc(30px * var(--s));
  font-weight: 700;
  color: #f5463f;
  margin-right: calc(6px * var(--s));
}

/* 提示条 */
.okbar,
.errbar {
  margin-top: calc(24px * var(--s));
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

/* 俱乐部列表 */
.clublist {
  margin-top: calc(30px * var(--s));
}
.sec-title {
  font-size: calc(36px * var(--s));
  font-weight: 700;
  color: #2b2b2d;
  margin: calc(24px * var(--s)) 0 calc(16px * var(--s));
}
.citem {
  display: flex;
  align-items: center;
  gap: calc(28px * var(--s));
  min-height: calc(180px * var(--s));
  margin-bottom: calc(20px * var(--s));
  border-radius: calc(24px * var(--s));
  background: #fff;
  box-shadow: 0 calc(4px * var(--s)) calc(16px * var(--s)) rgba(0, 0, 0, 0.05);
  padding: calc(24px * var(--s)) calc(32px * var(--s));
  cursor: pointer;
}
.cbadge {
  width: calc(110px * var(--s));
  height: calc(110px * var(--s));
  border-radius: calc(26px * var(--s));
  background: linear-gradient(135deg, #14d3b6, #08c0a0);
  color: #fff;
  font-size: calc(50px * var(--s));
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
.cbadge-img {
  object-fit: cover;
}
.cmid {
  flex: 1;
  min-width: 0;
}
.crow1 {
  display: flex;
  align-items: center;
  gap: calc(14px * var(--s));
}
.cname {
  font-size: calc(42px * var(--s));
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cno {
  font-size: calc(28px * var(--s));
  color: #b0b0b0;
}
.crole {
  padding: calc(3px * var(--s)) calc(16px * var(--s));
  border-radius: 999px;
  font-size: calc(24px * var(--s));
  background: #f0f0f0;
  color: #777;
}
.crole.r3 {
  background: #e8faf5;
  color: #08a88c;
}
.crole.r2 {
  background: #f3e8ff;
  color: #9a55e0;
}
.crole.r4 {
  background: #fff3dd;
  color: #d29018;
}
.cremark {
  font-size: calc(26px * var(--s));
  color: #9a9a9c;
  margin-top: calc(8px * var(--s));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.crow2 {
  display: flex;
  align-items: center;
  gap: calc(20px * var(--s));
  margin-top: calc(10px * var(--s));
  font-size: calc(26px * var(--s));
  color: #888;
}
.cpending {
  color: #e08a3a;
  font-weight: 600;
}
.carrow {
  font-size: calc(52px * var(--s));
  color: #ccc;
  flex: none;
}
.cempty {
  text-align: center;
  color: #9a9a9c;
  font-size: calc(32px * var(--s));
  line-height: 1.8;
  padding: calc(100px * var(--s)) 0;
}

/* 弹窗 */
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
.pick-item {
  display: flex;
  align-items: center;
  gap: calc(20px * var(--s));
  padding: calc(24px * var(--s)) calc(12px * var(--s));
  border-bottom: 1px solid #f0f0f0;
  cursor: pointer;
}
.pick-av {
  width: calc(80px * var(--s));
  height: calc(80px * var(--s));
  border-radius: calc(18px * var(--s));
  object-fit: cover;
}
.pick-name {
  font-size: calc(38px * var(--s));
  font-weight: 600;
}
.pick-no {
  font-size: calc(28px * var(--s));
  color: #b0b0b0;
}

/* 头像上传 */
.av-up {
  display: flex;
  align-items: center;
  gap: calc(24px * var(--s));
  cursor: pointer;
}
.av-box {
  width: calc(120px * var(--s));
  height: calc(120px * var(--s));
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
  font-size: calc(56px * var(--s));
  color: #b0bab4;
}
.av-hint {
  font-size: calc(30px * var(--s));
  color: #8a9a93;
}
.av-file {
  display: none;
}
</style>
