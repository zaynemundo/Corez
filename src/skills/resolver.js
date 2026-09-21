/**
 * CoreZ Skill Resolver
 * Evaluates fine-grained intent, prompt context, complexity, project status, and runtime capabilities BEFORE generation.
 * Selects only applicable skills, resolves dependencies, and orders them topologically.
 */

import { defaultSkillRegistry } from "./registry.js";
import { expandDependencies } from "./dependencies.js";
import { detectUserFactCandidates } from "../services/userLearningService.js";

const BUG_REPORT_PATTERNS =
  /\b(crash|crashes|bug|error|exception|fail|failed|fails|stack trace|not working|broken|issue|fix|debug)\b/i;
const SUBSTANTIAL_APP_PATTERNS =
  /\b(build|create|make|develop|design|launch)\b.*\b(dashboard|app|saas|portal|system|platform|website|game|service|admin|authentication|billing)\b|\b(dashboard|app|saas|portal|system|platform|website|game|service|admin)\b/i;
const SMALL_EDIT_PATTERNS =
  /\b(tweak|minor edit|minor change|small edit|typo|fix typo|margin|padding|button text|change text|update link|rename)\b/i;
const REPO_REVIEW_PATTERNS =
  /\b(review|audit|inspect|survey|check|analyze|analyse)\b.*\b(repo|repository|codebase|project|architecture|files)\b/i;

// Specialist skills are the lightweight, non-engineering capabilities CoreZ
// applies to everyday conversational requests (research, documents, marketing,
// translation, utilities, tutoring, business, career, accessibility, data).
// They must activate even on the "fast path" intents that skip the heavy
// Superpowers engineering workflow.
export const SPECIALIST_SKILL_IDS = [
  "research-report",
  "document-generation",
  "data-analysis",
  "marketing-copywriting",
  "translation-localization",
  "live-data-utilities",
  "education-tutor",
  "accessibility-compliance",
  "cloudflare-platform",
  "business-planning",
  "resume-career",
  "creative-writing",
  "presentation-design",
  "personal-productivity",
  "personal-finance",
  "travel-planning",
  "fitness-nutrition",
  "event-planning",
  "study-aids",
  "meeting-notes",
  "user-learning",
];

