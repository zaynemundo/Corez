/**
 * CoreZ Skill Resolver
 * Evaluates fine-grained intent, prompt context, complexity, project status, and runtime capabilities BEFORE generation.
 * Selects only applicable skills, resolves dependencies, and orders them topologically.
 */

import { defaultSkillRegistry } from "./registry.js";
import { expandDependencies } from "./dependencies.js";

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
];

const SPECIALIST_TRIGGER_PATTERNS = [
  {
    id: "research-report",
    pattern:
      /\b(research report|research on|literature review|white paper|market research|deep dive|deep research|survey of|study of|case study)\b/i,
  },
  {
    id: "document-generation",
    pattern:
      /\b(invoice|contract|business letter|formal document|memo|pdf|docx|word document|letterhead)\b/i,
  },
  {
    id: "data-analysis",
    pattern:
      /\b(analyze\s+(this\s+)?(data|dataset|csv|sales)|spreadsheet|excel|statistics|sales data|metrics|budget tracker|data analysis)\b/i,
  },
  {
    id: "marketing-copywriting",
    pattern:
      /\b(marketing|ad copy|advertisement|advertising campaign|campaign|tagline|slogan|landing page copy|seo|blog post|social media|newsletter|email campaign|content plan|content calendar|brand voice|brand identity|brand strategy|brand guidelines|rebrand)\b/i,
  },
  {
    id: "translation-localization",
    pattern:
      /\b(translate|translation|localize|localization|multilingual)\b|(in|into)\s+(french|spanish|tagalog|japanese|german|korean|chinese|italian|portuguese|arabic|hindi)\b/i,
  },
  {
    id: "live-data-utilities",
    pattern:
      /(\bconvert\s+\d+\b|\bcurrency\b|\bexchange rate\b|\bweather\b|\bforecast\b|\btemperature\b|\btime zone\b|\bwhat time\b|\bunit conversion\b|\bcalculate\b|\bcalculator\b|\btime difference\b|\bdistance between\b|\bwhat'?s the (time|date)\b)/i,
  },
  {
    id: "education-tutor",
    pattern:
      /\b(teach me|tutorial|explain.{0,30}like|from zero|beginner|study plan|lesson|homework|exam prep|eli5|practice exercise)\b/i,
  },
  {
    id: "accessibility-compliance",
    pattern:
      /\b(wcag|accessible|accessibility|screen reader|aria|contrast|keyboard navigation|a11y)\b/i,
  },
  {
    id: "business-planning",
    pattern:
      /\b(business plan|go-to-market|pricing strategy|financial projection|pitch deck|business model|revenue model|mvp strategy|market entry|swot|business strategy|market sizing)\b/i,
  },
  {
    id: "resume-career",
    pattern:
      /\b(resume|cv|cover letter|job application|interview|career|linkedin profile|job posting|portfolio|job search|salary negotiation|career change)\b/i,
  },
  {
    id: "creative-writing",
    pattern:
      /\b(story|short story|poem|poetry|novel|fiction|screenplay|script|dialogue|haiku|lyrics|fan fiction|worldbuilding|creative writing)\b/i,
  },
  {
    id: "presentation-design",
    pattern:
      /\b(presentation|slide deck|powerpoint|google slides|slide outline|speaker notes|slideshow|\d+-slide|slides?)\b/i,
  },
  {
    id: "personal-productivity",
    pattern:
      /\b(to-do|todo|task list|plan my day|daily planner|weekly planner|prioritize\w*|time management|pomodoro|habit tracker|get organized|productivity plan)\b/i,
  },
  {
    id: "personal-finance",
    pattern:
      /\b(budget\w*|savings plan|personal finance|debt payoff|emergency fund|investing basics|retirement planning|net worth)\b/i,
  },
  {
    id: "travel-planning",
    pattern:
      /\b(itinerary|travel plan|vacation plan|packing list|road trip|trip planning|flight itinerary)\b/i,
  },
  {
    id: "fitness-nutrition",
    pattern:
      /\b(workout plan|exercise routine|training program|meal plan|diet plan|nutrition\w*|calorie target|fitness goal|weight loss plan|muscle gain)\b/i,
  },
  {
    id: "event-planning",
    pattern:
      /\b(event planning|party planning|wedding planning|event checklist|celebration plan)\b/i,
  },
  {
    id: "study-aids",
    pattern:
      /\b(quiz\w*|flashcard\w*|study guide|practice test|revision notes|exam questions|cheat sheet)\b/i,
  },
  {
    id: "meeting-notes",
    pattern:
      /\b(meeting (notes|summary|minutes|recap)|action items|summarize\w* (the )?(meeting|call|conversation))\b/i,
  },
];

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
