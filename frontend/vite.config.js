import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    open: true, // 서버가 켜질 때 기본 웹 브라우저(크롬, 사파리 등)에서 자동으로 열리게 설정
  }
})
