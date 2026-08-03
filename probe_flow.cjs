// 全流程探针:登录 → 大厅创建房间 → 进桌 → 坐下 → 带入 → 机器人补位开局 → 自动过牌/跟注几手。
// 用法:先起后端(9100)与 npm run dev(5173),再 node probe_flow.cjs
const { chromium } = require('playwright-core')

const BASE = process.env.PROBE_URL || 'http://localhost:5173'

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const page = await browser.newPage({ viewport: { width: 420, height: 880 } })
  page.on('pageerror', (e) => console.log('[pageerror]', e.message))
  page.on('console', (m) => { if (m.type() === 'error') console.log('[console.err]', m.text()) })

  // 1. 登录
  await page.goto(BASE + '/#/login')
  await page.waitForSelector('.dev-edit', { timeout: 15000 })
  await page.fill('.dev-edit', '测试员')
  await page.click('.dev-btn')
  await page.waitForURL('**/#/hall', { timeout: 10000 })
  await page.waitForTimeout(800)
  await page.screenshot({ path: 'probe_hall.png' })
  console.log('OK 登录进大厅')

  // 2. 创建房间(默认 50/100, 9人, 30分钟)
  await page.click('.create-btn')
  await page.waitForSelector('.c-confirm')
  await page.screenshot({ path: 'probe_create.png' })
  await page.click('.c-confirm')
  await page.waitForURL('**/#/table/**', { timeout: 10000 })
  console.log('OK 创建房间并进桌', page.url())

  // 3. 等加载页揭开 + 进房快照
  await page.waitForTimeout(3500)
  await page.screenshot({ path: 'probe_table_enter.png' })

  // 4. 点最下方空座坐下
  const seatIdx = await page.evaluate(() => {
    const seats = [...document.querySelectorAll('button.seat')]
    let best = 0
    let maxY = -1
    seats.forEach((el, i) => {
      const r = el.getBoundingClientRect()
      if (r.top > maxY) { maxY = r.top; best = i }
    })
    return best
  })
  await page.locator('button.seat').nth(seatIdx).click()
  await page.waitForSelector('.buyin-box', { timeout: 8000 })
  await page.screenshot({ path: 'probe_buyin.png' })
  console.log('OK 坐下,带入弹窗已出')

  // 5. 确认带入(最小 40BB)
  await page.click('.buyin-confirm')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'probe_bought.png' })
  console.log('OK 带入完成,等机器人补位开局…')

  // 6. 机器人补位 → 开局;自动过牌/跟注打几轮
  await page.waitForTimeout(8000)
  await page.screenshot({ path: 'probe_hand1.png' })
  for (let k = 0; k < 10; k++) {
    const acted = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')]
        .filter((b) => b.offsetParent && /让牌|过牌|跟注/.test(b.textContent))
      if (btns.length) { btns[0].click(); return true }
      return false
    })
    console.log(`第${k + 1}轮 行动=${!!acted}`)
    await page.waitForTimeout(4500)
  }
  await page.screenshot({ path: 'probe_hand2.png' })
  await page.waitForTimeout(6000)
  await page.screenshot({ path: 'probe_hand3.png' })
  console.log('DONE 探针结束')
  await browser.close()
})().catch((e) => { console.error('FAIL', e); process.exit(1) })
