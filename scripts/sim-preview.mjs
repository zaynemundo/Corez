import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { parseMultiPageSite, formatCodeForPreview, injectMultiPageRouter } from '/workspaces/New-Corez/src/utils/previewTransformer.js';

const code = readFileSync('/tmp/harness-extracted.txt','utf8');
const parsed = parseMultiPageSite(code);
const index = parsed.pages.find(p => p.name === 'index.html');
const srcDoc = injectMultiPageRouter(formatCodeForPreview(index.html), parsed.pages.map(p => p.name));

console.log('srcDoc length:', srcDoc.length);
console.log('router present:', srcDoc.includes('corez-nav'));

const dom = new JSDOM(srcDoc, {
  runScripts: 'dangerously',
  resources: undefined,
  url: 'http://localhost:3000/',
  pretendToBeVisual: true
});
const { window } = dom;
const { document } = window;

// Simulate iframe context: self !== top, parent.postMessage capture
const posted = [];
window.parent = { postMessage: (data) => posted.push(data) };
// Keep a separate top object so window.self !== window.top
const topWin = new JSDOM('', { runScripts: 'outside-only' }).window;
Object.defineProperty(window, 'top', { value: topWin, configurable: true });
Object.defineProperty(window, 'self', { value: window, configurable: true });

// Wait for scripts to run
await new Promise(r => setTimeout(r, 300));

// Find the About link and click it
const aboutLink = [...document.querySelectorAll('a')].find(a => a.getAttribute('href') === 'about.html');
console.log('about link found:', !!aboutLink, 'href:', aboutLink && aboutLink.getAttribute('href'));
if (aboutLink) {
  const ev = new window.MouseEvent('click', { bubbles: true, cancelable: true });
  aboutLink.dispatchEvent(ev);
  await new Promise(r => setTimeout(r, 100));
  console.log('POSTED:', JSON.stringify(posted));
  console.log('defaultPrevented:', ev.defaultPrevented);
}
