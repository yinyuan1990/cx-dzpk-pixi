// cx-dzpk JSON WebSocket 连接。
// 协议信封 {type, roomId, sequence, data, timestamp}(与后端 GameMessage 同构);
// 负责:连接、发送、按 type 分发推送、RPC(等待指定响应 type)、断线重连。
import { resolveWsUrl } from '../config/server.js'

export class DzpkSocket {
  constructor(opts = {}) {
    this.opts = opts
    this.ws = null
    this.seq = 1
    this.handlers = new Map()   // type -> Set<fn(data, msg)>
    this.pending = []           // [{match(msg), resolve, reject, timer}]
    this.lastRecvAt = 0
    this._userClosed = false
    this._reconnectTimer = null
    this._reconnectAttempts = 0
    this.onReconnect = null     // 重连成功回调(上层重新登录+进房重同步)
    this.onClose = null         // 重连耗尽/主动关闭
  }

  connect() {
    return this._open()
  }

  _open() {
    const url = this.opts.url || resolveWsUrl()
    return new Promise((resolve, reject) => {
      let settled = false
      const ws = new WebSocket(url)
      this.ws = ws
      ws.onopen = () => {
        settled = true
        this._reconnectAttempts = 0
        resolve()
      }
      ws.onerror = () => {
        if (!settled) { settled = true; reject(new Error('连接服务器失败')) }
      }
      ws.onclose = () => {
        this._cleanup()
        if (!settled) { settled = true; reject(new Error('连接已关闭')) }
        if (!this._userClosed && this.opts.autoReconnect) this._scheduleReconnect()
        else if (typeof this.onClose === 'function') this.onClose()
      }
      ws.onmessage = (ev) => {
        this.lastRecvAt = Date.now()
        let msg
        try { msg = JSON.parse(ev.data) } catch { return }
        this._dispatch(msg)
      }
    })
  }

  _scheduleReconnect() {
    const max = this.opts.maxReconnect ?? 10
    if (this._reconnectAttempts >= max) {
      if (typeof this.onClose === 'function') this.onClose()
      return
    }
    this._reconnectAttempts += 1
    const delay = Math.min(1000 * 2 ** (this._reconnectAttempts - 1), 10000)
    this._reconnectTimer = setTimeout(async () => {
      if (this._userClosed) return
      try {
        await this._open()
        if (typeof this.onReconnect === 'function') {
          try { await this.onReconnect() } catch { /* 上层重同步异常不影响连接 */ }
        }
      } catch { /* _open 失败:onclose 再次调度 */ }
    }, delay)
  }

  _dispatch(msg) {
    // 先匹配等待中的 RPC(按响应 type + 可选 sequence/自定义匹配)
    for (let i = 0; i < this.pending.length; i++) {
      const p = this.pending[i]
      if (p.match(msg)) {
        this.pending.splice(i, 1)
        clearTimeout(p.timer)
        p.resolve(msg)
        return
      }
    }
    const set = this.handlers.get(msg.type)
    if (set) {
      for (const fn of set) {
        try { fn(msg.data, msg) } catch (e) { console.error('[ws] handler 异常 type=' + msg.type, e) }
      }
      return
    }
    if (typeof this.onAny === 'function') this.onAny(msg)
  }

  /** 发送一条消息。data 可省。返回 sequence。 */
  send(type, data, roomId) {
    const sequence = this.seq++
    const msg = { type, sequence }
    if (roomId != null) msg.roomId = roomId
    if (data != null) msg.data = data
    this.ws.send(JSON.stringify(msg))
    return sequence
  }

  /**
   * RPC:发请求,等待响应。
   * @param {number} type 请求命令号
   * @param {object} data
   * @param {object} opts { roomId, resType(期待响应 type), match(msg)=>bool 自定义匹配, timeoutMs }
   */
  request(type, data, opts = {}) {
    const { roomId, resType, match, timeoutMs = 8000 } = opts
    return new Promise((resolve, reject) => {
      const sequence = this.seq++
      const msg = { type, sequence }
      if (roomId != null) msg.roomId = roomId
      if (data != null) msg.data = data
      const ERROR_TYPE = 499
      const matcher = match
        || ((m) => (m.type === resType && (m.sequence == null || m.sequence === sequence))
          || (m.type === ERROR_TYPE && m.sequence === sequence))
      const timer = setTimeout(() => {
        const i = this.pending.findIndex((p) => p.timer === timer)
        if (i >= 0) this.pending.splice(i, 1)
        reject(new Error(`请求超时(type=${type})`))
      }, timeoutMs)
      this.pending.push({
        match: matcher,
        resolve: (m) => {
          if (m.type === ERROR_TYPE) {
            const err = new Error((m.data && m.data.msg) || '请求失败')
            err.raw = m
            reject(err)
          } else {
            resolve(m)
          }
        },
        reject,
        timer,
      })
      this.ws.send(JSON.stringify(msg))
    })
  }

  /** 注册推送处理器(同 type 可多个)。返回取消函数。 */
  on(type, handler) {
    let set = this.handlers.get(type)
    if (!set) { set = new Set(); this.handlers.set(type, set) }
    set.add(handler)
    return () => set.delete(handler)
  }

  off(type, handler) {
    const set = this.handlers.get(type)
    if (set) set.delete(handler)
  }

  _cleanup() {
    for (const p of this.pending) {
      clearTimeout(p.timer)
      p.reject(new Error('连接已断开'))
    }
    this.pending.length = 0
  }

  close() {
    this._userClosed = true
    if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null }
    try { this.ws && this.ws.close() } catch { /* noop */ }
    this._cleanup()
  }

  get connected() {
    return !!(this.ws && this.ws.readyState === WebSocket.OPEN)
  }
}
