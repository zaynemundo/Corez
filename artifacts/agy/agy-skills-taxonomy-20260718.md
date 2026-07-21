# Corez AI Assistant Skills Taxonomy & Architectural Roadmap (July 2026)

**Author:** AGY (Subordinate Research Specialist)  
**Advising:** Codex (Lead Engineer & Final Decision-Maker)  
**Target Codebase:** Corez (`/workspaces/New-Corez`)  
**Date:** 2026-07-18  
**Mode:** Analysis Only (Zero Workspace File Modifications)

---

## 1. Executive Summary

Corez is currently a minimalist, public-facing React/Vite conversational client paired with an instant local offline response engine, a regex-based intent router, a server-side OpenRouter chat-completions proxy, and a live sandboxed HTML preview canvas.

To evolve Corez into a versatile, state-of-the-art AI assistant without compromising its minimalist design and instant responsiveness, this document establishes a **comprehensive capability taxonomy** across 12 domain categories as of July 2026.

### Primary Architectural Takeaway for Codex
The current Corez backend proxy (`api/openrouter.js`) operates as a **single-turn, stateless text completion proxy**. It sends only a static system prompt and the latest user prompt, omitting past conversation history, tool definitions, structured JSON schemas, SSE streaming, file attachments, and multi-modal payloads.

* **Prompt-Only & Deterministic Client Skills** (e.g., Socratic reasoning, client-side SVG/Chart rendering, single-file HTML preview generation, text formatting) fit the current baseline **NOW**.
* **Agentic & Interactive Skills** (e.g., Live Web Search via `openrouter:web_search`, Multi-turn code editing, PDF parsing, Vision screenshot-to-code) require **explicit backend proxy upgrades** (**NEXT**).
* **Enterprise & External Skills** (e.g., OAuth connectors, vector RAG memory, arbitrary backend code sandbox execution) should be deferred until stateful backend services are established (**LATER / AVOID**).

---

## 2. Current Corez Architecture & Baseline Analysis

```
+-----------------------------------------------------------------------------------+
|                                  COREZ FRONTEND                                   |
|                                                                                   |
|  +--------------------+   +-----------------------+   +------------------------+  |
|  | React/Vite Client  |-->| Intent Router (Regex) |-->| Local Response Engine  |  |
|  | localStorage State |   | (app/code/write/etc)  |   | (Static Offline Apps)  |  |
|  +--------------------+   +-----------------------+   +------------------------+  |
|            |                                                        | (Fallback)  |
|            v                                                        v             |
|  +--------------------+                          +-----------------------------+  |
|  |  Preview Canvas    |<-------------------------| extractCodeFromMessage()    |  |
|  |  (iframe sandbox)  |                          | (Parses ```html blocks)     |  |
|  +--------------------+                          +-----------------------------+  |
+-----------------------------------------------------------------------------------+
             |
             | POST /api/openrouter { prompt, model, intent }
             v
