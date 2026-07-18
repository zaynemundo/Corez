#!/usr/bin/env bash
set -u

service="src/services/aiService.js"
failures=0

check() {
  local description="$1"
  local pattern="$2"

  if ! grep -Eq -- "$pattern" "$service" 2>/dev/null; then
    printf 'FAIL: %s\n' "$description" >&2
    failures=$((failures + 1))
  fi
}

check 'public user intent analyzer is exported' 'export function analyzePublicUserIntent'
check 'intent prompt explains public user language' 'public user intent'
check 'intent prompt asks Corez to infer goals instead of matching only keywords' 'infer.*goal|goal.*infer'
check 'app intent includes natural build verbs' 'launch|prototype|design|create|build|make'
check 'app intent includes public-facing site terms' 'website|landing page|dashboard|portal|tool'
check 'code-help intent exists' "type: 'code-help'"
check 'writing intent exists' "type: 'writing'"
check 'explanation intent exists' "type: 'explanation'"
check 'response generation uses the analyzed public intent' 'const intent = analyzePublicUserIntent'
check 'app creation condition uses intent type' "intent\\.type === 'app'"
check 'fallback response references inferred intent summary' 'intent[.]summary'

if (( failures > 0 )); then
  printf '%d AI public intent contract check(s) failed.\n' "$failures" >&2
  exit 1
fi

printf 'AI public intent contract checks passed.\n'
