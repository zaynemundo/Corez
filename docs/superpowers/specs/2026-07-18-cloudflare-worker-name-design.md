# Cloudflare Worker Name Design

## Goal

Keep the repository's Wrangler configuration consistent with the Cloudflare
Workers build target by changing the deployed Worker name from `new-corez` to
`ai`.

## Scope

- Set `name` to `ai` in `wrangler.jsonc`.
- Update the Cloudflare configuration contract to expect `ai`.
- Update the README's current deployed Worker name.
- Leave historical design and implementation-plan documents unchanged because
  they describe the earlier deployment work rather than current configuration.

## Behavior and risks

The application code, routes, asset binding, and OpenRouter configuration do
not change. A Wrangler deployment will target the Cloudflare Worker named
`ai`. Secrets associated only with the previous `new-corez` Worker are not
guaranteed to transfer and must be configured for `ai` in Cloudflare.

## Verification

Run the Cloudflare Worker configuration contract and the production build. The
contract must require `name: "ai"`, and the build must complete successfully.
