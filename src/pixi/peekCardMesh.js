import * as PIXI from 'pixi.js'

// ============================================================================
// 河牌「搓牌」3D 网格卷边 —— PIXI.Mesh + 自定义 shader 移植 cocos `WPPeekCardMesh`。
//
// 原 cocos 实现（shader/WPPeekCard/WPPeekCardMesh）：MeshRenderer + 细分网格(front/back 双 UV)，
// 自定义材质把网格按一条折线(u_line)绕**柱面**卷起(u_radius/u_radian)，露出 tex_front。shader 源在
// recovered 里缺失，但同包姊妹类(PeekCardMesh)用 `_circleTransform` 在 CPU 端给出了等价柱面卷绕几何：
//   i = |x - 折线x|; r = radian*radius;
//   若 i ≤ r:  sx = radius - radius·cos(i/radius); sy = radius·sin(i/radius)   // 绕在柱面上
//   否则:      θ=radian; (sx,sy)=柱面终点 + 沿切线方向 (i-r) 的直线延伸               // 卷过半圈后切线伸出
//   新位置.x = 折线x + sx·sign; 新位置.z(抬起) = sy
// 这里把这套几何搬进**顶点着色器**：折线为一条竖直线(uFold) 从左扫到右(open(_,"right"))，
// 折线左侧=已揭开(显示正面)，右侧绕柱面卷起(显示背面)+抬起阴影，配合 node.scale 放大回落。
// ============================================================================

const VERT = `
precision highp float;
attribute vec2 aPos;
attribute vec2 aUv;
uniform mat3 projectionMatrix;
uniform mat3 translationMatrix;
uniform float uFold;    // 竖直折线 x（卡片本地坐标）；折线右侧 = 被掀起卷曲的「正面」片
uniform float uRadius;  // 柱面卷绕半径（末段放大→摊平）
uniform float uRadian;  // 卷绕角(弧度)
varying vec2 vUv;
varying float vReveal;  // 1=掀起侧(卷曲的正面) 0=未掀起(平铺背面)
varying float vZ;       // 抬起高度，供片元做明暗
void main(void){
  vUv = aUv;
  float rel = aPos.x - uFold;     // >0 = 折线右侧 = 被掀起卷曲的一片（显示正面）
  vec2 p = aPos;
  float z = 0.0;
  float reveal = 0.0;             // 默认未掀起 = 背面平铺
  if (rel > 0.0001) {
    reveal = 1.0;                 // 掀起的这片显示正面，并随柱面卷曲（正面跟着卷）
    float arc = uRadian * uRadius;
    float sx;
    float sy;
    if (rel <= arc) {
      float ang = rel / uRadius;
      sx = uRadius - uRadius * cos(ang);
      sy = uRadius * sin(ang);
    } else {
      float ang = uRadian;
      float l = uRadius - uRadius * cos(ang);
      float c = uRadius * sin(ang);
      float u = rel - arc;
      vec2 tg = normalize(vec2(sin(ang), cos(ang))) * u;
      sx = l + tg.x;
      sy = c + tg.y;
    }
    p.x = uFold + sx;
    z = sy;
  }
  vReveal = reveal;
  vZ = z;
  // 伪透视：抬起越高，整体略微缩小（卷向观察者上方）
  float persp = 1.0 - z * 0.0009;
  vec2 pos = p * persp;
  gl_Position = vec4((projectionMatrix * translationMatrix * vec3(pos, 1.0)).xy, 0.0, 1.0);
}
`

