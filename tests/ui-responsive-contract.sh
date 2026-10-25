#!/usr/bin/env bash
set -u

css="src/index.css"
app="src/App.jsx"
canvas="src/components/CanvasPreview.jsx"
sidebar="src/components/Sidebar.jsx"
input="src/components/ChatInput.jsx"
starters="src/components/NewChatStarters.jsx"
sites="src/pages/Sites.jsx"
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
check 'canvas iframe receives scalable width from component' 'width: deviceSpecs\[deviceMode\]\.width' "$canvas"
check 'canvas iframe receives bounded max width from component' 'maxWidth: "100%"' "$canvas"
check_absent 'canvas iframe does not force fixed device height' 'height: deviceSpecs\[deviceMode\]\.height' "$canvas"
check_absent 'canvas iframe does not combine forced height with aspect ratio' 'aspectRatio: deviceSpecs\[deviceMode\]\.aspectRatio' "$canvas"
check 'canvas source editor uses a reusable class' 'className="canvas-source-editor"' "$canvas"
check 'canvas source editor is labelled for assistive tech' 'aria-label=\{t\("canvas\.header\.sourceEditor"\)\}' "$canvas"
check 'mobile sidebar has a dismiss backdrop' 'isMobileViewport && sidebarOpen' "$app"
check 'escape key closes the mobile sidebar' 'Escape' "$app"
check 'collapsed sidebar is hidden from focus flow' 'visibility: hidden'
check_absent 'viewport resize does not force desktop sidebar open' 'setSidebarOpen\\(!event\\.matches\\)'
check 'sidebar component can render collapsed state' 'isOpen.*collapsed|collapsed.*isOpen' "$sidebar"
# Closed on desktop, the sidebar remains as a labelled icon rail instead of
# disappearing and leaving only a floating toggle over the content.
check 'rail width token exists' '--sidebar-rail-width: 72px;'
check_block_property 'the closed desktop column is the rail width' '.sidebar.collapsed' 'width' 'var(--sidebar-rail-width)'
check_block_property 'the closed desktop column never translates off screen' '.sidebar.collapsed' 'transform' 'none'
check_block_property 'the closed desktop column stays visible' '.sidebar.collapsed' 'visibility' 'visible'
check_block_property 'the full panel is hidden from focus flow when collapsed' '.sidebar.collapsed .sidebar-full' 'visibility' 'hidden'
check_block_property 'the rail button keeps a 44px target' '.sidebar-rail-action' 'width' '44px'
check 'the rail carries the Corez mark' 'sidebar-rail-logo' "$sidebar"
check 'the rail opens quick find' 'sidebar-rail-search-btn' "$sidebar"
check 'quick find searches only the visible chat list' 'sessions.filter' "$sidebar"
check 'the rail offers recents' 'common.sidebar.chats' "$sidebar"
check 'the rail offers Sites' 'LayoutGrid' "$sidebar"
check 'the rail account control opens settings' 'SidebarRailProfile' "$sidebar"
check_block_property_in_media 'a phone drawer hides the desktop rail' 'max-width: 767px' '.sidebar.collapsed .sidebar-rail' 'display' 'none'
check 'the floating sidebar toggle is phone-only' '!sidebarOpen && isMobileViewport' "$app"

