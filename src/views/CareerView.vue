<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import HallBottomBar from '../components/HallBottomBar.vue'
import HallTopBar from '../components/HallTopBar.vue'
import PullRefresh from '../components/PullRefresh.vue'
import { getLoginInfo, myRecordsFlow } from '../net/session.js'
import { formatKNotation } from '../utils/format'

// 生涯 tab:我的完赛记录(411/471,周期/站起结算),与大厅"战绩"弹窗同数据源
const router = useRouter()

const loading = ref(false)
const data = ref({ records: [], stats: {} })
const errMsg = ref('')
const REASON_TXT = { period: '周期结算', standup: '站起', leave: '离房', buyin_timeout: '超时站起' }

// 分页:limit 递增重拉(后端按 id 倒序,cap 500);拉满 limit 说明可能还有下一页
const PAGE = 20
const limit = ref(PAGE)
const hasMore = ref(false)
const loadingMore = ref(false)

async function loadRecords() {
  try {
    errMsg.value = ''
    const d = await myRecordsFlow(limit.value)
    data.value = d
    hasMore.value = (d.records || []).length >= limit.value && limit.value < 500
  } catch (e) {
    errMsg.value = e.message || '战绩加载失败'
  }
}
async function refresh() {
  limit.value = PAGE
  await loadRecords()
}
async function loadMore() {
  if (loadingMore.value || !hasMore.value) return
  loadingMore.value = true
  limit.value += PAGE
  try { await loadRecords() } finally { loadingMore.value = false }
}

onMounted(async () => {
  if (!getLoginInfo()) { router.replace('/login'); return }
  loading.value = true
  try { await loadRecords() } finally { loading.value = false }
})

function recTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const p2 = (n) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${p2(d.getHours())}:${p2(d.getMinutes())}`
}
function signed(n) {
  return (n > 0 ? '+' : '') + formatKNotation(n || 0)
}
</script>

<template>
  <div class="stage-root career">
    <HallTopBar />

    <PullRefresh class="cr-body" :on-refresh="refresh">
      <div class="cr-stats" v-if="data.stats && data.stats.sessions > 0">
        <div class="cs-item"><span>场次</span><b>{{ data.stats.sessions }}</b></div>
        <div class="cs-item"><span>总手数</span><b>{{ data.stats.totalHands }}</b></div>
        <div class="cs-item">
          <span>总盈亏</span>
          <b :class="{ win: data.stats.totalProfit > 0, lose: data.stats.totalProfit < 0 }">
            {{ signed(data.stats.totalProfit) }}
          </b>
        </div>
      </div>

      <div v-if="loading" class="cr-empty">加载中…</div>
      <div v-else-if="errMsg" class="cr-empty">{{ errMsg }}</div>
      <template v-else>
        <div class="cr-item" v-for="(r, i) in data.records" :key="i">
          <div class="ci-l">
            <div class="ci-name">{{ r.roomName || '#' + r.roomId }}</div>
            <div class="ci-sub">{{ REASON_TXT[r.reason] || r.reason }} · {{ r.handCount }}手({{ r.winCount }}胜{{ r.loseCount }}负) · {{ recTime(r.time) }}</div>
          </div>
          <div class="ci-r" :class="{ win: r.profit > 0, lose: r.profit < 0 }">{{ signed(r.profit) }}</div>
        </div>
        <div v-if="data.records.length === 0" class="cr-empty">还没有完赛记录,打一局吧</div>
        <div v-else-if="hasMore" class="cr-more" @click="loadMore">{{ loadingMore ? '加载中…' : '加载更多' }}</div>
        <div v-else class="cr-nomore">没有更多了</div>
      </template>
    </PullRefresh>

    <HallBottomBar active="career" />
  </div>
</template>

<style scoped>
.career {
  background: #fff8f9;
  color: #2b2b2d;
}
.cr-body {
  position: absolute;
  top: calc(190px * var(--s) + var(--sat, 0px));
  left: 0;
  width: 100%;
  bottom: calc(250px * var(--s) + var(--sab, 0px));
  overflow-y: auto;
  padding: calc(10px * var(--s)) calc(32px * var(--s));
}
.cr-stats {
  display: flex;
  gap: calc(16px * var(--s));
  margin-bottom: calc(24px * var(--s));
}
.cs-item {
  flex: 1;
  background: #fff;
  border-radius: calc(20px * var(--s));
  box-shadow: 0 calc(4px * var(--s)) calc(16px * var(--s)) rgba(0, 0, 0, 0.05);
  padding: calc(24px * var(--s)) 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: calc(8px * var(--s));
}
.cs-item span {
  font-size: calc(28px * var(--s));
  color: #999;
}
.cs-item b {
  font-size: calc(40px * var(--s));
}
.cr-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  border-radius: calc(20px * var(--s));
  box-shadow: 0 calc(4px * var(--s)) calc(16px * var(--s)) rgba(0, 0, 0, 0.05);
  padding: calc(28px * var(--s)) calc(32px * var(--s));
  margin-bottom: calc(18px * var(--s));
}
.ci-name {
  font-size: calc(36px * var(--s));
  font-weight: 600;
}
.ci-sub {
  font-size: calc(28px * var(--s));
  color: #9a9a9c;
  margin-top: calc(8px * var(--s));
}
.ci-r {
  font-size: calc(40px * var(--s));
  font-weight: 700;
  color: #666;
}
.win {
  color: #0aa06e;
}
.lose {
  color: #e05a5a;
}
.cr-empty {
  text-align: center;
  color: #9a9a9c;
  font-size: calc(34px * var(--s));
  padding: calc(100px * var(--s)) 0;
}
.cr-more {
  text-align: center;
  color: #08a88c;
  font-size: calc(30px * var(--s));
  padding: calc(24px * var(--s)) 0 calc(40px * var(--s));
  cursor: pointer;
}
.cr-nomore {
  text-align: center;
  color: #c0c6c3;
  font-size: calc(28px * var(--s));
  padding: calc(24px * var(--s)) 0 calc(40px * var(--s));
}
</style>
