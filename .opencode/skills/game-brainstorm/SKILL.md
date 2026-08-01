---
name: game-brainstorm
description: Socratic game vision discovery and player fantasy formulation between Creative Director and Game Designer.
version: 1.0.0
tags: [game-design, brainstorming, creative-direction, game-mechanics, player-fantasy]
dependencies: [game-start, game-spec]
token_estimate: 4200
---

# Game Brainstorm Skill

Structured Socratic discovery process for defining game vision, player fantasy, genre identity, core loops, mechanics, and controls before technical implementation.

---

## 1. Socratic Questioning Framework

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

## 2. Player Fantasy Formulation

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

## 3. Genre Identity Checklist

Check all that apply. Each checked box narrows implementation scope.

### Tempo
- [ ] Real-time (continuous action)
- [ ] Turn-based (player waits for opponent)
- [ ] Semi-real-time (cooldowns, stamina bars)

### Perspective
- [ ] Side-view (platformer, brawler)
- [ ] Top-down (shooter, adventure, RPG)
- [ ] Isometric (strategy, sim)
- [ ] First-person (immersive)
- [ ] Third-person over-shoulder

### Core Challenge (pick exactly ONE primary)
- [ ] Reflexes / timing (platformer, fighter, bullet hell)
- [ ] Strategy / planning (puzzle, tower defense, 4X)
- [ ] Resource management (sim, tycoon, survival)
- [ ] Exploration / discovery (metroidvania, adventure)
- [ ] Social / bluffing (party game, deception)

### Scope Bounds
- [ ] Single-screen levels
- [ ] Scrolling levels (one direction)
- [ ] Open hub -> instances
- [ ] Fully open world

---

## 4. Core Loop Discovery Worksheet

### Micro-loop (3-10 second cycle)
```
Input:  [Player presses / taps / clicks _____]
Action: [Character does _____]
Feedback: [Screen shows / sound plays _____]
State change: [Score / health / position changes by _____]
```

### Meso-loop (30-120 second cycle)
```
Goal:    [Complete _____]
Obstacle: [_____ blocks progress]
Reward:  [_____ is unlocked / awarded]
Pacing:  [Tension rises by _____ then resets when _____]
```

### Macro-loop (5-20 minute cycle)
```
Level end: [Level is won when _____]
Progression: [Between levels, player gains _____]
Meta-goal: [After 3 levels, player unlocks _____]
Run ending: [Game ends when _____]
```

**Loop validation:** Trace one complete cycle manually. If any step is missing (Input -> Action -> Feedback -> State Change), the loop is incomplete. Redesign the missing step before proceeding.

---

## 5. Mechanics Refinement Checklist

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

## 6. Story & Mood Formulation

Every game has a story — if not explicit, the player creates it from the mechanics (rising numbers in 2048, silent interactions in Monument Valley). Capturing Story and Mood up front makes the rest of the design concrete.

### Story Worksheet
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

### Mood Worksheet
```
Vibe:         [retro chiptune | modern flat | cozy | dark/tense | whimsical]
Visual:       [palette direction, shape language — feed to game-art-direction]
Audio:        [music genre/tempo, SFX character — feed to game-polish]
First impression: [What does the player see/hear in the first 3 seconds?]
Contrast:     [What mood shift punctuates important moments?]
```

**Mood validation:** the mood must be achievable with the project's art budget (SMALL = 1 palette + procedural audio; LARGE = multiple palettes + music). If the mood requires art the size can't support, simplify the mood.

---

## 7. Control Scheme Brainstorming
### Keyboard-first (browser default)
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

### Touch-first (mobile/tablet)
- Virtual joystick (left thumb): movement
- Action buttons (right thumb): jump, attack, interact
- Swipe gestures for dodge / dash
- Tap = primary action, hold = secondary action
- MUST include a pause button that is always visible

### Gamepad (progressive enhancement)
- Left stick: movement
- A (bottom): primary action / jump
- B (right): secondary action / cancel
- X (left): tertiary action
- Y (top): special / menu
- Start: pause
- D-pad: inventory / quick-select

### Control Principles
- Primary action must be on the most accessible input (Space / tap / A)
- No action should require 3+ simultaneous key presses
- Every action must have a keyboard AND touch equivalent
- Pause must be accessible without closing the game window

---

## 8. Output Format for game-spec Consumption

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

## 9. Anti-Patterns to Avoid

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
