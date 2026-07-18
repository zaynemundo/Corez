#!/usr/bin/env bash
set -u

css="src/index.css"
app="src/App.jsx"
canvas="src/components/CanvasPreview.jsx"
sidebar="src/components/Sidebar.jsx"
failures=0

check() {
  local description="$1"
  local pattern="$2"
  local file="${3:-$css}"

  if ! grep -Eq -- "$pattern" "$file" 2>/dev/null; then
    printf 'FAIL: %s\n' "$description" >&2
    failures=$((failures + 1))
  fi
}

check_absent() {
  local description="$1"
  local pattern="$2"
  local file="${3:-$css}"

  if grep -Eq -- "$pattern" "$file" 2>/dev/null; then
    printf 'FAIL: %s\n' "$description" >&2
    failures=$((failures + 1))
  fi
}

check_block_property() {
  local description="$1"
  local selector="$2"
  local property="$3"
  local value="$4"
  local file="${5:-$css}"

  if ! awk -v selector="$selector" -v property="$property" -v value="$value" '
    index($0, selector) { in_block = 1 }
    in_block && index($0, property) && index($0, value) { found = 1 }
    in_block && index($0, "}") { in_block = 0 }
    END { exit found ? 0 : 1 }
  ' "$file" 2>/dev/null; then
    printf 'FAIL: %s\n' "$description" >&2
    failures=$((failures + 1))
  fi
}

check 'dynamic viewport height is used for mobile browser chrome' '100dvh'
check 'keyboard focus has a visible monochrome ring' ':focus-visible'
check_absent 'global outline removal is not forced with important' 'outline: none !important'
check_absent 'global focus-visible rule does not erase focus indicators' '\*:focus, \*:active, \*:focus-visible'
check 'mobile layout breakpoint exists' '@media \(max-width: 767px\)'
check 'mobile sidebar becomes an overlay drawer' 'position: fixed'
check 'mobile canvas stacks instead of forcing split pane' '\.main-content'
check 'mobile chat pane can shrink below desktop width' 'min-width: 0'
check_block_property 'prompt cards are rectangular, not oversized pills' '.sample-prompt-card' 'border-radius' 'var(--radius-sm)'
check_block_property 'history rows use restrained rectangular radius' '.history-item' 'border-radius' 'var(--radius-sm)'
check 'canvas iframe receives scalable width from component' "width: '100%'" "$canvas"
check 'canvas iframe receives bounded max width from component' 'maxWidth: deviceSpecs\[deviceMode\]\.width' "$canvas"
check_absent 'canvas iframe does not force fixed device height' 'height: deviceSpecs\[deviceMode\]\.height' "$canvas"
check_absent 'canvas iframe does not combine forced height with aspect ratio' 'aspectRatio: deviceSpecs\[deviceMode\]\.aspectRatio' "$canvas"
check 'canvas source editor uses a reusable class' 'className="canvas-source-editor"' "$canvas"
check 'canvas source editor is labelled for assistive tech' 'aria-label="Source code editor"' "$canvas"
check 'mobile sidebar has a dismiss backdrop' 'isMobileViewport && sidebarOpen' "$app"
check 'escape key closes the mobile sidebar' 'Escape' "$app"
check 'collapsed sidebar is hidden from focus flow' 'visibility: hidden'
check_absent 'viewport resize does not force desktop sidebar open' 'setSidebarOpen\\(!event\\.matches\\)'
check 'sidebar component can render collapsed state' 'isOpen.*collapsed|collapsed.*isOpen' "$sidebar"

if (( failures > 0 )); then
  printf '%d responsive UI contract check(s) failed.\n' "$failures" >&2
  exit 1
fi

printf 'Responsive UI contract checks passed.\n'