const FRAG = `
precision highp float;
varying vec2 vUv;
varying float vReveal;
varying float vZ;
uniform sampler2D uFront;
uniform sampler2D uBack;
uniform vec4 uFrontUV;  // 子矩形 [u0,v0,du,dv]：自定义 shader 不认 texture.frame，手动重映射(支持 sheet 切片)
uniform vec4 uBackUV;
uniform float uShadow;
void main(void){
  vec2 fuv = uFrontUV.xy + vUv * uFrontUV.zw;
  vec2 buv = uBackUV.xy + vUv * uBackUV.zw;
  vec4 col = (vReveal > 0.5) ? texture2D(uFront, fuv) : texture2D(uBack, buv);
  // 掀起卷曲的正面随抬起做曲面明暗（折点附近最亮、卷向背面处转暗），让正面看着是真卷起；
  // 折线处由相邻 reveal 突变自然形成一条暗折痕。
  float curve = clamp(vZ * 0.012, 0.0, 0.55) * uShadow;
  float sh = (vReveal > 0.5) ? (1.0 - curve * 0.65) : 1.0;
  col.rgb *= sh;
  gl_FragColor = col;
}
`

// 由 PIXI.Texture 的 frame/baseTexture 算 0..1 uv 矩形 [u0,v0,du,dv]；未就绪时全图。
function uvRectOf(tex) {
  const b = tex.baseTexture
  const f = tex.frame
  if (!b || !b.width || !b.height || !f) return [0, 0, 1, 1]
  return [f.x / b.width, f.y / b.height, f.width / b.width, f.height / b.height]
}

// 建一张细分网格卡牌（front/back 双面），返回 mesh + 卷边参数 setter。
//   front/back 为 PIXI.Texture（可为 sheet 子矩形）；shader 按 uv 子矩形采样。
export function createPeekCardMesh(front, back, W, H, seg = 24) {

  const verts = []
  const uvs = []
  const idx = []
  for (let j = 0; j <= seg; j++) {
    for (let i = 0; i <= seg; i++) {
      const u = i / seg
      const v = j / seg
      verts.push(-W / 2 + u * W, -H / 2 + v * H)
      uvs.push(u, v)
    }
  }
  for (let j = 0; j < seg; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i
      const b = a + 1
      const c = a + (seg + 1)
      const d = c + 1
      idx.push(a, c, b, b, c, d)
    }
  }

  const geometry = new PIXI.Geometry()
    .addAttribute('aPos', verts, 2)
    .addAttribute('aUv', uvs, 2)
    .addIndex(idx)

  const baseRadius = Math.max(16, W * 0.24)
  const uniforms = {
    uFront: front,
    uBack: back,
    uFrontUV: uvRectOf(front),
    uBackUV: uvRectOf(back),
    uFold: W / 2, // 起始折线在右缘外 → 全部背面平铺（未掀起）
    uRadius: baseRadius,
    uRadian: Math.PI * 0.62, // 掀起约 110°
    uShadow: 1.0,
  }
  const shader = PIXI.Shader.from(VERT, FRAG, uniforms)
  const mesh = new PIXI.Mesh(geometry, shader)
  // 2D 卡面，无需深度测试/背面剔除（卷起的两面都要可见）。
  mesh.state.depthTest = false
  mesh.state.culling = false

  return {
    mesh,
    // progress 0..1：折线从右缘扫到左缘 → 掀起的正面卷曲面从右向左铺满整张牌。
    //   末段把半径放大，使卷曲的正面逐渐摊平、平稳落定为正面牌。
    setProgress(t) {
      const p = Math.max(0, Math.min(1, t))
      // sheet 子矩形可能在 mesh 创建后才加载完成 → 每帧刷新 uv，base 就绪后即校正。
      shader.uniforms.uFrontUV = uvRectOf(front)
      shader.uniforms.uBackUV = uvRectOf(back)
      shader.uniforms.uFold = W / 2 - p * W
      // [0.8,1] 区间半径 base→大 → 曲面趋平（对应 cocos open 阶段 u_radius 拉大摊平）。
      const k = p <= 0.8 ? 0 : (p - 0.8) / 0.2
      const flat = k * k * (3 - 2 * k) // smoothstep
      shader.uniforms.uRadius = baseRadius + flat * W * 3
    },
    setShadow(s) {
      shader.uniforms.uShadow = s
    },
    destroy() {
      mesh.destroy()
      // 纹理走 PIXI.Texture.from 缓存，跨多次搓牌复用，不在此销毁。
    },
  }
}
