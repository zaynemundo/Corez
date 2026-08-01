---
name: game-development
description: Full CoreZ AI Game Studio skill — designs, implements, optimizes, tests, and publishes complete 2D/3D web games. Covers the entire 18-part pipeline: studio orchestration and sizing, vision brainstorming, spec generation, architecture, art direction, asset manifests, task graphs, TDD implementation, polish and audio, smoke/QA/regression testing, performance review, bug triage, code and visual review, release signoff, and publishing/marketing. Includes Three.js WebGL, HTML5 Canvas, Web Audio procedural SFX, physics simulators, and word games with dictionary validation.
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
     'PLANT','RIVER','SOLAR','TIGER','WORLD','BRAIN','CODER','REACT','STAGE','PIXEL',
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


---

# 🧭 Game Studio Pipeline (18 Skills Consolidated)

This section consolidates the former `.opencode/skills/game-*` skill suite into one skill. Parts run in pipeline order; each part is applied when its stage is reached.

---

# PART 1: game-start — Studio Orchestration (Complexity Sizing & Workflow Initiation)

Orchestration entry point for the CoreZ AI Game Studio. Analyzes game request, sizes complexity, provisions the correct agent team, and produces a task graph for execution.

---

### 1. Complexity Sizing Guide

#### SMALL (3-4 agents, 1-2 hours implementation)

**Criteria** (must satisfy ALL):
- Single-screen or auto-scrolling level (no camera control)
- 1-3 mechanics (e.g., tap to jump, dodge obstacles)
- No enemy AI (static obstacles or simple patterns only)
- No level progression (endless or single level)
- No save/load state
- No multiplayer/network
- Max 1 asset sheet / sprite set

**Examples:** match-3, endless runner, simple puzzle, clicker, breakout clone

**Agents needed:**
| Role | Agent | Mode |
|------|-------|------|
| Creative Director | deepseek-v4-flash | read-only advisory |
| Lead Programmer | deepseek-v4-flash | implement |
| UI Programmer | deepseek-v4-flash | implement |
| QA Tester | deepseek-v4-flash | test |

#### MEDIUM (5-7 agents, 3-6 hours implementation)

**Criteria** (satisfies ANY 4+):
- Scrolling or hub-based levels
- 3-6 mechanics (jump, attack, dash, collect, interact, die/respawn)
- Basic enemy AI (patrol, chase, shoot patterns)
- 3-5 levels with progression
- Score tracking and high score display
- 2-3 asset sheets / tilemaps
- Audio (procedural or pre-made)
- Touch + keyboard controls

**Examples:** 2D platformer, top-down adventure, word game with dictionary, tower defense (few waves), basic shooter

**Agents needed:**
| Role | Agent | Mode |
|------|-------|------|
| Creative Director | deepseek-v4-flash | read-only advisory |
| Game Designer | deepseek-v4-flash | spec writer |
| Lead Programmer | deepseek-v4-flash | implement |
| UI Programmer | deepseek-v4-flash | implement |
| Art Director | flux-1-schnell | asset generation |
| Technical Artist | deepseek-v4-flash | asset integration |
| QA Tester | deepseek-v4-flash | test |

#### LARGE (8+ agents, 8+ hours implementation)

**Criteria** (satisfies ANY 5+):
- Open world or large interconnected map
- 7+ mechanics with ability unlocks
- Complex enemy AI (state machines, boss phases)
- 10+ levels or procedural generation
- Inventory, upgrades, skill trees
- Persistent save/load system
- Multiplayer (local or networked)
- 5+ asset sheets / sprite animations
- Cutscenes or narrative branching
- Audio system with SFX + music tracks

**Examples:** RPG, strategy game, multiplayer arena, metroidvania, rhythm game with custom maps

**Agents needed:**
| Role | Agent | Mode |
|------|-------|------|
| Producer | deepseek-v4-flash | orchestration lead |
| Creative Director | deepseek-v4-flash | read-only |
| Game Designer | deepseek-v4-flash | spec |
| Lead Programmer | deepseek-v4-flash | architecture + core |
| UI Programmer | deepseek-v4-flash | HUD/menus |
| Art Director | flux-1-schnell | backgrounds/assets |
| Technical Artist | deepseek-v4-flash | sprite pipeline |
| Physics Advisor | deepseek-v4-flash | read-only advisory |
| QA Tester | deepseek-v4-flash | test |
| Code Reviewer | deepseek-v4-flash | read-only review |

---

### 2. Role Provisioning Matrix

| Role | Authority | SMALL | MEDIUM | LARGE | Default Mode |
|------|-----------|-------|--------|-------|-------------|
| Producer | Coordinator | - | - | required | implement |
| Creative Director | Vision | advisory | advisory | advisory | read-only |
| Game Designer | Spec | - | write | write | implement |
| Lead Programmer | Architecture | required | required | required | implement |
| UI Programmer | HUD/UX | required | required | required | implement |
| Art Director | Visual | - | generate | generate | implement |
| Technical Artist | Assets | - | integrate | integrate | implement |
| Physics Advisor | Math | - | - | advisory | read-only |
| QA Tester | Testing | required | required | required | implement |
| Code Reviewer | Quality | - | - | review | read-only |

**Rules:**
- Never assign a role without a concrete task for it
- QA Tester is always required (even SMALL games need smoke tests)
- Creative Director is always read-only (never edits files)
- Physics Advisor only activates for games with velocity, acceleration, collision response, or spatial queries
- Art Director uses flux-1-schnell for background generation, NOT for sprites (sprites are SVG by Technical Artist)

---

### 3. Workflow Initiation Checklist

Before producing the task graph, complete ALL steps:

#### Input Analysis
- [ ] Read the user's game request in full
- [ ] Identify explicit requirements (genre, features, platform)
- [ ] Identify implicit constraints (browser-based, single-player, free-to-play)
- [ ] Note any technical restrictions (no WebGL, mobile-first, keyboard-only)

#### Complexity Sizing
- [ ] Count mechanics (each verb = 1 mechanic)
- [ ] Count levels / screens
- [ ] Identify enemy AI complexity (none, pattern, state machine)
- [ ] Check for persistence needs (score only, full save, cloud)
- [ ] Check for multiplayer requirements
- [ ] Apply sizing criteria from section 1
- [ ] Assign complexity label: SMALL / MEDIUM / LARGE

#### Team Provisioning
- [ ] Select roles from provisioning matrix (section 2)
- [ ] Assign agents to roles
- [ ] Set mode for each (implement vs read-only)
- [ ] Verify no role is double-booked
- [ ] Verify file ownership: no two agents edit the same source file

#### Task Graph Preparation
- [ ] Break work into sequential phases (spec -> design -> core -> UI -> assets -> integration -> test -> review)
- [ ] Identify parallelizable tasks (assets + core can happen concurrently)
- [ ] Order dependencies correctly (spec before implement, tests after implementation)
- [ ] Assign each task to exactly one agent
- [ ] Set acceptance criteria for each task

#### Entry Criteria (must be true to start)
- [ ] User has provided a clear game request (title + genre + 2-3 sentences)
- [ ] Repository is on `main` branch (abort if not)
- [ ] Working directory has write permissions
- [ ] Node.js / Python / required runtime is available (check version)
- [ ] No uncommitted work that would conflict with game files

#### Exit Criteria (must be true to finish)
- [ ] game-spec.json is written and validated
- [ ] All tasks in task graph are marked COMPLETE
- [ ] At least one passing test exists (smoke or unit)
- [ ] Lint passes (or explicit waiver documented)
- [ ] Game runs in browser without console errors
- [ ] No regressions in existing functionality

---

### 4. Output: Task Graph and Role Assignments

Produce this output in structured YAML format:

```yaml
complexity: "SMALL"  # or MEDIUM | LARGE
estimated_hours: "1-2"  # per complexity: SMALL 1-2, MEDIUM 3-6, LARGE 8+

team:
  - role: "Lead Programmer"
    agent: "deepseek-v4-flash"
    mode: "implement"
    tasks:
      - "Set up project structure and build config"
      - "Implement core game loop and rendering"
      - "Implement player controls and physics"
  - role: "UI Programmer"
    agent: "deepseek-v4-flash"
    mode: "implement"
    tasks:
      - "Build HUD (score, health, pause button)"
      - "Implement start screen and game-over overlay"
  - role: "QA Tester"
    agent: "deepseek-v4-flash"
    mode: "implement"
    tasks:
      - "Write smoke tests for core loop"
      - "Verify controls work on keyboard and touch"

task_graph:
  phases:
    - name: "Specification"
      parallel: false
      tasks:
        - "Run game-brainstorm to refine vision"
        - "Run game-spec to produce game-spec.json"
    - name: "Implementation"
      parallel: true
      tasks:
        - "Core engine and game loop"
        - "Asset generation and integration"
        - "UI and HUD components"
    - name: "Verification"
      parallel: false
      tasks:
        - "Run game-smoke-test for DOM, canvas, and input smoke suite"
        - "Run game-qa-plan to extend coverage for new mechanics"
        - "Run game-regression to confirm no baseline failures"
        - "Run game-performance-review for frame-timing and memory audit"
        - "Run game-code-review for spec compliance and safety audit"
        - "Run lint (npm run lint)"
        - "Run game-release-check and obtain final signoff"
        - "Run game-publish (optional): distribution pages, press kit, launch posts"
        - "Fix any failures"

entry_criteria_met: true
exit_criteria_pending: []
```

---

### 5. Anti-Patterns

| Anti-Pattern | Why It Fails | Correct Approach |
|---|---|---|
| **Over-provisioning** | Assigning 8 agents to a SMALL game creates overhead and context thrash | Use the provisioning matrix exactly; never exceed it |
| **Under-provisioning** | Skipping QA Tester speeds up dev but ships broken games | QA Tester is always required, even for SMALL |
| **Parallel write conflicts** | Two agents editing the same file causes merge hell | Enforce file ownership: one source file, one agent |
| **Missing exit criteria** | Marking done without empirical verification | Run tests, lint, and open the game in browser before signoff |
| **Skipping spec phase** | Starting implementation without a validated spec leads to rework | Do NOT start implementation until game-spec.json is written and validated |
| **Unclear authority** | Everyone thinks they can veto design decisions | Creative Director has final say on vision; Lead Programmer has final say on architecture |

---

# PART 2: game-brainstorm — Vision Discovery (Socratic Brainstorming)

Structured Socratic discovery process for defining game vision, player fantasy, genre identity, core loops, mechanics, and controls before technical implementation.

---

### 1. Socratic Questioning Framework

Ask each question in order. Do not proceed until the previous question has a written answer.

| Phase | Question | Purpose |
|-------|----------|---------|
| **Vision** | What is the one sentence that describes this game? | Elevator pitch |
| **Vision** | What feeling should the player have after 5 minutes? | Emotional target |
| **Vision** | What game does this most resemble, and how is it different? | Reference + differentiation |
| **Fantasy** | Who is the player pretending to be? | Role identity |
| **Fantasy** | What power does the player have that no one else does? | Unique mechanic seed |
| **Fantasy** | What would a 10-second highlight reel of this game look like? | Visual/action identity |
| **Genre** | Is this real-time or turn-based? | Tempo foundation |
| **Genre** | Is the world 2D, 2.5D, or 3D? | Visual scope |
| **Genre** | Is the primary challenge physical (reflexes), mental (puzzles), or strategic (resource mgmt)? | Challenge type |
| **Loop** | What does the player do every 3 seconds? | Micro-loop |
| **Loop** | What does the player do every 30 seconds? | Meso-loop |
| **Loop** | What does the player do every 5 minutes? | Macro-loop |
| **Mechanics** | What are the 3 verbs the player can always do? | Core verb set |
| **Mechanics** | What prevents the player from always winning? | Tension source |
| **Mechanics** | What makes two playthroughs different? | Replayability |
| **Controls** | What is the most frequent physical action? | Primary input |
| **Controls** | Can the game be played one-handed? Two-handed? Both? | Accessibility |

---

### 2. Player Fantasy Formulation

Write a fantasy statement using this template:

```
The player is [ROLE] who [UNIQUE_ABILITY] in a [SETTING] while facing [TENSION].
They feel [EMOTIONAL_PAYOFF] when they [SUCCESS_ACTION].
```

Examples:
- *The player is a gravity-defying ninja who dashes through neon-lit corridors while facing a relentless security AI. They feel unstoppable when chaining wall-jumps without touching the ground.*
- *The player is a rogue alchemist who mixes potions from garden ingredients while facing a corrupt royal guard. They feel clever when discovering a recipe combo that turns guards into frogs.*

**Validation criteria:**
- Fantasy must be expressible in 30 words or fewer
- Fantasy must imply at least 2 specific mechanics
- Fantasy should make a non-gamer curious to try

---

### 3. Genre Identity Checklist

Check all that apply. Each checked box narrows implementation scope.

#### Tempo
- [ ] Real-time (continuous action)
- [ ] Turn-based (player waits for opponent)
- [ ] Semi-real-time (cooldowns, stamina bars)

