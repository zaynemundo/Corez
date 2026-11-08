#!/usr/bin/env bash
# Custom-theme UI contract.
#
# Custom themes are cosmetic: the provider may paint CSS variables and a body
# background, but the theme section in index.css must never change layout,
# stacking or pointer behaviour. These checks read the real CSS/JSX so a future
# edit cannot quietly turn a palette into a layout change, un-scope the body
# paint, or move document theme ownership out of ThemeProvider.
set -u

css="src/index.css"
context="src/context/ThemeContext.jsx"
app="src/App.jsx"
settings="src/components/SettingsModal.jsx"
provider_test="tests/theme-provider.test.jsx"
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

# Print only the "background layer" half of the theme section (the half that is
# allowed to paint the page). The Settings-row styles below the second marker are
# ordinary component styling and are out of scope for the layout prohibition.
theme_layer() {
  awk '
    /CUSTOM THEME BACKGROUND LAYER/ { active = 1; next }
    /SETTINGS/ { active = 0 }
    active { print }
  ' "$css" 2>/dev/null
}

check_layer() {
  local description="$1"
  local pattern="$2"

  if ! theme_layer | grep -Eq -- "$pattern"; then
    printf 'FAIL: %s\n' "$description" >&2
    failures=$((failures + 1))
  fi
}

check_layer_absent() {
  local description="$1"
  local pattern="$2"

  if theme_layer | grep -Eq -- "$pattern"; then
    printf 'FAIL: %s\n' "$description" >&2
    failures=$((failures + 1))
  fi
}

# ---------------------------------------------------------------------------
# 1. The body background is a plain background paint and nothing else.
# ---------------------------------------------------------------------------
check 'theme layer section exists' 'CUSTOM THEME BACKGROUND LAYER' "$css"
check_block_property 'custom background paints the theme base colour' 'html.theme-has-backgrounds body' 'background-color' 'var(--bg-primary)'
check_block_property 'custom background is the scrim over the desktop image' 'html.theme-has-backgrounds body' 'background-image' 'linear-gradient(var(--theme-scrim), var(--theme-scrim))'
check_block_property 'custom background consumes the desktop image token' 'html.theme-has-backgrounds body' 'background-image' 'var(--theme-image-desktop)'
check_block_property 'custom background covers the viewport' 'html.theme-has-backgrounds body' 'background-size' 'cover'
check_block_property 'custom background is centred' 'html.theme-has-backgrounds body' 'background-position' 'center'
check_block_property 'custom background never tiles' 'html.theme-has-backgrounds body' 'background-repeat' 'no-repeat'
check_block_property_in_media 'a phone uses the mobile image token' 'max-width: 767px' 'html.theme-has-backgrounds body' 'background-image' 'var(--theme-image-mobile)'

# No pseudo-element/painting layer: the picture must not add a stacking context.
theme_layer | grep -Eq 'theme-has-backgrounds[^{]*::?(before|after)' && {
  printf 'FAIL: the background paint must not introduce a pseudo-element layer\n' >&2
  failures=$((failures + 1))
}

# The paint is scoped to the class the provider manages; nothing paints body
# globally for a custom theme.
check_layer_absent 'no unscoped body rule in the theme background layer' '^[[:space:]]*body([[:space:]]*,|[[:space:]]*\{)'
unscoped_selectors="$(theme_layer | grep -E '^[^[:space:]/*}]' | grep -vE '^(html\.theme-|@media)' || true)"
if [ -n "$unscoped_selectors" ]; then
  printf 'FAIL: unscoped selector in the theme background layer:\n%s\n' "$unscoped_selectors" >&2
  failures=$((failures + 1))
fi

