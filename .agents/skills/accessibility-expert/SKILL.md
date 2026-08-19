---
name: accessibility-expert
description: Enforces strict WCAG 2.2 AA accessibility standards across all web interfaces, components, forms, keyboard interactions, screen reader announcements, color contrast, and dynamic focus management.
---

# Accessibility Expert Skill

Enforces strict WCAG 2.2 AA accessibility standards on all generated UI elements, React/Vite components, HTML structures, and CSS styles.

## Core Accessibility Standards

### 1. Color Contrast & Visual Perception
- **Contrast Ratios**: Minimum 4.5:1 contrast ratio for normal text (< 18pt / 24px) and 3:1 for large text (>= 18pt bold or >= 24px regular).
- **Non-Text Contrast**: Ensure UI components, active states, borders, and graphical indicators have at least 3:1 contrast against adjacent backgrounds.
- **Color Independence**: Never rely solely on color to convey information (e.g., pair error text or icons with red indicators, add clear status labels to chart trends).

### 2. Keyboard Navigation & Focus Management
- **Logical Tab Order**: All interactive controls must follow DOM order (`tabindex="0"` for custom components; never use `tabindex > 0`).
- **Visible Focus Rings**: Ensure explicit focus states via `:focus-visible` with high-contrast outlines (e.g., `outline: 2px solid var(--text-primary); outline-offset: 2px;`). Never hide focus outlines without a `:focus-visible` alternative.
- **Keyboard Traps**: Ensure dialogs and modals implement focus trapping (Tabbing stays inside active modal, `Escape` key closes modal and returns focus to trigger element).
- **Shortcuts & Handlers**: All custom click handlers must support `Enter` and `Space` key triggers (`onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleAction()}`).

### 3. Screen Readers & ARIA Roles
- **Semantic HTML First**: Prefer native elements (`<button>`, `<a href>`, `<header>`, `<nav>`, `<main>`, `<aside>`, `<footer>`, `<section>`) over `div` / `span` wrappers with custom click listeners.
- **ARIA Labeling**: Provide `aria-label` or `aria-labelledby` for icon-only buttons, inputs without visible labels, and custom controls.
- **Dynamic Live Regions**: Use `role="status"` or `aria-live="polite"` for dynamic updates (loading states, toast notifications, calculation outputs, streaming text).
- **Decorative Images**: Use `aria-hidden="true"` or empty `alt=""` for purely decorative icons or illustrations.

### 4. Responsive & Motion Adaptation
- **Touch Target Size**: Interactive elements on touch viewports must have a minimum hit area of 44x44px (`min-width: 44px; min-height: 44px;`).
- **Reduced Motion**: Respect user OS preferences via `@media (prefers-reduced-motion: reduce)` by disabling non-essential transitions and animations.
- **Zoom & Text Scaling**: Ensure layouts remain usable and legible at 200% browser text zoom without clipping or horizontal overflow.

## Audit Workflow (apply to every UI change)

1. **Automated scan**: Run `npx @axe-core/cli <url>` or the browser's built-in Lighthouse accessibility audit; treat zero violations as the bar.
2. **Keyboard pass**: Tab through the page from top to bottom — every interactive control must receive focus in logical DOM order, show a visible `:focus-visible` ring, and have no focus trap (except within modals, where focus loops and `Escape` returns to the trigger).
3. **Screen reader pass**: Verify with NVDA/VoiceOver that every control has an accessible name, live regions announce dynamic updates, and no duplicate/incorrect ARIA roles exist.
4. **Contrast pass**: Measure all text and non-text UI with a contrast tool (axe covers this) against the 4.5:1 / 3:1 thresholds.
5. **Resize pass**: Test at 200% zoom and viewport widths 320px-1440px — no horizontal scroll, no clipped controls, touch targets stay >= 44x44px.
6. **Reduced motion pass**: Enable `prefers-reduced-motion: reduce` and confirm essential content remains accessible without animations.
7. **Report**: State which checks passed/failed and fix any failures before marking the task complete.

## Repository integration

- **Z-index + tokens are canonical in `frontend-modern-design: §1 & §5`** — this skill references that contract instead of redefining it. Apply Background `0` → Content `10` → HUD `20-30` → Overlays/Modals `40-50+`, increments of 10, so modals, toasts, and drawers never sit outside the expected stacking context. See `capability-orchestrator: §1.1` for when to load `frontend-design` vs `frontend-modern-design`.
- Respect the repo design tokens (`--text-primary`, `--text-secondary`, `--text-muted`, `--border-color` in `src/index.css`) when choosing colors so contrast pairs stay consistent.
- Responsive/contrast contracts are asserted by the repository's `tests/ui-responsive-contract.sh` — run it (via `npm run test:cloudflare` or directly with `bash`) before landing UI changes.
