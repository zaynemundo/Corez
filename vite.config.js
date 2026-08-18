import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

// Load .dev.vars into process.env if present
try {
  const devVarsPath = path.resolve(process.cwd(), '.dev.vars');
  if (fs.existsSync(devVarsPath)) {
    const lines = fs.readFileSync(devVarsPath, 'utf8').split('\n');
    for (const line of lines) {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match && !process.env[match[1].trim()]) {
        process.env[match[1].trim()] = match[2].trim();
      }
    }
  }
} catch {}

const LOCAL_VERIFICATION_STORE = new Map();

function localVerifyPlugin() {
  return {
    name: 'local-verify-handler',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://localhost:3000');
        if (url.pathname === '/api/verify/send-code' && req.method === 'POST') {
          let bodyStr = '';
          req.on('data', chunk => { bodyStr += chunk; });
          req.on('end', async () => {
            try {
              const body = JSON.parse(bodyStr || '{}');
              const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
              if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Valid email required' }));
                return;
              }

              const code = Math.floor(100000 + Math.random() * 900000).toString();
              const expiresAt = Date.now() + 10 * 60 * 1000;
              LOCAL_VERIFICATION_STORE.set(email, { code, expiresAt, attempts: 0 });

              let simulated = true;
              const resendApiKey = process.env.RESEND_API_KEY;

              if (resendApiKey) {
                try {
                  const emailHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><title>CoreZ Verification Code</title></head>
<body style="margin:0;padding:0;background:#090a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#f3f4f6;">
  <div style="max-width:480px;margin:40px auto;background:#12131a;border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:32px;text-align:left;">
    <div style="font-size:20px;font-weight:800;letter-spacing:-0.5px;color:#ffffff;margin-bottom:20px;">COREZ</div>
    <h2 style="font-size:18px;font-weight:600;color:#ffffff;margin:0 0 12px;">Verify your email address</h2>
    <p style="font-size:14px;line-height:1.5;color:#9ca3af;margin:0 0 24px;">Your 6-digit confirmation code for <strong>${email}</strong> is:</p>
    <div style="background:rgba(59,130,246,0.12);border:1px solid rgba(59,130,246,0.3);border-radius:8px;padding:18px;text-align:center;margin-bottom:24px;">
      <span style="font-size:32px;font-weight:700;letter-spacing:8px;color:#60a5fa;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,monospace;">${code}</span>
    </div>
    <p style="font-size:13px;line-height:1.5;color:#9ca3af;margin:0 0 20px;">This code expires in <strong>10 minutes</strong>. If you did not request this, you can safely ignore this email.</p>
    <hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:20px 0;" />
    <p style="font-size:11px;color:#6b7280;margin:0;">Sent by CoreZ Security • AI-Native Creative Development Platform</p>
  </div>
</body>
</html>`;

                  let fromSender = process.env.RESEND_FROM_EMAIL || 'CoreZ Security <verification@corez.pro>';
                  let resendRes = await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${resendApiKey}`,
                      'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                      from: fromSender,
                      to: [email],
                      subject: `CoreZ Verification Code: ${code}`,
                      html: emailHtml
                    })
                  });

                  if (resendRes.ok) {
                    simulated = false;
                  } else {
                    console.warn('Resend dispatch error in dev server:', resendRes.status, await resendRes.text());
                  }
                } catch (err) {
                  console.warn('Resend email dispatch error:', err);
                }
              }

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                success: true,
                email,
                simulated,
                code: simulated ? code : undefined,
                expiresAt,
                message: 'Verification code sent from verification@corez.pro'
              }));
            } catch (err) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        if (url.pathname === '/api/verify/check-code' && req.method === 'POST') {
          let bodyStr = '';
          req.on('data', chunk => { bodyStr += chunk; });
          req.on('end', () => {
            try {
              const body = JSON.parse(bodyStr || '{}');
              const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
              const code = typeof body.code === 'string' ? body.code.trim() : '';

              const session = LOCAL_VERIFICATION_STORE.get(email);
              if (!session) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'No verification session found.' }));
                return;
              }

              if (Date.now() > session.expiresAt) {
                LOCAL_VERIFICATION_STORE.delete(email);
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Verification code has expired.' }));
                return;
              }

              if (session.code !== code) {
                session.attempts += 1;
                if (session.attempts >= 5) {
                  LOCAL_VERIFICATION_STORE.delete(email);
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: 'Too many incorrect attempts.' }));
                  return;
                }
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Invalid verification code.' }));
                return;
              }

              LOCAL_VERIFICATION_STORE.delete(email);
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                success: true,
                verified: true,
                email,
                verifiedAt: new Date().toISOString()
              }));
            } catch (err) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        next();
      });
    }
  };
}

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
  plugins: [react(), localVerifyPlugin()],
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
});
