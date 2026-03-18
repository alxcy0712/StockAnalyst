// Minimal Vite dev server proxy to bypass CORS for fund NAV data
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // 将前端对 /api/fundnav 的请求代理到本地简单后端代理服务
      '/api/fundnav': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      // 现有的直接调用 Eastmoney 代理保留为备选，但优先使用本地后端代理
    }
  }
})
