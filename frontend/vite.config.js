import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backend = env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8080';
  return {
  plugins: [react()],
  server: {
    host: env.VITE_DEV_HOST || '127.0.0.1',
    port: Number(env.VITE_DEV_PORT || 5174),
    open: false,
    proxy: {
      '/api/kakao-transit': {
        target: 'https://dapi.kakao.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/kakao-transit/, '/v2/routing/publictraffic'),
        headers: {
          ...(env.KAKAO_REST_API_KEY ? { 'Authorization': `KakaoAK ${env.KAKAO_REST_API_KEY}` } : {}),
          'KA': 'sdk/1.0.0 os/javascript lang/ko-KR res/1920x1080 device/desktop origin/http://localhost:5173'
        }
      },
      '/api': {
        target: backend,
        changeOrigin: true
      }
    }
  }
  };
})
