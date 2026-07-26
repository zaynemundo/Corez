# CoreZ Reliable Agent CLI Design

## Goal

Turn the existing CoreZ CLI prototype into a dependable coding-agent CLI that can execute real repository tasks through OpenCode Go and OpenRouter, enforce meaningful workspace safety, request approvals, stream progress, and persist resumable sessions.

This is the first milestone in a broader CLI roadmap. A full-screen terminal UI, broad provider marketplace, MCP integration, custom skills and commands, provider login flows, and headless server mode remain later milestones.

## Current-State Problems

The existing command surface is useful, but its runtime does not yet provide the guarantees implied by the CLI output:

- Provider failures and missing credentials fall back to a deterministic simulation that can report apparent success without completing work.
- The local simulation can emit the same tool call repeatedly until the 25-step limit.
- Permission values marked `ask` do not present an approval prompt before execution.
- File tools accept absolute paths and do not enforce a canonical workspace boundary.
- The session commands print placeholder results instead of persisting conversations.
- Interactive chat does not consistently receive command-line model, agent, and approval overrides.
- Runtime and command handlers write directly to the terminal, coupling execution logic to presentation.
- Existing command tests primarily assert zero exit codes and do not validate meaningful task outcomes.

## Scope

### Included

- A reliable, cancellable agent loop with explicit terminal states.
- Streaming provider adapters for OpenCode Go and OpenRouter.
- Clear failures for missing credentials, unsupported models, network errors, timeouts, and malformed responses.
- An explicit `--mock` mode for deterministic offline tests and demonstrations.
- Valid OpenAI-compatible tool declarations and normalized streamed tool calls.
- Workspace-confined file and command execution.
- Interactive approval choices: Allow once, Allow for session, and Deny.
- Hard safety rules that cannot be bypassed by `--auto`.
- Persistent project-indexed sessions under `~/.corez/sessions`.
- Interactive session resume, cancellation, command policies, and essential slash commands.
- Plain-text streaming for humans and structured `--json` output for automation.
- Behavioral unit, contract, integration, and end-to-end tests.

### Excluded

- A full-screen TUI.
- MCP servers, connector ecosystems, hooks, plugins, and custom skill loading.
- Provider marketplaces, OAuth, and interactive provider login.
- Additional live providers beyond OpenCode Go and OpenRouter.
- A background daemon, remote execution service, or headless HTTP server.
- Unrestricted execution outside the active workspace.

## Architecture

The current JavaScript command surface remains stable while unreliable internals are replaced behind explicit interfaces:

```text
CLI command / interactive prompt
            |
            v
Session controller
            |
            v
Agent runtime ---> Provider adapter
            |
            v
Tool executor ---> Approval controller ---> Workspace sandbox
            |
            v
Event stream ---> Terminal renderer + persistent session log
```

### CLI Router

The CLI router parses arguments once, resolves configuration precedence, constructs a run context, and dispatches commands. Global flags apply consistently to direct prompts, named commands, and interactive chat.

The supported reliability-milestone flags include:

- `--model <provider/model-or-alias>`
- `--agent <name>`
- `--auto`
- `--mock`
- `--continue`
- `--session <id>`
- `--json`
- `--yes`
- `--verbose`
- `--help`
- `--version`

Unknown flags, missing flag values, invalid flag combinations, and missing command arguments return actionable messages and nonzero exit codes.

### Session Controller

The session controller owns session creation, lookup, resume, append, compaction, listing, inspection, and deletion. The runtime consumes a session abstraction and does not access storage files directly.

Sessions are stored under `~/.corez/sessions` and indexed by canonical project path. Each session has:

- A stable opaque ID.
- Canonical project path.
- Creation and update timestamps.
- User-editable or generated title.
- Active model and command policy.
- Status: active, completed, cancelled, failed, or corrupt.
- Append-only JSONL events for user messages, assistant output, tool requests, approval decisions, tool results, errors, compaction summaries, and completion.

Append-only writes make interrupted turns recoverable without requiring an entire conversation file to be rewritten. Index updates use temporary-file replacement to avoid partial JSON. Corrupt records are isolated and reported without preventing healthy sessions from loading.

`corez --continue` resumes the newest session belonging to the current canonical project. `corez --session <id>` rejects a session from a different project unless a future explicit external-project workflow authorizes it.

### Agent Runtime

The agent runtime is a terminal-independent state machine. For each turn it:

1. Loads the session, project context, repository instructions, active model, and command policy.
2. Sends normalized messages and tool declarations through the selected provider adapter.
3. Emits structured streaming events for text, status, tool calls, approvals, results, errors, and completion.
4. Validates and executes tool calls through the tool executor.
5. Appends tool results to the provider conversation.
6. Repeats until the provider finishes or a terminal condition occurs.
7. Persists every completed event through the session controller.

Terminal conditions are:

