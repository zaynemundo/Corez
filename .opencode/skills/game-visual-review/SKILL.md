---
name: game-visual-review
description: Visual Specialist skill for inspecting actual captured game screenshots against art-direction.json.
version: 1.1.0
tags: [visual-review, qa, screenshot, compliance, art-direction]
dependencies: [game-art-direction, game-asset-spec]
token_estimate: 3400
---

# Game Visual Review Skill

Evaluates captured screenshot files from project review directories against `art-direction.json` and outputs structured findings.

---

## Review Process: Capture → Compare → Report

```
step 1: CAPTURE
  ├── Load game in browser at target resolution
  ├── Capture screenshot → `review/screenshots/{scene}-{timestamp}.png`
  └── Record: viewport size, scene description, timestamp

step 2: COMPARE
  ├── Reference `game-project/design/art-direction.json`
  ├── Open capture in image viewer / pixel analysis tool
  └── Check each compliance category below

step 3: REPORT
  └── Write structured findings → `review/findings/{scene}-review.json`
```

---

## Art-Direction Compliance Checklist

### 1. Color Palette Matching

- [ ] Every visible color in the screenshot exists in the declared palette
- [ ] Background color matches `palette.background` declared value
- [ ] Text color contrast ratio >= 4.5:1 against its background (WCAG AA)
- [ ] No out-of-palette colors in sprite regions
- [ ] Highlight/glow effects use `palette.highlight`

Test: Sample at least 5 pixels from background, 5 from sprites, 5 from UI. Compare hex values against allowed palette set.

### 2. Sprite Fidelity

- [ ] Sprite dimensions match `sprites.default_size` declaration
- [ ] Edges are sharp — no anti-aliasing blur on pixel art
- [ ] Pixel grid alignment: sprites occupy integer pixel positions
- [ ] Sprite color count <= `sprites.max_colors`
- [ ] No unintended banding or color bleeding
- [ ] Animation frames are consistent in style and palette

Test: Zoom to 400-800% in image viewer. Verify individual pixel placement is intentional (no half-pixel offsets, no sub-pixel anti-aliasing blur).

### 3. UI Consistency

- [ ] Font family matches `ui.font_family` declaration
- [ ] Base font size matches `ui.font_size_base`
- [ ] Button style matches `ui.button_style` (flat/raised/retro/neon)
- [ ] Panel style matches `ui.panel_style` (solid/transparent/bordered)
- [ ] Border radius values consistent with `ui.border_radius`
- [ ] All interactive elements have consistent hover/active states

### 4. Visual Hierarchy (z-index / Layering)

- [ ] Background renders at z-index layer `ui.z_index_layers.background`
- [ ] Game content renders above background layer
- [ ] HUD elements render above game content
- [ ] Controls/buttons render above HUD
- [ ] Overlays (pause, dialog) render above all game content
- [ ] Modals render at highest layer
- [ ] No z-index collisions or elements clipping through wrong layers

---

## Structured Findings Output Format

Output file: `review/findings/{scene}-review.json`

```json
{
  "review": {
    "scene": "level-1-gameplay",
    "screenshot": "review/screenshots/level-1-gameplay-20250730.png",
    "art_direction_ref": "game-project/design/art-direction.json",
    "timestamp": "2025-07-30T14:30:00Z",
    "result": "FAIL",
    "findings": [
      {
        "file": "review/screenshots/level-1-gameplay-20250730.png",
        "severity": "error",
        "category": "palette",
        "description": "Sprite region at (120, 84) contains color #ff00ff which is not in declared PICO-8 palette",
        "expected": "#ff77a8 or #ff004d",
        "actual": "#ff00ff"
      }
    ],
    "summary": {
      "total": 3,
      "errors": 1,
      "warnings": 2,
      "passes": 5
    }
  }
}
```

Severity levels:
| Severity   | Meaning                                      |
|------------|----------------------------------------------|
| `error`    | Breaks spec, must fix before release         |
| `warning`  | Deviates from spec but not blocking          |
| `info`     | Observation, non-blocking suggestion         |

---

## Common Visual Regressions

| Issue                          | Likely Cause                             |
|--------------------------------|------------------------------------------|
| Anti-aliased sprite edges      | `image-rendering` CSS missing            |
| Wrong background color         | Palette source mismatch                  |
| Font mismatch                  | Web font not loaded or fallback active   |
| UI element overlaps game layer | z-index layer map not implemented        |
| Color banding in gradient      | PNG saved at low bit depth               |
| Blurry scaled sprite           | Non-integer scale or missing crispEdges  |
| Missing hover state            | CSS `:hover` pseudo-class not styled     |
| Pixel misalignment             | Sprite position not rounded to integer   |

---

## Pass/Fail Criteria

| Result | Condition                                                       |
|--------|-----------------------------------------------------------------|
| PASS   | Zero errors. Warnings <= 3. All mandatory checklist items pass. |
| FAIL   | One or more errors, or >3 warnings, or any critical failure.    |

Critical failures (immediate FAIL):
- Out-of-palette color detected
- Font unreadable (contrast < 3:1)
- z-index layer violation causing occlusion
- Sprite dimensions off by more than 1px
- HUD element completely invisible

---

## Deliverable Checklist

- [ ] Screenshots captured for each distinct scene/game state
- [ ] Palette compliance checked for all screenshots
- [ ] Sprite fidelity verified at 400%+ zoom
- [ ] UI consistency verified against art-direction spec
- [ ] z-index layering confirmed no overlaps
- [ ] Findings JSON written to `review/findings/{scene}-review.json`
- [ ] Pass/fail result documented
- [ ] Regressions communicated to development team
