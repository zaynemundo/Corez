---
name: live-utilities
description: Use when the user asks for the current time in a city, a timezone or date conversion, weather or a forecast, a currency or unit conversion, a holiday date, sports scores or standings, or a quick percentage calculation. Not for sourced multi-item reports - use `research` instead.
---

# Live Utilities

## When to use
- The user needs one deterministic answer such as arithmetic, a percentage, or a unit conversion.
- The user asks for the current local time, a timezone conversion, a date, or a holiday.
- The user asks for current weather or a forecast.
- The user asks for currency or foreign-exchange rates.
- The user asks for sports scores, fixtures, schedules, or standings.

## When not to use
- A multi-source report or product comparison with citations - use `research` instead.
- A current or niche question that needs live citations across sources - use `research-current-information` instead.
- Writing or editing the message that carries the result - use `writing-communication` instead.

## Supported work
- Arithmetic, percentages, compound calculations, and unit conversions.
- Current local time, timezone conversion, dates, and holiday lookups.
- Weather conditions and forecasts.
- Currency conversion and foreign-exchange rates with grounded live sources.
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

## Verification
- Recompute or invert the calculation or conversion to confirm the result.
- Confirm the result states units, timestamp or effective date, and any important conversion assumptions.

## Related skills
- `research` - multi-item deep reports and comparisons.
- `research-current-information` - focused current questions that need sourced, dated citations.
- `writing-communication` - drafting surrounding text around a computed or looked-up result.
