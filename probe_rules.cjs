// 建房规则参数 + 座位布局探针:
//   ①建房弹窗应有全量参数(人数2~9/思考时间/带入/前注/最短上桌/玩法开关);
//   ②建 2 人桌 → 桌面应画 2 个座位(中下 + 中上,对齐 Unity SeatUIInfos[2]);
//   ③建 6 人桌 → 6 个座位(对齐 SeatUIInfos[6]);
//   ④建房参数(抓头/保险/埋牌)能建成功(后端 RoomRules.parse 校验通过)。
// 用法:先起后端(9100)与 npm run dev(5173),再 node probe_rules.cjs
const { chromium } = require('playwright-core')

const BASE = process.env.PROBE_URL || 'http://localhost:5173'

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const page = await browser.newPage({ viewport: { width: 420, height: 880 } })
  page.on('pageerror', (e) => console.log('[pageerror]', e.message))
  page.on('console', (m) => { if (m.type() === 'error') console.log('[console.err]', m.text()) })

  // 登录
  await page.goto(BASE + '/#/login')
  await page.waitForSelector('.dev-edit', { timeout: 15000 })
  await page.fill('.dev-edit', '规则测试')
  await page.click('.dev-btn')
  await page.waitForURL('**/#/hall', { timeout: 10000 })

  // ① 建房弹窗全量参数检查(等到分组渲染齐,防 HMR/慢转换下查询过早)
  await page.click('.create-btn')
  await page.waitForSelector('.c-confirm')
  let labels = []
  for (let i = 0; i < 20; i++) {
    labels = await page.evaluate(() =>
      [...document.querySelectorAll('.c-label')].map((el) => el.textContent.trim()))
    if (labels.length >= 10) break
    await page.waitForTimeout(500)
  }
  console.log('建房表单分组:', labels.join(' | '))
  await page.screenshot({ path: 'probe_rules_form_raw.png', fullPage: true })
  for (const need of ['思考时间', '最大带入', '前注', '最短上桌', '玩法开关']) {
    if (!labels.some((l) => l.includes(need))) { console.log('FAIL 缺少分组:', need); process.exit(1) }
  }
  const seatBtns = await page.evaluate(() =>
    [...document.querySelectorAll('.c-opt')].filter((b) => /^[2-9]人$/.test(b.textContent.trim())).length)
  if (seatBtns !== 8) { console.log('FAIL 人数选项应为 2~9 共 8 个,实际', seatBtns); process.exit(1) }
  console.log('OK ① 建房表单参数齐全')
  await page.screenshot({ path: 'probe_rules_form.png' })

  // 建房辅助:选人数 + 开关,确认,进桌,数座位
  const clickOpt = async (text) => page.evaluate((t) => {
    const b = [...document.querySelectorAll('.c-opt')].find((x) => x.textContent.trim() === t)
    if (b) b.click()
  }, text)
  const seatCountOnTable = () => page.evaluate(() => document.querySelectorAll('button.seat').length)

  // ② 2 人桌(带抓头关,人数2)
  await clickOpt('2人')
  await page.click('.c-confirm')
  await page.waitForURL('**/#/table/**', { timeout: 10000 })
  await page.waitForTimeout(2500)
  let n = await seatCountOnTable()
  console.log('2人桌座位节点数 =', n)
  if (n !== 2) { console.log('FAIL 2人桌应画 2 个座位'); process.exit(1) }
  await page.screenshot({ path: 'probe_rules_2p.png' })
  console.log('OK ② 2人桌布局')

  // 回大厅
  await page.click('.tm-btn.open')
  await page.waitForTimeout(400)
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.menu-row')].find((x) => /离开|退出/.test(x.textContent))
    if (b) b.click()
  })
  await page.waitForURL('**/#/hall', { timeout: 10000 }).catch(async () => {
    await page.goto(BASE + '/#/hall')
  })
  await page.waitForTimeout(800)

  // ③ 6 人桌 + 玩法开关(抓头/保险/埋牌)
  await page.click('.create-btn')
  await page.waitForSelector('.c-confirm')
  await clickOpt('6人')
  await clickOpt('抓头')
  await clickOpt('保险')
  await clickOpt('埋牌')
  await clickOpt('1大盲') // 前注
  await page.click('.c-confirm')
  await page.waitForURL('**/#/table/**', { timeout: 10000 })
  await page.waitForTimeout(2500)
  n = await seatCountOnTable()
  console.log('6人桌座位节点数 =', n)
  if (n !== 6) { console.log('FAIL 6人桌应画 6 个座位'); process.exit(1) }
  await page.screenshot({ path: 'probe_rules_6p.png' })
  console.log('OK ③ 6人桌布局 + 抓头/保险/埋牌/前注参数建房成功')

  await browser.close()
  console.log('PASS 全部通过')
  process.exit(0)
})().catch((e) => { console.error('PROBE FAIL', e); process.exit(1) })
