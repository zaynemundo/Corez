/**
 * CoreZ Superpowers Skill Definitions
 * Standardized metadata definitions for Superpowers methodology skills and CoreZ specialist capabilities.
 * Source reference: obra/superpowers (MIT License)
 */

export const SUPERPOWERS_SKILLS = [
  {
    id: 'using-superpowers',
    name: 'Using Superpowers',
    description: 'Bootstrap & workflow engine entry point for engineering and application building.',
    triggers: ['build', 'develop', 'debug', 'create', 'fix', 'refactor', 'swarm'],
    phase: 'BOOTSTRAP',
    priority: 1,
    dependencies: [],
    compatibleIntents: ['app', 'code-help', 'swarm'],
    requiresTools: [],
    instructions: `Before answering or writing code for complex engineering tasks, analyze the intent, determine task type, resolve applicable skills, construct the workflow state machine, and execute each stage systematically.`
  },
  {
    id: 'brainstorming',
    name: 'Brainstorming & Specification',
    description: 'Socratic design refinement, requirements discovery, and specification formulation before coding.',
    triggers: ['new app', 'build me', 'dashboard', 'saas', 'game', 'prototype', 'design'],
    phase: 'BRAINSTORMING',
    priority: 10,
    dependencies: [],
    compatibleIntents: ['app', 'swarm'],
    requiresTools: [],
    instructions: `Step back before writing code. Clarify user objectives, outline visual and architectural design, explore trade-offs, and produce a clear, validated specification chunk by chunk.`
  },
  {
    id: 'writing-plans',
    name: 'Writing Implementation Plans',
    description: 'Decomposes approved specifications into granular, bite-sized tasks with exact file paths, expected outputs, and verification criteria.',
    triggers: ['plan', 'architecture', 'decompose', 'roadmap', 'spec ready'],
    phase: 'PLANNING',
    priority: 20,
    dependencies: ['brainstorming'],
    compatibleIntents: ['app', 'code-help', 'swarm'],
    requiresTools: [],
    instructions: `Break engineering work into granular tasks (2-5 minutes each). Specify target files, exact code requirements, verification steps, and dependency relationships (DAG format).`
  },
  {
    id: 'subagent-driven-development',
    name: 'Subagent Driven Development',
    description: 'Dispatches fresh subagents per task brief with isolated context and two-stage review gates.',
    triggers: ['multi-agent', 'subagents', 'parallel execution', 'large request', 'swarm'],
    phase: 'IMPLEMENTING',
    priority: 30,
    dependencies: ['writing-plans'],
    compatibleIntents: ['app', 'swarm', 'code-help'],
    requiresTools: [],
    instructions: `Dispatch isolated subagent execution calls using task briefs containing goal, constraints, relevant files, and verification goals. Avoid context contamination.`
  },
  {
    id: 'executing-plans',
    name: 'Executing Plans',
    description: 'Sequential or batched execution of implementation plan tasks with progress tracking and state updates.',
    triggers: ['execute plan', 'run tasks', 'build features'],
    phase: 'IMPLEMENTING',
    priority: 31,
    dependencies: ['writing-plans'],
    compatibleIntents: ['app', 'code-help', 'swarm'],
    requiresTools: [],
    instructions: `Execute plan tasks in DAG order. Track completion status in real-time, enforcing RED-GREEN-REFACTOR for each engineering task.`
  },
  {
    id: 'dispatching-parallel-agents',
    name: 'Dispatching Parallel Agents',
    description: 'Concurrently executes non-overlapping independent tasks across specialist agents.',
    triggers: ['parallel', 'concurrent', 'independent tasks', 'swarm'],
    phase: 'IMPLEMENTING',
    priority: 35,
    dependencies: ['subagent-driven-development'],
    compatibleIntents: ['swarm', 'app'],
    requiresTools: [],
    instructions: `Identify independent DAG nodes with no shared resource locks and dispatch them concurrently. Sequence dependent nodes.`
  },
  {
    id: 'systematic-debugging',
    name: 'Systematic Debugging',
    description: 'Disciplined 7-phase root-cause investigation process for bug reports and runtime failures.',
    triggers: ['bug', 'crash', 'error', 'fails', 'exception', 'stack trace', 'not working'],
    phase: 'IMPLEMENTING',
    priority: 15,
    dependencies: [],
    compatibleIntents: ['code-help'],
    requiresTools: [],
    instructions: `Follow 7-phase root cause process: 1. Root-cause investigation, 2. Pattern analysis, 3. Hypothesis, 4. Test, 5. Minimal fix, 6. Regression test, 7. Verification. Do not guess fixes randomly.`
  },
  {
    id: 'test-driven-development',
    name: 'Test-Driven Development (TDD)',
    description: 'Enforces strict RED-GREEN-REFACTOR cycle: failing test first, minimal implementation, passing test, refactor.',
    triggers: ['tdd', 'unit test', 'failing test', 'implement feature'],
    phase: 'IMPLEMENTING',
    priority: 40,
    dependencies: ['writing-plans'],
    compatibleIntents: ['app', 'code-help', 'swarm'],
    requiresTools: [],
    instructions: `Write failing test (RED), verify failure, write minimal code to satisfy test (GREEN), verify test passes, refactor code while keeping tests green.`
  },
  {
    id: 'requesting-code-review',
    name: 'Requesting Code Review',
    description: 'Runs two-stage review gate: specification compliance review and code-quality review.',
    triggers: ['review code', 'review gate', 'code quality', 'spec check'],
    phase: 'REVIEWING',
    priority: 50,
    dependencies: ['test-driven-development'],
    compatibleIntents: ['app', 'code-help', 'swarm'],
    requiresTools: [],
    instructions: `Evaluate implementation output against specification and code quality criteria (security, performance, maintainability, accessibility). Send critical issues to REPAIRING.`
  },
  {
    id: 'receiving-code-review',
    name: 'Receiving Code Review',
    description: 'Processes review feedback and executes minimal targeted repairs for critical findings.',
    triggers: ['repair', 'fix review finding', 'review feedback'],
    phase: 'REPAIRING',
    priority: 55,
    dependencies: ['requesting-code-review'],
    compatibleIntents: ['app', 'code-help', 'swarm'],
    requiresTools: [],
    instructions: `Address critical review findings with minimal corrective edits, re-run tests, and return to review gate.`
  },
  {
    id: 'verification-before-completion',
    name: 'Verification Before Completion',
    description: 'Mandatory gate requiring empirical evidence records (tests, exit codes, builds) before claiming completion.',
    triggers: ['verify completion', 'evidence gate', 'completion check'],
    phase: 'VERIFYING',
    priority: 60,
    dependencies: ['requesting-code-review'],
    compatibleIntents: ['app', 'code-help', 'swarm'],
    requiresTools: [],
    instructions: `No completion claim without empirical verification evidence records (command, exit code, test pass/fail counts). Explicitly report if tools were unavailable.`
  },
  {
    id: 'finishing-a-development-branch',
    name: 'Finishing a Development Branch',
    description: 'Final verification, clean up, and completion decision for verified development tasks.',
    triggers: ['finish branch', 'complete task', 'ship feature'],
    phase: 'COMPLETE',
    priority: 70,
    dependencies: ['verification-before-completion'],
    compatibleIntents: ['app', 'code-help', 'swarm'],
    requiresTools: ['git'],
    instructions: `Verify branch cleanliness, confirm pass baseline, summarize verification evidence, and finalize task deliverable.`
  }
];

