import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { parseMultiPageSite, formatCodeForPreview, injectMultiPageRouter } from '/workspaces/New-Corez/src/utils/previewTransformer.js';

const code = readFileSync('/tmp/harness-extracted.txt','utf8');
const parsed = parseMultiPageSite(code);
const index = parsed.pages.find(p => p.name === 'index.html');
const srcDoc = injectMultiPageRouter(formatCodeForPreview(index.html), parsed.pages.map(p => p.name));

const parent = new JSDOM(`<!DOCTYPE html><html><body><iframe id="preview"></iframe></body></html>`, { runScripts: 'dangerously', url: 'http://localhost:3000/' });
const { window } = parent;
const iframe = window.document.getElementById('preview');
iframe.setAttribute('srcdoc', srcDoc);
await new Promise(r => setTimeout(r, 1000));
const iframeDoc = iframe.contentDocument;
console.log('body innerHTML len:', iframeDoc.body.innerHTML.length);
console.log('body innerHTML head:', JSON.stringify(iframeDoc.body.innerHTML.slice(0, 300)));
console.log('document.documentElement outerHTML head:', JSON.stringify(iframeDoc.documentElement.outerHTML.slice(0, 400)));
// check for script errors
console.log('head scripts:', iframeDoc.querySelectorAll('script').length);
