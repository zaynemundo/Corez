#!/usr/bin/env bash
set -u

# Thinking-indicator contract: structure, animation and WIRING only.
#
# The user-facing copy lives in the i18n dictionary, so this contract asserts
# that the components reference the right keys — never the English text itself.
# Copy is owned by tests/i18n-coverage.test.jsx, which fails when a key a
# component asks for is undefined and when a frozen English string is reworded
# (tests/fixtures/i18n-en-snapshot.json). Asserting the strings here as well
# would give the copy two sources of truth, so a reviewed rewording would need
# two edits instead of one.

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
check 'completed app action wires the preview label key' 'chat\.message\.code\.openPreview' "$message"
# The three-dot row was removed from the chat stream: the live thinking panel
# is the only indicator, showing a working status until reasoning streams in.
check_absent 'chat stream no longer renders the three-dot row' 'thinking-dots|thinking-dot' "$app"
check 'thinking state exposes the build phase label' 'buildPhaseLabel\(buildPhase\)' "$app"
check_absent 'thinking state no longer prints the phase beside the dots' 'thinking-phase-label' "$app"
check_absent 'phase label styling is gone' 'thinking-phase-label' "$css"
check 'live panel wires the waiting status key' 'common\.thinking\.working' "$app"
check 'live panel receives the waiting placeholder' 'placeholder=\{t\("common\.thinking\.working"\)\}' "$app"
check_absent 'the whole-stream collapse toggle is gone' 'isStreamCollapsed|expandResponse|collapseResponse' "$app"
check 'dot animation keyframes exist for PaymentStatus dots' '@keyframes thinkingDotPulse' "$css"
check 'payment-status dots keep their class styling' '\.thinking-dot' "$css"
check 'waiting status has a pulse animation' '@keyframes thinkingStatusPulse' "$css"
check_absent 'old spinning bullet animation is removed' 'spinning-icon' "$css"

if (( failures > 0 )); then
  printf '%d thinking indicator contract check(s) failed.\n' "$failures" >&2
  exit 1
fi

printf 'Thinking indicator contract checks passed.\n'
