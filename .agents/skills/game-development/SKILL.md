---
name: game-development
description: Specialized skill for designing and implementing complete 2D/3D web games, interactive physics sandboxes, and arcade engines.
---

# Game Development Skill

Use this skill whenever creating, debugging, or enhancing interactive web games, canvas arcade engines, or physics simulators.

## Core Principles

1. **Complete Game Loops**:
   - Always implement real-time game loops using `requestAnimationFrame` or controlled `setInterval` updates.
   - Ensure clean frame timing, delta-time calculations, and smooth rendering.

2. **Player Controls & Physics**:
   - Support multiple input methods: Keyboard (Arrow keys, Space, WASD), Mouse, and Touch/Mobile gestures.
   - Include realistic physics (gravity, velocity, acceleration, friction, bound collisions).

3. **State Management & UI**:
   - Maintain clear game states: `START`, `PLAYING`, `PAUSED`, and `GAME_OVER`.
   - Provide visible score tracking, high score retention, game-over overlays, and instant restart buttons.

4. **Visual Polish, Art Direction & Backgrounds**:
   - Route vision, art direction, UI layout, and game sprite/SVG design to **MiMo V2.5**.
   - Use **FLUX 1** (`@cf/black-forest-labs/flux-1-dev` / `schnell`) for free background image generation and visual game assets.
   - Add visual feedback for hits, score milestones, and collisions.
   - Scale canvas responsively to fit the viewport or container.

5. **Word Games & Dictionaries (Scrabble, Wordle, Crosswords, Boggle)**:
   - Always embed a comprehensive English word dictionary (at least 300+ valid words in a `Set` or `Array`).
   - Implement strict word verification logic: check user entries against the embedded dictionary.
   - Accept valid words, reject invalid entries with clear feedback ("Not in word list!"), and calculate accurate score multipliers (tile points, double/triple word/letter bonuses).
