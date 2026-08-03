---
name: research
description: Structured two-phase deep research. Builds a research outline (items + fields) for a topic, optionally extends it with user input, deep-researches every item via parallel web-fetch subagents, and generates a markdown report. Use for academic surveys, technology comparisons, market research, competitor analysis, and due diligence.
---

# Deep Research Skill

A two-phase structured research workflow (inspired by RhinoInsight and adapted from Weizhena/Deep-Research-skills):

- **Phase A - Outline**: generate `outline.yaml` (research items) and `fields.yaml` (field definitions).
- **Phase B - Deep research + report**: investigate every item in parallel batches and produce `report.md`.

Human-in-the-loop: confirm with the user at every stage. Do not skip checkpoints.

## Trigger

- `/research <topic>` command, or the user asks for deep research on a topic.

## Phase A: Generate Outline

### Step 1: Initial framework from model knowledge
Generate an initial framework for `{topic}`:
- A list of the main research objects/items in this domain.
- A suggested research field framework (field categories and fields).

Show the result to the user with the `question` tool and confirm:
- Need to add/remove items?
- Does the field framework meet requirements?

### Step 2: Ask for time range
Use the `question` tool to ask for the research time range (e.g., last 6 months, since 2024, unlimited).

### Step 3: Web supplement
Launch one `web-search` subagent (via the `task` tool, subagent type `web-search`) to supplement the framework. Parameters: `{topic}`, `{YYYY-MM-DD}` (current date), `{step1_output}` (Step 1 output), `{time_range}`. Prompt template (replace only variables in {xxx}):

```
## Task
Research topic: {topic}
Current date: {YYYY-MM-DD}

Based on the following initial framework, supplement latest items and recommended research fields.

## Existing Framework
{step1_output}

## Goals
1. Verify if existing items are missing important objects
2. Supplement items based on missing objects
3. Continue researching {topic} related items within {time_range} and supplement
4. Supplement new fields

## Output Requirements
Return structured results directly (do not write files):

### Supplementary Items
- item_name: Brief explanation (why it should be added)
...

### Recommended Supplementary Fields
- field_name: Field description (why this dimension is needed)
...

### Sources
- [Source1](url1)
- [Source2](url2)
```

### Step 4: Ask for existing fields
Ask the user (question tool) if they have an existing field definition file; if so, read and merge it.

### Step 5: Generate outline (separate files)
Merge Step 1, Step 3 and any user fields, then create directory `{topic_slug}/` in the current working directory and write two files:

**`outline.yaml`** (items + config):
```yaml
topic: {topic}
items:
  - name: Item 1
    category: {category}
    description: {why this item matters}
execution:
  batch_size: 3          # parallel subagents per batch (confirm with user)
  items_per_agent: 3     # items per subagent (confirm with user)
  output_dir: ./results  # results output directory
```

**`fields.yaml`** (field definitions):
```yaml
field_categories:
  - category: Basic Info
    fields:
      - name: name
        description: Official name
        detail_level: brief
        required: true
      # detail_level hierarchy: brief -> moderate -> detailed
uncertain: []   # reserved, auto-filled during deep phase
```

Confirm both files with the user before proceeding.

## Phase B: Deep Research

### Step 1: Auto-locate outline
Read `outline.yaml` from `{topic_slug}/` in the current working directory; read `items` and `execution` config (including `batch_size`, `items_per_agent`, `output_dir`).

### Step 2: Resume check
Check for completed JSON files in `output_dir`; skip items that already have results.

### Step 3: Batch execution
- Process items in batches of `batch_size`; ask user approval before each next batch.
- Each `web-search` subagent handles `items_per_agent` items.
- Launch subagents in parallel: multiple `task` tool calls in a single message. Disable per-agent narrative output; the agent's deliverable is the JSON file it writes.

**Parameters**: `{item_related_info}` = item's full yaml content (name + category + description), `{fields_path}` = absolute path to `{topic_slug}/fields.yaml`, `{output_path}` = absolute path to `{output_dir}/{item_name_slug}.json` (slugify: spaces -> `_`, strip special chars), `{validator}` = absolute path to `.agents/skills/research/validate_json.py` (resolve to the absolute path directly; on Windows use the full path instead of `realpath`).