#### Perspective
- [ ] Side-view (platformer, brawler)
- [ ] Top-down (shooter, adventure, RPG)
- [ ] Isometric (strategy, sim)
- [ ] First-person (immersive)
- [ ] Third-person over-shoulder

#### Core Challenge (pick exactly ONE primary)
- [ ] Reflexes / timing (platformer, fighter, bullet hell)
- [ ] Strategy / planning (puzzle, tower defense, 4X)
- [ ] Resource management (sim, tycoon, survival)
- [ ] Exploration / discovery (metroidvania, adventure)
- [ ] Social / bluffing (party game, deception)

#### Scope Bounds
- [ ] Single-screen levels
- [ ] Scrolling levels (one direction)
- [ ] Open hub -> instances
- [ ] Fully open world

---

### 4. Core Loop Discovery Worksheet

#### Micro-loop (3-10 second cycle)
```
Input:  [Player presses / taps / clicks _____]
Action: [Character does _____]
Feedback: [Screen shows / sound plays _____]
State change: [Score / health / position changes by _____]
```

#### Meso-loop (30-120 second cycle)
```
Goal:    [Complete _____]
Obstacle: [_____ blocks progress]
Reward:  [_____ is unlocked / awarded]
Pacing:  [Tension rises by _____ then resets when _____]
```

#### Macro-loop (5-20 minute cycle)
```
Level end: [Level is won when _____]
Progression: [Between levels, player gains _____]
Meta-goal: [After 3 levels, player unlocks _____]
Run ending: [Game ends when _____]
```

**Loop validation:** Trace one complete cycle manually. If any step is missing (Input -> Action -> Feedback -> State Change), the loop is incomplete. Redesign the missing step before proceeding.

---

### 5. Mechanics Refinement Checklist

For each proposed mechanic, verify:

- [ ] **Discoverable**: Can the player figure it out without a tutorial?
- [ ] **Consistent**: Does it behave the same way every time?
- [ ] **Composable**: Can it combine with other mechanics?
- [ ] **Juiceable**: Can it produce satisfying feedback (screen shake, particles, sound)?
- [ ] **Balanced**: Does it have a clear cost vs. benefit?
- [ ] **Failable**: Can the player do it wrong and learn from failure?
- [ ] **Accessible**: Does it work on mouse/keyboard AND touch?
- [ ] **Performant**: Can it be computed in under 1ms per frame?

Eliminate any mechanic that fails 3 or more checks.

---

### 6. Story & Mood Formulation

Every game has a story — if not explicit, the player creates it from the mechanics (rising numbers in 2048, silent interactions in Monument Valley). Capturing Story and Mood up front makes the rest of the design concrete.

#### Story Worksheet
```
Story type:   [explicit narrative | emergent-from-mechanics | player-projected]
Premise:      [One sentence — what happens in the world]
Emotion arc:  [How should the player feel at minute 1, 5, 30?]
Memorable:    [What moment should players retell to a friend?]
Ending:       [What emotional note does the game end on?]
```

- If the story is **emergent**, state what the player-created narrative is (e.g., "the rising empire of your civilization")
- If the story is **explicit**, keep it deliverable in 3 screens of text or less for a SMALL/MEDIUM game
- Every mechanic should reinforce at least one emotional beat — mechanics that contradict the emotion get cut

#### Mood Worksheet
```
Vibe:         [retro chiptune | modern flat | cozy | dark/tense | whimsical]
Visual:       [palette direction, shape language — feed to game-art-direction]
Audio:        [music genre/tempo, SFX character — feed to game-polish]
First impression: [What does the player see/hear in the first 3 seconds?]
Contrast:     [What mood shift punctuates important moments?]
```

**Mood validation:** the mood must be achievable with the project's art budget (SMALL = 1 palette + procedural audio; LARGE = multiple palettes + music). If the mood requires art the size can't support, simplify the mood.

---

### 7. Control Scheme Brainstorming
#### Keyboard-first (browser default)
| Action | Key | Alternative | Why |
|--------|-----|-------------|-----|
| Move left | A / ArrowLeft | | Primary movement |
| Move right | D / ArrowRight | | Primary movement |
| Jump / Up | W / ArrowUp / Space | | Most frequent action |
| Down / Duck | S / ArrowDown | | |
| Primary action | J / Z / Click | | Most frequent non-move |
| Secondary action | K / X | | |
| Special / menu | Esc / P | | Pause always accessible |
| Restart | R | | Must be confirm-guarded |

#### Touch-first (mobile/tablet)
- Virtual joystick (left thumb): movement
- Action buttons (right thumb): jump, attack, interact
- Swipe gestures for dodge / dash
- Tap = primary action, hold = secondary action
- MUST include a pause button that is always visible

#### Gamepad (progressive enhancement)
- Left stick: movement
- A (bottom): primary action / jump
- B (right): secondary action / cancel
- X (left): tertiary action
- Y (top): special / menu
- Start: pause
- D-pad: inventory / quick-select

#### Control Principles
- Primary action must be on the most accessible input (Space / tap / A)
- No action should require 3+ simultaneous key presses
- Every action must have a keyboard AND touch equivalent
- Pause must be accessible without closing the game window

---

### 8. Output Format for game-spec Consumption

After brainstorming, produce structured notes:

```yaml
vision:
  pitch: "One-sentence elevator pitch"
  feeling: "Emotional target in 5 words"
  reference: "Resembles X, differs by Y"

fantasy:
  statement: "The player is..."
  role: "Role name"
  unique_ability: "What makes them special"
  emotional_payoff: "Feeling on success"

genre:
  tempo: "real-time | turn-based | semi-real-time"
  perspective: "side | top-down | isometric | first-person"
  primary_challenge: "reflexes | strategy | resource | exploration | social"
  scope: "single-screen | scrolling | hub | open-world"

story:
  type: "explicit | emergent | player-projected"
  premise: "One sentence"
  emotion_arc: "minute 1 -> minute 5 -> minute 30"
  memorable_moment: "What players retell"

mood:
  vibe: "retro | modern | cozy | dark | whimsical"
  visual: "Palette/shape direction for game-art-direction"
  audio: "Music genre + SFX character for game-polish"
  first_impression: "What the player sees/hears in 3 seconds"

core_loop:
  micro: { input: "press X", action: "character does Y", feedback: "screen shows Z", state_change: "+10 score" }
  meso: { goal: "complete room", obstacle: "enemy waves", reward: "key item", pacing: "tension builds then resets on clear" }
  macro: { level_end: "boss defeated", progression: "new ability", meta_goal: "unlock zone after 3 clears", run_ending: "final boss / score target" }

mechanics:
  primary_verbs: ["move", "jump", "attack"]
  tension_source: "What makes it hard"
  replayability: "What changes each run"

controls:
  keyboard: { move_left: "a", move_right: "d", jump: "space", primary: "j", secondary: "k", pause: "escape" }
  touch: { movement: "left-joystick", primary: "tap-right", secondary: "hold-right", pause: "top-left-button" }
  gamepad: { move: "left-stick", primary: "a", secondary: "b", pause: "start" }
```

---

### 9. Anti-Patterns to Avoid

| Anti-Pattern | Why It Fails | Better Approach |
|---|---|---|
| **Feature creep** | Adding mechanics because they sound cool, not because they serve the loop | Add only mechanics the core loop requires; save extras for post-MVP |
| **Genre blending without focus** | Platformer + rhythm game + RPG = none are polished | Pick one primary genre; borrow at most one secondary element |
| **Fantasy / mechanic mismatch** | "You are a stealthy assassin" but all mechanics are about loud combat | Every mechanic must reinforce the fantasy statement |
| **Ignoring the first 10 seconds** | Game starts with menus, lore, or tutorials | Player must experience the core loop within 10 seconds of launch |
| **Symmetry over interest** | Making all characters/abilities perfectly balanced removes variety | Asymmetric abilities create memorable moments |
| **Design by committee** | Everyone adds their favorite feature without a unifying vision | One Creative Director has final say; document vetoes |
| **No failure state** | Player can't lose, so success has no meaning | Every action must carry risk; losing resets progress but preserves skill |
| **Control overcomplication** | 12 keys, 4 modifiers, double-tap combos | If a 10-year-old can't play without instructions, simplify |

---

# PART 3: game-spec — Game Specification (Validated game-spec.json)

Formulates structured, validated `game-spec.json` files from brainstorm output. Ensures all required fields are populated, types are correct, and cross-field constraints are satisfied.

---

### 1. JSON Schema Definition

#### Required Fields (MUST be present)

```json
{
  "title": "string (3-64 chars, no leading/trailing whitespace)",
  "genre": "string (must match known genre list)",
  "coreLoop": {
    "micro": { "input": "string", "action": "string", "feedback": "string", "stateChange": "string" },
    "meso": { "goal": "string", "obstacle": "string", "reward": "string" },
    "macro": { "levelEnd": "string", "progression": "string", "runEnding": "string" }
  },
  "controls": {
    "keyboard": { "moveLeft": "string", "moveRight": "string", "jump": "string", "primary": "string", "secondary": "string", "pause": "string" },
    "touch": { "movement": "string", "primary": "string", "secondary": "string", "pause": "string" }
  },
  "winCondition": "string (mutually exclusive with loseCondition)",
  "loseCondition": "string (mutually exclusive with winCondition)"
}
```

#### Optional Fields (include if applicable)

```json
{
  "enemies": [
    {
      "name": "string",
      "behavior": "string (chase | patrol | shoot | stationary | boss)",
      "health": "number (>= 1)",
      "damage": "number (>= 0)",
      "speed": "number (>= 0)"
    }
  ],
  "levels": [
    {
      "id": "number",
      "name": "string",
      "objective": "string",
      "timeLimit": "number | null",
      "unlockCondition": "string | null"
    }
  ],
  "scoring": {
    "pointsPerEnemy": "number (>= 0)",
    "pointsPerCollectible": "number (>= 0)",
    "timeBonus": "boolean",
    "comboSystem": "boolean"
  },
  "progression": {
    "abilities": ["string"],
    "unlockOrder": "string (linear | branched | open)"
  }
}
```

---

### 2. Complete Platformer Example

```json
{
  "title": "Neon Dash",
  "genre": "2D-platformer",
  "coreLoop": {
    "micro": {
      "input": "press space or tap right",
      "action": "character jumps to next platform",
      "feedback": "screen shakes slightly, jump particle burst, coin-collect chime",
      "stateChange": "score +10 if coin collected, position advances"
    },
    "meso": {
      "goal": "reach the level exit door",
      "obstacle": "spikes, moving platforms, patrolling drones",
      "reward": "key fragment, checkpoint activated"
    },
    "macro": {
      "levelEnd": "collect 3 key fragments to open boss door",
      "progression": "earn jetpack upgrade after zone 1, double-jump after zone 2",
      "runEnding": "defeat final boss by reflecting its projectiles 3 times"
    }
  },
  "controls": {
    "keyboard": {
      "moveLeft": "a",
      "moveRight": "d",
      "jump": "space",
      "primary": "j",
      "secondary": "k",
      "pause": "escape"
    },
    "touch": {
      "movement": "left-joystick",
      "primary": "tap-right",
      "secondary": "hold-right",
      "pause": "top-left-button"
    }
  },
  "winCondition": "Defeat the final boss in Zone 3 without using a continue",
  "loseCondition": "Lose all 3 health hearts or fall into a pit",
  "enemies": [
    { "name": "Patrol Drone", "behavior": "patrol", "health": 1, "damage": 1, "speed": 2 },
    { "name": "Spike Turret", "behavior": "shoot", "health": 3, "damage": 1, "speed": 0 },
    { "name": "Boss Sentinel", "behavior": "boss", "health": 10, "damage": 2, "speed": 1 }
  ],
  "levels": [
    { "id": 1, "name": "Neon Alley", "objective": "reach exit", "timeLimit": null, "unlockCondition": null },
    { "id": 2, "name": "Rooftop Chase", "objective": "collect 3 key fragments", "timeLimit": 90, "unlockCondition": "complete zone 1" },
    { "id": 3, "name": "The Core", "objective": "defeat boss", "timeLimit": null, "unlockCondition": "collect all key fragments" }
  ],
  "scoring": {
    "pointsPerEnemy": 100,
    "pointsPerCollectible": 10,
    "timeBonus": true,
    "comboSystem": true
  },
  "progression": {
    "abilities": ["wall-jump", "dash", "double-jump"],
    "unlockOrder": "linear"
  },
  "story": {
    "type": "emergent",
    "premise": "A lone courier races through a neon city to deliver a package before sunrise",
    "emotionArc": "curious -> tense -> triumphant"
  },
  "mood": {
    "vibe": "retro-neon",
    "visual": "cyan/magenta on deep purple, sharp geometric shapes",
    "audio": "synthwave tempo 120bpm, square-wave SFX"
  }
}
```

---

### 3. Field Validation Rules

Apply these checks programmatically before accepting a spec:

#### Title
- [ ] Length 3-64 characters
- [ ] No leading/trailing whitespace
- [ ] No empty or null values
- [ ] Must be unique per project (no duplicate titles)

