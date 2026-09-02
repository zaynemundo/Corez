# CoreZ CLI v0.1

First-party AI coding CLI for CoreZ, built as a standalone modular platform supporting interactive coding sessions, autonomous build modes, local workspace tools, permission safety guardrails, and multi-agent swarm task execution.

## Features

- **Interactive Coding Agent**: Run `corez` or `corez chat` for an interactive REPL session.
- **Direct Workspace Tasks**: Run `corez "task description"` to inspect, analyze, or modify your project directory.
- **Read-Only Planning**: Run `corez plan "feature"` to analyze the codebase and generate an architectural implementation plan without mutating files.
- **Autonomous Implementation**: Run `corez build "feature"` to autonomously build components and features across your codebase.
- **Automated Fix Mode**: Run `corez fix` to automatically run tests/lint/build, diagnose errors, and repair failing code.
- **Git Code Review**: Run `corez review` to audit uncommitted Git changes for bugs, regressions, and security risks.
- **Multi-Agent Swarm Orchestration**: Run `corez swarm "task"` to run CoreZ's DAG-based multi-agent architecture across Explorer, Architect, Frontend, Backend, Tester, and Reviewer roles.
- **Model Router & Catalog**: Supports OpenCode Go (`muse-spark-1.3-contributor`, `kimi-k3`), OpenRouter, and local fallback execution.
- **Safety & Permissions**: Granular permission categories (`read`, `workspace-write`, `shell`, `network`, `dangerous`) with protection against destructive commands (`rm -rf /`, `git reset --hard`, `sudo`).

## Installation for Development

From the repository root:

```bash
cd packages/cli
npm install
npm link
```

Now you can run `corez` from any terminal project directory:

```bash
cd ~/my-project
corez --help
corez status
```

## Available Commands

```bash
# Interactive coding agent session
corez

# Run a task against current workspace
corez "build a React dashboard component"

# Interactive session
corez chat

# Read-only planning mode (no file mutations)
corez plan "add Stripe subscription checkout"

# Autonomous build mode
corez build "create user settings page"

# Automated diagnostic & repair mode
corez fix

# Review Git changes for bugs and security risks
corez review

# Multi-agent swarm orchestration
corez swarm "build a browser game"

# Show available and configured AI models
corez models

# Show configured agent roles
corez agents

# Show workspace status, Git branch, and permissions
corez status

# Show help & version
corez --help
corez --version
```

## Configuration (`.corez/config.json`)

You can configure CoreZ locally in your project by creating `.corez/config.json` or `corez.config.json`:

```json
{
  "model": "muse-spark-1.3-contributor",
  "reasoning": "high",
  "mode": "agent",
  "permissions": {
    "read": true,
    "workspaceWrite": true,
    "shell": "ask",
    "network": "ask",
    "dangerous": false
  }
}
```

### Environment Variables

- `OPENCODE_GO_API_KEY` or `OPENCODE_API_KEY`: Key for OpenCode Go models (`muse-spark-1.3-contributor`, `kimi-k3`).
- `OPENROUTER_API_KEY`: Key for OpenRouter models.
- `COREZ_MODEL`: Override default AI model.
- `COREZ_AUTO_APPROVE` / `YOLO`: Set to `true` to auto-approve tool permissions.

## Shared Architecture

```text
CoreZ Web      CoreZ CLI
    │              │
    └──────┬───────┘
           ▼
 Shared CoreZ Agent Runtime (packages/agent-core)
           │
 ┌─────────┼──────────┐
 ▼         ▼          ▼
Tools   Context     Swarm
           │
           ▼
    Model Router
```

## Testing

```bash
npm run test:cli
```
