<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useGameStore } from '../stores/game.js'
import { appConfigFlow, clubApplyListFlow, clubReviewFlow, getLoginInfo, onClubNotify } from '../net/session.js'
import PullRefresh from './PullRefresh.vue'
import iconZuanshi from '../assets/icon_zuanshi.png'

// 5 个 tab 页公用顶栏:左 = 头像/昵称/6位ID,右 = 钻石 + 消息(俱乐部待审,红点) + 分享。
// 消息对齐扯旋:大厅 AT_NoticeBtn + CLUB_JOIN 红点 → ClubNoticePanel(聚合全部俱乐部待审)。
const game = useGameStore()

const tip = ref('')
let tipTimer = null
function showTip(text) {
  tip.value = text
  clearTimeout(tipTimer)
  tipTimer = setTimeout(() => { tip.value = '' }, 2000)
}

// ===== 分享 =====
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

// ===== 消息(俱乐部待审申请;clubId=0 聚合我管理的全部俱乐部) =====
const showNotice = ref(false)
const notices = ref([])
const noticeCount = ref(0)
const noticeLoading = ref(false)

async function refreshNoticeCount() {
  if (!getLoginInfo()) return
  try {
    const list = await clubApplyListFlow(0)
    noticeCount.value = list.length
    if (showNotice.value) notices.value = list
  } catch { /* 静默:非管理员/未登录不打扰 */ }
}
async function openNotice() {
  showNotice.value = true
  noticeLoading.value = true
  try {
    notices.value = await clubApplyListFlow(0)
    noticeCount.value = notices.value.length
  } catch (e) {
    showTip(e.message || '消息加载失败')
  } finally {
    noticeLoading.value = false
  }
}
async function review(r, approve) {
  try {
    await clubReviewFlow({ clubId: r.clubId, requestId: r.requestId, approve })
    notices.value = notices.value.filter((x) => x.requestId !== r.requestId)
    noticeCount.value = notices.value.length
    showTip(approve ? `已同意「${r.nickname}」加入` : '已拒绝')
  } catch (e) {
    showTip(e.message || '审批失败')
  }
}
async function refreshNotices() {
  try {
    notices.value = await clubApplyListFlow(0)
    noticeCount.value = notices.value.length
  } catch (e) {
    showTip(e.message || '消息加载失败')
  }
}
function fmtTime(ts) {
  const d = new Date(ts)
  const p2 = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`
}

let offNotify = null
onMounted(() => {
  refreshNoticeCount()
  // 有推送(审批结果/新申请)时刷新红点
  offNotify = onClubNotify(() => refreshNoticeCount())
})
onBeforeUnmount(() => { if (offNotify) offNotify() })
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
        <img class="tb-gem" :src="iconZuanshi" alt="钻石" />
        <span class="tb-cnt">{{ game.user.idou }}</span>
      </div>
      <button class="tb-bell" @click="openNotice" aria-label="消息">
        <span class="bell-ic">&#128276;</span>
        <span v-if="noticeCount > 0" class="bell-dot">{{ noticeCount > 99 ? '99+' : noticeCount }}</span>
      </button>
      <button class="tb-share" :disabled="sharing" @click="onShare">分享</button>
    </div>
    <div v-if="tip" class="tb-tip">{{ tip }}</div>

    <!-- 消息底部弹框(对齐扯旋 ClubNoticePanel:待审申请,同意/拒绝) -->
    <div v-if="showNotice" class="ntc-mask" @click.self="showNotice = false">
      <div class="ntc-sheet">
        <div class="ntc-bar"></div>
        <div class="ntc-title">俱乐部消息</div>
        <PullRefresh class="ntc-body" :on-refresh="refreshNotices">
          <div v-if="noticeLoading" class="ntc-empty">加载中…</div>
          <template v-else>
            <div class="ntc-item" v-for="r in notices" :key="r.requestId">
              <div class="ni-left">
                <div class="ni-name">{{ r.nickname }}<span class="ni-tag">玩家申请</span></div>
                <div class="ni-sub">ID:{{ r.userId }} · 申请加入「{{ r.clubName }}」</div>
                <div class="ni-time">{{ fmtTime(r.time) }}</div>
              </div>
              <div class="ni-btns">
                <button class="ni-btn ok" @click="review(r, true)">同意</button>
                <button class="ni-btn no" @click="review(r, false)">拒绝</button>
              </div>
            </div>
            <div v-if="notices.length === 0" class="ntc-empty">暂无待处理消息</div>
          </template>
        </PullRefresh>
      </div>
    </div>
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
  width: calc(40px * var(--s));
  height: calc(40px * var(--s));
  object-fit: contain;
}
.tb-cnt {
  font-size: calc(32px * var(--s));
  font-weight: 600;
  color: #2b2b2d;
}
.tb-bell {
  position: relative;
  width: calc(64px * var(--s));
  height: calc(64px * var(--s));
  border: none;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 calc(2px * var(--s)) calc(8px * var(--s)) rgba(0, 0, 0, 0.06);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.bell-ic {
  font-size: calc(34px * var(--s));
  line-height: 1;
}
.bell-dot {
  position: absolute;
  top: calc(-8px * var(--s));
  right: calc(-10px * var(--s));
  min-width: calc(38px * var(--s));
  height: calc(38px * var(--s));
  line-height: calc(38px * var(--s));
  padding: 0 calc(8px * var(--s));
  border-radius: 999px;
  background: #f5463f;
  color: #fff;
  font-size: calc(22px * var(--s));
  font-weight: 600;
  text-align: center;
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
  z-index: 120;
}

/* 消息弹框 */
.ntc-mask {
  position: fixed;
  inset: 0;
  z-index: 110;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.ntc-sheet {
  width: 100%;
  max-width: calc(1080px * var(--s));
  max-height: 70%;
  background: #fff;
  border-radius: calc(36px * var(--s)) calc(36px * var(--s)) 0 0;
  padding: calc(16px * var(--s)) calc(36px * var(--s)) calc(40px * var(--s));
  display: flex;
  flex-direction: column;
}
.ntc-bar {
  width: calc(90px * var(--s));
  height: calc(10px * var(--s));
  border-radius: 999px;
  background: #e4e4e6;
  margin: 0 auto calc(20px * var(--s));
  flex: none;
}
.ntc-title {
  font-size: calc(42px * var(--s));
  font-weight: 700;
  color: #2b2b2d;
  flex: none;
}
.ntc-body {
  flex: 1;
  overflow-y: auto;
  margin-top: calc(16px * var(--s));
}
.ntc-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(16px * var(--s));
  padding: calc(24px * var(--s)) calc(8px * var(--s));
  border-bottom: 1px solid #f0f0f0;
}
.ni-left {
  min-width: 0;
}
.ni-name {
  font-size: calc(34px * var(--s));
  font-weight: 600;
  color: #2b2b2d;
  display: flex;
  align-items: center;
  gap: calc(12px * var(--s));
}
.ni-tag {
  padding: calc(2px * var(--s)) calc(14px * var(--s));
  border-radius: 999px;
  font-size: calc(22px * var(--s));
  background: #eafcf7;
  color: #08a88c;
  font-weight: 400;
}
.ni-sub {
  font-size: calc(26px * var(--s));
  color: #6b6b6d;
  margin-top: calc(8px * var(--s));
}
.ni-time {
  font-size: calc(22px * var(--s));
  color: #b0b0b2;
  margin-top: calc(6px * var(--s));
}
.ni-btns {
  display: flex;
  gap: calc(14px * var(--s));
  flex: none;
}
.ni-btn {
  height: calc(64px * var(--s));
  padding: 0 calc(30px * var(--s));
  border: none;
  border-radius: calc(32px * var(--s));
  font-size: calc(28px * var(--s));
  font-weight: 600;
  cursor: pointer;
}
.ni-btn.ok {
  background: linear-gradient(90deg, #14d3b6, #08c0a0);
  color: #fff;
}
.ni-btn.no {
  background: #f5f5f6;
  color: #888;
}
.ntc-empty {
  text-align: center;
  color: #9a9a9c;
  font-size: calc(32px * var(--s));
  padding: calc(80px * var(--s)) 0;
}
</style>