#### Genre
- [ ] Must be one of: `2D-platformer`, `3D-platformer`, `runner`, `match-3`, `puzzle`, `top-down-adventure`, `shooter`, `fighting`, `strategy`, `RPG`, `simulation`, `word-game`, `rhythm`, `party-game`, `other`
- [ ] If `other`, a `genreDescription` string field must also be present

#### Core Loop
- [ ] Every `input` must map to a key in `controls`
- [ ] Every `feedback` must describe a visible or audible event
- [ ] `stateChange` must affect score, position, health, or inventory
- [ ] All 3 sub-loops (micro, meso, macro) must be populated

#### Controls
- [ ] Every keyboard value must be a valid single key or key combo
- [ ] Touch `movement` must be `left-joystick`, `dpad`, `swipe`, or `tap-to-move`
- [ ] `pause` key must differ from all action keys
- [ ] No two actions may share the same key binding

#### Win / Lose Conditions
- [ ] Mutually exclusive: a single play session cannot satisfy both simultaneously
- [ ] At least one must be measurable by the game engine (no subjective conditions like "player feels bored")
- [ ] Both must reference mechanics defined in coreLoop or enemies

#### Enemies (if present)
- [ ] Each must have a unique `name` within the spec
- [ ] `health >= 1`, `damage >= 0`, `speed >= 0`
- [ ] `behavior` must be one of: `chase`, `patrol`, `shoot`, `stationary`, `boss`

#### Levels (if present)
- [ ] `id` values must be unique and sequential starting from 1
- [ ] `unlockCondition` must reference a previous level's completion or a collectible count

#### Scoring (if present)
- [ ] All point values must be >= 0
- [ ] If `comboSystem` is true, at least one enemy must exist

#### Story (optional)
- [ ] `type` must be one of: `explicit`, `emergent`, `player-projected`
- [ ] If `explicit`, a `premise` string must be present
- [ ] `emotionArc` (if present) must list emotions in play order

#### Mood (optional)
- [ ] `vibe` must match one of the `game-art-direction` themes (retro, cyberpunk, fantasy, minimalist, etc.)
- [ ] `audio` direction must be achievable with the project size (SMALL: procedural only)

---

### 4. Spec Generation Process

```
Step 1: Read brainstorm output
        -> Extract vision, fantasy, genre, loop, mechanics, controls, story, mood
        -> If any section is missing, reject and request game-brainstorm completion

Step 2: Map fields 1:1
        -> vision.pitch -> title
        -> genre.* -> genre + perspective suffix (e.g., "2D-" + genre)
        -> core_loop.* -> coreLoop.*
        -> controls.* -> controls.*
        -> mechanics -> enemies, scoring, progression
        -> story.type/premise/emotion_arc -> story.* (recorded, informs pacing)
        -> mood.vibe/visual/audio -> mood.* (passed to art-direction + polish)

Step 3: Write win/lose conditions
        -> winCondition must describe an end state reachable through the macro loop
        -> loseCondition must describe a failure state reachable through tension sources
        -> Verify mutual exclusivity

Step 4: Populate optional fields
        -> If enemies are mentioned in fantasy or mechanics, add enemies array
        -> If scoring is implied (coins, points), add scoring object
        -> If progression exists (new abilities between levels), add progression

Step 5: Cross-reference validation
        -> Run all field validation rules (section 3)
        -> Fix any violations before output

Step 6: Write to game-project/design/game-spec.json
        -> Pretty-print with 2-space indentation
        -> Include trailing newline
```

---

### 5. Cross-Referencing Checklist

- [ ] Every `controls` key is referenced by at least one `coreLoop.micro.input`
- [ ] Every `coreLoop.macro.runEnding` maps to either `winCondition` or `loseCondition`
- [ ] Enemies listed in `coreLoop.meso.obstacle` appear in `enemies` array
- [ ] Abilities in `progression.abilities` are referenced by at least one level's `unlockCondition`
- [ ] `winCondition` cannot be true when `loseCondition` is true (mutual exclusion)
- [ ] If `scoring.comboSystem` is true, at least one enemy exists
- [ ] Keyboard `pause` is not bound to any other action
- [ ] Touch `pause` button position is documented and always visible

---

### 6. Common Pitfalls

| Pitfall | Symptom | Fix |
|---------|---------|-----|
| Vague win condition | "Player finishes the game" | Be specific: "Defeat final boss by landing 3 parry-reflect combos" |
| Untestable lose condition | "Player gets bored" | Engine cannot detect boredom; use "Player loses all 5 lives" |
| Control binding conflict | Space = jump AND confirm AND interact | One key, one action. Use Enter for confirm, Space for jump. |
| Missing touch alternative | Game is unplayable on mobile | Every keyboard action must have a touch equivalent |
| Over-specified enemies | 12 enemy types for a 3-level game | 1 enemy type per level minimum, 3 types maximum for SMALL scope |
| Disconnected loop levels | Micro says "tap to jump" but macro says "solve puzzles" | All 3 loop levels must share the same primary verb |
| Progression without content | "Unlock 10 abilities" but only 3 levels | 1 new ability per level max; aim for 1 ability per 2 levels |

---

### 7. Output Checklist

Before declaring the spec complete:

- [ ] game-spec.json is valid JSON (run `jq` or `JSON.parse`)
- [ ] All required fields are present
- [ ] All optional fields that apply to the game are populated
- [ ] Every string value is within length limits
- [ ] All cross-references are consistent
- [ ] winCondition and loseCondition are mutually exclusive
- [ ] Controls cover keyboard AND touch
- [ ] Micro loop input maps match control bindings
- [ ] Spec file is written to `game-project/design/game-spec.json`

---

# PART 4: game-architecture — Technical Architecture (Module Boundaries & Frame Budgets)

### Standard Directory Structure Blueprint

Every browser game under CoreZ follows this layout.

> **Note:** This is the per-game-project blueprint created at `game-project/src/` by the game
> workflow (via `game-task-plan` / `game-implement`). It does NOT exist in the CoreZ host repo
> itself, whose `src/` is the React dashboard (App.jsx, components/, services/). Apply this
> blueprint inside the game project, never to the host app. This repo is JavaScript, so
> files are `*.js` in practice; types are JSDoc or a shared types module.

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

### Module Boundary Rules

| Boundary | Rule |
|----------|------|
| `core/` | No imports from `entities/`, `systems/`, `ui/`. Core must be fully standalone. |
| `entities/` | May import from `core/` (types, config). Must NOT import from `systems/` directly — use event dispatch. |
| `systems/` | May import from `core/`. Must NOT import from `entities/` — operate on entity interfaces only. |
| `levels/` | May import from `core/` and `entities/`. Must NOT import from `ui/`. |
| `ui/` | May import from `core/` and `entities/` (for read-only state). Must NOT import from `systems/` or `levels/`. |
| `__tests__/` | May import from any module. Tests are the only exception to all boundary rules. |

### Interface/Contract Patterns Between Systems

#### Entity-System Communication via Component Interface

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

#### Event Bus Pattern (Decoupled Communication)

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

#### System Interface Contract

```typescript
interface GameSystem {
  readonly name: string;
  update(deltaTime: number, entities: Entity[]): void;
  render?(ctx: CanvasRenderingContext2D, camera: Camera): void;
  cleanup?(): void;
}
```

### Frame-Rate Budget Allocation

Target: 60 FPS (16.67ms per frame). Budget breakdown:

| Phase | Time Budget | % of Frame | Description |
|-------|-------------|------------|-------------|
| Input polling | 1ms | 6% | Read keyboard, touch, gamepad state |
| Physics update | 4ms | 24% | Gravity, velocity integration, collision detection |
| Entity update (AI) | 2ms | 12% | Enemy behavior, animation state transitions |
| Rendering | 8ms | 48% | Clear canvas, draw background, entities, particles, UI |
| Audio | 0.5ms | 3% | Play pending SFX, update music position |
| Overhead (GC, etc.) | 1.17ms | 7% | Frame timing, requestAnimationFrame callback overhead |

#### Monitoring

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

### State Machine Design

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

### Performance Budget Checklist

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

### Technology Decision Framework

| Requirement | Recommendation | When to Choose Alternative |
|-------------|---------------|---------------------------|
| 2D platformer, top-down, puzzle | Canvas 2D API | Use Three.js if 3D visuals needed |
| 3D world, FPS, racing | Three.js (WebGL) | Use raw WebGL only if Three.js bundle is too large |
| Minimal bundle, simple game | Canvas 2D | Use DOM-based if game is turn-based with no real-time rendering |
| Isometric or tile-based | Canvas 2D with orthographic camera | Use PixiJS if you need WebGL batching for many sprites |
| Text-heavy (RPG dialogue) | DOM overlay on Canvas | Use full DOM if game is mostly text/choice driven |
| Physics simulation | Matter.js (2D) or Cannon.js (3D) | Write custom AABB physics for simple platformers (< 20 entities) |
| Audio | Web Audio API (AudioContext) | Use Howler.js if you need sprite sheets and cross-browser fallback |

#### Default Stack Recommendation (2D Browser Game)

```
Canvas 2D API (rendering) + Matter.js (physics) + Web Audio API (sound) + requestAnimationFrame (loop)
Bundle: Vite + TypeScript (strict mode) + vitest (testing)
```

### Architectural Decision Records

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

---

# PART 5: game-art-direction — Art Direction (Palettes, Themes, art-direction.json)

Generates `game-project/design/art-direction.json` establishing visual aesthetic, color palettes (PICO-8, NES, Game Boy), and 8-bit sprite guidelines.

---

### art-direction.json Schema

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

### Color Palette Reference Tables

#### PICO-8 Palette (16 colors)

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

#### NES Palette (subset of 8 common)

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

#### Game Boy Palette (4 shades)

| Hex       | Name     |
|-----------|----------|
| `#0F380F` | Darkest  |
| `#306230` | Dark     |
| `#8BAC0F` | Light    |
| `#9BBC0F` | Lightest |

---

### Visual Theme Guides

#### Cyberpunk
- **Background**: near-black (`#0a0a1a`), dark navy
- **Primary**: neon cyan (`#00fff7`), hot pink (`#ff007f`)
- **Highlight**: electric blue glow, scan-line overlays
- **UI**: sharp corners, thin borders, glitch text effects
- **Typography**: monospace or sci-fi sans (e.g. "Orbitron")

#### Fantasy
- **Background**: deep purple (`#1a0a2e`) or forest green
- **Primary**: gold (`#ffd700`), royal blue, crimson
- **Secondary**: warm amber, soft teal
- **UI**: curved panels, parchment tones, ornate borders
- **Typography**: serif or fantasy (e.g. "MedievalSharp")

#### Retro (8-bit / 16-bit)
- **Background**: solid dark (`#000000` or `#1D2B53`)
- **Primary**: bright saturated (PICO-8 index 7-14)
- **UI**: chunky borders, single-pixel outlines
- **Typography**: pixel bitmap (e.g. "Press Start 2P", "Silkscreen")

#### Minimalist
- **Background**: off-white (`#f5f5f0`) or dark gray (`#1a1a1a`)
- **Primary**: single accent color, one highlight
- **UI**: flat, thin lines, generous negative space
- **Typography**: clean sans (e.g. "Inter", "IBM Plex Sans")

---

### Sprite Dimension Guidelines

| Size   | Best For              | Canvas (px) | Grid Snap |
|--------|-----------------------|-------------|-----------|
| 16x16  | Small characters, items, particles | 256x256 tileset | Yes |
| 24x24  | Medium characters, enemies         | 384x384 tileset | Yes |
| 32x32  | Large characters, bosses, UI icons | 512x512 tileset | Yes |

- Always use integer scaling (1x, 2x, 3x, 4x) for pixel art.
- Set `shape-rendering: crispEdges` and `image-rendering: pixelated` in CSS.
- Maintain 1px visible separation between sprite cells in spritesheet/tileset layouts.

---

### Asset Production Techniques (memory + scalability)

Apply these from the Art stage forward so assets don't need rework later.

#### Tiling
- Tile patterned assets (ground, walls, water, sky) instead of one large image: a single 16x16 tile repeated in a `pattern` or drawn in a loop saves memory and keeps files small.
- Ensure tile edges wrap seamlessly (test a 2x2 arrangement; fix any visible seam before accepting the asset).

#### 9-Slice / 9-Patch (scalable UI)
- UI panels, buttons, and frames that must stretch use 9-slice: unscalable corners + stretchable center/edges.
- In SVG, emit corner/edge/center as separate rects, or provide a slice descriptor in the asset manifest (`slices: { left, top, right, bottom }`).
- Never scale a 1px border UI image with CSS `background-size: 100% 100%` — it distorts corners.

#### Compression-friendly dimensions
- Make every asset dimension a **multiple of 4** (or a **power of 2** when texture compression is used) to avoid wasted padding in packed textures.
- Pack multiple sprites into one spritesheet (256x256, 512x512) rather than many single files — fewer downloads, one draw-batch-able texture.

#### Animation approaches
| Approach | Best For | Trade-off |
|----------|----------|-----------|
| **Frame-by-frame** (sprite sheet rows) | Pixel art, snappy actions | More art work, predictable |
| **Bone-based** (limbs rotated/translated in code) | Fluid characters, fewer files | Needs a rig contract in code; weaker pixel-art feel |

