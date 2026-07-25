#!/usr/bin/env node

import { runCli } from '../src/cli.js';

const controller = new AbortController();
let sigintCount = 0;

process.on('SIGINT', () => {
  sigintCount++;
  if (sigintCount === 1) {
    console.log('\n[CoreZ CLI] Interrupted (SIGINT). Cancelling active tasks... (press Ctrl+C again to force quit)\n');
    controller.abort();
    setTimeout(() => {
      console.error('\n[CoreZ CLI] Graceful shutdown timed out. Forcing exit.\n');
      process.exit(130);
    }, 3000).unref();
  } else {
    console.error('\n[CoreZ CLI] Force quitting.\n');
    process.exit(130);
  }
});

runCli(process.argv.slice(2), { signal: controller.signal })
  .then((code) => {
    if (typeof code === 'number' && code !== 0) {
      process.exit(code);
    }
  })
  .catch((err) => {
    console.error('\n[CoreZ CLI Fatal Error]:', err.message || err);
    process.exit(1);
  });
