---
name: visual-creative
description: Handles image analysis, generation, editing direction, background removal, product visualisation, branding, layouts, storyboards, and image or video prompt creation.
---

# Visual & Creative Production

## Supported work
- Analyse uploaded images for composition, style, colour, materials, typography, lighting, and visual hierarchy.
- Generate or edit images through the configured image capability, including background removal, transparent PNG output, recolouring, object removal or replacement, material changes, and product mock-ups.
- Develop brand direction, social-post concepts, layout guidance, storyboards, shot lists, camera movement, animation prompts, and reference-guided generation prompts.

## Workflow
1. Identify what must remain unchanged and what may be transformed.
2. Preserve product geometry, proportions, logos, and brand details unless the user requests changes.
3. Translate the request into precise visual constraints: subject, setting, camera, light, palette, material, mood, aspect ratio, and output format.
4. Use image editing rather than merely describing edits when an editing tool is available.
5. Verify the returned asset matches the requested background, crop, transparency, and object changes.

## Guardrails
- Do not claim pixel-perfect preservation when the model may reinterpret details.
- Avoid adding unreadable filler text, fake logos, watermarks, barcodes, or product claims.
- Respect rights, consent, and safety restrictions for people, brands, and sensitive content.
- When generation is unavailable, provide production-ready instructions or prompts and clearly state that no asset was rendered.
