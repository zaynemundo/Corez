import handler from '../api/openrouter.js';

const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash';
const DEFAULT_REASONING_EFFORT = 'xhigh';
const _REASONING_EFFORT_ENV = 'OPENROUTER_REASONING_EFFORT defaults to xhigh';
const minimumScore = 4;

const cases = [
  {
    id: 'app',
    prompt: 'Make me a simple landing page for a barber shop with pricing and a booking button.',
    intent: {
      type: 'app',
      summary: 'Create a public-facing landing page with clear sections and a runnable preview.'
    },
    required: ['```', '<', 'pricing', 'booking']
  },
  {
    id: 'code-help',
    prompt: 'My React button click does nothing. How should I debug it?',
    intent: {
      type: 'code-help',
      summary: 'Help the user debug a frontend interaction problem.'
    },
    required: ['event', 'check', 'console', 'verify']
  },
  {
    id: 'writing',
    prompt: 'Write a short product description for a minimalist AI workspace.',
    intent: {
      type: 'writing',
      summary: 'Draft public-facing product copy.'
    },
    required: ['workspace', 'AI']
  },
  {
    id: 'explanation',
    prompt: 'Explain what an API key is like I am new to building apps.',
    intent: {
      type: 'explanation',
      summary: 'Explain a technical concept plainly.'
    },
    required: ['API key', 'secret', 'example']
  },
  {
    id: 'general',
    prompt: 'I want to start an online business but I only have a rough idea.',
    intent: {
      type: 'general',
      summary: 'Understand the user goal and give a useful next step.'
    },
    required: ['next', 'idea']
  }
];

function requireEnvironment() {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error('Live AI eval requires OPENROUTER_API_KEY in the environment.');
  }

  process.env.OPENROUTER_MODEL ||= DEFAULT_MODEL;
  process.env.OPENROUTER_REASONING_EFFORT ||= DEFAULT_REASONING_EFFORT;
}

function createResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(name, value) {
      this.headers[name] = value;
    },
    end(value) {
      this.body = value;
    }
  };
}

async function callCorezAi(testCase) {
  const response = createResponse();

  await handler(
    {
      method: 'POST',
      body: {
        prompt: testCase.prompt,
        model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL,
        intent: testCase.intent
      }
    },
    response
  );

  const body = response.body ? JSON.parse(response.body) : {};

  if (response.statusCode !== 200) {
    throw new Error(`${testCase.id} failed with HTTP ${response.statusCode}: ${body.error || 'unknown error'}`);
  }

  return body.content || '';
}

function scoreAnswer(answer, testCase) {
  let score = 0;
  const normalized = answer.toLowerCase();

  if (answer.length >= 300) score += 1;
  if (/\n|[-*]\s|\d+[.)]\s/.test(answer)) score += 1;
  if (!/\b(i can'?t|unable to|as an ai language model)\b/i.test(answer)) score += 1;
  if (testCase.required.every((term) => normalized.includes(term.toLowerCase()))) score += 1;
  if (/(step|example|verify|risk|next|because|here)/i.test(answer)) score += 1;

  return score;
}

function snippet(answer) {
  return answer.replace(/\s+/g, ' ').slice(0, 280);
}

async function main() {
  requireEnvironment();

  const results = [];

  for (const testCase of cases) {
    const answer = await callCorezAi(testCase);
    const score = scoreAnswer(answer, testCase);

    results.push({
      id: testCase.id,
      score,
      passed: score >= minimumScore,
      snippet: snippet(answer)
    });
  }

  for (const result of results) {
    console.log(`${result.passed ? 'PASS' : 'FAIL'} ${result.id}: ${result.score}/${minimumScore}`);
    console.log(`  snippet: ${result.snippet}`);
  }

  const failures = results.filter((result) => !result.passed);
  if (failures.length > 0) {
    throw new Error(`${failures.length} live AI intent eval case(s) failed.`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
