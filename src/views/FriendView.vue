<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import HallBottomBar from '../components/HallBottomBar.vue'

// 1:1 结构还原自 98modules/friendGame/FriendGameRoomHome.prefab + 控制器 index.js。
// 真实结构：topheadContainer(顶部栏) -> TopArea(3 操作卡) -> middleArea(2 钻石卡) ->
//           DownArea(筛选 tab + 世界杯活动 Banner + 牌局列表项)。底栏沿用 HallBottomBar。
const router = useRouter()
const { t } = useI18n()

const activeTab = ref('friend')
function onTab(key) {
  // 已实现的 Tab 才跳转；未建页面(game/career/profile)暂留当前
  if (key === 'hall') router.push('/hall')
  else if (key === 'friend') activeTab.value = 'friend'
}

// GameTypeList 筛选 chip：全部 + 密码局（本期静态两项）。
const filters = [
  { key: 'all', label: () => t('friend.filterAll') },
  { key: 'pwd', label: () => t('friend.filterPwd') },
]
const activeFilter = ref('all')

// 牌局列表(lv_gamblingList)：真实来自 /hall/getRoomRecordByCreateView。
// 结构 1:1 还原 FriendGameRoomListItem。本期放 2 条假数据用于还原布局。
const rooms = ref([
  {
    id: 1,
    master: '踢桃2',
    avatar: 'linear-gradient(135deg,#8ec5ff,#5b8def)',
    roomName: '踢桃2的牌局',
    tags: [
      { text: '暴击', type: 'boom' },
      { text: '德州', type: 'type' },
    ],
    grade: '1/2',
    time: '8h',
    person: '0/9',
    played: true,
  },
  {
    id: 2,
    master: '老王ALLIN',
    avatar: 'linear-gradient(135deg,#ffd27f,#f7901e)',
    roomName: '老王的欢乐局',
    tags: [{ text: '德州', type: 'type' }],
    grade: '2/4',
    time: '3h',
    person: '5/9',
    played: false,
  },
])

// 俱乐部钻石卡：showPKWorClub() 控制是否显示，这里默认展示以还原完整布局。
const diamondGamesOnline = ref(0)
const diamondHallOnline = ref(0)

function ShowChooseCreateRoomView() {} // -> FriendGameChooseCreatTypeView
function joinRoom() {} // -> FriendGameInputRoomID
function showClub() {} // -> ./club
function clickCreateClub() {}
function clickJoinClub() {}
function clickFilter() {} // -> FriendGameRoomFilter
function clickWorldCup() {} // -> 世界杯活动
</script>

