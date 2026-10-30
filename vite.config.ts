import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

const here = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ mode }) => {
  // 로컬 FastAPI 서버 주소 (TEAM4_AGENT/backend에서 uvicorn app.main:app). 다른 포트면 .env.local의 VITE_API_PROXY로 바꾼다
  const api = loadEnv(mode, here, 'VITE_').VITE_API_PROXY || 'http://127.0.0.1:8000'
  return {
    plugins: [react(), tailwindcss()],
    server: { port: 5173, proxy: { '/api': api } },
    build: {
      rollupOptions: {
        // index.html = 초안 작업실(Tailwind), viewer.html = 기존 산출물 뷰어(styles.css). CSS가 섞이지 않게 페이지를 나눈다.
        input: {
          app: path.resolve(here, 'index.html'),
          viewer: path.resolve(here, 'viewer.html'),
        },
      },
    },
  }
})
