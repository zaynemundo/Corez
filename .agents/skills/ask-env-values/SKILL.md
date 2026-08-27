---
name: ask-env-values
description: Use when environment variables, deployment secrets, API keys, or runtime configuration values are required and unavailable; identify exact names and placement, then ask rather than guessing values.
---

# Ask Env Values

Use this skill before setting, documenting, or relying on environment variables,
deployment secrets, API keys, Replit Secrets, or runtime configuration values.

## Required behavior

- Identify the required variable names first.
- Ask the user where to set them: local `.env`, Replit Secrets, Vercel,
  Netlify, another deployment provider, or another target environment.
- Ask the user for the exact value for each required variable.
- Never guess secret values, API keys, tokens, passwords, project IDs, or URLs
  that must come from the user or provider dashboard.
- Never commit secret values to Git.
- Use placeholders in documentation and examples, such as `<value>`,
  `your_service_key`, or `your_project_url`.
- If a value is optional, state the default used when it is missing.
- If the environment cannot be changed with the available tools, give the exact
  variable names and values the user must add manually.

## CoreZ provider configuration

CoreZ does not use Cloudflare Workers AI for chat. Hosted text generation
uses `OPENCODE_GO_API_KEY` only (`OPENCODE_API_KEY` is a legacy alias,
`OPENCODE_ENDPOINT` and `OPENCODE_MODEL` are optional overrides) — no
DeepSeek or OpenRouter fallback for chat. Image generation (`POST /api/image`)
still requires `OPENROUTER_API_KEY` separately (`OPENROUTER_IMAGE_MODEL`
optionally overrides the server-controlled image model). `ASSET_BUCKET` and
`GAME_ROOMS` are Cloudflare bindings, not secret strings.

Ask only for providers needed by the requested deployment. Never ask a public
app user for these values, and never expose them in browser code or responses.
Cloudflare deployment credentials are CI/CD secrets and must not be committed.

## Provider wording

When the target is Replit, ask the user to add required values in Replit
Secrets. Use placeholders rather than invented values:

```text
SERVICE_API_KEY=<value>
SERVICE_PROJECT_URL=your_project_url
```

Do not ask public app users for deployment secrets. Those values belong to the
application owner and the target deployment environment.
