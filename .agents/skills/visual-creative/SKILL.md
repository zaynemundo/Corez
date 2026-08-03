---
name: visual-creative
description: Handles image analysis, AI generation direction (FLUX 1 Schnell), background removal, product visualization, SVG vector creation, brand identity, and visual art direction.
---

# Visual & Creative Production Skill

Use this skill whenever analyzing visual artwork, designing UI graphics, crafting AI image prompts, generating SVG icons, or directing visual assets.

---

## 1. Engine Delegation & Capabilities

- **DeepSeek V4 Flash (Visual Direction Lead)**: Direct vision inspection, art direction, UI layout design, color palette curation, and SVG vector graphic creation.
- **FLUX 1 Schnell (Background & Artwork Generation)**: Primary image engine (`black-forest-labs/flux-1-schnell`) exposed by CoreZ through `POST /api/image` for background image generation, high-res texture synthesis, and visual artwork rendering. When `ASSET_BUCKET` is configured the worker returns an R2 URL; without `OPENROUTER_API_KEY` it honestly returns 503 rather than a fake image.

---

## 2. AI Image Prompt Engineering (FLUX 1 Schnell via `/api/image`)

Structure prompts with explicit visual dimensions:
```
[Subject & Action] + [Environment & Setting] + [Lighting & Mood] + [Camera & Lens Angle] + [Color Palette & Material Texture] + [Style & Aspect Ratio]
```

### Example Prompt Template:
> "Sleek obsidian dashboard widget interface resting on a reflective dark glass desk, soft ambient cyan volumetric neon backlighting, 85mm macro lens photo, shallow depth of field, minimalist dark monochrome style, high detail, 16:9 aspect ratio."

---

## 3. SVG Vector Graphic & Icon Generation

- **Clean Vector Math**: Generate self-contained, valid SVG code with crisp viewboxes (`viewBox="0 0 24 24"`), semantic `<path>`, `<circle>`, `<rect>`, and `<g>` elements.
- **Theme Variables & Inheritance**: Use `fill="currentColor"` or `stroke="currentColor"` so SVGs automatically adapt to dark/light theme changes.
- **Accessibility**: Include `role="img"` and `<title>` / `aria-label` tags for screen reader accessibility.

---

## 4. Visual Inspection & Quality Verification

1. Inspect generated assets for correct aspect ratio, background isolation, contrast, and scaling artifacts.
2. Ensure logo geometry, text legibility, and brand color palettes remain crisp across mobile and desktop displays.