+-----------------------------------------------------------------------------------+
|                                 SERVERLESS BACKEND                                |
|                                                                                   |
|  +-----------------------------------------------------------------------------+  |
|  | api/openrouter.js (Vercel Serverless Function)                              |  |
|  | - Single-turn POST to https://openrouter.ai/api/v1/chat/completions         |  |
|  | - Sends: [ {role: 'system', content: buildSystemPrompt}, {role: 'user'} ]   |  |
|  | - Model: deepseek/deepseek-v4-flash (default)                             |  |
|  +-----------------------------------------------------------------------------+  |
+-----------------------------------------------------------------------------------+
```

### Key Components & Constraints
1. **Frontend Client (`src/App.jsx`)**: Manages chat sessions in `localStorage`, active canvas code, and theme toggle.
2. **Intent Router (`src/services/aiService.js`)**: Uses regex patterns to identify `app`, `code-help`, `writing`, `explanation`, or `general` intent.
3. **Local Response Engine (`generateLocalAIResponse`)**: 600ms simulated latency fallback generating offline stopwatch, particle sandbox, or custom counter widgets.
4. **Canvas Preview (`src/components/CanvasPreview.jsx`)**: Standard `<iframe>` sandbox (`allow-scripts allow-modals allow-forms allow-same-origin`) with responsive viewport switcher (Desktop, Laptop, Tablet, Mobile), source editor, copy, and download capabilities.
5. **OpenRouter Proxy (`api/openrouter.js`)**: Stateles serverless proxy forwarding requests to OpenRouter.

---

## 3. Architectural Gaps & Proxy Honesty Audit

The following table explicitly flags capabilities that **CANNOT** be honestly implemented with the current `api/openrouter.js` proxy as written, along with the necessary prerequisite infrastructure:

| Capability / Feature | Works with Current Proxy? | Why It Fails Currently | Prerequisite Proxy & Infrastructure Upgrade Required |
| :--- | :--- | :--- | :--- |
| **Multi-Turn Context & Refinement** | **NO** | Proxy only receives single `prompt` string; history in `App.jsx` is ignored. | Pass full `messages` array in body; proxy forwards full history to OpenRouter. |
| **Live Web Search & Research** | **NO** | Proxy does not pass `tools` array to OpenRouter. | Add `tools: [{ type: "openrouter:web_search", parameters: { ... } }]` to OpenRouter request. |
| **Streaming Responses (SSE)** | **NO** | Proxy waits synchronously for complete HTTP response before returning JSON. Long outputs timeout. | Enable `stream: true` on OpenRouter call and pipe Server-Sent Events (SSE) back to client. |
| **Vision / Screenshot Analysis** | **NO** | Proxy expects plain string `prompt`; no image payload/base64 handling. | Update proxy schema to support OpenAI multi-modal message arrays (`content: [{type: 'image_url'}, ...]`). |
| **Document Parsing (PDF/DOCX)** | **NO** | No client file uploader or server file parsing middleware (e.g. `pdf-parse`). | Implement client file dropped handler + server document text extraction endpoint. |
| **Structured Output / Schemas** | **PARTIAL** | Corez uses regex text matching (`extractCodeFromMessage`) which can fail on subtle syntax variants. | Pass `response_format: { type: "json_schema", ... }` to OpenRouter for guaranteed parsing. |
| **Local Persistent Memory / RAG** | **NO** | No vector storage or indexing; `localStorage` holds only basic session strings. | Client IndexedDB vector store (e.g., `@xenova/transformers` embeddings) or server vector DB. |
| **OAuth Connectors (GitHub, etc.)** | **NO** | Corez has no authentication layer, token storage, or encrypted secret manager. | OAuth 2.0 PKCE flow in client or server token vault + proxy header forwarding. |
| **Arbitrary Code Execution** | **NO** | Preview canvas is restricted to browser DOM JS/HTML inside iframe; no Python/Node execution. | Server-side containerized sandbox (e.g. E2B or Docker container microservice). |

---

## 4. Comprehensive Taxonomy of AI Assistant Skills (12 Categories)

Below is the exhaustive, structured capability inventory evaluated for Corez as of July 2026.

---

### Category 1: Conversation & Reasoning

#### Skill 1.1: Multi-Step Chain-of-Thought & Tradeoff Explorer
* **User Value:** Helps users make complex architectural or product decisions with explicit pro/con evaluations.
* **Example Request:** *"Should I use PostgreSQL or MongoDB for a real-time collaborative whiteboarding app? Compare performance, scaling, and operational overhead."*
* **Implementation Shape:** Prompt-only (System prompt structured output).
* **Frontend/Backend Boundary:** Frontend formats prompt; proxy forwards request.
* **Required Model/Tool/API:** `deepseek/deepseek-v4-flash` or `openai/o3-mini` via OpenRouter (uses `reasoning_effort: xhigh`).
* **Secret/Permission Needs:** None.
* **Privacy/Security Risks:** Low.
* **Offline Feasibility:** Yes (local heuristic prompt template).
* **Estimated Complexity:** **S**
* **Fit with Corez:** **EXCELLENT**. Works immediately with current architecture.

#### Skill 1.2: Interactive Socratic Tutor
* **User Value:** Guides public users through complex concepts step-by-step using diagnostic questions rather than wall-of-text answers.
* **Example Request:** *"Teach me how CSS Flexbox works, but quiz me after each concept."*
* **Implementation Shape:** Prompt-only + Multi-turn state (Requires multi-turn proxy upgrade).
* **Frontend/Backend Boundary:** Client passes conversation history; proxy streams turn.
* **Required Model/Tool/API:** Standard conversational LLM via OpenRouter.
* **Secret/Permission Needs:** None.
* **Privacy/Security Risks:** Low.
* **Offline Feasibility:** Partial (simple offline questions).
* **Estimated Complexity:** **S**
* **Fit with Corez:** **HIGH** (after multi-turn history proxy fix).

#### Skill 1.3: Structured Debater / Devil's Advocate
* **User Value:** Stress-tests ideas, pitches, or technical designs by taking opposing viewpoints.
* **Example Request:** *"Critique my business model for an AI-powered code reviewer. Point out all potential flaws."*
* **Implementation Shape:** Prompt-only.
* **Frontend/Backend Boundary:** Frontend system prompt injection.
* **Required Model/Tool/API:** Standard LLM.
* **Secret/Permission Needs:** None.
* **Privacy/Security Risks:** Low.
* **Offline Feasibility:** Yes.
* **Estimated Complexity:** **S**
* **Fit with Corez:** **EXCELLENT**.

---

### Category 2: Coding & Live App Generation

#### Skill 2.1: Monochrome Single-File Web App Generator (Current Baseline)
* **User Value:** Instantly builds runnable HTML/CSS/JS tools, games, dashboards, and calculators in preview canvas.
* **Example Request:** *"Build an executive analytics dashboard with monochrome styling, stark SVG chart, and live search."*
* **Implementation Shape:** Prompt-only + Client Preview Execution.
* **Frontend/Backend Boundary:** Proxy streams generated HTML string; client `CanvasPreview.jsx` renders in iframe.
* **Required Model/Tool/API:** `deepseek/deepseek-v4-flash`.
* **Secret/Permission Needs:** None.
* **Privacy/Security Risks:** Moderate (untrusted JS execution inside iframe; mitigated by iframe sandboxing).
* **Offline Feasibility:** Yes (template generators in `aiService.js`).
* **Estimated Complexity:** **S** (Already active).
* **Fit with Corez:** **CORE FEATURE**.

#### Skill 2.2: Iterative Canvas App Modifier / Live Component Refiner
* **User Value:** Allows users to ask for modifications to the currently active preview app without rebuilding from scratch.
* **Example Request:** *"Add a dark mode toggle and export-to-CSV button to the dashboard currently open in preview."*
* **Implementation Shape:** Prompt-only with Context Injection + Multi-turn Proxy.
* **Frontend/Backend Boundary:** Client appends current `activeCanvasCode` into prompt context; proxy sends to model.
* **Required Model/Tool/API:** LLM with high context window.
* **Secret/Permission Needs:** None.
* **Privacy/Security Risks:** Low.
* **Offline Feasibility:** No.
* **Estimated Complexity:** **M**
* **Fit with Corez:** **HIGH**. Directly leverages `CanvasPreview.jsx`.

#### Skill 2.3: Visual Code Diffing & In-Place Syntax Repair
* **User Value:** Highlights exact code fixes and displays side-by-side diffs before applying changes to the preview canvas.
* **Example Request:** *"Fix the layout bug in my CSS grid code and show me what changed."*
* **Implementation Shape:** Deterministic Client Tool (`diff` package) + Structured JSON response from LLM.
* **Frontend/Backend Boundary:** LLM returns `{ original, updated, explanation }`; client renders inline diff viewer.
* **Required Model/Tool/API:** OpenRouter JSON mode (`response_format`).
* **Secret/Permission Needs:** None.
* **Privacy/Security Risks:** Low.
* **Offline Feasibility:** Yes.
* **Estimated Complexity:** **M**
* **Fit with Corez:** **EXCELLENT**.

---

### Category 3: Files & Documents

#### Skill 3.1: Client-Side Drag-and-Drop Text/Markdown Parser & Summarizer
* **User Value:** Instant analysis, summarization, and key insight extraction from text files, logs, and markdown docs dropped into chat.
* **Example Request:** *"Summarize this README.md and list all configuration requirements."*
* **Implementation Shape:** Deterministic Local Tool (HTML5 File API / FileReader in client).
* **Frontend/Backend Boundary:** Client reads file content directly; sends text to proxy.
* **Required Model/Tool/API:** FileReader API + OpenRouter text model.
* **Secret/Permission Needs:** Browser file access prompt.
* **Privacy/Security Risks:** Low (files remain local/sent only to proxy).
* **Offline Feasibility:** Yes (offline heuristic summarization).
* **Estimated Complexity:** **S**
* **Fit with Corez:** **HIGH**. No server storage needed.

#### Skill 3.2: PDF Document Q&A and Extraction
* **User Value:** Extracts text and answers questions from user-uploaded PDF documents.
* **Example Request:** *"Extract key terms and total amounts from this PDF invoice."*
* **Implementation Shape:** Deterministic Client Tool (`pdfjs-dist` in browser) OR Server Parser Endpoint.
* **Frontend/Backend Boundary:** Client parses PDF binary to raw text via `pdf.js`; passes text prompt to OpenRouter proxy.
* **Required Model/Tool/API:** `pdfjs-dist` npm package.
* **Secret/Permission Needs:** None.
* **Privacy/Security Risks:** Low-Moderate (user uploads sensitive PDFs).
* **Offline Feasibility:** Partial (pdf text extraction works offline).
* **Estimated Complexity:** **M**
* **Fit with Corez:** **HIGH**. Fits web browser architecture.

#### Skill 3.3: One-Click Document Exporter (Markdown / HTML / PDF)
* **User Value:** Converts generated chat content or documentation into downloadable PDF or formatted Markdown files.
* **Example Request:** *"Export this proposal as a clean PDF document."*
* **Implementation Shape:** Deterministic Local Tool (`jspdf` or browser `window.print()` / blob downloads).
* **Frontend/Backend Boundary:** 100% Client-side.
* **Required Model/Tool/API:** Client JS blob library.
* **Secret/Permission Needs:** Browser download permission.
* **Privacy/Security Risks:** None.
* **Offline Feasibility:** 100% Offline.
* **Estimated Complexity:** **S**
* **Fit with Corez:** **EXCELLENT** (Extends current `.html` download button in `CanvasPreview.jsx`).

---

### Category 4: Web, Search, & Research

#### Skill 4.1: Live Web Search & Grounded Citation Engine
* **User Value:** Fetches up-to-the-minute real-time web results, news, and technical documentation with inline source links.
* **Example Request:** *"What are the key features announced for React 19 final release and current best practices?"*
* **Implementation Shape:** Server Tool (`openrouter:web_search` parameter in proxy).
* **Frontend/Backend Boundary:** Client sends prompt; proxy includes `tools: [{ type: "openrouter:web_search" }]`; proxy parses citations.
* **Required Model/Tool/API:** OpenRouter `openrouter:web_search` server tool (supports Exa/Firecrawl engines).
* **Secret/Permission Needs:** OpenRouter API key with web search enabled.
* **Privacy/Security Risks:** Low (queries sent to search engines).
* **Offline Feasibility:** No.
* **Estimated Complexity:** **M**
* **Fit with Corez:** **HIGH**. Major value multiplier for research.

#### Skill 4.2: URL Web Reader & Page Content Distiller
* **User Value:** Reads and distills long articles or documentation pages from a provided URL.
* **Example Request:** *"Read https://example.com/blog/post and extract the main arguments."*
* **Implementation Shape:** Server Tool (CORS proxy fetcher / Jdom reader endpoint).
* **Frontend/Backend Boundary:** Backend fetches URL content, strips HTML boilerplate (e.g. Readability.js), passes text to OpenRouter.
* **Required Model/Tool/API:** Server-side fetch + Readability library.
* **Secret/Permission Needs:** Outbound HTTP access on server.
* **Privacy/Security Risks:** Moderate (SSRF risk; must validate and restrict internal IP targets).
* **Offline Feasibility:** No.
* **Estimated Complexity:** **M**
* **Fit with Corez:** **MEDIUM-HIGH**.

---

### Category 5: Images, Audio, & Video

#### Skill 5.1: Screenshot / Design Mockup to Runnable Code (Vision)
* **User Value:** Converts uploaded UI design mockups or screenshots into live HTML/CSS previews inside the canvas.
* **Example Request:** *"Turn this dashboard wireframe image into a responsive HTML page."*
* **Implementation Shape:** Multi-modal Prompt (Base64 Image Payload).
* **Frontend/Backend Boundary:** Client converts image file to base64 `data:image/...`; proxy sends OpenAI-compatible multi-modal payload.
* **Required Model/Tool/API:** Vision-capable model on OpenRouter (`xiaomi/mimo-v2.5`).
* **Secret/Permission Needs:** None beyond standard proxy API key.
* **Privacy/Security Risks:** Low-Moderate (user images sent to model provider).
* **Offline Feasibility:** No.
* **Estimated Complexity:** **M**
* **Fit with Corez:** **EXCELLENT**. Directly feeds `CanvasPreview.jsx`.

#### Skill 5.2: Visual Diagram Generator (Mermaid.js / SVG)
* **User Value:** Renders interactive flowcharts, architecture diagrams, sequence diagrams, and state machines inside chat/canvas.
* **Example Request:** *"Draw a sequence diagram showing user auth flow with JWT tokens."*
* **Implementation Shape:** Prompt-only + Deterministic Client Renderer (`mermaid.js`).
* **Frontend/Backend Boundary:** LLM outputs ```mermaid block; `ChatMessage.jsx` parses and renders via `mermaid.render()`.
* **Required Model/Tool/API:** Client-side `mermaid` npm package + standard LLM.
* **Secret/Permission Needs:** None.
* **Privacy/Security Risks:** None.
* **Offline Feasibility:** 100% Offline.
* **Estimated Complexity:** **S**
* **Fit with Corez:** **EXCELLENT**. Fits minimalist tech design aesthetic.

