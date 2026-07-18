# Corez Sidebar Floating Polished Glass Redesign Specification

**Status**: For User Review
**Date**: 2026-07-18
**Author**: AGY
**Target Components**: `src/components/Sidebar.jsx` & `src/index.css`

---

## 1. Objective

Provide a concise, implementation-ready visual redesign specification for the Corez left sidebar. The redesign adapts a floating polished glass aesthetic into Corez's monochrome dark and light visual system. The primary goal is to elevate visual aesthetics, spatial hierarchy, and typographic restraint while preserving all existing sidebar capabilities, structure, interactive semantics, and state behaviors.

---

## 2. Visual Principles

1. **Floating Polished Glass**: Transition from a full-height edge-to-edge sidebar slab to a floating glass panel with subtle outer margins/insets, gentle rounded corners, soft monochrome translucency, backdrop blurring, refined borders, and restrained elevation shadows.
2. **Monochrome Rigor**: Maintain strictly monochrome tokens across both dark and light themes. Avoid warm amber tones, decorative hued accents, or background photography.
3. **Typographic Restraint**: Employ smaller, crisp typography with distinct visual hierarchy—uppercase tracked section headers (~10-11px) and refined menu item text (~12-13px)—while maintaining accessible minimum touch/click hit targets (≥ 36–40px).
4. **Calm Spacing & Soft Depth**: Use consistent visual rhythm and reusable utility classes (`.sidebar-section-heading`) with soft active item glass highlights and subtle hover luminance shifts.
5. **Frictionless Continuity**: Keep all current component content, session lists, sample app triggers, action buttons, theme toggles, modal triggers, and accessibility behaviors untouched.

---

## 3. Exact Scope & Non-Goals

### In-Scope
- Restyling the left `Sidebar` component rendered in `src/components/Sidebar.jsx` within its existing `aside.sidebar` DOM boundary.
- Updating and declaring theme-resolved CSS custom properties, utility classes, and layout selectors in `src/index.css`.
- Layout adjustments for floating desktop panel positioning and mobile overlay panel positioning using dynamic viewport units and safe-area insets.

### Non-Goals / Out-of-Scope
- No modifications or restyling to the header, top navigation, main chat surface, settings modal, or canvas workspace.
- No addition of wrapper elements around `aside.sidebar` (such as `sidebar-container` or `sidebar-floating`).
- No addition of icon-only navigation rails, nested collapsible trees, or new sidebar content/features.
- No inclusion of warm amber accents, background imagery, gradients outside monochrome palettes, or decorative photo backgrounds.
- No altering of session management logic, state hooks, or component data flow.

---

## 4. Component Structure

The existing DOM boundary `aside.sidebar` in `src/components/Sidebar.jsx` is strictly preserved. The only required JSX structural change is replacing the two inline-styled section label `div`s with a reusable CSS class name (`.sidebar-section-heading`). Additional markup is not anticipated and would require design review.

```
[aside.sidebar]
 ├── [Header / Brand Region]
 │    ├── Brand Logo & Title
 │    └── Desktop Collapse Toggle / Mobile Close Trigger
 ├── [Primary Action Region]
 │    └── New Chat Button
 ├── [Scrollable Nav Content] (.chat-history-list)
 │    ├── [Section: Recent Sessions]
 │    │    ├── Reusable Section Heading (.sidebar-section-heading)
 │    │    └── Session Item List (with active highlight & delete trigger)
 │    └── [Section: Executable Sample Apps]
 │         ├── Reusable Section Heading (.sidebar-section-heading)
 │         └── Sample App Cards / Items
 └── [Footer Region]
      ├── Theme Toggle (Dark / Light)
      └── Settings Modal Trigger
```

---

## 5. Style & Token Changes (`src/index.css`)

### Theme-Resolved Design Tokens

Custom properties are declared with dark theme defaults in `:root` and overridden under `[data-theme="light"]`:

```css
:root {
  /* Layout & Geometry */
  --sidebar-width: 264px;
  --sidebar-margin: 12px;
  --sidebar-radius: 16px;

  /* Shared Typography & Touch Targets */
  --sidebar-heading-size: 11px;
  --sidebar-heading-tracking: 0.08em;
  --sidebar-body-size: 13px;
  --sidebar-icon-size: 16px;
  --sidebar-item-min-height: 38px;

  /* Theme-Resolved Dark Glass Tokens (Default) */
  --sidebar-bg: rgba(18, 18, 20, 0.75);
  --sidebar-bg-opaque: #121214;
  --sidebar-border: rgba(255, 255, 255, 0.08);
  --sidebar-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.36), 0 2px 8px 0 rgba(0, 0, 0, 0.24);
  --sidebar-item-active-bg: rgba(255, 255, 255, 0.10);
  --sidebar-item-hover-bg: rgba(255, 255, 255, 0.05);
}

[data-theme="light"] {
  /* Theme-Resolved Light Glass Overrides */
  --sidebar-bg: rgba(255, 255, 255, 0.75);
  --sidebar-bg-opaque: #fafafa;
  --sidebar-border: rgba(0, 0, 0, 0.08);
  --sidebar-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.08), 0 2px 8px 0 rgba(0, 0, 0, 0.04);
  --sidebar-item-active-bg: rgba(0, 0, 0, 0.07);
  --sidebar-item-hover-bg: rgba(0, 0, 0, 0.035);
}
```

### Key Styling Rules
- **Panel Surface**: Translucent background (`var(--sidebar-bg)`) with monochrome blur (`backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);`), outer border (`1px solid var(--sidebar-border)`), box shadow (`var(--sidebar-shadow)`), and rounded corners (`var(--sidebar-radius)`). Saturation enhancement is omitted.
- **Section Headings**: Styled via `.sidebar-section-heading` with uppercase transformation, `10-11px` font size, muted opacity, and letter-spacing (`0.08em`). All inline style attributes for section labels are removed.
- **Interactive Items**: Enforce `min-height: var(--sidebar-item-min-height)` to guarantee touch/click hit targets between 36–40px, even with 12–13px typography. Active items feature soft monochrome glass highlights; hover states apply subtle background luminance shifts or quiet 1px translation.
- **Transitions**: Animated property changes use explicit property declarations (`transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease, transform 0.15s ease, opacity 0.15s ease;`) rather than `transition: all`.

---

## 6. Desktop & Mobile Layout Behavior

### Desktop Layout
- **Dimensions**: Fixed width of ~264px.
- **Positioning**: Floating panel offset by `--sidebar-margin` (12px) from the viewport's top, left, and bottom edges.
- **Height Calculation**: Full height calculated with `100dvh` and a `100vh` fallback:
  ```css
  height: calc(100vh - (var(--sidebar-margin) * 2));
  height: calc(100dvh - (var(--sidebar-margin) * 2));
  ```
- **Outer Corners**: Smooth `16px` border-radius.
- **Collapse Behavior**: Existing desktop collapse mechanism toggles sidebar visibility without altering state contracts or layout triggers.

### Mobile Overlay Layout
- **Positioning**: Near-full-height overlay panel floating above the main viewport using clean, non-overconstrained positioning (top/left offsets plus computed height):
  ```css
  top: calc(12px + env(safe-area-inset-top, 0px));
  left: calc(12px + env(safe-area-inset-left, 0px));
  height: calc(100vh - 24px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
  height: calc(100dvh - 24px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
  ```
- **Backdrop & Dismissal**: Preserves existing dimming backdrop overlay. Existing backdrop click and `Escape` key close semantics are fully maintained, and existing action close behavior remains unchanged.
- **Clipping Prevention**: `overflow-x: hidden` on the panel container ensures zero horizontal content clipping during open/close transitions.

---

## 7. State & Interaction Behavior

