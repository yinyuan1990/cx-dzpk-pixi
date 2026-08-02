# cx-dzpk-pixi — 德州扑克前端(循环结算版)

扯旋平台德州子游戏的 H5 前端。牌桌渲染(Pixi 5)与全套动画/资源复用自 WePoker 复刻工程,
**协议层重写**为 cx-dzpk 后端的 GameMessage JSON WebSocket(4xx 命令段)。

- 后端仓库: <https://github.com/yinyuan1990/cx-dzpk>(Spring Boot,`/ws/dzpk`)
- 玩法: 一手一结 + 周期结算(创建房间选 30/45/60… 分钟,玩家到点"结算不离座",
  盈利抽水、退筹回钱包,限时补带入开新周期)

## 技术栈

Vue 3 + Vite + Pinia + vue-router + vue-i18n(当前仅简体中文) + Pixi.js 5(牌桌层)

## 快速开始

```bash
npm install
# 连本地后端(默认连部署服 47.122.115.33:19100)
# .env.local: VITE_DZPK_WS=ws://localhost:9100/ws/dzpk
npm run dev          # http://localhost:5173
npm run build        # 产物 dist/
```

后端本地起法:`cd cx-dzpk && mvn package && java -jar target/chexuan-dzpk-1.0.0.jar`(9100,
机器人默认开启,真人坐下带入后自动补 2 个 AI 陪打)。

## 全流程探针(自动化冒烟)

```bash
# 需先起后端 + npm run dev
node probe_flow.cjs
# 登录→创建房→坐下→带入→机器人补位开局→自动过牌/跟注 10 轮,产出 probe_*.png 截图
```

## 架构:协议适配层

老 WePoker 牌桌(TableView/pixi/table.js/useSeatRotation)是按"事件驱动模型"写的,
本工程保留其模型形状与事件语义,只换数据源:

```
后端 JSON 推送 ──> src/net/session.js(适配器) ──> 老事件形状 ──> src/net/tableModel.js ──> TableView/Pixi
458 HAND_START(+459 HOLE_CARDS 合并) → recvStartInfor
460 TURN                             → recvTurn(新增:开表/跟注额/最小加注到)
461 ACTION_BC                        → recvAction(带权威 stack/bet 绝对值)
462 DEAL                             → recvCards
464 SETTLE                           → recvWinner
456/465 坐下/站起                     → recvSeatDown / recvLeave
457 BUY_IN_RES                       → recvBuyin(新增)
468 PERIOD_SETTLE                    → recvPeriodSettle(新增:周期结算面板)
```

- 牌值:后端 `"AS"/"TD"` 字符串 → 0-51 字节(与老编码完全一致)→ 客户端 `suit*100+rank`
- 对局操作(坐下/带入/行动)发送后以**广播回执**确认(observe 不消费,推送照常刷模型)
- 断线自动重连:重登录 → 重进房拉全量快照重同步

## 目录

```
src/
  config/server.js      # WS 地址(VITE_DZPK_WS 覆盖)
  net/socket.js         # JSON WS 连接:RPC/推送分发/自动重连
  net/session.js        # 会话+协议适配:登录/大厅/进房/坐下/带入/行动
  net/tableModel.js     # 快照/事件 → 牌桌视图模型(纯函数)
  views/LoginView.vue   # 游客昵称登录(可选主服 JWT)
  views/HallView.vue    # 房间列表(5s 轮询)+ 创建房间
  views/TableView.vue   # 牌桌编排:观战/对局/带入/周期结算面板
  pixi/table.js         # Pixi 牌桌层(发牌/下注/收池/摊牌/赢家等全套动画)
  composables/          # 座位旋转/发牌动画/背景/缩放
public/assets/          # 从 Cocos 逆向抽取的真资源(桌面/牌面/音效/骨骼动画)
```

## 部署

```bash
# 打包(生产默认同域 /ws/dzpk;跨域部署时打包时注入)
VITE_DZPK_WS=ws://<服务器>:19100/ws/dzpk npm run build
# dist/ 任意静态服务器可跑(nginx / python -m http.server / 后端 static)
```