#### Skill 5.3: Text-to-Image Canvas Asset Generator
* **User Value:** Generates custom placeholder icons, UI artwork, or images for web apps generated in canvas.
* **Example Request:** *"Generate a sleek minimalist monochrome logo for a tech startup."*
* **Implementation Shape:** Server Tool / External API Call.
* **Frontend/Backend Boundary:** Proxy calls image generation model on OpenRouter (e.g., `black-forest-labs/flux-1-schnell`); returns URL/Base64.
* **Required Model/Tool/API:** Image generation endpoint via OpenRouter.
* **Secret/Permission Needs:** API Key permissions.
* **Privacy/Security Risks:** Low.
* **Offline Feasibility:** No.
* **Estimated Complexity:** **M**
* **Fit with Corez:** **MEDIUM**.

---

### Category 6: Data Analysis & Visualization

#### Skill 6.1: Client-Side Interactive CSV Data Workbench & Chart Plotter
* **User Value:** Parses uploaded CSV data and generates live interactive charts (bar, line, scatter) using Chart.js or SVG inside preview canvas.
* **Example Request:** *"Analyze this sales.csv data, compute monthly averages, and show an interactive line chart."*
* **Implementation Shape:** Deterministic Client Tool (PapaParse + Chart.js embedded in Generated HTML preview).
* **Frontend/Backend Boundary:** Client parses CSV locally; sends schema + sample rows to OpenRouter to write HTML/Chart.js web app.
* **Required Model/Tool/API:** `PapaParse` + `Chart.js` (loaded via CDN in preview iframe).
* **Secret/Permission Needs:** None.
* **Privacy/Security Risks:** Low (data stays in browser session).
* **Offline Feasibility:** Yes.
* **Estimated Complexity:** **M**
* **Fit with Corez:** **EXCELLENT**. Builds directly on canvas capability.

