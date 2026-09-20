import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import {
  DEFAULT_LIVE_TARGET,
  DEFAULT_LOCAL_TARGET,
  PROBE_PATH,
  backendErrorMessage,
  chooseBackend,
  isConnectionFailure,
} from './scripts/apiBackend.mjs'

// Local development talks to a Worker. Two candidates, in order:
//   1. a Worker running on this machine (`npm run dev:worker`, port 8787)
//   2. the deployed Worker, so the app is usable without a local backend
//
// The deployed host is corez.pro, NOT chat.zayne-mayo.workers.dev: the direct-AI
// host answers only POST /api/ai and rejects every other path, so proxying the
// whole app there broke sign-in, subscriptions and publishing.
//
// The backend is chosen once, at config time, because Vite 6 has no `router`
// option to choose per request (see scripts/apiBackend.mjs for the details and
// the tests). A local Worker that dies mid-session is handled by the error hook
// below, which switches to the deployed one for subsequent requests.
const LOCAL_WORKER_TARGET = process.env.API_BACKEND_URL || DEFAULT_LOCAL_TARGET
const LIVE_WORKER_TARGET = DEFAULT_LIVE_TARGET
const PROBE_TIMEOUT_MS = 600

async function localWorkerIsUp() {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    // Any HTTP reply means something is listening: a 401 from a real Worker is
    // success for this purpose.
    const response = await fetch(`${LOCAL_WORKER_TARGET}${PROBE_PATH}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    return response.status < 500
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}

function apiProxyConfig(label, state) {
  return {
    target: state.target,
    changeOrigin: true,
    secure: false,
    configure(proxy, options) {
      proxy.on('error', (error, request, response) => {
        const attemptedTarget = state.target
        // A local Worker that dies mid-session must not strand the app: switch
        // to the deployed one for every request from here on. The request that
        // failed is told to retry, because its socket is already gone.
        if (attemptedTarget === LOCAL_WORKER_TARGET && isConnectionFailure(error)) {
          state.target = LIVE_WORKER_TARGET
          options.target = LIVE_WORKER_TARGET
          console.warn(
            `[api-proxy] local Worker became unreachable (${error?.code || error?.message}) — switching to ${LIVE_WORKER_TARGET}. Retry the request.`,
          )
        }
        const message = backendErrorMessage({
          attemptedTarget,
          error,
          liveTarget: LIVE_WORKER_TARGET,
          hasExplicitTarget: Boolean(process.env.API_BACKEND_URL),
        })
        console.error(`[api-proxy] ${request?.method} ${request?.url}: ${message}`)
        if (response && !response.headersSent && typeof response.writeHead === 'function') {
          response.writeHead(502, { 'Content-Type': 'application/json' })
          response.end(
            JSON.stringify({ error: message, code: 'proxy_backend_unreachable', retry: true }),
          )
        } else if (response && typeof response.destroy === 'function') {
          response.destroy()
        }
      })
      console.log(`[api-proxy] ${label}: /api -> ${state.target}`)
    },
  }
}

// https://vite.dev/config/
export default defineConfig(async () => {
  const target = await chooseBackend({
    probe: localWorkerIsUp,
    envTarget: process.env.API_BACKEND_URL || null,
  })
  const state = { target }

  return {
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
        '/api': apiProxyConfig('dev server', state),
      },
    },
    preview: {
      port: 4173,
      host: true,
      proxy: {
        '/api': apiProxyConfig('preview server', state),
      },
    },
    test: {
      setupFiles: ['./tests/setup.js'],
      exclude: ['**/node_modules/**', '**/dist/**', '**/deepseek-harness/**'],
    },
  }
})
