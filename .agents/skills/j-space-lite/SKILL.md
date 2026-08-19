---
name: j-space-lite
description: Lightweight J-Space workspace for Corez - selective ledger + ship checks for long-horizon tasks. Extracted from Tiger380/J-Space-Cognition-Suite-V3.6 (Apache-2.0).
---

# J-Space Lite for Corez

**Source:** [Tiger380/J-Space-Cognition-Suite-V3.6](https://github.com/Tiger3807861189/J-Space-Cognition-Suite-V3.6) (Apache-2.0) - extracted `ship` + ledger template only. Full suite has 9 modules; Corez already has `harness`, `intentContract`, `skillVerification` - so we take just these two.

## When to use

- **loop** tasks: multi-stage, multi-file, >5 steps, or state across turns -> use ledger + seam
- **full** tasks: single deliverable, 2-4 steps -> use `ship` before delivery only
- **fast** tasks: one step, checkable in one glance -> nothing

## Ledger (5 lines, re-read at every seam)

```
# J-Space Workspace Ledger
## Goal
## Core
## Verified
## Open
## Next
```

- `Goal`: one testable completion condition
- `Core`: at most 2 live entries as `name — defining fact`
- `Verified`: numbered `✓NN ... — verified by: verifier and coverage` (append-only)
- `Open`: `?NN ... — settled by: cheapest test` (closes against a checkpoint)
- `Next`: single next action, never empty

**File:** `.jspace/WORKSPACE.md` (or in-conversation if no filesystem). See `packages/agent-core/verification/j-space/ledger.md`.

**Seams:** sub-task done, tool about to be called, file about to be written, checkpoint verified, topic change, or anything addressed to user. At each seam, re-read the ledger.

## Ship (register check before delivery)

Run `node packages/agent-core/verification/j-space/ship.js <file>` or `shipText(text)` in code. Checks:

- Inner-only symbols `⇒ ⟹ ⟸ ∴ ∵ ⊆ ⊇ ∋ ?? ?! 💀` (dense track leakage)
- State markers `GRRR GAAAH PHEW I see meltdown DATA DATA I'M DROWNING`
- Uncovered claims `verified/confirmed/...` without coverage (`all/each/bounds/...`)
- Repetition loops (3x same line or 20+ char run)

Clean -> `clean — the outgoing register holds.` Findings -> expand to plain language before shipping.

See `packages/agent-core/verification/j-space/ship.js` (port of `jspace.py ship`).

## Controller (optional)

For `loop`, use the ledger file + `ship` check. No Python, no `jspace.py` needed - Corez handles it via JS. For hand-execution, restate the 5 lines at each seam in conversation.

## Attribution

Extracted from J-Space Cognition Suite V3.6 by Tiger380 (Apache-2.0). See `THIRD_PARTY_NOTICES.md` and `LICENSE` in original repo. Corez retains its own harness; this is a selective augmentation, not a replacement.
