---
name: game-development
description: Specialized skill for designing, implementing, and optimizing complete 2D/3D web games, Three.js WebGL engines, HTML5 Canvas engines, Web Audio procedural sound effects, physics simulators, and word games with dictionary validation.
---

# 🎮 Advanced Game Development & Engine Architecture Skill

Use this skill whenever creating, debugging, or enhancing interactive web games, Three.js WebGL scenes, 2D HTML5 Canvas engines, physics simulators, procedural audio generators, or word puzzle games for CoreZ.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       COREZ AI GAME ENGINE ARCHITECTURE                     │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. State Machine    ▶ Boot ──▶ MainMenu ──▶ Playing ──▶ Paused ──▶ GameOver │
│ 2. Game Loop       ▶ requestAnimationFrame + Fixed Delta-Time Accumulator   │
│ 3. Input System    ▶ Unified Keyboard (WASD/Arrows), Touch Virtual D-Pad   │
│ 4. Physics & Math  ▶ AABB 2D, Circle SAT, Raycasting, 3D Box Colliders       │
│ 5. Juice & Audio   ▶ Screen Shake, Hit-Stop, Web Audio API Procedural SFX    │
│ 6. Render Engine   ▶ Canvas 2D / Three.js WebGL / Pixel-Art SVG Sprites     │
│ 7. Telemetry & Save▶ Data-Driven GameConfig Tuning & LocalStorage Highscore │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Game Engine Foundation & Delta-Time Loop

Always use `requestAnimationFrame` with a fixed or clamped delta-time (`dt`) accumulator to ensure framerate-independent physics:

```javascript
let lastTime = performance.now();
let accumulator = 0;
const FIXED_STEP = 1 / 60; // 16.67ms fixed physics update step

function gameLoop(currentTime) {
  const frameTime = Math.min((currentTime - lastTime) / 1000, 0.1); // Clamp max 100ms
  lastTime = currentTime;
  accumulator += frameTime;

  // Fixed physics steps
  while (accumulator >= FIXED_STEP) {
    if (gameState === 'PLAYING') {
      updatePhysics(FIXED_STEP);
    }
    accumulator -= FIXED_STEP;
  }

  // Render with interpolation factor
  const alpha = accumulator / FIXED_STEP;
  render(alpha);

  requestAnimationFrame(gameLoop);
}
```

---

## 2. Web Audio API Procedural SFX Generator (0 External Files)

Never rely on external `.mp3` or `.wav` assets for sound effects. Build lightweight, zero-dependency procedural audio using Web Audio API oscillators:

```javascript
// Singleton Web Audio Context
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

export function playSound(type) {
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);

  switch (type) {
    case 'jump':
      osc.type = 'square';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(600, now + 0.15);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
      osc.start(now);
      osc.stop(now + 0.15);
      break;

    case 'hit':
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.exponentialRampToValueAtTime(30, now + 0.1);
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
      break;

    case 'coin':
      osc.type = 'sine';
      osc.frequency.setValueAtTime(987.77, now); // B5
      osc.frequency.setValueAtTime(1318.51, now + 0.08); // E6
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
      break;

    case 'explosion':
      // White noise explosion
      const bufferSize = audioCtx.sampleRate * 0.3;
      const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      const whiteNoise = audioCtx.createBufferSource();
      whiteNoise.buffer = buffer;
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800, now);
      filter.frequency.exponentialRampToValueAtTime(50, now + 0.3);
      whiteNoise.connect(filter);
      filter.connect(gain);
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      whiteNoise.start(now);
      whiteNoise.stop(now + 0.3);
      break;
  }
}
```

---

## 3. Game Feel, Juice & Micro-Interactions

To make web games feel snappy and responsive ("juicy"):

### A. Screen Shake Decay
```javascript
let screenShakeIntensity = 0;

export function triggerScreenShake(intensity = 8) {
  screenShakeIntensity = intensity;
}

export function applyScreenShake(ctx) {
  if (screenShakeIntensity > 0.1) {
    const offsetX = (Math.random() * 2 - 1) * screenShakeIntensity;
    const offsetY = (Math.random() * 2 - 1) * screenShakeIntensity;
    ctx.translate(offsetX, offsetY);
    screenShakeIntensity *= 0.85; // Exponential decay
  }
}
```