# Project folders: the add control is a hover affordance of the Projects
# heading, not a permanent button — and it must still be reachable on touch
# devices and by keyboard. Menus and the list itself must not fight scrolling.
check_block_property 'projects add button is hidden until its heading is hovered' '.sidebar-section-add' 'opacity' '0;'
check_block_property 'projects add button is revealed on heading hover' '.sidebar-section-row:hover .sidebar-section-add' 'opacity' '0.65'
check_block_property 'projects add button marks keyboard focus without a ring' '.sidebar-section-add:focus-visible' 'outline' 'none'
check_block_property 'the project name field draws no focus ring' '.project-name-input:focus-visible' 'outline' 'none'
check_block_property_in_media 'projects add button stays visible on touch devices' 'hover: none' '.sidebar-section-add' 'opacity' '0.65'
check_block_property 'sidebar list reserves its scrollbar gutter' '.chat-history-list' 'scrollbar-gutter' 'stable'
check_block_property 'row menus float beside the sidebar' '.history-menu-dropdown' 'position' 'fixed'
check_block_property 'floating menus stay above the mobile drawer' '.history-menu-dropdown' 'z-index' 'var(--z-sidebar-mobile)'
check_block_property 'menu project list contains its own scroll' '.history-menu-scroll' 'overscroll-behavior' 'contain'
# Drag and drop: chat rows are draggable sources, folders and the Pinned
# section take onto-drops (filing and pinning), and same-list gaps reorder.
# Touch devices have no HTML5 drag, so the row menu stays their path.
check 'chat rows render draggable' 'draggable' "$sidebar"
check 'drags never start from row controls' 'closest\("button, input, textarea, a"\)' "$sidebar"
check 'project folders accept onto-drops' 'onMoveSessionToProject\(drag\.id, project\.id\)' "$sidebar"
check 'pinned section accepts onto-drops' 'onTogglePinSession\(drag\.id\)' "$sidebar"
check 'gap drops call the reorder handler' 'onReorderSession\(' "$sidebar"
check 'reorder posts neighbour ids' 'reorderChat' 'src/services/chatService.js'
check 'reorder endpoint exists' '/api/chats/reorder' 'worker/chats.js'
check 'manual order flags table exists' 'chat_list_manual' 'worker/chats.js'
check_block_property 'dragged rows dim while dragging' '.history-item.dragging' 'opacity' '0.4'
check_block_property 'gap indicator paints above the row' '.history-item.drop-before::before' 'top' '-2px'
check_block_property 'gap indicator paints below the row' '.history-item.drop-after::after' 'bottom' '-2px'
check_block_property 'folder drop targets highlight' '.project-group.drop-target-active' 'outline' 'dashed'
check_block_property 'pinned drop target highlights' '.sidebar-pinned-section.drop-target-active' 'outline' 'dashed'
# Every row menu paints one fixed size and every entry stays on one line: a
# long label or project name truncates with an ellipsis instead of growing the
# panel or wrapping the row onto a second line.
check_block_property 'every row menu paints one fixed width' '.history-menu-dropdown' 'width' '200px'
check_block_property 'menu rows never wrap' '.history-menu-item' 'white-space' 'nowrap'
check_block_property 'menu labels truncate on one line' '.history-menu-label' 'text-overflow' 'ellipsis'
# The new-chat control belongs to the folder row, beside its options menu: an
# open project never repeats a full-width new-chat row inside the nested list.
check 'project row carries the new-chat icon button' 'className="project-new-chat-btn"' "$sidebar"
check_absent 'nested project list does not repeat the new-chat row' 'history-item project-new-chat"' "$sidebar"
check_block_property 'the row new-chat control is sized like the menu button' '.project-new-chat-btn' 'width' '26px'
check_block_property 'the row new-chat control is always visible while its project is open' '.project-new-chat-btn' 'opacity' '0.65'
# The row-level pin toggle sits beside the options menu: hover-revealed on
# idle rows like the menu button, always visible on a pinned chat.
check 'chat rows carry a row-level pin toggle' 'className={`chat-pin-btn' "$sidebar"
check_block_property 'row pin toggle is hover-revealed like the menu button' '.history-item:hover .chat-pin-btn' 'opacity' '0.65'
check_block_property 'pinned rows keep their pin mark visible' '.chat-pin-btn.pinned' 'opacity' '1'
check 'recent chats section is a disclosure' 'aria-controls="sidebar-chats-list"' "$sidebar"
check 'recent chats list is identified for the toggle' 'id="sidebar-chats-list"' "$sidebar"
check 'recent chats disclosure state is exposed' 'aria-expanded=\{chatsOpen\}' "$sidebar"
check 'pinned section is a disclosure' 'aria-controls="sidebar-pinned-list"' "$sidebar"
check 'pinned list is identified for the toggle' 'id="sidebar-pinned-list"' "$sidebar"
check 'pinned disclosure state is exposed' 'aria-expanded=\{pinnedOpen\}' "$sidebar"
check 'pinned section starts collapsed on load' '\[pinnedOpen, setPinnedOpen\] = useState\(false\)' "$sidebar"
check 'projects section starts collapsed on load' '\[projectsOpen, setProjectsOpen\] = useState\(false\)' "$sidebar"
check 'recents section still starts open on load' '\[chatsOpen, setChatsOpen\] = useState\(true\)' "$sidebar"
check_block_property 'pinned list shares the section list layout' '.sidebar-pinned-list' 'gap' '0.2rem'
# Sticky pricing footer: the page is a column flexbox at least a viewport
# tall, and the main absorbs free space so the footer rests on the bottom.
check_block_property 'pricing main absorbs free space above the footer' '.pricing-main' 'flex' '1 0 auto'
check 'projects section is a disclosure' 'aria-controls="sidebar-projects-list"' "$sidebar"
check 'projects list is identified for the toggle' 'id="sidebar-projects-list"' "$sidebar"
check 'projects disclosure state is exposed' 'aria-expanded=\{projectsOpen\}' "$sidebar"
# Section labels and chat titles line up on the same left edge: the heading row
# carries a 12px inset and the list adds the same 8px it gives every row.
check_block_property 'section headings use the chat rows left inset' '.sidebar-section-toggle' 'padding' '12px'
check_block_property 'chat rows keep the matching left inset' '.history-item' 'padding' '0 0.75rem'

