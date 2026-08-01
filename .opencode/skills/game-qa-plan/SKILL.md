---
name: game-qa-plan
description: QA Lead skill for creating test plans covering controls, input handling, edge cases, and coverage gates.
version: 1.0.0
tags: [qa, test-plan, coverage, edge-cases, regression]
dependencies: [game-smoke-test, game-regression]
token_estimate: 300
---

## 1. Test Plan Template

### Section A: Controls & Input Handling

| ID | Description | Precondition | Steps | Expected Result |
|----|-------------|-------------|-------|-----------------|
| C-1 | Arrow keys move player left/right | Game loaded, player spawned | Press ArrowLeft, release, press ArrowRight | Player moves left then right at expected speed |
| C-2 | Spacebar jumps | Player on ground | Press Space | Player Y decreases then returns to ground |
| C-3 | P key pauses/resumes | Game running | Press P, wait 2s, press P again | Game freezes on pause, resumes on unpause |
| C-4 | Mobile tap moves player | Touch device, game loaded | Tap left half, then right half | Player moves to tap position |

### Section B: Collision Detection

| ID | Description | Precondition | Steps | Expected Result |
|----|-------------|-------------|-------|-----------------|
| COL-1 | Player hits wall | Player facing wall | Move into wall | Player stops at wall boundary |
| COL-2 | Player collects coin | Coin on path | Walk over coin | Coin disappears, score increments |
| COL-3 | Player touches enemy | Enemy on path | Walk into enemy | Player loses life / resets to checkpoint |
| COL-4 | Projectile hits enemy | Enemy visible, player has ammo | Fire projectile at enemy | Enemy health decreases or enemy destroyed |

### Section C: State Transitions

| ID | Description | Precondition | Steps | Expected Result |
|----|-------------|-------------|-------|-----------------|
| ST-1 | Menu → Play | Game loaded at menu | Click "Start" / press Enter | Game scene loads, player controls active |
| ST-2 | Play → Pause → Play | Game running | Press P, press P | Game loop stops then resumes |
| ST-3 | Play → Game Over | Player at 0 lives | Die | Game Over screen shown with score |
| ST-4 | Game Over → Menu | Game Over screen visible | Click "Main Menu" | Returns to start menu |

### Section D: Win/Loss Conditions

| ID | Description | Precondition | Steps | Expected Result |
|----|-------------|-------------|-------|-----------------|
| WL-1 | Reach level goal | Level loaded | Navigate to goal trigger zone | Victory screen displayed, score tallied |
| WL-2 | Lose all lives | 1 life remaining | Die once | Game Over triggers |
| WL-3 | Timer expires | Timed level loaded | Wait for timer | Game Over triggers |

### Section E: Score & Progression

| ID | Description | Precondition | Steps | Expected Result |
|----|-------------|-------------|-------|-----------------|
| SP-1 | Coin awards points | Coin available | Collect coin | Score increases by coin value |
| SP-2 | Enemy kill awards points | Enemy alive | Kill enemy | Score increases by enemy value |
| SP-3 | Score persists across levels | Level 1 completed | Advance to level 2 | Score carries over |

### Section F: Mobile / Responsive

| ID | Description | Precondition | Steps | Expected Result |
|----|-------------|-------------|-------|-----------------|
| R-1 | Canvas scales to viewport | Game loaded on 375px width | Resize to 768px, then 1920px | Canvas fills width, no overflow |
| R-2 | Touch controls visible | Touch device | Tap controls | Controls respond |
| R-3 | No horizontal scroll | Any device | Swipe in all directions | No overflow scroll |

---

## 2. Test Case Format

```
TC-<section>-<number>: <description>
  Precondition: <state required before test>
  Steps: 1. ... 2. ... 3. ...
  Expected: <observable outcome>
```

---

## 3. Edge Case Enumeration Guide

- **Boundary values**: minimum/maximum scores, lives at 0, timer at 0
- **Rapid input**: mash keys, hold keys, tap faster than expected
- **Empty states**: no enemies loaded, no coins on level
- **Overflow**: score beyond display limit, level count past end
- **Concurrent triggers**: collide with enemy and collect coin same frame
- **Interrupted transitions**: crash mid-save, close tab mid-level

---

## 4. Regression Test Selection Criteria

- Include ALL tests in sections C, D, and E for every regression pass
- Include section A tests if input handling was modified
- Include section B tests if collision physics changed
- Include section F tests if layout/CSS changed
- Re-run full suite before every release: `npm test` (and `npm run test:game` for game suites)
- Execution: smoke tests via `game-smoke-test`, regression comparison via `game-regression`, and record the plan in `game-project/design/test-plan.md`

---

## 5. Test Coverage Checklist

- [ ] Every control input mapped and tested
- [ ] Every collision type tested (player-wall, player-enemy, player-item, projectile-enemy)
- [ ] All state transitions verified forward and backward
- [ ] Win and loss conditions trigger exactly once
- [ ] Score updates immediately and correctly
- [ ] Mobile layout renders without overflow
- [ ] Touch controls functional on at least one touch device
- [ ] Rapid input does not break state machine
