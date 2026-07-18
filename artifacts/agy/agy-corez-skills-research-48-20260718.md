# Complete Corez Skills Research & Capability Taxonomy Artifact

**Author:** AGY (Subordinate Research Specialist)  
**Target Codebase:** Corez (`/workspaces/New-Corez`)  
**Access Date:** July 18, 2026  
**Mode:** Analysis Only (Zero Workspace Modifications; Zero Secret/Credential/Log Access)  
**Artifact Path:** `/home/codespace/.gemini/antigravity-cli/brain/7334c80a-cfb7-47e2-8367-802af687119f/corez_skills_research.md`

---

## 1. Executive Summary

Corez is a public-facing React/Vite single-page web application featuring a client-side intent classifier (`src/services/aiService.js`), an offline heuristic generator, an interactive preview canvas (`src/components/CanvasPreview.jsx`), and a serverless API proxy (`api/openrouter.js`) routing to OpenRouter's API endpoint (`https://openrouter.ai/api/v1/chat/completions`).

This research artifact provides a **complete, un-truncated inventory of 48 practical skill families** across 12 domain categories. It establishes an empirical baseline for Corez feature expansion while documenting verified OpenRouter provider specifications as of July 2026.

### Key Architectural Baseline & Honest Proxy Audit
The current Corez backend implementation (`api/openrouter.js`) is a **stateless, single-turn completion proxy**. It forwards a single `prompt` string wrapped in a static system prompt. It currently lacks support for:
1. Multi-turn chat message histories (`messages` array forwarding).
2. Server-side tool calling and agentic execution (`tools` array).
3. Server-Sent Events (SSE) streaming (`stream: true`).
4. Multimodal image payloads (`image_url` content blocks).
5. Strict JSON Schema enforcement (`response_format: { type: "json_schema" }`).

To scale Corez capabilities, this document classifies skills by implementation feasibility against current and upgraded proxy shapes.

---

## 2. Verified Current Provider Specifications (OpenRouter API)

Verified as of **July 18, 2026** directly from official OpenRouter API documentation.