- Successful model completion.
- User cancellation.
- Provider or authentication failure.
- Required operation denied.
- Step-limit exhaustion.
- Repeated identical tool-call loop.
- Invalid provider response.
- Verification failure when the active command policy requires verification.

The runtime tracks a normalized fingerprint for each tool name and argument set. Three consecutive identical calls without meaningful intervening state change terminate with `DUPLICATE_TOOL_LOOP`. The default overall step limit remains 25 and can be lowered by a command policy; reaching it returns `STEP_LIMIT` and is never reported as successful completion.

### Provider Adapters

OpenCode Go and OpenRouter implement one provider interface. The interface accepts normalized messages, model, reasoning settings, tools, cancellation signal, and timeout, and returns an asynchronous stream of normalized events.

Adapters are responsible for:

- Credential discovery from the existing supported environment variables.
- Provider-specific endpoint and model-name mapping.
- OpenAI-compatible tool schema serialization.
- Server-sent event parsing.
- Reassembly of fragmented streamed text and tool-call arguments.
- HTTP and provider error normalization.
- Request timeout and abort propagation.
- Detection of malformed or incomplete responses.

Missing credentials fail with `AUTH_MISSING`. The CLI never turns a provider failure into an offline success. Deterministic simulation is constructed only when `--mock` is explicitly present.

### Event Stream and Renderers

The runtime emits structured events and never writes directly to `console`. A human terminal renderer displays streamed assistant text, concise tool activity, approval prompts, errors, elapsed time, and completion or verification status.

A JSON renderer writes newline-delimited structured events suitable for automation. In `--json` mode, diagnostics go through the JSON event stream rather than contaminating standard output with banners or ANSI formatting.

## Command Policies

Existing commands become policies applied to the shared runtime:

- `plan`: read-only file, search, project-context, and Git inspection tools.
- `review`: read-only Git diff, Git history, file, and search tools.
- `run`: standard workspace agent tools with configured approvals.
- `build`: workspace-write tools with required final verification.
- `fix`: diagnostic and workspace-write tools with required reproduction and final verification.
- Interactive chat: standard workspace agent tools, with policy adjustable through `/permissions`.

Command handlers may supply a task-specific system instruction, but they do not implement independent tool loops.

## Tools and Workspace Sandbox

### Tool Contracts

Tools use typed JSON Schema inputs and return structured results with success, error code, output, metadata, and duration. Core tools cover:

- Bounded file reads.
- Directory listing and glob-style file discovery.
- Text search with file and match limits.
- Patch-based edits.
- New-file writes.
- Shell command execution.
- Git status, diff, and log.
- Test, lint, typecheck, and build commands discovered from project configuration.

Provider-facing tool declarations use valid OpenAI-compatible function objects. Invalid arguments return a tool error to the model and are recorded in the session.

### Path Containment

All paths are resolved against the canonical active workspace. Existing targets are checked through their real paths. For targets that do not yet exist, the nearest existing parent is resolved and checked before creation.

Containment checks apply to:

- Relative traversal such as `../`.
- Absolute paths.
- Symlink targets.
- Symlinked parent directories.
- Renames and patch paths.
- Shell working directories.

Paths outside the workspace return `PATH_OUTSIDE_WORKSPACE`. Merely adding an external path to a prompt or tool argument never grants access.

### Shell Execution

Shell execution uses explicit working directories, bounded captured output, timeouts, cancellation, and structured exit information. Argument-aware process spawning is preferred for known verification and Git operations. Commands that require shell syntax receive stricter classification before execution.

The execution environment excludes sensitive variables by default except for an explicit provider credential allowlist required by the model request layer. Command environment additions must be supplied through configuration and remain subject to policy.

## Permissions and Approvals

Permission decisions are separate from sandbox enforcement. Each operation resolves to:

- `allow`: execute without prompting.
- `ask`: prompt before execution.
- `deny`: reject without prompting.
- `blocked`: reject unconditionally under a hard safety rule.

When an interactive `ask` decision occurs, the user can choose:

- Allow once.
- Allow for this session.
- Deny.

Session allowances are scoped to a normalized operation class and pattern; they are not blanket approval for unrelated tools or targets.

`--auto` converts ordinary `ask` decisions to `allow` only when the action remains within the active workspace and does not match a hard safety rule. It cannot authorize:

- Workspace escapes.
- Credential or secret-file access.
- Destructive filesystem roots or broad recursive deletion.
- Destructive Git history or clean operations.
- Privilege elevation.
- Device, filesystem-formatting, or raw-disk commands.
- Commands explicitly denied by configuration.

Non-interactive execution cannot surface a fresh prompt. If an operation still requires approval, the turn fails with `TOOL_APPROVAL_REQUIRED` unless `--auto` legitimately covers it.

## Interactive Experience

Running `corez` starts a new line-oriented interactive session. This milestone deliberately avoids a full-screen TUI while retaining a presentation boundary that can support one later.

