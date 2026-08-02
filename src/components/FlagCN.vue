<script setup>
// 中国国旗（区号 +86）。areaFlags 图集逐国 rect 在逆向中丢失，用矢量国旗等价，清晰准确。
// 一颗大星 + 四颗小星（小星朝向大星中心）。
const stars = [
  { x: 5, y: 5, r: 3, rot: 0 },
  { x: 10, y: 2, r: 1, rot: -50 },
  { x: 12, y: 4, r: 1, rot: -20 },
  { x: 12, y: 7, r: 1, rot: 10 },
  { x: 10, y: 9, r: 1, rot: 40 },
]
function starPoints(cx, cy, r, rot) {
  const pts = []
  for (let i = 0; i < 5; i++) {
    const aOut = (-90 + rot + i * 72) * (Math.PI / 180)
    pts.push([cx + r * Math.cos(aOut), cy + r * Math.sin(aOut)])
    const aIn = (-90 + rot + i * 72 + 36) * (Math.PI / 180)
    pts.push([cx + r * 0.382 * Math.cos(aIn), cy + r * 0.382 * Math.sin(aIn)])
  }
  return pts.map((p) => p.map((n) => n.toFixed(2)).join(',')).join(' ')
}
</script>

<template>
  <svg class="flag-cn" viewBox="0 0 30 20" preserveAspectRatio="xMidYMid slice">
    <rect width="30" height="20" fill="#de2910" />
    <polygon
      v-for="(s, i) in stars"
      :key="i"
      :points="starPoints(s.x, s.y, s.r, s.rot)"
      fill="#ffde00"
    />
  </svg>
</template>

<style scoped>
.flag-cn {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
