---
name: game-asset-spec
description: Technical Artist skill for building asset-manifest.json containing required SVG sprites, animations, tilesets, and UI icons.
version: 1.1.0
tags: [asset-manifest, sprites, tilesets, backgrounds, svg, png]
dependencies: [game-art-direction]
token_estimate: 3800
---

# Game Asset Spec Skill

Generates `game-project/design/asset-manifest.json` detailing dimensions, style, prompts, and status for all required game assets.

---

## asset-manifest.json Schema

```typescript
type AssetType = 'sprite' | 'tileset' | 'background' | 'ui-icon' | 'animation';
type AssetStatus = 'planned' | 'in-progress' | 'complete' | 'needs-review';

interface AssetEntry {
  id: string;                           // unique kebab-case identifier
  type: AssetType;
  label: string;                        // human-readable name
  dimensions: {                         // in pixels
    width: number;
    height: number;
  };
  style: 'pixel-art' | 'vector-flat' | 'vector-detailed';
  palette_source?: string;              // reference to art-direction palette
  color_count?: number;                 // max distinct colors
  prompt: string;                       // generation prompt for FLUX or artist
  status: AssetStatus;
  variants?: number;                    // animation frames or rotations
  output_format: 'svg' | 'png';
  notes?: string;
}

interface AssetManifest {
  project: string;
  version: string;
  base_path: string;                    // relative asset directory
  assets: AssetEntry[];
}
```

---

## Complete Example Manifest (Platformer Game)

```json
{
  "project": "neon-ninja-runner",
  "version": "1.0.0",
  "base_path": "assets/",
  "assets": [
    {
      "id": "player-run",
      "type": "animation",
      "label": "Player Run Cycle",
      "dimensions": { "width": 32, "height": 32 },
      "style": "pixel-art",
      "palette_source": "PICO-8",
      "color_count": 8,
      "prompt": "32x32 pixel art ninja character running animation, 4 frames, side view, cyan and dark blue palette, black outline",
      "status": "planned",
      "variants": 4,
      "output_format": "svg"
    },
    {
      "id": "player-jump",
      "type": "animation",
      "label": "Player Jump",
      "dimensions": { "width": 32, "height": 32 },
      "style": "pixel-art",
      "color_count": 8,
      "prompt": "32x32 pixel art ninja mid-jump, arms spread, scarf trailing, single frame",
      "status": "planned",
      "variants": 1,
      "output_format": "svg"
    },
    {
      "id": "enemy-drone",
      "type": "sprite",
      "label": "Flying Drone Enemy",
      "dimensions": { "width": 24, "height": 24 },
      "style": "pixel-art",
      "color_count": 4,
      "prompt": "24x24 pixel art floating robot drone enemy, red glow eye, metallic gray, 2 animation frames",
      "status": "planned",
      "variants": 2,
      "output_format": "svg"
    },
    {
      "id": "tileset-city",
      "type": "tileset",
      "label": "City Background Tileset",
      "dimensions": { "width": 256, "height": 256 },
      "style": "pixel-art",
      "color_count": 12,
      "prompt": "256x256 pixel art cyberpunk city tileset, 16x16 tiles, neon signs, dark buildings, purple sky",
      "status": "planned",
      "output_format": "png"
    },
    {
      "id": "bg-neon-skyline",
      "type": "background",
      "label": "Neon Skyline Background",
      "dimensions": { "width": 640, "height": 360 },
      "style": "pixel-art",
      "color_count": 16,
      "prompt": "640x360 pixel art parallax background layer, distant neon-lit skyline, dark purple sky, stars, slow scrolling",
      "status": "planned",
      "output_format": "png"
    },
    {
      "id": "icon-health",
      "type": "ui-icon",
      "label": "Health Icon",
      "dimensions": { "width": 16, "height": 16 },
      "style": "pixel-art",
      "color_count": 3,
      "prompt": "16x16 pixel art heart icon, red and white, solid black outline",
      "status": "planned",
      "output_format": "svg"
    },
    {
      "id": "icon-coin",
      "type": "ui-icon",
      "label": "Coin Icon",
      "dimensions": { "width": 16, "height": 16 },
      "style": "pixel-art",
      "color_count": 3,
      "prompt": "16x16 pixel art gold coin icon, yellow and orange, circular",
      "status": "planned",
      "output_format": "svg"
    },
    {
      "id": "particle-spark",
      "type": "sprite",
      "label": "Spark Particle",
      "dimensions": { "width": 4, "height": 4 },
      "style": "pixel-art",
      "color_count": 2,
      "prompt": "4x4 pixel art single spark particle, bright yellow-white center",
      "status": "planned",
      "output_format": "svg"
    }
  ]
}
```

