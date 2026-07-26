#!/usr/bin/env bash
set -u

service="src/services/aiService.js"
settings="src/components/SettingsModal.jsx"
readme="README.md"
terminal="src/games/financial-terminal.js"
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

check 'frontend exposes a hosted AI response function' 'generateHostedAIResponse' "$service"
check 'frontend uses the public AI route' '/api/ai' "$service"
check 'frontend sends prompt, canonical intent, and message history' 'JSON[.]stringify\(\{ prompt, intent, messages: history' "$service"
check 'hosted failures use provider-neutral fallback wording' 'Hosted AI unavailable; using local Corez fallback' "$service"
check 'frontend retains local response fallback' 'generateLocalAIResponse' "$service"
check 'frontend imports the deterministic market parser' 'parseMarketIntent' "$service"
check 'frontend imports the structured market client' 'fetchMarketData' "$service"
check 'app intents bypass market interception' "marketRequest[[:space:]]*=[[:space:]]*intent[.]type[[:space:]]*===[[:space:]]*'app'[[:space:]]*[?][[:space:]]*null[[:space:]]*:[[:space:]]*parseMarketIntent" "$service"
check_absent 'hardcoded gold quote is retired' '3,240[.]50|3240[.]50' "$service"
check_absent 'hardcoded bitcoin quote is retired' '66,259[.]00|66259[.]00' "$service"
check_absent 'local fallback does not claim a live snapshot' 'live market snapshot' "$service"
check 'financial terminal has an explicit demo title' 'COREZ Financial Demo Terminal' "$terminal"
check 'financial terminal is labeled as demo data' 'DEMO DATA' "$terminal"
check_absent 'hardcoded financial demo does not claim a real-time terminal' 'Real-Time Financial Terminal' "$terminal"
check_absent 'hardcoded financial demo does not claim live data' 'LIVE DATA' "$terminal"
check 'settings explains automatic server-managed routing' 'automatically routes.*managed server-side|managed server-side.*automatically routes' "$settings"
check_absent 'settings does not expose provider or model names' 'GLM|DeepSeek|Kimi|MiMo|OpenRouter|FLUX|Cloudflare Workers AI|@cf/' "$settings"
check 'README documents the optional OpenRouter secret' 'OPENROUTER_API_KEY' "$readme"
check 'README documents primary text routing' 'glm-5.2|deepseek-v4-pro' "$readme"
check_absent 'README no longer documents MiMo V2.5' 'xiaomi/mimo-v2[.]5' "$readme"
check 'README documents the primary Workers AI fallback' '@cf/moonshotai/kimi-k2[.]7-code' "$readme"
check 'README documents the secondary Workers AI fallback' '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b' "$readme"
check 'README documents the FLUX Schnell image model' '@cf/black-forest-labs/flux-1-schnell' "$readme"
check_absent 'README no longer documents FLUX dev' '@cf/black-forest-labs/flux-1-dev' "$readme"
check_absent 'README no longer describes GLM-4.7-Flash as the active model' 'GLM-4[.]7-Flash|@cf/zai-org/glm-4[.]7-flash' "$readme"
check_absent 'settings has no model override storage' 'corez_openrouter_model' "$settings"

market_line=$(awk '/export async function generateAIResponse/ { inside=1 } inside && /parseMarketIntent\(cleanPrompt\)/ { print NR; exit }' "$service")
hosted_line=$(awk '/export async function generateAIResponse/ { inside=1 } inside && /generateHostedAIResponse\(cleanPrompt/ { print NR; exit }' "$service")
if [ -z "$market_line" ] || [ -z "$hosted_line" ] || [ "$market_line" -ge "$hosted_line" ]; then
  printf 'FAIL: market interception must precede hosted AI\n' >&2
  failures=$((failures + 1))
fi

if (( failures > 0 )); then
  printf '%d public AI proxy contract check(s) failed.\n' "$failures" >&2
  exit 1
fi

printf 'Public AI proxy contract checks passed.\n'
