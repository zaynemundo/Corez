import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { parseMultiPageSite, formatCodeForPreview, injectMultiPageRouter } from '/workspaces/New-Corez/src/utils/previewTransformer.js';

const code = readFileSync('/tmp/harness-extracted.txt','utf8');
const parsed = parseMultiPageSite(code);
const index = parsed.pages.find(p => p.name === 'index.html');
const srcDoc = injectMultiPageRouter(formatCodeForPreview(index.html), parsed.pages.map(p => p.name));

// Real iframe inside parent window - exactly like the app's preview
const parentHtml = `<!DOCTYPE html><html><body><iframe id="preview" sandbox="allow-scripts allow-forms allow-pointer-lock allow-downloads allow-popups"></iframe></body></html>`;
const parent = new JSDOM(parentHtml, { runScripts: 'dangerously', url: 'http://localhost:3000/', pretendToBeVisual: true });
const { window } = parent;
const received = [];
window.addEventListener('message', (e) => {
  received.push({ source: e.source === iframe.contentWindow ? 'MATCHES-IFRAME' : 'OTHER', data: e.data });
});

const iframe = window.document.getElementById('preview');
// sandboxed srcdoc iframe
iframe.setAttribute('srcdoc', srcDoc);

await new Promise(r => setTimeout(r, 800));

const iframeDoc = iframe.contentDocument;
console.log('iframe doc loaded:', !!iframeDoc);
const aboutLink = iframeDoc && [...iframeDoc.querySelectorAll('a')].find(a => a.getAttribute('href') === 'about.html');
console.log('about link:', aboutLink && aboutLink.getAttribute('href'));

if (aboutLink) {
  const ev = new iframe.contentWindow.MouseEvent('click', { bubbles: true, cancelable: true });
  aboutLink.dispatchEvent(ev);
  await new Promise(r => setTimeout(r, 300));
  console.log('defaultPrevented:', ev.defaultPrevented);
  console.log('MESSAGES RECEIVED BY PARENT:', JSON.stringify(received));
}

// Also check scroll/animation scripts did not break body
console.log('iframe body has content:', iframeDoc ? iframeDoc.body.innerHTML.length : 'n/a');
