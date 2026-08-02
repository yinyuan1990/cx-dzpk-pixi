import { createI18n } from 'vue-i18n'
import zhCN from './locales/zh-CN.js'

// 目前只维护简体中文,默认中文;后期要加语言在 locales/ 补文件并注册即可。
export const SUPPORTED_LOCALES = [
  { code: 'zh-CN', key: 'zhCN' },
]

const STORAGE_KEY = 'dzpkko_locale'

export function getSavedLocale() {
  return localStorage.getItem(STORAGE_KEY)
}

export function setLocale(code) {
  i18n.global.locale.value = code
  localStorage.setItem(STORAGE_KEY, code)
  document.documentElement.lang = code
}

export const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
})
