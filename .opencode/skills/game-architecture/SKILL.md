# game-architecture

> Technical Director skill for establishing browser game module boundaries, entity systems, and frame-rate performance guidelines.

## Frontmatter

```yaml
version: 1.0.0
tags: [game-architecture, technical-director, structure, performance, planning]
dependencies: [game-spec, game-art-direction]
token_estimate: 3200
```

## Standard Directory Structure Blueprint

Every browser game under CoreZ follows this layout:

```
src/
  game/
    core/
      main.ts              # Entry point, boot sequence
      gameloop.ts           # requestAnimationFrame loop, delta time
      statemachine.ts       # Boot -> Menu -> Playing -> Paused -> GameOver
      input.ts              # Keyboard, touch, gamepad unified input
      config.ts             # Game-wide constants (canvas size, gravity, speeds)
      types.ts              # Shared type definitions and interfaces

    entities/
      player.ts             # Player entity class
      enemies/
        enemy-base.ts       # Abstract enemy base class
        goomba.ts           # Example enemy type
        koopa.ts            # Example enemy type
      projectiles.ts        # Bullets, arrows, fireballs
      items.ts              # Power-ups, collectibles

    systems/
      physics.ts            # Gravity, velocity, acceleration integration
      collision.ts          # AABB collision detection and response
      rendering.ts          # Canvas/WebGL draw calls, camera, viewport
      particles.ts          # Particle emitter system
      animation.ts          # Sprite animation state machine
      audio.ts              # Web Audio API manager (SFX, music)
      spatial-hash.ts       # Spatial partitioning for broad-phase collision

    levels/
      level-data.ts         # Level definitions and metadata
      tilemap.ts            # Tile map loader and renderer
      parallax.ts           # Parallax background layers
      spawn-points.ts       # Enemy and item spawn configuration

    ui/
      hud.ts                # Score, lives, health bar (in-game)
      main-menu.ts          # Main menu screen
      pause-menu.ts         # Pause overlay
      game-over.ts          # Game over screen
      settings.ts           # Volume, controls settings

  assets/
    sprites/                # Generated or static SVG/PNG sprites
    audio/                  # Generated or sourced audio files
    levels/                 # JSON level data files

  __tests__/                # Mirror of src/ structure
```

## Module Boundary Rules

| Boundary | Rule |
|----------|------|
| `core/` | No imports from `entities/`, `systems/`, `ui/`. Core must be fully standalone. |
| `entities/` | May import from `core/` (types, config). Must NOT import from `systems/` directly — use event dispatch. |
| `systems/` | May import from `core/`. Must NOT import from `entities/` — operate on entity interfaces only. |
| `levels/` | May import from `core/` and `entities/`. Must NOT import from `ui/`. |
| `ui/` | May import from `core/` and `entities/` (for read-only state). Must NOT import from `systems/` or `levels/`. |
| `__tests__/` | May import from any module. Tests are the only exception to all boundary rules. |

## Interface/Contract Patterns Between Systems

### Entity-System Communication via Component Interface

```typescript
// core/types.ts
export interface Entity {
  id: string;
  position: { x: number; y: number };
  velocity: { x: number; y: number };
  size: { width: number; height: number };
  tags: Set<string>;
}

// Systems operate on entities through this interface only.
// No system should import a concrete entity class.
```

### Event Bus Pattern (Decoupled Communication)

```typescript
// core/events.ts
type GameEvent = {
  type: 'PLAYER_HIT' | 'ENEMY_DESTROYED' | 'ITEM_COLLECTED' | 'LEVEL_COMPLETE';
  payload: Record<string, unknown>;
};

class EventBus {
  private listeners: Map<string, Array<(event: GameEvent) => void>>;

  on(type: string, handler: (event: GameEvent) => void): void;
  emit(event: GameEvent): void;
  off(type: string, handler: (event: GameEvent) => void): void;
}

// Example: Player takes damage -> emits PLAYER_HIT
// HUD listens for PLAYER_HIT -> updates health display
// Audio system listens for PLAYER_HIT -> plays hurt SFX
```

### System Interface Contract

```typescript
interface GameSystem {
  readonly name: string;
  update(deltaTime: number, entities: Entity[]): void;
  render?(ctx: CanvasRenderingContext2D, camera: Camera): void;
  cleanup?(): void;
}
```

## Frame-Rate Budget Allocation

Target: 60 FPS (16.67ms per frame). Budget breakdown:

| Phase | Time Budget | % of Frame | Description |
|-------|-------------|------------|-------------|
| Input polling | 1ms | 6% | Read keyboard, touch, gamepad state |
| Physics update | 4ms | 24% | Gravity, velocity integration, collision detection |
| Entity update (AI) | 2ms | 12% | Enemy behavior, animation state transitions |
| Rendering | 8ms | 48% | Clear canvas, draw background, entities, particles, UI |
| Audio | 0.5ms | 3% | Play pending SFX, update music position |
| Overhead (GC, etc.) | 1.17ms | 7% | Frame timing, requestAnimationFrame callback overhead |

### Monitoring