# Polished Glass Sidebar Contract Checks
check_absent 'sidebar section heading is absent' 'className="sidebar-section-heading"' "$sidebar"
check_absent 'sidebar section headers do not use inline letterSpacing styles' 'style=\{\{.*letterSpacing' "$sidebar"
check 'sidebar width token set to 260px' '--sidebar-width: 260px;'
check 'sidebar margin token set to 0px' '--sidebar-margin: 0px;'
check 'sidebar radius token set to 0px' '--sidebar-radius: 0px;'
check 'sidebar heading size token set to 11px' '--sidebar-heading-size: 11px;'
check 'sidebar body size token set to 14px' '--sidebar-body-size: 14px;'
check 'sidebar hit target min height set to 38px' '--sidebar-item-min-height: 38px;'
check 'sidebar section gap token set to 10px' '--sidebar-section-gap: 10px;'
check_block_property 'sidebar sections consume the section gap token' '.sidebar-section-row:not(:first-child)' 'margin-top' 'var(--sidebar-section-gap)'
check_block_absent 'the first sidebar section has no gap above it' '.sidebar-section-row' 'margin-top' 'var(--sidebar-section-gap)'
check_block_property 'section headings match the new chat text size' '.sidebar-section-label' 'font-size' '15px'
check_block_property 'section headings are regular weight' '.sidebar-section-label' 'font-weight' '400'
check_block_property 'an empty open section spends no gap' '.sidebar-projects-list:empty' 'display' 'none'
check_block_absent 'the project chat rail adds no vertical margin' '.project-chats' 'margin' '2px'
check_block_property 'sidebar block consumes margin token' '.sidebar' 'margin' 'var(--sidebar-margin)'
check_block_property 'sidebar block consumes radius token' '.sidebar' 'border-radius' 'var(--sidebar-radius)'
check_block_property 'sidebar block consumes background token' '.sidebar' 'background-color' 'var(--sidebar-bg)'
check_block_absent 'sidebar no longer relies on backdrop blur 16px' '.sidebar' 'backdrop-filter' 'blur(16px)'
check_block_property 'dark theme shell uses the graphite base' '[data-theme="dark"]' '--bg-primary' '#212121'
check_block_property 'light theme shell uses the soft off-white base' '[data-theme="light"]' '--bg-primary' '#f7f7f7'
# The sidebar and the chat panel share one surface in both themes: navigation
# is separated by its border, not by a different tone.
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

