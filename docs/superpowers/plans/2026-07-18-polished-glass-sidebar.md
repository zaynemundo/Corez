# Polished Glass Sidebar Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elevate the Corez left sidebar from a full-height edge-to-edge slab to a floating polished glass panel within the monochrome dark and light design system.

**Architecture:** The redesign preserves the `aside.sidebar` DOM boundary, action triggers, and collapse behaviors in `src/components/Sidebar.jsx` while replacing inline label styles with `.sidebar-section-heading`. In `src/index.css`, theme-resolved monochrome tokens, floating desktop positioning (264px width, 12px outer insets, 16px radius, 16px blur), zero-gap collapse logic, safe-area mobile drawer rules, and `@supports` fallbacks are declared. Verification is enforced via custom bash contract checks in `tests/ui-responsive-contract.sh`.

**Tech Stack:** React (JSX), Vanilla CSS Custom Properties & Media Queries, POSIX Awk & Bash Contract Testing.

## Global Constraints

1. **Strict File Scope**: The only implementation files modified across execution are:
   - `tests/ui-responsive-contract.sh` (Task 1)
   - `src/components/Sidebar.jsx` (Task 2)
   - `src/index.css` (Task 2)
2. **No Repository Extra Files or DOM Wrappers**: No wrapping elements (e.g. `.sidebar-container`) around `aside.sidebar`. No restyling of Header, Chat, Canvas, or Settings components.
3. **Strict Monochrome System**: No decorative colors, warm amber accents, or photo backgrounds.
4. **No Additional Dependencies**: No new `npm` packages, component test libraries, or icon sets.
5. **No AGY Git Commits**: AGY makes local file edits only. Codex verifies RED/GREEN states, executes `npm run lint` and `npm run build`, and handles commits/pushes per repository policy.

---

### Task 1: Extend UI Responsive Contract Test Script (RED Checkpoint)

#### Interfaces

- **Produces**: Enforced contract assertions in `tests/ui-responsive-contract.sh` (adding helper `check_block_absent` and grounded contract checks).
- **Consumes**: Existing test script infrastructure in `tests/ui-responsive-contract.sh` and current code patterns in `src/components/Sidebar.jsx` and `src/index.css`.

#### Execution Steps

- [ ] **Step 1.1**: Open `tests/ui-responsive-contract.sh` and define the `check_block_absent` helper function immediately below the existing `check_block_property` function (around line 48).

**File**: `tests/ui-responsive-contract.sh`
**Target Line**: 48

```bash
check_block_absent() {
  local description="$1"
  local selector="$2"
  local property="$3"
  local value="$4"
  local file="${5:-$css}"

  if awk -v selector="$selector" -v property="$property" -v value="$value" '
    index($0, selector) { in_block = 1 }
    in_block && index($0, property) && index($0, value) { found = 1 }
    in_block && index($0, "}") { in_block = 0 }
    END { exit found ? 0 : 1 }
  ' "$file" 2>/dev/null; then
    printf 'FAIL: %s\n' "$description" >&2
    failures=$((failures + 1))
  fi
}
```

> **Note on Awk Matching vs. Grep Regex**: `check_block_property` and `check_block_absent` use POSIX `awk` `index()` for exact literal substring matching. Arguments passed to these functions must NOT contain regex escapes (e.g., use `'var(--sidebar-margin)'`, `'rgba(255, 255, 255'`, and `'var(--sidebar-bg-opaque)'`). Regex escaping (such as `blur\(16px\)`) is retained only for `check` and `check_absent` calls which invoke `grep -E`.

- [ ] **Step 1.2**: Append contract assertions to `tests/ui-responsive-contract.sh` before line 72 (`if (( failures > 0 )); then`).

**File**: `tests/ui-responsive-contract.sh`
**Target Insertion Point**: Lines 71–72

