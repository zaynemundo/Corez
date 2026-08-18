import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { parseMultiPageSite, formatCodeForPreview, injectMultiPageRouter } from '/workspaces/New-Corez/src/utils/previewTransformer.js';

const code = readFileSync('/tmp/harness-extracted.txt','utf8');
const parsed = parseMultiPageSite(code);

for (const name of ['index.html', 'about.html']) {
  const page = parsed.pages.find(p => p.name === name);
  const srcDoc = injectMultiPageRouter(formatCodeForPreview(page.html), parsed.pages.map(p => p.name));
  const dom = new JSDOM(srcDoc, { runScripts: 'dangerously', url: 'http://localhost:3000/', pretendToBeVisual: true });
  await new Promise(r => setTimeout(r, 200));
  const doc = dom.window.document;
  console.log('==', name, '| body innerHTML len:', doc.body.innerHTML.length, '| h1:', doc.querySelector('h1')?.textContent?.slice(0,40));
  console.log('   scripts:', [...doc.querySelectorAll('script')].map(s => s.textContent.length), '| router present:', srcDoc.includes('corez-nav'));
  console.log('   body head:', JSON.stringify(doc.body.innerHTML.slice(0, 80)));
}
