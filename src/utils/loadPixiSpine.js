import * as PIXI from 'pixi.js'

let loading = null

// pixi-spine v2 是非模块 UMD：执行后命名空间落到全局 `window.pixi_spine`（含 Spine/AtlasParser）。
//   注意：本工程的 window.PIXI 是 ES Module 命名空间(封闭对象)，lib 内 `PIXI.spine = pixi_spine`
//   在非严格全局作用域被静默丢弃(无法给 Module 加属性)，导致 window.PIXI.spine 始终缺失。
//   故这里一律以 window.pixi_spine 为准，且绝不回写 window.PIXI（会抛 "Cannot assign to Module")。
//   AtlasParser 插件 lib 已用 PIXI.Loader.registerPlugin(静态方法，对 Module 只读访问)挂好，无需重复。
function spineNamespace() {
  if (typeof window === 'undefined') return null
  return window.pixi_spine || (window.PIXI && window.PIXI.spine) || null
}

function wireSpine(ns) {
  if (!ns || !ns.Spine) return null
  // 兜底：极端情况下 lib 未注册图集插件，则手动补注册（registerPlugin 静态、幂等性自行判重）。
  try {
    const Loader = PIXI.Loader
    const plugins = Loader && Loader._plugins
    const has = plugins && plugins.some((p) => p && p.use && ns.AtlasParser && p.use === ns.AtlasParser.use)
    if (Loader && ns.AtlasParser && !has) Loader.registerPlugin(ns.AtlasParser)
  } catch (e) { void e }
  return ns
}

export function loadPixiSpine() {
  const existing = spineNamespace()
  if (existing && existing.Spine) return Promise.resolve(wireSpine(existing))
  if (loading) return loading
  window.PIXI = window.PIXI || PIXI
  loading = new Promise((resolve, reject) => {
    const sc = document.createElement('script')
    sc.src = '/lib/pixi-spine.js'
    sc.onload = () => {
      const ns = spineNamespace()
      if (ns && ns.Spine) resolve(wireSpine(ns))
      else reject(new Error('pixi-spine loaded but Spine class missing'))
    }
    sc.onerror = () => reject(new Error('failed to load /lib/pixi-spine.js'))
    document.head.appendChild(sc)
  })
  return loading
}

export function getSpineClass() {
  const ns = spineNamespace()
  return ns ? ns.Spine : null
}