### B. Hit-Stop / Freeze Frame
```javascript
let freezeFramesRemaining = 0;

export function triggerHitStop(frames = 4) {
  freezeFramesRemaining = frames;
}

export function updateHitStop() {
  if (freezeFramesRemaining > 0) {
    freezeFramesRemaining--;
    return true; // Skip entity update for hit-stop duration
  }
  return false;
}
```

### C. Particle Emitter System
```javascript
class ParticleSystem {
  constructor() {
    this.particles = [];
  }

  emit(x, y, color = '#facc15', count = 12) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 4;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        decay: 0.02 + Math.random() * 0.03,
        size: 3 + Math.random() * 3,
        color
      });
    }
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= p.decay;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  draw(ctx) {
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}
```

---

## 4. Platformer Mechanics (Coyote Time & Jump Buffering)

Never create stiff platformer physics. Always implement **Coyote Time** (allow jumps 6 frames after leaving a ledge) and **Jump Buffering** (register jump inputs pressed 4 frames before landing):

```javascript
const player = {
  x: 100, y: 100, width: 24, height: 32,
  vx: 0, vy: 0,
  isGrounded: false,
  coyoteTimer: 0,    // Frames since left ground
  jumpBufferTimer: 0 // Frames since jump button pressed
};

function updatePlatformerPhysics(player, dt) {
  // Update Grounded & Coyote state
  if (player.isGrounded) {
    player.coyoteTimer = 6; // Reset 6-frame grace period
  } else if (player.coyoteTimer > 0) {
    player.coyoteTimer--;
  }

  // Update Jump Buffer
  if (keys['Space'] || keys['KeyW'] || keys['ArrowUp']) {
    player.jumpBufferTimer = 4;
  } else if (player.jumpBufferTimer > 0) {
    player.jumpBufferTimer--;
  }

  // Execute Jump when both criteria met
  if (player.jumpBufferTimer > 0 && player.coyoteTimer > 0) {
    player.vy = -11.5; // Jump Force
    player.coyoteTimer = 0;
    player.jumpBufferTimer = 0;
    player.isGrounded = false;
    playSound('jump');
  }

  // Variable Jump Height (Release jump early = shorter jump)
  if (!keys['Space'] && player.vy < -3) {
    player.vy *= 0.5;
  }
}
```

---

## 5. Three.js 3D WebGL Game Blueprint

When creating 3D WebGL games in Three.js for CoreZ React preview canvas:

```javascript
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

export default function Game3D() {
  const mountRef = useRef(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Scene, Camera, Renderer Setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#050508');
    scene.fog = new THREE.FogExp2('#050508', 0.03);

    const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(0, 5, 10);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    // 2. Lighting Setup
    const ambientLight = new THREE.AmbientLight('#ffffff', 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight('#6366f1', 1.2);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    scene.add(dirLight);

    // 3. Player Object (Box Collider)
    const playerGeo = new THREE.BoxGeometry(1, 1.8, 1);
    const playerMat = new THREE.MeshStandardMaterial({ color: '#f43f5e', roughness: 0.3 });
    const playerMesh = new THREE.Mesh(playerGeo, playerMat);
    playerMesh.position.set(0, 0.9, 0);
    playerMesh.castShadow = true;
    scene.add(playerMesh);

    // Ground Plane
    const groundGeo = new THREE.PlaneGeometry(100, 100);
    const groundMat = new THREE.MeshStandardMaterial({ color: '#18181b', roughness: 0.8 });
    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);

    // 4. Animation Loop
    let animId;
    let clock = new THREE.Clock();

    const animate = () => {
      const delta = clock.getDelta();
      // Smooth Camera Follow
      camera.position.x += (playerMesh.position.x - camera.position.x) * 0.05;
      camera.position.z += (playerMesh.position.z + 10 - camera.position.z) * 0.05;
      camera.lookAt(playerMesh.position);

      renderer.render(scene, camera);
      animId = requestAnimationFrame(animate);
    };

    animate();

    // 5. Handle Resize
    const handleResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={mountRef} className="w-full h-full min-h-[500px]" />;
}
```