<template>
  <div class="stage-root friend">
    <!-- topheadContainer：好友页顶部栏(TopHeadInfo · CREATE_ROOM 模式)。
         左=白色圆角胶囊(round_100)内 金币/美元/钻石；右=深色动作图标(分享/体育/客服/消息) -->
    <div class="top">
      <div class="pill">
        <span class="cur"><img src="/assets/hall/top_gold.png" alt="" /><b>1000</b></span>
        <span class="cur"><img src="/assets/hall/top_usd.png" alt="" /><b>1000</b></span>
        <span class="cur"><img src="/assets/hall/top_diamond.png" alt="" /><b>0</b></span>
      </div>
      <div class="top-icons">
        <button class="tbtn"><img src="/assets/hall/top_link.png" alt="" /></button>
        <button class="tbtn sport"><img src="/assets/hall/top_sport.png" alt="" /></button>
        <button class="tbtn"><img src="/assets/hall/top_customer.png" alt="" /></button>
        <button class="tbtn"><img src="/assets/hall/top_message.png" alt="" /></button>
      </div>
    </div>

    <!-- mainInfo：可滚动主体 -->
    <div class="main">
      <!-- TopArea：创建牌局 / 加入牌局 / 俱乐部(右侧高卡) -->
      <div class="toparea">
        <button class="card createRoom" @click="ShowChooseCreateRoomView">
          <div class="card-text">
            <div class="card-title">{{ t('friend.create') }}</div>
            <div class="card-sub">{{ t('friend.createTip') }}</div>
          </div>
        </button>

        <button class="card joinGame" @click="joinRoom">
          <div class="card-text">
            <div class="card-title">{{ t('friend.join') }}</div>
            <div class="card-sub">{{ t('friend.joinTip') }}</div>
          </div>
        </button>

        <button class="card ndClub" @click="showClub">
          <div class="card-title club">{{ t('friend.club') }}</div>
          <div class="card-sub club">{{ t('friend.clubTip') }}</div>
          <div class="club-btns">
            <span class="club-btn ghost" @click.stop="clickCreateClub">{{ t('friend.clubCreate') }}</span>
            <span class="club-btn solid" @click.stop="clickJoinClub">{{ t('friend.clubJoin') }}</span>
          </div>
        </button>
      </div>

      <!-- middleArea：钻石小游戏 / 钻石大厅。1:1 真机：标题+箭头在上，红色在玩数+灰色在玩在下；
           钻石小游戏右下角带世界杯竞猜橙标 -->
      <div class="middlearea">
        <button class="dcard">
          <div class="dc-top">
            <span class="dc-title">{{ t('friend.diamondGames') }}</span>
            <span class="dc-arrow">&#8250;</span>
          </div>
          <div class="dc-bottom">
            <span class="dc-online"><b>{{ diamondGamesOnline }}</b> {{ t('friend.online') }}</span>
            <span class="dc-promo">{{ t('friend.worldCupBet') }}</span>
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

      <!-- DownArea：筛选 chip(tab) + 世界杯活动 Banner(竞猜) + 牌局列表(item) -->
      <div class="downarea">
        <!-- tab：全部(选中=青描边胶囊) / 密码局(未选=浅描边) + 右侧漏斗筛选 -->
        <div class="filterbar">
          <div class="chips">
            <button
              v-for="f in filters"
              :key="f.key"
              class="chip"
              :class="{ on: activeFilter === f.key }"
              @click="activeFilter = f.key"
            ><span class="chip-text" :data-text="f.label()">{{ f.label() }}</span></button>
          </div>
          <button class="filterbtn" @click="clickFilter" aria-label="filter">
            <img src="/assets/hall/filter_icon.png" alt="" />
          </button>
        </div>

        <!-- 竞猜：世界杯专属活动 Banner -->
        <button class="wcbanner" @click="clickWorldCup">
          <span class="wc-trophy">&#127942;</span>
          <div class="wc-text">
            <div class="wc-title">{{ t('friend.wcBannerTitle') }}</div>
            <div class="wc-sub">{{ t('friend.wcBannerSub') }}</div>
          </div>
          <span class="wc-join">{{ t('friend.wcBannerJoin') }}</span>
        </button>

        <!-- item：牌局列表 -->
        <div class="roomlist">
          <div v-if="rooms.length === 0" class="empty">
            <img class="empty-img" src="/assets/hall/friend_empty.png" alt="" />
            <div class="empty-text">{{ t('friend.noResult') }}</div>
          </div>

          <button v-for="r in rooms" :key="r.id" class="room">
            <div class="room-top">
              <i class="room-avatar" :style="{ backgroundImage: r.avatar }"></i>
              <span class="room-master">{{ r.master }}</span>
              <span class="room-tags">
                <span
                  v-for="(tg, i) in r.tags"
                  :key="i"
                  class="rtag"
                  :class="'rtag-' + tg.type"
                >{{ tg.text }}</span>
              </span>
            </div>
            <div class="room-name">{{ r.roomName }}</div>
            <div class="room-stats">
              <span class="rstat">
                <svg class="rs-icon" viewBox="0 0 24 24" fill="#7a7a7c"><ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v5c0 1.66 3.13 3 7 3s7-1.34 7-3V6" fill="none" stroke="#7a7a7c" stroke-width="2"/><path d="M5 11v5c0 1.66 3.13 3 7 3s7-1.34 7-3v-5" fill="none" stroke="#7a7a7c" stroke-width="2"/></svg>
                {{ r.grade }}
              </span>
              <span class="rstat">
                <svg class="rs-icon" viewBox="0 0 24 24" fill="none" stroke="#7a7a7c" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2" stroke-linecap="round"/></svg>
                {{ r.time }}
              </span>
              <span class="rstat rperson">{{ r.person }}</span>
            </div>
            <span v-if="r.played" class="room-played"><i>{{ t('friend.played') }}</i></span>
          </button>
        </div>
      </div>
    </div>

    <HallBottomBar :active="activeTab" @change="onTab" />
  </div>
</template>

<style scoped>
.friend {
  background: #fff6f2;
  color: #2b2b2d;
}