Decide at Art stage and record in the asset manifest — switching after implementation wastes the sprite budget.

---

### SVG Rendering Requirements

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

### UI Styling Direction

| Element    | Retro Style           | Modern Style          |
|------------|-----------------------|-----------------------|
| Font       | `'Press Start 2P'`    | `'Inter', sans-serif` |
| Button     | Raised, 2px border    | Flat, 4px radius      |
| Panel      | Solid bg, 2px border  | Glassmorphism (backdrop-filter) |
| Dialog     | Centered, dark overlay| Centered, blur-bg overlay |

---

### Deliverable Checklist

- [ ] `art-direction.json` with all fields populated
- [ ] Palette constrained to chosen source palette
- [ ] Sprite size documented and consistent
- [ ] SVG crispEdges rendering verified
- [ ] UI font, button, panel styles defined
- [ ] z-index layer map produced
- [ ] Tiling/9-slice/packing decisions recorded for scalable assets
- [ ] Animation approach (frame-by-frame vs bone-based) chosen and recorded
- [ ] Exported to `game-project/design/art-direction.json`

---

# PART 6: game-asset-spec — Asset Specification (asset-manifest.json)

Generates `game-project/design/asset-manifest.json` detailing dimensions, style, prompts, and status for all required game assets.

---

### asset-manifest.json Schema

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

### Complete Example Manifest (Platformer Game)

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

### Asset Naming Conventions

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

### SVG vs PNG Decision Guide

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

### FLUX Prompt Engineering for Background Generation

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

### Asset Dimension Standards by Type

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

### Status Tracking

| Status         | Meaning                                  |
|----------------|------------------------------------------|
| `planned`      | Asset identified, prompt written         |
| `in-progress`  | Draft created, awaiting review           |
| `complete`     | Final version approved and exported      |
| `needs-review` | Flagged as requiring art director signoff|

Transition flow: `planned` → `in-progress` → `complete` (or → `needs-review` → `complete`).

---

### Deliverable Checklist

- [ ] `asset-manifest.json` includes every required asset
- [ ] Each entry has id, type, dimensions, style, prompt, status
- [ ] Naming conventions followed (kebab-case, zero-padded frames)
- [ ] Output format chosen per decision guide
- [ ] Asset dimensions match art-direction.json sprite sizes
- [ ] FLUX prompts written for all background entries
- [ ] Status set to `planned` for all entries
- [ ] Exported to `game-project/design/asset-manifest.json`

---

# PART 7: game-task-plan — Task Planning (DAG Task Graph & Task Briefs)

### DAG Task Structure Specification

Every task in the graph is a JSON object with this exact schema:

```json
{
  "id": "task-001",
  "title": "Implement player movement",
  "agent": "gameplay-programmer",
  "dependencies": [],
  "files": [
    "src/game/entities/player.ts",
    "src/game/__tests__/player.test.ts"
  ],
  "acceptanceCriteria": [
    "Player moves left/right at constant speed when arrow keys are held",
    "Player stops instantly when key is released",
    "Player cannot move outside the game canvas bounds",
    "Movement speed is configurable via a SPEED constant"
  ],
  "estimatedMinutes": 45,
  "risk": "low"
}
```

#### Field Reference

| Field | Required | Description |
|-------|----------|-------------|
| `id` | yes | Unique identifier, format `task-NNN` |
| `title` | yes | Short imperative description |
| `agent` | yes | Role assigned (must match skill name) |
| `dependencies` | yes | Array of task IDs that must complete first |
| `files` | yes | Source files this agent is allowed to edit |
| `acceptanceCriteria` | yes | Measurable pass/fail conditions |
| `estimatedMinutes` | yes | Bounded time estimate |
| `risk` | yes | `low`, `medium`, or `high` |

### Task Decomposition Methodology

#### Step 1: Identify System Boundaries

From the game-spec.json and game-architecture, identify the major systems:

- Input system (keyboard, touch, gamepad)
- Player entity (movement, health, state)
- Physics system (gravity, collision detection)
- Rendering system (draw calls, sprites, layers)
- Audio system (SFX, music)
- UI system (HUD, menus, game over)
- Level system (tilemaps, spawn points)
- Game state machine (boot, menu, playing, paused, game over)

#### Step 2: Top-Down Decomposition

For each system, decompose into tasks:

```
Game State Machine
  ├── task-001: Implement state machine (idle/menu/playing/paused/gameover)
  ├── task-002: Wire keyboard events to state transitions
  └── task-003: Wire pause menu resume/quit buttons

Player Entity
  ├── task-004: Implement player movement (horizontal)
  ├── task-005: Implement player jump (gravity, apex, fall)
  ├── task-006: Implement player health and damage
  └── task-007: Implement player death animation
```

#### Step 3: Assign Dependencies

Rule: If task B needs a type, function, or data structure from task A, then B depends on A.

```
task-004 (player movement) → depends on task-001 (game loop running)
task-005 (player jump)     → depends on task-004 (movement working)
task-006 (player damage)   → depends on task-005 (player in world)
```

#### Step 4: Assign Agents

Map each task to a real subagent type (see `game-start` role matrix) or a specialist skill:

| Agent / Skill | Task Types |
|-------------|------------|
| `gameplay-programmer` | Player, enemies, items, interactions |
| `engine-programmer` | Physics system, collision, game loop, spatial hash |
| `game-ai-programmer` | Enemy AI behaviors, state machines, boss patterns |
| `ui-programmer` | HUD, menus, overlays, pause screen |
| `audio-programmer` (via `game-polish`) | SFX triggers, music manager, volume |
| `level-designer` | Tilemap data, spawn config, parallax layers |

### Dependency Resolution (Topological Ordering)

Use Kahn's algorithm to produce a flat execution order:

```
function topologicalSort(tasks):
  inDegree = map of taskId -> number of unresolved dependencies
  queue = tasks with inDegree === 0
  result = []

  while queue is not empty:
    task = queue.dequeue()
    result.push(task)
    for each dependent in task.dependents:
      inDegree[dependent] -= 1
      if inDegree[dependent] === 0:
        queue.enqueue(dependent)

  if result.length !== tasks.length:
    report CIRCULAR DEPENDENCY ERROR
  return result
```

If circular dependency detected: merge the involved tasks into one larger task, or extract a shared interface task that both can depend on.

### File Ownership Rules

| Rule | Enforcement |
|------|-------------|
| Exclusive write | No two tasks in the same parallel batch may edit the same file. |
| Read allowed | A task may read any file but may only write files listed in its `files` array. |
| Shared interfaces | Place shared types in one owned file (e.g. `src/game/types.ts` per the `game-architecture` blueprint). Only one task may own this file. |
| Ownership registry | Maintain `game-project/design/task-plan.json` with a `fileOwners` map: `{ "src/player.ts": "task-004" }` |
| Handoff protocol | When task A writes a file that task B depends on, A commits and pushes before B starts. |

### Task Brief Composition Template

Each task brief is a markdown document with these sections:

```markdown
# Task Brief: {title}

**ID:** {id}
**Agent:** {agent}
**Dependencies:** {list of task IDs}
**Estimated Time:** {minutes}
**Risk Level:** {risk}

## Allowed Files

- {file path}

## Acceptance Criteria

{numbered list}

## Input Contract

Types/functions available from completed dependencies:

```typescript
import { GameState } from '../core/state'; // available from task-001
```

## Output Contract

Exports this task must provide:

```typescript
export function movePlayer(direction: 'left' | 'right'): void;
```

## Notes

{edge cases, design decisions, constraints}
```

### Risk Identification

#### Circular Dependencies

Symptoms: System A imports from B, B imports from C, C imports from A.

Resolution: Extract the circular dependency into a shared types module that all three depend on. Or merge A, B, C into a single task.

#### Oversized Tasks

Symptoms: Acceptance criteria exceed 8 items. Estimated time exceeds 120 minutes. File list exceeds 5 files.

Resolution: Split into two or more tasks. Identify the natural seam (e.g., separate "movement" from "combat" even though they're in the same entity).

#### Underspecified Tasks

Symptoms: Acceptance criteria use vague terms like "works properly", "feels good", "is responsive".

Resolution: Reject the task brief. Demand specific, measurable criteria: "jump height is exactly 128px", "acceleration reaches max speed in 300ms".

#### Hidden Coupling

Symptoms: Task B is listed as independent but secretly needs a type or function from task A that is not yet specified in A's output contract.

Resolution: Add the missing export to A's output contract, or make B depend on A explicitly.

### Verification Gate Definitions

Each gate must pass before a task moves to the next phase:

| Gate | Phase | Check |
|------|-------|-------|
| G1: Plan Review | After task graph built | No circular deps, all tasks sized correctly, file ownership non-overlapping. |
| G2: Test Gate | After TDD RED | `npm test` fails as expected for new tests. |
| G3: Implementation Gate | After TDD GREEN | `npm test` passes. |
| G4: Quality Gate | After TDD REFACTOR | `npm test` and `npm run lint` exit 0 (plus `npm run build`; this repo has no typecheck script). |
| G5: Integration Gate | After dependency chain complete | Full `npm test` suite passes with all integrated modules. |
| G6: Acceptance Gate | Before marking COMPLETE | Every acceptance criterion verified via test or manual check. |

### Task Plan Output

The final task plan is a JSON file committed to the repository:

```json
{
  "game": "my-game",
  "version": "1.0.0",
  "tasks": [ /* full DAG */ ],
  "fileOwners": { /* file path -> task ID map */ },
  "executionOrder": [ /* topologically sorted task IDs */ ],
  "risks": [ /* identified risks and mitigations */ ]
}
```

---

# PART 8: game-implement — Implementation (TDD RED-GREEN-REFACTOR)

### TDD Workflow: RED-GREEN-REFACTOR

Every implementation follows three strict phases. No skipping.

#### RED — Write a Failing Test First

1. Read the task brief's acceptance criteria. Every criterion maps to at least one test.
2. Place tests in `tests/` as `tests/<module>.test.js` (repo convention; this project is JavaScript, not TypeScript).
3. Use vitest. No separate `vitest.config.ts` is required — vitest picks up `vite.config.js` defaults; add a `test` block there only if new options are needed.
4. Write assertions that describe the desired behavior *before* writing implementation.

```typescript
import { describe, it, expect } from 'vitest';
import { Player } from '../src/entities/player';

describe('Player', () => {
  it('starts with 3 lives', () => {
    const player = new Player();
    expect(player.lives).toBe(3);
  });

  it('loses a life on hit when not invincible', () => {
    const player = new Player();
    player.takeHit();
    expect(player.lives).toBe(2);
  });
});
```

5. Run the test suite. Confirm it fails with the expected error (e.g., `Cannot find name 'Player'`).
6. Commit the RED state: `git commit -m "RED: add failing tests for Player"`

#### GREEN — Minimum Code to Pass

1. Write the *minimum* production code to make the test pass. No extra features.
2. No optimization, no refactoring, no extra methods. Resist scope creep.
3. Run the test. It must pass.

```typescript
export class Player {
  lives = 3;
  invincible = false;

  takeHit(): void {
    if (!this.invincible) {
      this.lives -= 1;
    }
  }
}
```

4. Commit the GREEN state: `git commit -m "GREEN: implement Player with lives and takeHit"`

#### REFACTOR — Clean Up Without Changing Behavior

1. Improve naming, extract duplication, simplify logic.
2. Tests must still pass after every change.
3. Run tests after each refactoring step.
4. Do NOT change public API signatures or behavior.
5. Commit the REFACTOR state: `git commit -m "REFACTOR: clean up Player implementation"`

### Test Framework Setup

This repo already ships vitest. Only add configuration if the defaults need changing
(optionally in `vite.config.js` under a `test` key):

```typescript
// vite.config.js (optional addition)
test: {
  globals: true,
  environment: 'jsdom', // or 'node' for non-DOM code
  include: ['tests/**/*.test.js', 'src/**/*.test.js'],
},
```

Dependencies: vitest is already in `devDependencies`; add `@vitest/coverage-v8` only if coverage is needed.

Scripts already present in this repo's `package.json`:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:game": "vitest run tests/game-manifest.test.js tests/game-asset-storage.test.js tests/game-pipeline-state.test.js tests/game-iframe-bridge.test.js"
  }
}
```

For watch mode use `npx vitest`; for coverage use `npx vitest run --coverage` (requires `@vitest/coverage-v8`).

### File Boundary Rules

| Rule | Description |
|------|-------------|
| Scope lock | Edit ONLY files listed in the task brief's `files` array. |
| No drive-bys | If you need to change a file not in the brief, STOP and escalate. |
| Import allowed | You may import from files outside the boundary but never modify them. |
| One file per test batch | Run tests only for the assigned module, not the full suite, during TDD cycle. |
| Full suite at end | Run full `npm test` before marking task complete. |

### Code Quality Checklist

- [ ] No TODO, FIXME, or debugger statements
- [ ] No `any` types (prefer `unknown` with type guards)
- [ ] Functions are < 20 lines (extract helpers)
- [ ] No magic numbers (use named constants)
- [ ] No `console.log` (use a proper logger or remove)
- [ ] Public methods have JSDoc if non-obvious
- [ ] No unused imports or variables
- [ ] All branches have coverage
- [ ] No `eslint-disable` without explicit justification comment
- [ ] Exports are explicit (no `export *` barrels)

### Verification Protocol

```bash
# Step 1: Run unit tests
npm test