```bash
# Polished Glass Sidebar Contract Checks
check 'sidebar section heading uses reusable class' 'className="sidebar-section-heading"' "$sidebar"
check_absent 'sidebar section headers do not use inline letterSpacing styles' 'style=\{\{.*letterSpacing' "$sidebar"
check 'sidebar width token set to 264px' '--sidebar-width: 264px;'
check 'sidebar margin token set to 12px' '--sidebar-margin: 12px;'
check 'sidebar radius token set to 16px' '--sidebar-radius: 16px;'
check 'sidebar heading size token set to 11px' '--sidebar-heading-size: 11px;'
check 'sidebar body size token set to 13px' '--sidebar-body-size: 13px;'
check 'sidebar hit target min height set to 38px' '--sidebar-item-min-height: 38px;'
check_block_property 'sidebar block consumes margin token' '.sidebar' 'margin' 'var(--sidebar-margin)'
check_block_property 'sidebar block consumes radius token' '.sidebar' 'border-radius' 'var(--sidebar-radius)'
check_block_property 'sidebar block consumes background glass token' '.sidebar' 'background-color' 'var(--sidebar-bg)'
check 'sidebar block consumes backdrop filter blur' 'backdrop-filter: blur\(16px\)'
check_block_property 'light theme overrides sidebar glass background' '[data-theme="light"]' '--sidebar-bg' 'rgba(255, 255, 255'
check 'sidebar has opaque background fallback using sidebar-bg-opaque' '@supports not \(\(backdrop-filter: blur\(1px\)\)'
check_block_property 'sidebar fallback block consumes opaque background token' 'aside.sidebar' 'background-color' 'var(--sidebar-bg-opaque)'
check_block_property 'section heading class sets 11px font size' '.sidebar-section-heading' 'font-size' 'var(--sidebar-heading-size)'
check_block_property 'active history item applies crisp inset border shadow' '.history-item.active' 'box-shadow' 'inset 0 0 0 1px'
check_block_property 'delete chat button enforces 38px minimum width' '.delete-chat-btn' 'min-width' '38px'
check_block_property 'delete chat button enforces 38px minimum height' '.delete-chat-btn' 'min-height' '38px'
check_block_property 'sidebar header collapse button enforces 38px minimum width' '.sidebar .icon-btn' 'min-width' '38px'
check_block_property 'sidebar header collapse button enforces 38px minimum height' '.sidebar .icon-btn' 'min-height' '38px'
check_absent 'no desktop 260px sidebar width override' '--sidebar-width: 260px;'
check_absent 'no laptop 230px sidebar width override' '--sidebar-width: 230px;'
check_absent 'no small laptop 210px sidebar width override' '--sidebar-width: 210px;'
check_block_absent 'sidebar container block does not use transition all' '.sidebar' 'transition' 'all'
check_block_absent 'new chat button block does not use transition all' '.new-chat-btn' 'transition' 'all'
check_block_absent 'history item block does not use transition all' '.history-item' 'transition' 'all'
check_block_absent 'delete chat button block does not use transition all' '.delete-chat-btn' 'transition' 'all'
check_block_absent 'footer action button block does not use transition all' '.footer-action-btn' 'transition' 'all'
check 'reduced motion query disables sidebar animation' '@media \(prefers-reduced-motion: reduce\)'
check 'mobile sidebar uses safe-area insets' 'env\(safe-area-inset-'
```

> **Inline Style Check Shell Quoting Explanation**: Single quoting `'style=\{\{.*letterSpacing'` safely passes `style=\{\{.*letterSpacing` to `grep -Eq`. `grep -E` treats `\{` as literal `{` characters, matching current inline single-line `style={{ ... letterSpacing: '1px' }}` declarations in `Sidebar.jsx`.

- [ ] **Step 1.3**: Run the contract test script to confirm expected RED failure state.

**Command**:
```bash
bash tests/ui-responsive-contract.sh
```

**Expected RED Output Behavior**:
The 5 scoped `check_block_absent` checks for sidebar selectors pass immediately because current sidebar CSS rules do not use `transition: all`. The remaining required checks fail against current code, producing output with failing labels including:
```text
FAIL: sidebar section heading uses reusable class
FAIL: sidebar section headers do not use inline letterSpacing styles
FAIL: sidebar width token set to 264px
FAIL: sidebar margin token set to 12px
FAIL: sidebar radius token set to 16px
FAIL: sidebar heading size token set to 11px
FAIL: sidebar body size token set to 13px
FAIL: sidebar hit target min height set to 38px
FAIL: sidebar block consumes margin token
FAIL: sidebar block consumes radius token
FAIL: sidebar block consumes background glass token
FAIL: sidebar block consumes backdrop filter blur
FAIL: light theme overrides sidebar glass background
FAIL: sidebar has opaque background fallback using sidebar-bg-opaque
FAIL: sidebar fallback block consumes opaque background token
FAIL: section heading class sets 11px font size
FAIL: active history item applies crisp inset border shadow
FAIL: delete chat button enforces 38px minimum width
FAIL: delete chat button enforces 38px minimum height
FAIL: sidebar header collapse button enforces 38px minimum width
FAIL: sidebar header collapse button enforces 38px minimum height
FAIL: no desktop 260px sidebar width override
FAIL: no laptop 230px sidebar width override
FAIL: no small laptop 210px sidebar width override
FAIL: reduced motion query disables sidebar animation
FAIL: mobile sidebar uses safe-area insets
```
*(Script exits with a non-zero status code).*

