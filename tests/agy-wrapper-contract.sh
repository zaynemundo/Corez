#!/usr/bin/env bash
set -u

wrapper="scripts/agy-delegate.ps1"
failures=0

check() {
  local description="$1"
  local pattern="$2"
  if ! grep -Eq -- "$pattern" "$wrapper" 2>/dev/null; then
    printf 'FAIL: %s\n' "$description" >&2
    failures=$((failures + 1))
  fi
}

check_absent() {
  local description="$1"
  local pattern="$2"
  if grep -Eq -- "$pattern" "$wrapper" 2>/dev/null; then
    printf 'FAIL: %s\n' "$description" >&2
    failures=$((failures + 1))
  fi
}

check 'wrapper exists' '^param\('
check 'task parameter is mandatory' '\[Parameter\(Mandatory'
check 'analysis mode is supported' "'Analysis'"
check 'implementation mode is supported' "'Implement'"
check 'diff-review mode is supported' "'ReviewDiff'"
check 'analysis maps to AGY plan mode' "\\\$agyMode = 'plan'"
check 'implementation maps to AGY accept-edits mode' "\\\$agyMode = 'accept-edits'"
check 'non-interactive print mode is used' "'--print'"
check 'sandboxing is enabled' "'--sandbox'"
check 'native exit code is captured' '\$LASTEXITCODE'
check 'failure throws an error' 'throw'
check 'output is preserved' 'Tee-Object'
check 'empty output is treated as failure' 'IsNullOrWhiteSpace'
check 'permission-denied no-output response is treated as failure' 'no output produced'
check 'git diff review is read-only' 'git diff'
check_absent 'dangerous permission bypass is forbidden' 'dangerously-skip-permissions'

if (( failures > 0 )); then
  printf '%d contract check(s) failed.\n' "$failures" >&2
  exit 1
fi

printf 'AGY wrapper contract checks passed.\n'
