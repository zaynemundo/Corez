---
name: visual-creative
description: Use for visual inspection, image-generation direction, SVG creation, product visualization, brand identity, and art direction; do not claim unsupported background-removal or image-editing operations.
---

# Visual & Creative Production Skill

Use this skill whenever analyzing visual artwork, designing UI graphics, crafting AI image prompts, generating SVG icons, or directing visual assets.

---

## 1. Engine Delegation & Capabilities

- **Visual direction**: inspect supplied images only when an image-reading tool
  has access to their pixels, then define composition, color, typography,
  lighting, and create self-contained SVG assets. CoreZ chat attachments alone
  provide only a local thumbnail and metadata; defer to
  `file-attachment-analysis` for that boundary.
- **Image generation**: use CoreZ `POST /api/image` through the dedicated
  `image-generation` skill. The server selects the model and returns its actual
  model identifier. Do not hard-code a provider name in user-facing claims.
- **Capability boundary**: CoreZ does not implement background removal or
  arbitrary raster image editing. Offer an SVG/CSS alternative or an external
  workflow instead of claiming that operation succeeded.

---

## 2. AI Image Prompt Engineering

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
