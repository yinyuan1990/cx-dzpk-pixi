// 俱乐部全链路探针:
//   A(群主): 创建俱乐部 → 详情 → 建俱乐部牌局
//   B(成员): 申请加入 → A 审批同意 → A 设 B 为合伙人 → B 看到俱乐部与牌局并进房
// 用法: node probe_club.cjs   (需 vite dev + 后端 9100 已起)
const { chromium } = require('playwright-core')

const BASE = process.env.PROBE_URL || 'http://localhost:5173'
const shot = (page, name) => page.screenshot({ path: `probe_club_${name}.png` })

async function login(ctx, nick) {
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.error(`[${nick}] pageerror:`, e.message))
  page.on('console', (m) => { if (m.type() === 'error') console.log(`[${nick}] console.err:`, m.text()) })
  await page.goto(BASE + '/#/login')
  await page.waitForSelector('.dev-edit', { timeout: 45000 })
  await page.fill('.dev-edit', nick)
  await page.click('.dev-btn')
  await page.waitForURL('**/#/hall', { timeout: 45000 }).catch(async (e) => {
    const err = await page.evaluate(() => {
      const el = document.querySelector('.err, .login-err, .hall-err')
      return el ? el.textContent.trim() : ''
    })
    throw new Error(`登录未跳转: ${err || e.message}`)
  })
  return page
}

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-proxy-server'] })
  const ctxA = await browser.newContext({ viewport: { width: 420, height: 900 } })
  const ctxB = await browser.newContext({ viewport: { width: 420, height: 900 } })

  // ---- A: 登录 → 俱乐部页 → 创建俱乐部 ----
  const A = await login(ctxA, '群主甲')
  await A.click('.bottombar button:has-text("俱乐部")')
  await A.waitForURL('**/#/club', { timeout: 8000 })
  await A.click('button:has-text("+ 创建")')
  await A.fill('.create-box input >> nth=0', '探针俱乐部')
  await A.click('.c-confirm')
  await A.waitForSelector('.okbar', { timeout: 8000 })
  const okText = await A.textContent('.okbar')
  const clubNo = (okText.match(/编号 (\d{6})/) || [])[1]
  if (!clubNo) throw new Error('未拿到俱乐部编号: ' + okText)
  console.log('[A] 创建俱乐部成功, 编号', clubNo)
  await A.waitForSelector('.item .cname:has-text("探针俱乐部")')
  await shot(A, 'a_list')

  // ---- A: 进详情 → 建俱乐部牌局 ----
  await A.click('.item:has-text("探针俱乐部")')
  await A.waitForSelector('.clubdetail .tname', { timeout: 8000 })
  await A.click('button:has-text("+ 建牌局")')
  await A.click('.c-opt:has-text("2人")')
  await A.click('.c-confirm')
  await A.waitForURL('**/#/table/**', { timeout: 10000 })
  console.log('[A] 俱乐部牌局已创建并进桌')
  await A.goBack()
  await A.waitForSelector('.clubdetail .item .rname', { timeout: 8000 })
  console.log('[A] 详情页牌局列表:', await A.textContent('.clubdetail .item .rname'))
  await shot(A, 'a_detail_rooms')

  // ---- B: 登录 → 申请加入 ----
  const B = await login(ctxB, '成员乙')
  await B.click('.bottombar button:has-text("俱乐部")')
  await B.waitForURL('**/#/club', { timeout: 8000 })
  await B.click('button:has-text("申请加入")')
  await B.fill('.create-box input', clubNo)
  await B.click('.c-confirm')
  await B.waitForSelector('.okbar:has-text("等待审批")', { timeout: 8000 })
  console.log('[B] 申请已提交')

  // ---- A: 审批 tab → 同意 ----
  await A.click('.tabbtn:has-text("审批")')
  await A.waitForSelector('.mem:has-text("成员乙")', { timeout: 8000 })
  await shot(A, 'a_applies')
  await A.click('.mem:has-text("成员乙") button:has-text("同意")')
  await A.waitForSelector('.okbar:has-text("已同意")', { timeout: 8000 })
  console.log('[A] 已同意成员乙加入')

  // ---- B: 收到通过推送,列表出现俱乐部 ----
  await B.waitForSelector('.okbar:has-text("已加入俱乐部")', { timeout: 8000 })
  await B.waitForSelector('.item .cname:has-text("探针俱乐部")', { timeout: 8000 })
  console.log('[B] 已加入,列表可见')
  await shot(B, 'b_joined')

  // ---- A: 成员 tab → 设乙为合伙人 50% ----
  await A.click('.tabbtn:has-text("成员")')
  await A.waitForSelector('.mem:has-text("成员乙")', { timeout: 8000 })
  await A.click('.mem:has-text("成员乙") button:has-text("设合伙人")')
  await A.waitForSelector('.create-box .c-opt:has-text("50%")', { timeout: 5000 })
  await A.click('.create-box .c-opt:has-text("50%")')
  await A.click('.create-box .c-confirm')
  await A.waitForSelector('.mem:has-text("成员乙") .role.r4', { timeout: 8000 })
  console.log('[A] 乙已是合伙人:', await A.textContent('.mem:has-text("成员乙") .rate'))
  await shot(A, 'a_members')

  // ---- B: 进详情看牌局并进房 ----
  await B.click('.item:has-text("探针俱乐部")')
  await B.waitForSelector('.clubdetail .item .rname', { timeout: 8000 })
  await B.click('.clubdetail .item')
  await B.waitForURL('**/#/table/**', { timeout: 10000 })
  await B.waitForSelector('canvas', { timeout: 10000 })
  console.log('[B] 已进入俱乐部牌局')
  await B.waitForTimeout(1500)
  await shot(B, 'b_table')

  console.log('PROBE_CLUB_OK')
  await browser.close()
})().catch((e) => {
  console.error('PROBE_CLUB_FAIL:', e.message)
  process.exit(1)
})