const SPECIALIST_TRIGGER_PATTERNS = [
  {
    id: "research-report",
    pattern:
      /\b(research report|research on|literature review|systematic review|evidence review|white paper|market research|deep dive|deep research|survey of|study of|case study|due diligence|state of the art|landscape of|comparative analysis|report on)\b/i,
  },
  {
    id: "document-generation",
    pattern:
      /\b(invoice|contract|service agreement|nda|non-disclosure agreement|statement of work|proposal|quotation|purchase order|receipt|offer letter|terms of (service|use)|privacy policy|business letter|formal document|memo|pdf|docx|word document|letterhead)\b/i,
  },
  {
    id: "data-analysis",
    pattern:
      /\b(analy[sz]e\s+(this\s+|my\s+|the\s+)?(data|dataset|csv|sales|numbers|table)|csv|data ?set|spreadsheet|excel|statistics|summary statistics|sales data|metrics|budget tracker|data analysis|pivot table|trend analysis|cohort analysis|correlat(e|ion)|regression analysis|visuali[sz]e (this|the|my) data|(chart|graph) (from|of) (this|the|my) data|what stands out|find (trends|insights|patterns)|(clean|explore|parse|summari[sz]e) (this|the|my) (data|csv|dataset|spreadsheet))\b/i,
  },
  {
    id: "marketing-copywriting",
    pattern:
      /\b(marketing|ad copy|advertisement|advertising campaign|campaign|tagline|slogan|landing page copy|seo|blog post|social media|social post|linkedin post|instagram post|carousel post|carousel copy|carousel caption|caption|hashtags|newsletter|email campaign|content plan|content calendar|brand voice|brand identity|brand strategy|brand guidelines|rebrand|press release|product description|sales page|cold email|email sequence|subject lines?|(google|facebook|meta|instagram|linkedin) ads?|ad creative|value proposition|brand name|copywriting|launch (copy|email|announcement))\b|post.{0,25}carousel|carousel.{0,25}(post|caption|copy|slides?)\b/i,
  },
  {
    id: "translation-localization",
    pattern:
      /\b(translate|translation|locali[sz]e|locali[sz]ation|multilingual|i18n|l10n)\b|(in|into)\s+(french|spanish|tagalog|japanese|german|korean|chinese|mandarin|cantonese|italian|portuguese|arabic|hindi|filipino|vietnamese|thai|dutch|turkish|russian|hebrew|indonesian|malay|swahili|polish|swedish|greek|norwegian|danish)\b/i,
  },
  {
    id: "live-data-utilities",
    pattern:
      /(\bconvert\s+\d+\b|\bcurrency\b|\bexchange rate\b|\bweather\b|\bforecast\b|\btemperature\b|\btime zone\b|\bwhat time\b|\bunit conversion\b|\bcalculate\b|\bcalculator\b|\btime difference\b|\bdistance between\b|\bwhat'?s the (time|date)\b|\b(public|bank) holiday(s)?\b|\bsunrise\b|\bsunset\b|\b(stock|share|crypto|bitcoin|ethereum|eth) (price|rate|value)\b|\bmarket price\b|\bhow much is \d|\d+(\.\d+)?\s*(kg|lbs?|pounds?|oz|ounces?|miles?|kms?|kilometers?|celsius|fahrenheit|°c|°f)\b|\b(who won|final score|what'?s the score|standings|fixtures)\b|\b(nba|nfl|nhl|mlb|premier league|la liga|world cup|super bowl|olympics).{0,40}(score|schedule|standings|result)\b)/i,
  },
  {
    id: "education-tutor",
    pattern:
      /\b(teach me|tutor me|tutorial|explain.{0,30}like|from zero|zero to (hero|advanced)|beginner|study plan|lesson|homework|exam prep|eli5|practice exercise|practice problems?|problem set|help me (understand|learn)|walk me through|learn (it |this )?from scratch|i'?m new to|syllabus|curriculum|course (outline|plan)|study for (the|my|an?|a))\b/i,
  },
  {
    id: "accessibility-compliance",
    pattern:
      /\b(wcag|accessible|accessibility|screen ?reader|aria|contrast|keyboard navigation|a11y|focus (trap|order|ring|management|visible)|keyboard (only|tab|focus)|skip link|alt text|alternative text|touch targets?|semantic (html|markup)|voiceover|nvda|jaws)\b/i,
  },
  {
    id: "cloudflare-platform",
    pattern:
      /\b(cloudflare|wrangler|workers\.dev|workers ai|worker logs?|durable objects?|r2 bucket|d1 database|cloudflare pages|turnstile)\b/i,
  },
  {
    id: "business-planning",
    pattern:
      /\b(business plan|business idea|go[- ]to[- ]market|pricing strategy|pricing (tiers?|model|page)|financial projection|financial model|unit economics|break-?even|burn rate|runway|funding round|raise (a )?(seed|round|series [abc])|valuation|pitch deck|business model|revenue model|monetization|monetisation|mvp strategy|market entry|market (sizing|size|opportunity)|swot|business strategy|competitor analysis|launch strategy)\b/i,
  },
  {
    id: "resume-career",
    pattern:
      /\b(resume|cv|cover letter|job application|job posting|job search|job offer|interview|career|career (path|plan|switch|change)|linkedin profile|portfolio|salary negotiation|salary expectation|compensation (package|negotiation)|performance review|resignation|notice period|promotion at work)\b/i,
  },
  {
    id: "creative-writing",
    pattern:
      /\b(story|short story|flash fiction|poem|poetry|sonnet|novel|fiction|screenplay|script|dialogue|monologue|haiku|lyrics|song lyrics|fan fiction|worldbuilding|creative writing|character (backstory|arc)|backstory|plot (twist|idea|outline)|ghostwrit\w*)\b/i,
  },
  {
    id: "presentation-design",
    pattern:
      /\b(presentation|slide deck|powerpoint|google slides|keynote|slide outline|speaker notes|slideshow|\d+-slide|slides?|(pitch|sales|board|investor|product|strategy) deck|deck (outline|structure|flow)|slide (titles?|layout|design)|talk (outline|structure))\b/i,
  },
  {
    id: "personal-productivity",
    pattern:
      /\b(to-do|todo|task list|plan my day|plan my (week|schedule)|daily planner|weekly planner|prioritize\w*|time management|time block\w*|pomodoro|habit tracker|get organized|get organised|productivity plan|weekly review|eisenhower|morning routine|procrastinat\w*|focus (plan|session|block)|deep work|task (backlog|priorities|priority)|energy management)\b/i,
  },
  {
    id: "personal-finance",
    pattern:
      /\b(budget\w*|spending plan|savings plan|personal finance|debt payoff|debt|mortgage|home loan|credit (card|score)|tax return|income tax|401k|roth ira|college fund|retirement (plan|planning|savings|account)|emergency fund|emergency savings|net worth|life insurance)\b/i,
  },
  {
    id: "travel-planning",
    pattern:
      /\b(itinerary|travel plan|vacation plan|packing list|road trip|trip planning|flight itinerary|things to do in|where to (stay|eat) in|(flights?|hotels?|hostels?|airbnbs?) (to|in|for|booking)|visa (requirements?|application)|day trip|weekend getaway|sightseeing|guided tour|cruise (ship|trip|booking)|travel (budget|checklist)|best time to visit)\b/i,
  },
  {
    id: "fitness-nutrition",
    pattern:
      /\b(workout plan|exercise routine|training program|meal plan|diet plan|nutrition\w*|calorie target|fitness goal|weight loss plan|muscle gain|gym (plan|routine|workout|schedule)|strength training|resistance training|cardio|yoga|pilates|hiit|crossfit|protein (intake|target|shake)|macros|macronutrients|lose (weight|fat)|bulk (up|phase)|cutting phase|get (fit|in shape)|(5k|10k|marathon) (training|plan|race)|stretching routine|rest day)\b/i,
  },
  {
    id: "event-planning",
    pattern:
      /\b(event planning|party planning|wedding planning|event checklist|celebration plan|birthday party|anniversary|baby shower|bridal shower|engagement party|graduation party|wedding (checklist|timeline|budget|plan)|(conference|workshop|fundraiser|gala|retreat) (planning|checklist|agenda|budget)|guest list|catering|venue (booking|selection)|save the date|save-the-date|invitations|event (timeline|budget|vendors)|(plan|plans|planning|organi[sz]e|organi[sz]es|organi[sz]ing|arrange|arranging|host|hosting) (my|a|an|the|our) (wedding|party|birthday|anniversary|reception|baby shower|bridal shower|engagement|graduation|event|celebration)|(wedding|engagement|birthday|graduation|party) reception)\b/i,
  },
  {
    id: "study-aids",
    pattern:
      /\b(quiz\w*|flashcard\w*|study guide|practice test|practice exam|revision notes|revision (plan|schedule)|exam questions|cheat sheet|mock exam|past paper|worksheet|mnemonic|test (me|yourself)|question bank|study (notes|sheet)|fill in the blank)\b/i,
  },
  {
    id: "meeting-notes",
    pattern:
      /\b(meeting (notes|summary|minutes|recap)|action items|summari[sz]e\w* (the |our |this )?(meeting|call|conversation|standup|stand-up)|notes from (the|our|yesterday'?s) (meeting|call|standup|stand-up|sync)|stand-?up (notes|update)|what was decided|decisions (from|made|taken)|(call|meeting) transcript|recap of (the|our) (meeting|call))\b/i,
  },
  {
    id: "user-learning",
    pattern:
      /\b(remember(\s+this|\s+that|\s+my|\s+me|\s+for)?\b|\bforget(\s+my|\s+this|\s+that|\s+everything)?\b|\bwhat do you know about me\b|\bwhat do you remember about me\b|\blearn about me\b|\bmy prefer\w+\b|\bmy name is\b|\bi prefer\b|\bmy tech stack\b|\bdelete (everything|what) you know about me\b|\bi\s+am\s+a\b|\bi\s+work\s+(with|at|for|in)\b|\bi\s+live\s+in\b|\bmy\s+(company|team|role|job|business|organisation|organization)\b|\b(based|located)\s+in\b|\bwe\s+(represent|provide|specialise|specialize)\b)/i,
  },
];

// Explicit remember/recall/forget verbs: always fire user-learning.
// Anything else is an implicit (volunteered-fact) match and needs extractor
// confirmation — this keeps questions ("Am I a good fit?") and pasted code
// from triggering remember offers.
const USER_LEARNING_EXPLICIT_PATTERN =
  /\b(remember(\s+this|\s+that|\s+my|\s+me|\s+for)?\b|\bforget(\s+my|\s+this|\s+that|\s+everything)?\b|\bwhat do you know about me\b|\bwhat do you remember about me\b|\blearn about me\b|\bmy prefer\w+\b|\bmy name is\b|\bi prefer\b|\bmy tech stack\b|\bdelete (everything|what) you know about me\b)/i;

// Runs specialist detection BEFORE the heavy-workflow early return so everyday
// conversational requests still receive their matching capability. Returns the
// matched skill ids with a short activation reason, or null when none apply.
function matchSpecialistSkills(cleanPrompt) {
  if (!cleanPrompt) return null;
  const matches = [];
  for (const { id, pattern } of SPECIALIST_TRIGGER_PATTERNS) {
    if (pattern.test(cleanPrompt)) {
      matches.push(id);
    }
  }
  // Implicit user-learning matches (volunteered facts) require extractor
  // confirmation: the extractor skips interrogative sentences and fenced
  // code, so questions and pasted snippets never produce remember offers.
  // Second net for volunteered identity facts: phrasing variants the regex
  // misses still deserve a remember offer — never a silent store.
  try {
    const hasCandidates = detectUserFactCandidates(cleanPrompt).length > 0;
    if (matches.includes("user-learning")) {
      if (!USER_LEARNING_EXPLICIT_PATTERN.test(cleanPrompt) && !hasCandidates) {
        matches.splice(matches.indexOf("user-learning"), 1);
      }
    } else if (hasCandidates) {
      matches.push("user-learning");
    }
  } catch {
    // Detection must never block skill resolution.
  }
  // Social-carousel copy ("post for this carousel", "carousel post + caption")
  // is marketing copy, not a pitch deck: drop presentation-design unless the
  // user explicitly asked for deck artifacts (pitch deck, powerpoint, keynote,
  // speaker notes, slide deck).
  const isSocialCarousel =
    /\b(post\s+for\s+(this|that|my|our|a|the)\s+carousel|carousel\s+(post|copy|caption)|linkedin post|instagram post|social post)\b/i.test(
      cleanPrompt,
    ) && !/\b(carousel\s+(component|widget|\bui\b|code|website))\b/i.test(cleanPrompt);
  if (isSocialCarousel && matches.includes("presentation-design")) {
    const hasDeckTerms =
      /\b(pitch deck|powerpoint|google slides|keynote|speaker notes|slide deck|slideshow|\d+-slide)\b/i.test(
        cleanPrompt,
      );
    if (!hasDeckTerms) {
      const idx = matches.indexOf("presentation-design");
      matches.splice(idx, 1);
    }
  }
  return matches.length > 0 ? matches : null;
}

export function resolveSkills({
  intent,
  prompt = "",
  availableTools = [],
  registry = defaultSkillRegistry,
}) {
  const cleanPrompt = String(prompt || "").trim();

  // Normalize intent object or legacy string
  let legacyIntent = "general";
  let primaryIntent = "general_question";
  let complexity = "medium";
  let isExistingProject = false;
  let forbiddenChanges = [];

  if (typeof intent === "string") {
    legacyIntent = intent;
    primaryIntent = intent;
  } else if (intent && typeof intent === "object") {
    legacyIntent = intent.legacyIntentType || intent.type || "general";
    primaryIntent = intent.primaryIntent || intent.type || "general_question";
    complexity = intent.complexity || "medium";
    isExistingProject = Boolean(intent.isExistingProject);
    forbiddenChanges = Array.isArray(intent.forbiddenChanges)
      ? intent.forbiddenChanges
      : [];
  }

  // Specialist capabilities apply to everyday conversational requests even on
  // the fast path — but they must never hijack engineering workflows (apps,
  // games, websites, code). Those intents keep their dedicated heavy
  // workflow below; specialists only fire for non-engineering intents and are
  // matched against the raw user prompt, never the enriched coding prompt.
  const ENGINEERING_INTENTS = new Set([
    "app",
    "code-help",
    "bug_fix",
    "code_refactor",
    "feature_implementation",
    "simple_edit",
    "code_question",
    "website_creation",
    "game_creation",
    "design_task",
  ]);
  const isEngineeringIntent =
    ENGINEERING_INTENTS.has(legacyIntent) ||
    ENGINEERING_INTENTS.has(primaryIntent);
  const specialistMatches = isEngineeringIntent
    ? null
    : matchSpecialistSkills(cleanPrompt);
  if (specialistMatches) {
    const specialistSkills = [];
    for (const id of specialistMatches) {
      const skill = registry.getSkill(id);
      if (skill) {
        specialistSkills.push({
          id: skill.id,
          name: skill.name || skill.id,
          phase: skill.phase || "IMPLEMENTING",
          priority: skill.priority || 50,
          reasonSelected: `Specialist capability matched by user request: ${skill.description}`,
          instructions: skill.instructions || skill.description || "",
          constraints: [
            ...(skill.constraints || []),
            ...(forbiddenChanges.length
              ? [`Forbidden: ${forbiddenChanges.join(", ")}`]
              : []),
          ],
          requiredCapabilities: skill.requiresTools || [],
        });
      }
    }
    return buildExecutionResult(specialistSkills);
  }

  // 1. Simple explanation, writing, or trivial requests do not activate heavy Superpowers workflows
  if (
    ["explanation", "writing"].includes(legacyIntent) ||
    ["code_question", "content_creation"].includes(primaryIntent)
  ) {
    return {
      skills: [],
      compactExecutionPlan:
        "Direct execution path — no heavy engineering workflow required.",
    };
  }

  const isSmallEdit =
    complexity === "trivial" ||
    (complexity === "low" && isExistingProject) ||
    SMALL_EDIT_PATTERNS.test(cleanPrompt) ||
    primaryIntent === "simple_edit";
  const isRepoReview =
    primaryIntent === "research" || REPO_REVIEW_PATTERNS.test(cleanPrompt);
  const isBugReport =
    primaryIntent === "bug_fix" || BUG_REPORT_PATTERNS.test(cleanPrompt);
  const isNewComplexApp =
    !isExistingProject &&
    (complexity === "high" || complexity === "epic") &&
    (legacyIntent === "app" ||
      ["website_creation", "game_creation"].includes(primaryIntent));

  const selectionMap = new Map(); // id -> reasonSelected

  selectionMap.set(
    "using-superpowers",
    "Bootstrap entry point for AI orchestration",
  );

  // Small Edit: minimal workflow
  if (isSmallEdit) {
    selectionMap.set(
      "verification-before-completion",
      "Verify focused patch before completing",
    );
  } else if (isRepoReview) {
    // Repository review: analysis and verification only
    selectionMap.set(
      "verification-before-completion",
      "Empirical verification for review findings",
    );
  } else if (isBugReport) {
    // Bug report: systematic investigation & TDD regression check
    selectionMap.set(
      "systematic-debugging",
      "Disciplined 7-phase investigation for reported bug/error",
    );
    selectionMap.set(
      "verification-before-completion",
      "Empirical verification gate before claiming fix",
    );
  } else if (isNewComplexApp) {
    // Complex new application build
    selectionMap.set(
      "brainstorming",
      "Design refinement & specification formulation before coding",
    );
    selectionMap.set(
      "writing-plans",
      "Decompose specification into granular implementation tasks",
    );
    selectionMap.set(
      "test-driven-development",
      "Enforce RED-GREEN-REFACTOR cycle for new features",
    );
    selectionMap.set(
      "requesting-code-review",
      "Two-stage review gate for quality & compliance",
    );
    selectionMap.set(
      "verification-before-completion",
      "Empirical verification gate before completion",
    );
  } else if (
    legacyIntent === "app" ||
    ["website_creation", "game_creation"].includes(primaryIntent)
  ) {
    selectionMap.set(
      "writing-plans",
      "Plan implementation tasks for application feature",
    );
    selectionMap.set(
      "verification-before-completion",
      "Verify application component before completion",
    );

    if (
      /\b(game|gamedev|canvas|arcade|snake|pong|scrabble|wordle)\b/i.test(
        cleanPrompt,
      ) ||
      primaryIntent === "game_creation"
    ) {
      selectionMap.set("game-development", "HTML5 Canvas & game loop logic");
      selectionMap.set(
        "visual-creative",
        "Genre-appropriate visual asset direction",
      );
    }
    if (
      /\b(design|modern|glassmorphism|ui|aesthetic|theme)\b/i.test(
        cleanPrompt,
      ) ||
      primaryIntent === "design_task"
    ) {
      selectionMap.set(
        "frontend-modern-design",
        "Modern dark mode & responsive UI styling",
      );
    }
    if (
      /\b(wcag|accessible|accessibility|screen reader|aria|contrast|keyboard navigation|a11y)\b/i.test(
        cleanPrompt,
      )
    ) {
      selectionMap.set(
        "accessibility-compliance",
        "WCAG 2.2 AA compliance for the requested build",
      );
    }
  } else if (
    legacyIntent === "code-help" ||
    ["feature_implementation", "code_refactor"].includes(primaryIntent)
  ) {
    selectionMap.set("writing-plans", "Plan targeted implementation changes");
    selectionMap.set("verification-before-completion", "Verify code changes");
  } else {
    if (SUBSTANTIAL_APP_PATTERNS.test(cleanPrompt)) {
      selectionMap.set("writing-plans", "Plan application building steps");
      selectionMap.set(
        "verification-before-completion",
        "Verify completed implementation",
      );
    } else {
      return {
        skills: [],
        compactExecutionPlan:
          "Direct execution path — no heavy engineering workflow required.",
      };
    }
  }

  // Expand dependencies & topological ordering
  const selectedIds = Array.from(selectionMap.keys());
  let expandedSkills = expandDependencies(selectedIds, registry);

  // Small edit guard: do not pull in heavy planning/brainstorming/TDD skills via dependency chain
  if (isSmallEdit) {
    const heavySkills = new Set([
      "brainstorming",
      "writing-plans",
      "test-driven-development",
      "requesting-code-review",
      "subagent-driven-development",
    ]);
    expandedSkills = expandedSkills.filter((s) => !heavySkills.has(s.id));
  }

  // Capability gating: Filter out skills requiring tools not available in runtime
  let resolvedSkills = expandedSkills;
  if (Array.isArray(availableTools) && availableTools.length > 0) {
    const toolSet = new Set(availableTools);
    resolvedSkills = resolvedSkills.filter((skill) => {
      if (!skill.requiresTools || skill.requiresTools.length === 0) return true;
      return skill.requiresTools.every((tool) => toolSet.has(tool));
    });
  }

  // Map to full skill objects with full instructions & metadata
  const fullSkills = resolvedSkills.map((skill) => ({
    id: skill.id,
    name: skill.name || skill.id,
    phase: skill.phase || "IMPLEMENTING",
    priority: skill.priority || 50,
    reasonSelected:
      selectionMap.get(skill.id) || `Activated by dependency ${skill.id}`,
    instructions: skill.instructions || skill.description || "",
    constraints: [
      ...(skill.constraints || []),
      ...(forbiddenChanges.length
        ? [`Forbidden: ${forbiddenChanges.join(", ")}`]
        : []),
    ],
    requiredCapabilities: skill.requiresTools || [],
  }));

  return buildExecutionResult(fullSkills);
}

function buildExecutionResult(skills) {
  if (!skills || skills.length === 0) {
    return {
      skills: [],
      compactExecutionPlan:
        "Direct execution path — no heavy engineering workflow required.",
    };
  }

  const phases = [];
  const phaseMap = new Map();

  for (const s of skills) {
    if (!phaseMap.has(s.phase)) {
      phaseMap.set(s.phase, []);
      phases.push(s.phase);
    }
    phaseMap.get(s.phase).push(s.name || s.id);
  }

  const planSteps = phases.map(
    (phase, idx) => `${idx + 1}. [${phase}] ${phaseMap.get(phase).join(", ")}`,
  );
  return {
    skills,
    compactExecutionPlan: `Execution Plan:\n${planSteps.join("\n")}`,
  };
}
