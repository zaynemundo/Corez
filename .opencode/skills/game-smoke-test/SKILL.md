---
name: game-smoke-test
description: QA Tester skill for vitest/jsdom smoke tests covering DOM renders, canvas init, and input events.
version: 1.0.0
tags: [qa, smoke, dom, canvas, input-events, vitest]
dependencies: []
token_estimate: 150
---

## 1. Smoke Test Suite Structure

### A. DOM Renders
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';

describe('DOM Structure', () => {
  let dom: JSDOM;

  beforeEach(() => {
    dom = new JSDOM('<!DOCTYPE html><html><body><div id="game">' +
      '<canvas id="game-canvas"></canvas>' +
      '<div id="hud"><span id="score">0</span></div>' +
      '</div></body></html>');
    global.document = dom.window.document;
  });

  it('mounts game canvas', () => {
    const canvas = document.getElementById('game-canvas');
    expect(canvas).not.toBeNull();
    expect(canvas!.tagName).toBe('CANVAS');
  });

  it('renders HUD with score element', () => {
    const score = document.getElementById('score');
    expect(score).not.toBeNull();
    expect(score!.textContent).toBe('0');
  });
});
```

### B. Input Events Fire
```typescript
describe('Input Events', () => {
  it('dispatches keydown event for ArrowLeft', () => {
    const handler = vi.fn();
    window.addEventListener('keydown', handler);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].key).toBe('ArrowLeft');
  });

  it('dispatches click event on canvas', () => {
    const canvas = document.getElementById('game-canvas')!;
    const handler = vi.fn();
    canvas.addEventListener('click', handler);
    canvas.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
```

### C. Game Loop Active
```typescript
describe('Game Loop', () => {
  it('schedules requestAnimationFrame on start', () => {
    const rAF = vi.spyOn(window, 'requestAnimationFrame');
    startGame();
    expect(rAF).toHaveBeenCalledTimes(1);
  });

  it('calls update function each frame', () => {
    const update = vi.fn();
    startGame({ onUpdate: update });
    // advance one frame
    vi.advanceTimersByTime(16);
    expect(update).toHaveBeenCalled();
  });
});
```

### D. Basic Movement / Collision
```typescript
describe('Basic Mechanics', () => {
  it('player moves right on ArrowRight', () => {
    const player = { x: 100, y: 200 };
    handleInput('ArrowRight', player);
    expect(player.x).toBeGreaterThan(100);
  });

  it('player stops at wall boundary', () => {
    const player = { x: 780, y: 200 };
    const wall = { x: 800 };
    handleInput('ArrowRight', player, [wall]);
    expect(player.x).toBeLessThanOrEqual(wall.x - 20);
  });
});
```

---

## 2. Quick Pass/Fail Criteria

| Check | Pass | Fail |
|-------|------|------|
| DOM renders | All elements present | Any element missing |
| Input events | Events dispatch and handlers fire | Events not dispatched or handled |
| Game loop | rAF called, update invoked | No rAF, no update |
| Basic movement | Player position changes correctly | No movement or incorrect boundary |
| **Overall verdict** | All 4 pass | Any 1 fails → full QA pass needed |

---

## 3. When Smoke Tests Are Sufficient

Smoke tests alone are sufficient when:
- Making trivial non-functional changes (comment, config, formatting)
- Running CI on a documentation-only PR
- The change is in a purely static asset (image, font, CSS variable)

**Full QA plan + regression suite required when:**
- Game logic, physics, or collision code changes
- Input handling or state machine changes
- New features or levels added
- Any change to the canvas render pipeline

---

## 4. Test Execution Command

```bash
# Run full smoke suite
npm run test:smoke

# Run with watch mode during development
npm run test:smoke -- --watch

# Run with coverage
npm run test:smoke -- --coverage

# Expected output:
#  ✓ DOM Structure (2 tests)
#  ✓ Input Events (2 tests)
#  ✓ Game Loop (2 tests)
#  ✓ Basic Mechanics (2 tests)
#  → 8 passed, 0 failed, 0 skipped

# Exit code 0 → smoke pass
# Exit code 1 → smoke fail, escalate to full QA
```