---

## 6. Word Games & Dictionary Validation (Set Lookup)

When building Wordle, Scrabble, Anagrams, or Crossword games:
1. **Embedded Dictionary Set**: Embed a 300+ word `Set` directly in the code for $O(1)$ fast lookups:
   ```javascript
   const DICTIONARY = new Set([
     'APPLE','BEACH','CLOUD','DREAM','EAGLE','FLAME','GRAPE','HEART','LIGHT','OCEAN',
     'PLANT','RIVER','SOLAR','TIGER','WORLD','BRAIN','CODEZ','REACT','STAGE','PIXEL',
     'SUPER','CRAFT','GUESS','SHARP','SCORE','FLASH','LOGIC','MAGIC','QUICK','SMART'
   ]);
   ```
2. **Validation Logic**:
   ```javascript
   function validateSubmission(word) {
     const clean = String(word || '').trim().toUpperCase();
     if (clean.length !== 5) return { valid: false, message: 'Word must be 5 letters.' };
     if (!DICTIONARY.has(clean)) return { valid: false, message: 'Not in dictionary!' };
     return { valid: true, message: 'Valid word!' };
   }
   ```

---

## 7. 8-Bit Pixel Art SVG Sprite Guidelines (itch.io Style)

When rendering retro 2D sprites or SVG icons:
- Always use `shape-rendering="crispEdges"` on SVG containers.
- Align rects to crisp grid dimensions ($16 \times 16$, $24 \times 24$, or $32 \times 32$).
- Use dark 1-pixel outlines (`#09090b`) and PICO-8 / NES color palettes (`#ff004d`, `#00e756`, `#29adff`, `#fff1e8`).

---

## 8. Mobile & Virtual Touch Controls

Always render a responsive virtual D-Pad and Action Buttons when mobile viewports (`window.innerWidth < 768`) are detected:

```javascript
const TouchControlsOverlay = ({ onInputStart, onInputEnd }) => (
  <div className="md:hidden absolute bottom-4 left-4 right-4 flex justify-between pointer-events-auto z-50 select-none">
    {/* D-Pad Left/Right */}
    <div className="flex gap-2">
      <button 
        onTouchStart={() => onInputStart('LEFT')} 
        onTouchEnd={() => onInputEnd('LEFT')}
        className="w-14 h-14 bg-white/20 active:bg-white/40 rounded-full flex items-center justify-center text-white text-xl font-bold backdrop-blur-md"
      >
        ◀
      </button>
      <button 
        onTouchStart={() => onInputStart('RIGHT')} 
        onTouchEnd={() => onInputEnd('RIGHT')}
        className="w-14 h-14 bg-white/20 active:bg-white/40 rounded-full flex items-center justify-center text-white text-xl font-bold backdrop-blur-md"
      >
        ▶
      </button>
    </div>

    {/* Jump / Action Button */}
    <button 
      onTouchStart={() => onInputStart('ACTION')} 
      onTouchEnd={() => onInputEnd('ACTION')}
      className="w-16 h-16 bg-rose-600/80 active:bg-rose-500 rounded-full flex items-center justify-center text-white text-2xl font-bold shadow-lg backdrop-blur-md"
    >
      ▲
    </button>
  </div>
);
```

---

## 9. Deliverable Verification Checklist

Before marking any game implementation `COMPLETE`:
- [ ] Framerate independent `requestAnimationFrame` game loop with clamped delta-time.
- [ ] Zero external sound file dependency (procedural Web Audio API sound effects for Jump, Hit, Collect, Game Over).
- [ ] Screen shake and hit-stop juice on major impacts or damage events.
- [ ] Mobile virtual touch controls overlay when viewed on small viewports.
- [ ] Clean event listener cleanup (`window.removeEventListener('keydown')`, `cancelAnimationFrame`) on unmount.
- [ ] Automated vitest unit test execution passing cleanly (`exitCode === 0`).