- [ ] **Stop Checkpoint**: Stop turn. Task 1 edits remain an uncommitted local checkpoint for Codex verification of RED status.

---

### Task 2: Implement Glass Sidebar Component & Styling (GREEN Checkpoint)

#### Interfaces

- **Produces**: Reusable section heading JSX in `src/components/Sidebar.jsx` and refined glass styling in `src/index.css`.
- **Consumes**: Enforced contract assertions defined in `tests/ui-responsive-contract.sh`.

#### Execution Steps

- [ ] **Step 2.1**: Replace inline label styles in `src/components/Sidebar.jsx`.

**File**: `src/components/Sidebar.jsx`
**Target Lines**: 51–53 and 75–77

**Replace Lines 51–53**:
```jsx
        <div className="sidebar-section-heading">
          Recent Conversations
        </div>
```

**Replace Lines 75–77**:
```jsx
        <div className="sidebar-section-heading">
          Executable App Samples
        </div>
```

- [ ] **Step 2.2**: Update `:root` and `[data-theme="light"]` CSS variables in `src/index.css`.

**File**: `src/index.css`
**Target Lines**: 25 (`--sidebar-width: 250px;`) and lines 38–53 (`[data-theme="light"]`)

**In `:root` (around line 25)**:
Replace `--sidebar-width: 250px;` with:
```css
  --sidebar-width: 264px;
  --sidebar-margin: 12px;
  --sidebar-radius: 16px;
  --sidebar-heading-size: 11px;
  --sidebar-heading-tracking: 0.08em;
  --sidebar-body-size: 13px;
  --sidebar-item-min-height: 38px;
  --sidebar-bg: rgba(18, 18, 20, 0.75);
  --sidebar-bg-opaque: #121214;
  --sidebar-border: rgba(255, 255, 255, 0.08);
  --sidebar-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.36), 0 2px 8px 0 rgba(0, 0, 0, 0.24);
  --sidebar-item-active-bg: rgba(255, 255, 255, 0.10);
  --sidebar-item-hover-bg: rgba(255, 255, 255, 0.05);
```

**In `[data-theme="light"]` (around line 38)**:
Add theme-resolved glass tokens inside `[data-theme="light"]`:
```css
  --sidebar-bg: rgba(255, 255, 255, 0.75);
  --sidebar-bg-opaque: #fafafa;
  --sidebar-border: rgba(0, 0, 0, 0.08);
  --sidebar-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.08), 0 2px 8px 0 rgba(0, 0, 0, 0.04);
  --sidebar-item-active-bg: rgba(0, 0, 0, 0.07);
  --sidebar-item-hover-bg: rgba(0, 0, 0, 0.035);
```

- [ ] **Step 2.3**: Update desktop sidebar rules selector-by-selector in `src/index.css`.

**File**: `src/index.css`
**Target Lines**: 122–281

**Selector `.sidebar` (lines 122–133)**:
```css
.sidebar {
  width: var(--sidebar-width);
  height: calc(100vh - (var(--sidebar-margin) * 2));
  height: calc(100dvh - (var(--sidebar-margin) * 2));
  margin: var(--sidebar-margin) 0 var(--sidebar-margin) var(--sidebar-margin);
  background-color: var(--sidebar-bg);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--sidebar-border);
  border-radius: var(--sidebar-radius);
  box-shadow: var(--sidebar-shadow);
  display: flex;
  flex-direction: column;
  transition: transform var(--transition-normal), width var(--transition-normal), margin-left var(--transition-normal), opacity var(--transition-normal);
  z-index: 20;
  flex-shrink: 0;
  visibility: visible;
  overflow: hidden;
}
```

