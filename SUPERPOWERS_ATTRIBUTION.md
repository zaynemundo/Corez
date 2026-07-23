# Third-Party Attribution: Superpowers Integration

This repository incorporates concepts, workflow patterns, and methodology adapted from **obra/superpowers**:

* **Upstream Repository**: https://github.com/obra/superpowers
* **Upstream Author**: Jesse Vincent & Prime Radiant Inc.
* **License**: MIT License

## License Text

```text
MIT License

Copyright (c) Jesse Vincent & Prime Radiant Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR A PARTICULAR PURPOSE AND OTHER
LIABILITY. WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Imported & Adapted Skills

The following methodology skills from `obra/superpowers` have been adapted into CoreZ's native runtime Skill Registry (`src/skills/`):

1. `using-superpowers` - Bootstrap & workflow entry point
2. `brainstorming` - Socratic design refinement & spec creation
3. `systematic-debugging` - 7-phase root-cause analysis & regression prevention
4. `writing-plans` - Granular task decomposition & DAG structure
5. `test-driven-development` - RED-GREEN-REFACTOR execution cycle
6. `verification-before-completion` - Mandatory empirical evidence gate
7. `requesting-code-review` - Pre-implementation & post-implementation review checklist
8. `receiving-code-review` - Finding classification & repair loop
9. `dispatching-parallel-agents` - Concurrent DAG task execution
10. `subagent-driven-development` - Focused brief subagent delegation with 2-stage review
11. `executing-plans` - Task graph state progression & checkpointing
12. `finishing-a-development-branch` - Final verification & completion decision

## Local Modifications & Upstream Update Mechanism

* **Runtime Adaptation**: Superpowers skills are embedded into CoreZ's JS runtime skill registry, state machine, and model router.
* **Capability Gating**: Tool execution steps dynamically evaluate CoreZ's `CapabilityRegistry` (e.g. Git, terminal, filesystem) before execution.
* **Model Routing**: Superpowers workflows use CoreZ's internal cost-aware provider routing without hardcoding model names.
* **Update Procedure**: Upstream skill changes from `obra/superpowers` can be compared against `src/skills/definitions.js` and merged into the registry.
