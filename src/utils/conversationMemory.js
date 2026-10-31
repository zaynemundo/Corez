const MEMORY_RULES = [
  {
    label: "Name",
    pattern: /\b(?:my name is|call me|i'm called)\s+([A-Z][A-Za-z'’-]{1,30})/i,
  },
  {
    label: "Likes",
    pattern: /\b(?:i like|i love|i enjoy|i prefer)\s+([^.!?\n]{2,80})/i,
  },
  {
    label: "Dislikes",
    pattern:
      /\b(?:i don't like|i hate|i dislike|i can't stand|i do not like)\s+([^.!?\n]{2,80})/i,
  },
  {
    label: "Work",
    pattern: /\bi work (?:as|at|for)\s+([^.!?\n]{2,80})/i,
  },
  {
    label: "Location",
    pattern: /\b(?:i live in|i'm from|i am from)\s+([^.!?\n]{2,60})/i,
  },
  {
    label: "Project",
    pattern:
      /\b(?:i'm working on|i am working on|i'm building|i am building)\s+([^.!?\n]{2,80})/i,
  },
  {
    label: "Remembered",
    pattern: /\bremember (?:that )?\s*([^.!?\n]{3,100})/i,
  },
];

const CASUAL_MARKERS =
  /\b(?:yo|bro|dude|man|hey|hi|hello|lol|lmao|haha|sup|wassup|what's up|tbh|ngl|fr)\b/i;

const STOP_WORDS = new Set(
  `
  about above after again against almost alone along already also although always
  another anything around because before being below between both cannot could
  didn does doing down during each either else enough even ever every from
  further have having here herself himself however into itself just know least
  less literally maybe might more most much must myself neither never only
  other ought ourselves over own really same shall should since some still such
  than that their theirs them themselves then there these they thing things this
  those through today together under until very want were what when where which
  while whole will with within without would your yours yourself
  actually basically genuinely honestly seriously totally truly
  going gonna gotta kinda sorta
  answer answers asked asks said says talk talking tell telling think thinking
  feel feeling feels guess mean means look looking looked
  cool good great okay okay sure yeah yes right well
  john scarlett user
  `
    .split(/\s+/)
    .filter(Boolean),
);

function cleanValue(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/^[\s,;:—–-]+|[\s,;:—–-]+$/g, "")
    .slice(0, 100)
    .trim();
}

/**
 * Pull stable, user-stated facts out of the conversation. This is deliberately
 * conservative: the personas may only claim to know what the user actually
 * stated, never invented history.
 */
export function extractUserMemory(messages, limit = 8) {
  const found = [];
  const seen = new Set();
  for (const message of Array.isArray(messages) ? messages : []) {
    if (message?.role !== "user") continue;
    const text = String(message.content || "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    for (const rule of MEMORY_RULES) {
      const match = text.match(rule.pattern);
      if (!match) continue;
      const value = cleanValue(match[1]);
      if (!value) continue;
      const key = `${rule.label}:${value.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({ label: rule.label, value });
    }
  }
  return found.slice(-limit);
}

export function formatUserMemory(memory) {
  if (!Array.isArray(memory) || memory.length === 0) {
    return "No stable facts learned yet. Do not invent a history for the user.";
  }
  return memory.map((item) => `- ${item.label}: ${item.value}`).join("\n");
}

/**
 * A light read on the user's register, so the personas adapt instead of
 * sounding like they are reading a script.
 */
export function inferUserStyle(messages) {
  const texts = (Array.isArray(messages) ? messages : [])
    .filter((message) => message?.role === "user")
    .map((message) => String(message.content || "").trim())
    .filter(Boolean)
    .slice(-6);
  if (texts.length === 0) return "No messages yet.";
  const joined = texts.join(" ");
  const words = joined.split(/\s+/).filter(Boolean);
  const averageWords = words.length / texts.length;
  const casual = CASUAL_MARKERS.test(joined);
  if (averageWords <= 4 && casual) {
    return "The user is casual and brief. Match that energy and keep replies tight.";
  }
  if (averageWords <= 4) {
    return "The user writes briefly. Keep replies concise.";
  }
  if (casual) {
    return "The user is casual and playful. Keep the tone relaxed.";
  }
  return "The user is conversational. Match their pace.";
}

/**
 * Words and angles the assistants have already leaned on. Listing these in the
 * prompt gives the model an explicit cooldown instead of letting it circle the
 * same fact (for example, repeating octopus trivia every turn).
 */
export function extractConversationTopics(messages, limit = 8) {
  const counts = new Map();
  for (const message of Array.isArray(messages) ? messages : []) {
    if (message?.role !== "assistant") continue;
    const text = String(message.content || "").toLowerCase();
    for (const word of text.match(/[a-z][a-z'’-]{3,}/g) || []) {
      let normalized = word.replace(/[’']s$/, "").replace(/[’']/g, "");
      if (normalized.length > 5) {
        normalized = normalized.replace(/(?:ies|es|s)$/, "");
      }
      if (normalized.length < 4 || STOP_WORDS.has(normalized)) continue;
      counts.set(normalized, (counts.get(normalized) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, limit)
    .map(([word]) => word);
}