**Selector `.sidebar.collapsed` (lines 135–140)**:
```css
.sidebar.collapsed {
  width: 0;
  margin-left: 0;
  margin-right: 0;
  border-width: 0;
  transform: translateX(-100%);
  overflow: hidden;
  visibility: hidden;
}
```

**Add Fallback Block `@supports` (immediately below `.sidebar.collapsed`)**:
```css
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  aside.sidebar {
    background-color: var(--sidebar-bg-opaque);
  }
}
```

**Selector `.sidebar-header` (lines 146–152)**:
Replace `border-bottom: 1px solid var(--border-color);` with `border-bottom: 1px solid var(--sidebar-border);`.

**Selector `.brand-icon` (lines 164–175)**:
Replace `border: 1px solid var(--border-color);` with `border: 1px solid var(--sidebar-border);`.

**Selector `.new-chat-btn` (lines 177–192)**:
```css
.new-chat-btn {
  width: calc(100% - 2rem);
  margin: 0.85rem 1rem 0.5rem 1rem;
  padding: 0.65rem 1rem;
  min-height: var(--sidebar-item-min-height);
  background: transparent;
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-weight: 500;
  font-size: var(--sidebar-body-size);
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
}
```

**Selector `.new-chat-btn:hover` (lines 194–198)**:
Replace `background: var(--bg-tertiary);` with `background: var(--sidebar-item-hover-bg);`.

**Add Class `.sidebar-section-heading` (below `.chat-history-list`)**:
```css
.sidebar-section-heading {
  padding: 0.4rem 0.5rem;
  font-size: var(--sidebar-heading-size);
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: var(--sidebar-heading-tracking);
}

.sidebar-section-heading:not(:first-child) {
  margin-top: 1.25rem;
}
```

**Selector `.history-item` (lines 209–220)**:
```css
.history-item {
  padding: 0 0.45rem 0 0.75rem;
  min-height: var(--sidebar-item-min-height);
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: var(--sidebar-body-size);
  font-weight: 400;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease, transform 0.15s ease;
}
```

**Selector `.history-item:hover` (lines 222–226)**:
```css
.history-item:hover {
  color: var(--text-primary);
  background-color: var(--sidebar-item-hover-bg);
  transform: translateX(2px);
}
```

**Selector `.history-item.active` (lines 228–232)**:
```css
.history-item.active {
  color: var(--text-primary);
  font-weight: 500;
  background-color: var(--sidebar-item-active-bg);
  box-shadow: inset 0 0 0 1px var(--sidebar-border);
}
```

**Selector `.history-title` (lines 234–239)**:
```css
.history-title {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
```

**Selector `.delete-chat-btn` (lines 241–248)**:
```css
.delete-chat-btn {
  opacity: 0;
  min-width: 38px;
  min-height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  cursor: pointer;
  transition: opacity 0.15s ease, color 0.15s ease;
}
```

**Reveal Trigger for `.delete-chat-btn` (lines 250–251)**:
```css
.history-item:hover .delete-chat-btn,
.history-item:focus-within .delete-chat-btn {
  opacity: 1;
}
.delete-chat-btn:hover {
  color: var(--text-primary);
}
```

**Selector `.sidebar-footer` (lines 253–259)**:
Replace `border-top: 1px solid var(--border-color);` with `border-top: 1px solid var(--sidebar-border);`.

**Selector `.footer-action-btn` (lines 261–275)**:
```css
.footer-action-btn {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  padding: 0.6rem 0.95rem;
  min-height: var(--sidebar-item-min-height);
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: var(--sidebar-body-size);
  font-weight: 400;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}
```

**Selector `.footer-action-btn:hover` (lines 277–280)**:
```css
.footer-action-btn:hover {
  color: var(--text-primary);
  background-color: var(--sidebar-item-hover-bg);
}
```

**Selector `.sidebar .icon-btn` (Header collapse toggle)**:
Ensure `.sidebar .icon-btn` has comfortable hit target sizing:
```css
.sidebar .icon-btn {
  min-width: 38px;
  min-height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
}
```

- [ ] **Step 2.4**: Remove legacy responsive `--sidebar-width` overrides and empty `:root` blocks in `src/index.css`.

