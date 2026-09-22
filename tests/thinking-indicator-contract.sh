#!/usr/bin/env bash
set -u

app="src/App.jsx"
message="src/components/ChatMessage.jsx"
css="src/index.css"
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

check_absent 'completed app action no longer says Thinking / Created App' 'Thinking / Created App' "$message"
check_absent 'completed app action no longer uses thinking pill class' 'thinking-pill' "$message"
check 'completed app action is labelled Open preview' 'Open preview' "$message"
check 'temporary thinking state renders animated dot container' 'thinking-dots' "$app"
check 'thinking state exposes the build phase label' 'buildPhaseLabel\(buildPhase\)' "$app"
check_absent 'thinking state no longer prints the phase beside the dots' 'thinking-phase-label' "$app"
check_absent 'phase label styling is gone' 'thinking-phase-label' "$css"
check 'thinking state keeps an accessible control label' 'Expand response|Collapse response' "$app"
check 'dot animation keyframes exist' '@keyframes thinkingDotPulse' "$css"
check 'three thinking dots are styled' 'thinking-dot' "$css"
check_absent 'old spinning bullet animation is removed' 'spinning-icon' "$css"

if (( failures > 0 )); then
  printf '%d thinking indicator contract check(s) failed.\n' "$failures" >&2
  exit 1
fi

printf 'Thinking indicator contract checks passed.\n'
