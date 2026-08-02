import * as PIXI from 'pixi.js'
import { loadPixiSpine, getSpineClass } from '../utils/loadPixiSpine.js'

// ============================================================================
// 送礼物互动道具 · 骨骼动画（逆向 spingoAnimationLayer.js）
//   真机互动道具两段式：① 2D 道具图标从送礼者飞向受赠者(startAni tween)；
//   ② 落点播放该礼物的骨骼 burst(initAniNode + 播放 defaultAnima)。
//   骨骼分两种引擎：
//     · DragonBones（draArr）：meigui/xihongshi/zhuaji/zhadan/poshui —— 官方 DragonBones Pixi 5.x
//       runtime(/lib/dragonBones.js) + PixiFactory 解析 cocos 包装的 *_ske.json/_tex.json + png。
//     · Spine（spineArr）：dianzan(good)/kiss/buyu/motou/huojiantong —— pixi-spine v2(/lib/pixi-spine.js)。
//       plain 三件(buyu/motou/huojiantong)来自 recovered3x；kiss/dianzan 的 skeleton/atlas 从
//       apk_unzip 原始 import 的 sp.SkeletonData 抽出补回（见 recover_spine.ps1）。
//   draArr/spineArr 全 10 个礼物已悉数恢复（spingoAnimationLayer 完整集合）。toolsIcon 飞行图标
//   未随包恢复 → 飞行段统一用绘制投射物近似 2D 道具飞行。
// ============================================================================

// 统一礼物注册表。engine='db' 走 DragonBones；engine='spine' 走 Spine。
//   scale/dx/dy/flipOnRight/timeScale 复刻 spingoAnimationLayer.initAniNode 每礼物分支：
//     · scale = 真机基准 scale × 1.44(initAniNode 末尾统一 ×1.44)；
//     · dx/dy = 落点微偏(cocos y-up 偏移换算到屏幕 y 向下，取相反号)；
//     · flipOnRight = 受赠者在右半区(e.x>0)时水平翻转朝向；
//     · anim = defaultAnima(spine)；DragonBones 统一 'Animation1'；
//     · timeScale = spine loadSpine 第 4 参(动画速度，huojiantong=.2 慢放等)。
// spin = startAni 里番茄/炸弹类 rotateBy 360（边飞边翻滚）；其余礼物只做 moveTo + 浮动/淡入。
export const GIFTS = {
  // ---- DragonBones（draArr）----
  meigui: { engine: 'db', scale: 1.44, dx: 0, dy: 0, flipOnRight: false, color: 0xe8447a, sound: 'mf_meigui' },
  xihongshi: { engine: 'db', scale: 1.44, dx: 0, dy: 0, flipOnRight: false, color: 0xe5402a, sound: 'mf_xihongshi', spin: true },
  zhuaji: { engine: 'db', scale: 1.44, dx: 30, dy: 50.4, flipOnRight: false, color: 0xd9a441, sound: 'mf_zhuaji' },
  zhadan: { engine: 'db', scale: 1.44, dx: 0, dy: 0, flipOnRight: false, color: 0x4a4a4a, sound: 'mf_zhadan', spin: true },
  poshui: { engine: 'db', scale: 1.44, dx: 45, dy: -20, flipOnRight: true, color: 0x39b6e8, sound: 'mf_poshui' },
  // ---- Spine（spineArr）----
  // good：resUrl=anima/dianzan/dianzan，scale .3×1.44=.432，cocos y-72 → 屏幕 +72。
  dianzan: { engine: 'spine', anim: 'idle', loop: false, scale: 0.432, dx: 0, dy: 72, flipOnRight: false, timeScale: 1, color: 0x4aa3ff, sound: 'mf_good', life: 2.4 },
  // kiss：scale .2×1.44=.288，cocos y-28.8 → +28.8，右半区翻转。
  kiss: { engine: 'spine', anim: 'idle', loop: false, scale: 0.288, dx: 0, dy: 28.8, flipOnRight: true, timeScale: 1, color: 0xff6fae, sound: 'mf_kiss', life: 2.4 },
  // buyu：fish 骨骼几何整体偏右上，dx/dy 居中到头像；scale 收一档避免过大；右半区翻转。
  buyu: { engine: 'spine', anim: 'idle', loop: false, scale: 1.6, dx: -150, dy: -40, flipOnRight: true, timeScale: 0.7, color: 0x6fd0ff, sound: 'mf_buyu', life: 2.8 },
  // motou：scale .3×1.44=.432，无偏移。
  motou: { engine: 'spine', anim: 'animation', loop: false, scale: 0.432, dx: 0, dy: 0, flipOnRight: false, timeScale: 1, color: 0x9b6b3a, sound: 'mf_motou', life: 2.8 },
  // huojiantong：scale 1×1.44=1.44，cocos y-295.2 → +295.2，慢放 timeScale .2。
  huojiantong: { engine: 'spine', anim: 'baozha', loop: false, scale: 1.44, dx: 0, dy: 295.2, flipOnRight: false, timeScale: 0.2, color: 0xffa033, sound: 'mf_huojiantong', life: 3.2 },
}

export const GIFT_TYPES = Object.keys(GIFTS)
// 旧引用别名（table.js 等沿用 GIFT_CFG）。
export const GIFT_CFG = GIFTS

