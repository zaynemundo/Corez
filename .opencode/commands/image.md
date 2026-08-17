---
description: Generates an image from a text prompt using the CoreZ image endpoint
---

Generate an image from the following prompt: $ARGUMENTS

Use the `image-generation` skill (`.agents/skills/image-generation/SKILL.md`) to guide your approach.

1. Send `POST /api/image` with JSON `{ "prompt": "<the prompt>" }` to the worker endpoint.
2. If the response contains `image`, return the image URL to the user and display it using markdown image syntax.
3. Report the `model` returned in the response.
4. If the request fails, report the honest failure reason (rate limit, misconfiguration, provider error) rather than making up an error.

Do not hard-code a model name — always report the `model` field from the response.