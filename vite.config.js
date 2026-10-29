import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import {
  DEFAULT_LOCAL_TARGET,
  PROBE_PATH,
  backendErrorMessage,
  chooseBackend,
  localBackendWarning,
} from './scripts/apiBackend.mjs'

// Local development talks to a Worker running on this machine
// (`npm run dev:worker`, port 8787), chosen once at config time because Vite 6
// has no `router` option to choose per request (see scripts/apiBackend.mjs for
// the rules and their tests).
//
// There is deliberately no failover. The proxy used to switch itself to the
// deployed Worker when the local one died, which let a dev session silently
// start writing real subscriptions, tasks and published creations. Use a
// deployed backend by naming it:
//
//   API_BACKEND_URL=https://corez.pro npm run dev
const PROBE_TIMEOUT_MS = 600

async function localWorkerIsUp() {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    // Any HTTP reply means something is listening: a 401 from a real Worker is
    // success for this purpose.
    const response = await fetch(`${DEFAULT_LOCAL_TARGET}${PROBE_PATH}`, {
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

function apiProxyConfig(label, target, { explicit }) {
  return {
    target,
    changeOrigin: true,
    // TLS verification is left ON: the previous `secure: false` accepted any
    // certificate presented by the deployed backend.
    configure(proxy) {
      proxy.on('error', (error, request, response) => {
        const message = backendErrorMessage({
          attemptedTarget: target,
          error,
          hasExplicitTarget: explicit,
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
      console.log(`[api-proxy] ${label}: /api -> ${target}`)
    },
  }
}

// https://vite.dev/config/
export default defineConfig(async () => {
  const choice = await chooseBackend({
    probe: localWorkerIsUp,
    envTarget: process.env.API_BACKEND_URL || null,
  })
  const warning = localBackendWarning(choice)
  if (warning) console.warn(warning)

  return {
    plugins: [react()],
    build: {
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom', 'react-router-dom'],
            icons: ['lucide-react'],
            'ai-intelligence': [
              './src/data/intent-classifier-model.json',
              './src/services/promptIntelligence/intentEngine.js',
              './src/skills/definitions.js',
              './src/skills/resolver.js',
            ],
            'preview-runtime': [
              './src/utils/previewTransformer.js',
              './src/utils/vendor/qrcode-generator.mjs',
              './src/utils/qrCode.js',
              './src/utils/zipPackager.js',
            ],
            legal: ['./src/data/legalDocuments.js'],
          },
        },
      },
    },
    server: {
      port: 3000,
      host: true,
      proxy: {
        '/api': apiProxyConfig('dev server', choice.target, choice),
      },
    },
    preview: {
      port: 4173,
      host: true,
      proxy: {
        '/api': apiProxyConfig('preview server', choice.target, choice),
      },
    },
    test: {
      setupFiles: ['./tests/setup.js'],
      exclude: ['**/node_modules/**', '**/dist/**', '**/deepseek-harness/**'],
    },
  }
})
