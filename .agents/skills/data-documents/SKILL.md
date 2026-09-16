---
name: data-documents
description: Use when the user supplies a dataset or CSV to inspect, clean, transform, analyse, chart, or summarise, or asks for spreadsheet formulas, tables, a workbook, or structured document and slide content. Not for generating the final PDF file - use `pdf` instead.
---

# Data Analysis & Document Production

## When to use
- The user supplies a dataset or CSV and asks to inspect, clean, transform, calculate, compare, chart, or summarise it.
- Spreadsheet formulas, tables, validation, or CSV output are requested.
- Structured document or slide content is needed.
- Information must be extracted from uploaded files while preserving source meaning.

## When not to use
- Creating or processing the final PDF document - use `pdf` instead.
- Sourcing external facts, sources, or market evidence for a report - use `research` instead.
- Writing or editing the prose that surrounds the data - use `writing-communication` instead.

## Supported work
- Dataset inspection, cleaning, transformation, statistics, modelling, calculations, comparisons, backtesting logic, risk metrics, charts, and benchmark interpretation.
- Spreadsheet formulas, tables, validation, and CSV output; create an actual
  workbook only when workbook-generation tooling is available.
- Structured document and slide content; create an actual PDF through the
  `pdf` skill, and claim Word or presentation delivery only after a file has
  been generated and opened or parsed successfully.
- Extracting and organising information from uploaded files while preserving source meaning.

## Workflow
1. Inspect schema, units, missing values, duplicates, date ranges, assumptions, and potential data leakage.
2. Use deterministic calculations and validate totals, formulas, date logic, and sample rows.
3. Select an output format suited to the user's next action, not merely the analysis process.
4. Apply clear hierarchy, accessible labels, consistent formatting, and sensible page or sheet structure.
5. Verify generated files open correctly and that formulas, links, charts, tables, and pagination render as intended.
6. Provide the finished artifact only when it exists; otherwise provide clearly labelled source content or a format specification.

## Guardrails
- Do not fabricate rows, metrics, formulas, citations, or successful file creation.
- Clearly label estimates, simulated data, projections, and incomplete source material.
- Avoid misleading chart scales or unsupported causal conclusions.
- For financial or trading analysis, separate historical results from forward expectations and disclose material assumptions.

## Related skill
- For PDF creation and processing (HTML/Paged.js, LaTeX, form filling, merge/split/extract), delegate to the `pdf` skill instead of generating PDFs ad hoc.

## Verification
- Confirm calculations, totals, formulas, date logic, and sample rows are deterministic and correct before delivering.
- Confirm any generated file opens correctly and that formulas, links, charts, tables, and pagination render as intended.
- Report file delivery only after the artifact has been generated and opened or parsed successfully.

## Related skills
- `pdf` - PDF creation and processing through dedicated tooling.
- `writing-communication` - drafting and editing the prose around the data.
- `research` - sourcing external facts and citations for a report.
