import { Miniflare } from 'miniflare';
import { readFileSync } from 'node:fs';

const vars = {};
for (const line of readFileSync('.dev.vars', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) vars[m[1]] = m[2];
}

const mf = new Miniflare({
  modules: true,
  scriptPath: './worker/entry.js',
  modulesRules: [{ type: 'ESModule', include: ['**/*.js'] }],
  bindings: vars,
  r2Buckets: ['ASSET_BUCKET'],
  durableObjects: { GAME_ROOMS: 'GameRoom' },
  compatibilityDate: '2026-07-18',
  compatibilityFlags: ['nodejs_compat'],
  port: 8790,
});
await mf.ready;
console.log('miniflare ready on 8790');
// keep alive
setInterval(() => {}, 1000);