#### Skill 6.2: Financial & Mathematical Expression Evaluator
* **User Value:** Performs precise calculations, loan amortizations, unit conversions, and formula evaluations without LLM math hallucination.
* **Example Request:** *"Calculate the monthly payment on a $400,000 mortgage at 6.5% interest over 30 years with an interactive schedule."*
* **Implementation Shape:** Hybrid Prompt + Client-side JS code execution in Canvas.
* **Frontend/Backend Boundary:** Model generates JS calculation code; client executes deterministically in iframe.
* **Required Model/Tool/API:** Browser JS engine.
* **Secret/Permission Needs:** None.
* **Privacy/Security Risks:** Low.
* **Offline Feasibility:** Yes.
* **Estimated Complexity:** **S**
* **Fit with Corez:** **HIGH**.

---

### Category 7: Productivity & Connectors

#### Skill 7.1: Client-Side ICS Calendar Event & Agenda Generator
* **User Value:** Generates downloadable `.ics` calendar invite files for meetings, deadlines, or project milestones.
* **Example Request:** *"Schedule a project kickoff for next Tuesday at 2 PM EST with agenda points and give me a calendar invite."*
* **Implementation Shape:** Deterministic Client Tool (Generates iCalendar `.ics` format text blob).
* **Frontend/Backend Boundary:** LLM outputs structured event details; client triggers `.ics` download.
* **Required Model/Tool/API:** Client JS Blob file builder.
* **Secret/Permission Needs:** None.
* **Privacy/Security Risks:** None.
* **Offline Feasibility:** 100% Offline.
* **Estimated Complexity:** **S**
* **Fit with Corez:** **HIGH**. Minimalist productivity feature.

