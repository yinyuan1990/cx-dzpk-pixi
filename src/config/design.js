// 设计分辨率（来自逆向 loadingScene.fire / 需求说明 §3.1）
// 竖屏 1080×2338，Cocos 适配为 fitWidth=true、fitHeight=false。
export const DESIGN_WIDTH = 1080
export const DESIGN_HEIGHT = 2338

// 适配策略：fitWidth —— 缩放比按屏幕宽度撑满设计宽度，
// 纵向用 Widget 式锚定（顶/底/中）+ 背景 cover 填充，做到任何比例不留黑边。
export function computeScale(viewportWidth = window.innerWidth) {
  return viewportWidth / DESIGN_WIDTH
}