# The conversation column is sized for reading, not for filling the window: the
# transcript, the composer and the hero share one measure at every breakpoint,
# and it steps down (not up) as the window narrows.
check_block_property 'the transcript keeps a readable measure' '.messages-inner' 'max-width' '720px'
check_block_property 'the composer shares the transcript measure' '.input-container' 'max-width' 'calc(min(100%, 720px) - 3rem)'
check_block_property 'the hero text shares the composer measure' '.new-chat-hero' 'max-width' '660px'
check_block_property_in_media 'a large desktop widens the column only a little' 'min-width: 1440px' '.messages-inner' 'max-width' '820px'
check_block_property_in_media 'a phone keeps the 16px composer text' 'max-width: 767px' '.input-box.hero .chat-textarea' 'font-size' '1rem'
# New chat: an empty conversation is one centred group — the question, the
# composer bar and the suggestion list — so the composer is never stranded on
# the bottom edge of an empty page. The list lives inside the composer's own
# container, which is what keeps it exactly as wide as the input it fills.
check_block_property 'the new chat screen centres its group vertically' '.chat-pane.new-chat' 'justify-content' 'center'
check_block_property 'the new chat scroll area takes only its own height' '.chat-pane.new-chat .messages-scroll' 'flex' '0 1 auto'
# While the consent banner reserves room at the bottom of the shell, the pane is
# that much shorter, which would leave the centred group above the window's
# centre. The reserved space is handed back to the group as a top margin (a top
# margin moves a centred group down by half of it), guarded to the side-by-side
# layout and to windows tall enough that the group still clears the banner.
check_block_property_in_media 'the new chat group re-centres while the consent banner reserves room' 'min-width: 768px' 'body.corez-consent-visible .chat-pane.new-chat .messages-scroll' 'margin-top' 'var(--corez-consent-space'
check_block_property 'the new chat question is regular weight, not a display wordmark' '.new-chat-hero-title' 'font-weight' '400'
check_block_property 'the new chat composer keeps the restrained corner radius' '.input-box.hero' 'border-radius' 'var(--radius-xl)'
check_block_absent 'the new chat composer is not an oversized pill' '.input-box.hero' 'border-radius' 'var(--radius-pill)'
# The suggestion list is one roomy row per command: a quiet line of text until
# it is hovered, with the command it inserts in the monospace face at the end.
check_block_property 'the suggestion list stacks its rows' '.new-chat-starters' 'flex-direction' 'column'
check_block_property 'suggestion rows keep the restrained rectangular radius' '.new-chat-starter' 'border-radius' 'var(--radius-md)'
check_block_property 'suggestion rows stay unboxed until hovered' '.new-chat-starter' 'border' '1px solid transparent'
check_block_property 'suggestion rows show the command they insert' '.new-chat-starter-token' 'font-family' 'var(--font-mono)'
check_block_property 'the row command token sits at the far end of the row' '.new-chat-starter-token' 'margin-inline-start' 'auto'
check_block_property_in_media 'a phone drops the command token before the label' 'max-width: 767px' '.new-chat-starter-token' 'display' 'none'
check 'the composer accepts the suggestion list as a footer slot' 'footer = null' "$input"
check 'the app passes the suggestion list to the composer' '<NewChatStarters' "$app"
check 'the suggestion rows are CoreZ own commands' 'insert: "@website "' "$starters"
check_absent 'the suggestion rows are not borrowed sample sentences' 'Write or edit' "$starters"
# Corez is a monochrome system: the composer's primary action is the brightest
# surface on the page, not a coloured one, and the stop button keeps its own.
check_block_property 'the send circle is the monochrome action surface' '.send-btn:not(:disabled):not(.stop-btn)' 'background' 'var(--action-strong)'
check_block_property 'the action surface is defined for the dark theme' ':root' '--action-strong' 'var(--text-primary)'
check_block_property 'the action surface is defined for the light theme' '[data-theme="light"]' '--action-strong' 'var(--text-primary)'
check_block_absent 'the composer has no borrowed accent colour' '.send-btn' 'background' 'var(--action-accent)'
check_block_property 'the stop button keeps its own background' '.send-btn.stop-btn' 'background' 'rgba(239, 68, 68, 0.18)'
# The composer carries no switches of its own: one voice affordance (the
# microphone, only where the browser can dictate) and nothing that overrides how
# the app routes a message.
check_absent 'the send circle is never a second voice control' 'voice-btn'
check_block_absent 'the composer has no thinking-effort toggle' '.think-toggle' 'opacity' '0.35'
check_absent 'no thinking-effort state reaches the request' 'thinkMode' "$app"
check_absent 'no reasoning override is sent with the message' 'requestOptions.think' 'src/services/aiService.js'
check 'the microphone is gated on browser support' 'dictationAvailable &&' "$input"
check_block_property 'an unavailable composer control is visibly disabled' '.mic-btn:disabled' 'opacity' '0.35'

# Sites: published pages are a screen of their own, reached from the sidebar, and
# the editor opens inside the card it belongs to — never a separate page, so the
# list keeps its context while a live page is being changed.
check 'the sidebar carries the Sites entry' 'sites-nav-btn' "$sidebar"
check 'the Sites entry marks the current screen' 'aria-current=\{activeView === "sites"' "$sidebar"
check 'the shell routes to the Sites screen' 'path="/sites"' "$app"
check 'the Sites screen is a labelled section' 'aria-labelledby="sites-title"' "$sites"
check 'saving sends every page of the site back' 'pages: editing.pages' "$sites"
check 'unpublishing a live link asks first' 'confirmingSlug === page.slug' "$sites"
check_block_property 'the Sites list is a stack of cards' '.sites-list' 'flex-direction' 'column'
check_block_property 'the Sites editor is monospaced like every other code surface' '.site-editor-code' 'font-family' 'var(--font-mono)'
check_block_property 'the Sites editor keeps a bounded height so the list stays reachable' '.site-editor-code' 'max-height' '60vh'
check_block_property_in_media 'the Sites screen tightens its padding on a phone' 'max-width: 767px' '.sites-page' 'padding' '1.25rem 1rem 2rem'


if (( failures > 0 )); then
  printf '%d responsive UI contract check(s) failed.\n' "$failures" >&2
  exit 1
fi

printf 'Responsive UI contract checks passed.\n'