// 飞行段 2D 道具图标（逆向 anima/toolsIcon/{type}.png，startAni 飞向受赠者用的就是这张真图标，
//   非臆造投射物）。已按 webapp 礼物类型命名拷入 public（dianzan←good 等映射见 toolsIcon 目录）。
export const GIFT_ICON_BASE = '/assets/gifts/toolsIcon'
export function giftIconSrc(type) {
  return `${GIFT_ICON_BASE}/${type}.png`
}

export function giftEngine(type) {
  return (GIFTS[type] && GIFTS[type].engine) || 'db'
}

// ============================================================================
// DragonBones 引擎
// ============================================================================

// 所有 DragonBones 礼物 armature 名都是 'armatureName'，动画名 'Animation1'（见 *_ske.json）。
const ARMATURE_NAME = 'armatureName'
export const GIFT_ANIM = 'Animation1'
export const GIFT_COMPLETE = 'complete'

let runtimeReady = null
function ensureRuntime() {
  if (window.dragonBones && window.dragonBones.PixiFactory) return Promise.resolve()
  if (runtimeReady) return runtimeReady
  window.PIXI = window.PIXI || PIXI
  runtimeReady = new Promise((resolve, reject) => {
    const sc = document.createElement('script')
    sc.src = '/lib/dragonBones.js'
    sc.onload = () => resolve()
    sc.onerror = () => reject(new Error('failed to load /lib/dragonBones.js'))
    document.head.appendChild(sc)
  })
  return runtimeReady
}

// cocos 把 DragonBones 原始 JSON 包成 [{ __type__, _name, _dragonBonesJson|_atlasJson: "<stringified>" }]。
function unwrapCocosJson(text, field) {
  const arr = JSON.parse(text)
  return JSON.parse(arr[0][field])
}

function loadTexture(url) {
  return new Promise((resolve, reject) => {
    const tex = PIXI.Texture.from(url)
    if (tex.baseTexture.valid) return resolve(tex)
    tex.baseTexture.once('loaded', () => resolve(tex))
    tex.baseTexture.once('error', () => reject(new Error('texture load failed: ' + url)))
  })
}

const loaded = new Set()
// 首次使用某 DragonBones 礼物时拉取并注册其骨骼数据 + 贴图（按 type 命名避免撞名）。
export async function ensureGift(type) {
  await ensureRuntime()
  const factory = window.dragonBones.PixiFactory.factory
  if (loaded.has(type)) return factory
  const base = `/assets/gifts/${type}/${type}`
  const [skeText, texText] = await Promise.all([
    fetch(base + '_ske.json').then((r) => r.text()),
    fetch(base + '_tex.json').then((r) => r.text()),
  ])
  const skeRaw = unwrapCocosJson(skeText, '_dragonBonesJson')
  const atlasRaw = unwrapCocosJson(texText, '_atlasJson')
  const texture = await loadTexture(base + '_tex.png')
  factory.parseDragonBonesData(skeRaw, type)
  factory.parseTextureAtlasData(atlasRaw, texture, type)
  loaded.add(type)
  return factory
}

// 构建一个 PixiArmatureDisplay（PIXI.Container 子类）。
export async function buildGiftDisplay(type) {
  const factory = await ensureGift(type)
  return factory.buildArmatureDisplay(ARMATURE_NAME, type)
}

// 每帧推进 DragonBones 世界时钟（runtime 不自动挂 ticker，须由宿主驱动）。
export function advanceGiftClock(dt) {
  const db = window.dragonBones
  if (db && db.PixiFactory) db.PixiFactory.factory.clock.advanceTime(dt)
}

// ============================================================================
// Spine 引擎（pixi-spine v2）
// ============================================================================

// 模块级缓存：spineData 跨多次建桌/多次播放复用，避免共享 Loader 重复 add 报错。
const spineCache = new Map() // type -> spineData
const spinePromise = new Map() // type -> Promise<spineData>
export async function ensureSpineGift(type) {
  if (spineCache.has(type)) return spineCache.get(type)
  if (spinePromise.has(type)) return spinePromise.get(type)
  const p = loadPixiSpine()
    .then(
      () =>
        new Promise((resolve) => {
          const key = 'gift_' + type
          const loader = new PIXI.Loader()
          loader.add(key, `/assets/gifts/${type}/${type}.json`).load((_, res) => {
            const r = res && res[key]
            const data = r && r.spineData ? r.spineData : null
            if (data) spineCache.set(type, data)
            resolve(data)
          })
        }),
    )
    .catch((e) => { console.warn('gift spine load failed', type, e && (e.message || e)); return null })
  spinePromise.set(type, p)
  return p
}

// 构建一个 Spine 显示对象（PIXI.Container 子类）。autoUpdate 默认 true → pixi-spine 自驱动。
export function buildSpineGift(data) {
  const Spine = getSpineClass()
  if (!Spine || !data) return null
  return new Spine(data)
}

// 预加载（菜单测试可提前 warm，避免首播延迟）。DragonBones + Spine 各按引擎走对应通道。
export function preloadGifts(types = GIFT_TYPES) {
  return Promise.all(
    types.map((t) =>
      (giftEngine(t) === 'spine' ? ensureSpineGift(t) : ensureGift(t)).catch((e) =>
        console.warn('preload gift fail', t, e),
      ),
    ),
  )
}