```typescript
// core/gameloop.ts
const frameBudget = {
  input: 1,
  physics: 4,
  update: 2,
  render: 8,
  audio: 0.5,
};

function monitorPhase(phaseName: string, fn: () => void): void {
  const start = performance.now();
  fn();
  const elapsed = performance.now() - start;
  if (elapsed > frameBudget[phaseName]) {
    console.warn(`${phaseName} exceeded budget: ${elapsed.toFixed(2)}ms (budget: ${frameBudget[phaseName]}ms)`);
  }
}
```

If any phase consistently exceeds its budget for 10+ consecutive frames, escalate to the Technical Director for optimization.

## State Machine Design

```
                 ┌──────────┐
                 │   BOOT   │
                 └────┬─────┘
                      │ assets loaded
                      v
               ┌──────────────┐
               │    MENU      │ ◄──────────┐
               └──────┬───────┘            │
                      │ start button        │
                      v                     │
            ┌─────────────────────┐         │
            │      PLAYING        │         │
            └──┬──────────────┬───┘         │
               │              │             │
               │ pause        │ player dies │
               v              v             │
        ┌───────────┐   ┌───────────┐       │
        │  PAUSED   │   │ GAME OVER │───────┘
        └─────┬─────┘   └───────────┘  (back to menu)
              │ resume
              v
          (back to PLAYING)
```

```typescript
// core/statemachine.ts
enum GameState {
  Boot = 'BOOT',
  Menu = 'MENU',
  Playing = 'PLAYING',
  Paused = 'PAUSED',
  GameOver = 'GAME_OVER',
}

const validTransitions: Record<GameState, GameState[]> = {
  [GameState.Boot]: [GameState.Menu],
  [GameState.Menu]: [GameState.Playing],
  [GameState.Playing]: [GameState.Paused, GameState.GameOver],
  [GameState.Paused]: [GameState.Playing, GameState.Menu],
  [GameState.GameOver]: [GameState.Menu],
};

class StateMachine {
  private current: GameState = GameState.Boot;

  transition(to: GameState): void {
    if (!validTransitions[this.current].includes(to)) {
      throw new Error(`Invalid transition: ${this.current} -> ${to}`);
    }
    this.current = to;
    this.onTransition(this.current);
  }

  private onTransition(state: GameState): void {
    // EventBus.emit({ type: 'STATE_CHANGED', payload: { state } });
  }
}
```

## Performance Budget Checklist

- [ ] No `new` allocations inside the render loop (pre-allocate, object pool)
- [ ] No `map`, `filter`, `reduce` in hot paths (prefer for loops)
- [ ] No string concatenation in render loop (prefer template literals cached)
- [ ] Canvas draw calls batched where possible (< 100 per frame)
- [ ] Off-screen sprites culled (view-frustum culling)
- [ ] No `document.querySelector` or DOM access in render loop
- [ ] Particle systems cap at 200 simultaneous particles
- [ ] Spatial hash grid cell size tuned to average entity size
- [ ] Audio buffers pre-loaded and decoded at boot
- [ ] No `setTimeout` or `setInterval` for game timing (use requestAnimationFrame)
- [ ] `will-change` CSS property only on elements that actually animate
- [ ] Touch event listeners use `{ passive: true }`

## Technology Decision Framework

| Requirement | Recommendation | When to Choose Alternative |
|-------------|---------------|---------------------------|
| 2D platformer, top-down, puzzle | Canvas 2D API | Use Three.js if 3D visuals needed |
| 3D world, FPS, racing | Three.js (WebGL) | Use raw WebGL only if Three.js bundle is too large |
| Minimal bundle, simple game | Canvas 2D | Use DOM-based if game is turn-based with no real-time rendering |
| Isometric or tile-based | Canvas 2D with orthographic camera | Use PixiJS if you need WebGL batching for many sprites |
| Text-heavy (RPG dialogue) | DOM overlay on Canvas | Use full DOM if game is mostly text/choice driven |
| Physics simulation | Matter.js (2D) or Cannon.js (3D) | Write custom AABB physics for simple platformers (< 20 entities) |
| Audio | Web Audio API (AudioContext) | Use Howler.js if you need sprite sheets and cross-browser fallback |

### Default Stack Recommendation (2D Browser Game)

```
Canvas 2D API (rendering) + Matter.js (physics) + Web Audio API (sound) + requestAnimationFrame (loop)
Bundle: Vite + TypeScript (strict mode) + vitest (testing)
```

## Architectural Decision Records

For every significant architectural decision, write an ADR:

```markdown
# ADR-001: Use Canvas 2D instead of Three.js

## Context
Our game is a side-scrolling 2D platformer with sprite-based graphics.
We considered Three.js for potential 3D bonus levels.

## Decision
Use Canvas 2D API. Three.js overhead (40KB gzipped) is not justified
for a 2D game. If 3D levels are added later, they can be a separate canvas.

## Consequences
+ Smaller bundle size
+ Easier pixel-perfect collision detection
+ Direct pixel manipulation for retro effects
- Would need to migrate if 3D becomes primary
```
