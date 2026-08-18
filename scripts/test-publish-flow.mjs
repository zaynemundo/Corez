import { readFileSync } from 'node:fs';
import { parseMultiPageSite, formatCodeForPreview, injectMultiPageRouter } from '/workspaces/New-Corez/src/utils/previewTransformer.js';

const BASE = 'http://127.0.0.1:8790';
const code = readFileSync('/tmp/harness-extracted.txt','utf8');
const parsed = parseMultiPageSite(code);
console.log('pages:', parsed.pages.map(p=>p.name));

// Build payload EXACTLY like CanvasPreview.handlePublish
const pagesPayload = {};
for (const page of parsed.pages) {
  pagesPayload[page.name] = injectMultiPageRouter(formatCodeForPreview(page.html), parsed.pages.map((p) => p.name));
}
const indexPage = parsed.pages.find(p => p.name === 'index.html');
const formattedSrcDoc = injectMultiPageRouter(formatCodeForPreview(indexPage.html), parsed.pages.map(p => p.name));

const res = await fetch(`${BASE}/api/publish`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ html: formattedSrcDoc, title: 'Test Portfolio', pages: pagesPayload, slug: 'test-portfolio-1' })
});
console.log('publish status:', res.status);
const data = await res.json();
console.log('publish:', JSON.stringify(data));

// 1. GET /slug -> should 301 to /slug/
const r1 = await fetch(`${BASE}/test-portfolio-1`, { redirect: 'manual' });
console.log('GET /slug status:', r1.status, 'location:', r1.headers.get('location'));

// 2. GET /slug/
const r2 = await fetch(`${BASE}/test-portfolio-1/`);
console.log('GET /slug/ status:', r2.status, 'len:', (await r2.text()).length);

// 3. GET /slug/about.html
const r3 = await fetch(`${BASE}/test-portfolio-1/about.html`);
const aboutHtml = await r3.text();
console.log('GET about.html status:', r3.status, 'len:', aboutHtml.length, '| router injected:', aboutHtml.includes('corez-nav'), '| CORS:', r3.headers.get('access-control-allow-origin'));

// 4. GET /slug/index.html
const r4 = await fetch(`${BASE}/test-portfolio-1/index.html`);
console.log('GET index.html status:', r4.status, 'len:', (await r4.text()).length);

// 5. Check CSP headers
console.log('CSP:', (r3.headers.get('content-security-policy')||'').slice(0,120));
