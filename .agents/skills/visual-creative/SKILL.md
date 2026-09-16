---
name: visual-creative
description: Use when writing AI image prompts, creating SVG icons or logos, inspecting screenshots and supplied artwork, product visualization, brand identity boards or art direction. Not for running the raster image endpoints - use `image-generation` instead.
---

# Visual & Creative Production Skill

Use this skill whenever analyzing visual artwork, designing UI graphics, crafting AI image prompts, generating SVG icons, or directing visual assets.

## When to use

- The user asks for SVG icons, logos, favicons, or vector illustrations.
- You need an AI image prompt for a background, hero art, or product visual.
- Artwork or a screenshot is supplied for visual inspection or critique.
- You are defining brand identity direction such as palette, mood, and composition.

## When not to use

- The user wants a raster image generated through the CoreZ endpoints - use `image-generation`.
- The user wants a chat attachment analyzed or read - use `file-attachment-analysis`.
- The interface needs a full visual language, tokens, or responsive layout - use `frontend-design` or `frontend-modern-design`.
- The task is game art direction for a playable build - use `game-development`.

---

## 1. Engine Delegation & Capabilities

- **Visual direction**: inspect supplied images only when an image-reading tool
  has access to their pixels, then define composition, color, typography,
  lighting, and create self-contained SVG assets. CoreZ chat attachments alone
  provide only a local thumbnail and metadata; defer to
  `file-attachment-analysis` for that boundary.
- **Image generation**: use CoreZ `POST /api/image` (OpenRouter, key required)
  or the keyless Workers AI `POST /api/image/cf` (FLUX.2 klein-4b, fallback
  flux-1-schnell) through the dedicated `image-generation` skill. The server
  selects the model and returns its actual model identifier. Do not hard-code a
  provider name in user-facing claims.
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

## Verification

- Complete the §4 visual inspection pass (aspect ratio, background isolation, contrast, scaling) before delivering an asset.
- Never report success for background removal or raster editing: CoreZ does not implement background removal and that boundary stays fixed.

## Related skills

- `image-generation` - executes `POST /api/image` and the keyless `POST /api/image/cf` once the prompt is directed.
- `file-attachment-analysis` - owns the chat attachment metadata boundary this skill defers to.
- `frontend-design` - consumes SVG and image assets inside a bespoke page layout.
- `accessibility-expert` - verifies `role="img"` and `<title>` attributes on generated SVGs.
