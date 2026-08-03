---
description: Runs the full deep research workflow (outline, deep investigation, report) for a topic
---

Load the `research` skill from `.agents/skills/research/SKILL.md` and execute its complete workflow for the topic the user provides after `/research`. Run every phase in order without skipping: outline generation, user confirmation, optional item/field additions, deep research, and report generation. Deliver `report.md` and its location to the user when complete.
