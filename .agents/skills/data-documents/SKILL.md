---
name: data-documents
description: Analyses datasets and produces validated spreadsheets, charts, PDFs, Word documents, presentations, CSV, TXT, and other structured deliverables.
---

# Data Analysis & Document Production

## Supported work
- Dataset inspection, cleaning, transformation, statistics, modelling, calculations, comparisons, backtesting logic, risk metrics, charts, and benchmark interpretation.
- Spreadsheet formulas, tables, formatting, validation, and Excel-compatible workbooks.
- Structured Word documents, PDFs, slide decks, reports, proposals, brochures, and exportable CSV or TXT files.
- Extracting and organising information from uploaded files while preserving source meaning.

## Workflow
1. Inspect schema, units, missing values, duplicates, date ranges, assumptions, and potential data leakage.
2. Use deterministic calculations and validate totals, formulas, date logic, and sample rows.
3. Select an output format suited to the user's next action, not merely the analysis process.
4. Apply clear hierarchy, accessible labels, consistent formatting, and sensible page or sheet structure.
5. Verify generated files open correctly and that formulas, links, charts, tables, and pagination render as intended.
6. Provide the finished artefact and a concise summary of assumptions and validation performed.

## Guardrails
- Do not fabricate rows, metrics, formulas, citations, or successful file creation.
- Clearly label estimates, simulated data, projections, and incomplete source material.
- Avoid misleading chart scales or unsupported causal conclusions.
- For financial or trading analysis, separate historical results from forward expectations and disclose material assumptions.

## Related skill
- For PDF creation and processing (HTML/Paged.js, LaTeX, form filling, merge/split/extract), delegate to the `pdf` skill instead of generating PDFs ad hoc.
