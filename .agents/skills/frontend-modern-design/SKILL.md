---
name: frontend-modern-design
description: Specialized skill for crafting modern, high-aesthetic web interfaces with dark/light design systems, fluid responsive layouts, glassmorphism, micro-interactions, accessibility, and modern CSS architecture.
---

# Front-End Modern Design Skill

Use this skill whenever designing, building, or refining web applications, UI layouts, interactive components, widgets, and stylesheets.

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
- **No Unstyled Placeholders**: Use rich content, SVGs, or `generate_image` assets instead of empty frames or broken image placeholders.

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
