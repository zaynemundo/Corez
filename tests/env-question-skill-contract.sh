#!/usr/bin/env bash
set -u

skill=".agents/skills/ask-env-values/SKILL.md"
failures=0

check() {
  local description="$1"
  local pattern="$2"

  if ! grep -Eiq -- "$pattern" "$skill" 2>/dev/null; then
    printf 'FAIL: %s\n' "$description" >&2
    failures=$((failures + 1))
  fi
}

check_absent() {
  local description="$1"
  local pattern="$2"

  if grep -Eiq -- "$pattern" "$skill" 2>/dev/null; then
    printf 'FAIL: %s\n' "$description" >&2
    failures=$((failures + 1))
  fi
}

check 'skill has required frontmatter name' '^name: ask-env-values'
check 'skill triggers for env vars and deployment secrets' 'environment variables|env vars|secrets'
check 'skill explicitly mentions Replit' 'Replit'
check 'skill requires asking user for exact values' 'ask.*user.*exact|exact.*value'
check 'skill forbids guessing secret values' 'never guess|do not guess'
check 'skill forbids committing secret values' 'never commit|do not commit'
check 'skill says to identify variable names first' 'variable names|required variables'
check 'skill asks where to place values' 'where.*set|target environment|deployment'
check 'skill explains CoreZ provider configuration' 'CoreZ provider configuration'
check 'skill documents the preferred OpenCode key' 'OPENCODE_GO_API_KEY'
check_absent 'skill no longer documents DeepSeek fallback for chat' 'DEEPSEEK_API_KEY'
check 'skill documents the OpenRouter image key' 'OPENROUTER_API_KEY'
check 'skill states Workers AI is unused' 'does not use Cloudflare Workers AI'
check 'skill uses placeholders in docs/examples' 'placeholder|<value>|your_'
check_absent 'skill does not claim inference needs no runtime key' 'requires no (runtime )?API key|no runtime API key'
check_absent 'skill does not contain a real OpenRouter key' 'sk-or-v1-'

if (( failures > 0 )); then
  printf '%d env-question skill contract check(s) failed.\n' "$failures" >&2
  exit 1
fi

printf 'Env-question skill contract checks passed.\n'