export const COREZ_SPECIALIST_SKILLS = [
  {
    id: 'frontend-modern-design',
    name: 'Frontend Modern Design',
    description: 'High-aesthetic UI creation using modern typography, dark mode, HSL color palettes, and glassmorphism.',
    triggers: ['ui', 'modern design', 'css', 'landing page', 'dashboard ui'],
    phase: 'IMPLEMENTING',
    priority: 25,
    dependencies: [],
    compatibleIntents: ['app'],
    requiresTools: [],
    instructions: 'Create responsive, visually stunning web UI with dark modes, curated HSL color palettes, modern typography, and smooth CSS micro-interactions.'
  },
  {
    id: 'game-development',
    name: 'Game Development',
    description: '2D/3D web games, HTML5 Canvas engines, physics simulators, and word game dictionaries.',
    triggers: ['game', 'canvas game', 'arcade', 'snake', 'pong', 'wordle', 'scrabble'],
    phase: 'IMPLEMENTING',
    priority: 25,
    dependencies: [],
    compatibleIntents: ['app', 'swarm'],
    requiresTools: [],
    instructions: 'Build runnable single-file HTML5 canvas games with complete game loops, input management, collision detection, and asset integration.'
  },
  {
    id: 'visual-creative',
    name: 'Visual Creative Engine',
    description: 'Image generation via FLUX 1, visual asset manifests, and layout direction via MiMo V2.5.',
    triggers: ['image', 'art', 'background', 'sprite', 'visual asset'],
    phase: 'IMPLEMENTING',
    priority: 22,
    dependencies: [],
    compatibleIntents: ['app', 'swarm'],
    requiresTools: [],
    instructions: 'Formulate structured JSON asset manifests for visual requirements and invoke FLUX image generation where appropriate.'
  },
  {
    id: 'research-report',
    name: 'Deep Research Report',
    description: 'Structured multi-source research: outline, evidence-gathering, citations, and a balanced report. User scenario: "Write me a research report on AI in healthcare" or "What does the data say about electric vehicle adoption?"',
    triggers: ['research report', 'research on', 'study', 'analysis of', 'white paper', 'literature review', 'compare and contrast', 'market research', 'deep dive', 'survey of'],
    phase: 'IMPLEMENTING',
    priority: 20,
    dependencies: [],
    compatibleIntents: ['explanation', 'general', 'writing'],
    requiresTools: [],
    instructions: 'Build a research outline first (items + fields), gather evidence from multiple sources with citations, then synthesize a balanced report with an executive summary, findings, and sources. Never fabricate citations; clearly mark uncertainty.'
  },
  {
    id: 'document-generation',
    name: 'Document & PDF Generation',
    description: 'Contracts, invoices, letters, and formatted documents. User scenario: "Create a PDF invoice for my freelance work" or "Draft a service contract for my client."',
    triggers: ['invoice', 'contract', 'letter', 'report', 'memo', 'business letter', 'formal document', 'pdf', 'docx', 'word document'],
    phase: 'IMPLEMENTING',
    priority: 20,
    dependencies: [],
    compatibleIntents: ['writing', 'general', 'explanation'],
    requiresTools: [],
    instructions: 'Produce clean, professional documents in the requested format (plain text structure, HTML for printable pages, or PDF when requested). Match formal or casual tone to the audience, and fill every section the user asks for without inventing personal facts.'
  },
  {
    id: 'data-analysis',
    name: 'Data Analysis & Spreadsheets',
    description: 'Dataset analysis, statistics, summaries, and spreadsheet structures. User scenario: "Analyze this sales CSV and tell me the trends" or "Build me a budget tracker spreadsheet."',
    triggers: ['analyze data', 'dataset', 'csv', 'spreadsheet', 'excel', 'statistics', 'data analysis', 'dashboard data', 'sales data', 'metrics', 'trends', 'charts', 'budget'],
    phase: 'IMPLEMENTING',
    priority: 20,
    dependencies: [],
    compatibleIntents: ['general', 'explanation', 'writing'],
    requiresTools: [],
    instructions: 'Identify the key variables, compute meaningful summary statistics, and present findings with tables or charts. Show the reasoning behind each conclusion and flag data-quality issues you notice.'
  },
  {
    id: 'marketing-copywriting',
    name: 'Marketing & Brand Copywriting',
    description: 'Brand voice, campaigns, ad copy, landing pages, SEO content, and social posts. User scenario: "Write launch copy for my new coffee brand" or "Create a 30-day social media content plan."',
    triggers: ['marketing', 'ad copy', 'campaign', 'brand', 'tagline', 'slogan', 'landing page copy', 'seo', 'blog post', 'social media', 'newsletter', 'email campaign', 'content plan', 'pitch deck copy'],
    phase: 'IMPLEMENTING',
    priority: 20,
    dependencies: [],
    compatibleIntents: ['writing', 'general', 'explanation'],
    requiresTools: [],
    instructions: 'Establish the brand voice first, then write persuasive, audience-matched copy with clear calls to action. Provide multiple headline options and keep SEO keywords natural. No empty fluff — every line earns its place.'
  },
  {
    id: 'translation-localization',
    name: 'Translation & Localization',
    description: 'Accurate translation with cultural adaptation, tone preservation, and terminology consistency. User scenario: "Translate my landing page into Spanish" or "Localize this app for the Japanese market."',
    triggers: ['translate', 'translation', 'localize', 'localization', 'in french', 'in spanish', 'in tagalog', 'in japanese', 'in german', 'into english', 'multilingual'],
    phase: 'IMPLEMENTING',
    priority: 20,
    dependencies: [],
    compatibleIntents: ['writing', 'general', 'explanation'],
    requiresTools: [],
    instructions: 'Translate meaning and tone, not just words. Preserve formatting, technical terms, and proper nouns; adapt idioms and cultural references. Provide the translated text first, then a short note on adaptation choices when useful.'
  },
  {
    id: 'live-data-utilities',
    name: 'Live Data & Utility Lookups',
    description: 'Weather, time zones, currency conversion, unit conversion, calculations, and quick factual lookups. User scenario: "Convert 5000 PHP to USD" or "What is the weather in Tokyo right now?"',
    triggers: ['convert', 'currency', 'exchange rate', 'weather', 'forecast', 'temperature', 'time zone', 'what time', 'unit conversion', 'how many', 'calculate', 'calculator', 'weight', 'distance'],
    phase: 'IMPLEMENTING',
    priority: 18,
    dependencies: [],
    compatibleIntents: ['general', 'explanation'],
    requiresTools: [],
    instructions: 'For live data (weather, currency, time), give the current value with the source and timestamp, and note when rates change frequently. For calculations, show the steps briefly and round sensibly.'
  },
  {
    id: 'education-tutor',
    name: 'Education & Learning Tutor',
    description: 'Step-by-step teaching, learning paths, practice exercises, and plain-language explanations. User scenario: "Teach me JavaScript from zero" or "Explain quantum computing like I am 12."',
    triggers: ['teach me', 'learn', 'tutorial', 'explain like', 'beginner', 'from zero', 'study plan', 'practice', 'lesson', 'homework', 'exam prep', 'course'],
    phase: 'IMPLEMENTING',
    priority: 20,
    dependencies: [],
    compatibleIntents: ['explanation', 'general', 'writing'],
    requiresTools: [],
    instructions: 'Diagnose the learner level, then teach in small concrete steps with examples and short exercises. Use analogies, avoid jargon without explaining it, and end with a checkpoint question or next-step exercise.'
  },
  {
    id: 'accessibility-compliance',
    name: 'Accessibility Compliance',
    description: 'WCAG 2.2 AA audits and accessible markup, color contrast, keyboard navigation, and ARIA guidance. User scenario: "Make my landing page WCAG compliant" or "Is my website accessible for screen readers?"',
    triggers: ['accessible', 'accessibility', 'wcag', 'screen reader', 'aria', 'contrast', 'keyboard navigation', 'a11y'],
    phase: 'IMPLEMENTING',
    priority: 22,
    dependencies: [],
    compatibleIntents: ['app', 'code-help', 'explanation', 'general'],
    requiresTools: [],
    instructions: 'Audit against WCAG 2.2 AA: semantic structure, focus management, color contrast, form labels, and ARIA. Provide concrete fixes with code when the user shares markup, and rank issues by severity.'
  },
  {
    id: 'business-planning',
    name: 'Business Planning & Startup Strategy',
    description: 'Business plans, go-to-market strategy, pricing, financial projections, and pitch decks. User scenario: "Help me plan a startup — pricing and go-to-market" or "Write my business plan."',
    triggers: ['business plan', 'startup', 'go-to-market', 'pricing strategy', 'financial projection', 'pitch deck', 'business model', 'revenue model', 'mvp strategy', 'market entry'],
    phase: 'IMPLEMENTING',
    priority: 20,
    dependencies: [],
    compatibleIntents: ['general', 'writing', 'explanation'],
    requiresTools: [],
    instructions: 'Structure answers around problem, solution, market, model, and execution. Make realistic assumptions explicit, provide ranges for financial figures, and always end with prioritized next actions.'
  },
  {
    id: 'resume-career',
    name: 'Resume & Career Coaching',
    description: 'ATS-friendly resumes, cover letters, LinkedIn profiles, and interview preparation. User scenario: "Rewrite my resume for a data science role" or "Prepare me for a frontend interview."',
    triggers: ['resume', 'cv', 'cover letter', 'linkedin', 'job application', 'interview', 'career', 'portfolio', 'hire me', 'job posting'],
    phase: 'IMPLEMENTING',
    priority: 20,
    dependencies: [],
    compatibleIntents: ['writing', 'general'],
    requiresTools: [],
    instructions: 'Ask for missing role details when critical, then rewrite with action verbs, quantified achievements, and role-matched keywords. Keep the user\'s real facts — never invent experience, employers, or credentials.'
  }
];
