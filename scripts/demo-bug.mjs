import { extractCodeFromMessage } from '/workspaces/New-Corez/src/services/aiService.js';
import { parseMultiPageSite, validateMultiPageSite } from '/workspaces/New-Corez/src/utils/previewTransformer.js';

// EXACT shape the model produced in my live test (markers BETWEEN fences)
const fence = '```';
const modelOutput = `Here's Christian's portfolio — a dark-themed site.

<!-- PAGE: index.html -->
${fence}html
<!DOCTYPE html>
<html><body><nav><a href="about.html">About</a></nav><h1>Home</h1></body></html>
${fence}

<!-- PAGE: about.html -->
${fence}html
<!DOCTYPE html>
<html><body><h1>About Us</h1></body></html>
${fence}
`;

const code = extractCodeFromMessage(modelOutput);
console.log('markers preserved after extraction:', /<!--\s*PAGE:/.test(code));
const parsed = parseMultiPageSite(code);
console.log('parsed isMultiPage:', parsed.isMultiPage);
console.log('pages:', parsed.pages.map(p => p.name));
const validation = validateMultiPageSite(parsed.pages);
console.log('validation:', validation.valid ? 'PASS' : 'FAIL', validation.issues.map(i => i.message).join('; '));
console.log('');
console.log('=> RESULT: single-page site with a dead about.html link.');
console.log('=> Preview: no router -> click About -> iframe navigation -> BLANK PAGE.');
console.log('=> Publish: no pages map -> link serves one page -> About -> 404 -> BLANK.');
