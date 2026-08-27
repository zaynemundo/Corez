import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const LIVE_WORKER_TARGET = 'https://chat.zayne-mayo.workers.dev';
const LOCAL_WORKER_TARGET = 'http://127.0.0.1:8787';

const apiProxyConfig = {
  target: process.env.API_BACKEND_URL || LOCAL_WORKER_TARGET,
  changeOrigin: true,
  secure: false,
  router: async () => {
    if (process.env.API_BACKEND_URL) return process.env.API_BACKEND_URL;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 150);
      const res = await fetch(`${LOCAL_WORKER_TARGET}/api/ai`, { signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok || res.status < 500) return LOCAL_WORKER_TARGET;
    } catch {
      // Local worker offline — seamlessly route to live Cloudflare Worker
      return LIVE_WORKER_TARGET;
    }
    return LIVE_WORKER_TARGET;
  }
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          icons: ['lucide-react'],
        },
      },
    },
  },
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api': apiProxyConfig
    }
  },
  preview: {
    port: 4173,
    host: true,
    proxy: {
      '/api': apiProxyConfig
    }
  },
  test: {
    setupFiles: ['./tests/setup.js'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/deepseek-harness/**']
  }
})