---

## Asset Naming Conventions

```
{category}-{descriptor}-{variant?}

Examples:
- player-run-01.svg
- enemy-drone-frame-a.svg
- tileset-city-01.png
- bg-neon-skyline.png
- icon-health.svg
- particle-spark.svg
```

Rules:
- Lowercase kebab-case
- No spaces or underscores
- Frame numbers: zero-padded two digits
- Type prefix for glob grouping: `player-*`, `enemy-*`, `bg-*`, `tileset-*`, `icon-*`, `particle-*`

---

## SVG vs PNG Decision Guide

| Criteria            | SVG                     | PNG                  |
|---------------------|-------------------------|----------------------|
| Pixel art           | Preferred (crispEdges)  | Acceptable           |
| Gradients / complex | Poor                    | Preferred            |
| Animation frames    | Inline `<g>` switching  | Spritesheet          |
| File size (16x16)   | ~400-800 bytes          | ~200-400 bytes       |
| Scalability         | Infinite (vector)       | Fixed resolution     |
| Backgrounds         | Not recommended         | Preferred (complex)  |
| UI icons            | Preferred               | Acceptable           |

**Recommendation**: Sprites and UI icons as SVG. Tilesets, backgrounds, and gradients as PNG.

---

## FLUX Prompt Engineering for Background Generation

Template for FLUX background generation:

```
A [STYLE] [SUBJECT], [DETAILS], [COLORS], [MOOD], [COMPOSITION]
```

Examples:
- "A pixel art cyberpunk city skyline at night, neon signs in cyan and pink, dark purple sky, distant glowing windows, side-scrolling parallax background layer"
- "A 16-bit style fantasy forest clearing, sunlight rays through leaves, green and gold palette, layered depth for parallax scrolling"

Best practices:
- Specify resolution in prompt (e.g. "640x360 pixel art")
- Reference palette colors for consistency
- Indicate "tiling" or "seamless" if used as repeatable texture
- Add "no text, no watermark, no ui elements"

---

## Asset Dimension Standards by Type

| Type        | Standard Sizes                        |
|-------------|---------------------------------------|
| Character   | 16x16, 24x24, 32x32                   |
| Enemy       | 16x16, 24x32                          |
| Tile        | 8x8, 16x16, 32x32                     |
| Tilesheet   | 128x128, 256x256, 512x512             |
| Background  | 320x180, 640x360, 960x540             |
| UI Icon     | 16x16, 24x24, 32x32                   |
| Particle    | 2x2, 3x3, 4x4, 8x8                    |
| Effect sprite | 16x16, 32x32                        |

---

## Status Tracking

| Status         | Meaning                                  |
|----------------|------------------------------------------|
| `planned`      | Asset identified, prompt written         |
| `in-progress`  | Draft created, awaiting review           |
| `complete`     | Final version approved and exported      |
| `needs-review` | Flagged as requiring art director signoff|

Transition flow: `planned` → `in-progress` → `complete` (or → `needs-review` → `complete`).

---

## Deliverable Checklist

- [ ] `asset-manifest.json` includes every required asset
- [ ] Each entry has id, type, dimensions, style, prompt, status
- [ ] Naming conventions followed (kebab-case, zero-padded frames)
- [ ] Output format chosen per decision guide
- [ ] Asset dimensions match art-direction.json sprite sizes
- [ ] FLUX prompts written for all background entries
- [ ] Status set to `planned` for all entries
- [ ] Exported to `game-project/design/asset-manifest.json`
