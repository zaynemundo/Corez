---
name: frontend-modern-design
description: Use when asked for a modern design system, design tokens, CSS variables, light/dark themes, glassmorphism cards, responsive mobile layouts or a strict z-index layering pass. Not for bespoke brand art direction - use `frontend-design` instead.
---

# Front-End Modern Design Skill

Use this skill for deliberate system-level visual work, not every component or stylesheet edit.

> **Canonical Design Contract:** This file is the **canonical source** for design tokens (`§1`) and z-index layering (`§5`). `frontend-design`, `apple-design`, and `accessibility-expert` reference these sections — do not duplicate tables. For bespoke brand identity, use `frontend-design` as primary instead (see `capability-orchestrator: §1.1`).

## When to use

- The request asks for a modern design system, design tokens, CSS variables, or a polished UI refresh.
- You are defining light/dark themes, glassmorphism surfaces, elevation shadows, or focus rings.
- You need responsive mobile behavior: `100dvh`, safe-area insets, and overlay drawers.
- You are enforcing or repairing the z-index layering contract.

## When not to use

- The brief wants a bespoke, one-of-a-kind art direction or brand identity - use `frontend-design`.
- The work is gesture, spring, or sheet-momentum physics - use `apple-design` as a supplement.
- The task is strictly a WCAG, contrast, or screen-reader audit - use `accessibility-expert`.
- The request is game mechanics rather than application UI - use `game-development`.

---

## 1. Design Token Architecture (`index.css`)

Establish a clean, cohesive design system using CSS custom properties for colors, typography, spacing, border radii, and transitions:

```css
:root {
  /* Color Palette - Elegant Dark Monochrome */
  --bg-primary: #000000;
  --bg-secondary: #0a0a0a;
  --bg-tertiary: #141414;
  --bg-card: #0d0d0d;
  --bg-glass: rgba(10, 10, 10, 0.85);

  --border-color: rgba(255, 255, 255, 0.08);
  --border-hover: rgba(255, 255, 255, 0.22);

  --text-primary: #ffffff;
  --text-secondary: #a1a1a6;
  --text-muted: #8e8e96;

  /* Typography */
  --font-sans: -apple-system-body, ui-sans-serif, -apple-system, "system-ui", "Segoe UI", Helvetica, Arial, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;

  /* Spacing & Radii */
  --radius-xs: 6px;
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-pill: 9999px;

  /* Motion */
  --transition-fast: 0.15s cubic-bezier(0.16, 1, 0.3, 1);
  --transition-normal: 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

/* Light Theme Overrides */
[data-theme="light"] {
  --bg-primary: #ffffff;
  --bg-secondary: #f6f6f8;
  --bg-tertiary: #eeeeef;
  --bg-card: #ffffff;
  --border-color: rgba(0, 0, 0, 0.08);
  --border-hover: rgba(0, 0, 0, 0.22);
  --text-primary: #000000;
  --text-secondary: #6e6e73;
  --text-muted: #98989d;
}
```

---

## 2. Visual Excellence & Glassmorphism

- **Glass & Depth**: Combine semi-transparent backgrounds with backdrop blur (`backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);`) and subtle inset borders.
- **Card Elevation**: Use multi-layered elevation shadows (`box-shadow: 0 4px 16px rgba(0,0,0,0.15), 0 1px 4px rgba(0,0,0,0.1);`) for floating panels and modals.
- **No Unstyled Placeholders**: Use rich content, SVGs, or generated image
  assets through the `image-generation` skill instead of empty frames or
  broken image placeholders.

---

## 3. Micro-Interactions & Fluid Motion

- **Button Hover & Active Press**:
  ```css
  .btn {
    transition: background-color var(--transition-fast), border-color var(--transition-fast), transform var(--transition-fast);
  }
  .btn:hover {
    transform: translateY(-1px);
    border-color: var(--border-hover);
  }
  .btn:active {
    transform: scale(0.97);
  }
  ```
- **Focus Rings**:
  ```css
  *:focus-visible {
    outline: 2px solid var(--text-primary);
    outline-offset: 2px;
  }
  ```
- **Loading & Pulsing States**: Use subtle CSS keyframe pulses (`@keyframes thinkingDotPulse`) for dynamic AI generation or data fetching indicators.

---

## 4. Adaptive Responsive Layouts

- **Flexbox & Grid Alignment**: Build fluid containers with `min-width: 0` on flex items to prevent text and chart overflows.
- **Mobile Viewports (`max-width: 767px`)**:
  - Support `100dvh` for dynamic mobile browser address bars.
  - Utilize safe-area insets (`calc(var(--margin) + env(safe-area-inset-top, 0px))`).
  - Convert sidebars to dismissible overlay drawers with backdrop blur overlays.

## 5. Z-Index Layering Mandate (strict stacking order)

Every UI must follow the repository layering contract — declare container positions explicitly and never scatter arbitrary z-values:

| Layer | z-index | Elements |
|-------|---------|----------|
| Background | `z: 0` | page backgrounds, art, textures |
| Content | `z: 10` | main panels, cards, game canvas |
| HUD / Controls | `z: 20-30` | headers, toolbars, floating controls |
| Overlays / Modals | `z: 40-50+` | dropdowns, drawers, modals, toasts |

Rules:
- Define z-index only on positioned containers (`position: relative/absolute/fixed`), never on bare elements.
- Use increments of 10 so new layers can slot in without renumbering.
- Modals + their backdrops must share a stacking context (e.g. inside a `position: fixed` wrapper) so page content can never interleave between them.

## Verification

- Run `npm run lint` and `npm run build` after token, glass, motion, or layout changes.
- Re-check the z-index table above on every overlay, drawer, and modal before shipping.

## Related skills

- `frontend-design` - primary skill for bespoke art direction when no design system was requested.
- `apple-design` - supplemental gesture and spring motion that must respect the layering contract here.
- `accessibility-expert` - WCAG 2.2 AA checks against the token pairs defined here.
- `image-generation` - rich generated assets in place of unstyled placeholders.
