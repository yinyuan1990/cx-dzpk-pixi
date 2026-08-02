import * as PIXI from 'pixi.js'
import { DESIGN_WIDTH } from '../config/design.js'
import {
  NAME_DY,
  SCORE_DY,
  CARD_TYPE_DY,
  handLayout,
  handTypeKey,
  dealHand,
} from '../config/cards.js'

// 头像真值来自 holdem_player_pkw.prefab：photo_sprite = 144 **圆形**（profile_holder_border
//   = bg_avatar_player_1 是金色金属圆环），普通德州头像 = 圆形 + 金色边框。
const AVATAR = 144 // photo_sprite 真值
const AVATAR_FRAME_SRC = '/assets/table/avatar_frame.png' // bg_avatar_player_1 金色金属圆框
// avatar_frame.png(204px) 实测：金环内径≈134、外径≈145(占 204)，环外还有约 30px 软投影留白。
//   旧值 168 会把金环内孔缩到≈110 < 头像144 → 头像跑到金框外面。正确做法：按金环内径几何
//   反推绘制尺寸，使金环内孔正好套住头像、金环压住头像外缘(=最外圈+遮挡)。
const FRAME_PNG = 204 // 贴图边长
const FRAME_GOLD_INNER = 134 // 金环内径(源px)
const FRAME_GOLD_OUTER = 145 // 金环外径(源px)
// 金环内孔 = 头像直径 - 4（让金环压住头像最外 2px，形成遮挡），由此反推贴图绘制尺寸。
const AVATAR_FRAME = Math.round(((AVATAR - 4) * FRAME_PNG) / FRAME_GOLD_INNER) // ≈213
const GOLD_OUTER_R = ((FRAME_GOLD_OUTER / FRAME_PNG) * AVATAR_FRAME) / 2 // 金环外缘半径(绘制px)
const SEAT_EMPTY_SRC = '/assets/table/ic_seat_empty_bg.png' // 圆角方虚线框 + 号 (scene seat_bg)
const SEAT_EMPTY = 144

// 倒计时 = 普通德州「放炮点引子(导火索)燃烧」效果（Holdem_PlayerTimer + progress_spark）：
//   ① 头像被一层暗罩(scrim)压暗 = 思考态「阴影」(headGrag_img/doGray)，「Ns」白字居中盖在暗罩之上；
//   ② 金色圆环 = 导火索，燃点沿金框行进(angle ∝ 已用时间)，燃点处只有一个小火核 + 稀疏四散的火星
//      (而非集中的蜡烛火焰)。火焰用**真 sprite**：spark_flash=glowTip(火核) + particle_spark=Particle(火星)。
const SPARK_FLASH_SRC = '/assets/table/spark_flash.png' // glowTip 火焰闪光（真）
const PARTICLE_SRC = '/assets/table/particle_tex.png' // Particle 火星粒子（真）
// 暗罩(思考阴影)= **雷达扫描式径向揭示**：暗罩是一块扇形，燃点(扫描线)从顶部顺时针扫过，
//   **扫过的区域暗罩消失(揭开亮头像)**，只剩「还没扫到」的扇区是暗的；白色「Ns」居中盖在最上。
//   随倒计时推进(progress 1→0) 暗扇区逐渐缩小、头像被一点点揭开。
const SCRIM_R = AVATAR / 2 - 2 // 暗罩半径（略小于头像，避免压到金环内沿）
const SCRIM_COLOR = 0x140d08 // 暗棕(对齐真机 _zoom_10 的暗棕头像)
const SCRIM_ALPHA = 0.58
const COUNTDOWN_LABEL_Y = 0
const COUNTDOWN_LABEL_FS = 40
const FUSE_R = GOLD_OUTER_R - 3 // 燃点/火星沿金环行进
const EMBER_COUNT = 16 // 火星数量（稀疏四散，不堆在一点）
// 临近超时提醒：Cocos Holdem_PlayerTimer 在「已用时间 > _alertTime」时触发一次 TimeOverTip
//   + 手牌抖动(startCardShake)。这里取「最后 N 秒」近似(短计时则取一半)，触发一次提醒音 + 抖牌。
const ALERT_REMAIN = 5 // 剩余 ≤5s 进入超时提醒
const SHAKE_AMP_DEG = 4.5 // 手牌抖动幅度(度)
const SHAKE_FREQ = 28 // 手牌抖动频率
// 经典「德州」倒计时环（还原 cocos edge.js: cc.ProgressBar 径向 FILLED betCounter + loopDot）：
//   头像外圈一圈进度环，从满(progress=1)随时间递减到 0；颜色 **绿→红** 渐变；领先边一个移动光点
//   (loopDot)；中心「Ns」白字。无暗罩、无火星——纯环形进度，和 cowboy「放炮导火索」是两套效果。
const RING_GREEN = 0x29f874 // edge.js green R41,G248,B116
const RING_RED = 0xff3b3b
const RING_BG = 0x000000 // 底环(未走完的暗槽)
const RING_BG_ALPHA = 0.35
const RING_LW = 6 // 进度环线宽
const RING_DOT_R = 6 // loopDot 半径
// 颜色线性插值 a→b（t=0 取 a，t=1 取 b），用于环色绿↔红渐变。
function lerpColor(a, b, t) {
  t = Math.max(0, Math.min(1, t))
  const ar = (a >> 16) & 0xff
  const ag = (a >> 8) & 0xff
  const ab = a & 0xff
  const r = Math.round(ar + (((b >> 16) & 0xff) - ar) * t)
  const g = Math.round(ag + (((b >> 8) & 0xff) - ag) * t)
  const bl = Math.round(ab + ((b & 0xff) - ab) * t)
  return (r << 16) | (g << 8) | bl
}
import { toCy } from '../config/tableSeats.js'
import { formatKNotation } from '../utils/format.js'
import { playSound } from '../utils/sound.js'
import { loadPixiSpine, getSpineClass } from '../utils/loadPixiSpine.js'
import { createPeekCardMesh } from './peekCardMesh.js'
import {
  frontTexture as cardFrontTex,
  backTexture as cardBackTex,
  onSkinChange,
  currentFaceSheetUrl,
  currentBackUrl,
} from './cardAtlas.js'
import { buildGiftDisplay, buildSpineGift, ensureSpineGift, advanceGiftClock, giftEngine, giftIconSrc, GIFT_CFG, GIFT_COMPLETE } from './gifts.js'

// ============================================================================
// Pixi table controller = the cocos "game layer" (gameUI scene graph), ported.
//
// WORLD = cocos scene design space, 1:1 with the old DOM .t-node system:
//   - world container: origin at screen center, uniform scale s = screenW / DESIGN_WIDTH.
//   - the seats[] view-model already carries cx,cy = toCx(x),toCy(y) (y flipped), so a seat
//     is placed at world-local (cx, cy) directly -- identical pixel result to the DOM left/top.
//   - child offsets (dx,dy) are screen-space (dy>0 = DOWN), reusing cards.js / NAME_DY / etc.
//
// Everything game-side lives under ONE world container => a single unified z stack (paint
// order = addChild order), exactly like the cocos scene graph. That is the whole reason cards
// moved off the DOM: effects (DragonBones/particles) must interleave z with cards & avatars.
//
// Seat child z (bottom->top), faithful to seatNode/optUser child order:
//   nickname -> avatar -> score plate -> hole cards -> card-type(高牌)
// ============================================================================

// WPActionTime (WPGameModel.js) 原值 dealCard .34 / dealCardInterval .06 / dealInterval .07，
// 但按需求改为「同时发牌」：去掉每个玩家之间、以及每人两张牌之间的错峰间隔（都设 0），
// 所有牌在同一时刻从中心一起飞出，飞行时长仍 .34s（easeSineOut）。
const DEAL_CARD = 0.34
const DEAL_CARD_INTERVAL = 0
const DEAL_INTERVAL = 0
// 发牌旋转效果（cowboy dispatchCardToTarget: spawn(move, rotateTo(...,0))）：飞牌起手翻甩角度，
// 途中 easeSineOut 回正到落位角。设 0 即恢复「不旋转」。
const DEAL_SPIN = 18
// Deal origin = cocos ndLogo "center" = logoNode(0,300)+center(0,50) = scene (0,350).
const ORIGIN = { x: 0, y: toCy(350) }
const easeSineOut = (t) => Math.sin((t * Math.PI) / 2)

// 弃牌 foldCard（WPGameModel.WPActionTime: foldCard .58 / foldCardAlpha .25 / foldCardAlphaDelay .4）。
//   其它玩家弃牌(otherHdCards.foldCardWithAni)：整组小牌背朝中心 ndLogo 飞，move .58s easeOut(1)，
//   起飞 .4s 后再 fade .25s easeIn(1) 到 0；落点 = logo 中心 + 微偏(x 朝内 10 / y 上移 20)。
//   cc.easeOut(1)/easeIn(1) = pow(t, 1) = 线性，故 move/fade 均按线性插值。
//   自己弃牌(handCards.showFoldShade)：手牌原地盖灰罩(不飞)，近似为压暗 + 去色。
const FOLD_MOVE = 0.58
const FOLD_ALPHA = 0.25
const FOLD_ALPHA_DELAY = 0.4
const FOLD_SELF_DIM = 0.4

// 摊牌亮牌 #13（seat.openCardForResult / handCards.setOpenCardsForResult / otherOpCards.setOpenCards）：
//   逆向真值：摊牌时每个未弃牌玩家的手牌翻开(showCardAni，单边 openCard=0.2s)，
//   随后给**每张手牌**盖一层暗罩 shade(active=true)，再把命中该玩家「最佳五张 highHandCards」
//   的牌取消暗罩(active=false) → 形成「赢牌/成手牌高亮、闲牌变暗」；座位间按 resultRound 错峰开牌。
//   赢家额外：牌型文字转金（setWinnerCardsTypeColor，仅顺子级以上）+ 金环（沿用 playWin glow）。
const RESULT_ROUND = 0.3 // WPActionTime.resultRound：座位间开牌错峰
const SHADE_COLOR = 0x0a0d12 // 暗罩底色（近黑，对齐真机 shade 压暗）
const SHADE_ALPHA = 0.62 // 暗罩不透明度
// 他人摊牌不是原地翻小牌背，而是另一套节点 otherOpCards：**大牌**显示在他人头像位置。
//   逆向 seatNode.prefab：otherOpCards 节点挂在 "content"(ndContentSeat) 下、Widget 拉伸 → 居中于座位原点；
//   otherOpCards.js initLayout（普通德州，非 Spingo）：单张 108×154.2，x=∓50.8，y=-1（cocos y 上为正）。
//   即摊牌时他人两张大牌居中盖在头像上（与小牌背 otherHdCards 是两套节点，开牌时 otherHdCards.reset 隐藏）。
const OTHER_OPEN = { w: 108, h: 154.2, dx: 50.8, dy: -1 } // dy 用 cocos 值；屏幕 y 向下→取负，见下方换算
const CLEAR_FADE = 0.32 // 清场收牌：公牌/手牌淡出 + 收向中心 logo 的时长

// 公牌 comCards（逆向 comCards.js + gameTable.fire）：comCards 节点在场景中心相对 (0,55)，
//   5 张牌父节点 x = -2*122 + i*122 = [-244,-122,0,122,244]，普通德州每张 127×180。
//   翻牌 = **原地翻转**(showCardAni)：scaleX 1→0.01(openCard) 边缘 → 换真牌面 → scaleX 0.01→1(openCard)。
//   FLOP 3 张按 comCard(0.3s) 错峰 + fagongpai1；TURN 第 4 张 + fagongpai2；RIVER 第 5 张 + fagongpai2。
const COM_CARD_W = 127
const COM_CARD_H = 180
const COM_SLOT_X = [-244, -122, 0, 122, 244] // 场景 x（cocos comCards.updateLayout n=122）
const COM_Y = toCy(55) // comCards 节点 scene y=55 → 屏幕 y
const OPEN_CARD = 0.2 // WPActionTime.openCard：单边翻转时长
const COM_CARD_STAGGER = 0.3 // WPActionTime.comCard：FLOP 各张错峰
// 河牌「搓牌」(WPPeekCardMesh)：All-In 摊牌且胜负未定(winOrLoseSure==0)时，第 5 张走
//   peekCard.openCard()，WPPeekCardAnim._openAniTiem=1.5s。mesh 自动 open("right")：
//   折线 p0(左中)→p1(右中) 横向扫过，customEasingScale 在 t∈[0.55,0.85] 放大(峰值~1.15)再回落，
//   t>=0.85 进入 OpenAnimate 整牌翻平(status 4 播 fagongpai2)，status 5 = Open 完成。
const PEEK_OPEN_TIME = 1.5

// 结算赢得效果（按 §5.9.13 真值重做）：
//   普通德州**自己赢** = optUser.prefab > Node_YouWin(y=262) > Node_Win 的 "YouWin" clip（4.17s）：
//     · You 从左(x:-819→-119) / Win 从右(x:+825→+125) 在 0.25s 内滑入中央汇合(自定义 bezier)，
//       同时 0~0.05s 淡入；汇合后 scale 1→1.1→1 弹跳(0.25~0.667s, cubicOut)；
//     · Flare_1(粉色扫光 sprite, _color rgb255,110,168) 在汇合处放大扫光(opacity 0→255→0 0.2~0.833s,
//       scale (1,1)→(2,3)→(3,3))；· particlesystem_YouWin 火花(0.15~2.25s)。
//     · 音效：seat.js resultWin 延迟 0.1s 播 "ying"。
//   **别人赢** = 单张 WIN(font_anim_win_pkw)弹出 + winBorder 脉冲，**不播左右滑入**。
//   另：结算附带底池筹码飞向赢家(coinChanged + shouchouma) + 盈利「+N」上浮(specialSound)，沿用。
const YOUWIN_YOU_SRC = '/assets/table/win_you.png' // You 233×91（YouWin.anim）
const YOUWIN_WIN_SRC = '/assets/table/win_win.png' // Win 257×91
const YOUWIN_FLARE_SRC = '/assets/table/win_flare.png' // Flare_1 400×101 扫光
const WIN_OTHER_SRC = '/assets/table/win_pkw.png' // 别人赢的单张 "WIN"
const YOU_W = 233
const YOU_H = 91
const WIN_W = 257
const WIN_H = 91
const FLARE_W = 400
const FLARE_H = 101
const FLARE_TINT = 0xff6ea8 // Flare_1 _color rgb(255,110,168) 粉
const YOU_FROM_X = -819
const YOU_TO_X = -119
const WIN_FROM_X = 825
const WIN_TO_X = 125
// 关键帧坐标是座位本地设计 px（cocos Node_Win scale=1）；native 「YOU WIN」≈490px 偏大，
//   整体缩放 YOUWIN_SCALE（保持所有关键帧比例不变，仅等比缩小），落在头像上方。
const YOUWIN_SCALE = 0.6
const YOUWIN_DY = -AVATAR / 2 - 50 // 横幅中心落在头像上方
const WIN_OTHER_H = 58 // 别人赢单张 WIN 显示高度
const WIN_DUR = 3.4 // 庆祝总时长(s)，尾段 0.4s 淡出
// 结算「筹码从底池飞向赢家」(Cocos CPPot.flyChipsToWinner/delayedLoop/flyChipAni)：
//   真值 = 从中央底池 chipDest 位置发 **5 枚真筹码**(betsNode 子)，每枚 cc.moveTo(0.15) **直线**飞到
//   赢家 scoreNode，逐枚 await(近似 0.05 错峰)；音效 shouchouma。**不是抛物线、不是手绘金币**。
const WIN_COINS = 5 // Cocos delayedLoop 循环 l<5
const WIN_COIN_DUR = 0.15 // flyChipAni cc.moveTo(.15)
const WIN_COIN_STAGGER = 0.05 // 逐枚错峰（delayedLoop await 近似）

// 下注筹码上桌(#7) + 底池更新(#10) — 1:1 还原 MTT Holdem（holdem_player_pkw + Holdem_Stake_ts）：
//   下注 = 真筹码 Chips_01 从座位飞向「身前下注位」(座位沿径向朝桌心内移 BET_SPOT_OFFSET 处)，**直线 0.16s easeInOut(2)**，
//          3 枚错峰 0.02*(2-i)；落成筹码堆+金额(chouma_img+chouma_text)；音效 chips_to_table。
//   收池 = 下注堆 scatter 后飞向中央底池(POT_PILE)，0.2s easeInOut，pot 数字累加；音效 chips_to_pot。
//   （真值：PLAYER/PUBLIC_STAKE_MOVE_TIME=0.16，EASE_RATE=2；克隆 3 枚；筹码单一贴图不按面额换色。）
// 筹码/身家数字字体 = Cocos 真值 PKW-Chip（chouma_text=Medium 粉色 fs38 / money_text=Regular）。
//   TTF 抽自 apk（public/assets/fonts/），@font-face 在 styles/base.css 注册，PixiStage 预加载后 PIXI 才用得上。
const CHIP_FONT = 'PKW-Chip, Microsoft YaHei, sans-serif'
const SCORE_FONT = 'PKW-Chip, Microsoft YaHei, sans-serif'
const CHIP_TEXT_COLOR = 0xff64e0 // chouma_text 真值粉色 rgb(255,100,224)
const CHIP_SRC = '/assets/table/chip.png' // 真筹码 Chips_01（51×52 native，抽自 dzpoker 图集）
const CHIP_DISP = 36 // 桌面筹码显示尺寸（2026-07-02 用户要求放大 1.2 倍：30→36）
const CHIP_FLY_N = 3 // 飞行克隆数（PKW/98MTT public = 3）
const BET_MOVE_DUR = 0.16 // PLAYER_STAKE_MOVE_TIME（下注上桌）
const POT_MOVE_DUR = 0.2 // 下注堆入底池移动时长
const BET_SPOT_OFFSET = 170 // 下注位 = 座位沿径向朝中心固定内移 170 单位（对应 CHOUMA0/1/2 偏移量级 ~150）
const POT_PILE = { x: 0, y: toCy(490) } // 收池落点 = 「总底池」缎带处（ndTotalPot scene y=530，堆落缎带正下方一点）

// 分池 pots[] UI（1:1 gameTable.fire potNode>PotGroup>PotsDefautl + potItem 组件）：
//   每个分池项 = ic_bet_bg 底板(208×56) + 彩色筹码 icon(44×48, x=-76) + 金额 Label(x≈31)。
//   **面额配色真值 = pot 组件 getBetColor(amount, bigBlind)**（decrypted/index.js L951631）：
//     ≤50BB 绿(bet1) / ≤100BB 红(bet4) / ≤200BB 蓝(bet9) / ≤400BB 橙(bet8) / 更大 紫(bet2)。
//   布局（.fire node446..480 _trs）：两列 x=±112，行距 64，首行中心距 PotGroup 顶 28；
//     PotGroup scene y=415(anchor 0.5,1 向下排)；最后一项为奇数序时独占一行居中(setPotItemPosition)。
//   注：座位「下注堆」保持单一 Chips_01 贴图（Cocos 座位 chouma_img 无换色逻辑），换色只发生在分池。
const POT_ITEM_BG_SRC = '/assets/table/pot_item_bg.png' // ic_bet_bg（atlas 1547bd0e2）
const POT_CHIP_SRC = {
  green: '/assets/table/pot_chip_green.png', // bet1
  red: '/assets/table/pot_chip_red.png', // bet4（main bundle pack 0c879f65d）
  blue: '/assets/table/pot_chip_blue.png', // bet9（同上）
  orange: '/assets/table/pot_chip_orange.png', // bet8
  purple: '/assets/table/pot_chip_purple.png', // bet2
}
const POT_GROUP_TOP_Y = 415 // PotGroup scene y（cocos y 上为正）
const POT_ITEM_ROW0_DY = 28 // 首行中心距 PotGroup 顶
const POT_ITEM_ROW_STEP = 64 // 行距（-28→-92→-156→-220）
const POT_ITEM_COL_X = 112 // 两列 x=±112
const POT_ITEM_W = 208
const POT_ITEM_H = 56
const POT_CHIP_ICON_W = 44 // potIcons 节点尺寸 44×48
const POT_CHIP_ICON_H = 48
const POT_CHIP_ICON_X = -76 // potIcons _trs x
const POT_LABEL_X = 31 // lblPot _trs x≈31.16
// 1:1 复刻 Cocos pot.getBetColor(e, t)：e=分池额，t=大盲。t<=0 时兜底绿色（场景默认 bet1）。
function betColorFor(amount, bigBlind) {
  const bb = Number(bigBlind) || 0
  if (bb <= 0) return 'green'
  if (amount <= 50 * bb) return 'green'
  if (amount <= 100 * bb) return 'red'
  if (amount <= 200 * bb) return 'blue'
  if (amount <= 400 * bb) return 'orange'
  return 'purple'
}