1. **Active State**: Highlighted with soft semi-transparent monochrome glass overlay (`var(--sidebar-item-active-bg)`), crisp inner border/outline, and primary text contrast.
2. **Hover State**: Quiet background luminance adjustment and optional subtle translation (`transform: translateX(2px)`).
3. **Focus State**: Clear `:focus-visible` outline (`2px solid currentColor` with offset) to ensure strict keyboard navigation accessibility.
4. **Delete Session Action**: Inline session delete button appears on item hover/focus, maintaining clear click target spacing without overflowing session title text.
5. **Theme Switching**: Theme tokens update cohesively without requiring shadow animation when toggling between monochrome dark and light modes.

---

## 8. Accessibility & Browser Fallback

- **Backdrop Blur Fallback**: For browsers lacking backdrop filter support, style rules fall back to an opaque high-contrast monochrome surface (`var(--sidebar-bg-opaque)`):
  ```css
  @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
    aside.sidebar {
      background-color: var(--sidebar-bg-opaque);
    }
  }
  ```
- **Contrast Ratios**: Body text (12–13px) and secondary labels maintain minimum WCAG AA contrast ratios (≥ 4.5:1) against active and inactive glass backgrounds.
- **Touch / Click Targets**: Interactive menu items, delete icons, theme toggle, and settings triggers enforce `min-height: 38px` and `min-width: 38px` padding wrappers.
- **Reduced Motion**: Under `@media (prefers-reduced-motion: reduce)`, all position translations, scale shifts, and backdrop filter transitions are disabled in favor of instantaneous opacity toggles.

---

## 9. Test & Verification Approach

- **Automated Test Inspection**: Implementation planning will inspect existing test scripts and configuration files in the repository. Only configured automated test suites will be run during implementation, and any absent test coverage will be explicitly reported.
- **Manual Verification**: Visual and interactive verification will be performed via manual audits covering:
  1. Desktop floating panel geometry (~264px width, 12px margins, 16px radius) and mobile safe-area insets across viewports (375px, 768px, 1280px, 1920px).
  2. Theme consistency in both dark and light modes via the existing manual theme toggle.
  3. Keyboard focus visibility (`:focus-visible`), tab navigation order, and Escape key dismissal semantics.

---

## 10. Acceptance Criteria

- [ ] Desktop sidebar renders as a floating monochrome glass panel (~264px width, 12px margins, 16px border-radius, soft elevation shadow, monochrome backdrop blur).
- [ ] Height calculations use `100dvh` with a `100vh` fallback and account for mobile safe-area insets (`env(safe-area-inset-*)`).
- [ ] Visual design remains strictly monochrome in both dark and light themes using theme-resolved tokens in `:root` and `[data-theme="light"]`.
- [ ] Structural DOM boundary remains `aside.sidebar` without inventing extra wrapper elements; inline styles on section labels are replaced with `.sidebar-section-heading`.
- [ ] Visible typography is updated (uppercase section headers ~10-11px with tracking, body ~12-13px) while interactive touch/click hit targets remain ≥ 36–40px.
- [ ] All property animations use explicit transitions (`background-color`, `border-color`, `color`, `transform`, `opacity`) instead of `transition: all`.
- [ ] Mobile drawer preserves existing backdrop click and `Escape` key close semantics, with existing action close behavior remaining unchanged.
- [ ] Backdrop blur fallback renders a solid opaque surface (`var(--sidebar-bg-opaque)`) when `-webkit-backdrop-filter` / `backdrop-filter` is unsupported.
- [ ] Implementation scope is strictly limited to `Sidebar.jsx` and `index.css` unless planning discovers a required existing test update.

---

## 11. Risks & Mitigation

| Risk | Mitigation |
| :--- | :--- |
| Low contrast on semi-transparent glass backgrounds in varying light modes | Hardcode fallback opaque background values (`var(--sidebar-bg-opaque)`) ensuring compliant WCAG AA contrast for text tokens. |
| Touch target compromise due to smaller visible typography (12–13px) | Decouple visual text sizing from hit box padding, enforcing `min-height: 38px` on container elements. |
| Horizontal overflow on mobile devices during drawer transitions | Apply `overflow-x: hidden` to mobile drawer container and account for safe-area insets. |
