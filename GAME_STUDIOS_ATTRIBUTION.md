# Third-Party Attribution: AI Game Studios Integration

This repository adapts concepts, agent hierarchy structures, department roles, and game development workflow patterns from **Donchitos/Claude-Code-Game-Studios**:

* **Upstream Repository**: https://github.com/Donchitos/Claude-Code-Game-Studios
* **Upstream Author**: Donchitos & Contributors
* **License**: MIT License / Open Source Adaptation

## License & Attribution Notice

```text
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
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
```

## Adaptation Highlights for CoreZ

1. **Native OpenCode + OpenCode Go Models**:
   - All agents adapted to native `.opencode/agents/*.md`, `.opencode/skills/`, and `.opencode/commands/`.
   - All AI models mapped strictly to `opencode-go/*` provider endpoints (`deepseek-v4-flash`, `deepseek-v4-pro`, `kimi-k2.7-code`, `mimo-v2.5`, `mimo-v2.5-pro`, `glm-5.2`, `grok-4.5`).

2. **Game Complexity Sizing**:
   - `SMALL` games (Pong, Snake, Clicker): Minimal allocation (Producer, Game Designer, Gameplay Programmer, QA Tester).
   - `MEDIUM` games (Platformer, Shooter, Tower Defense): Department leads + specialists.
   - `LARGE` games (RPG, Strategy, Multi-system): Full studio orchestration with all directors, leads, specialists, and code reviewers.

3. **CoreZ Runtime Orchestration**:
   - The studio definitions and delegation logic are exposed via JS modules (`src/services/gameStudio/`) so CoreZ's browser application runtime can consume the same role allocation, task briefs, visual QA loops, and review gates.
