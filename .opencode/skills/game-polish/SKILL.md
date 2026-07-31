---
name: game-polish
description: Technical Artist & UI Programmer skill for particle effects, screen shake, audio feedback, and UI micro-animations.
version: 1.1.0
tags: [juice, particles, screen-shake, tweening, audio, css-transitions]
dependencies: [game-implement, game-art-direction]
token_estimate: 4200
---

# Game Polish Skill

Adds visual juice, hit-stop effects, screen shake, particle explosions, and smooth UI transitions.

---

## Juice Implementation Patterns

### 1. Screen Shake (Exponential Decay)

```typescript
interface ShakeConfig {
  intensity: number;   // initial magnitude in pixels
  decay: number;       // multiplier per frame (0.85 - 0.95)
  duration: number;    // max frames
}

class ScreenShake {
  private intensity = 0;
  private decay = 0.9;
  private active = false;

  trigger(config: Partial<ShakeConfig> = {}): void {
    this.intensity = config.intensity ?? 8;
    this.decay = config.decay ?? 0.9;
    this.active = true;
  }

  update(): { x: number; y: number } | null {
    if (!this.active) return null;
    const offset = {
      x: (Math.random() - 0.5) * 2 * this.intensity,
      y: (Math.random() - 0.5) * 2 * this.intensity,
    };
    this.intensity *= this.decay;
    if (this.intensity < 0.5) this.active = false;
    return offset;
  }
}
```

Apply to canvas via `ctx.translate(offset.x, offset.y)` before drawing, or to a DOM container via `transform: translate()`.

### 2. Hit-Stop / Freeze Frame

```typescript
class HitStop {
  private remaining = 0;

  trigger(frames: number = 4): void {
    this.remaining = frames;
  }

  update(dt: number): boolean {
    if (this.remaining <= 0) return false;
    this.remaining -= dt;
    return true; // returns true = freeze game logic
  }
}
```

Usage in game loop:
```typescript
if (hitStop.update(dt)) return; // skip update, still render
```

### 3. Particle Emitter System

```typescript
interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  size: number;
  color: string;
  alpha: number;
}

class ParticleEmitter {
  private pool: Particle[] = [];
  private active: Particle[] = [];
  private poolSize = 200;

  constructor() {
    for (let i = 0; i < this.poolSize; i++) {
      this.pool.push(this.createParticle());
    }
  }

  private createParticle(): Particle {
    return { x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, size: 0, color: '', alpha: 1 };
  }

  emit(x: number, y: number, count: number, config: {
    speed?: [number, number];
    angle?: [number, number];  // radians
    life?: [number, number];
    size?: [number, number];
    colors?: string[];
  }): void {
    for (let i = 0; i < count; i++) {
      const p = this.pool.pop() ?? this.createParticle();
      const angle = randBetween(config.angle?.[0] ?? 0, config.angle?.[1] ?? Math.PI * 2);
      const speed = randBetween(config.speed?.[0] ?? 20, config.speed?.[1] ?? 80);
      p.x = x; p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.maxLife = randBetween(config.life?.[0] ?? 20, config.life?.[1] ?? 60);
      p.life = p.maxLife;
      p.size = randBetween(config.size?.[0] ?? 2, config.size?.[1] ?? 6);
      p.color = config.colors?.[Math.floor(Math.random() * config.colors.length)] ?? '#ffffff';
      p.alpha = 1;
      this.active.push(p);
    }
  }

  update(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 200 * dt; // gravity
      p.life -= dt;
      p.alpha = Math.max(0, p.life / p.maxLife);
      if (p.life <= 0) {
        this.active.splice(i, 1);
        this.pool.push(p);
      }
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    for (const p of this.active) {
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }
}

function randBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
```

### 4. Tween / Easing Functions

