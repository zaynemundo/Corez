# New-Corez

## OpenRouter AI setup

Corez can use OpenRouter for real AI responses. By default, it uses:

```text
open-orca/mistral-7b-openorca
```

To enable it in the app, open Corez Settings and enter:

- OpenRouter API key
- OpenRouter model

The key is stored only in the current browser with `localStorage`. For a public
deployment with one shared owner key, use a backend proxy instead of exposing an
API key in frontend code.

For private/local deployments, Corez also reads these optional Vite variables:

```text
VITE_OPENROUTER_API_KEY
VITE_OPENROUTER_MODEL
```