# Step 2: Run linter
npm run lint

# Step 3: Build (bundling errors surface here; this repo has no typecheck script)
npm run build
```

All three must exit with code 0 before marking task COMPLETE.

If a script is missing from `package.json`, report it explicitly — do not assume it passes.

### Handling Ambiguity

When the task brief is unclear, follow this decision tree:

1. **Is the acceptance criteria measurable?** If no, stop and ask: "The acceptance criteria for [X] is not measurable. Can you define a specific assertion?"
2. **Is the expected behavior documented elsewhere?** Check game-spec.json and art-direction.json first.
3. **Two interpretations possible?** Pick the one that requires fewer lines of code and document the decision in a comment.
4. **Missing dependency?** If your module needs a type from another module that doesn't exist yet, create an interface stub (no implementation) and flag it.

### Common Traps

| Trap | Avoidance |
|------|-----------|
| Writing too much GREEN code | Strictly implement only what the test demands. If your test asserts `lives === 3`, do not add `score`, `name`, or `inventory`. |
| Refactoring before GREEN | Refactor phase exists for a reason. Never refactor while tests are failing. |
| Ignoring the full suite | A passing single-module test does not mean the full suite passes. Always run `npm test` at the end. |
| Editing shared types | Shared types affect every module. Never edit them without explicit brief permission. |
| Silent test skips | `it.skip` or `describe.skip` are forbidden. If a test can't be written yet, escalate. |
| Over-mocking | Mock at the boundary (IO, network, rendering). Do not mock internal logic — that defeats TDD. |
| Forgetting coverage | Run `npx vitest run --coverage` (requires `@vitest/coverage-v8`) and verify thresholds before committing. |

---

# PART 9: game-polish — Polish & Juice (Particles, Screen Shake, Audio Direction)

Adds visual juice, hit-stop effects, screen shake, particle explosions, and smooth UI transitions.

---

### Juice Implementation Patterns

#### 1. Screen Shake (Exponential Decay)

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

#### 2. Hit-Stop / Freeze Frame

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

#### 3. Particle Emitter System

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

#### 4. Tween / Easing Functions

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
  static to<T extends object>(obj: T, props: Record<keyof T, number>, duration: number, easing = Easing.easeOutQuad): Promise<void> {
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

### CSS Transition Patterns for UI Elements

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

### Web Audio Procedural SFX Integration

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

### Performance Considerations

| Concern              | Mitigation                                      |
|----------------------|-------------------------------------------------|
| Particle count       | Hard cap at 200 active, pool recycle dead ones  |
| Screen shake         | Limit to 20px max intensity, apply to container |
| Audio latency        | Pre-create AudioContext on first user gesture   |
| CSS transitions      | Use `transform` and `opacity` only (GPU composited) |
| requestAnimationFrame| Single loop, batch all effect updates together  |

---

### Audio Direction (mood-first)

Audio must match the game's mood — mismatched audio breaks immersion faster than missing audio.

#### Decision order
1. **Does the game need audio?** Memory/scope permitting, yes — even minimal SFX lifts juice massively.
2. **Which layers?** Music, SFX, and/or voice. Match the mood: retro = square-wave chiptune SFX; modern/clean = short sine/triangle blips; dark/tense = low sawtooth drones (see `mood.audio` from `game-brainstorm`).
3. **Procedural (default)** — use the Web Audio `SFX` class above: zero download cost, infinite variety.
4. **Pre-made only when needed** — music tracks or complex ambience.

#### Free audio sources (attribute correctly)
| Source | Content | License |
|--------|---------|---------|
| Bfxr / as3sfxr / Chiptone / Leshy SFMaker | Retro SFX generators | Free |
| Incompetech (Kevin MacLeod) | CC music | Attribution required |
| Bensound | CC music | Attribution required |
| SoundCloud CC playlists | Music/ambience | Attribution required |

- Record attribution (title, author, license) in the asset manifest when using any CC asset.
- If the mood demands a track that can't be licensed, generate procedural ambience instead of shipping unlicensed audio.

#### Verification
- [ ] Every sound maps to a spec action (no orphan sounds, no silent actions that need feedback)
- [ ] SFX volume balanced under music (music -6dB relative to SFX is a sane default)
- [ ] AudioContext created on first user gesture (autoplay policy)
- [ ] Mute toggle persists and is reachable from pause
| Hit-stop             | Cap freeze at 10 frames max                     |
| Particle overlap     | Merge overlapping particles in low-end mode     |

---

### Implementation Checklist

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

---

# PART 10: game-smoke-test — Smoke Testing (vitest DOM / Canvas / Input)

### 1. Smoke Test Suite Structure

#### A. DOM Renders
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
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

#### B. Input Events Fire
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

#### C. Game Loop Active
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

#### D. Basic Movement / Collision
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

### 2. Quick Pass/Fail Criteria

| Check | Pass | Fail |
|-------|------|------|
| DOM renders | All elements present | Any element missing |
| Input events | Events dispatch and handlers fire | Events not dispatched or handled |
| Game loop | rAF called, update invoked | No rAF, no update |
| Basic movement | Player position changes correctly | No movement or incorrect boundary |
| **Overall verdict** | All 4 pass | Any 1 fails → full QA pass needed |

---

### 3. When Smoke Tests Are Sufficient

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

### 4. Test Execution Command

Smoke tests live in `tests/` as `tests/*-smoke.test.js` (or alongside game code). Execute with vitest:

```bash
# Run the full suite (includes smoke tests)
npm test

# Run a specific smoke file
npx vitest run tests/game-smoke.test.js

# Run with watch mode during development
npx vitest tests/game-smoke.test.js

# Expected output:
#  ✓ DOM Structure (2 tests)
#  ✓ Input Events (2 tests)
#  ✓ Game Loop (2 tests)
#  ✓ Basic Mechanics (2 tests)
#  → 8 passed, 0 failed, 0 skipped

# Exit code 0 → smoke pass
# Exit code 1 → smoke fail, escalate to full QA
```

> Note: there is no `test:smoke` script in this repo's `package.json`. Run vitest directly,
> or add `"test:smoke": "vitest run tests/*-smoke.test.js"` to `package.json` if a dedicated
> smoke command is wanted.

---

# PART 11: game-qa-plan — QA Planning (Test Plans & Human Playtesting)

### 1. Test Plan Template

#### Section A: Controls & Input Handling

| ID | Description | Precondition | Steps | Expected Result |
|----|-------------|-------------|-------|-----------------|
| C-1 | Arrow keys move player left/right | Game loaded, player spawned | Press ArrowLeft, release, press ArrowRight | Player moves left then right at expected speed |
| C-2 | Spacebar jumps | Player on ground | Press Space | Player Y decreases then returns to ground |
| C-3 | P key pauses/resumes | Game running | Press P, wait 2s, press P again | Game freezes on pause, resumes on unpause |
| C-4 | Mobile tap moves player | Touch device, game loaded | Tap left half, then right half | Player moves to tap position |

#### Section B: Collision Detection

| ID | Description | Precondition | Steps | Expected Result |
|----|-------------|-------------|-------|-----------------|
| COL-1 | Player hits wall | Player facing wall | Move into wall | Player stops at wall boundary |
| COL-2 | Player collects coin | Coin on path | Walk over coin | Coin disappears, score increments |
| COL-3 | Player touches enemy | Enemy on path | Walk into enemy | Player loses life / resets to checkpoint |
| COL-4 | Projectile hits enemy | Enemy visible, player has ammo | Fire projectile at enemy | Enemy health decreases or enemy destroyed |

#### Section C: State Transitions

| ID | Description | Precondition | Steps | Expected Result |
|----|-------------|-------------|-------|-----------------|
| ST-1 | Menu → Play | Game loaded at menu | Click "Start" / press Enter | Game scene loads, player controls active |
| ST-2 | Play → Pause → Play | Game running | Press P, press P | Game loop stops then resumes |
| ST-3 | Play → Game Over | Player at 0 lives | Die | Game Over screen shown with score |
| ST-4 | Game Over → Menu | Game Over screen visible | Click "Main Menu" | Returns to start menu |

#### Section D: Win/Loss Conditions

| ID | Description | Precondition | Steps | Expected Result |
|----|-------------|-------------|-------|-----------------|
| WL-1 | Reach level goal | Level loaded | Navigate to goal trigger zone | Victory screen displayed, score tallied |
| WL-2 | Lose all lives | 1 life remaining | Die once | Game Over triggers |
| WL-3 | Timer expires | Timed level loaded | Wait for timer | Game Over triggers |

#### Section E: Score & Progression

| ID | Description | Precondition | Steps | Expected Result |
|----|-------------|-------------|-------|-----------------|
| SP-1 | Coin awards points | Coin available | Collect coin | Score increases by coin value |
| SP-2 | Enemy kill awards points | Enemy alive | Kill enemy | Score increases by enemy value |
| SP-3 | Score persists across levels | Level 1 completed | Advance to level 2 | Score carries over |

#### Section F: Mobile / Responsive

| ID | Description | Precondition | Steps | Expected Result |
|----|-------------|-------------|-------|-----------------|
| R-1 | Canvas scales to viewport | Game loaded on 375px width | Resize to 768px, then 1920px | Canvas fills width, no overflow |
| R-2 | Touch controls visible | Touch device | Tap controls | Controls respond |
| R-3 | No horizontal scroll | Any device | Swipe in all directions | No overflow scroll |

---

### 2. Test Case Format

```
TC-<section>-<number>: <description>
  Precondition: <state required before test>
  Steps: 1. ... 2. ... 3. ...
  Expected: <observable outcome>
```

---

### 3. Edge Case Enumeration Guide

- **Boundary values**: minimum/maximum scores, lives at 0, timer at 0
- **Rapid input**: mash keys, hold keys, tap faster than expected
- **Empty states**: no enemies loaded, no coins on level
- **Overflow**: score beyond display limit, level count past end
- **Concurrent triggers**: collide with enemy and collect coin same frame
- **Interrupted transitions**: crash mid-save, close tab mid-level

---

### 4. Regression Test Selection Criteria

- Include ALL tests in sections C, D, and E for every regression pass
- Include section A tests if input handling was modified
- Include section B tests if collision physics changed
- Include section F tests if layout/CSS changed
- Re-run full suite before every release: `npm test` (and `npm run test:game` for game suites)
- Execution: smoke tests via `game-smoke-test`, regression comparison via `game-regression`, and record the plan in `game-project/design/test-plan.md`

---

### 5. Test Coverage Checklist

- [ ] Every control input mapped and tested
- [ ] Every collision type tested (player-wall, player-enemy, player-item, projectile-enemy)
- [ ] All state transitions verified forward and backward
- [ ] Win and loss conditions trigger exactly once
- [ ] Score updates immediately and correctly
- [ ] Mobile layout renders without overflow
- [ ] Touch controls functional on at least one touch device
- [ ] Rapid input does not break state machine

---

### 6. Playtesting with Humans

Automated tests prove correctness; human playtests reveal playability. Run at least one human playtest before release.

#### Rules
- **Never self-playtest as the only test** — the designer plays "as intended" and misses what's broken.
- Watch the player live (in person or via screen share) — players often fail to describe bugs; seeing them is faster.
- Give no instructions; observe whether the player figures out the controls and goal unaided.
- Watch for: hesitation >3s (confusing), repeated wrong input (bad mapping), frustration cues (jumping repeatedly at a puzzle).

#### Playtest protocol
1. One player at a time, fresh state, no hints.
2. Note three things: (a) what they struggled with, (b) what delighted them, (c) where they stopped paying attention.
3. Fix the top-1 frustration, then re-test with a NEW player.
4. For every **targeted platform** (Windows/macOS/Linux, Android/iOS, touch vs keyboard), repeat a shortened pass — editor ≠ deployed: it may work in dev and break where it matters.

#### Platform testing checklist
- [ ] Tested on all targeted OS/browser combinations
- [ ] Touch controls tested on a real touch device (not just emulation)
- [ ] Keyboard-only path fully playable
- [ ] Tested with the production build (`npm run build` + deployed worker), not just dev server

---

# PART 12: game-regression — Regression Testing (Baseline Comparison)

### 1. Regression Test Workflow

#### Phase 1: Run Full Test Suite
```bash
npm test                # full vitest suite
npm run test:game       # game-specific suites (manifest, asset storage, pipeline state, iframe bridge)
npm run test:game-studio # studio orchestration suite
npm run test:swarm      # swarm task-graph suites
npm run lint            # static analysis check
npm run build           # production build (catches bundling errors)
```

Note: this repo is JavaScript (no TypeScript), so there is no `typecheck` script — `npm run build`
plus `npm run lint` cover static correctness.

#### Phase 2: Compare With Baseline
- Baseline is stored in `test-results/baseline/` as a JSON snapshot
- Vitest JSON output: `npm test -- --reporter=json --outputFile=test-results/current/latest.json`
- Compare current run against baseline with `scripts/compare-test-results.mjs`
- Show pass/fail diff between current run and baseline

```
Test Results Diff:
  Passed: 47 (unchanged)
  Failed: 2 (NEW — see below)
  Skipped: 1 (unchanged)
```

#### Phase 3: Identify New Failures
- Filter for tests that passed in baseline but fail now:
  ```bash
  node scripts/compare-test-results.mjs \
    --baseline test-results/baseline/latest.json \
    --current test-results/current/latest.json \
    --output test-results/diff.json
  ```
- For each new failure, capture:
  - Test ID and description
  - Error message and stack trace
  - File and line number
  - Whether failure is deterministic or flaky

#### Phase 4: Isolate Regression Cause
- Check diff of changed files: `git diff --name-only HEAD~1`
- Cross-reference changed files with failing test paths
- If no obvious link, run `git bisect`:
  ```bash
  git bisect start
  git bisect bad HEAD
  git bisect good <commit-before-bug>
  npm test  # at each step
  ```

---

### 2. Test Suite Execution Commands

| Scope | Command | Expected Duration |
|-------|---------|-------------------|
| Full suite | `npm test` | ~1-2 min |
| Game suites | `npm run test:game` | ~30s |
| Studio suite | `npm run test:game-studio` | ~30s |
| Specific file | `npx vitest run tests/<file>.test.js` | ~10s |

---

### 3. Baseline Comparison Method

- Baseline snapshots stored at `test-results/baseline/YYYY-MM-DD--<commit-hash>.json`
- Latest baseline symlink: `test-results/baseline/latest.json`
- Create a baseline from a known-good run:
  ```bash
  mkdir -p test-results/baseline
  npm test -- --reporter=json --outputFile=test-results/baseline/latest.json
  ```
- Compare with:
  ```bash
  node scripts/compare-test-results.mjs \
    --baseline test-results/baseline/latest.json \
    --current test-results/current/latest.json \
    --output test-results/diff.json
  ```
- Diff format: `{ added: [...], removed: [...], changed: [...], same: number }`

---

### 4. Collateral Damage Assessment

For each changed file, check all tests that depend on that module:

```bash
# Find tests importing a changed module (repo has no src/game/; adjust glob to the real module path)
rg "from '\.\./src/game/physics'" tests/
rg "from '\.\./src/game/player'" tests/
```

If a core module changed (physics, player, state machine), flag ALL dependent suites for re-run regardless of baseline status.

---

### 5. Pass/Fail Reporting Format

```json
{
  "timestamp": "2026-07-30T12:00:00Z",
  "baseline": "2026-07-29--abc1234",
  "total": 48,
  "passed": 45,
  "failed": 2,
  "skipped": 1,
  "new_failures": [
    {
      "id": "COL-3",
      "description": "Player touches enemy loses life",
      "error": "Expected player.lives to be 2, got 3",
      "file": "tests/collision.test.js:42"
    }
  ],
  "regression_verdict": "FAIL — do not release"
}
```

---

### 6. Quick Reversion Criteria

Revert the offending commit immediately if:
- Any CRITICAL test case fails (game crash, broken controls)
- 3+ IMPORTANT test cases fail in the same module
- >=20% of the total test suite fails
- Baseline comparison shows >5 new failures

Revert command:
```bash
git revert HEAD --no-edit
npm test    # verify revert passes
```

If failure is minor (<=2 MINOR, no IMPORTANT/CRITICAL), file a bug and proceed with known-issues list.

---

# PART 13: game-performance-review — Performance Review (Frame Timing & Memory Audits)

### 1. Frame Timing Audit Checklist

#### rAF Loop Delta Clamping
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

#### No Allocations in Hot Paths
- [ ] No `new` objects inside update loop
- [ ] No array spread `[...arr]` inside render or physics
- [ ] No string concatenation in render path
- [ ] Avoid `Map` / `Set` iteration in hot path (prefer arrays)

#### Object Pooling for Particles / Entities
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

#### Draw Call Batching
- [ ] Same texture sprites batched into single draw call
- [ ] No `ctx.save()`/`ctx.restore()` in per-entity loops
- [ ] Canvas `clearRect` called once per frame, not per entity
- [ ] OffscreenCanvas used for static backgrounds

---

### 2. Asset Audit

| Check | Limit | Action if Exceeded |
|-------|-------|-------------------|
| Base64 inline image size | <10KB | Move to external file |
| Individual sprite texture | <256x256 | Downscale or split |
| Total PNG/JPEG assets | <2MB combined | Optimize with tinypng |
| Audio file per asset | <200KB | Use lower bitrate OGG |
| Total asset fetch count | <50 requests | Sprite-sheet / atlasing |

---

### 3. Memory Leak Patterns

| Pattern | Detection | Fix |
|---------|-----------|-----|
| DOM nodes removed but referenced | Heap snapshot — detached DOM tree count >0 | Null references on unmount |
| Event listeners not cleaned up | `getEventListeners()` in DevTools or manual audit | `removeEventListener` in cleanup |
| rAF not cancelled on unmount | Timer tab in DevTools shows active rAF | Store rAF id, call `cancelAnimationFrame` |
| Closure retaining large objects | Heap snapshot — retainers path | Re-architect or null captured vars |
| `setInterval` without clear | Timer count grows on each level load | `clearInterval` on unmount |

---

### 4. Performance Budget Table

| System    | Budget per Frame (16ms target) | Measurement Tool               |
|-----------|-------------------------------|--------------------------------|
| Physics   | 4ms                           | `performance.now()` wrapping step |
| Render    | 8ms                           | DevTools Performance — Frames tab |
| Input     | <1ms                          | console.time / timeEnd          |
| Audio     | 2ms                           | Web Audio `currentTime` diff    |
| AI / Logic| 2ms                           | Profiler flame chart            |
| **Total** | **≤16ms**                     | rAF callback duration           |

If total exceeds 16ms consistently, reduce render budget first (most common offender).

#### Target Frame Rate

Not every game needs 60 FPS. Set an explicit target and clamp the loop:

| Genre | Target FPS | Why |
|-------|-----------|-----|
| Platformer / fighter / bullet hell | 60 | Reaction-critical, motion clarity |
| Puzzle / visual novel / card game | 30 | Input-driven, slow visuals |
| Sim / strategy with heavy simulation | 30 | Save CPU for sim ticks |

```typescript
const TARGET_FPS = 60;
const FRAME_MS = 1000 / TARGET_FPS;
let last = performance.now();
function frame(now: number) {
  const dt = Math.min(now - last, FRAME_MS * 2);
  last = now;
  update(dt);
  render();
}
```

Set the target in `config.ts` (per `game-architecture`) and use it for all budgets above. A lower target lets the device spend less time rendering and reduces heat/battery drain.

#### Culling (skip invisible work)

- **Off-screen entities**: skip update+render for entities outside the viewport (broad-phase AABB vs camera rect).
- **Distant particles**: pause particle emitters off-screen; reset on return.
- **Parallax layers**: render only layers intersecting the camera view.
- **Canvas clipping**: use `ctx.clip()` to the visible rect once per frame for huge worlds.

#### Asset Compression

| Asset | Rule |
|-------|------|
| Texture | Multiple of 4 (or power of 2) dimensions; spritesheet packing; PNG8 for flat palettes |
| Audio | SFX as procedural Web Audio (zero cost) or compressed OGG; stream music instead of preloading all tracks |
| SVG | Inline critical icons, reference the rest; strip unnecessary precision |

---

### 5. Tools

#### Chrome DevTools Performance Tab
1. Open DevTools → Performance
2. Click "Record" → play game for 5s → "Stop"
3. Check "Frames" section — red bars indicate dropped frames
4. Flame chart — identify functions with >4ms self time
5. Bottom-up tab — sort by "Self Time" to find hot functions

#### React DevTools Profiler (if using React)
1. React DevTools → Profiler tab
2. Click record → interact → stop
3. Look for unnecessary re-renders (highlighted in yellow/red)
4. Check `why-did-you-render` logs

#### Quick Audit Script
```bash
# Check for common perf anti-patterns (rg uses -g for globs; --type <name> for known types)
rg "Date\.now\(\)" src --type js
rg "new " src -g '*.js'    # allocations in hot paths
rg "ctx\.save\(\)" src --type js    # save/restore in loops
rg "\.push\(" src --type js         # array growth in hot path
```

Adjust `src`/globs to the actual game module path (per the `game-architecture` blueprint).

---

# PART 14: game-bug-triage — Bug Triage (Severity & Fix Verification)

### 1. Severity Classification Guide

#### CRITICAL
- Game crash on startup or during core loop
- Broken player controls (movement, jump, fire, pause)
- Loss of progress (save/load failure, level restart broken)
- Blocked path — player cannot advance past a required gate
- Audio feedback loop / unresponsive input
- Multiplayer desync that breaks gameplay

#### IMPORTANT
- Visual glitch (z-index break, sprite flicker, missing frame)
- Incorrect score calculation or progression tracking
- Missing sound effect or music cue
- Edge case crash (e.g. rapid input, corner collision)
- UI element misalignment or clipping
- Game-over / victory condition triggers incorrectly

#### MINOR
- Typo in UI text or instructions
- Cosmetic issue (color mismatch, border radius off by 1-2px)
- Non-standard behavior on unsupported browser
- Animation timing slightly off (no gameplay impact)
- Missing favicon or meta tags

---

### 2. Bug Report Template

```md
### Title
[CRITICAL|IMPORTANT|MINOR] Short description

### Severity
CRITICAL / IMPORTANT / MINOR

### Steps to Reproduce
1. Start the game (node: `npm run dev`)
2. Press [specific key/click]
3. Observe result

### Actual Result
What actually happens

### Expected Result
What should happen per spec

### Environment
- Browser: Chrome 115 / Firefox 128
- OS: Windows 11 / macOS 14
- Screen size: 1920x1080
- Build: commit hash or branch
```

---

### 3. Routing Rules

| Severity  | Assigned Agent         | SLA     |
|-----------|------------------------|---------|
| CRITICAL  | `lead-programmer`      | <1 hour |
| IMPORTANT | `gameplay-programmer` / `engine-programmer` / `ui-programmer` (per affected module) | <4 hours|
| MINOR     | backlog                | <1 week |

Routing command (PowerShell on Windows):
```
scripts/agy-delegate.ps1 -Mode Implement -Task '[severity] bug: <title>' -Assignee <agent>
```
On Linux/macOS use the shell equivalent:
```
bash scripts/agy-delegate.sh -Mode Implement -Task '[severity] bug: <title>' -Assignee <agent>
```

---

### 4. Reproduction Steps Validation

- [ ] Steps are numbered and unambiguous
- [ ] Steps start from a known clean state (fresh page load)
- [ ] Preconditions are listed (e.g. "player must have 3 lives")
- [ ] Steps are minimal — no extraneous actions
- [ ] Reproduced on two different browsers before filing
- [ ] Console errors captured (attach screenshot/log)

---

### 5. Fix Verification Criteria

- [ ] Bug is no longer reproducible using the same steps
- [ ] No regression in related systems (run smoke suite)
- [ ] Fix is covered by a new or updated test case
- [ ] Exit code of test suite is 0
- [ ] Visual inspection passes (if UI bug)
- [ ] Code review approved for the fix commit

---

### 6. Triage Workflow Summary

**Receive** → **Classify severity** → **Validate reproduction** →
**Route to agent** → **Verify fix** → **Close or escalate**

---

# PART 15: game-code-review — Code Review (Spec Compliance & Safety Audit)

Structured code review playbook for browser-based games. This skill enforces best practices across
performance, memory management, specification compliance, security, and code quality.

```
  ┌──────────────────────────────────────────────────────────────┐
  │  GAME CODE REVIEW WORKFLOW                                   │
  │  1. Spec Compliance Scan    -- Compare code to game-spec     │
  │  2. Frame-Rate Audit        -- Inspect rAF hot paths         │
  │  3. Memory & Leak Check     -- Listener/interval cleanup      │
  │  4. Security Scan           -- Injections, secrets, eval     │
  │  5. Code Quality Pass       -- Types, magic numbers, errors  │
  │  6. Findings Report         -- Structured JSON output         │
  └──────────────────────────────────────────────────────────────┘
```

---

### 1. Review Checklist Sections

#### 1A. Frame-Rate Impact

Inspect every function called inside or indirectly from `requestAnimationFrame`.
Allocation in a rAF loop is the #1 cause of frame drops.

- [ ] No object allocations inside rAF callbacks (no `new X`, no `{...}` spread, no `[...arr]`).
- [ ] No `JSON.parse` or `JSON.stringify` in per-frame code paths.
- [ ] Draw calls are batched; no redundant `ctx.save()`/`ctx.restore()` per entity.
- [ ] No `map`, `filter`, `reduce` inside hot loops -- prefer `for`/`while` with pre-allocated arrays.
- [ ] Particle systems cap active particles and reuse pooled objects instead of splice-shifting.
- [ ] Canvas dimensions match CSS display size (avoids implicit rescale cost).
- [ ] No `querySelector` or DOM reads inside rAF (forces layout reflow).
- [ ] Delta-time is clamped (`Math.min(dt, 0.1)`) to avoid spiral-of-death on tab resume.

```javascript
// PASS -- no allocation, no layout thrash
function updatePositions(entities, dt) {
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i];
    e.x += e.vx * dt;
    e.y += e.vy * dt;
  }
}

// FAIL -- allocates new array every frame
function updatePositionsBAD(entities, dt) {
  entities.forEach(e => {
    e.x += e.vx * dt;
    e.y += e.vy * dt;
  });
}
```

#### 1B. Memory & Leaks

JavaScript garbage collection pauses cause visible stutter. Every subscription
must have a corresponding unsubscribe.

- [ ] Every `addEventListener` has a paired `removeEventListener` referencing the same handler function (not an anonymous inline).
- [ ] `requestAnimationFrame` ID is saved; `cancelAnimationFrame(id)` called on unmount or game-over.
- [ ] `setInterval` / `setTimeout` IDs are saved; `clearInterval` / `clearTimeout` called on cleanup.
- [ ] No detached DOM references held in closures (prevents subtree GC).
- [ ] Web Audio `AudioContext` is suspended, not closed (or properly closed on unmount).
- [ ] Object pools are drained/reset between levels, not leaked.
- [ ] No global arrays that grow unbounded (replay logs, entity arrays -- cap or ring-buffer).

```javascript
// PASS -- proper cleanup pattern
useEffect(() => {
  let animId;
  const loop = () => { animId = requestAnimationFrame(loop); };
  animId = requestAnimationFrame(loop);

  const onKey = (e) => handleInput(e);
  window.addEventListener('keydown', onKey);

  return () => {
    cancelAnimationFrame(animId);
    window.removeEventListener('keydown', onKey);
  };
}, []);
```

#### 1C. Spec Compliance

Cross-reference every requirement in `game-spec.json` against the implementation.

- [ ] Controls match spec (WASD / Arrows / Touch input maps match documented layout).
- [ ] Win condition triggers at the correct state transition and score threshold.
- [ ] Loss condition triggers at zero health, timeout, or fall-off-map as specified.
- [ ] Score calculation matches formula in spec (no off-by-one, no missing multiplier, no integer truncation where float expected).
- [ ] Level/wave progression increments at the correct trigger point.
- [ ] Enemy spawn timing and count match spec intervals.
- [ ] Power-up effects have correct duration and magnitude.
- [ ] Invincibility frames / respawn invulnerability window matches spec duration.
- [ ] Sound effect mappings: every named sound in spec (`jump`, `hit`, `coin`, `explosion`, `gameover`) has a corresponding `playSound()` call.

```javascript
// PASS -- score matches spec formula: base + (combo * multiplier)
function calculateScore(base, combo, multiplier) {
  return base + (combo * multiplier);
}

// FAIL -- omits multiplier from spec
function calculateScoreBAD(base, combo) {
  return base + combo;
}
```

#### 1D. Security

Browser games are packaged as static bundles; secrets and injection vectors
must be eliminated.

- [ ] No `innerHTML`, `outerHTML`, `insertAdjacentHTML`, or `dangerouslySetInnerHTML` with any user-supplied or dynamically-computed content.
- [ ] No `eval`, `new Function()`, `setTimeout(string)`, or `setInterval(string)` anywhere.
- [ ] No API keys, tokens, secrets, or database URLs in client-side bundle (verify by grep for `api_key`, `secret`, `password`).
- [ ] No unsanitized `location.hash`, `location.search`, `postMessage` data written to DOM.
- [ ] localStorage/sessionStorage values are validated on read (type-check, length-check) before use.
- [ ] No `document.write` or `document.open` calls.
- [ ] Third-party CDN scripts are pinned to a specific version (no `@latest` or semver ranges).

```javascript
// PASS -- safe text insertion
const el = document.getElementById('score');
el.textContent = String(score);

// FAIL -- XSS vector
const el = document.getElementById('score');
el.innerHTML = '<span>' + score + '</span>';
```

#### 1E. Code Quality

Readability and maintainability directly affect iteration speed.

- [ ] No magic numbers (all numeric literals > 1 are named constants).
- [ ] Consistent error handling: either all-`try/catch` or all-result-object, never mixed.
- [ ] TypeScript: all function parameters and return types are explicitly typed (no `any`).
- [ ] React: props are typed via interface/type, component names are PascalCase.
- [ ] File length under 400 lines of logic (extract helpers, constants, types to separate files).
- [ ] No commented-out code blocks left in source.
- [ ] Exports are explicit (named exports, not `export default` anonymous objects).
- [ ] Consistent naming: verbs for functions (`handleJump`), nouns for values (`playerVelocity`), booleans prefix with `is`/`has`/`can`.

---

### 2. Review Output Format

#### Output Files

The review writes TWO files:

| File | Path | Contents |
|------|------|----------|
| Findings | `docs/review/findings.json` | Structured JSON per schema below |
| Report | `docs/review/code-review.md` | Human-readable summary for `game-release-check` |

`docs/review/` is created on demand by this skill; the Producer's `game-release-check`
collects `docs/review/code-review.md` into release evidence, so these paths MUST NOT be
relocated without updating `game-release-check` too.

All findings must be reported as structured JSON conforming to the schema below.
Each finding is a single object; findings are collected in an array.

```json
{
  "findings": [
    {
      "id": "FR-001",
      "severity": "critical",
      "category": "frame-rate",
      "file": "src/engine/gameLoop.ts",
      "line": 42,
      "summary": "Object allocation inside rAF loop creates GC pressure every frame",
      "detail": "Spread operator on line 42 creates a new object each frame. Move the spread to initialization or mutate in place.",
      "code": "this.entities = [...this.entities, entity];",
      "recommendation": "Use push() or pre-allocated array with index tracking.",
      "spec_ref": null,
      "pass": false
    },
    {
      "id": "SC-001",
      "severity": "major",
      "category": "spec-compliance",
      "file": "src/game/score.ts",
      "line": 18,
      "summary": "Score formula omits combo multiplier required by spec",
      "detail": "spec.json section 3.2 defines score as `base * (1 + combo * multiplier)`. Implementation uses `base + combo * multiplier`.",
      "code": "return base + (combo * multiplier);",
      "recommendation": "Change to `return base * (1 + combo * multiplier);`",
      "spec_ref": "game-spec.json#/mechanics/scoring/formula",
      "pass": false
    }
  ],
  "meta": {
    "reviewed_by": "game-code-review",
    "review_date": "2026-07-30",
    "spec_version": "1.2.0",
    "files_reviewed": ["src/engine/gameLoop.ts", "src/game/score.ts", "src/ui/HUD.tsx"],
    "total_findings": 2,
    "critical": 1,
    "major": 1,
    "minor": 0,
    "pass_count": 14
  }
}
```

#### Severity Levels

| Level | Label | Definition | Action Required |
|-------|-------|------------|-----------------|
| 1 | critical | Causes crash, freeze, data loss, or security vulnerability | Must fix before merge |
| 2 | major | Functional bug, spec deviation, significant performance issue | Must fix before release |
| 3 | minor | Code smell, style violation, minor performance concern | Fix if time permits |
| 4 | advisory | Suggestion, optional improvement | Document for backlog |

#### Category Values

- `frame-rate` -- hot-path allocation, layout thrash, draw-call batching
- `memory-leak` -- listener/subscription/timer cleanup
- `spec-compliance` -- mismatch with game-spec.json or art-direction.json
- `security` -- injection vector, secret exposure, unsafe API
- `code-quality` -- magic numbers, typing, naming, structure
- `accessibility` -- keyboard nav, contrast, aria labels (when UI reviewed)

---

### 3. Common Failure Patterns (Anti-Patterns)

Catch these recurring issues during review:

#### Performance

- **Spread-in-loop**: `this.particles = [...this.particles, p]` in rAF. Use `.push()` or pre-allocated ring buffer.
- **JSON-in-hotpath**: `JSON.parse(JSON.stringify(obj))` inside update loop for deep clone. Use structured assign or `structuredClone` only at init.
- **querySelector-per-frame**: DOM lookup every animation frame. Cache selector in a ref on mount.
- **Unclamped-delta**: No `Math.min(dt, max)` leads to physics explosion after tab-away.

#### Memory

- **Listener-leak-anonymous**: `window.addEventListener('keydown', (e) => { ... })` without storing reference for removal. Always use named function or a stored ref.
- **Interval-orphan**: `setInterval(saveGame, 10000)` on mount, no `clearInterval` in cleanup.
- **DOM-reference-stale**: Hiding an element but keeping a `useRef` pointing to it, preventing GC.

#### Spec

- **Off-by-one-wave**: Wave increment happens before spawn check, causing extra entities.
- **Missing-multiplier**: Score calculated without spec-defined combo multiplier.
- **Wrong-input-map**: Arrow keys mapped to `'up'`/`'down'` instead of `'left'`/`'right'` for horizontal movement.
- **Sound-name-mismatch**: Spec says `'coin'` but code calls `'collect'` -- no sound plays.

#### Security

- **Player-name-innerHTML**: `element.innerHTML = playerName` allows XSS if name contains `<script>`.
- **eval-for-math**: `eval('player.x + player.vx * dt')` used for dynamic formula.
- **Hardcoded-api-key**: Firestore or API key visible in client bundle.
- **Unvalidated-localStorage**: `JSON.parse(localStorage.getItem('save'))` without try/catch kills entire game on corrupt data.

#### Code Quality

- **Magic-health-value**: `if (health < 0)` instead of `if (health <= MIN_HEALTH)`.
- **Any-type-abuse**: `function update(entity: any)` instead of `function update(entity: Entity)`.
- **Long-file**: Single file exceeding 600 lines with mixed concerns (physics + rendering + audio + UI).
- **Silent-catch**: `try { ... } catch {}` with no error logging or user feedback.

---

### 4. Verification Checklist

After completing the review pass, execute these verification steps:

- [ ] `docs/review/findings.json` and `docs/review/code-review.md` are written (create `docs/review/` if missing).
- [ ] All findings are recorded in the structured JSON output schema.
- [ ] Each finding has a unique ID, severity, category, file, line, and recommendation.
- [ ] Every spec requirement in `game-spec.json` has a corresponding PASS/FAIL entry.
- [ ] Frame-rate audit inspected every function reachable from `requestAnimationFrame`.
- [ ] Event listener cleanup verified for every `addEventListener` / `useEffect`.
- [ ] Security scan confirmed zero occurrences of `innerHTML`, `eval`, `Function`, secrets.
- [ ] Magic numbers pass: no bare numeric literals > 1 outside constant declarations.
- [ ] TypeScript strictness confirmed: no `any` types in reviewed files.
- [ ] Findings are handed off to `primary-executor` or `game-implement` for remediation.
- [ ] After fixes, re-review targets ONLY the changed lines (regression-free delta review).

---

# PART 16: game-visual-review — Visual Review (Screenshot Compliance)

Evaluates captured screenshot files from project review directories against `art-direction.json` and outputs structured findings.

> **Screenshot location:** captures go to `review/screenshots/` and findings to `review/findings/`
> (both created on demand — they do not exist until this skill creates them). The Producer's
> `game-release-check` copies `review/screenshots/` into `release-evidence/<version>/screenshots/`.
> For the Corez app itself, pre-captured UI screenshots already live in `artifacts/ui/`
> (e.g. `corez-desktop-1440.png`, `corez-phone-390.png`) and can be reviewed directly without a browser.

---

### Review Process: Capture → Compare → Report

```
step 1: CAPTURE
  ├── Load game in browser at target resolution
  ├── Capture screenshot → `review/screenshots/{scene}-{timestamp}.png` (mkdir -p review/screenshots first)
  ├── Alternative: reuse existing captures in `artifacts/ui/`
  └── Record: viewport size, scene description, timestamp

step 2: COMPARE
  ├── Reference `game-project/design/art-direction.json`
  ├── Open capture in image viewer / pixel analysis tool
  └── Check each compliance category below

step 3: REPORT
  └── Write structured findings → `review/findings/{scene}-review.json` (mkdir -p review/findings first)
```

---

### Art-Direction Compliance Checklist

#### 1. Color Palette Matching

- [ ] Every visible color in the screenshot exists in the declared palette
- [ ] Background color matches `palette.background` declared value
- [ ] Text color contrast ratio >= 4.5:1 against its background (WCAG AA)
- [ ] No out-of-palette colors in sprite regions
- [ ] Highlight/glow effects use `palette.highlight`

Test: Sample at least 5 pixels from background, 5 from sprites, 5 from UI. Compare hex values against allowed palette set.

#### 2. Sprite Fidelity

- [ ] Sprite dimensions match `sprites.default_size` declaration
- [ ] Edges are sharp — no anti-aliasing blur on pixel art
- [ ] Pixel grid alignment: sprites occupy integer pixel positions
- [ ] Sprite color count <= `sprites.max_colors`
- [ ] No unintended banding or color bleeding
- [ ] Animation frames are consistent in style and palette

Test: Zoom to 400-800% in image viewer. Verify individual pixel placement is intentional (no half-pixel offsets, no sub-pixel anti-aliasing blur).

#### 3. UI Consistency

- [ ] Font family matches `ui.font_family` declaration
- [ ] Base font size matches `ui.font_size_base`
- [ ] Button style matches `ui.button_style` (flat/raised/retro/neon)
- [ ] Panel style matches `ui.panel_style` (solid/transparent/bordered)
- [ ] Border radius values consistent with `ui.border_radius`
- [ ] All interactive elements have consistent hover/active states

#### 4. Visual Hierarchy (z-index / Layering)

- [ ] Background renders at z-index layer `ui.z_index_layers.background`
- [ ] Game content renders above background layer
- [ ] HUD elements render above game content
- [ ] Controls/buttons render above HUD
- [ ] Overlays (pause, dialog) render above all game content
- [ ] Modals render at highest layer
- [ ] No z-index collisions or elements clipping through wrong layers

---

### Structured Findings Output Format

Output file: `review/findings/{scene}-review.json`

```json
{
  "review": {
    "scene": "level-1-gameplay",
    "screenshot": "review/screenshots/level-1-gameplay-20250730.png",
    "art_direction_ref": "game-project/design/art-direction.json",
    "timestamp": "2025-07-30T14:30:00Z",
    "result": "FAIL",
    "findings": [
      {
        "file": "review/screenshots/level-1-gameplay-20250730.png",
        "severity": "error",
        "category": "palette",
        "description": "Sprite region at (120, 84) contains color #ff00ff which is not in declared PICO-8 palette",
        "expected": "#ff77a8 or #ff004d",
        "actual": "#ff00ff"
      }
    ],
    "summary": {
      "total": 3,
      "errors": 1,
      "warnings": 2,
      "passes": 5
    }
  }
}
```

Severity levels:
| Severity   | Meaning                                      |
|------------|----------------------------------------------|
| `error`    | Breaks spec, must fix before release         |
| `warning`  | Deviates from spec but not blocking          |
| `info`     | Observation, non-blocking suggestion         |

---

### Common Visual Regressions

| Issue                          | Likely Cause                             |
|--------------------------------|------------------------------------------|
| Anti-aliased sprite edges      | `image-rendering` CSS missing            |
| Wrong background color         | Palette source mismatch                  |
| Font mismatch                  | Web font not loaded or fallback active   |
| UI element overlaps game layer | z-index layer map not implemented        |
| Color banding in gradient      | PNG saved at low bit depth               |
| Blurry scaled sprite           | Non-integer scale or missing crispEdges  |
| Missing hover state            | CSS `:hover` pseudo-class not styled     |
| Pixel misalignment             | Sprite position not rounded to integer   |

---

### Pass/Fail Criteria

| Result | Condition                                                       |
|--------|-----------------------------------------------------------------|
| PASS   | Zero errors. Warnings <= 3. All mandatory checklist items pass. |
| FAIL   | One or more errors, or >3 warnings, or any critical failure.    |

Critical failures (immediate FAIL):
- Out-of-palette color detected
- Font unreadable (contrast < 3:1)
- z-index layer violation causing occlusion
- Sprite dimensions off by more than 1px
- HUD element completely invisible

---

### Deliverable Checklist

- [ ] Screenshots captured for each distinct scene/game state
- [ ] Palette compliance checked for all screenshots
- [ ] Sprite fidelity verified at 400%+ zoom
- [ ] UI consistency verified against art-direction spec
- [ ] z-index layering confirmed no overlaps
- [ ] Findings JSON written to `review/findings/{scene}-review.json`
- [ ] Pass/fail result documented
- [ ] Regressions communicated to development team

---

# PART 17: game-release-check — Release Gate (Final Signoff Checklist)

### 1. Final Signoff Checklist

Every release candidate must pass ALL checks below. If any check is ❌, the release is BLOCKED.

```
Checklist for Release <version> (commit <hash>)
===============================================

 QA Test Suite Passes
   [ ] Full regression suite: exitCode === 0
   [ ] Smoke test suite: exitCode === 0
   [ ] All new tests pass

 Code Review Approved
   [ ] No CRITICAL findings
   [ ] All IMPORTANT findings resolved or documented
   [ ] MINOR findings fewer than 3, no gameplay impact

 Visual Inspection Passed
   [ ] Screenshots match art-direction.json spec
   [ ] Z-index layering conforms to spec (Background z:0, Content z:10, HUD z:20, Overlays z:40+)
   [ ] Responsive layout verified at 375px, 768px, 1440px

 Performance Budget Met
   [ ] 60 FPS sustained for 30s of normal gameplay
   [ ] Physics ≤4ms, Render ≤8ms, Input <1ms, Audio ≤2ms
   [ ] No frame drops in DevTools Performance recording

 Bug Triage
   [ ] Zero open CRITICAL bugs
   [ ] Zero open IMPORTANT bugs
   [ ] All MINOR bugs accepted as known-issues list (max 5)

 Mobile / Responsive Verified
   [ ] Canvas scales without overflow
   [ ] Touch controls functional
   [ ] No horizontal scroll on any viewport width
```

---

### 2. Evidence Collection Requirements

Before signoff, collect and attach the following artifacts:

| Check | Evidence | Storage Path |
|-------|----------|-------------|
| QA suite | `npm test` terminal output | `release-evidence/<version>/test-output.txt` |
| Code review | Review report from code-reviewer (written by `game-code-review` to `docs/review/`) | `release-evidence/<version>/code-review.md` |
| Visual inspection | Screenshots (menu, gameplay, pause, game-over) — captured by `game-visual-review` to `review/screenshots/` | `release-evidence/<version>/screenshots/` |
| Performance | DevTools recording export (.json) | `release-evidence/<version>/performance-profile.json` |
| Bug triage | Bug tracker snapshot or list | `release-evidence/<version>/known-issues.md` |

Collection command:
```bash
mkdir -p release-evidence/<version>/screenshots
npm test > release-evidence/<version>/test-output.txt 2>&1
cp docs/review/code-review.md release-evidence/<version>/
cp -r review/screenshots/* release-evidence/<version>/screenshots/
# manually add performance profile
```

---

### 3. Gate Failure Handling

#### Soft Failure (non-blocking — proceed with note)
- 1-2 MINOR bugs accepted as known-issues
- Performance within 10% of budget (17.6ms frames occasionally)
- Code review has minor style suggestions only

#### Hard Failure (release BLOCKED)
- Any CRITICAL or IMPORTANT bug open
- Test suite exitCode !== 0
- Code review has CRITICAL finding (safety, security, data loss)
- Performance budget exceeded by >20%
- Visual spec mismatch in core gameplay screens

On hard failure:
1. Record the failing gate and evidence
2. Tag release as `BLOCKED-<reason>` in commit message
3. Route to appropriate agent via bug triage
4. Schedule re-check after fix
5. Do not push release tag

---

### 4. Release Artifact Preparation

When all checks pass:

```bash
# 1. Tag the release
git tag -a "v<version>" -m "Release v<version>"

# 2. Build production bundle
npm run build

# 3. Verify build output exists
ls -la dist/  # or build/ or out/

# 4. Create release notes
cat > RELEASE_NOTES.md << 'EOF'
# Release v<version>
Date: <YYYY-MM-DD>
Commit: <hash>

## What's New
- 

## Bug Fixes
- 

## Known Issues
- 

## Verification
- QA: exitCode 0 (see release-evidence/<version>/test-output.txt)
- Code review: approved (see release-evidence/<version>/code-review.md)
- Performance: 60fps sustained (see release-evidence/<version>/performance-profile.json)
EOF

# 5. Push
git push origin v<version>
```

---

### 5. Signoff Authority Matrix

| Role              | Can Signoff QA? | Can Signoff Code? | Can Signoff Release? |
|-------------------|:---:|:---:|:---:|
| QA Lead           | ✅  | ❌  | ❌  |
| Code Reviewer     | ❌  | ✅  | ❌  |
| Technical Director| ✅ | ✅ | ❌  |
| Producer          | ❌  | ❌  | ✅  |

Only the **Producer** may give final release signoff. All prior gates must show evidence of approval from the appropriate authority.

#### Signoff Statement

> "I confirm that all gates have passed, evidence is collected at `release-evidence/<version>/`, and this release is ready for deployment."
>
> — `<Producer Name>`, `<YYYY-MM-DD>`

---

# PART 18: game-publish — Publishing & Marketing (Distribution, Press Kit, Launch)

The final stage of the game pipeline. Applies AFTER `game-release-check` signoff: the game is finished, tested, and verified — this skill ships it to players and tells people it exists.

---

### 1. Distribution Platforms (pick per target)

| Platform | Type | Cost | Notes |
|----------|------|------|-------|
| itch.io | PC/Web | Free | Best default for browser games; instant page, supports HTML5 embedding |
| Newgrounds | Web | Free | Strong for browser games; active community voting |
| Kongregate | Web | Free | Browser focus; larger competition |
| Game Jolt | PC/Web | Free | Good indie community |
| GitHub Pages | Web | Free | Simple static hosting via `user.github.io/repo` |
| Google Play | Mobile | $25 one-time | Needs wrapper (e.g. Capacitor) for web games |
| Steam | PC | $100/game | Steam Direct; requires desktop build |

For a CoreZ browser game the default is: **itch.io page + GitHub Pages demo link**, then optionally a storefront per the user's goal.

#### Page essentials (every platform)
- Title, tagline, and the **hook** from `game-brainstorm` (vision.pitch)
- 3-5 screenshots or a GIF of real gameplay (from `game-visual-review` captures)
- Controls list (keyboard AND touch)
- Link to the live game — one click from the page
- Build/version info (`game-release-check` output) so players report real versions

---

### 2. Press Kit

A press kit (`docs/presskit/` in the game project) makes coverage easy. Include:
- `presskit.md` — one-page: game description, hook, 3 key features, developer story (2-3 sentences), release date, platform links
- 2-4 gameplay screenshots (PNG, ≥1280px wide)
- Logo/game icon (256x256+)
- Contact email + social handles
- Controls sheet (one page)

Do NOT invent: sales figures, awards, review quotes, or "players love it" claims.

---

### 3. Getting Coverage

#### Press
- Email writers/magazines **about the game, not yourself** — short, compelling, with screenshots/GIFs
- Send to outlets that actually cover the genre/platform; don't mass-blast everyone
- Share the unlisted page ~1 week before launch; writers need lead time
- A presskit() (dopresskit.com) page helps writers grab assets

#### Festivals (optional, timed)
| Festival | Typical Deadline |
|----------|------------------|
| Independent Games Festival (IGF) | ~October |
| IndieCade | ~May/June |
| SXSW Gaming | ~December |
| The Game Awards (fan vote) | ~November |

Festivals suit ambitious games; skip for SMALL casual projects.

#### Streamers/YouTubers
- Reach out with a short pitch + key art, offer a demo link (no keys needed for web games)
- Short, specific pitches outperform generic ones

#### Social media
- Post the hook + gameplay GIF on launch day and weekly after
- Use tags like `#gamedev #indiedev #screenshotsaturday`
- Reddit: post in relevant subreddits (e.g. `r/WebGames`, `r/IndieGaming`) following their self-promo rules

---

### 4. Launch Checklist

- [ ] Game passed `game-release-check` (all gates green, evidence collected)
- [ ] Page drafted on each target platform (unlisted until launch)
- [ ] Press kit complete in `docs/presskit/`
- [ ] Screenshots/GIFs from real gameplay (no placeholder art)
- [ ] Controls documented on the page
- [ ] Live demo link verified on a fresh browser + mobile viewport
- [ ] Analytics or at least a play counter configured if available
- [ ] Known-issues list (`game-release-check`) published honestly on the page
- [ ] Launch posts drafted (itch.io, social, community) and scheduled
- [ ] Press contacted at least one week before launch
- [ ] Attribution section lists all CC assets (see `game-polish` audio sources)

### 5. Post-Launch

- Collect bug reports via the page's comment/issue channel and route to `game-bug-triage`
- Track one metric that matters (plays, level-completion, retention) — report it in the next iteration
- Update the page with a patch log after fixes
- Not every launch is a hit: a released game + lessons learned is a successful iteration

---

### 6. Anti-Patterns

| Anti-Pattern | Why It Fails | Better Approach |
|---|---|---|
| Marketing before the game is fun | Players bounce; word-of-mouth dies | Polish + playtest first (`game-qa-plan` §6), then market |
| Press contact on launch day | No lead time for writers | Contact 1+ week early with unlisted page |
| Fake testimonials/stats | Trust destroyed instantly | Only real numbers from real play |
| One post, then silence | Algorithm visibility dies | Weekly posts with new GIFs/screenshots |
| Ignoring mobile viewport | Mobile players see broken layout | Verify live demo on phone before sharing |