```typescript
// All take t (0..1) and return eased value (0..1)
const Easing = {
  linear:        (t: number) => t,
  easeInQuad:    (t: number) => t * t,
  easeOutQuad:   (t: number) => t * (2 - t),
  easeInOutQuad: (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  easeOutBack:   (t: number) => { const c = 1.7; return 1 + c * (t - 1) ** 3 + c * (t - 1) ** 2; },
  bounce:        (t: number) => {
    if (t < 1 / 2.75) return 7.5625 * t * t;
    if (t < 2 / 2.75) { t -= 1.5 / 2.75; return 7.5625 * t * t + 0.75; }
    if (t < 2.5 / 2.75) { t -= 2.25 / 2.75; return 7.5625 * t * t + 0.9375; }
    t -= 2.625 / 2.75; return 7.5625 * t * t + 0.984375;
  },
  elastic:       (t: number) => 2 ** (-10 * t) * Math.sin((t - 0.075) * (2 * Math.PI) / 0.3) + 1,
};

class Tween {
  static to(obj: any, props: Record<string, number>, duration: number, easing = Easing.easeOutQuad): Promise<void> {
    const start = { ...props };
    for (const k in props) start[k] = obj[k];
    const startTime = performance.now();
    return new Promise(resolve => {
      function tick() {
        const elapsed = (performance.now() - startTime) / 1000;
        const t = Math.min(elapsed / duration, 1);
        const e = easing(t);
        for (const k in props) obj[k] = start[k] + (props[k] - start[k]) * e;
        if (t >= 1) resolve();
        else requestAnimationFrame(tick);
      }
      tick();
    });
  }
}
```

---

## CSS Transition Patterns for UI Elements

```css
/* Button hover: smooth scale + color transition */
.ui-button {
  background: #1a1a2e;
  color: #00fff7;
  border: 2px solid #00fff7;
  padding: 8px 20px;
  cursor: pointer;
  transition: transform 0.15s ease-out, background 0.2s, box-shadow 0.2s;
  transform: scale(1);
}

.ui-button:hover {
  transform: scale(1.05);
  background: #16213e;
  box-shadow: 0 0 12px rgba(0, 255, 247, 0.4);
}

.ui-button:active {
  transform: scale(0.97);
  transition-duration: 0.05s;
}

/* Panel enter/exit */
.ui-panel {
  opacity: 0;
  transform: translateY(12px);
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.ui-panel.visible {
  opacity: 1;
  transform: translateY(0);
}

/* Damage flash */
@keyframes damage-flash {
  0%   { filter: brightness(1); }
  25%  { filter: brightness(3) saturate(0); }
  100% { filter: brightness(1); }
}
.damage-flash {
  animation: damage-flash 0.15s ease-out;
}
```

Recommended UI transition durations:
- Hover effects: 150-200ms
- Panel slide-in: 250-350ms
- Modal overlay: 300-400ms
- Damage flash: 100-150ms
- Score increment: 200-300ms

---

## Web Audio Procedural SFX Integration

```typescript
class SFX {
  private ctx: AudioContext;

  constructor() {
    this.ctx = new AudioContext();
  }

  private ensureResumed(): void {
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  // Short blip for UI clicks
  blip(frequency = 800, duration = 0.08): void {
    this.ensureResumed();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(frequency, this.ctx.currentTime);
    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  // Explosion / hit sound
  explosion(): void {
    this.ensureResumed();
    const bufferSize = this.ctx.sampleRate * 0.3;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const t = i / this.ctx.sampleRate;
      data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 10);
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);
    source.connect(gain).connect(this.ctx.destination);
    source.start();
  }

  // Coin pickup — short rising tone
  coin(): void {
    this.ensureResumed();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(600, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(1200, this.ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.15);
  }

  // Player hurt — low descending buzz
  hurt(): void {
    this.ensureResumed();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, this.ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.2);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.2);
  }
}
```

---

## Performance Considerations

| Concern              | Mitigation                                      |
|----------------------|-------------------------------------------------|
| Particle count       | Hard cap at 200 active, pool recycle dead ones  |
| Screen shake         | Limit to 20px max intensity, apply to container |
| Audio latency        | Pre-create AudioContext on first user gesture   |
| CSS transitions      | Use `transform` and `opacity` only (GPU composited) |
| requestAnimationFrame| Single loop, batch all effect updates together  |
| Hit-stop             | Cap freeze at 10 frames max                     |
| Particle overlap     | Merge overlapping particles in low-end mode     |

---

## Implementation Checklist

- [ ] Screen shake system with exponential decay implemented
- [ ] Hit-stop/freeze-frame triggered on heavy hits
- [ ] Particle emitter with object pooling (max 200)
- [ ] At least 3 easing functions available (easeOutQuad, bounce, elastic)
- [ ] CSS transitions on all interactive UI elements
- [ ] Procedural SFX: blip, explosion, coin, hurt
- [ ] AudioContext created on first click/tap
- [ ] Effects batched into single update loop
- [ ] Low-end mode: particles capped to 50, shake disabled
- [ ] No layout thrashing from CSS transitions
