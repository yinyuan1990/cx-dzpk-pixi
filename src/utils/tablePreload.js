import { currentFaceSheetUrl, currentBackUrl } from '../pixi/cardAtlas.js'

// 进桌资源预加载（对齐 Cocos loadingJs.preScene → preloadScene 的「进桌加载页」做法）：
//   进入牌桌前，按进度把牌桌要用到的图集/特效贴图全部网络下载 + 解码，加载完再揭开牌桌，
//   避免发牌/摊牌时首用同步解码卡顿。返回 Promise，onProgress(0..1) 实时回调。

// 牌桌常用特效 sprite（与 pixi/table.js 常量一致；牌面/牌背走当前皮肤）。
const EFFECT_URLS = [
  '/assets/table/avatar_frame.png',
  '/assets/table/score_plate_bg.png',
  '/assets/table/ic_seat_empty_bg.png',
  '/assets/table/chip.png',
  '/assets/table/dealer_btn.png',
  '/assets/table/sb_btn.png',
  '/assets/table/bb_btn.png',
  '/assets/table/spark_flash.png',
  '/assets/table/particle_tex.png',
  '/assets/table/win_you.png',
  '/assets/table/win_win.png',
  '/assets/table/win_flare.png',
  '/assets/table/win_pkw.png',
  '/assets/table/win_anim/win_text.png',
  '/assets/table/win_anim/you_text.png',
  ...Array.from({ length: 13 }, (_, i) => `/assets/table/win_anim/lightball_${String(i).padStart(2, '0')}.png`),
  ...Array.from({ length: 5 }, (_, i) => `/assets/table/win_anim/flash_${String(i).padStart(2, '0')}.png`),
]

function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image()
    const done = () => resolve(url)
    img.onload = done
    img.onerror = done // 缺图不阻塞进桌
    img.src = url
  })
}

// 预加载所有进桌资源；onProgress(p) p∈[0,1]。extra=额外要预热的 URL（如当前牌桌背景）。
export function preloadTableAssets(onProgress, extra = []) {
  const urls = Array.from(new Set([currentFaceSheetUrl(), currentBackUrl(), ...EFFECT_URLS, ...extra]))
  const total = urls.length || 1
  let done = 0
  onProgress && onProgress(0)
  return Promise.all(
    urls.map((u) =>
      loadImage(u).then(() => {
        done++
        onProgress && onProgress(done / total)
      }),
    ),
  ).then(() => urls.length)
}
