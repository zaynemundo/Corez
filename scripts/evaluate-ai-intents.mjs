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

function requireBaseUrl() {
  const value = process.argv[2]?.trim();
  if (!value) {
    throw new Error('Live AI eval requires an explicit deployed base URL argument.');
  }
  return value.replace(/\/$/, '');
}

async function callCorezAi(baseUrl, testCase) {
  const response = await fetch(`${baseUrl}/api/ai`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: testCase.prompt,
      intent: testCase.intent
    })
  });

  if (!response.ok) {
    const responseText = await response.text();
    let detail = responseText.trim() || 'unknown error';
    try {
      const errorBody = JSON.parse(responseText);
      if (typeof errorBody?.error === 'string' && errorBody.error.trim()) {
        detail = errorBody.error.trim();
      }
    } catch {
      // Preserve the bounded text response when the upstream error is not JSON.
    }
    throw new Error(`${testCase.id} failed with HTTP ${response.status}: ${detail.slice(0, 500)}`);
  }

  const body = await response.json();
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
  const baseUrl = requireBaseUrl();
  const results = [];

  for (const testCase of cases) {
    const answer = await callCorezAi(baseUrl, testCase);
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