#### Skill 7.2: Third-Party Cloud Integration (GitHub / Notion / Google Drive)
* **User Value:** Syncs generated apps, docs, or issues directly to user repositories or workspaces.
* **Example Request:** *"Push this generated React component directly as a pull request to my GitHub repo."*
* **Implementation Shape:** Third-Party Connector (OAuth 2.0 PKCE + REST API client).
* **Frontend/Backend Boundary:** Requires token management, backend secret proxying, and OAuth callback redirect handlers.
* **Required Model/Tool/API:** GitHub REST API / OAuth App secrets.
* **Secret/Permission Needs:** User OAuth Access Tokens (HIGH RISK if stored insecurely).
* **Privacy/Security Risks:** **HIGH** (Token leakage, arbitrary repo modification).
* **Offline Feasibility:** No.
* **Estimated Complexity:** **XL**
* **Fit with Corez:** **POOR (FOR NOW)**. Conflicts with Corez's zero-auth, minimalist server setup.

---

### Category 8: Memory & Personalization

#### Skill 8.1: Session System Prompt & Persona Preset Manager
* **User Value:** Allows users to select custom system instructions (e.g. "Senior React Architect", "Concise Tech Writer", "Socratic Math Tutor") stored in settings.
* **Example Request:** *"Switch assistant persona to 'Stark Minimalist UI Designer'."*
* **Implementation Shape:** Deterministic Client Tool (`localStorage` setting + Proxy system prompt parameter).
* **Frontend/Backend Boundary:** Client passes active persona ID in settings; proxy injects into system prompt.
* **Required Model/Tool/API:** Client `localStorage` + Proxy system prompt handler.
* **Secret/Permission Needs:** None.
* **Privacy/Security Risks:** None.
* **Offline Feasibility:** 100% Offline.
* **Estimated Complexity:** **S**
* **Fit with Corez:** **EXCELLENT**. Fits `SettingsModal.jsx`.