Prompt template per agent (replace only variables in {xxx}):

```
## Task
Research {item_related_info}, output structured JSON to {output_path}

## Field Definitions
Read {fields_path} to get all field definitions

## Output Requirements
1. Output JSON according to fields defined in fields.yaml
2. Mark uncertain field values with [uncertain]
3. Add uncertain array at the end of JSON, listing all uncertain field names
4. All field values must be in English

## Output Path
{output_path}

## Validation
After completing JSON output, run the validation script to ensure complete field coverage:
python {validator} -f {fields_path} -j {output_path}
Task is complete only after validation passes.
```

### Step 4: Monitor and continue
- Wait for the current batch to complete, then launch the next (with user approval).
- Show progress between batches.

### Step 5: Summary
After all batches, report: completion count, failed/uncertain items, and the output directory.

## Phase C: Generate Report

### Step 1: Locate results
Read `outline.yaml` for topic and `output_dir`; list all JSON results.

### Step 2: Choose summary fields
Scan all JSON results for fields suitable for TOC display (numeric or short metrics, e.g. stars, citations, scores, valuation, release dates). Ask the user with the `question` tool which fields to display in the table of contents.

### Step 3: Generate conversion script
Write `{topic_slug}/generate_report.py` with these requirements:

1. **JSON structure compatibility**: support flat JSON (`{"name": "xxx"}`) and nested JSON (`{"basic_info": {...}, "technical_features": {...}}`). Field lookup order: top level -> category mapping key -> traverse all nested dicts.
2. **Category mapping**: establish bidirectional category mapping so any combination of field names works:
   ```python
   CATEGORY_MAPPING = {
       "Basic Info": ["basic_info", "Basic Info"],
       "Technical Features": ["technical_features", "technical_characteristics", "Technical Features"],
       "Performance Metrics": ["performance_metrics", "performance", "Performance Metrics"],
       "Milestone Significance": ["milestone_significance", "milestones", "Milestone Significance"],
       "Business Info": ["business_info", "commercial_info", "Business Info"],
       "Competition & Ecosystem": ["competition_ecosystem", "competition", "Competition & Ecosystem"],
       "History": ["history", "History"],
       "Market Positioning": ["market_positioning", "market", "Market Positioning"],
   }
   ```
3. **Complex value formatting**: list of dicts -> one line per dict, kv separated by ` | `; short lists -> comma-joined; long lists -> line breaks; nested dicts -> recursive formatting with `;` or line breaks; text over 100 chars -> `<br>` or blockquote.
4. **Extra fields**: collect JSON fields not defined in fields.yaml under "Other Info". Filter out internal keys (`_source_file`, `uncertain`) and nested category keys.
5. **Uncertain values**: skip fields whose value contains `[uncertain]`, fields listed in the `uncertain` array, and None/empty values. Render the `uncertain` array one field per line.

TOC format: every item with number, name (anchor link), and user-selected summary fields:
```
1. [GitHub Copilot](#github-copilot) - Stars: 10k | Score: 85%
```

### Step 4: Execute
Run `python3 {topic_slug}/generate_report.py`. Fix any script errors, re-run until success.

## Output

```
{current_working_directory}/{topic_slug}/
  ├── outline.yaml            # items + execution config
  ├── fields.yaml             # field definitions
  ├── results/                # one JSON per item
  │   └── {Item_Name}.json
  ├── generate_report.py      # conversion script
  └── report.md               # final report with table of contents
```

## Guardrails

- Confirm with the user before each batch and before finishing the outline; never fabricate citations, URLs, prices, or release details.
- The `web-search` subagent researches with the `webfetch` tool only (no search API) — instruct it to construct search-engine and site-search URLs and analyze the fetched pages.
- Mark every uncertain value with `[uncertain]` and list it in the `uncertain` array; the report skips those fields.
- Keep all research output values in English.
