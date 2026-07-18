import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';

const server = createServer((_request, response) => {
  response.writeHead(502, { 'Content-Type': 'text/plain' });
  response.end('gateway unavailable');
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});

try {
  const address = server.address();
  assert(address && typeof address === 'object');

  const result = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['scripts/evaluate-ai-intents.mjs', `http://127.0.0.1:${address.port}`],
      { cwd: process.cwd() }
    );
    let output = '';

    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, output }));
  });

  assert.equal(result.code, 1);
  assert.match(result.output, /app failed with HTTP 502: gateway unavailable/);
  console.log('AI live intent eval response contract passed.');
} finally {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}