/* topheadContainer 顶部栏（1080×100，widget top=20，左右 margin 40）+ 齐刘海安全区 */
.top {
  position: absolute;
  top: calc(20px * var(--s) + var(--sat, 0px));
  left: 0;
  width: 100%;
  height: calc(100px * var(--s));
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 calc(40px * var(--s));
}
.pill {
  display: flex;
  align-items: center;
  height: calc(100px * var(--s));
  padding: 0 calc(30px * var(--s));
  gap: calc(20px * var(--s));
  background: #ffffff;
  border-radius: calc(50px * var(--s));
}
.cur {
  display: flex;
  align-items: center;
  gap: calc(6px * var(--s));
}
.cur img {
  width: calc(56px * var(--s));
  height: calc(56px * var(--s));
}
.cur b {
  font-size: calc(44px * var(--s));
  font-weight: 600;
  color: #3a3a3a;
}
.top-icons {
  display: flex;
  align-items: center;
  height: calc(100px * var(--s));
  padding: 0 calc(30px * var(--s));
  gap: calc(50px * var(--s));
  background: #ffffff;
  border-radius: calc(50px * var(--s));
}
.tbtn {
  width: calc(56px * var(--s));
  height: calc(56px * var(--s));
  border: none;
  background: transparent;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.tbtn img {
  width: calc(56px * var(--s));
  height: calc(56px * var(--s));
  object-fit: contain;
}
.tbtn.sport img {
  width: calc(35px * var(--s));
}

/* mainInfo 滚动主体 */
.main {
  position: absolute;
  top: calc(150px * var(--s) + var(--sat, 0px));
  left: 0;
  width: 100%;
  bottom: calc(250px * var(--s) + var(--sab, 0px));
  overflow-y: auto;
  padding: calc(30px * var(--s)) calc(40px * var(--s));
}

/* TopArea：3 卡(左两叠 + 右高卡) */
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
/* 创建/加入卡底图左侧是浅薄荷绿，用深绿字保证对比度 */
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

/* middleArea：2 钻石卡 */
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
.dc-promo {
  height: calc(48px * var(--s));
  line-height: calc(48px * var(--s));
  padding: 0 calc(20px * var(--s));
  border-radius: calc(24px * var(--s)) calc(24px * var(--s)) calc(24px * var(--s)) 0;
  background: linear-gradient(135deg, #ffa53d, #f4791b);
  color: #fff;
  font-size: calc(24px * var(--s));
  font-weight: 600;
  white-space: nowrap;
}

/* DownArea */
.downarea {
  margin-top: calc(40px * var(--s));
}
.filterbar {
  display: flex;
  align-items: center;
  gap: calc(20px * var(--s));
  height: calc(92px * var(--s));
}
.chips {
  display: flex;
  gap: calc(20px * var(--s));
  flex: 1;
  overflow-x: auto;
}
/* 真机参考(3.jpg)：两态都是白底胶囊；未选=极浅灰描边灰字，选中=青绿描边青绿字 */
.chip {
  flex: none;
  height: calc(80px * var(--s));
  padding: 0 calc(36px * var(--s));
  border: calc(2px * var(--s)) solid #e7e7e9;
  border-radius: calc(40px * var(--s));
  background: #ffffff;
  color: #9a9a9c;
  font-size: calc(32px * var(--s));
  cursor: pointer;
}
.chip.on {
  background: #ffffff;
  border-color: #08c0a0;
  color: #08c0a0;
  font-weight: 600;
}
/* 幽灵占位：chip 恒按加粗文本预留宽度，选中变粗(600)不改变宽度，相邻 chip 不再位移 */
.chip-text {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
}
.chip-text::after {
  content: attr(data-text);
  height: 0;
  font-weight: 600;
  visibility: hidden;
  overflow: hidden;
  pointer-events: none;
}
/* 漏斗筛选按钮：真值圆角白底(mask sprite #FFF6F4) + 真漏斗图标 filterIconNoPAlpha */
.filterbtn {
  flex: none;
  width: calc(80px * var(--s));
  height: calc(88px * var(--s));
  border: none;
  border-radius: calc(20px * var(--s));
  background: #ffffff;
  box-shadow: 0 calc(3px * var(--s)) calc(10px * var(--s)) rgba(0, 0, 0, 0.05);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.filterbtn img {
  width: calc(44px * var(--s));
  height: calc(44px * var(--s));
  object-fit: contain;
}

/* 竞猜：世界杯活动 Banner */
.wcbanner {
  margin-top: calc(20px * var(--s));
  width: 100%;
  height: calc(150px * var(--s));
  border: none;
  border-radius: calc(24px * var(--s));
  background: linear-gradient(135deg, #e7f7ec, #d8f3e6);
  display: flex;
  align-items: center;
  gap: calc(16px * var(--s));
  padding: 0 calc(24px * var(--s));
  cursor: pointer;
  text-align: left;
}
.wc-trophy {
  flex: none;
  font-size: calc(72px * var(--s));
  line-height: 1;
}
.wc-text {
  flex: 1;
  min-width: 0;
}
.wc-title {
  font-size: calc(34px * var(--s));
  font-weight: 700;
  color: #2b2b2d;
}
.wc-sub {
  margin-top: calc(6px * var(--s));
  font-size: calc(26px * var(--s));
  color: #4aa888;
}
.wc-join {
  flex: none;
  height: calc(76px * var(--s));
  line-height: calc(76px * var(--s));
  padding: 0 calc(30px * var(--s));
  border-radius: calc(38px * var(--s));
  background: linear-gradient(135deg, #2fd39a, #14b07f);
  color: #fff;
  font-size: calc(28px * var(--s));
  font-weight: 600;
  white-space: nowrap;
}

/* item：牌局列表 */
.roomlist {
  margin-top: calc(20px * var(--s));
  display: flex;
  flex-direction: column;
  gap: calc(20px * var(--s));
}
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: calc(160px * var(--s)) 0;
  color: #b3a9ab;
}
.empty-img {
  width: calc(338px * var(--s));
  height: auto;
  display: block;
}
.empty-text {
  margin-top: calc(24px * var(--s));
  font-size: calc(36px * var(--s));
}

/* 牌局列表项 FriendGameRoomListItem(1:1 结构) */
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
}
.room-top {
  display: flex;
  align-items: center;
  gap: calc(14px * var(--s));
}
.room-avatar {
  flex: none;
  width: calc(56px * var(--s));
  height: calc(56px * var(--s));
  border-radius: 50%;
  background-size: cover;
  background-position: center;
}
.room-master {
  font-size: calc(30px * var(--s));
  font-weight: 600;
  color: #2b2b2d;
}
.room-tags {
  margin-left: auto;
  display: flex;
  gap: calc(10px * var(--s));
}
/* 逆向真值：标签底是胶囊(bg_capsule_H54，圆角=半高)，类型色低透明做底 + 同色文字，字号30 */
.rtag {
  height: calc(50px * var(--s));
  line-height: calc(50px * var(--s));
  padding: 0 calc(18px * var(--s));
  border-radius: calc(25px * var(--s));
  font-size: calc(28px * var(--s));
  font-weight: 500;
}
/* 暴击 BoomGameTag：#FF2450 淡红底 + 红字 */
.rtag-boom {
  background: rgba(255, 36, 80, 0.1);
  color: #ff2450;
}
/* 德州 GameType(texas)：#08C0A0 淡青绿底 + 青绿字 */
.rtag-type {
  background: rgba(8, 192, 160, 0.18);
  color: #08c0a0;
}
.room-name {
  margin-top: calc(16px * var(--s));
  font-size: calc(34px * var(--s));
  font-weight: 700;
  color: #2b2b2d;
}
.room-stats {
  margin-top: calc(18px * var(--s));
  display: flex;
  align-items: center;
  gap: calc(28px * var(--s));
}
.rstat {
  display: flex;
  align-items: center;
  gap: calc(8px * var(--s));
  font-size: calc(28px * var(--s));
  color: #6b6b6d;
}
.rs-icon {
  width: calc(34px * var(--s));
  height: calc(34px * var(--s));
}
.rperson {
  padding: 0 calc(18px * var(--s));
  height: calc(48px * var(--s));
  line-height: calc(48px * var(--s));
  border: calc(2px * var(--s)) solid #a6e0cb;
  border-radius: calc(24px * var(--s));
  color: #6b6b6d;
}
/* 玩过角标：真 sprite playStateTag_Playing(右下角三角 ribbon) + -45° 文字 */
.room-played {
  position: absolute;
  right: 0;
  bottom: 0;
  width: calc(120px * var(--s));
  height: calc(120px * var(--s));
  background: url(/assets/hall/played_ribbon.png) right bottom / 100% 100% no-repeat;
  pointer-events: none;
}
.room-played i {
  position: absolute;
  right: calc(2px * var(--s));
  bottom: calc(24px * var(--s));
  width: calc(110px * var(--s));
  text-align: center;
  transform: rotate(-45deg);
  transform-origin: center;
  font-size: calc(22px * var(--s));
  font-style: normal;
  font-weight: 600;
  color: #3fb98a;
}
</style>
