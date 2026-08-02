// 部署服冒烟:WS 登录(游客) → 创建房间(453) → 战绩查询(471)。node 22+ 自带 WebSocket。
const WS = 'ws://47.122.115.33:19100/ws/dzpk'

const ws = new WebSocket(WS)
let seq = 1
const send = (type, data) => ws.send(JSON.stringify({ type, sequence: seq++, data }))
const timer = setTimeout(() => { console.error('FAIL 超时'); process.exit(1) }, 15000)

ws.onopen = () => send(401, { guest: '部署冒烟' })
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.type === 451) {
    console.log('OK 登录', JSON.stringify(m.data))
    send(403, { name: '冒烟房', sb: 50, bb: 100, maxPlayers: 6, settleTimeMins: 30, rakePercent: 5 })
  } else if (m.type === 453) {
    console.log('OK 建房', JSON.stringify(m.data))
    send(411, { limit: 5 })
  } else if (m.type === 471) {
    console.log('OK 战绩', JSON.stringify(m.data))
    clearTimeout(timer)
    console.log('DONE 部署服冒烟通过')
    process.exit(0)
  } else if (m.type === 499) {
    console.error('FAIL 错误:', JSON.stringify(m.data))
    process.exit(1)
  }
}
ws.onerror = () => { console.error('FAIL 连接失败'); process.exit(1) }
