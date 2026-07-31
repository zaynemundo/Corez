---
name: game-art-direction
description: Art Director skill for defining retro color palettes, sprite themes, visual contrast, and UI styling specs.
version: 1.1.0
tags: [art-direction, palette, sprite, pixel-art, retro]
dependencies: [game-asset-spec, game-visual-review]
token_estimate: 3200
---

# Game Art Direction Skill

Generates `game-project/design/art-direction.json` establishing visual aesthetic, color palettes (PICO-8, NES, Game Boy), and 8-bit sprite guidelines.

---

## art-direction.json Schema

```typescript
interface ArtDirection {
  project: string;
  theme: 'cyberpunk' | 'fantasy' | 'retro' | 'minimalist' | 'custom';
  palette: {
    source: 'PICO-8' | 'NES' | 'GAME_BOY' | 'CUSTOM';
    colors: string[];       // hex codes, max 16 for PICO-8
    background: string;     // primary bg hex
    primary: string;        // main fg hex
    secondary: string;      // accent hex
    highlight: string;      // glow/emphasis hex
    ui_text: string;        // readable text hex
  };
  sprites: {
    default_size: number;   // 16 | 24 | 32
    grid_snap: boolean;
    crisp_edges: boolean;   // must be true for pixel art
    max_colors: number;     // per-sprite color limit
  };
  ui: {
    font_family: string;
    font_size_base: number;
    button_style: 'flat' | 'raised' | 'retro' | 'neon';
    panel_style: 'solid' | 'transparent' | 'bordered';
    border_radius: number;
    z_index_layers: {
      background: number;
      content: number;
      hud: number;
      controls: number;
      overlay: number;
      modal: number;
    };
  };
  svg: {
    shape_rendering: 'crispEdges';
    image_rendering: 'pixelated';
    viewbox_strategy: 'fixed' | 'responsive';
  };
}
```

---

## Color Palette Reference Tables

### PICO-8 Palette (16 colors)

| Index | Hex       | Name       |
|-------|-----------|------------|
| 0     | `#000000` | Black      |
| 1     | `#1D2B53` | Dark Blue  |
| 2     | `#7E2553` | Dark Purple|
| 3     | `#008751` | Dark Green |
| 4     | `#AB5236` | Brown      |
| 5     | `#5F574F` | Dark Gray  |
| 6     | `#C2C3C7` | Light Gray |
| 7     | `#FFF1E8` | White      |
| 8     | `#FF004D` | Red        |
| 9     | `#FFA300` | Orange     |
| 10    | `#FFF024` | Yellow     |
| 11    | `#00E756` | Green      |
| 12    | `#29ADFF` | Blue       |
| 13    | `#FF77A8` | Pink       |
| 14    | `#FFCCAA` | Peach      |
| 15    | `#83769C` | Lavender   |

### NES Palette (subset of 8 common)

| Hex       | Use           |
|-----------|---------------|
| `#242124` | Shadows       |
| `#484548` | Dark surfaces |
| `#6B6A6C` | Mid-tones     |
| `#929094` | Light surfaces|
| `#E3DFD9` | Highlights    |
| `#C3423F` | Red accent    |
| `#3A6B9F` | Blue accent   |
| `#6B8E3A` | Green accent  |

### Game Boy Palette (4 shades)

| Hex       | Name     |
|-----------|----------|
| `#0F380F` | Darkest  |
| `#306230` | Dark     |
| `#8BAC0F` | Light    |
| `#9BBC0F` | Lightest |

---

## Visual Theme Guides

### Cyberpunk
- **Background**: near-black (`#0a0a1a`), dark navy
- **Primary**: neon cyan (`#00fff7`), hot pink (`#ff007f`)
- **Highlight**: electric blue glow, scan-line overlays
- **UI**: sharp corners, thin borders, glitch text effects
- **Typography**: monospace or sci-fi sans (e.g. "Orbitron")

### Fantasy
- **Background**: deep purple (`#1a0a2e`) or forest green
- **Primary**: gold (`#ffd700`), royal blue, crimson
- **Secondary**: warm amber, soft teal
- **UI**: curved panels, parchment tones, ornate borders
- **Typography**: serif or fantasy (e.g. "MedievalSharp")

### Retro (8-bit / 16-bit)
- **Background**: solid dark (`#000000` or `#1D2B53`)
- **Primary**: bright saturated (PICO-8 index 7-14)
- **UI**: chunky borders, single-pixel outlines
- **Typography**: pixel bitmap (e.g. "Press Start 2P", "Silkscreen")

### Minimalist
- **Background**: off-white (`#f5f5f0`) or dark gray (`#1a1a1a`)
- **Primary**: single accent color, one highlight
- **UI**: flat, thin lines, generous negative space
- **Typography**: clean sans (e.g. "Inter", "IBM Plex Sans")

---

## Sprite Dimension Guidelines

| Size   | Best For              | Canvas (px) | Grid Snap |
|--------|-----------------------|-------------|-----------|
| 16x16  | Small characters, items, particles | 256x256 tileset | Yes |
| 24x24  | Medium characters, enemies         | 384x384 tileset | Yes |
| 32x32  | Large characters, bosses, UI icons | 512x512 tileset | Yes |

- Always use integer scaling (1x, 2x, 3x, 4x) for pixel art.
- Set `shape-rendering: crispEdges` and `image-rendering: pixelated` in CSS.
- Maintain 1px visible separation between sprite cells in spritesheet/tileset layouts.

---

## SVG Rendering Requirements

```svg
<svg xmlns="http://www.w3.org/2000/svg"
     shape-rendering="crispEdges"
     viewBox="0 0 16 16">
  <!-- pixel content -->
</svg>
```

```css
canvas, img, svg {
  image-rendering: pixelated;
  image-rendering: -moz-crisp-edges;
  image-rendering: crisp-edges;
}
```

---

## UI Styling Direction

| Element    | Retro Style           | Modern Style          |
|------------|-----------------------|-----------------------|
| Font       | `'Press Start 2P'`    | `'Inter', sans-serif` |
| Button     | Raised, 2px border    | Flat, 4px radius      |
| Panel      | Solid bg, 2px border  | Glassmorphism (backdrop-filter) |
| Dialog     | Centered, dark overlay| Centered, blur-bg overlay |

---

## Deliverable Checklist

- [ ] `art-direction.json` with all fields populated
- [ ] Palette constrained to chosen source palette
- [ ] Sprite size documented and consistent
- [ ] SVG crispEdges rendering verified
- [ ] UI font, button, panel styles defined
- [ ] z-index layer map produced
- [ ] Exported to `game-project/design/art-direction.json`
