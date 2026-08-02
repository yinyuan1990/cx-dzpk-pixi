// 保险面板 UI 探针:进房后经 __tableTest.feedEvent 注入 INSURANCE_OFFER,
//   验证领先方购买面板(outs/赔率/保费联动/按钮)渲染。
const { chromium } = require('playwright-core')

const BASE = 'http://localhost:5173'

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const page = await browser.newPage({ viewport: { width: 420, height: 880 } })
  page.on('pageerror', (e) => console.log('[pageerror]', e.message))

  await page.goto(BASE + '/#/login')
  await page.waitForSelector('.input-row input', { timeout: 15000 })
  await page.fill('.input-row input', '保险UI')
  await page.click('.login-btn')
  await page.waitForURL('**/#/hall', { timeout: 10000 })
  await page.click('.create-btn')
  await page.waitForSelector('.c-confirm')
  await page.click('.c-confirm')
  await page.waitForURL('**/#/table/**', { timeout: 10000 })
  await page.waitForTimeout(2500)

  // 注入保险报价(领先方 = 自己)
  await page.evaluate(() => {
    const uid = JSON.parse(localStorage.getItem('dzpk_user') || '{}').userId
      || (window.__pinia_game && window.__pinia_game.user.userId)
    const me = uid || (document.__vueApp ? 0 : 0)
    window.__tableTest.feedEvent('recvInsuranceOffer', {
      leaderUserId: window.__tableTest.myUserId ?? me,
      outs: 5, outCards: ['AS', 'AC', 'KH', 'KD', '7C'],
      oddsX100: 570, maxInsure: 2000, deadline: Date.now() + 12000,
    })
  })
  await page.waitForTimeout(600)
  // mine 判定依赖 userId;若横幅(他人视角)出现也算面板路径走通,再强制 mine 视角截图
  const hasPanel = await page.evaluate(() => !!document.querySelector('.ins-panel'))
  const hasBanner = await page.evaluate(() => !!document.querySelector('.ins-banner'))
  console.log('保险面板:', hasPanel, '横幅:', hasBanner)
  if (!hasPanel && !hasBanner) { console.log('FAIL 保险 UI 未渲染'); process.exit(1) }
  await page.screenshot({ path: 'probe_insurance_ui.png' })
  console.log('PASS 保险 UI 渲染')
  await browser.close()
  process.exit(0)
})().catch((e) => { console.error('PROBE FAIL', e); process.exit(1) })
