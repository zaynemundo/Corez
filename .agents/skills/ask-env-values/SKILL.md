---
name: ask-env-values
description: Use whenever a task requires environment variables, env vars, deployment secrets, API keys, Replit Secrets, or runtime configuration values; ask the user what exact values to put in the target environment instead of guessing.
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

## Corez Workers AI

Corez hosted text generation uses the native Cloudflare Workers AI binding.
Runtime inference requires no runtime API key or account ID.
Runtime inference requires no model environment variable or provider URL.
Do not ask for legacy external-provider values.
Cloudflare deployment credentials are CI/CD credentials, not public AI runtime
configuration, and must never be committed or exposed to app users.

## Provider wording

When the target is Replit, ask the user to add required values in Replit
Secrets. Use placeholders rather than invented values:

```text
SERVICE_API_KEY=<value>
SERVICE_PROJECT_URL=your_project_url
```

Do not ask public app users for deployment secrets. Those values belong to the
application owner and the target deployment environment.