// 庄位 D / 盲注 SB/BB 标记（Holdem_Icon）：dealer 48×50 / sb·bb 50×53 真 sprite。
//   icon 贴座位身前（朝桌心内移 DEALER_INSET，落在头像与下注堆之间）；换庄 0.2s easeInOut。
const DEALER_SRC = '/assets/table/dealer_btn.png'
const SB_SRC = '/assets/table/sb_btn.png'
const BB_SRC = '/assets/table/bb_btn.png'
const ICON_SIZE = 46 // 庄位 D 标记显示尺寸
// 大盲/小盲标记：贴头像**左侧**、尺寸为原右上角小徽标(≈19)的一倍（用户要求 2026-07-02）。庄钮 D 仍在身家板旁。
const BLIND_ICON_SIZE = (Math.round(ICON_SIZE / 3) + 4) * 2 // ≈38（原 ≈19 放大一倍）

// 座位动作气泡底图（Cocos 真资源 game_Button_Tips_N，抽自 dzpoker ui/bubble，见 extract/crop_action_bubbles.py）。
//   对照 Unity/Cocos updateByActionType：跟注→Tips_call(蓝)/下注·加注→Tips_bet(橙)/过牌→Tips_check(青绿)。
//   showTips 把彩色气泡当底、文字另由 Label 画在上面（fs36，Allin 金色否则白）；弃牌/超时走 status_text 无气泡。
const BUBBLE_SRC = {
  call: '/assets/table/opt/bubble_0_call.png', // Tips_call 蓝
  check: '/assets/table/opt/bubble_2_check.png', // Tips_check 青绿
  bet: '/assets/table/opt/bubble_3_bet.png', // Tips_bet 橙（下注/加注共用）
  wait: '/assets/table/opt/bubble_1_wait.png', // Tips_waitOrLeave 灰（弃牌/超时用，用户要求：弃牌也用气泡）
}
const BUBBLE_W = 112 // 165×65 native 等比缩放
const BUBBLE_H = 44
// 气泡贴头像内侧（朝桌心）的偏移：右半区座位放头像左侧，其余(左/上/下)放右侧；
//   尾巴小圆点朝头像翻转（对照 Cocos showTips updateLeftOrRightSeatRatio，见 09 §0.9.5）。
const BUBBLE_DX = 100 // 气泡中心距座位中心的水平偏移（内侧边略压头像外缘）
const BUBBLE_DY = -52 // 气泡垂直位置（头像上半区，名字下方一点）
const DEALER_INSET = 105 // 标记距座位朝中心内移（< BET_SPOT_OFFSET 170，落头像与下注堆之间）
const DEALER_MOVE_DUR = 0.2 // moveDealer 动画时长（easeInOut(EASE_RATE=2)）

// cubic-bezier(p1x,p1y,p2x,p2y) 缓动求解（Newton 迭代 x→t 再取 y），用于 YouWin 滑入自定义曲线。
function cubicBezierEase(p1x, p1y, p2x, p2y) {
  const cx = 3 * p1x
  const bx = 3 * (p2x - p1x) - cx
  const ax = 1 - cx - bx
  const cy = 3 * p1y
  const by = 3 * (p2y - p1y) - cy
  const ay = 1 - cy - by
  const fx = (t) => ((ax * t + bx) * t + cx) * t
  const fy = (t) => ((ay * t + by) * t + cy) * t
  const dfx = (t) => (3 * ax * t + 2 * bx) * t + cx
  return (x) => {
    let t = x
    for (let i = 0; i < 6; i++) {
      const e = fx(t) - x
      if (Math.abs(e) < 1e-4) break
      const d = dfx(t)
      if (Math.abs(d) < 1e-6) break
      t -= e / d
    }
    return fy(Math.max(0, Math.min(1, t)))
  }
}
const youWinSlide = cubicBezierEase(0.18, 0.89, 0.57, 1.08)
const cubicOut = (t) => 1 - Math.pow(1 - t, 3)
// You/Win 汇合后弹跳 scale：1(≤.25) → 1.1(@.333,cubicOut) → 1(@.667,cubicOut)
function youWinPop(t) {
  if (t <= 0.25) return 1
  if (t <= 1 / 3) return 1 + 0.1 * cubicOut((t - 0.25) / (1 / 3 - 0.25))
  if (t <= 2 / 3) return 1.1 - 0.1 * cubicOut((t - 1 / 3) / (1 / 3))
  return 1
}
// Flare_1 opacity：0(<.2) → 255(@.25) → 255(@.5) → 0(@.833)
function flareAlpha(t) {
  if (t < 0.2) return 0
  if (t < 0.25) return (t - 0.2) / 0.05
  if (t < 0.5) return 1
  if (t < 5 / 6) return 1 - (t - 0.5) / (5 / 6 - 0.5)
  return 0
}
// Flare_1 scale：(1,1)<.2 → (2,3)@.25(cubicOut) → (2,3)@.5 → (3,3)@.833(linear)
function flareScale(t) {
  if (t < 0.2) return { x: 1, y: 1 }
  if (t < 0.25) {
    const k = cubicOut((t - 0.2) / 0.05)
    return { x: 1 + k, y: 1 + 2 * k }
  }
  if (t < 0.5) return { x: 2, y: 3 }
  if (t < 5 / 6) return { x: 2 + (t - 0.5) / (5 / 6 - 0.5), y: 3 }
  return { x: 3, y: 3 }
}

// 德州桌真帧动画 YOU WIN（holdem_player_pkw.prefab > win > self_side/opposite_side，
//   cc.Animation clip = win_light_self_pkw / win_light_opposite_pkw，时长 2s，真值见 §5.9.13b）：
//   · 自己赢(self)：YOU(you_text 199×68, 锚右) x:-514→-14 + WIN(win_text 172×68, 锚左) x:514→14，
//     0.25s cubicOut 滑入；汇合后 _Light(同字 sprite, ADD) opacity 0→255→0(0.25~0.667) 扫光；
//     flash01(307×33, ADD, 5帧翻书) 横向闪光条 opacity 脉冲(0.083~0.5)+横向拉伸(x 0→2→3, y 1→0)；
//     3 光球 lightball(55×55, ADD, 13帧翻书) 0.4~1.1s 闪烁(envelope 0→255→...→0)；
//     self_side 整体 opacity 255@1.583→0@2 淡出。运行期还会合成 Node_YouWin>particlesystem_YouWin
//     (25 星粒 ±250×±40 横带原地闪烁，见 PKW_SPARK_*)；本变体自身无 Flare_1。
//   · 别人赢(opposite)：只有单张 WIN(居中) 整体 scale 0→1 弹入(overshoot)，+ flash + 光球，1.667~2 淡出。
const PKW_WIN_SRC = '/assets/table/win_anim/win_text.png' // WIN 172×68
const PKW_YOU_SRC = '/assets/table/win_anim/you_text.png' // YOU 199×68
const PKW_WIN_W = 172
const PKW_WIN_H = 68
const PKW_YOU_W = 199
const PKW_YOU_H = 68
const PKW_FLASH_W = 307
const PKW_FLASH_H = 33
const PKW_BALL = 55
const PKW_BALL_TEX = Array.from({ length: 13 }, (_, i) => `/assets/table/win_anim/lightball_${String(i).padStart(2, '0')}.png`)
const PKW_FLASH_TEX = Array.from({ length: 5 }, (_, i) => `/assets/table/win_anim/flash_${String(i).padStart(2, '0')}.png`)
// 锚点换算：WIN 锚(0,0.5) rest x=14 → 中心 rest=14+172/2=100，起点中心=514+86=600；
//   YOU 锚(1,0.5) rest x=-14 → 中心 rest=-14-199/2=-113.5，起点中心=-514-99.5=-613.5。
const PKW_WIN_C_FROM = 600
const PKW_WIN_C_TO = 100
const PKW_YOU_C_FROM = -613.5
const PKW_YOU_C_TO = -113.5
const PKW_DUR = 2.0
const PKW_SPARK_N = 25 // particlesystem_YouWin.totalParticles
const PKW_SPARK_T0 = 0.15 // 粒子激活时刻（汇合后）
const PKW_SCALE = 0.6 // 与 YOUWIN_SCALE 一致，便于在测试弹框公平对比
const PKW_DY = -AVATAR / 2 - 55 // 横幅落在头像上方，与 YOUWIN_DY 一致清开头像
// self_side 3 光球的就位变换（prefab self_side trs：x/旋转/缩放）
const PKW_BALLS = [
  { x: -72, y: 0, rot: 0, sx: 1.3, sy: 1.1, frameSpan: [0.4, 1.0], env: [[0.317, 0], [0.4, 1], [1.0, 0.31], [1.133, 0]] },
  { x: -2, y: -1, rot: 90, sx: 1.3, sy: 1.5, frameSpan: [0.4, 1.1], env: [[0.317, 0], [0.4, 1], [1.117, 1], [1.25, 0]] },
  { x: 70, y: 0, rot: -90, sx: 1.3, sy: 1.1, frameSpan: [0.4, 1.0], env: [[0.317, 0], [0.4, 1], [1.0, 0.31], [1.133, 0]] },
]
// 分段线性采样（time→value），用于 opacity/scale 关键帧曲线。
function sampleKf(frames, t) {
  if (t <= frames[0][0]) return frames[0][1]
  for (let i = 1; i < frames.length; i++) {
    if (t <= frames[i][0]) {
      const [t0, v0] = frames[i - 1]
      const [t1, v1] = frames[i]
      return v0 + (v1 - v0) * ((t - t0) / (t1 - t0 || 1))
    }
  }
  return frames[frames.length - 1][1]
}

// 「你赢了」庆祝 = 逆向自十三水 sp.SkeletonData「Touxiangxiaoguo」(skWinLoseDraw) 的**骨骼动画**，
//   非自写帧动画。骨骼内含金框(dk)+「赢了」字(Yingle_zi/_cn)+星星(Ls_xx)+牌型花色等，整套庆祝由骨骼驱动。
//   spine 3.8 格式，用 pixi-spine v2(配 Pixi v5) 播放。资源由 extract/extract_spine_win.cjs 从 Cocos 包抽出。
const WIN_SPINE_JSON = '/assets/spine/win/win.json'
const WIN_SPINE_ANIM = 'Niyingle_cn' // 你赢了(中文)；英文用 'Niyingle'
const WIN_SPINE_SCALE = 0.5 // 骨骼原生≈510px 宽，缩到头像上方合适尺寸
const WIN_SPINE_DY = -AVATAR / 2 - 8 // 横幅落在头像上方
// 模块级缓存：spineData 跨多次建桌复用，避免共享 Loader 重复 add 报错。
let _winSpineData = null
let _winSpinePromise = null
function ensureWinSpine() {
  if (_winSpineData) return Promise.resolve(_winSpineData)
  if (_winSpinePromise) return _winSpinePromise
  _winSpinePromise = loadPixiSpine()
    .then(() => {
      if (_winSpineData) return _winSpineData
      return new Promise((resolve) => {
        const loader = new PIXI.Loader()
        loader.add('winSpine', WIN_SPINE_JSON).load((_, res) => {
          const r = res && res.winSpine
          if (r && r.spineData) _winSpineData = r.spineData
          resolve(_winSpineData)
        })
      })
    })
    .catch(() => null)
  return _winSpinePromise
}

// sprite sized in DESIGN px. Texture.from is async: setting width/height before the
// baseTexture is valid scales against a 1x1 placeholder -> apply size once it's loaded.
function sizedSprite(url, w, h) {
  const t = PIXI.Texture.from(url)
  const sp = new PIXI.Sprite(t)
  sp.anchor.set(0.5)
  const apply = () => {
    if (!sp.transform) return // 已 destroy（异步纹理回调晚于销毁）→ 跳过，避免读 null.scale
    sp.width = w
    sp.height = h
  }
  if (t.baseTexture && t.baseTexture.valid) apply()
  else t.baseTexture.once('loaded', apply)
  return sp
}

// 同 sizedSprite，但直接吃一个 PIXI.Texture（可为 sheet 子矩形牌面纹理）。
function sizedSpriteTex(tex, w, h) {
  const sp = new PIXI.Sprite(tex)
  sp.anchor.set(0.5)
  const apply = () => {
    if (!sp.transform) return
    sp.width = w
    sp.height = h
  }
  if (tex.baseTexture && tex.baseTexture.valid) apply()
  else tex.baseTexture.once('loaded', apply)
  return sp
}
// 给已有 sprite 换牌面/牌背纹理并保持显示尺寸（纹理换图后 originalSize 变 → 需重设 w/h）。
function setCardTex(sp, tex, w, h) {
  sp.texture = tex
  const apply = () => {
    if (!sp.transform) return
    sp.width = w
    sp.height = h
  }
  if (tex.baseTexture && tex.baseTexture.valid) apply()
  else tex.baseTexture.once('loaded', apply)
}

function makeText(str, { size, fill, weight = 'normal', family = 'Microsoft YaHei, system-ui, sans-serif' }) {
  const t = new PIXI.Text(str, {
    fontFamily: family,
    fontSize: size,
    fontWeight: weight,
    fill,
    align: 'center',
    dropShadow: true,
    dropShadowColor: 0x000000,
    dropShadowAlpha: 0.7,
    dropShadowBlur: 3,
    dropShadowDistance: 1,
  })
  t.anchor.set(0.5)
  t._isSceneText = true
  return t
}

// All-In 光环（逆向 dzpoker animation/allin_action_0 入场 + allin_action_1 循环）：
//   ★All-In 是**图片**（Allin 文字精灵 + 火焰/环精灵），不是字体。全部落在头像中央（allin_node 居中于座位）。
//   入场(allin_action_0, 0.783s)：
//     · 10001 = 大火焰/光晕(329×322, ADD)，opacity 0→255@.166→255@.716→0@.766(12 帧火焰翻书)；
//     · Allin = 「All In」图片(105×42)，scale 3→1@.166(砸入) →1.2@.233 →1@.3 →1.05@.366 →1@.433，opacity 20→255@.166；
//     · quan_02 环(133×133, ADD)：opacity 0→255@.166→0@.533，scale 1→0.8→1.5(扩散淡出)；
//     · quan_01 环(133×133, ADD)：opacity 0→255@.316→0→.683，scale 1→0.8→1.5(错峰第二圈)。
//   循环(allin_action_1, 2s Loop)：common_Head_black(128) 压暗头像 + quan_02(178, ADD) 呼吸 opacity 50→255→50。
//   贴图真值抽自 apk（extract/crop_allin_sprites.py → public/assets/table/allin/）。
const ALLIN_TEXT_SRC = '/assets/table/allin/allin_text.png' // Allin 文字精灵 105×42
const ALLIN_FLAME_SRC = '/assets/table/allin/allin_flame.png' // 10001 火焰/光晕 329×322
const ALLIN_RING_SRC = '/assets/table/allin/allin_ring.png' // quan_01/02 扩散环 133
const ALLIN_RINGLOOP_SRC = '/assets/table/allin/allin_ring_loop.png' // 循环呼吸环 178
const ALLIN_HEADBLACK_SRC = '/assets/table/allin/allin_headblack.png' // common_Head_black 压暗 128
const ALLIN_ENTER_DUR = 0.783 // allin_action_0 _duration
const ALLIN_LOOP_PERIOD = 2.0 // allin_action_1 _duration（呼吸周期）
const ALLIN_FLAME_W = 329 // 10001 原始尺寸（头像中央大火焰，覆盖并溢出头像）
const ALLIN_FLAME_H = 322
const ALLIN_RING_W = 133 // quan_01/02 扩散环显示直径
const ALLIN_RINGLOOP_W = 178 // 循环呼吸环显示直径（略大于头像）
const ALLIN_HEADBLACK_W = 128 // common_Head_black 压暗尺寸（对齐头像内圈）
const ALLIN_SCRIM_ALPHA = 100 / 255 // common_Head_black _opacity=100
const ALLIN_TEXT_W = 105
const ALLIN_TEXT_H = 42
const ALLIN_TEXT_DY = 0 // 「All In」图片落在头像正中心
// 分段线性采样（[frame,value] 数组，frame=秒）。
function allinKf(frames, t) {
  if (t <= frames[0][0]) return frames[0][1]
  for (let i = 1; i < frames.length; i++) {
    if (t <= frames[i][0]) {
      const [t0, v0] = frames[i - 1]
      const [t1, v1] = frames[i]
      return v0 + (v1 - v0) * ((t - t0) / (t1 - t0 || 1))
    }
  }
  return frames[frames.length - 1][1]
}

