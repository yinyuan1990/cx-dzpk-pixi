import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  optimizeDeps: {
    exclude: ['pixi-spine'],
  },
  server: {
    // 0.0.0.0：同 WiFi 手机可用 http://电脑局域网IP:5173 访问
    host: true,
    port: 5173,
  },
})
