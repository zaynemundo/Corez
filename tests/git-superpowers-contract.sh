#!/usr/bin/env bash
set -u

skill=".agents/skills/git-superpowers/SKILL.md"
hook=".agents/scripts/auto_commit.py"
agents="AGENTS.md"
failures=0

check() {
  local description="$1"
  local pattern="$2"
  local file="$3"

  if ! grep -Eiq -- "$pattern" "$file" 2>/dev/null; then
    printf 'FAIL: %s\n' "$description" >&2
    failures=$((failures + 1))
  fi
}

check_absent() {
  local description="$1"
  local pattern="$2"
  local file="$3"

  if grep -Eiq -- "$pattern" "$file" 2>/dev/null; then
    printf 'FAIL: %s\n' "$description" >&2
    failures=$((failures + 1))
  fi
}

check 'skill explicitly commits to main at task completion' 'commit.*main.*task completion|task completion.*commit.*main' "$skill"
check 'skill tells agents to use main branch only' 'current branch.*main|branch is main' "$skill"
check 'AGENTS.md documents main-branch commit policy' 'commit.*main' "$agents"
check 'hook checks current branch before committing' 'current_branch != "main"' "$hook"
check 'hook refuses to commit on non-main branches' 'Refusing to auto-commit.*main' "$hook"
check 'hook pushes main to origin main' 'push.*origin.*main:main' "$hook"
check_absent 'hook no longer pushes arbitrary current branch to main' 'f"\{current_branch\}:main"' "$hook"

if (( failures > 0 )); then
  printf '%d git superpowers contract check(s) failed.\n' "$failures" >&2
  exit 1
fi

printf 'Git superpowers contract checks passed.\n'
