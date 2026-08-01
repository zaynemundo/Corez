---
name: game-performance-review
description: Technical Director skill for frame-timing audits, memory checks, and asset reviews to protect frame-rate performance.
version: 1.0.0
tags: [performance, frame-timing, memory, asset-audit, profiling]
dependencies: []
token_estimate: 200
---

## 1. Frame Timing Audit Checklist

### rAF Loop Delta Clamping
```typescript
// BAD — unbounded delta can cause physics explosion
function update(rawDelta: number) { physics.step(rawDelta); }

// GOOD — clamp delta to a max of 50ms (20 FPS minimum)
const MAX_DELTA = 50;
function update(rawDelta: number) {
  const dt = Math.min(rawDelta, MAX_DELTA);
  physics.step(dt);
}
```
- [ ] Delta clamped to [0, MAX_DELTA]
- [ ] No `Date.now()` or `performance.now()` in hot path (use rAF timestamp param)

### No Allocations in Hot Paths
- [ ] No `new` objects inside update loop
- [ ] No array spread `[...arr]` inside render or physics
- [ ] No string concatenation in render path
- [ ] Avoid `Map` / `Set` iteration in hot path (prefer arrays)

### Object Pooling for Particles / Entities
```typescript
class Pool<T> {
  private available: T[] = [];
  acquire(): T { return this.available.pop() ?? this.create(); }
  release(obj: T) { this.available.push(obj); this.reset(obj); }
}
```
- [ ] Particles use object pool (no per-frame `new Particle()`)
- [ ] Bullets/projectiles pooled
- [ ] Enemy spawns check pool before allocating

### Draw Call Batching
- [ ] Same texture sprites batched into single draw call
- [ ] No `ctx.save()`/`ctx.restore()` in per-entity loops
- [ ] Canvas `clearRect` called once per frame, not per entity
- [ ] OffscreenCanvas used for static backgrounds

---

## 2. Asset Audit

| Check | Limit | Action if Exceeded |
|-------|-------|-------------------|
| Base64 inline image size | <10KB | Move to external file |
| Individual sprite texture | <256x256 | Downscale or split |
| Total PNG/JPEG assets | <2MB combined | Optimize with tinypng |
| Audio file per asset | <200KB | Use lower bitrate OGG |
| Total asset fetch count | <50 requests | Sprite-sheet / atlasing |

---

## 3. Memory Leak Patterns

| Pattern | Detection | Fix |
|---------|-----------|-----|
| DOM nodes removed but referenced | Heap snapshot — detached DOM tree count >0 | Null references on unmount |
| Event listeners not cleaned up | `getEventListeners()` in DevTools or manual audit | `removeEventListener` in cleanup |
| rAF not cancelled on unmount | Timer tab in DevTools shows active rAF | Store rAF id, call `cancelAnimationFrame` |
| Closure retaining large objects | Heap snapshot — retainers path | Re-architect or null captured vars |
| `setInterval` without clear | Timer count grows on each level load | `clearInterval` on unmount |

---

## 4. Performance Budget Table

| System    | Budget per Frame (16ms target) | Measurement Tool               |
|-----------|-------------------------------|--------------------------------|
| Physics   | 4ms                           | `performance.now()` wrapping step |
| Render    | 8ms                           | DevTools Performance — Frames tab |
| Input     | <1ms                          | console.time / timeEnd          |
| Audio     | 2ms                           | Web Audio `currentTime` diff    |
| AI / Logic| 2ms                           | Profiler flame chart            |
| **Total** | **≤16ms**                     | rAF callback duration           |

If total exceeds 16ms consistently, reduce render budget first (most common offender).

---

## 5. Tools

### Chrome DevTools Performance Tab
1. Open DevTools → Performance
2. Click "Record" → play game for 5s → "Stop"
3. Check "Frames" section — red bars indicate dropped frames
4. Flame chart — identify functions with >4ms self time
5. Bottom-up tab — sort by "Self Time" to find hot functions

### React DevTools Profiler (if using React)
1. React DevTools → Profiler tab
2. Click record → interact → stop
3. Look for unnecessary re-renders (highlighted in yellow/red)
4. Check `why-did-you-render` logs

### Quick Audit Script
```bash
# Check for common perf anti-patterns (rg uses -g for globs; --type <name> for known types)
rg "Date\.now\(\)" src --type js
rg "new " src -g '*.js'    # allocations in hot paths
rg "ctx\.save\(\)" src --type js    # save/restore in loops
rg "\.push\(" src --type js         # array growth in hot path
```

Adjust `src`/globs to the actual game module path (per the `game-architecture` blueprint).