**File**: `src/index.css`
**Target Lines**: 953–1011

**In `@media (min-width: 1440px)`**: Remove `:root { --sidebar-width: 260px; }`. Preserve layout max-width and canvas-pane rules.
**In `@media (min-width: 1024px) and (max-width: 1439px)`**: Remove `:root { --sidebar-width: 230px; }`. Preserve layout max-width and canvas-pane rules.
**In `@media (min-width: 768px) and (max-width: 1023px)`**: Remove `:root { --sidebar-width: 210px; }`. Preserve layout max-width and canvas-pane rules.

- [ ] **Step 2.5**: Update `@media (max-width: 767px)` mobile sidebar rules and append reduced motion block in `src/index.css`.

**File**: `src/index.css`
**Target Lines**: 1019–1031 and bottom of file

**Replace Mobile `.sidebar` Rules (lines 1019–1031)**:
```css
  .sidebar {
    position: fixed;
    top: calc(var(--sidebar-margin) + env(safe-area-inset-top, 0px));
    left: calc(var(--sidebar-margin) + env(safe-area-inset-left, 0px));
    width: min(86vw, 280px);
    height: calc(100vh - (var(--sidebar-margin) * 2) - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
    height: calc(100dvh - (var(--sidebar-margin) * 2) - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
    margin: 0;
    border: 1px solid var(--sidebar-border);
    border-radius: var(--sidebar-radius);
    z-index: 80;
    overflow-x: hidden;
  }

  .sidebar.collapsed {
    width: min(86vw, 280px);
    transform: translateX(calc(-100% - var(--sidebar-margin) - env(safe-area-inset-left, 0px) - 20px));
    margin-left: 0;
  }
```

**Append at end of `src/index.css`**:
```css
/* Accessibility: Reduced Motion Support */
@media (prefers-reduced-motion: reduce) {
  .sidebar,
  .new-chat-btn,
  .history-item,
  .footer-action-btn,
  .delete-chat-btn {
    transition: none !important;
    transform: none !important;
  }
}
```

- [ ] **Step 2.6**: Execute GREEN contract and build verification commands.

**Commands**:
```bash
bash tests/ui-responsive-contract.sh
npm run lint
npm run build
```

**Expected GREEN Output**:
- `bash tests/ui-responsive-contract.sh`: `Responsive UI contract checks passed.` (Exit code 0).
- `npm run lint`: Clean run with zero errors.
- `npm run build`: Production bundle compiled successfully.

---

### Manual Review Checklist

Perform manual visual inspection across breakpoints, themes, and input methods:

- [ ] **1920px & 1280px Desktop**: Sidebar renders as a floating glass panel with 12px outer insets, 264px width, 16px radius, and monochrome blur.
- [ ] **768px Tablet**: Desktop floating 264px panel is preserved without legacy 210px compression.
- [ ] **375px Mobile**: Sidebar renders as a floating overlay drawer offset by safe-area insets (`top`, `left`, `bottom`), constrained to `min(86vw, 280px)`. Backdrop click dismisses drawer cleanly.
- [ ] **Theme Switching**: Toggling between Dark and Light mode resolves glass background, border, shadow, and active highlights cleanly without color bleeding.
- [ ] **Active Edge & Hover**: Active session item shows soft glass fill with crisp `inset 0 0 0 1px` inner border. Delete button reveals on `.history-item:hover` or `.history-item:focus-within`. Long session titles truncate cleanly without overflowing. Row height remains compact (~38px) with `padding: 0 0.45rem 0 0.75rem`.
- [ ] **Keyboard Focus**: All natively focusable controls (`button` elements) display clear `:focus-visible` outlines. History `div` selection semantics remain unchanged.
- [ ] **Collapse Mechanics**: Desktop collapse leaves zero residual horizontal margin or layout gap. `visibility: hidden` prevents focus capture when collapsed.
- [ ] **Reduced Motion**: Enabling `prefers-reduced-motion: reduce` turns transforms and transitions into instantaneous state updates.

---

### Commit & Verification Policy

RED-only edits following Task 1 remain an uncommitted local checkpoint. Codex independently verifies contract outputs (RED after Task 1, GREEN after Task 2), executes `npm run lint` and `npm run build`, and performs all Git commits and pushes per repository policy. AGY does not execute `git commit` or `git push`.
