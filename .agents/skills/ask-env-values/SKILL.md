---
name: ask-env-values
description: Use whenever a task requires environment variables, env vars, deployment secrets, API keys, Replit Secrets, or runtime configuration values; ask the user what exact values to put in the target environment instead of guessing.
---

# Ask Env Values

Use this skill before setting, documenting, or relying on environment variables,
deployment secrets, API keys, or Replit Secrets.

## Required behavior

- Identify the required variables first.
- Ask the user where to set them: local `.env`, Replit Secrets, Vercel,
  Netlify, another deployment provider, or another target environment.
- Ask the user for the exact value for each required variable.
- Never guess secret values, API keys, tokens, passwords, project IDs, or URLs
  that must come from the user or provider dashboard.
- Never commit secret values to git.
- Use placeholders in docs and examples, such as `<value>`,
  `your_openrouter_key`, or `your_project_url`.
- If a value is optional, say what default the app uses when it is missing.
- If the environment provider cannot be changed from the current tools, give the
  exact variable names and values the user needs to add manually.

## Corez variables

For Corez public AI routing, ask for:

```text
OPENROUTER_API_KEY=<value>
OPENROUTER_MODEL=open-orca/mistral-7b-openorca
```

`OPENROUTER_API_KEY` is required for public OpenRouter routing.
`OPENROUTER_MODEL` is optional; Corez defaults to
`open-orca/mistral-7b-openorca`.

## Replit wording

When the target is Replit, ask the user to add values in Replit Secrets:

```text
OPENROUTER_API_KEY=your_openrouter_key
OPENROUTER_MODEL=open-orca/mistral-7b-openorca
```

Do not ask the public app user for these secrets. They belong in the deployment
environment.