### 2.1 Web Search & Scraping Integration
* **Official Docs:** [OpenRouter Plugins Documentation](https://openrouter.ai/docs/plugins) | [OpenRouter Tools Documentation](https://openrouter.ai/docs/tools)
* **Supported Capabilities:** OpenRouter documents two distinct web search mechanisms:
  1. `plugins: [{ id: 'web' }]`: Request-level web search plugin injected into the completion pipeline. Both `plugins: [{ id: 'web' }]` and the newer `openrouter:web_search` server tool are fully documented in official OpenRouter specifications. The plugin remains supported for request-level pre-search pipelines.
  2. `openrouter:web_search`: Agentic server tool passed inside the `tools` array (`{ type: "openrouter:web_search" }`), enabling models with tool-calling capabilities to dynamically search, formulate sub-queries, and cite sources. Supports engine parameters (e.g., `auto`, `exa`, `perplexity`).
  3. `openrouter:web_fetch`: Built-in server tool for direct URL content retrieval.

### 2.2 Streaming (SSE / Chunked Delivery)
* **Official Docs:** [OpenRouter Streaming Documentation](https://openrouter.ai/docs/streaming)
* **Supported Capabilities:** Setting `stream: true` returns a standard Server-Sent Events (SSE) HTTP response delivering `data: { choices: [{ delta: { content: "..." } }] }` chunks.
* **Model Qualifications:** Supported across virtually all chat completion models. Essential for eliminating HTTP timeout risks during long code or document generations.

### 2.3 Tool Calling & Function Calling
* **Official Docs:** [OpenRouter Tools Documentation](https://openrouter.ai/docs/tools)
* **Supported Capabilities:** Standard OpenAI-compatible `tools` array support (`type: "function"`). OpenRouter automatically maps function definitions for native tool-calling models (e.g., OpenAI, Anthropic, Gemini, DeepSeek V3/V4) or transforms schemas into structured system prompts for non-native models.
* **Model Qualifications:** Native function execution depends on model capability; fallbacks are handled via system prompt injection by OpenRouter.

### 2.4 Structured Outputs & Schema Enforcement
* **Official Docs:** [OpenRouter Structured Outputs Documentation](https://openrouter.ai/docs/structured-outputs)
* **Supported Capabilities:** 
  1. `response_format: { type: "json_object" }`: Guarantees valid JSON output.
  2. `response_format: { type: "json_schema", json_schema: { name: "...", strict: true, schema: { ... } } }`: Guarantees output matches exact JSON Schema definitions.
* **Model Qualifications:** Supported natively by OpenAI GPT-4o/o3, Gemini 1.5/2.0/3.0, and DeepSeek V3/V4; emulated via response healing plugins on legacy models.

### 2.5 Multimodal Inputs (Vision & Audio)
* **Official Docs:** [OpenRouter Multimodal Documentation](https://openrouter.ai/docs/multimodal)
* **Supported Capabilities:** User message content array formatted with image objects:
  `content: [{ type: "text", text: "..." }, { type: "image_url", image_url: { url: "data:image/png;base64,..." } }]`.
* **Model Qualifications:** Supported by vision-capable models (e.g., `openai/gpt-4o`, `google/gemini-2.5-flash`, `anthropic/claude-3.5-sonnet`, `deepseek/deepseek-vl`). Non-vision models will return a 400 parameter error if passed image content.

### 2.6 Media Outputs (Image & Media Generation)
* **Official Docs:** [OpenRouter Models Documentation](https://openrouter.ai/docs/models)
* **Supported Capabilities:** Image generation models (e.g., `black-forest-labs/flux-1-dev`, `recraft-ai/recraft-20b`, `stabilityai/sdxl`, `openai/dall-e-3`) are accessible via standard completions returning base64 strings or hosted asset URLs in the response message.

### 2.7 Usage Accounting & Token Cost Tracking
* **Official Docs:** [OpenRouter Responses Documentation](https://openrouter.ai/docs/responses)
* **Supported Capabilities:** OpenRouter response body includes a standardized `usage` object:
  ```json
  "usage": {
    "prompt_tokens": 120,
    "completion_tokens": 450,
    "total_tokens": 570,
    "cost": 0.000342
  }
  ```
  OpenRouter also passes custom HTTP response headers (`x-openrouter-tokens-prompt`, `x-openrouter-tokens-completion`).

### 2.8 Reasoning Parameters & Output Capture
* **Official Docs:** [OpenRouter Reasoning Documentation](https://openrouter.ai/docs/reasoning)
* **Supported Capabilities:** 
  1. `reasoning_effort`: Accepts `'none'`, `'minimal'`, `'low'`, `'medium'`, `'high'`, `'xhigh'`. Currently configured in Corez (`DEFAULT_OPENROUTER_REASONING_EFFORT = 'xhigh'`).
  2. `include_reasoning: true`: Requests models (e.g., DeepSeek R1, OpenAI o3) to return reasoning thoughts in a dedicated `reasoning` message field or `thinking` blocks.

---

## 3. Comprehensive Inventory of 48 Practical Skill Families

---

### Category 1: Conversation & Reasoning

#### Skill 1.1: Multi-Step Chain-of-Thought & Tradeoff Explorer
* **User Value / Example:** Evaluates architectural options (e.g., "Compare PostgreSQL vs MongoDB for real-time collaboration").
* **Execution Shape:** Prompt-only structured reasoning.
* **Required Corez Changes:** System prompt guidance in `api/openrouter.js`.
* **Required Model/Tool/API/Dependency:** `deepseek/deepseek-v4-flash` with `reasoning_effort: xhigh`.
* **Secret/Permission & Data Exposure:** None; public prompt payload.
* **Offline Feasibility:** Yes (local template heuristic).
* **Complexity:** S
* **Feasible with Current Proxy:** Yes
* **Prerequisites:** None.
* **Priority:** Now

#### Skill 1.2: Interactive Socratic Tutor & Knowledge Diagnostic
* **User Value / Example:** Guides user through concepts via targeted questions (e.g., "Teach me CSS Flexbox step-by-step").
* **Execution Shape:** Multi-turn conversational loop.
* **Required Corez Changes:** Forward `messages` array in `api/openrouter.js` and preserve chat history in `src/App.jsx`.
* **Required Model/Tool/API/Dependency:** OpenRouter Chat Completions.
* **Secret/Permission & Data Exposure:** None.
* **Offline Feasibility:** Partial (simple local rule-based questions).
* **Complexity:** S
* **Feasible with Current Proxy:** No
* **Prerequisites:** Multi-turn proxy history forwarding.
* **Priority:** Next

#### Skill 1.3: Structured Debater / Devil's Advocate Stress Test
* **User Value / Example:** Stress-tests business models or code designs by taking opposing perspectives.
* **Execution Shape:** Single-turn prompt with structured pros/cons/counter-arguments.
* **Required Corez Changes:** System prompt role assignment.
* **Required Model/Tool/API/Dependency:** Any OpenRouter LLM.
* **Secret/Permission & Data Exposure:** None.
* **Offline Feasibility:** Yes.
* **Complexity:** S
* **Feasible with Current Proxy:** Yes
* **Prerequisites:** None.
* **Priority:** Now

#### Skill 1.4: Multi-Perspective Deliberation & Consensus Engine
* **User Value / Example:** Simulates panel of experts (e.g., Security Engineer, UX Designer, Product Manager) deliberating a request.
* **Execution Shape:** Multi-role synthesized prompt completion.
* **Required Corez Changes:** System prompt template structuring.
* **Required Model/Tool/API/Dependency:** Standard LLM.
* **Secret/Permission & Data Exposure:** None.
* **Offline Feasibility:** Yes.
* **Complexity:** M
* **Feasible with Current Proxy:** Yes
* **Prerequisites:** None.
* **Priority:** Next

---

### Category 2: Coding & App Generation

#### Skill 2.1: Single-File Monochrome Web App Generator (Baseline)
* **User Value / Example:** Instantly builds runnable HTML/CSS/JS tools in live iframe preview canvas.
* **Execution Shape:** System prompt HTML fencing + client iframe extraction (`extractCodeFromMessage`).
* **Required Corez Changes:** Baseline active in `api/openrouter.js` & `src/components/CanvasPreview.jsx`.
* **Required Model/Tool/API/Dependency:** `deepseek/deepseek-v4-flash`.
* **Secret/Permission & Data Exposure:** Untrusted JS in sandboxed iframe.
* **Offline Feasibility:** Yes (offline generators in `src/services/aiService.js`).
* **Complexity:** S
* **Feasible with Current Proxy:** Yes
* **Prerequisites:** None.
* **Priority:** Now

#### Skill 2.2: Live Canvas App Incremental Refiner & Patch Generator
* **User Value / Example:** Modifies existing canvas app without rewriting from scratch (e.g., "Add dark mode toggle to current preview app").
* **Execution Shape:** Context-injected multi-turn completion.
* **Required Corez Changes:** Pass `activeCanvasCode` in client request payload; handle code replacement.
* **Required Model/Tool/API/Dependency:** High-context LLM via OpenRouter.
* **Secret/Permission & Data Exposure:** None.
* **Offline Feasibility:** Partial (basic client string replaces).
* **Complexity:** M
* **Feasible with Current Proxy:** Partial (requires frontend payload expansion).
* **Prerequisites:** Context-aware prompt builder.
* **Priority:** Now

#### Skill 2.3: Multi-File Component Architect & Dependency Resolver
* **User Value / Example:** Generates multi-file React/Vite structures with package dependencies.
* **Execution Shape:** Structured JSON output containing file paths and file contents.
* **Required Corez Changes:** Enable `response_format: { type: "json_schema" }` in `api/openrouter.js`; add client file-tree viewer.
* **Required Model/Tool/API/Dependency:** OpenRouter JSON Schema structured output.
* **Secret/Permission & Data Exposure:** None.
* **Offline Feasibility:** No.
* **Complexity:** L
* **Feasible with Current Proxy:** No
* **Prerequisites:** Proxy structured output upgrade & tabbed canvas component.
* **Priority:** Later

#### Skill 2.4: Code Defect Diagnostic & Automated Test Case Generator
* **User Value / Example:** Identifies bug root cause and provides Vitest/Jest unit test suite.
* **Execution Shape:** Fenced code output + explanation.
* **Required Corez Changes:** Add `code-debug` intent tag.
* **Required Model/Tool/API/Dependency:** Standard LLM.
* **Secret/Permission & Data Exposure:** None.
* **Offline Feasibility:** Yes.
* **Complexity:** S
* **Feasible with Current Proxy:** Yes
* **Prerequisites:** None.
* **Priority:** Now

---

### Category 3: Files & Documents

#### Skill 3.1: Document Text Extractor & Content Summarizer
* **User Value / Example:** Summarizes user-uploaded TXT, MD, or CSV files.
* **Execution Shape:** Client-side FileReader text extraction + LLM summarization.
* **Required Corez Changes:** Drag-and-drop file input in `src/App.jsx`; attach text payload to prompt.
* **Required Model/Tool/API/Dependency:** HTML5 FileReader API.
* **Secret/Permission & Data Exposure:** User file contents sent to proxy/OpenRouter.
* **Offline Feasibility:** Yes (local keyword summarizer).
* **Complexity:** S
* **Feasible with Current Proxy:** Yes (if client extracts text).
* **Prerequisites:** Frontend file dropzone UI.
* **Priority:** Next

#### Skill 3.2: PDF & Office File Visual Layout Analyzer
* **User Value / Example:** Extracts tables and text from PDF / DOCX documents.
* **Execution Shape:** Serverless file parsing middleware or client pdf.js worker.
* **Required Corez Changes:** Add `pdfjs-dist` or server parsing endpoint.
* **Required Model/Tool/API/Dependency:** `pdfjs-dist` / `mammoth`.
* **Secret/Permission & Data Exposure:** Uploaded binary documents.
* **Offline Feasibility:** Partial (client PDF rendering).
* **Complexity:** M
* **Feasible with Current Proxy:** No
* **Prerequisites:** Client binary parser or backend multipart endpoint.
* **Priority:** Later

#### Skill 3.3: Dynamic Document Converter (Markdown / HTML / CSV / JSON)
* **User Value / Example:** Converts markdown notes into structured HTML or CSV tables.
* **Execution Shape:** Structured JSON output or text format transformation.
* **Required Corez Changes:** Client export utilities (download blob handlers).
* **Required Model/Tool/API/Dependency:** Standard LLM + browser Blob URL API.
* **Secret/Permission & Data Exposure:** None.
* **Offline Feasibility:** Yes (local regex transformers).
* **Complexity:** S
* **Feasible with Current Proxy:** Yes
* **Prerequisites:** Export button UI in Canvas.
* **Priority:** Now

#### Skill 3.4: Automated Report Generator & Executive Brief Synthesizer
* **User Value / Example:** Compiles multi-section executive reports with table of contents and metric callouts.
* **Execution Shape:** Markdown document generator with canvas preview rendering.
* **Required Corez Changes:** Canvas markdown renderer support (`react-markdown`).
* **Required Model/Tool/API/Dependency:** Standard LLM.
* **Secret/Permission & Data Exposure:** None.
* **Offline Feasibility:** Yes.
* **Complexity:** S
* **Feasible with Current Proxy:** Yes
* **Prerequisites:** None.
* **Priority:** Next

---

### Category 4: Web, Search & Research

#### Skill 4.1: Live OpenRouter Web Search Synthesizer
* **User Value / Example:** Fetches real-time documentation, stock prices, or current news.
* **Execution Shape:** Server-side tool execution via `openrouter:web_search` or plugin `plugins: [{ id: 'web' }]`.
* **Required Corez Changes:** Add `tools: [{ type: "openrouter:web_search" }]` or `plugins: [{ id: 'web' }]` parameter to `api/openrouter.js`.
* **Required Model/Tool/API/Dependency:** OpenRouter `openrouter:web_search` or `plugins: [{ id: 'web' }]`. Both mechanisms are documented in official OpenRouter specifications.
* **Secret/Permission & Data Exposure:** Query string sent to external search providers (Exa/Perplexity/Google).
* **Offline Feasibility:** No.
* **Complexity:** M
* **Feasible with Current Proxy:** No
* **Prerequisites:** Proxy parameter extension.
* **Priority:** Next

#### Skill 4.2: Structured URL Page Scraper & Content Distiller
* **User Value / Example:** Extracts main article content and citations from a specific URL.
* **Execution Shape:** Server tool calling via `openrouter:web_fetch`.
* **Required Corez Changes:** Forward `openrouter:web_fetch` tool in proxy request.
* **Required Model/Tool/API/Dependency:** OpenRouter server tool `openrouter:web_fetch`.
* **Secret/Permission & Data Exposure:** Target URL requested by proxy.
* **Offline Feasibility:** No.
* **Complexity:** M
* **Feasible with Current Proxy:** No
* **Prerequisites:** Proxy tool calling upgrade.
* **Priority:** Next

#### Skill 4.3: Deep Multi-Source Literature & Market Research Synthesizer
* **User Value / Example:** Performs multi-query synthesis for competitor or academic research.
* **Execution Shape:** Multi-step tool loop (`openrouter:web_search`).
* **Required Corez Changes:** Backend agent loop or OpenRouter agentic search.
* **Required Model/Tool/API/Dependency:** `openrouter:web_search` with engine `exa` or `perplexity`.
* **Secret/Permission & Data Exposure:** Research queries.
* **Offline Feasibility:** No.
* **Complexity:** L
* **Feasible with Current Proxy:** No
* **Prerequisites:** Agentic loop architecture.
* **Priority:** Later

#### Skill 4.4: Fact-Verification & Real-Time News Checker
* **User Value / Example:** Verifies claims against recent news sources and provides inline citations.
* **Execution Shape:** Prompt instruction + web search tool execution.
* **Required Corez Changes:** Enable web search in proxy; render citations in chat UI.
* **Required Model/Tool/API/Dependency:** OpenRouter web search tool + UI citation parser.
* **Secret/Permission & Data Exposure:** Query strings.
* **Offline Feasibility:** No.
* **Complexity:** M
* **Feasible with Current Proxy:** No
* **Prerequisites:** Citation UI component.
* **Priority:** Next

---

### Category 5: Images, Audio & Video

#### Skill 5.1: Multimodal Vision Image Inspection & UI Wireframe Analysis
* **User Value / Example:** Converts uploaded UI screenshot into runnable monochrome canvas HTML/CSS code.
* **Execution Shape:** Base64 image payload in user message `content` array.
* **Required Corez Changes:** Support `image_url` payload array in `api/openrouter.js`; image dropzone in client UI.
* **Required Model/Tool/API/Dependency:** Vision model via OpenRouter (`openai/gpt-4o`, `google/gemini-2.5-flash`, `anthropic/claude-3.5-sonnet`).
* **Secret/Permission & Data Exposure:** Uploaded image data sent to model provider.
* **Offline Feasibility:** No.
* **Complexity:** M
* **Feasible with Current Proxy:** No
* **Prerequisites:** Proxy vision payload array support.
* **Priority:** Next

#### Skill 5.2: Text-to-Image Generation & Canvas Asset Synthesizer
* **User Value / Example:** Generates custom SVG / image assets for preview canvas apps.
* **Execution Shape:** Separate image model completion endpoint.
* **Required Corez Changes:** Endpoint handler routing to image generation models.
* **Required Model/Tool/API/Dependency:** `black-forest-labs/flux-1-dev` / `recraft-ai/recraft-20b` via OpenRouter.
* **Secret/Permission & Data Exposure:** Image prompt strings.
* **Offline Feasibility:** No.
* **Complexity:** M
* **Feasible with Current Proxy:** No
* **Prerequisites:** Image generation API route.
* **Priority:** Later

#### Skill 5.3: Audio Transcription & Voice Prompt Interface
* **User Value / Example:** Accepts spoken voice input and converts to text prompt.
* **Execution Shape:** Web Speech API or Whisper audio API transcription.
* **Required Corez Changes:** Browser `webkitSpeechRecognition` integration in `src/App.jsx`.
* **Required Model/Tool/API/Dependency:** Browser SpeechRecognition API or OpenAI Whisper.
* **Secret/Permission & Data Exposure:** Microphone access permission.
* **Offline Feasibility:** Yes (browser native speech recognition).
* **Complexity:** S
* **Feasible with Current Proxy:** Yes (client-side implementation).
* **Prerequisites:** Microphone button in chat input bar.
* **Priority:** Next

#### Skill 5.4: Video Frame Inspection & Scene Breakdown
* **User Value / Example:** Analyzes keyframes from uploaded short clips or GIFs.
* **Execution Shape:** Client HTML5 `<canvas>` frame extraction to base64 images -> Vision API.
* **Required Corez Changes:** Client video frame extractor helper.
* **Required Model/Tool/API/Dependency:** HTML5 Video/Canvas API + OpenRouter Vision model.
* **Secret/Permission & Data Exposure:** Video frame data.
* **Offline Feasibility:** No.
* **Complexity:** L
* **Feasible with Current Proxy:** No
* **Prerequisites:** Vision proxy upgrade & frame sampler script.
* **Priority:** Later

---

### Category 6: Data Analysis & Visualization

#### Skill 6.1: Client-Side Interactive Data Visualizer (Chart.js / SVG / Canvas)
* **User Value / Example:** Renders interactive charts (bar, line, scatter) inside preview canvas from JSON data.
* **Execution Shape:** Self-contained HTML with embedded Chart.js / SVG rendering code.
* **Required Corez Changes:** Update system prompt to instruct model on CDN-based Chart.js/SVG canvas apps.
* **Required Model/Tool/API/Dependency:** Standard LLM + CDN Chart.js.
* **Secret/Permission & Data Exposure:** Data in prompt payload.
* **Offline Feasibility:** Yes (offline SVG chart generator in `aiService.js`).
* **Complexity:** S
* **Feasible with Current Proxy:** Yes
* **Prerequisites:** None.
* **Priority:** Now

#### Skill 6.2: CSV / JSON Dataset Statistical Analyzer & Table Cleaner
* **User Value / Example:** Computes mean, median, null counts, and cleans messy CSV text.
* **Execution Shape:** Embedded JS data processing script rendered in preview canvas.
* **Required Corez Changes:** Canvas preview table & statistics component.
* **Required Model/Tool/API/Dependency:** Client JS execution inside iframe.
* **Secret/Permission & Data Exposure:** Dataset content.
* **Offline Feasibility:** Yes (local JS client parser).
* **Complexity:** S
* **Feasible with Current Proxy:** Yes
* **Prerequisites:** None.
* **Priority:** Now

#### Skill 6.3: Financial & Metric Forecasting Model Generator
* **User Value / Example:** Builds interactive ROI calculators or financial projections with slider controls.
* **Execution Shape:** Single-file HTML/CSS/JS widget rendered in canvas.
* **Required Corez Changes:** System prompt role definition for financial modelling.
* **Required Model/Tool/API/Dependency:** `deepseek/deepseek-v4-flash`.
* **Secret/Permission & Data Exposure:** None.
* **Offline Feasibility:** Yes.
* **Complexity:** S
* **Feasible with Current Proxy:** Yes
* **Prerequisites:** None.
* **Priority:** Now

#### Skill 6.4: SQL Query Generator & Schema Relationship Mapper
* **User Value / Example:** Converts natural language questions into optimized SQL queries and ER diagrams.
* **Execution Shape:** Fenced SQL code block + Mermaid.js ER diagram code.
* **Required Corez Changes:** Add Mermaid.js renderer to frontend chat interface.
* **Required Model/Tool/API/Dependency:** Standard LLM + client `mermaid` package.
* **Secret/Permission & Data Exposure:** Database schema text.
* **Offline Feasibility:** Yes.
* **Complexity:** S
* **Feasible with Current Proxy:** Yes
* **Prerequisites:** Frontend Mermaid renderer.
* **Priority:** Next

---

### Category 7: Productivity & Connectors

#### Skill 7.1: Automated Meeting Agenda & Action Item Extractor
* **User Value / Example:** Extracts action items, owners, and deadlines from transcript text.
* **Execution Shape:** Structured JSON output or markdown table.
* **Required Corez Changes:** System prompt formatting rules.
* **Required Model/Tool/API/Dependency:** Standard LLM.
* **Secret/Permission & Data Exposure:** Transcript text.
* **Offline Feasibility:** Yes (local regex heuristic).
* **Complexity:** S
* **Feasible with Current Proxy:** Yes
* **Prerequisites:** None.
* **Priority:** Now

#### Skill 7.2: Draft Email & Communication Personalizer
* **User Value / Example:** Drafts professional emails, outreach messages, or release notes with tone selector.
* **Execution Shape:** Prompt completion + client one-click copy button.
* **Required Corez Changes:** Communication intent handler.
* **Required Model/Tool/API/Dependency:** Standard LLM.
* **Secret/Permission & Data Exposure:** None.
* **Offline Feasibility:** Yes (local template generator).
* **Complexity:** S
* **Feasible with Current Proxy:** Yes
* **Prerequisites:** None.
* **Priority:** Now

#### Skill 7.3: REST API Integration & Payload Converter Generator
* **User Value / Example:** Generates fetch/cURL code snippets and JSON transformers for external APIs.
* **Execution Shape:** Fenced code snippet generator.
* **Required Corez Changes:** Code copy & test snippet trigger.
* **Required Model/Tool/API/Dependency:** Standard LLM.
* **Secret/Permission & Data Exposure:** None.
* **Offline Feasibility:** Yes.
* **Complexity:** S
* **Feasible with Current Proxy:** Yes
* **Prerequisites:** None.
* **Priority:** Now

#### Skill 7.4: Task Decomposition & Kanban Project Board Generator
* **User Value / Example:** Converts goal into an interactive HTML Kanban board with drag-and-drop cards.
* **Execution Shape:** Runnable single-file HTML/CSS/JS Kanban app rendered in canvas.
* **Required Corez Changes:** Add `kanban` template pattern to intent generator.
* **Required Model/Tool/API/Dependency:** `deepseek/deepseek-v4-flash`.
* **Secret/Permission & Data Exposure:** None.
* **Offline Feasibility:** Yes (offline kanban generator in `aiService.js`).
* **Complexity:** S
* **Feasible with Current Proxy:** Yes
* **Prerequisites:** None.
* **Priority:** Now

---

### Category 8: Memory & Personalization

#### Skill 8.1: Client-Side Ephemeral Context & Thread Memory Manager
* **User Value / Example:** Maintains context across conversation turns within active workspace session.
* **Execution Shape:** Client `localStorage` message history array passed to proxy.
* **Required Corez Changes:** Modify `api/openrouter.js` to accept `messages` array; update `src/App.jsx` state management.
* **Required Model/Tool/API/Dependency:** OpenRouter Chat Completions endpoint.
* **Secret/Permission & Data Exposure:** Chat history stored in browser `localStorage`.
* **Offline Feasibility:** Yes (local state persistence).
* **Complexity:** M
* **Feasible with Current Proxy:** No
* **Prerequisites:** Proxy multi-turn update.
* **Priority:** Now

#### Skill 8.2: User Persona & System Customization Profile
* **User Value / Example:** Allows user to set custom instructions (e.g., "Always write concise code in TypeScript").
* **Execution Shape:** Settings modal storing preferences string injected into proxy system prompt.
* **Required Corez Changes:** Settings UI modal in `src/App.jsx`; forward `systemInstruction` in request payload.
* **Required Model/Tool/API/Dependency:** Standard LLM.
* **Secret/Permission & Data Exposure:** User settings saved in `localStorage`.
* **Offline Feasibility:** Yes.
* **Complexity:** S
* **Feasible with Current Proxy:** Partial (requires payload parameter in client).
* **Prerequisites:** Settings dialog component.
* **Priority:** Next

#### Skill 8.3: Client-Side RAG Vector Knowledge Base (IndexedDB Embeddings)
* **User Value / Example:** Semantically searches user's local notes before answering queries.
* **Execution Shape:** In-browser embedding generation via `@xenova/transformers` + IndexedDB vector search.
* **Required Corez Changes:** Integrate `@xenova/transformers` in client build pipeline.
* **Required Model/Tool/API/Dependency:** Client ONNX WebGL embedding model (`all-MiniLM-L6-v2`).
* **Secret/Permission & Data Exposure:** Local data index; zero server transmission for embeddings.
* **Offline Feasibility:** Yes (100% in-browser WASM/WebGL).
* **Complexity:** XL
* **Feasible with Current Proxy:** Yes (client performs RAG before sending context to proxy).
* **Prerequisites:** Client WASM vector pipeline.
* **Priority:** Later

#### Skill 8.4: Long-Term Preference Learning & Adaptive Prompt Customizer
* **User Value / Example:** Auto-detects user coding style preferences and adapts response tone over time.
* **Execution Shape:** Client background heuristic analysis of user edits in canvas.
* **Required Corez Changes:** Client interaction telemetry tracker.
* **Required Model/Tool/API/Dependency:** Client heuristics.
* **Secret/Permission & Data Exposure:** Preference tokens stored locally.
* **Offline Feasibility:** Yes.
* **Complexity:** L
* **Feasible with Current Proxy:** Yes
* **Prerequisites:** Ephemeral memory architecture.
* **Priority:** Avoid

---

### Category 9: Accessibility & Languages

#### Skill 9.1: Multilingual Translation & Cultural Localizer
* **User Value / Example:** Translates app interfaces and copy into 50+ languages while preserving UI formatting.
* **Execution Shape:** System prompt translation instructions + structured JSON dictionary output.
* **Required Corez Changes:** Language selector widget in Corez header.
* **Required Model/Tool/API/Dependency:** Standard LLM.
* **Secret/Permission & Data Exposure:** None.
* **Offline Feasibility:** Partial (basic offline dictionary).
* **Complexity:** S
* **Feasible with Current Proxy:** Yes
* **Prerequisites:** None.
* **Priority:** Now

#### Skill 9.2: Accessibility (WCAG 2.1) UI Compliance Checker & Contrast Auditor
* **User Value / Example:** Audits active canvas app HTML for ARIA labels, semantic tags, and color contrast errors.
* **Execution Shape:** Client JS DOM parser + LLM accessibility audit report.
* **Required Corez Changes:** Canvas preview audit button.
* **Required Model/Tool/API/Dependency:** Client axe-core micro-script or LLM HTML parser.
* **Secret/Permission & Data Exposure:** HTML snippet.
* **Offline Feasibility:** Yes (local DOM contrast math).
* **Complexity:** S
* **Feasible with Current Proxy:** Yes
* **Prerequisites:** Canvas DOM access helper.
* **Priority:** Next

#### Skill 9.3: Simplified Language Transformer (Explain Like I'm 5 / Plain Language)
* **User Value / Example:** Rewrites complex technical documentation or legal text into simple, plain English.
* **Execution Shape:** System prompt complexity modifier.
* **Required Corez Changes:** Add "Simplicity Level" toggle in UI.
* **Required Model/Tool/API/Dependency:** Standard LLM.
* **Secret/Permission & Data Exposure:** None.
* **Offline Feasibility:** Yes.
* **Complexity:** S
* **Feasible with Current Proxy:** Yes
* **Prerequisites:** None.
* **Priority:** Now

#### Skill 9.4: Screen Reader ARIA Annotation & Accessibility Fixer
* **User Value / Example:** Automatically inserts missing `aria-label`, `role`, and keyboard navigation event handlers into canvas HTML code.
* **Execution Shape:** Code refactoring completion.
* **Required Corez Changes:** Canvas code update function.
* **Required Model/Tool/API/Dependency:** Standard LLM.
* **Secret/Permission & Data Exposure:** None.
* **Offline Feasibility:** Yes.
* **Complexity:** S
* **Feasible with Current Proxy:** Yes
* **Prerequisites:** None.
* **Priority:** Next

---

### Category 10: Safety, Admin & Observability

#### Skill 10.1: Prompt Injection Guard & Input Sanitizer
* **User Value / Example:** Filters malicious prompt injections, system prompt leak attempts, and XSS strings before hitting OpenRouter.
* **Execution Shape:** Client/Proxy regex filter middleware.
* **Required Corez Changes:** Add input validation middleware in `api/openrouter.js` and `src/services/aiService.js`.
* **Required Model/Tool/API/Dependency:** Local regex patterns + optional OpenRouter moderation model.
* **Secret/Permission & Data Exposure:** Blocked malicious payloads.
* **Offline Feasibility:** Yes (100% offline regex guard).
* **Complexity:** S
* **Feasible with Current Proxy:** Yes
* **Prerequisites:** None.
* **Priority:** Now

#### Skill 10.2: Usage & Token Cost Accounting Monitor
* **User Value / Example:** Displays real-time token count and estimated cost per request in UI status bar.
* **Execution Shape:** Parse `usage` object from OpenRouter response; expose via proxy JSON output.
* **Required Corez Changes:** Update `api/openrouter.js` to return `usage` object; update `src/App.jsx` status bar.
* **Required Model/Tool/API/Dependency:** OpenRouter `usage` response object.
* **Secret/Permission & Data Exposure:** Usage metrics logged in client memory.
* **Offline Feasibility:** Yes (local token estimation heuristic).
* **Complexity:** S
* **Feasible with Current Proxy:** Yes (requires minor proxy response field pass-through).
* **Prerequisites:** Proxy response field pass-through.
* **Priority:** Now

#### Skill 10.3: Output Content Moderation & PII Filter
* **User Value / Example:** Redacts sensitive PII (emails, phone numbers, API keys) from LLM responses before rendering.
* **Execution Shape:** Post-processing regex scrubber in proxy / client.
* **Required Corez Changes:** Add PII scrubber utility function.
* **Required Model/Tool/API/Dependency:** Client regex rules.
* **Secret/Permission & Data Exposure:** Prevents accidental secret leakage in UI.
* **Offline Feasibility:** Yes.
* **Complexity:** S
* **Feasible with Current Proxy:** Yes
* **Prerequisites:** None.
* **Priority:** Now

#### Skill 10.4: Latency & Model Performance Metrics Logger
* **User Value / Example:** Tracks Time-To-First-Byte (TTFB) and total roundtrip latency per query across model providers.
* **Execution Shape:** Performance.now() instrumentation in client and server proxy.
* **Required Corez Changes:** Add telemetry fields to client state.
* **Required Model/Tool/API/Dependency:** Standard browser Performance API.
* **Secret/Permission & Data Exposure:** Anonymized execution metrics.
* **Offline Feasibility:** Yes.
* **Complexity:** S
* **Feasible with Current Proxy:** Yes
* **Prerequisites:** None.
* **Priority:** Next

---

### Category 11: Agentic Workflows

#### Skill 11.1: Multi-Step Agentic Tool Calling Loop
* **User Value / Example:** Autonomous execution loop where LLM chooses tool, receives result, and iterates until task completion.
* **Execution Shape:** Recursive function execution loop handling `tool_calls` array in OpenRouter responses.
* **Required Corez Changes:** Refactor `api/openrouter.js` into an execution supervisor loop with tool routing.
* **Required Model/Tool/API/Dependency:** OpenRouter `tools` array + tool handler registry.
* **Secret/Permission & Data Exposure:** Managed API tool calls.
* **Offline Feasibility:** No.
* **Complexity:** L
* **Feasible with Current Proxy:** No
* **Prerequisites:** Proxy tool execution architecture upgrade.
* **Priority:** Later

#### Skill 11.2: Autonomous Plan Generator & Step Execution Supervisor
* **User Value / Example:** Breaks complex goals into sequential sub-tasks, rendering progress updates in UI.
* **Execution Shape:** Structured JSON plan generation + client step runner.
* **Required Corez Changes:** Plan visualization UI component in Corez.
* **Required Model/Tool/API/Dependency:** `response_format: { type: "json_schema" }`.
* **Secret/Permission & Data Exposure:** None.
* **Offline Feasibility:** Partial (offline task breakdown templates).
* **Complexity:** M
* **Feasible with Current Proxy:** No
* **Prerequisites:** Structured output proxy support.
* **Priority:** Next

#### Skill 11.3: Self-Correction & Iterative Code Repair Loop
* **User Value / Example:** Automatically catches JS syntax errors in preview canvas iframe and feeds stack trace back to LLM for instant self-repair.
* **Execution Shape:** Client iframe `window.onerror` listener -> auto-re-prompt LLM with error context.
* **Required Corez Changes:** Add `onerror` messaging bridge in `CanvasPreview.jsx`; trigger automated error repair turn.
* **Required Model/Tool/API/Dependency:** Multi-turn proxy history + canvas message bridge.
* **Secret/Permission & Data Exposure:** Browser JS runtime error strings.
* **Offline Feasibility:** Partial (offline error fixer templates).
* **Complexity:** M
* **Feasible with Current Proxy:** No
* **Prerequisites:** Canvas iframe error bridge & multi-turn proxy.
* **Priority:** Next

#### Skill 11.4: Dynamic Multi-Agent Delegation Router
* **User Value / Example:** Routes specialized sub-tasks to specialized domain models (e.g., DeepSeek for code, Claude for writing, Gemini for vision).
* **Execution Shape:** Router model determines optimal `model` parameter per step in multi-agent workflow.
* **Required Corez Changes:** Multi-model routing matrix in `api/openrouter.js`.
* **Required Model/Tool/API/Dependency:** OpenRouter dynamic model selection.
* **Secret/Permission & Data Exposure:** None.
* **Offline Feasibility:** No.
* **Complexity:** L
* **Feasible with Current Proxy:** No
* **Prerequisites:** Agentic loop architecture.
* **Priority:** Later

---

### Category 12: Domain-Specific Packs

#### Skill 12.1: Legal Contract Clause Analyzer & Risk Highlight Pack
* **User Value / Example:** Flags high-risk indemnity, liability, and termination clauses in uploaded contract text.
* **Execution Shape:** System prompt domain pack + Markdown report renderer.
* **Required Corez Changes:** Domain prompt preset selector in settings.
* **Required Model/Tool/API/Dependency:** Standard LLM.
* **Secret/Permission & Data Exposure:** Contract text content.
* **Offline Feasibility:** Yes.
* **Complexity:** S
* **Feasible with Current Proxy:** Yes
* **Prerequisites:** None.
* **Priority:** Next

#### Skill 12.2: Healthcare & Patient Communication Explainer Pack
* **User Value / Example:** Translates medical jargon and lab reports into easy-to-understand patient summaries with disclaimer.
* **Execution Shape:** System prompt domain pack with mandatory medical disclaimer footer.
* **Required Corez Changes:** Domain prompt preset selector.
* **Required Model/Tool/API/Dependency:** Standard LLM.
* **Secret/Permission & Data Exposure:** Medical notes text.
* **Offline Feasibility:** Yes.
* **Complexity:** S
* **Feasible with Current Proxy:** Yes
* **Prerequisites:** Mandatory safety disclaimer component.
* **Priority:** Next

#### Skill 12.3: Software Architecture & Security Threat Modeler Pack
* **User Value / Example:** Generates STRIDE security threat models and mitigation checklists for system designs.
* **Execution Shape:** Structured Markdown threat matrix + Mermaid.js diagram.
* **Required Corez Changes:** Domain prompt preset selector.
* **Required Model/Tool/API/Dependency:** Standard LLM.
* **Secret/Permission & Data Exposure:** System design descriptions.
* **Offline Feasibility:** Yes.
* **Complexity:** S
* **Feasible with Current Proxy:** Yes
* **Prerequisites:** None.
* **Priority:** Now

#### Skill 12.4: E-Commerce Product Copy & SEO Meta Generator Pack
* **User Value / Example:** Generates product descriptions, meta tags, and structured JSON-LD schema for online stores.
* **Execution Shape:** System prompt + JSON-LD code block generator.
* **Required Corez Changes:** Domain prompt preset selector.
* **Required Model/Tool/API/Dependency:** Standard LLM.
* **Secret/Permission & Data Exposure:** Product descriptions.
* **Offline Feasibility:** Yes.
* **Complexity:** S
* **Feasible with Current Proxy:** Yes
* **Prerequisites:** None.
* **Priority:** Now

---

## 4. Architectural Gaps & Proxy Honesty Audit

The table below provides a strict engineering audit of the current `api/openrouter.js` proxy implementation against capability prerequisites:

| Feature / Capability | Supported by Current Proxy? | Exact Technical Root Cause of Limitation | Required Infrastructure Upgrade |
| :--- | :--- | :--- | :--- |
| **Multi-Turn Context** | **NO** | `api/openrouter.js` accepts only a single `prompt` string (line 59) and constructs a 2-element `messages` array (lines 80-83). | Update `api/openrouter.js` schema to accept optional `messages` array from client payload. |
| **SSE Streaming** | **NO** | `api/openrouter.js` uses standard `fetch` without `stream: true` (lines 71-88) and awaits full `json()` (line 100). | Pass `stream: true` to OpenRouter and return a `ReadableStream` HTTP response (SSE). |
| **Live Web Search** | **NO** | Proxy does not pass `tools` array or `plugins` array to OpenRouter HTTP request body. | Support passing `tools: [{ type: "openrouter:web_search" }]` or `plugins: [{ id: "web" }]` in request body. |
| **Multimodal Vision** | **NO** | Proxy expects plain string `prompt` and injects string into `{ role: 'user', content: prompt }`. | Allow `content` to be an array containing text and `image_url` objects. |
| **Structured Output** | **PARTIAL** | Corez relies on client regex parsing (`extractCodeFromMessage`) which can fail on syntax variations. | Support passing `response_format: { type: "json_schema", ... }` to OpenRouter. |
| **Usage Accounting** | **PARTIAL** | OpenRouter returns token usage and cost in response JSON, but proxy returns only `{ content, model }` (line 108). | Expose `data.usage` object in proxy JSON response body. |
| **Self-Correction Loop** | **NO** | Client preview canvas iframe does not capture runtime errors or send feedback turn to proxy. | Add `window.onerror` postMessage bridge in `CanvasPreview.jsx` to trigger repair turn. |

---

## 5. Source-Backed Top-10 Engineering Roadmap

Based on OpenRouter provider capabilities and current Corez architecture, here is the prioritized engineering roadmap for Codex:

1. **Multi-Turn Proxy & Client History Sync (NOW)**
   * *Rationale:* Unlocks interactive tutoring, incremental canvas refinement, and conversational reasoning. Low risk, high value.
   * *Required Changes:* Modify `api/openrouter.js` to accept `messages` array; update `src/App.jsx` to store history.

2. **OpenRouter Usage & Token Cost Accounting Pass-Through (NOW)**
   * *Rationale:* OpenRouter already returns `usage` (tokens & cost) in API responses. Exposing it in proxy response allows instant UI cost transparency.
   * *Required Changes:* Pass `usage: data.usage` in `api/openrouter.js` response; display token count in `src/App.jsx` status bar.

3. **Live Web Search via `openrouter:web_search` and `plugins: [{ id: 'web' }]` (NEXT)**
   * *Rationale:* Enables real-time research, documentation lookup, and news checking without third-party API keys.
   * *Required Changes:* Add optional search flags to proxy payload; inject `tools: [{ type: "openrouter:web_search" }]` or `plugins: [{ id: "web" }]` into OpenRouter payload.

4. **SSE Response Streaming Integration (NEXT)**
   * *Rationale:* Prevents HTTP gateway timeouts on Vercel/Node serverless during long app or code generations. Dramatically improves perceived user speed.
   * *Required Changes:* Set `stream: true` on OpenRouter request and pipe chunked response via ReadableStream.

5. **Multimodal Vision Input Support (NEXT)**
   * *Rationale:* Enables screenshot-to-code generation and visual document analysis.
   * *Required Changes:* Support image upload dropzone in UI; format `content` array with `image_url` objects in proxy payload.

6. **Canvas Iframe Runtime Error Bridge & Automated Self-Correction (NEXT)**
   * *Rationale:* Increases code generation reliability by automatically catching JS runtime exceptions in the canvas preview and requesting repairs.
   * *Required Changes:* Add `window.onerror` script inside iframe template; dispatch postMessage to parent; trigger automated error repair turn.

7. **Structured Output Enforcement via JSON Schema (NEXT)**
   * *Rationale:* Replaces fragile regex extraction with guaranteed JSON schemas for complex multi-component or structured data skills.
   * *Required Changes:* Add `response_format` parameter handling in proxy; define standard schemas for structured skills.

8. **Client-Side File Extractor (TXT, MD, CSV, JSON) (NEXT)**
   * *Rationale:* Expands document processing capabilities without requiring expensive server-side file conversion pipelines.
   * *Required Changes:* Add HTML5 FileReader dropzone to chat input bar; prepend file content to user prompt.

9. **Voice Input via Web Speech API (NEXT)**
   * *Rationale:* Hands-free prompt creation using native browser capabilities with zero third-party dependencies.
   * *Required Changes:* Add microphone button in input bar utilizing native `webkitSpeechRecognition`.

10. **Client-Side Vector RAG Knowledge Base (LATER)**
    * *Rationale:* Provides local document search across session histories while maintaining 100% privacy and zero server database overhead.
    * *Required Changes:* Integrate `@xenova/transformers` in client build pipeline for in-browser embeddings and IndexedDB vector storage.

---

## 6. Detailed Corrections to Earlier Reports

1. **Web Search Plugin vs Server Tool Status Corrected:**
   * *Earlier Report:* Claimed or implied that `plugins: [{ id: 'web' }]` was deprecated or unavailable.
   * *Correction:* Both `plugins: [{ id: 'web' }]` and `openrouter:web_search` are documented OpenRouter features. The plugin mechanism remains supported for request-level pre-search pipelines, while `openrouter:web_search` offers an agentic server tool mechanism inside the `tools` array.

2. **Proxy Statefulness Clarified:**
   * *Earlier Report:* Assumed multi-turn context was active because `App.jsx` maintained local chat history strings.
   * *Correction:* `api/openrouter.js` strictly discards history, accepting only single `prompt` strings. Multi-turn chat is currently non-functional at the backend proxy level.

3. **Structured Output Capability Clarified:**
   * *Earlier Report:* Treated regex code extraction (`extractCodeFromMessage`) as structured output.
   * *Correction:* Regex parsing is a client-side heuristic. True structured output requires OpenRouter's `response_format: { type: "json_schema" }` API specification.

4. **Usage & Cost Accounting Transparency:**
   * *Earlier Report:* Did not account for OpenRouter's native `usage` field and cost tracking headers.
   * *Correction:* OpenRouter provides native per-request cost and token metrics in every response body; proxy must be updated to pass these metrics to the client UI.

---

### Summary Checklist for Codex Strategy Review
* [x] Zero modifications made to `/workspaces/New-Corez` (Analysis Only mode strictly preserved).
* [x] Zero access to secrets, environment files, credentials, or logs.
* [x] Verified current OpenRouter provider features with direct official URLs cited.
* [x] 48 skill families across 12 categories completely inventoried with compact schema fields.
* [x] Top-10 source-backed roadmap and architecture gap audit produced.
* [x] Research artifact saved exclusively in generated artifact area: `/home/codespace/.gemini/antigravity-cli/brain/7334c80a-cfb7-47e2-8367-802af687119f/corez_skills_research.md`.