export function createTable(app, { t, onPot } = {}) {
  const tr = (key) => (t ? t(key) : key)
  const world = new PIXI.Container()
  const seatLayer = new PIXI.Container()
  const iconLayer = new PIXI.Container() // 庄位 D / SB / BB 标记（在座位之上、飞牌之下）
  const potLayer = new PIXI.Container() // 分池 pots[] 列表（gameTable.fire PotGroup，在公牌之下）
  const comLayer = new PIXI.Container() // community cards (center board)
  const dealLayer = new PIXI.Container() // flying cards (above seats)
  const giftLayer = new PIXI.Container() // 送礼物：飞行投射物 + DragonBones 落点 burst（最上层）
  world.addChild(seatLayer, iconLayer, potLayer, comLayer, dealLayer, giftLayer)
  app.stage.addChild(world)

  let s = 1
  // 诊断计数器（挂 window.__pixiStats）：闪烁排查用 —— 事件到达前后 diff 各计数，
  //   即可知道哪些「破坏性」操作（重建座位/重摆公牌/重建手牌…）被真实触发。
  //   ⚠️ 之前 probe 包裹 window.__tableTest.playCommunity 是测不到内部调用的（那只是测试别名），
  //   必须在这里源头计数。开销为普通自增，保留无妨。
  const stats = {
    playCommunity: 0, clearCommunity: 0, comFlip: 0, comStatic: 0,
    buildSeat: 0, destroySeat: 0, cardRebuild: 0,
    playFold: 0, playBet: 0, removeBet: 0, badgeRebuild: 0,
  }
  if (typeof window !== 'undefined') window.__pixiStats = stats
  const seatViews = new Map() // nodeId -> { container, player, cardSprites[], setPos() ... }
  const flying = [] // active deal-card tweens
  const folds = [] // active fold tweens (其它玩家小牌背飞向中心 logo + 淡出)
  let foldToken = 0
  const giftFlights = [] // 送礼物飞行投射物 tween（送礼者→受赠者）
  const giftDisplays = [] // 活跃的 DragonBones 礼物 armatureDisplay
  let giftToken = 0
  const countdowns = new Map() // nodeId -> { ring, dot, scrim, label, remaining, duration, R, lw }
  const wins = new Map() // nodeId -> win celebration state
  const allins = new Map() // nodeId -> All-In aura state（入场 + 循环呼吸环）
  const winCoins = [] // pot->winner flying coins (in dealLayer)
  const comSlots = [] // 5 community-card slots { node, sp, value }
  const comFlips = [] // active in-place flip tweens { slot, t, value, swapped }
  let comToken = 0
  let comPeek = null // active river squeeze (搓牌) { slot, value, t, peek(mesh wrapper), soundPlayed }
  // 摊牌亮牌(#13)：每张参与摊牌的手牌一次翻面 tween + 暗罩(shade) 状态。
  //   flips: 翻面进行中的牌 { sp, t, value, swapped, baseSX, baseSY, onFlipped }
  //   shades: 盖在手牌上的暗罩 sprite（暗=非最佳五张/败者，亮=赢家最佳牌），随座位清理。
  const showFlips = []
  const showShades = [] // { g } 暗罩 Graphics（挂在座位 container）
  let showToken = 0
  // 清场 #15（gameUI.cleanNotify）：收牌(公牌/手牌/摊牌牌淡出收向中心) + 重置底池/下注/标记/特效。
  const clears = [] // { disp, t, from, to } 收牌淡出+收向中心
  let clearToken = 0
  const bets = new Map() // nodeId -> { stack, label, amount, spot } 玩家身前下注筹码堆
  const chipFly = [] // generic flying chips (bet→spot / spot→pot) in dealLayer
  let betToken = 0
  // 庄位 D + 盲注 SB/BB 标记（Holdem_Icon）。每个 icon 一个 sprite，跟随所属座位；
  //   换庄 = moveTo 0.2s easeInOut（Holdem_Icon.moveDealer）。kind -> { sp, nodeId, mt } 。
  const icons = new Map() // kind('dealer'|'sb'|'bb') -> { sp, nodeId, mt }
  let potTotal = 0 // 中央总底池累计（数字显示在 DOM「总底池」缎带）
  const potItems = [] // 分池 UI 项 { root, chip, label, color, amount }（挂 potLayer）
  ensureWinSpine() // 后台预加载十三水「你赢了」骨骼（不阻塞进桌）

  // 贴图预热：进桌时一次性加载 + 解码 + 上传 GPU 所有牌面 / 常用特效 sprite。否则首次发牌 / 摊牌
  //   一次需要多张「没见过」的牌时，PIXI.Texture.from 会在该帧同步解码 PNG + 上传纹理 → 丢帧
  //   （= 用户反馈「有时候动画卡一下」的主因，且基本只在第一次出现）。失败静默，不阻塞进桌。
  function warmTextures() {
    const urls = [
      currentFaceSheetUrl(), // 当前牌面 sheet（1 张图含全部 52 牌）
      currentBackUrl(), // 当前牌背
      AVATAR_FRAME_SRC, SEAT_EMPTY_SRC, CHIP_SRC,
      DEALER_SRC, SB_SRC, BB_SRC,
      SPARK_FLASH_SRC, PARTICLE_SRC,
      ALLIN_TEXT_SRC, ALLIN_FLAME_SRC, ALLIN_RING_SRC, ALLIN_RINGLOOP_SRC, ALLIN_HEADBLACK_SRC,
      YOUWIN_YOU_SRC, YOUWIN_WIN_SRC, YOUWIN_FLARE_SRC, WIN_OTHER_SRC,
      PKW_WIN_SRC, PKW_YOU_SRC, ...PKW_BALL_TEX, ...PKW_FLASH_TEX,
    ]
    const prepare = app.renderer && app.renderer.plugins && app.renderer.plugins.prepare
    for (const url of urls) {
      const tex = PIXI.Texture.from(url)
      const upload = () => { try { prepare && prepare.upload(tex) } catch (e) { void e } }
      if (tex.baseTexture && tex.baseTexture.valid) upload()
      else if (tex.baseTexture) tex.baseTexture.once('loaded', upload)
    }
  }
  warmTextures()

  // 牌面/牌背换皮：把当前所有已显示的牌（座位手牌 / 摊牌大牌 / 公牌）重置为新皮肤纹理。
  function restyleAll() {
    for (const view of seatViews.values()) {
      if (view.kind !== 'player' || !view.player) continue
      view.cardSprites.forEach((sp, i) => {
        const card = view.player.cards[i]
        if (!sp || !card) return
        setCardTex(sp, card.faceUp ? cardFrontTex(card.value) : cardBackTex(), view.lay.size.w, view.lay.size.h)
      })
      if (view._sdOpenCards) {
        for (const sp of view._sdOpenCards) {
          setCardTex(sp, sp._cv != null ? cardFrontTex(sp._cv) : cardBackTex(), OTHER_OPEN.w, OTHER_OPEN.h)
        }
      }
    }
    for (const slot of comSlots) {
      if (!slot.sp) continue
      setCardTex(slot.sp, slot.value != null ? cardFrontTex(slot.value) : cardBackTex(), COM_CARD_W, COM_CARD_H)
    }
    warmTextures() // 预热新皮肤 sheet/back，避免下一手首用解码卡顿
  }
  const offSkinChange = onSkinChange(() => restyleAll())

  // ---- world transform / resize ----
  function refreshTextRes(node) {
    if (node._isSceneText) {
      const res = Math.max(1, Math.ceil((window.devicePixelRatio || 1) * s))
      if (node.resolution !== res) node.resolution = res
    }
    node.children && node.children.forEach(refreshTextRes)
  }
  function layout() {
    s = app.screen.width / DESIGN_WIDTH
    world.scale.set(s)
    world.position.set(app.screen.width / 2, app.screen.height / 2)
    refreshTextRes(world)
  }

  // 身家底板：圆角胶囊（圆角半径=高度一半，非矩形小圆角），对照参考图 29.2/41.71/34.95 的药丸底。
  //   左右内边距各 26（原 16 + 用户要求再加 10），让数字离背景边缘更宽松。
  function drawScorePlate(g, score) {
    g.clear()
    // 占座(18)等无身家文本时不画底板（对齐 Unity SetCoin(string.Empty)：coinShadow 随文本收起，
    //   否则空胶囊会残留一个小黑点）。
    if (!score.text) return
    const w = score.width + 52
    const h = score.height + 8
    // 1px 白色边框（玩家身家底板描边，对照参考图）。lineStyle 在 beginFill 前设，描边走胶囊轮廓。
    g.lineStyle(1, 0xffffff, 0.9)
    g.beginFill(0x081610, 0.72)
      .drawRoundedRect(-w / 2, -h / 2, w, h, h) // 圆角半径=高度（最大圆角，左右两端全半圆胶囊）
      .endFill()
  }

  // 昵称最多 5 个字，超过截断 + 省略号（对照参考图 深V蕾丝... / 阿姨说来...）。
  //   用 Array.from 按字素切，避免把 emoji/代理对截一半。
  function truncName(name) {
    const chars = Array.from(String(name || ''))
    return chars.length > 5 ? chars.slice(0, 5).join('') + '...' : chars.join('')
  }

  // ---- build one seat container for a player ----
  function buildSeat(seat) {
    stats.buildSeat++
    const p = seat.player
    const c = new PIXI.Container()

    const name = makeText(truncName(p.name), { size: 26, fill: 0xeaf3ee })
    name.y = p.isSelf ? NAME_DY.self : NAME_DY.other
    c.addChild(name)

    const d = AVATAR
    const r = d / 2
    // circular avatar (photo_mask = ellipse), clipped to the gold ring's inner hole.
    const av = sizedSprite(p.avatar, d, d)
    const mask = new PIXI.Graphics()
    mask.beginFill(0xffffff).drawCircle(0, 0, r).endFill()
    c.addChild(av, mask)
    av.mask = mask
    // 遮挡内阴影：金属环高于凹陷的头像 -> 头像外缘一圈由深到浅的内阴影，营造"嵌进框里"的凹陷感。
    //   用同心圆描边逼近环向渐变，最强在边缘、向内快速衰减；mask 限制不外溢。
    const occ = new PIXI.Graphics()
    const occSteps = 16
    for (let i = 0; i < occSteps; i++) {
      const rr = r - i * 1.25
      const alpha = 0.5 * Math.pow(1 - i / occSteps, 1.7)
      occ.lineStyle(2.2, 0x000000, alpha)
      occ.drawCircle(0, 0, rr)
    }
    const occMask = new PIXI.Graphics()
    occMask.beginFill(0xffffff).drawCircle(0, 0, r).endFill()
    c.addChild(occ, occMask)
    occ.mask = occMask
    // 金色金属框 = 最外圈（贴图自带外软投影）；金环内孔套住头像、外缘压住头像最外缘。
    const frame = sizedSprite(AVATAR_FRAME_SRC, AVATAR_FRAME, AVATAR_FRAME)
    c.addChild(frame)

    const scoreDy = p.isSelf ? SCORE_DY.self : SCORE_DY.other
    // 身家数字字体 = Cocos money_text 真值 PKW-Chip-Regular（Seat.prefab _N$file）。占座(18)不显示数字。
    const score = makeText(scoreTextFor(p), { size: 30, fill: 0xffd23b, weight: '400', family: SCORE_FONT })
    const plate = new PIXI.Container()
    const bg = new PIXI.Graphics()
    drawScorePlate(bg, score)
    plate.addChild(bg, score)
    plate.y = scoreDy
    c.addChild(plate)

    // 座位动作气泡（对齐 Unity SeatCall/SeatRaise/SeatCheck + Cocos showTips）：头像内侧一枚彩色气泡。
    const badge = makeActionBadge(p, seat.side, seat.cx, seat.cy)
    // 弃牌/超时：头像中央灰色状态字（对齐 Cocos showStatusText），非气泡。
    const statusBadge = makeStatusBadge(p)
    // 弃牌：座位整体压暗（牌已由 playFold 飞走）。
    if (p.folded) c.alpha = 0.5

    const lay = handLayout(p.isSelf, seat.side)
    const cards = Array.isArray(p.cards) ? p.cards : []
    const cardSprites = cards.map((card, i) => {
      const slot = lay.slots[i]
      const tex = card.faceUp ? cardFrontTex(card.value) : cardBackTex()
      const sp = sizedSpriteTex(tex, lay.size.w, lay.size.h)
      sp._cv = card.faceUp ? card.value : null // 记录当前贴图对应的牌值（换手换牌时增量换贴图用）
      sp.angle = slot.rot || 0
      sp.position.set(slot.dx, slot.dy)
      sp.visible = !!card.revealed
      c.addChild(sp)
      return sp
    })
    // 气泡叠在手牌之上（对照 reference：气泡贴头像上侧、压在手牌之前）。
    if (badge) c.addChild(badge)
    // 弃牌/超时状态字叠在最上（头像中央），压过手牌与压暗。
    if (statusBadge) c.addChild(statusBadge)

    let cardType = null
    // 牌型字仅本手可玩且已亮两张底牌时显示（中途坐下 canPlay=0 / 空手牌 → 不显示「高牌」）
    if (p.isSelf && cards.length >= 2) {
      cardType = makeText(tr(handTypeKey(cards)), { size: 34, fill: 0xffe08a, weight: '600' })
      cardType.y = CARD_TYPE_DY
      cardType.visible = cards.every((k) => k.revealed)
      c.addChild(cardType)
    }

    c.position.set(seat.cx, seat.cy)
    // 头像视觉节点（轮到自己=操作条覆盖时可整体隐藏，仅留手牌/身家，对照 200.jpg）
    const avatarNodes = [av, occ, frame, name]
    // tx,ty = tween target (sitdownWithAni rides the seat node to its slot over ~0.11s)
    return {
      container: c, player: p, userId: p.userID ?? p.userId, side: seat.side,
      cardSprites, cardType, lay, avatarNodes,
      score, scoreBg: bg, badge, statusBadge, // 原地更新身家/动作徽标/状态字用
      tx: seat.cx, ty: seat.cy,
    }
  }

  // 座位动作徽标（对应 Unity/Cocos updateByActionType + showTips）：头像内侧一枚彩色气泡。
  //   1下注 2跟注 3加注 5过牌 → 真气泡底图(BUBBLE_SRC) + 白字(fs36 等比)；
  //   6弃牌 7超时 → 无气泡，头像中央 status_text 灰字（makeStatusBadge，Cocos showStatusText + 整座压暗）；
  //   4全下由光环/火焰(playAllin 真图)表达，不出气泡。
  // tailRight = 气泡贴图自带的小圆点尾巴在原图哪一侧（抽自 atlas，各底图朝向不一）：
  //   call 尾巴在右上、bet/check 尾巴在左下。摆放时按座位翻转，让尾巴始终指向头像。
  const ACTION_BUBBLE = {
    1: { tex: 'bet', key: 'table.act.bet', tailRight: false }, // Enum_Action_Bet → Tips_bet(橙)
    2: { tex: 'call', key: 'table.act.call', tailRight: true }, // Enum_Action_Call → Tips_call(蓝)
    3: { tex: 'bet', key: 'table.act.raise', tailRight: false }, // Enum_Action_Raise → Tips_bet(橙，与下注同底)
    5: { tex: 'check', key: 'table.act.check', tailRight: false }, // Enum_Action_Check → Tips_check(青绿)
    // 弃牌(6)/超时(7) 不走气泡：对齐 Cocos showStatusText，头像置灰 + 头像中央显示灰色「弃牌/超时」字（见 makeStatusBadge）。
  }
  // 弃牌/超时/等待状态字（对齐 Cocos Seat.showStatusText：status_text Label fs34）。
  //   落在头像正中央（groupText/status_text 位置），不用气泡、不用倒计时位图字体（系统字即可）。
  //   弃牌/超时=灰字；等待(8已带入等下一手/15留座/18占座)=白字（Cocos setSeatWaiting →
  //   showStatusText("等待"/GameUiWaiting) 默认 cc.Color.WHITE，坐下后未入局常驻）。
  const STATUS_TEXT = {
    6: { key: 'table.act.fold', fill: 0xcfcfcf }, // Enum_Action_Fold → 「弃牌」
    7: { key: 'table.act.timeout', fill: 0xcfcfcf }, // 超时 → 「超时」
    8: { key: 'table.act.waiting', fill: 0xffffff }, // 已带入、等下一手（Unity ADD_CHIPS 18→8）
    15: { key: 'table.act.waiting', fill: 0xffffff }, // 留座
    18: { key: 'table.act.waiting', fill: 0xffffff }, // 占座（坐下未带入）
  }
  function makeStatusBadge(p) {
    const st = STATUS_TEXT[p.status]
    if (!st) return null
    // fs34 系统字（Cocos STATUS_TEXT_FONT_SIZE=34），加粗，居中头像
    const label = makeText(tr(st.key), { size: 34, fill: st.fill, weight: '700' })
    label.y = 0
    return label
  }
  // 占座(18)不显示身家数字（对齐 Unity Seat.UpdateCoin：status==18 → SetCoin(string.Empty)）。
  const scoreTextFor = (p) => (p.status === 18 ? '' : fmtAmount(p.stack))
  // 气泡摆左还是右（true=贴头像左侧、尾巴朝右指向头像）。规则对照三张参考图
  //   （E:\wpoker\其他人最上最下.png / 左.png / 右.png，观战者正确效果）：
  //   · 右列侧栏座位 → 气泡贴头像**左侧**（朝桌心，见 右.png）。
  //   · 左列 + 顶部两座 + 底部 Hero → 气泡贴头像**右侧**（左.png / 其他人最上最下.png）。
  //   顶部两座都朝右：avatar 相距 252px、气泡各偏右 100 → 不重叠；既避免旧「朝桌心」把两气泡挤到
  //   中间重叠，也不用「朝外」把左上座气泡甩到屏幕边（那与参考图不符，2026-07-02 问题2 修正）。
  const TOP_PAIR_CY = -700 // 屏幕 y 阈值：top pair cy≈-817，侧栏最高 cy≈-594
  function bubbleOnLeft(cx, cy) {
    if (cy != null && cy < TOP_PAIR_CY) return false // 顶部两座统一贴头像右侧（参考图 其他人最上最下.png）
    return cx > 0 // 侧栏：右列(x>0)气泡在左、左列(x<0)气泡在右（均朝桌心）
  }
  function makeActionBadge(p, side = 'bottom', cx, cy) {
    const bub = ACTION_BUBBLE[p.status]
    if (!bub) return null
    const badge = new PIXI.Container()
    // bg 自身按贴图原始宽高设 scale（异步），翻转要在父容器做，避免覆盖 sizedSprite 的宽度 scale。
    const bgWrap = new PIXI.Container()
    const bg = sizedSprite(BUBBLE_SRC[bub.tex], BUBBLE_W, BUBBLE_H)
    bgWrap.addChild(bg)
    const onLeft = cx != null ? bubbleOnLeft(cx, cy) : side === 'right' // 位置优先，回退到 side
    const wantTailRight = onLeft // 气泡在左侧时，尾巴应在其右缘指向头像
    if (wantTailRight !== bub.tailRight) bgWrap.scale.x = -1 // 翻转让小圆点尾巴指向头像
    // showTips 文字：fs36 等比下来 ~24，白字（跟/下/加/过 彩色气泡；弃牌/超时走 status_text 灰字不在此）
    const label = makeText(tr(bub.key), { size: 24, fill: 0xffffff, weight: '700' })
    label.y = -1 // 气泡体略偏上（尾巴小圆点在体外），文字压在体心
    badge.addChild(bgWrap, label)
    badge.x = onLeft ? -BUBBLE_DX : BUBBLE_DX
    badge.y = BUBBLE_DY
    return badge
  }

  // 同一玩家留座、仅刷新可变项（身家/动作徽标/弃牌压暗），避免每个事件整座重建打断动画。
  function updateSeatDynamic(view, p) {
    view.player = p
    view.userId = p.userID ?? p.userId
    if (view.score) {
      const txt = scoreTextFor(p)
      if (view.score.text !== txt) {
        view.score.text = txt
        if (view.scoreBg) drawScorePlate(view.scoreBg, view.score)
      }
    }
    // 动作徽标按 status 重建（status 无变化时也便宜，重建一次轻量）
    stats.badgeRebuild++
    if (view.badge) { view.container.removeChild(view.badge); view.badge.destroy({ children: true }); view.badge = null }
    const badge = makeActionBadge(p, view.side, view.tx, view.ty)
    if (badge) { view.container.addChild(badge); view.badge = badge }
    // 弃牌/超时状态字（头像中央灰字）随 status 重建
    if (view.statusBadge) { view.container.removeChild(view.statusBadge); view.statusBadge.destroy({ children: true }); view.statusBadge = null }
    const statusBadge = makeStatusBadge(p)
    if (statusBadge) { view.container.addChild(statusBadge); view.statusBadge = statusBadge }
    view.container.alpha = p.folded ? 0.5 : 1
    // 弃牌压暗**声明式同步**（2026-07-21 问题：第二把开始后上一手弃牌座位阴影/灰牌残留）——
    //   playFold 只负责「进入」弃牌态（头像 0.45 / 自己手牌灰 tint），这里按模型 folded 每次渲染
    //   对齐「退出」：新一手 recvStartInfor 清 folded 后，头像/手牌/牌型字亮度自动还原。
    view.folded = !!p.folded
    if (view.avatarNodes) {
      const av = p.folded ? 0.45 : 1
      for (const n of view.avatarNodes) if (n && !n._destroyed) n.alpha = av
    }
    if (p.isSelf && view.cardSprites) {
      const dim = !!p.folded
      view.cardSprites.forEach((sp) => {
        if (!sp || sp._destroyed) return
        sp.alpha = dim ? FOLD_SELF_DIM : 1
        sp.tint = dim ? 0x808080 : 0xffffff
      })
      if (view.cardType && !view.cardType._destroyed) view.cardType.alpha = dim ? FOLD_SELF_DIM : 1
    }
  }

  // re-place the hole cards in place when a seat's ring side changes during rotation
  // (otherHdCards fans toward center; self layout is side-independent). Avoids a full
  // rebuild -> sprites/textures persist so the cards ride the seat instead of vanishing.
  function relayoutCards(view, seat) {
    const lay = handLayout(seat.player.isSelf, seat.side)
    view.lay = lay
    view.cardSprites.forEach((sp, i) => {
      const slot = lay.slots[i]
      if (sp && slot) {
        sp.width = lay.size.w
        sp.height = lay.size.h
        sp.angle = slot.rot || 0
        sp.position.set(slot.dx, slot.dy)
      }
    })
  }

  // empty seat: the real scene seat_bg sprite (ic_seat_empty_bg = 圆角方虚线框 + 号)，
  // 不是手绘圆。DOM 那层只留透明点击热区，视觉都在 Pixi。
  function buildPlaceholder(seat) {
    const c = new PIXI.Container()
    const sp = sizedSprite(SEAT_EMPTY_SRC, SEAT_EMPTY, SEAT_EMPTY)
    c.addChild(sp)
    c.position.set(seat.cx, seat.cy)
    return { container: c, kind: 'empty', tx: seat.cx, ty: seat.cy }
  }

  // ---- reconcile seats[] -> Pixi (create / update / remove) ----
  // A seat is built ONCE per player; rotation only retargets position (tweened in tick) and,
  // if the ring side changed, re-lays the cards in place. Never rebuild on move -> the avatar
  // + cards stay on screen and ride down to the bottom (fixes "cards only show after arrival").
  function render(seats) {
    const seen = new Set()
    for (const seat of seats) {
      seen.add(seat.nodeId)
      const has = !!seat.player
      const wantKind = has ? 'player' : 'empty'
      let view = seatViews.get(seat.nodeId)
      const seatUid = has ? (seat.player.userID ?? seat.player.userId) : null
      // 同 userId = 同一玩家留座（仅原地更新）；换人/换类型才重建。对齐 Unity 座位常驻。
      if (!view || view.kind !== wantKind || (has && view.userId !== seatUid)) {
        if (view) {
          stats.destroySeat++
          if (countdowns.has(seat.nodeId)) clearCountdown(seat.nodeId)
          seatLayer.removeChild(view.container)
          view.container.destroy({ children: true })
        }
        view = has ? buildSeat(seat) : buildPlaceholder(seat)
        view.kind = wantKind
        seatLayer.addChild(view.container)
        seatViews.set(seat.nodeId, view)
      } else if (has) {
        // same player -> retarget position (tween), relayout on side change, update reveal + 可变项
        view.tx = seat.cx
        view.ty = seat.cy
        if (view.side !== seat.side) {
          view.side = seat.side
          relayoutCards(view, seat)
        }
        const cards = Array.isArray(seat.player.cards) ? seat.player.cards : []
        // 中途坐下未入局：cards=[] → 隐藏残留牌背 + 牌型字（对齐 Unity GetEnptyHandCards）
        if (cards.length === 0) {
          view.cardSprites.forEach((sp) => { if (sp) sp.visible = false })
          if (view.cardType) view.cardType.visible = false
        } else {
          cards.forEach((card, i) => {
            let sp = view.cardSprites[i]
            // 该牌位 sprite 可能在上一手弃牌时被飞走并置空(playFold: cardSprites[i]=null)。
            //   buildSeat-once 设计下，同一玩家换手只走 update 不重建 → null 永不恢复 →
            //   「上一手弃过牌的玩家这一手整手不显示牌」。这里按需重建该牌位 sprite。
            //   ⚠️ 但**本手弃牌后不能重建**：playFold 刚把牌飞走并置空，若这里立刻重建 → 弃牌动画
            //      结束后座位上牌又出现（bug：其它玩家丢牌后牌还在）。故 folded 时跳过重建。
            //      新一手 recvStartInfor 会清 folded=false，届时才重建，正好恢复「上一手弃过牌者本手正常发牌」。
            if (!sp && !seat.player.folded) {
              stats.cardRebuild++
              const lay = view.lay || handLayout(seat.player.isSelf, seat.side)
              const slot = lay.slots && lay.slots[i]
              if (slot) {
                sp = sizedSpriteTex(card.faceUp ? cardFrontTex(card.value) : cardBackTex(), lay.size.w, lay.size.h)
                sp._cv = card.faceUp ? card.value : null
                sp.angle = slot.rot || 0
                sp.position.set(slot.dx, slot.dy)
                // 插在手牌应有的层级（庄钮/徽标/倒计时之下）：放到容器底层稍上，避免盖住头像之下
                view.container.addChild(sp)
                view.cardSprites[i] = sp
              }
            }
            // 换手换牌：同一 sprite 牌值/正反变化（如自己第二手新底牌）→ 换贴图（buildSeat-once
            //   设计下 update 分支原来只改 visible，第二把自己的牌会停留在上一手牌面）。
            if (sp && !sp._destroyed) {
              const wantCv = card.faceUp ? card.value : null
              if (sp._cv !== wantCv) {
                const lay = view.lay || handLayout(seat.player.isSelf, seat.side)
                setCardTex(sp, card.faceUp ? cardFrontTex(card.value) : cardBackTex(), lay.size.w, lay.size.h)
                sp._cv = wantCv
              }
            }
            // folded 座位隐藏残留牌（牌已飞走则 sp 为 null；未飞走的隐藏，避免「丢牌后牌还在」）。
            if (sp) sp.visible = seat.player.folded ? false : !!card.revealed
          })
          // 牌型字：仅两张都亮才显示；空数组时 [].every 为 true，必须先判 length
          if (seat.player.isSelf && cards.length >= 2) {
            if (!view.cardType) {
              view.cardType = makeText(tr(handTypeKey(cards)), { size: 34, fill: 0xffe08a, weight: '600' })
              view.cardType.y = CARD_TYPE_DY
              view.container.addChild(view.cardType)
            } else {
              view.cardType.text = tr(handTypeKey(cards))
            }
            view.cardType.visible = cards.every((k) => k.revealed)
          } else if (view.cardType) {
            view.cardType.visible = false
          }
        }
        updateSeatDynamic(view, seat.player) // 身家/动作徽标/弃牌压暗 原地刷新
      } else {
        // empty placeholder -> just retarget position
        view.tx = seat.cx
        view.ty = seat.cy
      }
    }
    // remove any stale views (seats no longer in the model)
    for (const [nodeId, view] of seatViews) {
      if (!seen.has(nodeId)) {
        if (countdowns.has(nodeId)) clearCountdown(nodeId)
        seatLayer.removeChild(view.container)
        view.container.destroy({ children: true })
        seatViews.delete(nodeId)
      }
    }
  }

  // ---- deal animation (Pixi), faithful to gameUI._showDealAnimation ----
  // occupiedSeats: [{ cx, cy, isSelf, side, nodeId }]; onReveal(nodeId, cardIdx) flips seat card.
  let dealToken = 0
  function playDeal(occupiedSeats, onReveal) {
    clearDeal()
    const token = ++dealToken
    occupiedSeats.forEach((seat, p) => {
      const lay = handLayout(seat.isSelf, seat.side)
      for (let ci = 0; ci < 2; ci++) {
        const startDelay = (p * DEAL_INTERVAL + ci * DEAL_CARD_INTERVAL) * 1000
        const target = { x: seat.cx + lay.anchor.dx, y: seat.cy + lay.anchor.dy }
        // 发牌旋转：牌从中心甩出时先带一个朝行进方向的翻甩角，途中回正到落位扇形角(slot.rot)。
        const rot1 = (lay.slots[ci] && lay.slots[ci].rot) || 0
        const rot0 = rot1 + (target.x >= ORIGIN.x ? DEAL_SPIN : -DEAL_SPIN)
        setTimeout(() => {
          if (token !== dealToken) return
          const sp = sizedSpriteTex(cardBackTex(), lay.size.w, lay.size.h)
          sp.position.set(ORIGIN.x, ORIGIN.y)
          sp.angle = rot0
          sp.alpha = 0
          dealLayer.addChild(sp)
          flying.push({ sp, t: 0, from: { ...ORIGIN }, to: target, rot0, rot1, token })
          playSound('dealcards2') // per-card deal sfx (cocos _showCardBackAnimation)
        }, startDelay)
        // real hole card materialises at mid-flight
        setTimeout(() => {
          if (token === dealToken) onReveal && onReveal(seat.nodeId, ci)
        }, startDelay + (DEAL_CARD / 2) * 1000)
      }
    })
  }
  function clearDeal() {
    dealToken++
    for (const f of flying) {
      if (f.sp.parent) f.sp.parent.removeChild(f.sp)
      f.sp.destroy()
    }
    flying.length = 0
  }

  // ---- fold animation (Pixi), faithful to seat/otherHdCards.foldCardWithAni + handCards.showFoldShade ----
  //   其它玩家：把该座位手牌(小牌背)从座位坐标系剥离到 dealLayer(世界系)，整组朝中心 logo 飞 + 延迟淡出，
  //     结束销毁；座位头像随之压暗，表示已弃牌(reset)。
  //   自己：手牌原地盖灰罩(压暗 + 去色)，不飞 —— 复刻 showFoldShade。
  function playFold(nodeId) {
    stats.playFold++
    const view = seatViews.get(nodeId)
    if (!view || view.kind !== 'player') return
    if (view.player.isSelf) {
      view.cardSprites.forEach((sp) => {
        if (sp) {
          sp.alpha = FOLD_SELF_DIM
          sp.tint = 0x808080
        }
      })
      if (view.cardType) view.cardType.alpha = FOLD_SELF_DIM
      view.folded = true
      return
    }
    const token = ++foldToken
    let flew = 0
    view.cardSprites.forEach((sp, idx) => {
      if (!sp || !sp.visible) return
      // 座位 container 在 (cx,cy)、牌在槽内 (dx,dy)、无缩放 → 世界坐标 = container + sprite。
      const from = { x: view.container.x + sp.x, y: view.container.y + sp.y }
      const ang = sp.angle
      dealLayer.addChild(sp) // 自动从座位 container 移除，改挂到世界系飞牌层
      sp.position.set(from.x, from.y)
      sp.angle = ang
      // 落点 = logo 中心 + 微偏（cocos：x 朝内 ±10、y 上移 20；本系屏幕坐标 y 向下 → 减 20）
      const to = { x: ORIGIN.x + (from.x > 0 ? -10 : 10), y: ORIGIN.y - 20 }
      folds.push({ sp, t: 0, from, to, token })
      view.cardSprites[idx] = null // 牌已转交飞牌层 → 置空，render 守卫 if(sp) 跳过
      flew += 1
    })
    // 兜底：座位此刻没有可飞的可见手牌（被 hideSeatCards 藏起/尚未发出/已清）时，
    //   合成两张牌背从座位手牌位飞向中心，保证弃牌「丢牌」动画一定出现（对齐 Cocos otherHdCards.foldCardWithAni）。
    if (!flew) {
      const lay = view.lay || handLayout(false, view.side)
      for (let i = 0; i < 2; i++) {
        const slot = lay.slots && lay.slots[i]
        if (!slot) continue
        const sp = sizedSpriteTex(cardBackTex(), lay.size.w, lay.size.h)
        const from = { x: view.container.x + (slot.dx || 0), y: view.container.y + (slot.dy || 0) }
        sp.position.set(from.x, from.y)
        sp.angle = slot.rot || 0
        dealLayer.addChild(sp)
        const to = { x: ORIGIN.x + (from.x > 0 ? -10 : 10), y: ORIGIN.y - 20 }
        folds.push({ sp, t: 0, from, to, token })
      }
    }
    view.folded = true
    if (view.avatarNodes) for (const n of view.avatarNodes) if (n) n.alpha = 0.45
  }
  function clearFolds() {
    foldToken++
    for (const f of folds) {
      if (f.sp.parent) f.sp.parent.removeChild(f.sp)
      f.sp.destroy()
    }
    folds.length = 0
  }

  // ---- 摊牌亮牌(#13) — seat.openCardForResult / handCards.setOpenCardsForResult / otherOpCards.setOpenCards ----
  // 暗罩 shade：盖在单张手牌上的近黑半透明罩（对齐 cocos card 节点子节点 "shade"）。
  //   随座位 container 走（与牌同一坐标系），渲染序紧贴在该牌之上。
  function buildCardShade(w, h) {
    const g = new PIXI.Graphics()
    g.beginFill(SHADE_COLOR, SHADE_ALPHA)
      .drawRoundedRect(-w / 2, -h / 2, w, h, Math.min(w, h) * 0.12)
      .endFill()
    return g
  }
  // 原地翻面（showCardAni）：scale.x 1→0.01 换正面贴图 →1，单边 openCard=0.2s。
  //   牌 sprite 用 width/height 定尺寸（= scale），故记录基准 scale 后在其上做翻转插值。
  function flipHandCard(sp, value, w, h, onFlipped) {
    const baseSX = sp.scale.x
    const baseSY = sp.scale.y
    showFlips.push({ sp, t: 0, value, w, h, baseSX, baseSY, swapped: false, onFlipped })
  }
  // playShowdown(participants) — participants: [{ nodeId, hole:[v1,v2], best5:[..5..], winner:bool, cat }]
  //   未在 participants 内的已弃牌座位不动（其牌已由 playFold 处理）。
  //   时序：座位按入参顺序、间隔 RESULT_ROUND 依次开牌；每座两张牌翻面后盖暗罩、
  //   命中 best5 的牌取消暗罩；winner 牌型转金(cat>=STRAIGHT) + 金环。
  function playShowdown(participants, opts = {}) {
    clearShowdown()
    const token = ++showToken
    const stagger = opts.stagger != null ? opts.stagger : RESULT_ROUND
    participants.forEach((pt, idx) => {
      setTimeout(() => {
        if (token !== showToken) return
        revealSeatShowdown(pt, token)
      }, idx * stagger * 1000)
    })
  }
  // 翻面落定后盖暗罩（命中 best5 = 高亮则不盖）。aboveSp 决定渲染序（紧贴该牌之上）。
  function addShadeFor(view, x, y, w, h, angle, bright, aboveSp, token) {
    if (token !== showToken || bright) return
    // 翻牌 flip 是异步回调：期间牌 sprite 可能已被弃牌置空/座位重建摘走 → 不再是本容器子节点，
    //   getChildIndex 会抛「must be a child of the caller」；牌都不在了，暗罩也没意义，直接跳过。
    if (!aboveSp || aboveSp.parent !== view.container) return
    const shade = buildCardShade(w, h)
    shade.position.set(x, y)
    shade.angle = angle || 0
    shade.alpha = 0
    const idx = view.container.getChildIndex(aboveSp)
    view.container.addChildAt(shade, idx + 1)
    showShades.push({ g: shade, fadeIn: true })
  }
  function revealSeatShowdown(pt, token) {
    const view = seatViews.get(pt.nodeId)
    if (!view || view.kind !== 'player') return
    const isSelf = !!view.player.isSelf
    const best5 = pt.best5 || []
    playSound('fagongpai1') // 开牌音（对齐发公牌/翻牌的轻翻面音）
    if (isSelf) {
      // 自己：optUser/handCards 原位大牌（座位下方 dy=188）原地翻面。
      const lay = view.lay
      view.cardSprites.forEach((sp, i) => {
        if (!sp) return
        // cards 可能已被清空（151/StartInfor 后 canPlay=false → cards=[]），补 null 守卫防中断
        const value = pt.hole && pt.hole[i] != null ? pt.hole[i] : view.player.cards[i]?.value
        if (value == null) return
        const slot = lay.slots[i]
        sp.visible = true
        flipHandCard(sp, value, lay.size.w, lay.size.h, () =>
          addShadeFor(view, slot.dx, slot.dy, lay.size.w, lay.size.h, slot.rot || 0, best5.includes(value), sp, token),
        )
      })
      // 牌型文字：更新为成手牌名；转金仅顺子级以上（setWinnerCardsTypeColor），其余白。
      if (view.cardType) {
        view.cardType.visible = true
        if (pt.catLabel) view.cardType.text = pt.catLabel
        view.cardType.style.fill = pt.winner && pt.cat >= 4 ? 0xffd23b : 0xffffff // HAND_CAT.STRAIGHT
      }
    } else {
      // 他人：隐藏小牌背(otherHdCards.reset)，改用 otherOpCards 大牌(108×154.2)居中盖在头像位置翻面。
      view.cardSprites.forEach((sp) => {
        if (sp) sp.visible = false
      })
      if (!view._sdOpenCards) view._sdOpenCards = []
      for (let i = 0; i < 2; i++) {
        const value = pt.hole && pt.hole[i] != null ? pt.hole[i] : view.player.cards[i]?.value
        if (value == null) continue
        const x = i === 0 ? -OTHER_OPEN.dx : OTHER_OPEN.dx
        const y = -OTHER_OPEN.dy // cocos y 上为正 → 屏幕 y 向下取负
        const sp = sizedSpriteTex(cardBackTex(), OTHER_OPEN.w, OTHER_OPEN.h)
        sp._cv = value // 记录牌值，供 restyle 换皮
        sp.position.set(x, y)
        view.container.addChild(sp) // 置于最上：大牌盖在头像之上
        view._sdOpenCards.push(sp)
        flipHandCard(sp, value, OTHER_OPEN.w, OTHER_OPEN.h, () =>
          addShadeFor(view, x, y, OTHER_OPEN.w, OTHER_OPEN.h, 0, best5.includes(value), sp, token),
        )
      }
    }
    // 赢家金环（沿用 playWin 的 glow 脉冲思路，轻量常驻）
    if (pt.winner) addWinnerGlow(view)
  }
  function addWinnerGlow(view) {
    if (view._sdGlow) return
    const glow = new PIXI.Graphics()
    // 金环画在最底层（半径在头像金框之外，仍可见），避免遮挡头像/手牌。
    view.container.addChildAt(glow, 0)
    view._sdGlow = glow
  }
  // 安全销毁 PIXI 节点：跳过已销毁的（refCount 为 null）。摊牌暗罩/大牌/金环是座位 container 的子节点，
  //   若座位被 render() 重建/移除（如玩家结算期离座）→ container.destroy({children:true}) 已连带销毁它们，
  //   而 showShades/_sdGlow/_sdOpenCards 仍持旧引用 → 再 destroy 会读 null.refCount 崩溃 → 房间卡死。
  function safeDestroy(node) {
    if (!node || node._destroyed) return
    try {
      if (node.parent) node.parent.removeChild(node)
      node.destroy()
    } catch { /* 已随父容器销毁，忽略 */ }
  }
  function clearShowdown() {
    showToken++
    showFlips.length = 0
    for (const sh of showShades) safeDestroy(sh.g)
    showShades.length = 0
    for (const view of seatViews.values()) {
      // 移除他人摊牌大牌，并恢复小牌背显示（按模型 revealed）
      if (view._sdOpenCards) {
        for (const sp of view._sdOpenCards) safeDestroy(sp)
        view._sdOpenCards = null
      }
      if (view.kind === 'player' && view.cardSprites && view.player) {
        view.cardSprites.forEach((sp, i) => {
          // ⚠️ 手牌模型可能已变短/清空（151 清台后 canPlay=false → applyModelToSeats cards=[]，
          //   而 cardSprites 仍留着上一手的两张 sprite）——读 cards[i].revealed 会抛
          //   「Cannot read properties of undefined」→ 整条 recvStartInfor/recvRoundFinish 链中断
          //   → 公共牌永远清不掉（2026-07-21 问题2 根因）。缺牌位一律隐藏。
          const card = view.player.cards && view.player.cards[i]
          if (sp && !sp._destroyed) sp.visible = !!(card && card.revealed)
        })
      }
      if (view._sdGlow) {
        safeDestroy(view._sdGlow)
        view._sdGlow = null
      }
      if (view.kind === 'player' && view.cardType && !view.cardType._destroyed) view.cardType.style.fill = 0xffe08a
    }
  }

  // ---- 清场 / 下一手 #15（gameUI.cleanNotify）----
  // cleanNotify 真值：pot.resetThan + 复位座位 + 每座 cleanGameInfo(清手牌/下注/状态) + comCards.reset
  //   + setTotalPot(0) + 关看牌——本质是**重置**（收池已在结算 #14 的 shouchouma 完成）。
  //   为避免「啪」一下硬切，这里给公牌/手牌/摊牌牌补一段轻量「收牌」：淡出 + 收向中心 logo（CLEAR_FADE），
  //   收完再统一重置 board/pot/下注/庄盲标记/各特效状态；玩家保持在座，等下一手重新发牌。
  function playClear(onDone) {
    const token = ++clearToken
    // owned=true 的 disp 由收牌动画负责销毁；公牌 slot 节点 owned=false（交 clearCommunity 销毁）
    const collect = (disp, from, owned) => {
      clears.push({ disp, from, to: { x: ORIGIN.x, y: ORIGIN.y }, t: 0, owned })
    }
    // 公牌：每张可见 slot 收向中心（节点在 comLayer，世界系）
    for (const slot of comSlots) {
      if (slot.node && slot.node.visible) collect(slot.node, { x: slot.node.x, y: slot.node.y }, false)
    }
    // 座位手牌 + 摊牌大牌：剥离到 dealLayer(世界系) 再收向中心
    for (const view of seatViews.values()) {
      if (view.kind !== 'player') continue
      const grab = (sp) => {
        if (!sp || !sp.visible) return
        const from = { x: view.container.x + sp.x, y: view.container.y + sp.y }
        dealLayer.addChild(sp)
        sp.position.set(from.x, from.y)
        collect(sp, from, true)
      }
      view.cardSprites.forEach(grab)
      if (view._sdOpenCards) view._sdOpenCards.forEach(grab)
      view.cardSprites.fill(null) // 已转交收牌层 → 置空，避免 clearShowdown 再处理
      view._sdOpenCards = null
    }
    // 收完后统一重置（对齐 cleanNotify）
    setTimeout(() => {
      if (token !== clearToken) return
      // 销毁仍在途的 owned 收牌牌；公牌 slot 节点留给 clearCommunity
      for (let i = clears.length - 1; i >= 0; i--) {
        const c = clears[i]
        if (c.owned) {
          if (c.disp && c.disp.parent) c.disp.parent.removeChild(c.disp)
          if (c.disp && c.disp.destroy) c.disp.destroy({ children: true })
        }
      }
      clears.length = 0
      clearCommunity()
      clearShowdown()
      for (const id of [...wins.keys()]) clearWin(id)
      clearAllins()
      clearFolds()
      clearBets()
      clearPot()
      clearDealer()
      // 复位座位头像压暗（弃牌/All-In 造成的 dim）+ 牌型文字色
      for (const view of seatViews.values()) {
        if (view.kind !== 'player') continue
        if (view.avatarNodes) for (const n of view.avatarNodes) if (n) n.alpha = 1
        view.folded = false
        if (view.cardType) {
          view.cardType.visible = false
          view.cardType.style.fill = 0xffe08a
        }
      }
      onDone && onDone()
    }, CLEAR_FADE * 1000)
  }
  function clearClears() {
    clearToken++
    for (const c of clears) {
      if (c.owned && c.disp && c.disp.parent) c.disp.parent.removeChild(c.disp)
      if (c.owned && c.disp && c.disp.destroy) c.disp.destroy({ children: true })
    }
    clears.length = 0
  }

  // ---- 送礼物 DragonBones（逆向 spingoAnimationLayer：道具飞行 + 落点骨骼 burst）----
  const GIFT_FLIGHT_DUR = 0.7 // startAni moveTo .7s（meigui/kiss 类 1s，这里统一 .7 近似）
  const GIFT_FLY_ICON = 104 // 飞行图标显示基准(最长边 px)，对应 cocos toolsIcon 节点 scale 1.44
  // 飞行段道具图标：用真 toolsIcon 贴图（anima/toolsIcon/{type}.png），按最长边等比缩放、保持原图比例。
  //   贴图异步加载，未 valid 前先按基准尺寸占位，loaded 后按原图宽高比重设。
  function buildGiftFlyIcon(type) {
    const tex = PIXI.Texture.from(giftIconSrc(type))
    const sp = new PIXI.Sprite(tex)
    sp.anchor.set(0.5)
    const apply = () => {
      if (!sp.transform) return // 已销毁（异步回调晚于 clearGifts）
      const bw = (tex.orig && tex.orig.width) || tex.baseTexture.realWidth || GIFT_FLY_ICON
      const bh = (tex.orig && tex.orig.height) || tex.baseTexture.realHeight || GIFT_FLY_ICON
      const k = GIFT_FLY_ICON / Math.max(bw, bh)
      sp.width = bw * k
      sp.height = bh * k
    }
    if (tex.baseTexture && tex.baseTexture.valid) apply()
    else {
      sp.width = sp.height = GIFT_FLY_ICON
      tex.baseTexture.once('loaded', apply)
    }
    return sp
  }
  // 送礼者→受赠者：道具图标沿带上凸的抛物线飞（番茄/炸弹边飞边翻滚），落点播该礼物骨骼一次。
  function giftPosOf(nodeId) {
    const v = seatViews.get(nodeId)
    if (!v) return null
    return { x: v.container.x, y: v.container.y }
  }
  function playGift(fromNodeId, toNodeId, type, onDone) {
    const cfg = GIFT_CFG[type]
    if (!cfg) return
    const from = giftPosOf(fromNodeId)
    const to = giftPosOf(toNodeId)
    if (!from || !to) return
    const token = giftToken
    const orb = buildGiftFlyIcon(type) // 真 toolsIcon 2D 道具图标
    orb.position.set(from.x, from.y)
    giftLayer.addChild(orb)
    // 抛物线控制点：取中点上抬（屏幕 y 向下 → 减），形成上凸轨迹。
    const ctrl = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - 180 }
    giftFlights.push({ orb, t: 0, from, to, ctrl, type, token, onDone, spin: !!cfg.spin })
  }
  function disposeGiftDisplay(display, isSpine) {
    try {
      if (display.parent) display.parent.removeChild(display)
      if (isSpine) display.destroy({ children: true })
      else display.dispose && display.dispose()
    } catch (e) { void e }
  }
  async function spawnGiftBurst(type, to, token, onDone) {
    const cfg = GIFT_CFG[type]
    const isSpine = giftEngine(type) === 'spine'
    let display
    try {
      if (isSpine) {
        const data = await ensureSpineGift(type)
        display = buildSpineGift(data)
      } else {
        display = await buildGiftDisplay(type)
      }
    } catch (e) {
      console.warn('build gift burst failed', type, e)
      onDone && onDone()
      return
    }
    if (token !== giftToken || !display) {
      if (display) disposeGiftDisplay(display, isSpine)
      else onDone && onDone()
      return
    }
    display.position.set(to.x + cfg.dx, to.y + cfg.dy)
    display.scale.set(cfg.scale, cfg.scale)
    if (cfg.flipOnRight && to.x > 0) display.scale.x = -cfg.scale // 受赠者在右半区 → 水平翻转
    giftLayer.addChild(display)
    const rec = { display, token, isSpine }
    giftDisplays.push(rec)
    const cleanup = () => {
      const i = giftDisplays.indexOf(rec)
      if (i < 0) return // 已清理（避免 spine complete 多次触发 / clearGifts 竞争）
      giftDisplays.splice(i, 1)
      if (rec.timeout) clearTimeout(rec.timeout)
      disposeGiftDisplay(display, isSpine)
      onDone && onDone()
    }
    if (isSpine) {
      // pixi-spine：autoUpdate 关闭，改由 tick 手动 update(dt)；播放一次 defaultAnima，complete 后清理（+life 兜底）。
      display.autoUpdate = false
      if (display.state && cfg.timeScale) display.state.timeScale = cfg.timeScale
      try {
        display.state.addListener({ complete: cleanup })
        display.state.setAnimation(0, cfg.anim, !!cfg.loop)
      } catch (e) { console.warn('gift spine play err', type, e); cleanup(); return }
      rec.timeout = setTimeout(cleanup, Math.round((cfg.life || 3) * 1000))
    } else {
      display.on(GIFT_COMPLETE, cleanup)
      try { display.animation.play('Animation1', 1) } catch (e) { console.warn('gift db play err', e); cleanup(); return }
    }
    if (cfg.sound) { try { playSound(cfg.sound) } catch (e) { void e } }
  }
  function clearGifts() {
    giftToken++
    for (const f of giftFlights) {
      if (f.orb.parent) f.orb.parent.removeChild(f.orb)
      f.orb.destroy()
    }
    giftFlights.length = 0
    for (const rec of giftDisplays) {
      if (rec.timeout) clearTimeout(rec.timeout)
      disposeGiftDisplay(rec.display, rec.isSpine)
    }
    giftDisplays.length = 0
  }

  // ---- countdown = 两套可切换效果 ----
  //   style='fuse' : 牛仔「放炮点引子(导火索)燃烧」(雷达暗罩 + 沿金框火点 + 火星)；
  //   style='ring' : 德州经典进度环 (edge.js: 绿→红环 + loopDot + 中心Ns)。
  function drawCountdown(cd) {
    if (cd.phase !== 'countdown') return
    const progress = cd.maxTime > 0 ? Math.max(0, cd.remaining / cd.maxTime) : 0
    const TOP = -Math.PI / 2
    if (cd.style === 'ring') {
      // 德州经典环：从顶部顺时针画「剩余」弧 (跨度 = progress*2π)，绿(满)→红(空) 渐变，
      //   loopDot 跟在剩余弧的前端(领先边)，中心 Ns。
      const col = lerpColor(RING_RED, RING_GREEN, progress)
      const ring = cd.ring
      ring.clear()
      if (progress > 0.001) {
        ring.lineStyle(RING_LW, col, 1)
        ring.arc(0, 0, cd.R, TOP, TOP + progress * Math.PI * 2, false)
      }
      const ang = TOP + progress * Math.PI * 2
      cd.dot.clear()
      cd.dot.beginFill(col).drawCircle(0, 0, RING_DOT_R).endFill()
      cd.dot.beginFill(0xffffff, 0.85).drawCircle(0, 0, RING_DOT_R * 0.45).endFill()
      cd.dot.position.set(cd.R * Math.cos(ang), cd.R * Math.sin(ang))
      cd.dot.visible = progress > 0
      cd.label.text = Math.ceil(Math.max(0, cd.remaining)) + 's'
      return
    }
    const lead = TOP + (1 - progress) * Math.PI * 2 // sweep line / burning point (clockwise from top)
    // 雷达扫描式暗罩：只有「还没扫到」的扇区(从扫描线顺时针绕回顶部)保持暗，扫过的已揭开。
    const sc = cd.scrim
    sc.clear()
    if (progress > 0.001) {
      sc.beginFill(SCRIM_COLOR, SCRIM_ALPHA)
      sc.moveTo(0, 0)
      sc.arc(0, 0, SCRIM_R, lead, TOP + Math.PI * 2, false) // 跨度 = progress*2π
      sc.lineTo(0, 0)
      sc.endFill()
    }
    cd.flame.position.set(FUSE_R * Math.cos(lead), FUSE_R * Math.sin(lead))
    cd.flame.visible = progress > 0
    cd.label.text = Math.ceil(Math.max(0, cd.remaining)) + 's'
  }
  // an additive ember sprite that scales by natural texture size (so we can animate px size
  // without fighting Sprite.width's internal scale). Hidden until its texture is valid.
  function emberSprite(px) {
    const tex = PIXI.Texture.from(PARTICLE_SRC)
    const sp = new PIXI.Sprite(tex)
    sp.anchor.set(0.5)
    sp.blendMode = PIXI.BLEND_MODES.ADD
    const apply = () => {
      if (!sp.transform) return // 已 destroy → 跳过（异步纹理回调晚于销毁）
      sp._unit = 1 / (tex.orig?.width || tex.baseTexture.realWidth || 32)
      sp.scale.set(px * sp._unit)
    }
    if (tex.baseTexture && tex.baseTexture.valid) apply()
    else {
      sp.alpha = 0
      tex.baseTexture.once('loaded', apply)
    }
    return sp
  }
  // (re)spawn one scattered spark off the burning point: random outward/upward fan, varied
  // speed + lifetime so they spray sparsely (不是集中的蜡烛火焰). initial=true staggers ages.
  function spawnEmber(e, initial) {
    const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.5 // upward fan, wide
    const spd = 16 + Math.random() * 40
    e.vx = Math.cos(ang) * spd
    e.vy = Math.sin(ang) * spd
    e.x = (Math.random() - 0.5) * 5
    e.y = (Math.random() - 0.5) * 5
    e.life = 0.3 + Math.random() * 0.6
    e.age = initial ? Math.random() * e.life : 0
    e.size = 2.5 + Math.random() * 5.5
    return e
  }
  function buildFlame() {
    const flame = new PIXI.Container()
    // small hot core (glowTip) — a burning point on the fuse, NOT a big candle flame
    const core = sizedSprite(SPARK_FLASH_SRC, 20, 20)
    core.tint = 0xffcf6a
    core.blendMode = PIXI.BLEND_MODES.ADD
    flame.addChild(core)
    // sparse scattered embers spraying off the burning point (particle_spark)
    const embers = []
    for (let i = 0; i < EMBER_COUNT; i++) {
      const e = spawnEmber({ sp: emberSprite(6) }, true)
      e.sp.tint = i % 3 === 0 ? 0xffe27a : i % 3 === 1 ? 0xff9a2e : 0xff6a18
      flame.addChild(e.sp)
      embers.push(e)
    }
    flame._core = core
    flame._embers = embers
    return flame
  }
  function makeCountdownLabel() {
    const label = new PIXI.Text('', {
      fontFamily: 'Microsoft YaHei, system-ui, sans-serif',
      fontSize: COUNTDOWN_LABEL_FS,
      fontWeight: '700',
      fill: 0xffffff,
      stroke: 0x000000,
      strokeThickness: 4,
      align: 'center',
    })
    label.anchor.set(0.5)
    label.y = COUNTDOWN_LABEL_Y
    label._isSceneText = true
    label.resolution = Math.max(1, Math.ceil((window.devicePixelRatio || 1) * s))
    return label
  }
  // 安全计算「手牌之下」的插入层级：手牌 sprite 可能为 null（弃牌飞走置空）或已脱离容器（藏牌/转交飞牌层），
  //   此时 container.getChildIndex(...) 会抛「must be a child of the caller」。仅当第一张手牌确为本容器子节点
  //   时取其层级，否则插到最顶（children.length）。所有「插在手牌之下」的覆盖层(倒计时/赢家/全下/暗罩)共用。
  function cardZInsertIdx(container, cardSprites) {
    const first = cardSprites && cardSprites[0]
    return (first && first.parent === container) ? container.getChildIndex(first) : container.children.length
  }
  function mountCountdownNodes(view, style) {
    const label = makeCountdownLabel()
    // 倒计时层插在「手牌之下」（手牌可能被藏/弃 → 统一走 cardZInsertIdx 安全取层级）。
    const insertIdx = cardZInsertIdx(view.container, view.cardSprites)
    if (style === 'ring') {
      // 德州经典环：底环(暗槽) -> 进度环(绿→红) -> loopDot -> 居中Ns，全部在头像之上、牌之下。
      const bgRing = new PIXI.Graphics()
      const ring = new PIXI.Graphics()
      const dot = new PIXI.Graphics()
      view.container.addChildAt(bgRing, insertIdx)
      view.container.addChildAt(ring, insertIdx + 1)
      view.container.addChildAt(dot, insertIdx + 2)
      view.container.addChildAt(label, insertIdx + 3)
      return { style, bgRing, ring, dot, label }
    }
    // fuse（牛仔放炮）：① 雷达扫描式暗罩(扇形，每帧重绘) -> ② 沿金环燃点 flame -> ③ 居中Ns。
    const scrim = new PIXI.Graphics()
    const flame = buildFlame()
    view.container.addChildAt(scrim, insertIdx)
    view.container.addChildAt(flame, insertIdx + 1)
    view.container.addChildAt(label, insertIdx + 2)
    return { style, scrim, flame, label }
  }
  function startCountdown(nodeId, seconds, style = 'fuse') {
    clearCountdown(nodeId)
    const view = seatViews.get(nodeId)
    if (!view || !view.player) return
    const nodes = mountCountdownNodes(view, style)
    const cd = {
      ...nodes,
      view,
      style,
      phase: 'countdown',
      remaining: seconds,
      maxTime: seconds,
      flick: 0,
      alerted: false, // 临近超时提醒只触发一次
      shakeT: 0,
    }
    if (style === 'ring') {
      // 环半径贴在金框外缘内侧；底环只画一次(暗槽)，进度环/光点每帧由 drawCountdown 重绘。
      cd.R = GOLD_OUTER_R - 2
      cd.bgRing.lineStyle(RING_LW, RING_BG, RING_BG_ALPHA).drawCircle(0, 0, cd.R)
    }
    countdowns.set(nodeId, cd)
    drawCountdown(cd)
    // 起手音 = PlayerTurn(pturn)，Cocos 里**仅轮到自己**才播；他人回合静音。
    if (view.player.isSelf) playSound('pturn')
  }
  // 把因超时抖动而旋转的手牌摆回各自插槽角度（stopCardShake 等价）
  function restoreCardAngles(cd) {
    const v = cd.view
    if (!v || !v.cardSprites) return
    v.cardSprites.forEach((sp, i) => {
      if (sp) sp.angle = v.lay?.slots?.[i]?.rot || 0
    })
  }
  function clearCountdown(nodeId) {
    const cd = countdowns.get(nodeId)
    if (!cd) return
    restoreCardAngles(cd) // 收尾把抖动的手牌摆正
    ;[cd.scrim, cd.flame, cd.bgRing, cd.ring, cd.dot, cd.label].forEach((n) => {
      if (n && n.parent) n.parent.removeChild(n)
      n && n.destroy()
    })
    countdowns.delete(nodeId)
  }
  // 是否某座正在倒计时（避免同操作位被重复重启 → 导火索每事件重置闪烁）。
  function hasCountdown(nodeId) {
    return countdowns.has(nodeId)
  }
  // 权威清理：停掉**除 keepNodeId 外**所有座位的倒计时。每次模型更新调用 →
  //   根治「换操作位后旧导火索还在烧」「座位重建残留」「结算/准备阶段未停」等一切残留场景。
  //   keepNodeId<0（无人操作）时清空全部。
  function clearCountdownExcept(keepNodeId) {
    for (const id of [...countdowns.keys()]) {
      if (id !== keepNodeId) clearCountdown(id)
    }
  }

  // ---- win / settlement celebration (playWinnerAnimation + coinChanged) ----
  // 下注堆 / 盈利数字 = WPK FormatParser.FormatKNotation（Holdem_Stake_ts coinMode==2）。
  const fmtAmount = (n) => formatKNotation(n)
  const easeBack = (t) => {
    const c = 1.7
    const u = t - 1
    return 1 + (c + 1) * u * u * u + c * u * u
  }
  // cc.easeInOut(2) ≈ 二次缓入缓出（下注/入池筹码直线移动曲线）。
  const easeInOutQuad = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
  const buildChip = (size = CHIP_DISP) => sizedSprite(CHIP_SRC, size, size)
  function buildCoin(r) {
    const g = new PIXI.Graphics()
    g.beginFill(0xc8860b).drawCircle(0, 0, r).endFill() // rim
    g.beginFill(0xf6c64b).drawCircle(0, 0, r - 2).endFill() // body
    g.beginFill(0xffe9a8, 0.95).drawCircle(0, 0, r * 0.5).endFill() // highlight
    return g
  }
  // self win = YouWin.anim：You(左)/Win(右) 滑入中央 + Flare 扫光 + 火花。返回各动画节点供 tick 驱动。
  function buildYouWin() {
    const root = new PIXI.Container()
    root.scale.set(YOUWIN_SCALE)
    root.y = YOUWIN_DY
    // Flare_1 在 You/Win 之间/之后做粉色扫光（加色混合）
    const flareWrap = new PIXI.Container()
    const flare = sizedSprite(YOUWIN_FLARE_SRC, FLARE_W, FLARE_H)
    flare.tint = FLARE_TINT
    flare.blendMode = PIXI.BLEND_MODES.ADD
    flare.alpha = 0
    flareWrap.addChild(flare)
    // You（从左滑入）；用 wrapper 承载 scale 弹跳，sprite 自身保持 native 尺寸
    const youWrap = new PIXI.Container()
    youWrap.addChild(sizedSprite(YOUWIN_YOU_SRC, YOU_W, YOU_H))
    youWrap.x = YOU_FROM_X
    youWrap.alpha = 0
    // Win（从右滑入）
    const winWrap = new PIXI.Container()
    winWrap.addChild(sizedSprite(YOUWIN_WIN_SRC, WIN_W, WIN_H))
    winWrap.x = WIN_FROM_X
    winWrap.alpha = 0
    root.addChild(flareWrap, youWrap, winWrap)
    // particlesystem_YouWin：金色火花从汇合处四散（0.15~2.25s 激活）
    const sparks = []
    for (let i = 0; i < 14; i++) {
      const sp = sizedSprite(PARTICLE_SRC, 18, 18)
      sp.tint = i % 2 ? 0xffe27a : 0xfff3c0
      sp.blendMode = PIXI.BLEND_MODES.ADD
      sp.visible = false
      root.addChild(sp)
      sparks.push({ sp, ang: (i / 14) * Math.PI * 2 + Math.random(), ph: Math.random() })
    }
    return { root, flareWrap, flare, youWrap, winWrap, sparks }
  }
  // other win = 单张 "WIN"(font_anim_win_pkw) 居中弹出（easeBack），无左右滑入
  function buildOtherWin() {
    const wrap = new PIXI.Container()
    const winW = (257 * WIN_OTHER_H) / 91
    wrap.addChild(sizedSprite(WIN_OTHER_SRC, winW, WIN_OTHER_H))
    return wrap
  }
  // 德州桌真帧动画 YOU WIN（win_light_self_pkw / win_light_opposite_pkw）。返回节点供 tick 按关键帧驱动。
  function buildPkwWin(isSelf) {
    const root = new PIXI.Container()
    root.scale.set(PKW_SCALE)
    root.y = PKW_DY
    // 底层横向闪光条 flash01（5 帧翻书，ADD）；wrapper 承载动画缩放，sprite 自身保持 307×33。
    const flashWrap = new PIXI.Container()
    flashWrap.alpha = 0
    const flash = sizedSprite(PKW_FLASH_TEX[0], PKW_FLASH_W, PKW_FLASH_H)
    flash.blendMode = PIXI.BLEND_MODES.ADD
    flashWrap.addChild(flash)
    root.addChild(flashWrap)
    // 3 光球（13 帧翻书，ADD），wrapper 承载 self_side 变换(位置/旋转/缩放)，sprite 保持 55×55。
    const balls = PKW_BALLS.map((b) => {
      const wrap = new PIXI.Container()
      wrap.position.set(b.x, b.y)
      wrap.angle = b.rot
      wrap.scale.set(b.sx, b.sy)
      wrap.alpha = 0
      const sp = sizedSprite(PKW_BALL_TEX[0], PKW_BALL, PKW_BALL)
      sp.blendMode = PIXI.BLEND_MODES.ADD
      wrap.addChild(sp)
      root.addChild(wrap)
      return { wrap, sp, cfg: b }
    })
    let you = null
    let youLight = null
    let win = null
    let winLight = null
    if (isSelf) {
      // YOU + WIN 两字（锚 0.5，按中心坐标滑入）；_Light = 同字 sprite ADD 扫光
      you = sizedSprite(PKW_YOU_SRC, PKW_YOU_W, PKW_YOU_H)
      youLight = sizedSprite(PKW_YOU_SRC, PKW_YOU_W, PKW_YOU_H)
      youLight.blendMode = PIXI.BLEND_MODES.ADD
      youLight.alpha = 0
      win = sizedSprite(PKW_WIN_SRC, PKW_WIN_W, PKW_WIN_H)
      winLight = sizedSprite(PKW_WIN_SRC, PKW_WIN_W, PKW_WIN_H)
      winLight.blendMode = PIXI.BLEND_MODES.ADD
      winLight.alpha = 0
      root.addChild(you, youLight, win, winLight)
    } else {
      // 别人赢：单张 WIN 居中，整体 scale 弹入
      win = sizedSprite(PKW_WIN_SRC, PKW_WIN_W, PKW_WIN_H)
      win.x = 0
      root.addChild(win)
    }
    // particlesystem_YouWin（真值见 prefab>Node_YouWin）：25 颗星粒在 ±250×±40 横带内**原地**
    //   闪烁(speed/gravity=0)，life 0.4±0.1，size 80±30，startSpin 45→endSpin 30，
    //   起色(255,158,255)→白，ADD 加色；duration 1.3s @ rate 25/s。运行期与帧动画合成，仅自己赢时播。
    const sparks = isSelf
      ? Array.from({ length: PKW_SPARK_N }, (_, i) => {
          const size = 80 + (Math.random() * 2 - 1) * 30
          const sp = sizedSprite(PARTICLE_SRC, size, size)
          sp.blendMode = PIXI.BLEND_MODES.ADD
          sp.visible = false
          sp.position.set((Math.random() * 2 - 1) * 250, (Math.random() * 2 - 1) * 40)
          root.addChild(sp)
          return {
            sp,
            born: PKW_SPARK_T0 + i * (1.3 / PKW_SPARK_N),
            life: 0.4 + (Math.random() * 2 - 1) * 0.1,
            spin0: 45 + (Math.random() * 2 - 1) * 25,
            spin1: 30 + (Math.random() * 2 - 1) * 20,
          }
        })
      : null
    return { root, isSelf, flashWrap, flash, balls, you, youLight, win, winLight, sparks }
  }
  // 换一帧翻书贴图并保持显示尺寸（texture 换图后宽高需重设，避免不同帧 originalSize 改变尺寸）。
  function setFrame(sp, url, w, h) {
    sp.texture = PIXI.Texture.from(url)
    sp.width = w
    sp.height = h
  }
  // 按 win_light_self/opposite_pkw 关键帧驱动德州字帧动画（t 秒）。
  function pkwTick(pkw, t) {
    // self_side / opposite_side 整体 opacity：self 255@1.583→0@2；other 255@1.667→0@2。
    const fadeStart = pkw.isSelf ? 1.583 : 1.667
    pkw.root.alpha = t < fadeStart ? 1 : Math.max(0, (PKW_DUR - t) / (PKW_DUR - fadeStart))
    if (pkw.isSelf) {
      // YOU/WIN 滑入（中心坐标，cubicOut 0~0.25s）
      const k = cubicOut(Math.min(1, t / 0.25))
      pkw.you.x = PKW_YOU_C_FROM + (PKW_YOU_C_TO - PKW_YOU_C_FROM) * k
      pkw.win.x = PKW_WIN_C_FROM + (PKW_WIN_C_TO - PKW_WIN_C_FROM) * k
      // _Light 扫光（同字 sprite, ADD）：opacity 0@0.25→1@0.417→0@0.667，位置跟随基字
      const lit = sampleKf([[0.25, 0], [0.4167, 1], [0.667, 0]], t)
      pkw.youLight.x = pkw.you.x
      pkw.winLight.x = pkw.win.x
      pkw.youLight.alpha = lit
      pkw.winLight.alpha = lit
    } else {
      // 别人赢：整体 scale 0→1 弹入(overshoot, 0~0.417s)；WIN 居中
      const ps = t < 0.4167 ? easeBack(t / 0.4167) : 1
      pkw.root.scale.set(PKW_SCALE * ps)
    }
    // flash01 横向闪光条：opacity 脉冲 + 横向拉伸 + 5 帧翻书（0.083~0.5s）
    pkw.flashWrap.alpha = sampleKf([[0.083, 0], [0.167, 1], [0.317, 1], [0.5, 0]], t)
    const fsx = sampleKf([[0.083, 0], [0.25, 2], [0.5, 3]], t)
    const fsy = sampleKf([[0.083, 1], [0.25, 1], [0.5, 0]], t)
    pkw.flashWrap.scale.set(fsx, fsy)
    if (pkw.flashWrap.alpha > 0) {
      const fk = Math.min(0.999, Math.max(0, (t - 0.083) / (0.317 - 0.083)))
      const fi = Math.min(4, Math.floor(fk * 5))
      if (pkw._flashFrame !== fi) {
        pkw._flashFrame = fi
        setFrame(pkw.flash, PKW_FLASH_TEX[fi], PKW_FLASH_W, PKW_FLASH_H)
      }
    }
    // 3 光球：opacity envelope + 13 帧翻书（按各自 frameSpan）
    for (const b of pkw.balls) {
      const a = sampleKf(b.cfg.env, t)
      b.wrap.alpha = a
      if (a <= 0) continue
      const [s0, s1] = b.cfg.frameSpan
      const bk = Math.min(0.999, Math.max(0, (t - s0) / (s1 - s0)))
      const bi = Math.min(12, Math.floor(bk * 13))
      if (b._frame !== bi) {
        b._frame = bi
        setFrame(b.sp, PKW_BALL_TEX[bi], PKW_BALL, PKW_BALL)
      }
    }
    // particlesystem_YouWin：原地闪烁星粒（无位移，仅自旋 + 淡入淡出 + 起色→白）
    if (pkw.sparks) {
      for (const p of pkw.sparks) {
        const lt = t - p.born
        if (lt < 0 || lt > p.life) { p.sp.visible = false; continue }
        p.sp.visible = true
        const f = lt / p.life
        const a = f < 0.15 ? f / 0.15 : f > 0.8 ? (1 - f) / 0.2 : 1
        p.sp.alpha = a * 0.97
        p.sp.angle = p.spin0 + (p.spin1 - p.spin0) * f
        const g = Math.round(158 + (255 - 158) * f)
        p.sp.tint = (255 << 16) | (g << 8) | 255
      }
    }
  }

  // playWin(nodeId, { isSelf, amount, mode }) — mode: 'holdem'(德州帧动画) | 'spine'(十三水骨骼)
  function playWin(nodeId, opts = {}) {
    const mode = opts.mode || 'holdem'
    if (mode === 'spine') {
      ensureWinSpine().then((data) => {
        playWinImpl(nodeId, { ...opts, mode: data && getSpineClass() ? 'spine' : 'holdem' })
      })
      return
    }
    playWinImpl(nodeId, opts)
  }
  function playWinImpl(nodeId, opts = {}) {
    const view = seatViews.get(nodeId)
    if (!view || !view.player) return
    clearWin(nodeId)
    const isSelf = opts.isSelf != null ? opts.isSelf : !!view.player.isSelf
    const amount = opts.amount || 0
    const mode = opts.mode || 'holdem'
    const c = view.container

    const glow = new PIXI.Graphics() // golden winner ring (drawn each frame, pulsing)

    // 庆祝主体：
    //   spine = 十三水 Touxiangxiaoguo 骨骼；self+holdem = YouWin.anim 左右滑入；other+holdem = 单张 WIN 弹出。
    let celebrate // 骨骼 / 单张 WIN（other）容器；YouWin 走 youwin 字段；pkw 帧动画走 pkw 字段
    let youwin = null
    let pkw = null
    let isSpine = false
    const Spine = getSpineClass()
    if (mode === 'spine' && _winSpineData && Spine) {
      const sk = new Spine(_winSpineData)
      sk.autoUpdate = true
      sk.scale.set(WIN_SPINE_SCALE)
      sk.y = WIN_SPINE_DY
      try {
        sk.state.setAnimation(0, WIN_SPINE_ANIM, false)
      } catch (e) {
        sk.state.setAnimation(0, 'Niyingle', false)
      }
      celebrate = sk
      isSpine = true
    } else if (mode === 'pkw') {
      pkw = buildPkwWin(isSelf) // 德州桌真帧动画：YOU/WIN 字 + 扫光 + 闪光条 + 光球翻书
    } else if (isSelf) {
      youwin = buildYouWin() // You(左)/Win(右) 滑入中央汇合
    } else {
      celebrate = buildOtherWin() // 别人赢：单张 WIN 弹出
      celebrate.y = -AVATAR / 2 - WIN_OTHER_H / 2 - 8
      celebrate.scale.set(0)
    }

    const profitFrom = isSelf ? SCORE_DY.self : SCORE_DY.other
    const profit = makeText('+' + fmtAmount(amount), { size: 32, fill: 0xffe08a, weight: '700' })
    profit.y = profitFrom
    profit.visible = false

    // z-order: glow (behind text/cards) at frame level; celebration + profit on top
    const insertIdx = cardZInsertIdx(view.container, view.cardSprites)
    c.addChildAt(glow, insertIdx)
    if (youwin) c.addChild(youwin.root)
    if (pkw) c.addChild(pkw.root)
    if (celebrate) c.addChild(celebrate)
    c.addChild(profit)

    // 自己赢延迟 0.1s 播 "ying"（seat.js resultWin）；底池筹码飞向赢家 shouchouma
    if (isSelf) setTimeout(() => playSound('ying'), 100)
    playSound('shouchouma') // 底池筹码飞向赢家
    // 底池筹码飞向赢家（对齐 Cocos flyChipsToWinner）：从中央底池 POT_PILE 发 5 枚**真筹码**，
    //   每枚 **直线** 0.15s 飞到赢家身前(scoreNode ≈ 头像下方身家板)，逐枚 0.05 错峰；不用抛物线/手绘金币。
    const scoreDy = view.player && view.player.isSelf ? SCORE_DY.self : SCORE_DY.other
    const target = { x: c.x, y: c.y + scoreDy }
    for (let i = 0; i < WIN_COINS; i++) {
      const coin = buildChip(CHIP_DISP)
      coin.position.set(POT_PILE.x, POT_PILE.y)
      coin.alpha = 0
      dealLayer.addChild(coin)
      winCoins.push({
        sp: coin,
        t: 0,
        delay: i * WIN_COIN_STAGGER,
        dur: WIN_COIN_DUR,
        from: { x: POT_PILE.x, y: POT_PILE.y },
        to: target,
        arc: 0, // 直线（Cocos cc.moveTo）
      })
    }

    wins.set(nodeId, { view, glow, celebrate, youwin, pkw, isSpine, profit, isSelf, amount, t: 0, profitPlayed: false })
  }
  function clearWin(nodeId) {
    const w = wins.get(nodeId)
    if (!w) return
    ;[w.glow, w.celebrate, w.youwin && w.youwin.root, w.pkw && w.pkw.root, w.profit].forEach((n) => {
      if (!n || n._destroyed) return // 防止 destroy 后再次销毁（geometry refCount 已为 null）
      if (n.parent) n.parent.removeChild(n)
      n.destroy({ children: true })
    })
    wins.delete(nodeId)
  }
  // 清全部赢家动画（151 清台 / 新一手开局用）：服务端 readyTime 可为 0、手与手间隔极短，
  //   WIN/YouWin/盈利数字若只靠自身 2~3s 淡出，会叠进下一手画面（「状态之间画面重叠」）。
  function clearWins() {
    for (const id of [...wins.keys()]) clearWin(id)
  }

  // ---- All-In 光环（allin_action_0 入场 + allin_action_1 循环呼吸）----
  // 真实贴图精灵（非手绘）：扩散环 / 火焰 / 循环环 / 压暗罩 / 「All In」文字图。
  //   缩放动画统一由外层 wrapper 承载（sizedSprite 用 width 设过一次 scale，直接改 sprite.scale 会冲突），
  //   透明度动画直接改 sprite.alpha。
  function wrapScaledSprite(src, w, h, { add = false } = {}) {
    const wrap = new PIXI.Container()
    const sp = sizedSprite(src, w, h)
    if (add) sp.blendMode = PIXI.BLEND_MODES.ADD
    wrap.addChild(sp)
    return { wrap, sp }
  }
  // playAllin(nodeId) — 在座位上播 All-In 光环：入场(火焰+砸字图+双扩散环) 后转入持续呼吸环 + 头像压暗，
  //   一直保留到 clearAllin（对应真机：玩家 All-In 状态期间常驻光环）。All-In 全部图片、落在头像正中央。
  function playAllin(nodeId) {
    const view = seatViews.get(nodeId)
    if (!view || !view.player) return
    clearAllin(nodeId)
    const c = view.container
    const root = new PIXI.Container()
    // common_Head_black 压暗罩（opacity 100/255）
    const scrim = sizedSprite(ALLIN_HEADBLACK_SRC, ALLIN_HEADBLACK_W, ALLIN_HEADBLACK_W)
    scrim.alpha = ALLIN_SCRIM_ALPHA
    // 10001 火焰/光晕（ADD，只做透明度动画）
    const flame = sizedSprite(ALLIN_FLAME_SRC, ALLIN_FLAME_W, ALLIN_FLAME_H)
    flame.blendMode = PIXI.BLEND_MODES.ADD
    flame.alpha = 0
    // 循环呼吸环 quan_02(178, ADD)：只做透明度呼吸（不缩放）
    const loopRing = sizedSprite(ALLIN_RINGLOOP_SRC, ALLIN_RINGLOOP_W, ALLIN_RINGLOOP_W)
    loopRing.blendMode = PIXI.BLEND_MODES.ADD
    // 两道扩散环 quan_01/quan_02（133, ADD）：缩放+透明度动画 → 用 wrapper 承载缩放
    const r1 = wrapScaledSprite(ALLIN_RING_SRC, ALLIN_RING_W, ALLIN_RING_W, { add: true })
    r1.wrap.alpha = 0
    const r2 = wrapScaledSprite(ALLIN_RING_SRC, ALLIN_RING_W, ALLIN_RING_W, { add: true })
    r2.wrap.alpha = 0
    // 「All In」文字图（缩放砸入 + 透明度）→ wrapper 承载缩放，sprite 承载透明度
    const txt = wrapScaledSprite(ALLIN_TEXT_SRC, ALLIN_TEXT_W, ALLIN_TEXT_H)
    txt.wrap.y = ALLIN_TEXT_DY
    txt.sp.alpha = 0
    // 画序：压暗罩 -> 火焰光晕 -> 呼吸环 -> 两道扩散环 -> All In 字。整体置于座位最上层，居中头像、清晰可见。
    root.addChild(scrim, flame, loopRing, r1.wrap, r2.wrap, txt.wrap)
    c.addChild(root) // 放到座位容器最上（All In 字压过手牌/身家，层级正确）
    playSound('allin') // All-In VO（allin_boy）
    allins.set(nodeId, {
      view, root, scrim, flame, loopRing,
      ring1: r1.wrap, ring2: r2.wrap, text: txt.wrap, textSp: txt.sp, t: 0,
    })
  }
  function clearAllin(nodeId) {
    const a = allins.get(nodeId)
    if (!a) return
    safeDestroy(a.root) // root 挂在座位 container 下，可能已随其重建销毁 → 防双销毁崩溃
    allins.delete(nodeId)
  }
  function clearAllins() {
    for (const id of [...allins.keys()]) clearAllin(id)
  }

  // ---- bet chips (#7) + pot (#10) ----
  // 单枚真筹码直线飞行（from→to，easeInOut(2)，arc=0 直线）；到点淡出；onDone 落堆/累计底池。
  function flyChip(from, to, { delay = 0, arc = 0, dur = BET_MOVE_DUR, size = CHIP_DISP, onDone } = {}) {
    const coin = buildChip(size)
    coin.position.set(from.x, from.y)
    coin.alpha = 0
    dealLayer.addChild(coin)
    chipFly.push({ sp: coin, t: 0, dur, delay, from: { ...from }, to: { ...to }, arc, onDone, token: betToken })
  }
  // 飞行/堆叠克隆数（真值固定 3 枚，不按面额变化）。
  function chipCount() {
    return CHIP_FLY_N
  }
  // 底池数字（对应 cocos potLabel：POT_VALUE）。数字本身由 DOM「总底池」缎带渲染+跳动，
  // 这里只累计并通过 onPot 回调上抛给 Vue 层。
  function setPot(n) {
    potTotal = Math.max(0, Math.round(n))
    if (onPot) onPot(potTotal)
  }
  function addPot(n) {
    setPot(potTotal + n)
  }
  function clearPot() {
    setPot(0)
  }

  // ---- 分池 pots[] UI（对齐 Unity UpdatePots / Cocos pot.setPots） ----
  // 单个分池项：ic_bet_bg 底板 + 面额配色筹码(betColorFor) + 金额文字。
  function buildPotItem() {
    const root = new PIXI.Container()
    const bg = sizedSprite(POT_ITEM_BG_SRC, POT_ITEM_W, POT_ITEM_H)
    bg.alpha = 0.85 // 底板浅灰，压一点透明度贴近真机暗色台面观感
    const chip = sizedSprite(POT_CHIP_SRC.green, POT_CHIP_ICON_W, POT_CHIP_ICON_H)
    chip.position.set(POT_CHIP_ICON_X, 0)
    const label = makeText('', { size: 26, fill: 0xffffff, weight: '600' })
    label.position.set(POT_LABEL_X, 0)
    root.addChild(bg, chip, label)
    potLayer.addChild(root)
    return { root, chip, label, color: 'green', amount: null }
  }
  /**
   * 渲染分池列表（空数组/undefined = 清空）。
   * 布局 1:1 setPotItemPosition：两列 x=±112、行距 64；最后一项为偶数下标且是末项时独占整行居中。
   * @param {number[]} pots 各分池筹码（服务端「分」）
   * @param {number} bigBlind 大盲（配色阈值基准）
   */
  function setPots(pots, bigBlind) {
    const list = (pots || []).filter((p) => p > 0)
    // 超出的旧项移除
    while (potItems.length > list.length) {
      const it = potItems.pop()
      if (it.root.parent) it.root.parent.removeChild(it.root)
      it.root.destroy({ children: true })
    }
    for (let i = 0; i < list.length; i++) {
      if (!potItems[i]) potItems[i] = buildPotItem()
      const it = potItems[i]
      const amount = list[i]
      // 位置：奇数末项独占一行居中(x=0)，其余按左右两列
      const lastAlone = i === list.length - 1 && i % 2 === 0
      const col = lastAlone ? 0 : i % 2 === 0 ? -POT_ITEM_COL_X : POT_ITEM_COL_X
      const row = Math.floor(i / 2)
      it.root.position.set(col, toCy(POT_GROUP_TOP_Y - POT_ITEM_ROW0_DY - POT_ITEM_ROW_STEP * row))
      // 面额配色（只在变化时换纹理）
      const color = betColorFor(amount, bigBlind)
      if (color !== it.color) {
        it.chip.texture = PIXI.Texture.from(POT_CHIP_SRC[color])
        const applySize = () => {
          if (!it.chip.transform) return
          it.chip.width = POT_CHIP_ICON_W
          it.chip.height = POT_CHIP_ICON_H
        }
        if (it.chip.texture.baseTexture.valid) applySize()
        else it.chip.texture.baseTexture.once('loaded', applySize)
        it.color = color
      }
      if (amount !== it.amount) {
        it.label.text = fmtAmount(amount)
        it.amount = amount
      }
    }
  }
  function clearPots() {
    setPots([])
  }
  function removeBet(nodeId) {
    const b = bets.get(nodeId)
    if (!b) return
    stats.removeBet++
    if (b.stack) { // stack 可能尚未建（下注飞行中即被收池）→ 守卫 null
      if (b.stack.parent) b.stack.parent.removeChild(b.stack)
      b.stack.destroy({ children: true })
    }
    bets.delete(nodeId)
  }
  // 下注位（下注筹码堆）：
  //   · 侧栏座位（左/右列）：水平与动作气泡同侧对齐（气泡在左则筹码堆也在左），落在身家底板下方。
  //   · **最上边座位**（顶部两座）：水平**居中**于座位（dx=0），落在身家下边一点（朝桌心）。
  //   · **最下边座位**（Hero）：放到**头像右边**，与头像垂直居中、距金环外缘 20 像素（用户要求 2026-07-02）。
  // 顶部座位下注堆中心落在身家底板中心下方的距离：组竖直居中于此，需容纳组高(筹码36+数字≈38)的一半
  //   + 板高一半(≈19)再留间隙，否则组顶与积分板重合（用户反馈 2026-07-02 已下调）。
  const BET_BELOW_SCORE = 68
  const HERO_BET_GAP = 20 // Hero 下注堆（筹码+金额）左缘距头像金环右缘的间隙
  function betSpotForView(view) {
    const isSelf = view.player && view.player.isSelf
    const scoreDy = isSelf ? SCORE_DY.self : SCORE_DY.other
    const cx = view.container.x
    const cy = view.container.y
    if (isSelf) {
      // 最下边座位（Hero）：头像右边、垂直居中；spot = 堆的**左缘**锚点（buildBetStack 按 align:'left' 排布）
      return { x: cx + GOLD_OUTER_R + HERO_BET_GAP, y: cy, align: 'left' }
    }
    if (cy < TOP_PAIR_CY) {
      // 最上边座位（顶部两座，用户要求 2026-07-02）：筹码+金额放在**桌面积分（身家板）正中心点的正下方**
      //   ——水平对准积分板中心（=座位中心 cx），垂直紧贴板下缘。
      return { x: cx, y: cy + scoreDy + BET_BELOW_SCORE }
    }
    // 侧栏座位（左/右列，用户要求 2026-07-02）：筹码+金额落在**动作气泡正下方、身家（桌面积分）板上方**
    //   的中间位置——水平与气泡中心对齐（气泡朝桌心一侧），垂直取气泡中心与积分板中心的中点。
    const onLeft = bubbleOnLeft(cx, cy)
    const dx = onLeft ? -BUBBLE_DX : BUBBLE_DX
    return { x: cx + dx, y: cy + (BUBBLE_DY + scoreDy) / 2 }
  }
  // 在下注位落「筹码 + 金额」——**竖直排列：筹码在上、金额数字在下**（用户要求 2026-07-02，非横向并排）。
  //   默认整组以 spot 为竖直/水平中心；spot.align==='left' 时 spot 是整组**左缘**（Hero 贴头像右侧用，
  //   保证「距金环 20px」的是组左缘，金额变长也不会往头像里挤）。
  function buildBetStack(spot, amount) {
    const stack = new PIXI.Container()
    stack.position.set(spot.x, spot.y)
    const chip = buildChip(CHIP_DISP)
    // 下注金额字体 = Cocos chouma_text 真值 PKW-Chip-Medium（Seat.prefab _N$file，fs38 粉色 255,100,224）。
    // 字号 26→31（2026-07-02 用户要求数字放大 1.2 倍）。
    const lab = makeText(fmtAmount(amount), { size: 31, fill: CHIP_TEXT_COLOR, weight: '500', family: CHIP_FONT })
    const gap = 2
    const totalH = CHIP_DISP + gap + lab.height
    // 竖直排列：筹码在上、数字在下，整组竖直居中于 spot.y
    chip.y = -totalH / 2 + CHIP_DISP / 2
    lab.y = chip.y + CHIP_DISP / 2 + gap + lab.height / 2
    // 水平：center 模式两者都居中于 spot.x；left 模式组左缘=spot.x（组宽=两者较宽者）
    const halfW = Math.max(CHIP_DISP, lab.width) / 2
    const cxOff = spot.align === 'left' ? halfW : 0
    chip.x = cxOff
    lab.x = cxOff
    stack.addChild(chip, lab)
    dealLayer.addChild(stack)
    return { stack, label: lab }
  }
  // playBet(nodeId, amount, { collect }) — 筹码从座位飞向身前下注位；collect 则随后收入中央底池。
  function playBet(nodeId, amount, opts = {}) {
    stats.playBet++
    const view = seatViews.get(nodeId)
    if (!view) return
    removeBet(nodeId)
    const collect = !!opts.collect
    const from = { x: view.container.x, y: view.container.y }
    // 下注位 = 座位正下方、身家底板下方居中（见 betSpotForView）。
    const spot = betSpotForView(view)
    const n = chipCount()
    // 飞行落点 = 堆内筹码的视觉中心（left 对齐时筹码在 spot.x + CHIP_DISP/2）
    const flyX = spot.align === 'left' ? spot.x + CHIP_DISP / 2 : spot.x
    for (let i = 0; i < n; i++) {
      flyChip(
        { x: from.x + (Math.random() - 0.5) * 20, y: from.y + (Math.random() - 0.5) * 14 },
        { x: flyX + (Math.random() - 0.5) * 10, y: spot.y + (Math.random() - 0.5) * 8 },
        { delay: 0.02 * (n - 1 - i), dur: BET_MOVE_DUR } // 错峰 0.02*(2-i)
      )
    }
    playSound('chipsToTable') // 下注上桌（ChipsToTable）
    const token = betToken
    // 立刻登记该注（stack 先置 null）：这样即便下一街 recvCards 在筹码飞行中就 collectAllBets，
    //   也能收到这一注 —— 修「最后一个下注玩家的注没被收池、看起来没有收池动画」。
    bets.set(nodeId, { stack: null, label: null, amount, spot, nodeId })
    const arriveMs = (0.02 * (n - 1) + BET_MOVE_DUR) * 1000
    setTimeout(() => {
      if (token !== betToken) return
      const b = bets.get(nodeId)
      if (!b || b.stack) return // 已被收池（收池时 removeBet 删了）或已建 → 不重复建
      const st = buildBetStack(spot, amount)
      b.stack = st.stack; b.label = st.label
      if (collect) setTimeout(() => token === betToken && collectBet(nodeId), 600)
    }, arriveMs)
  }
  // collectBet(nodeId) — 把某座下注堆 scatter 后飞入中央底池，pot 数字累加（chips_to_pot）。
  function collectBet(nodeId) {
    const b = bets.get(nodeId)
    if (!b) return
    removeBet(nodeId)
    const n = chipCount()
    for (let i = 0; i < n; i++) {
      flyChip(
        { x: b.spot.x + (Math.random() - 0.5) * 18, y: b.spot.y + (Math.random() - 0.5) * 14 }, // scatter 起点
        { x: POT_PILE.x + (Math.random() - 0.5) * 16, y: POT_PILE.y + (Math.random() - 0.5) * 10 },
        { delay: 0.02 * (n - 1 - i), dur: POT_MOVE_DUR }
      )
    }
    playSound('chipsToPot') // 入底池（ChipsToPot）
    const token = betToken
    setTimeout(() => token === betToken && addPot(b.amount), (0.02 * (n - 1) + POT_MOVE_DUR) * 1000)
  }
  // 收齐所有座位的下注（街末归池）。
  function collectAllBets() {
    for (const id of [...bets.keys()]) collectBet(id)
  }
  function clearBets() {
    betToken++
    for (const id of [...bets.keys()]) removeBet(id)
    for (const c of chipFly) {
      if (c.sp.parent) c.sp.parent.removeChild(c.sp)
      c.sp.destroy()
    }
    chipFly.length = 0
  }

  // ---- dealer button + blinds (#3) — Holdem_Icon ----
  // 标记落点 = 座位朝桌心内移 DEALER_INSET（在头像与下注堆之间）。座位旋转时 tick 内跟随。
  function iconSpotFor(pos) {
    const dist = Math.hypot(pos.x, pos.y) || 1
    const k = Math.max(0, (dist - DEALER_INSET) / dist)
    return { x: pos.x * k, y: pos.y * k }
  }
  // 庄家 D 落点 = 身家底板右侧、与底板垂直居中（用户要求；对照参考图 左.png 的 D 贴在筹码右边）。
  //   底板宽随身家文字变化，故每帧按当前 view.score.width 重新计算跟随。
  const DEALER_GAP = 8 // 庄钮左缘距底板右缘的间隙
  // 大盲/小盲统一贴头像**左侧**（垂直居中）——用户要求（2026-07-02 由右上角改到左侧、尺寸放大一倍）。
  //   标记完全压在金环左缘内侧（不越出金环）：左列座位(cx=-446)金环本就贴屏幕边，
  //   若标记再往左伸会被屏幕裁掉；取 GOLD_OUTER_R - SIZE/2 让其外缘与金环外缘平齐。
  const BLIND_DX = GOLD_OUTER_R - BLIND_ICON_SIZE / 2 // 头像中心到盲注标记中心的水平距离
  function iconTargetFor(kind, view) {
    if (kind === 'dealer' && view.score) {
      const scoreDy = view.player && view.player.isSelf ? SCORE_DY.self : SCORE_DY.other
      const plateHalfW = (view.score.width + 52) / 2 // 与 drawScorePlate 宽度(+52)一致
      // 庄钮放底板朝桌心一侧：右半区座位放底板左侧、其余放右侧（对照参考图 左.png D 在右 / 右.png D 在左）。
      const onLeft = view.side === 'right'
      const dx = plateHalfW + DEALER_GAP + ICON_SIZE / 2
      return {
        x: view.container.x + (onLeft ? -dx : dx),
        y: view.container.y + scoreDy,
      }
    }
    // 小盲/大盲：头像左侧、与头像垂直居中。
    if (kind === 'sb' || kind === 'bb') {
      return {
        x: view.container.x - BLIND_DX,
        y: view.container.y,
      }
    }
    return iconSpotFor({ x: view.container.x, y: view.container.y })
  }
  const ICON_DISP = { dealer: ICON_SIZE, sb: BLIND_ICON_SIZE, bb: BLIND_ICON_SIZE }
  const ICON_SRC = { dealer: DEALER_SRC, sb: SB_SRC, bb: BB_SRC }
  // 把某 kind 标记放到 nodeId 座位身前；animate=true 时 moveTo 0.2s easeInOut（换庄/换盲）。
  function setIcon(kind, nodeId, animate = true) {
    const view = seatViews.get(nodeId)
    if (!view) return
    const size = ICON_DISP[kind] || ICON_SIZE
    let it = icons.get(kind)
    if (!it) {
      const sp = buildChip(size) // 复用 sizedSprite 守卫；下面换贴图
      sp.texture = PIXI.Texture.from(ICON_SRC[kind])
      const apply = () => {
        if (!sp.transform) return
        sp.width = size
        sp.height = size
      }
      if (sp.texture.baseTexture && sp.texture.baseTexture.valid) apply()
      else sp.texture.baseTexture.once('loaded', apply)
      iconLayer.addChild(sp)
      it = { sp, nodeId, mt: null }
      icons.set(kind, it)
    }
    const target = iconTargetFor(kind, view)
    if (animate && (it.sp.x || it.sp.y)) {
      it.mt = { t: 0, dur: DEALER_MOVE_DUR, from: { x: it.sp.x, y: it.sp.y } }
    } else {
      it.sp.position.set(target.x, target.y)
      it.mt = null
    }
    it.nodeId = nodeId
  }
  function setDealer(nodeId, animate = true) {
    setIcon('dealer', nodeId, animate)
  }
  // 下盲：放置 SB/BB 标记 + 各自身前飞出盲注筹码（playBet，chips_to_table）。
  function postBlinds(sbNodeId, bbNodeId, sbAmount, bbAmount) {
    setIcon('sb', sbNodeId, false)
    setIcon('bb', bbNodeId, false)
    if (sbAmount > 0) playBet(sbNodeId, sbAmount)
    if (bbAmount > 0) playBet(bbNodeId, bbAmount)
  }
  function removeIcon(kind) {
    const it = icons.get(kind)
    if (!it) return
    if (it.sp.parent) it.sp.parent.removeChild(it.sp)
    it.sp.destroy()
    icons.delete(kind)
  }
  function clearDealer() {
    for (const kind of [...icons.keys()]) removeIcon(kind)
  }

  // ---- community cards (comCards.js): in-place flip reveal at the center board ----
  // build 5 empty (hidden) card slots at the real comCards positions.
  // 确保 5 个空槽存在但**不销毁已有牌**（增量渲染用）。已建则原样保留，避免重建造成闪烁。
  function ensureComSlots() {
    if (comSlots.length) return
    for (let i = 0; i < 5; i++) {
      const node = new PIXI.Container() // wrapper carries the flip scale.x (sprite keeps native size)
      node.position.set(COM_SLOT_X[i], COM_Y)
      node.visible = false
      const sp = sizedSpriteTex(cardBackTex(), COM_CARD_W, COM_CARD_H)
      node.addChild(sp)
      comLayer.addChild(node)
      comSlots.push({ node, sp, value: null })
    }
  }
  // 隐藏 index >= n 的槽（板收缩时防御，正常一手内只增不减）。
  function hideComFrom(n) {
    for (let i = n; i < comSlots.length; i++) {
      const slot = comSlots[i]
      slot.value = null
      slot.node.visible = false
      slot.node.scale.x = 1
    }
  }
  // 该槽是否已正确揭示成 value（含正在翻牌的——flipComCard 起手即写 value/visible）。
  function comShown(i, value) {
    const s = comSlots[i]
    return !!(s && s.value === value && s.node.visible)
  }
  // show a slot immediately as a finished face-up card (used to pre-fill earlier streets)
  function showComStatic(i, value) {
    stats.comStatic++
    const slot = comSlots[i]
    if (!slot) return
    slot.value = value
    setCardTex(slot.sp, cardFrontTex(value), COM_CARD_W, COM_CARD_H)
    slot.node.scale.x = 1
    slot.node.visible = true
  }
  // start an in-place flip reveal on slot i to `value` (showCardAni): back -> edge -> face.
  function flipComCard(i, value) {
    stats.comFlip++
    const slot = comSlots[i]
    if (!slot) return
    slot.value = value
    slot.node.visible = true
    slot.node.scale.x = 1
    // ensure it starts on the back
    setCardTex(slot.sp, cardBackTex(), COM_CARD_W, COM_CARD_H)
    comFlips.push({ slot, t: 0, value, swapped: false })
  }
  // peekRiverCard(value) — 河牌「搓牌」(comCards.peekRiverCard → WPPeekCardAnim/Mesh)：
  //   折线从左向右横扫，背面被逐步揭开露出正面，伴随放大-回落，最后整牌翻平。仅 All-In 摊牌用。
  function peekRiverCard(value) {
    const slot = comSlots[4]
    if (!slot) return
    slot.value = value
    slot.node.visible = true
    slot.node.scale.set(1)
    slot.sp.visible = false // hide the plain back; peek uses its own mesh (front/back)
    // 3D 网格卷边（PIXI.Mesh + 自定义 shader 移植 WPPeekCardMesh）：折线从左扫到右，
    //   左侧露正面、右侧绕柱面卷起（背面+抬起阴影），结束落为静态正面牌。
    const peek = createPeekCardMesh(cardFrontTex(value), cardBackTex(), COM_CARD_W, COM_CARD_H)
    slot.node.addChild(peek.mesh)
    comPeek = { slot, value, t: 0, peek, soundPlayed: false }
  }
  // playCommunity(round, cards?) — round: 'FLOP'(3) | 'TURN'(4) | 'RIVER'(5) | 'ALL'
  // cards optional (5 distinct values); reveals only the *new* street's card(s) with flip,
  // pre-filling earlier streets statically (so picking TURN/RIVER alone still looks right).
  function playCommunity(round, cards, opts) {
    stats.playCommunity++
    // 增量渲染（对齐 Cocos UpdatePublicCards「追加」语义）：复用已揭示且正确的牌，绝不 buildComSlots
    //   销毁重建。这样即便 playCommunity 被重复/重叠调用（重复 recvCards / 快照夹在翻牌中 / 街增长），
    //   已亮的牌都原样保留，只翻**真正新增**的牌 —— 根除「第一轮翻牌闪烁」「转/河已亮牌被重建闪一下」。
    ensureComSlots()
    const token = comToken // 不再 ++：保留在飞的合法 flip；仅 clearCommunity()（新一手）才作废
    const peek = !!(opts && opts.peek) // 河牌走 All-In 搓牌
    // 传入了真实公共牌就用真牌(哪怕不足5张：翻牌3/转牌4)；仅当完全没传(测试菜单)才随机发一副。
    const board = cards && cards.length ? cards : dealHand(5)
    // 已正确显示则跳过（不重摆/不重翻 → 无闪烁）。
    const staticIfNeeded = (i, v) => { if (!comShown(i, v)) showComStatic(i, v) }
    const flipIfNeeded = (i, v) => { if (!comShown(i, v)) flipComCard(i, v) }
    const flop = () => {
      if (token !== comToken) return
      // 仅当确有未揭示的翻牌牌时才放发牌音（重复触发不再重复响）。
      const anyNew = [0, 1, 2].some((i) => !comShown(i, board[i]))
      if (anyNew) playSound('fagongpai1')
      for (let i = 0; i < 3; i++) {
        const idx = i
        setTimeout(() => token === comToken && flipIfNeeded(idx, board[idx]), COM_CARD_STAGGER * i * 1000)
      }
    }
    const turn = () => {
      if (token !== comToken) return
      if (!comShown(3, board[3])) { playSound('fagongpai2'); flipComCard(3, board[3]) }
    }
    const river = () => {
      if (token !== comToken) return
      if (comShown(4, board[4])) return
      if (peek) {
        // setRiverCard: All-In peek 分支 → peekRiverCard（搓牌），fagongpai2 在翻平瞬间播
        peekRiverCard(board[4])
      } else {
        playSound('fagongpai2')
        flipComCard(4, board[4])
      }
    }
    if (round === 'STATIC') {
      // 按真实张数静态摆出（进房快照可能是 3/4/5 张；测试预置牌则 5 张）。不走翻面动画。
      const n = Math.min(board.length, 5)
      for (let i = 0; i < n; i++) staticIfNeeded(i, board[i])
      hideComFrom(n) // 板收缩（少见，新一手会先 clearCommunity）时清掉多余槽
    } else if (round === 'FLOP') {
      flop()
    } else if (round === 'TURN') {
      for (let i = 0; i < 3; i++) staticIfNeeded(i, board[i])
      turn()
    } else if (round === 'RIVER') {
      for (let i = 0; i < 4; i++) staticIfNeeded(i, board[i])
      river()
    } else {
      // ALL: full street sequence with real beats (FLOP -> TURN -> RIVER)
      flop()
      setTimeout(turn, 1500) // after flop 3 cards settle
      setTimeout(river, 2700)
    }
  }
  function clearCommunity() {
    stats.clearCommunity++
    comToken++
    comFlips.length = 0
    if (comPeek) {
      if (comPeek.peek.mesh.parent) comPeek.peek.mesh.parent.removeChild(comPeek.peek.mesh)
      comPeek.peek.destroy()
      comPeek = null
    }
    for (const slot of comSlots) {
      if (slot.node.parent) slot.node.parent.removeChild(slot.node)
      slot.node.destroy({ children: true })
    }
    comSlots.length = 0
  }

  // per-frame: tween seats toward their slot target (sitdownWithAni ~0.11s) + fly deal cards
  function tick() {
    const dt = app.ticker.elapsedMS / 1000

    // 送礼物：推进 DragonBones 世界时钟（runtime 不自挂 ticker）+ 手动推进 Spine（本工程
    //   未跑 PIXI 共享 ticker，autoUpdate 不生效 → 逐帧 update(dt)）+ 飞行投射物抛物线插值。
    advanceGiftClock(dt)
    for (let i = 0; i < giftDisplays.length; i++) {
      const rec = giftDisplays[i]
      if (rec.isSpine && rec.display && rec.display.update) {
        try { rec.display.update(dt) } catch (e) { void e }
      }
    }
    if (giftFlights.length) {
      for (let i = giftFlights.length - 1; i >= 0; i--) {
        const f = giftFlights[i]
        f.t += dt / GIFT_FLIGHT_DUR
        const e = f.t >= 1 ? 1 : 1 - Math.pow(1 - f.t, 2.2) // 强 easeOut（近似 cocos easeOut(2.5)）
        const u = 1 - e
        // 二次贝塞尔：(1-e)^2*from + 2(1-e)e*ctrl + e^2*to
        f.orb.x = u * u * f.from.x + 2 * u * e * f.ctrl.x + e * e * f.to.x
        f.orb.y = u * u * f.from.y + 2 * u * e * f.ctrl.y + e * e * f.to.y
        if (f.spin) f.orb.rotation += dt * 12 // 番茄/炸弹边飞边翻滚（rotateBy 360）；其余图标不转
        if (f.t >= 1) {
          if (f.orb.parent) f.orb.parent.removeChild(f.orb)
          f.orb.destroy()
          giftFlights.splice(i, 1)
          spawnGiftBurst(f.type, f.to, f.token, f.onDone)
        }
      }
    }

    // seat position tween (rotation rides the seat node to its slot)
    const k = Math.min(1, dt / 0.11)
    for (const view of seatViews.values()) {
      const c = view.container
      const dx = view.tx - c.x
      const dy = view.ty - c.y
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
        c.position.set(view.tx, view.ty)
      } else {
        c.x += dx * k
        c.y += dy * k
      }
    }

    // 下注堆随座位旋转：据每个下注堆所属座位的当前坐标实时重算身前下注位并跟随
    //   （复刻 Cocos seat_rotation_step 让 chouma 跟随座位节点）。
    if (bets.size) {
      for (const b of bets.values()) {
        const v = seatViews.get(b.nodeId)
        if (!v) continue
        const spot = betSpotForView(v)
        b.spot = spot
        if (b.stack) b.stack.position.set(spot.x, spot.y) // stack 可能尚未建（飞行中）→ 守卫
      }
    }

    // 庄/盲标记跟随座位；换庄时 moveTo 0.2s easeInOut（Holdem_Icon.moveDealer）。
    if (icons.size) {
      for (const [kind, it] of icons) {
        const v = seatViews.get(it.nodeId)
        if (!v) continue
        const target = iconTargetFor(kind, v)
        if (it.mt) {
          it.mt.t += dt
          const e = easeInOutQuad(Math.min(1, it.mt.t / it.mt.dur))
          it.sp.position.set(
            it.mt.from.x + (target.x - it.mt.from.x) * e,
            it.mt.from.y + (target.y - it.mt.from.y) * e,
          )
          if (it.mt.t >= it.mt.dur) it.mt = null
        } else {
          it.sp.position.set(target.x, target.y)
        }
      }
    }

    // countdown: Holdem_PlayerTimer.updateProgress (progress 1→0); clear at time-up
    if (countdowns.size) {
      for (const [nodeId, cd] of countdowns) {
        if (cd.phase === 'countdown') {
          cd.remaining -= dt
          if (cd.remaining <= 0) clearCountdown(nodeId)
          else {
            drawCountdown(cd)
            // 临近超时：进入「最后 N 秒」(短计时取一半) → 响一次 TimeOverTip + 手牌开始抖动
            const alertAt = cd.maxTime > ALERT_REMAIN + 1 ? ALERT_REMAIN : cd.maxTime * 0.5
            if (!cd.alerted && cd.remaining <= alertAt) {
              cd.alerted = true
              playSound('timeover')
            }
            if (cd.alerted) {
              cd.shakeT += dt
              const off = Math.sin(cd.shakeT * SHAKE_FREQ) * SHAKE_AMP_DEG
              const v = cd.view
              v?.cardSprites?.forEach((sp, i) => {
                if (sp) sp.angle = (v.lay?.slots?.[i]?.rot || 0) + off
              })
            }
            // fuse-only：火点核闪烁 + 火星喷射；ring 样式无火焰，drawCountdown 已每帧重绘环。
            if (cd.flame) {
            cd.flick += dt
            const f = cd.flame
            // small hot core: gentle flicker, slow spin (not a big steady candle flame)
            const cw = 18 + 7 * (0.5 + 0.5 * Math.sin(cd.flick * 20))
            f._core.width = f._core.height = cw
            f._core.alpha = 0.7 + 0.3 * Math.random()
            f._core.rotation += dt * 3.5
            // sparse scattered sparks: each ember sprays out, arcs under slight gravity, fades,
            // then respawns -> a natural sparse spark spray instead of a tight cluster.
            for (const e of f._embers) {
              e.age += dt
              if (e.age >= e.life) {
                spawnEmber(e, false)
                if (e.sp._unit) e.sp.scale.set(e.size * e.sp._unit)
                continue
              }
              const lifeK = e.age / e.life
              e.x += e.vx * dt
              e.y += e.vy * dt
              e.vy += 30 * dt // slight gravity -> sparks arc & fall like real embers
              e.sp.position.set(e.x, e.y)
              e.sp.alpha = (1 - lifeK) * 0.85
              if (e.sp._unit) e.sp.scale.set(e.size * (0.55 + 0.45 * (1 - lifeK)) * e.sp._unit)
            }
            }
          }
        }
      }
    }

    // win celebration: YouWin 左右滑入 / 单张 WIN 弹出 + glow pulse + profit float
    if (wins.size) {
      for (const [nodeId, w] of wins) {
        // teardown/HMR 期间 tick 可能跑在销毁之后：display 对象已 destroy（transform=null）→ 跳过并清理
        if ((w.glow && w.glow._destroyed) || (w.celebrate && w.celebrate._destroyed)) {
          wins.delete(nodeId)
          continue
        }
        w.t += dt
        const t = w.t
        const endK = t > WIN_DUR - 0.4 ? Math.max(0, (WIN_DUR - t) / 0.4) : 1
        if (w.pkw) {
          // 德州桌真帧动画 YOU WIN（win_light_self/opposite_pkw, 2s 内自带淡出）
          pkwTick(w.pkw, t)
        } else if (w.youwin) {
          // YouWin.anim：You(左)/Win(右) 0.25s 滑入中央 + 淡入 + 汇合弹跳 + Flare 扫光 + 火花
          const yw = w.youwin
          const slide = youWinSlide(Math.min(1, t / 0.25))
          const op = Math.min(1, t / 0.05)
          const pop = youWinPop(t)
          yw.youWrap.x = YOU_FROM_X + (YOU_TO_X - YOU_FROM_X) * slide
          yw.winWrap.x = WIN_FROM_X + (WIN_TO_X - WIN_FROM_X) * slide
          yw.youWrap.alpha = yw.winWrap.alpha = op
          yw.youWrap.scale.set(pop)
          yw.winWrap.scale.set(pop)
          const fs = flareScale(t)
          yw.flareWrap.scale.set(fs.x, fs.y)
          yw.flare.alpha = flareAlpha(t)
          yw.root.alpha = endK
          // particlesystem_YouWin 火花：0.15~2.25s 激活，从汇合处四散
          const active = t >= 0.15 && t <= 2.25
          yw.sparks.forEach((sx) => {
            sx.sp.visible = active
            if (!active) return
            const tt = (t * 1.2 + sx.ph) % 1
            const rad = 30 + tt * 120
            sx.sp.x = YOU_TO_X / 2 + WIN_TO_X / 2 + Math.cos(sx.ang) * rad
            sx.sp.y = Math.sin(sx.ang) * rad * 0.6 - 4
            sx.sp.alpha = (1 - tt) * endK
          })
        } else if (!w.isSpine && w.celebrate) {
          // 别人赢：单张 WIN 居中弹出（easeBack）
          const pt = Math.min(1, t / 0.32)
          w.celebrate.scale.set(pt < 1 ? easeBack(pt) : 1)
          w.celebrate.alpha = endK
        } else if (w.celebrate) {
          w.celebrate.alpha = endK
        }
        // pulsing golden winner ring (winBorder)
        const g = w.glow
        g.clear()
        const pulse = 0.5 + 0.5 * Math.sin(t * 6)
        const rr = GOLD_OUTER_R + 4 + pulse * 4
        g.lineStyle(6, 0xffd24a, (0.35 + 0.4 * pulse) * endK)
        g.drawCircle(0, 0, rr)
        g.lineStyle(3, 0xfff0b0, (0.25 + 0.3 * pulse) * endK)
        g.drawCircle(0, 0, rr - 6)
        // profit "+N" floats up from the stack at .35s + GetProfit sound
        if (t > 0.35) {
          if (!w.profitPlayed) {
            w.profitPlayed = true
            w.profit.visible = true
            playSound('specialSound')
          }
          const p = Math.min(1, (t - 0.35) / 1.0)
          w.profit.y = (w.isSelf ? SCORE_DY.self : SCORE_DY.other) - p * 46
          w.profit.alpha = endK
        }
        if (w.t >= WIN_DUR) clearWin(nodeId)
      }
    }
    // All-In 光环：入场(allin_action_0 关键帧) 0.783s 后转入持续呼吸环(allin_action_1 loop)。
    if (allins.size) {
      for (const a of allins.values()) {
        a.t += dt
        const te = a.t
        if (te <= ALLIN_ENTER_DUR) {
          // 10001 火焰：opacity 0→255@.166→255@.716→0@.766
          a.flame.alpha = allinKf([[0.15, 0], [0.1667, 1], [0.7167, 1], [0.7667, 0]], te)
          // Allin 字图：opacity 20→255@.166；scale 3→1@.166→1.2@.233→1@.3→1.05@.366→1@.433（砸入回弹）
          a.textSp.alpha = allinKf([[0, 20 / 255], [0.1667, 1]], te)
          const ts = allinKf(
            [[0, 3], [0.1667, 1], [0.2333, 1.2], [0.3, 1], [0.3667, 1.05], [0.4333, 1]],
            te,
          )
          a.text.scale.set(ts)
          // quan_02 扩散环：opacity 0→255@.166→0@.533；scale 1→0.8@.166→1.5@.533
          a.ring2.alpha = allinKf([[0.15, 0], [0.1667, 1], [0.5333, 0]], te)
          a.ring2.scale.set(allinKf([[0.15, 1], [0.1667, 0.8], [0.5333, 1.5]], te))
          // quan_01 扩散环（错峰第二圈）：opacity 0→255@.316→0@.683；scale 1→0.8@.316→1.5@.683
          a.ring1.alpha = allinKf([[0.3, 0], [0.3167, 1], [0.6833, 0]], te)
          a.ring1.scale.set(allinKf([[0.3, 1], [0.3167, 0.8], [0.6833, 1.5]], te))
        } else {
          // 入场结束：火焰/扩散环熄灭，All In 字 0.4s 淡出（loop 帧 allin_action_1 无字）
          a.flame.alpha = 0
          a.ring1.alpha = 0
          a.ring2.alpha = 0
          a.textSp.alpha = Math.max(0, 1 - (te - ALLIN_ENTER_DUR) / 0.4)
          a.text.scale.set(1)
        }
        // 持续呼吸环 quan_02(loop)：opacity 50→255→50 三角波，周期 2s（始终常驻）。
        const lp = (a.t % ALLIN_LOOP_PERIOD) / ALLIN_LOOP_PERIOD
        const breathe = lp < 0.5 ? lp / 0.5 : (1 - lp) / 0.5
        a.loopRing.alpha = (50 + (255 - 50) * breathe) / 255
      }
    }

    // pot -> winner flying coins (shouchouma)
    if (winCoins.length) {
      for (let i = winCoins.length - 1; i >= 0; i--) {
        const cn = winCoins[i]
        if (cn.delay > 0) {
          cn.delay -= dt
          continue
        }
        cn.t += dt / (cn.dur || 0.5)
        const e = cn.t >= 1 ? 1 : easeSineOut(cn.t)
        cn.sp.x = cn.from.x + (cn.to.x - cn.from.x) * e
        cn.sp.y = cn.from.y + (cn.to.y - cn.from.y) * e - Math.sin(e * Math.PI) * (cn.arc || 0)
        cn.sp.alpha = cn.t < 0.15 ? cn.t / 0.15 : cn.t > 0.85 ? Math.max(0, (1 - cn.t) / 0.15) : 1
        if (cn.t >= 1) {
          if (cn.sp.parent) cn.sp.parent.removeChild(cn.sp)
          cn.sp.destroy()
          winCoins.splice(i, 1)
        }
      }
    }

    // bet chips (#7/#10): seat->bet-spot / bet-spot->pot 直线 easeInOut(2)，到点淡出并触发 onDone
    if (chipFly.length) {
      for (let i = chipFly.length - 1; i >= 0; i--) {
        const c = chipFly[i]
        if (c.delay > 0) {
          c.delay -= dt
          continue
        }
        c.t += dt / c.dur
        const e = c.t >= 1 ? 1 : easeInOutQuad(c.t)
        c.sp.x = c.from.x + (c.to.x - c.from.x) * e
        c.sp.y = c.from.y + (c.to.y - c.from.y) * e - Math.sin(e * Math.PI) * c.arc
        c.sp.alpha = c.t < 0.12 ? c.t / 0.12 : c.t > 0.88 ? Math.max(0, (1 - c.t) / 0.12) : 1
        if (c.t >= 1) {
          if (c.sp.parent) c.sp.parent.removeChild(c.sp)
          c.sp.destroy()
          if (c.onDone) c.onDone()
          chipFly.splice(i, 1)
        }
      }
    }

    // community card in-place flip (showCardAni): scaleX 1->0.01 (swap face) ->1, each half = OPEN_CARD
    if (comFlips.length) {
      for (let i = comFlips.length - 1; i >= 0; i--) {
        const fl = comFlips[i]
        fl.t += dt
        if (fl.t < OPEN_CARD) {
          fl.slot.node.scale.x = Math.max(0.01, 1 - (fl.t / OPEN_CARD) * 0.99)
        } else {
          if (!fl.swapped) {
            fl.swapped = true
            setCardTex(fl.slot.sp, cardFrontTex(fl.value), COM_CARD_W, COM_CARD_H)
          }
          const k = Math.min(1, (fl.t - OPEN_CARD) / OPEN_CARD)
          fl.slot.node.scale.x = 0.01 + k * 0.99
          if (k >= 1) {
            fl.slot.node.scale.x = 1
            comFlips.splice(i, 1)
          }
        }
      }
    }

    // 摊牌开牌(showCardAni): scale.x base->0.01 换正面 ->base，单边 OPEN_CARD。落定回调盖暗罩。
    if (showFlips.length) {
      for (let i = showFlips.length - 1; i >= 0; i--) {
        const fl = showFlips[i]
        fl.t += dt
        if (fl.t < OPEN_CARD) {
          fl.sp.scale.x = Math.max(0.01, fl.baseSX * (1 - (fl.t / OPEN_CARD) * 0.99))
        } else {
          if (!fl.swapped) {
            fl.swapped = true
            setCardTex(fl.sp, cardFrontTex(fl.value), fl.w, fl.h)
          }
          const k = Math.min(1, (fl.t - OPEN_CARD) / OPEN_CARD)
          fl.sp.scale.x = fl.baseSX * (0.01 + k * 0.99)
          if (k >= 1) {
            fl.sp.scale.x = fl.baseSX
            fl.sp.scale.y = fl.baseSY
            showFlips.splice(i, 1)
            fl.onFlipped && fl.onFlipped()
          }
        }
      }
    }
    // 暗罩淡入（开牌后 shade 由 0→SHADE_ALPHA），仅 dim 的牌淡入，高亮牌不出罩。
    if (showShades.length) {
      for (const sh of showShades) {
        if (!sh.fadeIn) continue
        if (sh.g.alpha < SHADE_ALPHA) sh.g.alpha = Math.min(SHADE_ALPHA, sh.g.alpha + dt / 0.18 * SHADE_ALPHA)
      }
    }
    // 赢家金环脉冲（沿座位头像外圈，金色，呼吸）。
    for (const view of seatViews.values()) {
      if (!view._sdGlow) continue
      const pulse = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(performance.now() / 260))
      const g = view._sdGlow
      g.clear()
      g.lineStyle(6, 0xffd23b, pulse)
      g.drawCircle(0, 0, GOLD_OUTER_R + 3)
      g.lineStyle(3, 0xfff2b0, pulse * 0.8)
      g.drawCircle(0, 0, GOLD_OUTER_R + 9)
    }

    // river squeeze (搓牌, WPPeekCardMesh 移植): 折线绕柱面把牌从左卷开露出正面；node 缩放
    //   随 customEasingScale 1→~1.12→1 放大回落；fagongpai2 在翻开瞬间(p~0.82)播；结束落静态正面。
    if (comPeek) {
      comPeek.t += dt
      const p = comPeek.t / PEEK_OPEN_TIME
      // 折线线性扫过(对应 PeekAuto: line lerp p0→p1)，扫到 ~0.92 处余下让其翻平落定。
      comPeek.peek.setProgress(Math.min(1, p / 0.92))
      // customEasingScale: <0.55 维持 1，[0.55,0.85] 放大(峰值~+12%)，>0.85 回落到 1。
      let sc = 1
      if (p >= 0.55 && p < 0.85) sc = 1 + 0.12 * ((p - 0.55) / 0.3)
      else if (p >= 0.85) sc = 1.12 - 0.12 * Math.min(1, (p - 0.85) / 0.15)
      comPeek.slot.node.scale.set(sc)
      if (!comPeek.soundPlayed && p >= 0.82) {
        comPeek.soundPlayed = true
        playSound('fagongpai2')
      }
      if (p >= 1) {
        const slot = comPeek.slot
        slot.sp.visible = true
        setCardTex(slot.sp, cardFrontTex(comPeek.value), COM_CARD_W, COM_CARD_H)
        slot.node.scale.set(1)
        if (comPeek.peek.mesh.parent) comPeek.peek.mesh.parent.removeChild(comPeek.peek.mesh)
        comPeek.peek.destroy()
        comPeek = null
      }
    }

    // fold: 整组牌背朝中心 logo 线性飞 .58s；起飞 .4s 后线性淡出 .25s 到 0；淡尽即销毁。
    if (folds.length) {
      for (let i = folds.length - 1; i >= 0; i--) {
        const f = folds[i]
        f.t += dt
        const m = Math.min(1, f.t / FOLD_MOVE)
        f.sp.x = f.from.x + (f.to.x - f.from.x) * m
        f.sp.y = f.from.y + (f.to.y - f.from.y) * m
        if (f.t > FOLD_ALPHA_DELAY) {
          f.sp.alpha = Math.max(0, 1 - (f.t - FOLD_ALPHA_DELAY) / FOLD_ALPHA)
        }
        if (f.t >= FOLD_MOVE && f.sp.alpha <= 0.001) {
          if (f.sp.parent) f.sp.parent.removeChild(f.sp)
          f.sp.destroy()
          folds.splice(i, 1)
        }
      }
    }

    // 清场收牌(cleanNotify): 公牌/手牌/摊牌牌淡出 + 收向中心 logo（CLEAR_FADE），并略缩尺寸强化「收回」。
    //   位移/缩放/淡出由此每帧推进；销毁与 board/pot/特效复位由 playClear 的延时统一处理。
    if (clears.length) {
      for (const c of clears) {
        if (!c.disp || !c.disp.transform) continue // 已被销毁（异步竞争）→ 跳过
        c.t += dt / CLEAR_FADE
        const e = c.t >= 1 ? 1 : easeSineOut(c.t)
        c.disp.x = c.from.x + (c.to.x - c.from.x) * e
        c.disp.y = c.from.y + (c.to.y - c.from.y) * e
        c.disp.alpha = Math.max(0, 1 - e)
        if (c.disp.scale) c.disp.scale.set(1 - 0.4 * e)
      }
    }

    if (!flying.length) return
    for (let i = flying.length - 1; i >= 0; i--) {
      const f = flying[i]
      f.t += dt / DEAL_CARD
      const e = f.t >= 1 ? 1 : easeSineOut(f.t)
      f.sp.x = f.from.x + (f.to.x - f.from.x) * e
      f.sp.y = f.from.y + (f.to.y - f.from.y) * e
      if (f.rot0 !== f.rot1) f.sp.angle = f.rot0 + (f.rot1 - f.rot0) * e
      // flash: fade in fast, fade out near arrival
      f.sp.alpha = f.t < 0.12 ? f.t / 0.12 : f.t > 0.78 ? Math.max(0, (1 - f.t) / 0.22) : 1
      if (f.t >= 1) {
        if (f.sp.parent) f.sp.parent.removeChild(f.sp)
        f.sp.destroy()
        flying.splice(i, 1)
      }
    }
  }
  app.ticker.add(tick)

  layout()

  return {
    layout,
    render,
    playDeal,
    clearDeal,
    playFold,
    clearFolds,
    playShowdown,
    clearShowdown,
    playClear,
    clearClears,
    playGift,
    clearGifts,
    startCountdown,
    clearCountdown,
    clearCountdownExcept,
    hasCountdown,
    playWin,
    clearWin,
    clearWins,
    playAllin,
    clearAllin,
    clearAllins,
    playCommunity,
    clearCommunity,
    // 调试探针：当前可见公共牌槽数（probe_board_clear.cjs 用）
    comSlotCount() {
      return comSlots.filter((s) => s.node && !s.node._destroyed && s.node.visible).length
    },
    // 调试探针：座位视觉状态（probe_fold_reset.cjs 用）——弃牌字/压暗/牌 tint 是否还原
    seatDebug(nodeId) {
      const v = seatViews.get(nodeId)
      if (!v || v.kind !== 'player') return null
      const av = v.avatarNodes && v.avatarNodes[0]
      const sp0 = v.cardSprites && v.cardSprites[0]
      return {
        containerAlpha: v.container.alpha,
        avatarAlpha: av ? av.alpha : null,
        viewFolded: !!v.folded,
        statusText: v.statusBadge && !v.statusBadge._destroyed ? v.statusBadge.text : null,
        cardTint: sp0 && !sp0._destroyed ? sp0.tint : null,
        cardAlpha: sp0 && !sp0._destroyed ? sp0.alpha : null,
        cardTypeAlpha: v.cardType && !v.cardType._destroyed ? v.cardType.alpha : null,
        hasCountdown: countdowns.has(nodeId),
      }
    },
    playBet,
    collectBet,
    collectAllBets,
    clearBets,
    setDealer,
    postBlinds,
    clearDealer,
    setPot,
    addPot,
    clearPot,
    setPots,
    clearPots,
    // 轮到自己时操作条覆盖底部座位 → 隐藏自己头像圈/名字，仅留手牌+身家（对照 200.jpg）
    setSelfAvatarHidden(hidden) {
      for (const view of seatViews.values()) {
        if (view.kind === 'player' && view.player && view.player.isSelf && view.avatarNodes) {
          for (const n of view.avatarNodes) if (n) n.visible = !hidden
        }
      }
    },
    destroy() {
      app.ticker.remove(tick)
      offSkinChange()
      clearDeal()
      clearFolds()
      clearShowdown()
      clearClears()
      clearGifts()
      clearCommunity()
      clearBets()
      clearDealer()
      clearPots()
      for (const id of [...countdowns.keys()]) clearCountdown(id)
      for (const id of [...wins.keys()]) clearWin(id)
      clearAllins()
      for (const c of winCoins) {
        if (c.sp.parent) c.sp.parent.removeChild(c.sp)
        c.sp.destroy()
      }
      winCoins.length = 0
      if (world.parent) world.parent.removeChild(world)
      world.destroy({ children: true })
      seatViews.clear()
    },
  }
}
