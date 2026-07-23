---
name: game-development
description: Specialized skill for designing, implementing, and optimizing complete 2D/3D web games, canvas engines, physics simulators, and word games with dictionary validation.
---

# Game Development Skill

Use this skill whenever creating, debugging, or enhancing interactive web games, HTML5 Canvas engines, physics simulators, or word puzzle games.

```
  ┌─────────────────────────────────────────────────────────────┐
  │  GAME ENGINE ARCHITECTURE                                  │
  │  1. Input Manager (Keyboard, Touch, Gamepad)                │
  │  2. Game Loop (rAF, Delta-Time Update, Fixed Step)          │
  │  3. Physics & Collision System (AABB / Circle SAT)          │
  │  4. Render Pipeline (Canvas 2D / WebGL / SVG)               │
  │  5. Game State & Score Persistence (LocalStorage)            │
  └─────────────────────────────────────────────────────────────┘
```

---

## 1. Game Loop & Delta-Time Architecture

Always use `requestAnimationFrame` with delta-time (`dt`) calculation for framerate-independent motion:

```js
let lastTime = performance.now();

function gameLoop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.1); // Clamp dt to max 100ms
  lastTime = now;

  if (gameState === 'PLAYING') {
    update(dt);
    render();
  }

  requestAnimationFrame(gameLoop);
}

function update(dt) {
  // Update entity positions using velocity * dt
  player.x += player.vx * dt;
  player.y += player.vy * dt;
}
```

---

## 2. Input Manager & Control Mapping

- **Keyboard & Touch Support**: Map `WASD`, Arrow keys, `Space`, and touch swipe/tap gestures to unified actions (`UP`, `DOWN`, `LEFT`, `RIGHT`, `ACTION`).
- **Prevent Page Scroll**: Prevent default browser scrolling on arrow keys and `Space` when the game canvas is active (`e.preventDefault()`).

---

## 3. Physics & Collision Detection

- **Axis-Aligned Bounding Box (AABB)**:
  ```js
  function checkAABB(rect1, rect2) {
    return (
      rect1.x < rect2.x + rect2.width &&
      rect1.x + rect1.width > rect2.x &&
      rect1.y < rect2.y + rect2.height &&
      rect1.y + rect1.height > rect2.y
    );
  }
  ```
- **Circle Collision**:
  ```js
  function checkCircleCollision(c1, c2) {
    const dx = c1.x - c2.x;
    const dy = c1.y - c2.y;
    const distance = Math.hypot(dx, dy);
    return distance < c1.radius + c2.radius;
  }
  ```

---

## 4. Word Games & Dictionary Validation (Scrabble, Wordle, Boggle)

- **Embedded Word Lists**: Always embed a robust dictionary (Set of valid 3–8 letter words) directly in the game file:
  ```js
  const VALID_WORDS = new Set(['APPLE', 'BEACH', 'CLOUD', 'DREAM', 'EAGLE', 'FLAME', 'GRAPE', 'HEART', 'LIGHT', 'OCEAN', 'PLANT', 'RIVER', 'SOLAR', 'TIGER', 'WORLD']);
  ```
- **Verification & Feedback**:
  - Check user submissions against `VALID_WORDS.has(word.toUpperCase())`.
  - Provide immediate visual feedback ("Valid word +50 pts!", "Not in dictionary!").
  - Calculate tile score multipliers (Double Letter, Triple Word bonuses).

---

## 5. Visual Art & Background Rendering

- **MiMo V2.5**: Route game layout, vector SVG sprite generation, and art direction to MiMo V2.5.
- **FLUX 1 Backgrounds**: Use FLUX 1 (`@cf/black-forest-labs/flux-1-dev` / `schnell`) for rich background graphics and environment textures.
- **Particle Effects & Juiciness**: Add visual particle explosions, screen shakes, hit pauses, and score popups on collisions or milestones.
