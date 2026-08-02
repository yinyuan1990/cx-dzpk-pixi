// 金额显示 — 忠实复刻 Unity StringHelper.ShowGold(bean, bUnit=false)。
// ★ 服务端所有金额(筹码/底池/盲注/前注/下注/赢得/跟注额/最小加注…)都是【分】(1/100 USDT)！
//   显示前必须 /100（Unity 所有金额都走 ShowGold = bean/100.0）。
//   规则：bean==0→"0"；realValue=bean/100；默认(unit=false)直接显示去尾零小数(如 1000→10、985420→9854.2)；
//        unit=true 且 realValue>10000 → realValue/1000 保留两位 + "k"（对齐 ShowGold bUnit 分支）。
export function formatKNotation(bean, unit = false) {
  const n = Math.trunc(Number(bean) || 0) // 服务端金额为整数分
  if (n === 0) return '0'
  const sign = n < 0 ? '-' : ''
  const real = Math.abs(n) / 100
  if (unit && real > 10000) {
    return sign + (real / 1000).toFixed(2) + 'k'
  }
  // 最多两位小数并去掉尾随的 0（C# string.Format("{0}", double) 等价：10.00→"10"、9854.20→"9854.2"）
  const s = real.toFixed(2).replace(/\.?0+$/, '')
  return sign + s
}
