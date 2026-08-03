import { defineStore } from 'pinia'

// 单一游戏/会话状态源。本期 UI 阶段先放占位字段，
// 后续 WebSocket 推数据进这里，Vue HUD 读它渲染、Pixi 层 watch 它播动画。
export const useGameStore = defineStore('game', {
  state: () => ({
    user: {
      userId: 0,
      token: '',
      account: '',
      nickname: '',
      chips: 0, // USDT 余额(gold)
      idou: 0, // 钻石
      avatar: '',
      headPic: '',
      vipLevel: 0,
      sex: 0,
    },
    // 牌桌运行时状态（占位）
    table: {
      id: '',
      variant: 'texas', // texas / shortdeck / omaha ...
      seats: [],
      pot: 0,
      board: [],
    },
    // 大厅点房→牌桌：传递进房 TCP 目标（来自 /room/dz/enter 的 gmip/gmprt）。
    enterTarget: null, // { roomId, roomPath, gameIp, gamePort, name, slmz }
  }),
  actions: {
    setUser(u) {
      this.user = { ...this.user, ...u }
    },
    setEnterTarget(t) {
      this.enterTarget = t
    },
    clearEnterTarget() {
      this.enterTarget = null
    },
    // 用登录结果填充用户态(cx-dzpk LOGIN_RES: userId/nickname/balance)
    applyLogin(login) {
      this.setUser({
        userId: login.userId,
        nickname: login.nickname || '',
        avatar: login.avatar || '',
        chips: login.balance || 0,
        idou: login.diamond || 0,
      })
    },
  },
})
