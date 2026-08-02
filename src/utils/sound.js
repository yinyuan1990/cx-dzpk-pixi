// 按钮音效（逆向真实音频）：通用点击 / 返回 / 大厅底部 Tab。
// 用音频池支持快速连点不被打断。首次用户交互后才能播（浏览器自动播放策略）。
const SOUNDS = {
  click: '/assets/audio/button_click.mp3',
  back: '/assets/audio/back_button.mp3',
  tab: '/assets/audio/hall_bottom_button.mp3',
  ruzuo: '/assets/audio/ruzuo.mp3',
  dealcards2: '/assets/audio/dealcards2.mp3',
  pturn: '/assets/audio/pturn.mp3', // 倒计时起手音（仅自己回合 PlayerTurn）
  onTurn: '/assets/audio/on_turn.mp3', // 操作条出现（optUser.setOptV -> playEffect("on_turn")）
  timeover: '/assets/audio/timeOverTipSound.mp3', // 临近超时提醒（Holdem_PlayerTimer TimeOverTip）
  shouchouma: '/assets/audio/shouchouma.mp3', // 底池筹码飞向赢家（Chips_Pot_ToPlayer）
  chipsToTable: '/assets/audio/chips_to_table.mp3', // 下注筹码上桌（ChipsToTable，stake.stakeFrom）
  chipsToPot: '/assets/audio/chips_to_pot.mp3', // 下注堆入底池（ChipsToPot，mainPotStake.stakeFromNew）
  specialSound: '/assets/audio/specialSound.mp3', // 赢得盈利（GetProfit）
  ying: '/assets/audio/ying.mp3', // 自己赢（seat.js resultWin -> playEffect("ying")，延迟 0.1s）
  fagongpai1: '/assets/audio/fagongpai1.mp3', // FLOP 翻 3 张公牌（comCards.setCardsForRound）
  fagongpai2: '/assets/audio/fagongpai2.mp3', // TURN / RIVER 翻 1 张公牌
  checkSound: '/assets/audio/checkSound.mp3', // 过牌敲桌（OnPlayerAction Enum_Action_Check → dzpoker/audio/checkSound）
  foldCardSound: '/assets/audio/foldCardSound.mp3', // 弃牌（OnPlayerAction Enum_Action_Fold → dzpoker/audio/foldCardSound）
  slider: '/assets/audio/slider.mp3', // 加注滑条跨步（allinBase.callback -> playEffect("slider")）
  sliderTop: '/assets/audio/slider_top.mp3', // 滑条封顶 All-In（allinBase.callback -> playEffect("slider_top")）
  allin: '/assets/audio/allin.mp3', // All-In VO（逆向 audio/allin_boy.mp3，playAllin 入场触发）
  // 送礼物互动道具音效（逆向 audio/mf_{type}.mp3，spingoAnimationLayer 落点 burst 时播；
  //   键名与 gifts.js GIFTS[type].sound 一一对应，dianzan→mf_good）。
  mf_meigui: '/assets/audio/mf_meigui.mp3',
  mf_xihongshi: '/assets/audio/mf_xihongshi.mp3',
  mf_zhuaji: '/assets/audio/mf_zhuaji.mp3',
  mf_zhadan: '/assets/audio/mf_zhadan.mp3',
  mf_poshui: '/assets/audio/mf_poshui.mp3',
  mf_good: '/assets/audio/mf_good.mp3',
  mf_kiss: '/assets/audio/mf_kiss.mp3',
  mf_buyu: '/assets/audio/mf_buyu.mp3',
  mf_motou: '/assets/audio/mf_motou.mp3',
  mf_huojiantong: '/assets/audio/mf_huojiantong.mp3',
}

// deal sound fires in rapid succession -> give it a bigger pool
const POOL_OVERRIDES = { dealcards2: 8 }

const pools = {}
const POOL_SIZE = 4
let enabled = true

function getPool(name) {
  if (!pools[name]) {
    const size = POOL_OVERRIDES[name] || POOL_SIZE
    pools[name] = Array.from({ length: size }, () => {
      const a = new Audio(SOUNDS[name])
      a.preload = 'auto'
      return a
    })
    pools[name]._i = 0
    pools[name]._n = size
  }
  return pools[name]
}

export function setSoundEnabled(v) {
  enabled = v
}

export function playSound(name = 'click') {
  if (!enabled || !SOUNDS[name]) return
  const pool = getPool(name)
  const a = pool[pool._i % pool._n]
  pool._i++
  try {
    a.currentTime = 0
    a.play().catch(() => {})
  } catch {
    /* ignore */
  }
}

// 根据被点元素决定音效类型（返回键/底部Tab/普通按钮）
function pickSoundFor(el) {
  if (el.closest('.back, .leave')) return 'back'
  if (el.closest('.tabitem, .bottombar button')) return 'tab'
  return 'click'
}

// 全局：任何 <button> 或 [data-sound] 被点都播音效（等价逆向里通用按钮音效）
export function installButtonSound() {
  document.addEventListener(
    'pointerdown',
    (e) => {
      const t = e.target instanceof Element ? e.target : null
      if (!t) return
      const btn = t.closest('button, [data-sound]')
      if (!btn || btn.disabled) return
      const forced = btn.getAttribute('data-sound')
      playSound(forced || pickSoundFor(btn))
    },
    true
  )
}
