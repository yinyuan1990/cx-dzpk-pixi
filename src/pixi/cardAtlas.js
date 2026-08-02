import * as PIXI from 'pixi.js'
import {
  FACE_SKINS,
  BACK_SKINS,
  CARD_SHEET_DIR,
  CARD_BACK_DIR,
  DEFAULT_FACE,
  DEFAULT_BACK,
  faceGridIndex,
} from '../config/cardSkins.js'

// 牌面/牌背皮肤纹理工厂：每套牌面只用 1 张 sheet 纹理，按网格切出各牌的子矩形 PIXI.Texture（缓存）；
//   牌背为独立 PNG。皮肤可切换（card_face_setting / card_back_setting），localStorage 持久化。
//   切换时通知监听者（牌桌据此 restyle 已显示的牌）。—— 把原本 52 张独立 PNG 合并为 sheet 切片，
//   减少 HTTP + 纹理批次，并拿到原版全部皮肤。

const LS_FACE = 'dzpkko_card_face'
const LS_BACK = 'dzpkko_card_back'

let faceId = localStorage.getItem(LS_FACE) || DEFAULT_FACE
let backId = localStorage.getItem(LS_BACK) || DEFAULT_BACK
const listeners = new Set()

function faceCfg() {
  return FACE_SKINS.find((s) => s.id === faceId) || FACE_SKINS[0]
}
function backCfg() {
  return BACK_SKINS.find((s) => s.id === backId) || BACK_SKINS[0]
}

const frameCache = new Map() // `${faceId}|${value}` -> PIXI.Texture（sheet 子矩形）

// 某牌面皮肤下，牌值 value 对应的子矩形纹理（按 sheet 网格切）。
export function frontTexture(value) {
  const cfg = faceCfg()
  const key = cfg.id + '|' + value
  const cached = frameCache.get(key)
  if (cached) return cached
  const base = PIXI.BaseTexture.from(CARD_SHEET_DIR + cfg.file)
  const idx = faceGridIndex(value, cfg.joker)
  const cw = cfg.w / cfg.cols
  const ch = cfg.h / cfg.rows
  const col = idx % cfg.cols
  const row = Math.floor(idx / cfg.cols)
  // 内缩 0.5px 防相邻格渗色（bilinear 采样边缘）。
  const frame = new PIXI.Rectangle(col * cw + 0.5, row * ch + 0.5, cw - 1, ch - 1)
  const tex = new PIXI.Texture(base, frame)
  frameCache.set(key, tex)
  return tex
}

// 当前牌背纹理（独立 PNG，整张）。
export function backTexture() {
  return PIXI.Texture.from(CARD_BACK_DIR + backCfg().file)
}

// 给搓牌 mesh 用：返回 { base, uv:[u0,v0,du,dv] } —— 自定义 shader 不认 texture.frame，需手动 uv 重映射。
export function frontMeshFrame(value) {
  const t = frontTexture(value)
  return { texture: t, uv: uvRectOf(t) }
}
export function backMeshFrame() {
  const t = backTexture()
  return { texture: t, uv: uvRectOf(t) }
}
// 由 PIXI.Texture 的 frame/baseTexture 算 0..1 uv 矩形 [u0,v0,du,dv]；base 未就绪时返回全图占位。
export function uvRectOf(tex) {
  const b = tex.baseTexture
  const f = tex.frame
  if (!b || !b.width || !b.height || !f) return [0, 0, 1, 1]
  return [f.x / b.width, f.y / b.height, f.width / b.width, f.height / b.height]
}

export function currentFace() {
  return faceId
}
export function currentBack() {
  return backId
}
export function faceSkins() {
  return FACE_SKINS
}
export function backSkins() {
  return BACK_SKINS
}
export function setFaceSkin(id) {
  if (!FACE_SKINS.some((s) => s.id === id) || id === faceId) return
  faceId = id
  localStorage.setItem(LS_FACE, id)
  emit()
}
export function setBackSkin(id) {
  if (!BACK_SKINS.some((s) => s.id === id) || id === backId) return
  backId = id
  localStorage.setItem(LS_BACK, id)
  emit()
}
export function onSkinChange(cb) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
function emit() {
  for (const cb of listeners) {
    try {
      cb({ face: faceId, back: backId })
    } catch (e) {
      void e
    }
  }
}

// 当前皮肤的资源 URL（供预热）。
export function currentFaceSheetUrl() {
  return CARD_SHEET_DIR + faceCfg().file
}
export function currentBackUrl() {
  return CARD_BACK_DIR + backCfg().file
}