#### Skill 8.2: Browser Local Vector Memory (RAG over Session History)
* **User Value:** Remembers facts, preferences, and code snippets across historical conversations without server storage.
* **Example Request:** *"What was the API color scheme we agreed on 3 chats ago?"*
* **Implementation Shape:** Deterministic Client Tool (IndexedDB + Transformers.js embedded vectors).
* **Frontend/Backend Boundary:** Client indexes chat messages in IndexedDB using local embeddings; retrieves relevant context before sending request.
* **Required Model/Tool/API:** `@xenova/transformers` (WASM local embedding model in browser) + IndexedDB (`idb`).
* **Secret/Permission Needs:** Browser storage quota.
* **Privacy/Security Risks:** Low (100% private to user's browser).
* **Offline Feasibility:** Yes.
* **Estimated Complexity:** **L**
* **Fit with Corez:** **HIGH**. Preserves privacy & offline-first ethos.

---

### Category 9: Accessibility & Languages

#### Skill 9.1: Universal Multi-Lingual Real-Time Translator
* **User Value:** Translates content between languages while maintaining code integrity and technical formatting.
* **Example Request:** *"Translate this app documentation into Spanish and Japanese."*
* **Implementation Shape:** Prompt-only.
* **Frontend/Backend Boundary:** Frontend prompt injection.
* **Required Model/Tool/API:** Standard LLM via OpenRouter.
* **Secret/Permission Needs:** None.
* **Privacy/Security Risks:** Low.
* **Offline Feasibility:** Yes (local fallback prompt).
* **Estimated Complexity:** **S**
* **Fit with Corez:** **EXCELLENT**.

#### Skill 9.2: Web Speech API Text-to-Speech (Read Aloud) & Voice Input
* **User Value:** Hands-free voice input and speech synthesis for chat messages.
* **Example Request:** User clicks microphone icon to speak prompt, or speaker icon to listen to response.
* **Implementation Shape:** Deterministic Client Tool (`window.SpeechRecognition` & `window.speechSynthesis`).
* **Frontend/Backend Boundary:** 100% Client Web APIs.
* **Required Model/Tool/API:** Native Browser Web Speech APIs.
* **Secret/Permission Needs:** Microphone permission.
* **Privacy/Security Risks:** Low (handled by browser engine).
* **Offline Feasibility:** Depends on OS speech engine.
* **Estimated Complexity:** **S**
* **Fit with Corez:** **EXCELLENT**. Enhances UI accessibility.

---

### Category 10: Safety, Admin, & Observability

#### Skill 10.1: Live Token, Cost, & Latency Dashboard
* **User Value:** Displays exact token usage, estimated request cost, and response latency per turn.
* **Example Request:** Inspection of message metadata footer (`342 tokens • $0.0002 • 420ms`).
* **Implementation Shape:** Deterministic Client/Server Tool (OpenRouter response headers return `usage` object).
* **Frontend/Backend Boundary:** Proxy forwards `usage` metadata in response JSON; `ChatMessage.jsx` renders subtle status pill.
* **Required Model/Tool/API:** OpenRouter response JSON `usage` field (`prompt_tokens`, `completion_tokens`).
* **Secret/Permission Needs:** None.
* **Privacy/Security Risks:** None.
* **Offline Feasibility:** Yes (calculated for offline fallback).
* **Estimated Complexity:** **S**
* **Fit with Corez:** **EXCELLENT**. Fits minimalist, transparent UI design.

#### Skill 10.2: Client-Side Input PII Anonymizer & Sanitize Guard
* **User Value:** Warns users or strips email addresses, API keys, and phone numbers before sending prompts to external APIs.
* **Example Request:** Automatically redacts `sk-or-v1-...` or `user@domain.com` from user prompt before sending.
* **Implementation Shape:** Deterministic Local Tool (Regex scanner in client `aiService.js`).
* **Frontend/Backend Boundary:** Client pre-flight check before API call.
* **Required Model/Tool/API:** Local regex pattern matcher.
* **Secret/Permission Needs:** None.
* **Privacy/Security Risks:** Low (protects user privacy).
* **Offline Feasibility:** 100% Offline.
* **Estimated Complexity:** **S**
* **Fit with Corez:** **HIGH**. Aligns with safety rules in `AGENTS.md`.

---

### Category 11: Agentic Workflows

#### Skill 11.1: Multi-Step Interactive Planning & Clarification Agent
* **User Value:** When user intent is ambiguous, breaks down complex goals into an interactive step-by-step execution plan before generating code.
* **Example Request:** *"Build a CRM for real estate agents."* -> Agent asks 3 targeted questions about data fields and views first.
* **Implementation Shape:** Prompt-only + Client State Machine.
* **Frontend/Backend Boundary:** System prompt enforces clarification mode when intent uncertainty is high.
* **Required Model/Tool/API:** Standard LLM.
* **Secret/Permission Needs:** None.
* **Privacy/Security Risks:** Low.
* **Offline Feasibility:** Yes.
* **Estimated Complexity:** **M**
* **Fit with Corez:** **HIGH** (Extends current `PUBLIC_USER_INTENT_PROMPT`).

#### Skill 11.2: Autonomous Tool Execution Loop (Client-Side Agent)
* **User Value:** Model autonomously calls client tools (web search, canvas code generator, chart plotter) in a loop until task completion.
* **Example Request:** *"Find current crypto prices, plot a line chart, and build a live auto-refresh dashboard widget."*
* **Implementation Shape:** Server/Client Tool Execution Loop (`tools` schema in OpenRouter + client function caller).
* **Frontend/Backend Boundary:** Proxy handles multi-turn tool call responses from OpenRouter until final text response is produced.
* **Required Model/Tool/API:** OpenRouter tool calling models + Client/Server execution engine.
* **Secret/Permission Needs:** None.
* **Privacy/Security Risks:** Moderate (infinite loop risk; capped by max step count).
* **Offline Feasibility:** No.
* **Estimated Complexity:** **L**
* **Fit with Corez:** **HIGH** (Unlocks true agentic power).

---

### Category 12: Domain-Specific Packs

#### Skill 12.1: Founder & Pitch Deck HTML Generator Pack
* **User Value:** Rapidly builds interactive, monochrome slide decks and landing page prototypes with stark typography.
* **Example Request:** *"Create a 5-slide interactive pitch deck for an AI Developer Tool startup."*
* **Implementation Shape:** Prompt Template + Canvas Renderer.
* **Frontend/Backend Boundary:** System prompt extension.
* **Required Model/Tool/API:** Standard LLM + Canvas Preview.
* **Secret/Permission Needs:** None.
* **Privacy/Security Risks:** Low.
* **Offline Feasibility:** Yes.
* **Estimated Complexity:** **S**
* **Fit with Corez:** **EXCELLENT**.

#### Skill 12.2: Interactive Educational Simulator Pack (Physics / Math / Logic)
* **User Value:** Builds interactive 2D canvas simulations (gravity attractors, sorting algorithms, neural net visualizers).
* **Example Request:** *"Build an interactive visualizer for quicksort vs mergesort."*
* **Implementation Shape:** Prompt Template + HTML5 Canvas JS template.
* **Frontend/Backend Boundary:** System prompt extension + Local offline templates.
* **Required Model/Tool/API:** HTML5 2D Canvas API inside iframe.
* **Secret/Permission Needs:** None.
* **Privacy/Security Risks:** Low.
* **Offline Feasibility:** Yes (Extends offline particle sandbox template).
* **Estimated Complexity:** **S**
* **Fit with Corez:** **EXCELLENT**.

---

## 5. Implementation Shape Categorization

```
+---------------------------------------------------------------------------------------------------------+
|                                    SKILL IMPLEMENTATION CATEGORIES                                      |
+------------------------------------+------------------------------------+-------------------------------+
| Category                           | Description                        | Examples                      |
+------------------------------------+------------------------------------+-------------------------------+
| 1. Prompt-Only Skills              | Pure LLM system prompt engineering; | - Socratic Tutor              |
|                                    | zero code structural changes.      | - Multi-step Tradeoff Engine  |
|                                    |                                    | - Founder Pitch Pack          |
+------------------------------------+------------------------------------+-------------------------------+
| 2. Deterministic Local Tools       | 100% Client-side Web APIs & JS;    | - Web Speech Voice Input      |
|                                    | fast, offline, zero server cost.   | - Document Export (PDF/MD)    |
|                                    |                                    | - Mermaid.js Diagramming      |
|                                    |                                    | - Local PII Anonymizer        |
+------------------------------------+------------------------------------+-------------------------------+
| 3. Server-Side Tools               | Requires OpenRouter proxy parameters| - Live Web Search (`web_search`)|
|                                    | or Vercel serverless handlers.     | - SSE Streaming Endpoint      |
|                                    |                                    | - URL Reader Endpoint         |
+------------------------------------+------------------------------------+-------------------------------+
| 4. Third-Party Connectors          | Requires OAuth 2.0, API keys, &    | - GitHub PR Integration       |
|                                    | external SaaS backend services.    | - Google Drive Sync           |
+------------------------------------+------------------------------------+-------------------------------+
| 5. High-Risk Capabilities          | Security/safety risk; needs strict | - Un-sandboxed JS evaluation  |
|                                    | origin isolation & rate limits.    | - Client-side Secret Storage  |
+------------------------------------+------------------------------------+-------------------------------+
```

---

## 6. Recommended Prioritized Roadmap (Now, Next, Later, Avoid)

```
+---------------------------------------------------------------------------------------------------------+
|                                        PRIORITIZED ROADMAP MATRIX                                       |
+---------------------------------------------------------------------------------------------------------+
| [ NOW ] (Immediate Value, Low Complexity, Compatible with Current Baseline)                              |
|   1. Multi-Turn History Proxy Fix (Fixes single-turn proxy bug in api/openrouter.js)                    |
|   2. Mermaid.js Visual Diagram Renderer (Client-side rendering in ChatMessage.jsx)                      |
|   3. System Prompt & Persona Preset Manager (SettingsModal.jsx localStorage setting)                     |
|   4. Interactive Canvas App Refiner & Iterative Editing (Context-aware prompt injection)                |
|   5. Client-Side Document Exporter & Download Enhancements (PDF/Markdown/HTML)                          |
|   6. Token, Cost, & Latency Metadata Badge (Renders OpenRouter usage headers)                           |
+---------------------------------------------------------------------------------------------------------+
| [ NEXT ] (High Impact, Medium Complexity, Requires Proxy Tool/Streaming Updates)                        |
|   7. SSE Server-Sent Events Streaming Proxy (Prevents timeouts on long HTML app generation)             |
|   8. Live Web Search & Grounded Citation Engine (Integrates openrouter:web_search server tool)          |
|   9. Vision Screenshot-to-Code Generator (Supports base64 image uploads for canvas preview)             |
|  10. Client-Side CSV Data Workbench & Interactive Chart.js Plotter (Enhanced Canvas preview)            |
+---------------------------------------------------------------------------------------------------------+
| [ LATER ] (High Complexity, Architecture Upgrades Needed)                                               |
|  11. Local IndexedDB Vector RAG Memory (Browser-based semantic history search)                          |
|  12. Autonomous Client/Server Tool Calling Loop (Multi-step agent execution engine)                     |
+---------------------------------------------------------------------------------------------------------+
| [ AVOID / DEFER ] (High Security Risk, Friction with Minimalist Architecture)                           |
|  13. Third-Party OAuth Credential Vaults (GitHub/Notion sync - avoid complexity for now)               |
|  14. Server-Side Arbitrary Python/Node Code Execution (Container sandbox overhead)                      |
+---------------------------------------------------------------------------------------------------------+
```

---

## 7. Justified Top-10 Selection & Technical Execution Order

| Rank | Skill Name | Category | Primary Justification & Impact | Required Prerequisite |
| :---: | :--- | :--- | :--- | :--- |
| **1** | **Multi-Turn Proxy History Engine** | Core Infra | **Critical Bug Fix.** Unlocks multi-turn conversation context across all assistant skills. | Update `api/openrouter.js` to accept `messages` array from `App.jsx`. |
| **2** | **Iterative Canvas App Refiner** | Coding | Leverages Corez's primary differentiator (`CanvasPreview.jsx`) by allowing users to edit live apps conversationally. | Skill 1 (Multi-Turn History). |
| **3** | **Mermaid.js Diagram Renderer** | Images/Visual | Provides immediate visual value for tech/architecture queries with 0 server overhead. | Add `mermaid` package to frontend. |
| **4** | **Live Web Search (`web_search`)** | Web/Research | Solves LLM knowledge cutoff; grounds answers with real-time web citations. | Add `openrouter:web_search` tool parameter in proxy. |
| **5** | **SSE Streaming Response Proxy** | Core Infra | Eliminates UI frozen state and API timeouts during large HTML/code generations. | Refactor `api/openrouter.js` to stream response chunks. |
| **6** | **Vision Screenshot-to-Code** | Vision/Coding | High "WOW" factor; lets users upload UI wireframe images and get live HTML apps. | Proxy payload update to support multi-modal image arrays. |
| **7** | **CSV Data & Chart Plotter** | Data Analysis | Enables business and data analysis inside `CanvasPreview.jsx` using client JS libraries. | Client file drop handler + preview template injection. |
| **8** | **Token & Cost Usage Badge** | Safety/Admin | Enhances user trust and transparency by displaying token consumption and request speed. | Expose OpenRouter `usage` response fields to UI. |
| **9** | **Persona Preset Manager** | Personalization | Gives users immediate control over assistant tone/role without typing long prompts. | Extend `SettingsModal.jsx` & system prompt builder. |
| **10**| **Client Document Exporter** | Files/Docs | Simple offline capability allowing users to export canvas apps, markdown notes, and PDFs. | Add `jspdf` / html blob exporter to preview toolbar. |

---

## 8. Guidance for Codex

As Lead Engineer, Codex can execute this roadmap systematically without refactoring the core React frontend:
1. **Immediate Quick Win (Phase 1):** Patch `api/openrouter.js` to forward the `messages` array from `App.jsx` and expose `usage` headers (Ranks 1 & 8).
2. **Visual & Client Tools (Phase 2):** Add `mermaid.js` rendering to `ChatMessage.jsx` and document exporter to `CanvasPreview.jsx` (Ranks 3 & 10).
3. **Agentic Server Enhancements (Phase 3):** Enable `openrouter:web_search` tool parameter and SSE streaming in `api/openrouter.js` (Ranks 4 & 5).

---
*End of Research Artifact.*
