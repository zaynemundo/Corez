#!/usr/bin/env bash
set -u

config="wrangler.jsonc"
package="package.json"
readme="README.md"
workflow=".github/workflows/deploy.yml"
failures=0

check() {
  local description="$1"
  local pattern="$2"
  local file="$3"
  if ! grep -Eq -- "$pattern" "$file" 2>/dev/null; then
    printf 'FAIL: %s\n' "$description" >&2
    failures=$((failures + 1))
  fi
}

check_absent() {
  local description="$1"
  local pattern="$2"
  local file="$3"
  if grep -Eq -- "$pattern" "$file" 2>/dev/null; then
    printf 'FAIL: %s\n' "$description" >&2
    failures=$((failures + 1))
  fi
}

check 'Worker name matches the deployed Worker' '"name"[[:space:]]*:[[:space:]]*"chat"' "$config"
check 'Worker entrypoint is configured' '"main"[[:space:]]*:[[:space:]]*"[.]/worker/entry[.]js"' "$config"
check 'Direct Worker hostname remains available for WAF-intercepted API requests' '"workers_dev"[[:space:]]*:[[:space:]]*true' "$config"
check 'Vite dist is the asset directory' '"directory"[[:space:]]*:[[:space:]]*"[.]/dist"' "$config"
check 'ASSETS binding is configured' '"binding"[[:space:]]*:[[:space:]]*"ASSETS"' "$config"
check 'SPA fallback is configured' '"not_found_handling"[[:space:]]*:[[:space:]]*"single-page-application"' "$config"
check 'API routes run Worker-first' '"run_worker_first"[[:space:]]*:[[:space:]]*\[[[:space:]]*"/[*]"' "$config"
check_absent 'Workers AI binding is removed' '"ai"[[:space:]]*:[[:space:]]*\{|"binding"[[:space:]]*:[[:space:]]*"AI"' "$config"
check 'GameRoom Durable Object binding is configured' '"name"[[:space:]]*:[[:space:]]*"GAME_ROOMS"' "$config"
check 'GameRoom Durable Object class is configured' '"class_name"[[:space:]]*:[[:space:]]*"GameRoom"' "$config"
check 'GameRoom migration is declared' 'new_sqlite_classes["[:space:]]*:[[:space:]]*\[[[:space:]]*"GameRoom"\]' "$config"
check 'Cloudflare contract script exists' 'cloudflare-worker-contract[.]mjs' "$package"
check_absent 'inline-only routing: no worker swarm contract in the suite' 'worker-live-swarm-contract[.]mjs' "$package"
check 'Workers AI provider contract runs in the standard suite' 'workers-ai-provider-contract[.]sh' "$package"
check 'public AI proxy contract runs in the standard suite' 'public-ai-proxy-contract[.]sh' "$package"
check 'live AI contracts run in the standard suite' 'ai-live-intent-eval-contract[.]sh.*ai-live-intent-eval-response-contract[.]mjs' "$package"
check 'environment skill contract runs in the standard suite' 'env-question-skill-contract[.]sh' "$package"
check 'Wrangler local development script exists' '"dev:worker"' "$package"
check 'Wrangler deploy script exists' '"deploy"' "$package"
check 'README documents Cloudflare deployment' 'Cloudflare Worker' "$readme"
check 'README documents the build command' 'npm run build' "$readme"
check 'README documents the deploy command' 'npx wrangler deploy' "$readme"
check 'GitHub Actions uses the current setup-node action' 'actions/setup-node@v4' "$workflow"
check 'deployment runs the hosted AI contract suite' 'npm run test:cloudflare' "$workflow"
check 'deployment uploads a tagged Worker version without resyncing routes' 'wrangler versions upload --tag' "$workflow"
check 'deployment promotes the tagged Worker version' 'wrangler versions deploy --version-tag' "$workflow"
check 'deployment tags reruns uniquely' 'GITHUB_RUN_ATTEMPT' "$workflow"
check_absent 'deployment does not use route-syncing wrangler deploy' 'run:[[:space:]]*(npx[[:space:]]+)?wrangler deploy([[:space:]]|$)|run:[[:space:]]*npm run deploy([[:space:]]|$)|cloudflare/wrangler-action' "$workflow"

if (( failures > 0 )); then
  printf '%d Cloudflare Worker configuration contract check(s) failed.\n' "$failures" >&2
  exit 1
fi

printf 'Cloudflare Worker configuration contract passed.\n'
