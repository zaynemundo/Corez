#!/usr/bin/env bash
set -u

css="src/index.css"
app="src/App.jsx"
canvas="src/components/CanvasPreview.jsx"
sidebar="src/components/Sidebar.jsx"
market_card="src/components/MarketCard.jsx"
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

check_block_property_in_media() {
  local description="$1"
  local media="$2"
  local selector="$3"
  local property="$4"
  local value="$5"
  local file="${6:-$css}"

  if ! awk -v media="$media" -v selector="$selector" -v property="$property" -v value="$value" '
    BEGIN { depth = 0; in_media = 0; in_block = 0; media_opened = 0; block_opened = 0; found = 0 }
    {
      line = $0
      trimmed = line
      sub(/^[ \t]+/, "", trimmed)
      sub(/[ \t]+$/, "", trimmed)
      selector_text = trimmed
      sub(/[ \t]*\{.*$/, "", selector_text)
      sub(/[ \t]+$/, "", selector_text)

      if (!in_media && index(line, media)) {
        in_media = 1
        media_parent_depth = depth
      }
      if (in_media && !in_block && selector_text == selector) {
        in_block = 1
        block_parent_depth = depth
      }
      if (in_block && index(line, property) && index(line, value)) {
        found = 1
      }

      opens = line; open_count = gsub(/\{/, "{", opens)
      closes = line; close_count = gsub(/\}/, "}", closes)
      depth += open_count - close_count
      if (in_media && open_count > 0) media_opened = 1
      if (in_block && open_count > 0) block_opened = 1

      if (in_block && block_opened && depth <= block_parent_depth) {
        in_block = 0
        block_opened = 0
      }
      if (in_media && media_opened && depth <= media_parent_depth) {
        in_media = 0
        media_opened = 0
      }
    }
    END { exit found ? 0 : 1 }
  ' "$file" 2>/dev/null; then
    printf 'FAIL: %s\n' "$description" >&2
    failures=$((failures + 1))
  fi
}

check_block_absent() {
  local description="$1"
  local selector="$2"
  local property="$3"
  local value="$4"
  local file="${5:-$css}"

  if [ ! -r "$file" ]; then
    printf 'FAIL: %s\n' "$description" >&2
    failures=$((failures + 1))
    return
  fi

  if awk -v selector="$selector" -v property="$property" -v value="$value" '
    BEGIN {
      found = 0; in_block = 0; depth = 0; block = ""; had_braces = 0
      pattern = property "[[:space:]]*:([^;]*[,[:space:]])?" value "([,[:space:];]|$)"
    }
    !in_block {
      line = $0
      sub(/^[ \t]+/, "", line)
      sub(/[ \t]+$/, "", line)
      sub(/\{.*$/, "", line)
      sub(/[ \t]+$/, "", line)
      if (line == selector) {
        in_block = 1
        depth = 0
        had_braces = 0
        block = ""
      }
    }
    in_block {
      block = block "\n" $0
      c_open = $0; n_open = gsub(/\{/, "{", c_open)
      c_close = $0; n_close = gsub(/\}/, "}", c_close)
      depth += n_open - n_close
      if (n_open > 0) {
        had_braces = 1
      }
      if ((depth <= 0 && had_braces) || (depth <= 0 && n_close > 0)) {
        if (block ~ pattern) {
          found = 1
        }
        in_block = 0
        depth = 0
        had_braces = 0
        block = ""
      }
    }
    END { exit found ? 0 : 1 }
  ' "$file" 2>/dev/null; then
    printf 'FAIL: %s\n' "$description" >&2
    failures=$((failures + 1))
  fi
}

check_top_level_media() {
  local description="$1"
  local pattern="$2"
  local file="${3:-$css}"

  if [ ! -r "$file" ]; then
    printf 'FAIL: %s\n' "$description" >&2
    failures=$((failures + 1))
  else
    local res count target_depth neg final_depth
    res=$(PAT="$pattern" awk '
      BEGIN { count = 0; target_depth = -1; depth = 0; neg = 0 }
      {
        if (match($0, ENVIRON["PAT"])) {
          count++
          if (target_depth == -1) target_depth = depth
        }
        len = length($0)
        for (i = 1; i <= len; i++) {
          c = substr($0, i, 1)
          if (c == "{") depth++
          else if (c == "}") depth--
          if (depth < 0) neg = 1
        }
      }
      END {
        print count, target_depth, neg, depth
      }
    ' "$file")

    read -r count target_depth neg final_depth <<< "$res"

    if [ "$count" -eq 1 ] && [ "$target_depth" -eq 0 ] && [ "$neg" -eq 0 ] && [ "$final_depth" -eq 0 ]; then
      :
    else
      printf 'FAIL: %s\n' "$description" >&2
      failures=$((failures + 1))
    fi
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
check 'canvas iframe receives bounded max width from component' "maxWidth: '100%'" "$canvas"
check_absent 'canvas iframe does not force fixed device height' 'height: deviceSpecs\[deviceMode\]\.height' "$canvas"
check_absent 'canvas iframe does not combine forced height with aspect ratio' 'aspectRatio: deviceSpecs\[deviceMode\]\.aspectRatio' "$canvas"
check 'canvas source editor uses a reusable class' 'className="canvas-source-editor"' "$canvas"
check 'canvas source editor is labelled for assistive tech' 'aria-label="Source code editor"' "$canvas"
check 'mobile sidebar has a dismiss backdrop' 'isMobileViewport && sidebarOpen' "$app"
check 'escape key closes the mobile sidebar' 'Escape' "$app"
check 'collapsed sidebar is hidden from focus flow' 'visibility: hidden'
check_absent 'viewport resize does not force desktop sidebar open' 'setSidebarOpen\\(!event\\.matches\\)'
check 'sidebar component can render collapsed state' 'isOpen.*collapsed|collapsed.*isOpen' "$sidebar"

# Polished Glass Sidebar Contract Checks
check_absent 'sidebar section heading is absent' 'className="sidebar-section-heading"' "$sidebar"
check_absent 'sidebar section headers do not use inline letterSpacing styles' 'style=\{\{.*letterSpacing' "$sidebar"
check 'sidebar width token set to 260px' '--sidebar-width: 260px;'
check 'sidebar margin token set to 0px' '--sidebar-margin: 0px;'
check 'sidebar radius token set to 0px' '--sidebar-radius: 0px;'
check 'sidebar heading size token set to 11px' '--sidebar-heading-size: 11px;'
check 'sidebar body size token set to 14px' '--sidebar-body-size: 14px;'
check 'sidebar hit target min height set to 38px' '--sidebar-item-min-height: 38px;'
check_block_property 'sidebar block consumes margin token' '.sidebar' 'margin' 'var(--sidebar-margin)'
check_block_property 'sidebar block consumes radius token' '.sidebar' 'border-radius' 'var(--sidebar-radius)'
check_block_property 'sidebar block consumes background token' '.sidebar' 'background-color' 'var(--sidebar-bg)'
check_absent 'sidebar no longer relies on backdrop blur' 'backdrop-filter: blur\(16px\)'
check_block_property 'dark theme sidebar matches main content background' '[data-theme="dark"]' '--sidebar-bg' 'var(--bg-primary)'
check_block_property 'light theme sidebar matches main content background' '[data-theme="light"]' '--sidebar-bg' 'var(--bg-primary)'
check_absent 'sidebar no longer needs opaque background fallback block' '@supports not \(\(backdrop-filter: blur\(1px\)\)'
check_block_property 'section heading class sets 11px font size' '.sidebar-section-heading' 'font-size' 'var(--sidebar-heading-size)'
check_block_property 'active history item applies active background token' '.history-item.active' 'background' 'var(--sidebar-item-active-bg)'
check_block_property 'delete chat button enforces 38px minimum width' '.delete-chat-btn' 'min-width' '38px'
check_block_property 'delete chat button enforces 38px minimum height' '.delete-chat-btn' 'min-height' '38px'
check_block_property 'sidebar header collapse button enforces 38px minimum width' '.sidebar .icon-btn' 'min-width' '38px'
check_block_property 'sidebar header collapse button enforces 38px minimum height' '.sidebar .icon-btn' 'min-height' '38px'
check_absent 'no stale 52px sidebar rail width override' '--sidebar-width[[:space:]]*:[[:space:]]*52px;?'
check_absent 'no laptop 230px sidebar width override' '--sidebar-width[[:space:]]*:[[:space:]]*230px;?'
check_absent 'no small laptop 210px sidebar width override' '--sidebar-width[[:space:]]*:[[:space:]]*210px;?'
check_block_absent 'sidebar container block does not use transition all' '.sidebar' 'transition' 'all'
check_block_absent 'new chat button block does not use transition all' '.new-chat-btn' 'transition' 'all'
check_block_absent 'history item block does not use transition all' '.history-item' 'transition' 'all'
check_block_absent 'delete chat button block does not use transition all' '.delete-chat-btn' 'transition' 'all'
check_block_absent 'footer action button block does not use transition all' '.footer-action-btn' 'transition' 'all'
check 'reduced motion query disables sidebar animation' '@media \(prefers-reduced-motion: reduce\)'
check_top_level_media 'sidebar prefers-reduced-motion at top level' '@media \(prefers-reduced-motion: reduce\)' "$css"
check 'mobile sidebar uses safe-area insets' 'env\(safe-area-inset-'

# Market Card Responsive and Accessibility Contract Checks
check_block_property 'market card has a responsive grid' '.market-controls' 'grid-template-columns' 'repeat(2, minmax(0, 1fr))' "$css"
check_block_property_in_media 'market card mobile controls collapse inside the mobile breakpoint' '@media (max-width: 767px)' '.market-controls' 'grid-template-columns' '1fr;' "$css"
check_block_property 'market card chart remains width-fluid' '.market-chart' 'width' '100%' "$css"
check_block_property 'market card chart cannot exceed its container' '.market-chart' 'max-width' '100%' "$css"
check_block_property 'market card chart wrapper can shrink without overflow' '.market-chart-block' 'min-width' '0' "$css"
check_block_property 'market card stays within its chat message' '.market-card' 'max-width' '100%' "$css"
check_block_property 'market refresh has a touch-sized target' '.market-refresh,' 'min-height' '44px' "$css"
check_block_property 'market retry has a touch-sized target' '.market-retry,' 'min-height' '44px' "$css"
check_block_property 'market ranges have touch-sized targets' '.market-ranges button' 'min-height' '44px' "$css"
check_block_property 'market inputs have touch-sized targets' '.market-controls input,' 'min-height' '44px' "$css"
check_block_property 'market selects have touch-sized targets' '.market-controls select' 'min-height' '44px' "$css"
check 'market card has explicit focus-visible treatment' '\.market-card[^\{]*:focus-visible' "$css"
check 'market card has restrained positive theme color' '--market-positive:' "$css"
check 'market card has restrained negative theme color' '--market-negative:' "$css"
check_block_property 'light theme overrides market positive color' '[data-theme="light"]' '--market-positive' '#15803d' "$css"
check_block_property 'light theme overrides market negative color' '[data-theme="light"]' '--market-negative' '#b91c1c' "$css"
check_block_property 'market refresh state uses contrast-safe secondary text' '.market-refresh-state' 'color' 'var(--text-secondary)' "$css"
check_block_property 'market empty chart text uses contrast-safe secondary text' '.market-chart-empty' 'color' 'var(--text-secondary)' "$css"
check_block_property 'market card respects reduced motion' '.market-refresh svg' 'animation' 'none !important' "$css"
check 'market card exposes a labelled region' 'role="region"' "$market_card"
check 'market chart stretches its viewBox to the fluid chart bounds' 'preserveAspectRatio="none"' "$market_card"
check 'market movement includes words in addition to color' "movingUp \? 'Up' : 'Down'" "$market_card"
check 'market disclosure identifies indicative data' 'Indicative data' "$market_card"

if (( failures > 0 )); then
  printf '%d responsive UI contract check(s) failed.\n' "$failures" >&2
  exit 1
fi

printf 'Responsive UI contract checks passed.\n'
