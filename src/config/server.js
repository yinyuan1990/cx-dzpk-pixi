// cx-dzpk 后端对接配置 — 协议:GameMessage JSON over WebSocket(4xx 命令段)。
// 后端仓库: https://github.com/yinyuan1990/cx-dzpk (Spring Boot, /ws/dzpk)

// 部署服(阿里云,docker 19100→9100)。开发想连本地后端 → .env.local 里
//   VITE_DZPK_WS=ws://localhost:9100/ws/dzpk
export const DEFAULT_WS = 'ws://47.122.115.33:19100/ws/dzpk'

export function resolveWsUrl() {
  const fromEnv = import.meta.env.VITE_DZPK_WS
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  if (typeof window !== 'undefined' && !import.meta.env.DEV) {
    // 生产同域反代:wss://host/ws/dzpk(nginx → 后端 9100)
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${proto}//${window.location.host}/ws/dzpk`
  }
  return DEFAULT_WS
}

// i18n locale 标识(保留)
export const LANG_ID = {
  'zh-CN': 0,
  en: 1,
  'zh-TW': 2,
}

export function langIdOf(locale) {
  return LANG_ID[locale] ?? 0
}
