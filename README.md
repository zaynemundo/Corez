# New-Corez

## OpenRouter AI setup

Corez uses a server-side OpenRouter proxy for real AI responses. Public users
do not need an API key; they send prompts to Corez, and Corez calls OpenRouter
from `/api/openrouter` with your private deployment secret.

By default, Corez uses:

```text
open-orca/mistral-7b-openorca
```

Set these server/deployment environment variables:

```text
OPENROUTER_API_KEY
OPENROUTER_MODEL
```

`OPENROUTER_MODEL` is optional. If it is not set, Corez uses the OpenOrca model
above. Users can still override the model name from Corez Settings, but they are
not asked for an API key.