# ---------------------------------------------------------------------------
# 2. The shell becomes transparent so the paint is visible, but only while a
#    background theme is active.
# ---------------------------------------------------------------------------
check_block_property 'app shell lets the picture through' 'html.theme-has-backgrounds .app-container' 'background-color' 'transparent'
check_block_property 'main content lets the picture through' 'html.theme-has-backgrounds .main-content' 'background-color' 'transparent'
check_block_property 'chat pane lets the picture through' 'html.theme-has-backgrounds .chat-pane' 'background-color' 'transparent'
check_absent 'the conversation transcript stays on the artwork (no column panel)' 'html\.theme-has-backgrounds \.messages-inner'
check_absent 'the new chat question stays on the artwork (no column panel)' 'html\.theme-has-backgrounds \.new-chat-hero'
check_absent 'the new chat starters stay on the artwork (no column panel)' 'html\.theme-has-backgrounds \.new-chat-starters'
check_block_property 'conversation footer sits on the reading column' 'html.theme-has-backgrounds .conversation-persona-footer' 'background-color' 'var(--theme-column-bg)'
check_block_property 'the sidebar uses the 70%-transparent panel token' 'html.theme-has-backgrounds .sidebar' 'background-color' 'var(--theme-sidebar-bg)'
check_block_property 'the expanded sidebar panel stays clear' 'html.theme-has-backgrounds .sidebar-full' 'background-color' 'transparent'
check_block_property 'the collapsed sidebar rail lets the picture through' 'html.theme-has-backgrounds .sidebar-rail' 'background-color' 'transparent'
check_block_property 'the sidebar edge disappears on the artwork' 'html.theme-has-backgrounds .sidebar' 'border-right-color' 'transparent'
check_block_property 'the phone drawer scrim lets the picture through' 'html.theme-has-backgrounds .sidebar-backdrop' 'background' 'transparent'
check_block_property 'user bubbles use the theme bubble token' 'html.theme-has-backgrounds .message-wrapper.user .message-content' 'background-color' 'var(--theme-message-bg)'
check_block_property 'composer uses the theme panel token' 'html.theme-has-backgrounds .input-box' 'background-color' 'var(--theme-panel-bg)'
check_block_property 'dialogs keep a readable panel surface' 'html.theme-has-backgrounds .modal-card' 'background-color' 'var(--theme-panel-strong-bg)'
check 'custom themes carry their own scrollbar thumb' 'html\.theme-custom ::-webkit-scrollbar-thumb'
check_block_property 'scrollbar thumb consumes the palette token' 'html.theme-custom ::-webkit-scrollbar-thumb' 'background' 'var(--scrollbar-thumb'

# Transparent shell rules only apply under the provider's class: the light/dark
# themes keep their opaque surfaces.
check_block_property 'the base app shell keeps its opaque background' '.app-container' 'background-color' 'var(--bg-primary)'
check_block_property 'the base composer keeps its opaque background' '.input-box' 'background-color' 'var(--bg-secondary)'

# ---------------------------------------------------------------------------
# 3. The background layer changes paint only: no layout, stacking or pointer
#    properties, and no animation.
# ---------------------------------------------------------------------------
for property in display position width height min-width min-height max-width max-height transform pointer-events z-index inset overflow; do
  if theme_layer | grep -Eq -- "(^|[;{[[:space:]])$property[[:space:]]*:"; then
    printf 'FAIL: the theme background layer sets layout property: %s\n' "$property" >&2
    failures=$((failures + 1))
  fi
done
if theme_layer | grep -Eq -- '(^|[;{[[:space:]])(animation|transition)[[:space:]]*:'; then
  printf 'FAIL: the theme background layer must not animate\n' >&2
  failures=$((failures + 1))
fi
# background-position is a paint property and must not be mistaken for position;
# the loop above scopes the match to the start of a declaration.
if theme_layer | grep -Eq -- 'pointer-events'; then
  printf 'FAIL: the theme background layer must not touch pointer-events\n' >&2
  failures=$((failures + 1))
fi
if theme_layer | grep -Eq -- 'z-index'; then
  printf 'FAIL: the theme background layer must not create a stacking layer\n' >&2
  failures=$((failures + 1))
fi

# ---------------------------------------------------------------------------
# 4. Single ownership of the document theme state.
# ---------------------------------------------------------------------------
check 'ThemeProvider writes the theme attribute' 'document\.documentElement' "$context"
check 'ThemeProvider owns data-theme' 'setAttribute\("data-theme"' "$context"
check 'ThemeProvider owns the meta theme-color' 'meta\[name="theme-color"\]' "$context"
check 'ThemeProvider owns the managed classes' 'theme-has-backgrounds' "$context"
check 'ThemeProvider only applies CSS custom properties' 'name\.startsWith\("--"\)' "$context"
check 'ThemeProvider caches the painted theme' 'THEME_CACHE_KEY' "$context"
check 'ThemeProvider listens for cross-tab storage' 'addEventListener\("storage"' "$context"
check 'ThemeProvider tolerates a missing provider' 'FALLBACK_THEME' "$context"

check_absent 'App no longer writes the theme attribute directly' 'setAttribute\("data-theme"' "$app"
check_absent 'App no longer persists the selected theme' 'localStorage\.setItem\("corez_theme"' "$app"
check 'App mounts the provider' '<ThemeProvider>' "$app"
check 'App listens for the open-settings event' 'corez:open-settings' "$app"

check 'Settings reads the shared theme state' 'useTheme\(\)' "$settings"
check 'Settings lists light and dark rows' 'settings\.general\.lightMode' "$settings"
check 'Settings lists custom theme rows' 'customThemes\.map' "$settings"
check_absent 'Settings no longer takes theme props' 'onToggleTheme' "$settings"

# A provider test must exist for the state machine this contract describes.
if [ ! -f "$provider_test" ]; then
  printf 'FAIL: missing %s\n' "$provider_test" >&2
  failures=$((failures + 1))
fi

if (( failures > 0 )); then
  printf '%d custom theme contract check(s) failed.\n' "$failures" >&2
  exit 1
fi

printf 'Custom theme contract checks passed.\n'