// 线上验收:账号密码登录 → 建俱乐部 → 俱乐部建房(新全量表单,档位来自后台) → 进桌
// 用法: node probe_prod_auth.cjs  (打线上 47.122.115.33:19100)
const { chromium } = require('playwright-core')

const BASE = process.env.PROBE_URL || 'http://47.122.115.33:19100'
const phone = '139' + String(Math.floor(10000000 + Math.random() * 89999999))
const password = 'abc12345'

async function registerHttp() {
  const res = await fetch(BASE + '/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password, nickname: '验收' + phone.slice(-4) }),
  })
  const data = await res.json()
  if (data.code !== 0) throw new Error('注册失败: ' + data.msg)
  console.log('[HTTP] 注册成功', phone, 'userId=', data.userId)
}

;(async () => {
  await registerHttp()

  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-proxy-server'] })
  const page = await browser.newContext({ viewport: { width: 420, height: 900 } }).then((c) => c.newPage())
  page.on('console', (m) => { if (m.type() === 'error') console.log('console.err:', m.text()) })

  // 账号密码登录
  await page.goto(BASE + '/#/login')
  await page.waitForSelector('.form-box .input-row input', { timeout: 30000 })
  const noGuest = (await page.locator('.dev-guest').count()) === 0
  console.log('[UI] 生产无游客入口:', noGuest ? 'OK' : 'FAIL(还有游客入口!)')
  await page.fill('.form-box .input-row >> nth=0 >> input', phone)
  await page.fill('.form-box .input-row >> nth=1 >> input', password)
  await page.click('.login-btn')
  await page.waitForURL('**/#/hall', { timeout: 30000 })
  console.log('[UI] 账号登录成功进大厅')

  // 建俱乐部
  await page.click('.bottombar button:has-text("俱乐部")')
  await page.waitForURL('**/#/club', { timeout: 8000 })
  await page.click('button:has-text("+ 创建")')
  await page.fill('.create-box input >> nth=0', '验收俱乐部')
  await page.click('.c-confirm')
  await page.waitForSelector('.okbar', { timeout: 8000 })
  console.log('[UI] 俱乐部创建成功')

  // 进详情建房(新共享表单:档位后台驱动,默认吸附第一档)
  await page.click('.item:has-text("验收俱乐部")')
  await page.waitForSelector('.clubdetail .tname', { timeout: 8000 })
  await page.click('button:has-text("+ 建牌局")')
  await page.waitForSelector('.create-box .c-title:has-text("创建俱乐部牌局")', { timeout: 8000 })
  await page.waitForTimeout(1200) // 等 ROOM_OPTIONS 档位返回
  const blinds = await page.locator('.create-box .c-opts >> nth=0 >> .c-opt').allTextContents()
  console.log('[UI] 盲注档(后台配置):', blinds.join(' '))
  const labels = await page.locator('.create-box .c-label').allTextContents()
  console.log('[UI] 表单参数组:', labels.join(' | '))
  const hasGps = await page.locator('.create-box .c-opt:has-text("GPS限制")').count()
  console.log('[UI] GPS限制开关:', hasGps > 0 ? 'OK' : 'FAIL')
  await page.click('.create-box .c-opt:has-text("2人")')
  await page.click('.create-box .c-confirm')
  await page.waitForURL('**/#/table/**', { timeout: 12000 }).catch(async (e) => {
    const err = await page.evaluate(() => {
      const el = document.querySelector('.c-err, .errbar')
      return el ? el.textContent.trim() : ''
    })
    throw new Error('建房未进桌: ' + (err || e.message))
  })
  await page.waitForSelector('canvas', { timeout: 15000 })
  console.log('[UI] 俱乐部建房成功并进桌')
  await page.screenshot({ path: 'probe_prod_auth.png' })

  // 回详情点牌局列表再进一次(复现用户"点不进去"路径)
  await page.goBack()
  await page.waitForSelector('.clubdetail .item .rname', { timeout: 8000 })
  await page.click('.clubdetail .item')
  await page.waitForURL('**/#/table/**', { timeout: 12000 })
  await page.waitForSelector('canvas', { timeout: 15000 })
  console.log('[UI] 列表点牌局再次进桌 OK')

  console.log('PROBE_PROD_AUTH_OK')
  await browser.close()
})().catch((e) => {
  console.error('PROBE_PROD_AUTH_FAIL:', e.message)
  process.exit(1)
})