Essential interactive commands are:

- `/new`
- `/sessions`
- `/compact`
- `/model [id]`
- `/permissions`
- `/clear`
- `/help`
- `/exit` and `/quit`

`Ctrl+C` cancels the active turn while preserving the session. A second interrupt while idle exits. Provider requests and child processes receive the cancellation signal and are not left running in the background.

`corez session delete <id>` prompts for confirmation when attached to an interactive terminal. Non-interactive deletion requires the explicit `--yes` flag and never inherits approval from `--auto`.

## Error Model and Exit Codes

Errors include stable machine-readable codes:

- `AUTH_MISSING`
- `MODEL_UNSUPPORTED`
- `PROVIDER_HTTP_ERROR`
- `PROVIDER_TIMEOUT`
- `PROVIDER_RESPONSE_INVALID`
- `TOOL_ARGUMENT_INVALID`
- `TOOL_APPROVAL_REQUIRED`
- `TOOL_DENIED`
- `PATH_OUTSIDE_WORKSPACE`
- `COMMAND_TIMEOUT`
- `COMMAND_CANCELLED`
- `DUPLICATE_TOOL_LOOP`
- `STEP_LIMIT`
- `SESSION_NOT_FOUND`
- `SESSION_PROJECT_MISMATCH`
- `SESSION_CORRUPT`
- `VERIFICATION_FAILED`

Successful completion returns exit code `0`. Usage errors, authentication/provider failures, denied required actions, runtime exhaustion, cancellation, session failures, and failed required verification return nonzero codes. Human output explains corrective action; JSON output includes the stable code, message, and relevant metadata.

## Configuration Precedence

Configuration resolves in this order, from highest to lowest priority:

1. Command-line flags.
2. Environment variables.
3. Project `.corez/config.json`.
4. User-level `~/.corez/config.json`.
5. Built-in defaults.

The resolved configuration is immutable for a runtime turn. Interactive commands can update session-scoped model and permission choices for subsequent turns without silently rewriting project configuration.

## Testing Strategy

### Unit Tests

- CLI parsing, validation, precedence, aliases, and incompatible flags.
- Provider event parsing and fragmented tool-call reconstruction.
- Permission resolution and once/session approval caching.
- Canonical path and symlink containment.
- Session event serialization, indexing, and corruption handling.
- Error-to-exit-code mapping.

### Contract Tests

- OpenCode Go and OpenRouter request construction.
- Valid provider tool schemas.
- Stream completion, timeout, cancellation, HTTP failure, and malformed-response behavior.
- Human and JSON renderer output contracts.
- Plan, review, run, build, and fix policy restrictions.

### Integration Tests

- Runtime execution across multiple model and tool turns.
- Tool denials returned to the provider conversation.
- Duplicate-call loop termination.
- Step-limit failure.
- Interactive approval decisions.
- Non-interactive approval failure and `--auto` behavior.
- Session create, append, resume, compact, list, show, interruption recovery, and confirmed deletion.

### End-to-End Tests

A deterministic mock provider operates on a temporary Git repository. It must:

1. Inspect a file.
2. Apply a bounded edit.
3. Run configured verification.
4. Complete with an auditable summary.
5. Resume the persisted session.
6. Produce valid structured output under `--json`.

Separate credential-gated smoke commands exercise each live provider. Missing credentials are reported as skipped prerequisites and are never described as passing live verification.

## Verification Gate

The milestone is complete only when all applicable repository commands exit with code `0`:

- `npm run test:cli`
- `npm test`
- `npm run lint`
- `npm run build`

If a typecheck script does not exist, that absence is reported explicitly rather than treated as a pass. Live OpenCode Go and OpenRouter smoke tests are reported separately with their credential status.

## Compatibility and Migration

The command names `chat`, `run`, `plan`, `build`, `fix`, `review`, `swarm`, `status`, `models`, `model`, `agents`, `session`, `completion`, and `help` remain recognized. Reliability work may change previously misleading success behavior into explicit nonzero failure.

The current simulation becomes explicit `--mock` behavior. Existing project configuration continues to load, with legacy boolean permission values normalized into the new `allow`, `ask`, and `deny` model.

Swarm execution remains available but is not expanded in this milestone. It must use the shared hardened runtime and permission boundaries before it can claim successful task execution.

## Delivery Sequence

Implementation will proceed in independently verifiable slices:

1. Shared event, error, configuration, and command-policy contracts.
2. Provider adapters and explicit mock provider.
3. Workspace sandbox, tool schemas, process execution, and approvals.
4. Reliable agent state machine and cancellation.
5. Persistent sessions and resume flows.
6. Human and JSON renderers plus interactive commands.
7. Command migration, end-to-end coverage, documentation, and full verification.

Each slice is developed test-first and must keep the existing verified command surface functional or fail explicitly according to the new contracts.
