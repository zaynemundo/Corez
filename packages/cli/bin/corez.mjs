#!/usr/bin/env node

import { runCli } from '../src/cli.js';

const controller = new AbortController();

process.on('SIGINT', () => {
  console.log('\n[CoreZ CLI] Interrupted by user (SIGINT). Cancelling active tasks...\n');
  controller.abort();
  process.exit(130);
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
