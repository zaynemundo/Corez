---
name: live-utilities
description: Use for narrow deterministic calculations or current weather, time, date, holiday, currency, unit, or sports lookups; use live-market-data for supported quotes and research for multi-source reports.
---

# Live Utilities

## Supported work
- Arithmetic, percentages, compound calculations, and unit conversions.
- Current local time, timezone conversion, dates, and holiday lookups.
- Weather conditions and forecasts.
- Currency conversion and current foreign-exchange rates: use
  `live-market-data` for its supported USD, AED, EUR, GBP, and JPY pairs; use a
  grounded live source or report unavailability for other currencies.
- Current supported market quotes and short price series through the separate
  `live-market-data` skill.
- Sports scores, fixtures, schedules, and standings.

## Workflow
1. Identify the required location, timezone, units, currency pair, market symbol, team, league, and date range.
2. Use the dedicated deterministic or live utility rather than estimating from memory.
3. State the result with units, timestamp or effective date, and any important conversion assumptions.
4. For forecasts, market data, and live scores, distinguish current observations from future projections or scheduled events.
5. Keep calculations reproducible by showing the essential formula when it adds value.

## Guardrails
- Never invent a live value or present stale information as current.
- Do not confuse indicative market or FX data with an executable quote.
- Use exact dates when words such as today, tomorrow, or yesterday may be ambiguous.
- For medical, legal, or financial decisions, treat utility results as supporting data rather than personalised professional advice.
