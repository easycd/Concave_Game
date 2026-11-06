import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// BASE_PATH=/omok 로 빌드하면 https://도메인/omok/ 아래에서 돌아요. 없으면 맨 앞(/).
const base = `/${(process.env.BASE_PATH ?? '').replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/');

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/socket.io': { target: 'http://127.0.0.1:3001', ws: true },
      '/api': 'http://127.0.0.1:3001',
    },
  },
});
