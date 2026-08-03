// 站起流程探针(对齐扯旋语义验证):
//   ①牌局中(未弃牌)点站起 → 应提示"本手结束后自动站起",座位保留继续打;
//   ②这手打完 → 自动站起(PLAYER_STAND),座位清空回观战 + 结算提示;
//   ③回大厅点"战绩" → 应有 ≥1 条周期/站起结算记录。
// 用法:先起后端(9100)与 npm run dev(5173),再 node probe_standup.cjs
const { chromium } = require('playwright-core')

const BASE = process.env.PROBE_URL || 'http://localhost:5173'

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const page = await browser.newPage({ viewport: { width: 420, height: 880 } })
  page.on('pageerror', (e) => console.log('[pageerror]', e.message))
  page.on('console', (m) => { if (m.type() === 'error') console.log('[console.err]', m.text()) })

  const errText = () => page.evaluate(() => {
    const el = document.querySelector('.table-err')
    return el ? el.textContent.trim() : ''
  })
  const menuHasStandUp = async () => {
    await page.click('.tm-btn.open')
    await page.waitForTimeout(400)
    const has = await page.evaluate(() =>
      [...document.querySelectorAll('.menu-row')].some((b) => /站起/.test(b.textContent)))
    return has
  }
  const closeMenu = async () => {
    await page.evaluate(() => {
      const mask = document.querySelector('.menu-mask')
      if (mask) mask.click()
    })
    await page.waitForTimeout(300)
  }

  // 1. 登录 → 大厅 → 创建房间 → 进桌 → 坐下 → 带入
  await page.goto(BASE + '/#/login')
  await page.waitForSelector('.dev-edit', { timeout: 15000 })
  await page.fill('.dev-edit', '站起测试')
  await page.click('.dev-btn')
  await page.waitForURL('**/#/hall', { timeout: 10000 })
  await page.click('.create-btn')
  await page.waitForSelector('.c-confirm')
  await page.click('.c-confirm')
  await page.waitForURL('**/#/table/**', { timeout: 10000 })
  await page.waitForTimeout(3500)
  const seatIdx = await page.evaluate(() => {
    const seats = [...document.querySelectorAll('button.seat')]
    let best = 0, maxY = -1
    seats.forEach((el, i) => {
      const r = el.getBoundingClientRect()
      if (r.top > maxY) { maxY = r.top; best = i }
    })
    return best
  })
  await page.locator('button.seat').nth(seatIdx).click()
  await page.waitForSelector('.buyin-box', { timeout: 8000 })
  await page.click('.buyin-confirm')
  console.log('OK 坐下带入,等机器人开局…')

  // 2. 等轮到自己行动(说明这手牌里,且未弃牌)
  await page.waitForFunction(() =>
    [...document.querySelectorAll('button')].some((b) => b.offsetParent && /让牌|过牌|跟注/.test(b.textContent)),
    { timeout: 40000 })
  console.log('OK 开局且轮到自己')

  // 3. 牌局中点菜单站起 → 应 pending
  await page.click('.tm-btn.open')
  await page.waitForTimeout(400)
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.menu-row')].find((x) => /站起/.test(x.textContent))
    if (b) b.click()
  })
  await page.waitForTimeout(800)
  const toast = await errText()
  console.log('站起回执提示:', JSON.stringify(toast))
  if (!/本手结束后/.test(toast)) { console.log('FAIL 应提示"本手结束后自动站起"'); process.exit(1) }
  await page.screenshot({ path: 'probe_standup_pending.png' })

  // 座位应保留(菜单里仍有"站起"=仍在座)
  if (!(await menuHasStandUp())) { console.log('FAIL 申请站起后座位不应立即清空'); process.exit(1) }
  await closeMenu()
  console.log('OK pending:座位保留,这手继续')

  // 4. 继续把这手打完(有按钮就过/跟,没有就等超时自动过/弃)
  let stood = false
  for (let k = 0; k < 30; k++) {
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')]
        .filter((b) => b.offsetParent && /让牌|过牌|跟注/.test(b.textContent))
      if (btns.length) btns[0].click()
    })
    await page.waitForTimeout(2000)
    const t = await errText()
    if (/已站起/.test(t)) { stood = true; console.log('OK 局末自动站起,结算提示:', JSON.stringify(t)); break }
  }
  if (!stood) {
    // 兜底:检查菜单里"站起"是否已消失(座位已清)
    const seated = await menuHasStandUp()
    await closeMenu()
    if (seated) { console.log('FAIL 这手结束后应自动站起'); process.exit(1) }
    console.log('OK 局末自动站起(座位已清)')
  }
  await page.screenshot({ path: 'probe_standup_done.png' })

  // 5. 回大厅看战绩
  await page.click('.tm-btn.open')
  await page.waitForTimeout(400)
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.menu-row')].find((x) => /离开|退出/.test(x.textContent))
    if (b) b.click()
  })
  await page.waitForURL('**/#/hall', { timeout: 10000 })
  await page.click('.ic.rec')
  await page.waitForTimeout(1200)
  const recCount = await page.evaluate(() => document.querySelectorAll('.rec-item').length)
  console.log('战绩条数:', recCount)
  await page.screenshot({ path: 'probe_records.png' })
  if (recCount < 1) { console.log('FAIL 站起后应有 ≥1 条战绩'); process.exit(1) }

  console.log('DONE 站起+战绩 全部通过')
  await browser.close()
})().catch((e) => { console.error('FAIL', e); process.exit(1) })
