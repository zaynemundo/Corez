---
name: game-spec
description: Produces validated game-spec.json containing core loops, mechanics, player controls, enemy types, and win/loss conditions.
version: 1.0.0
tags: [game-design, specification, schema, validation, json]
dependencies: [game-brainstorm, game-start]
token_estimate: 3800
---

# Game Spec Skill

Formulates structured, validated `game-spec.json` files from brainstorm output. Ensures all required fields are populated, types are correct, and cross-field constraints are satisfied.

---

## 1. JSON Schema Definition

### Required Fields (MUST be present)

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

### Optional Fields (include if applicable)

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

## 2. Complete Platformer Example

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
  }
}
```

---

## 3. Field Validation Rules

Apply these checks programmatically before accepting a spec:

### Title
- [ ] Length 3-64 characters
- [ ] No leading/trailing whitespace
- [ ] No empty or null values
- [ ] Must be unique per project (no duplicate titles)

### Genre
- [ ] Must be one of: `2D-platformer`, `3D-platformer`, `runner`, `match-3`, `puzzle`, `top-down-adventure`, `shooter`, `fighting`, `strategy`, `RPG`, `simulation`, `word-game`, `rhythm`, `party-game`, `other`
- [ ] If `other`, a `genreDescription` string field must also be present

### Core Loop
- [ ] Every `input` must map to a key in `controls`
- [ ] Every `feedback` must describe a visible or audible event
- [ ] `stateChange` must affect score, position, health, or inventory
- [ ] All 3 sub-loops (micro, meso, macro) must be populated

### Controls
- [ ] Every keyboard value must be a valid single key or key combo
- [ ] Touch `movement` must be `left-joystick`, `dpad`, `swipe`, or `tap-to-move`
- [ ] `pause` key must differ from all action keys
- [ ] No two actions may share the same key binding

### Win / Lose Conditions
- [ ] Mutually exclusive: a single play session cannot satisfy both simultaneously
- [ ] At least one must be measurable by the game engine (no subjective conditions like "player feels bored")
- [ ] Both must reference mechanics defined in coreLoop or enemies

### Enemies (if present)
- [ ] Each must have a unique `name` within the spec
- [ ] `health >= 1`, `damage >= 0`, `speed >= 0`
- [ ] `behavior` must be one of: `chase`, `patrol`, `shoot`, `stationary`, `boss`

### Levels (if present)
- [ ] `id` values must be unique and sequential starting from 1
- [ ] `unlockCondition` must reference a previous level's completion or a collectible count

### Scoring (if present)
- [ ] All point values must be >= 0
- [ ] If `comboSystem` is true, at least one enemy must exist

---

## 4. Spec Generation Process

```
Step 1: Read brainstorm output
        -> Extract vision, fantasy, genre, loop, mechanics, controls
        -> If any section is missing, reject and request game-brainstorm completion

Step 2: Map fields 1:1
        -> vision.pitch -> title
        -> genre.* -> genre + perspective suffix (e.g., "2D-" + genre)
        -> core_loop.* -> coreLoop.*
        -> controls.* -> controls.*
        -> mechanics -> enemies, scoring, progression

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

## 5. Cross-Referencing Checklist

- [ ] Every `controls` key is referenced by at least one `coreLoop.micro.input`
- [ ] Every `coreLoop.macro.runEnding` maps to either `winCondition` or `loseCondition`
- [ ] Enemies listed in `coreLoop.meso.obstacle` appear in `enemies` array
- [ ] Abilities in `progression.abilities` are referenced by at least one level's `unlockCondition`
- [ ] `winCondition` cannot be true when `loseCondition` is true (mutual exclusion)
- [ ] If `scoring.comboSystem` is true, at least one enemy exists
- [ ] Keyboard `pause` is not bound to any other action
- [ ] Touch `pause` button position is documented and always visible

---

## 6. Common Pitfalls

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

## 7. Output Checklist

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
