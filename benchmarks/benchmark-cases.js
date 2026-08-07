// COREZ benchmark suite — reusable, scale-to-100+ case library.
//
// Every prompt is written generically (no special-casing of benchmark
// prompts): the suite measures general behaviour. Categories cover general,
// writing, coding, games, multi-turn continuity, failure handling and
// adversarial instructions. Labels follow the testing taxonomy:
//   UNIT, INTEGRATION, E2E, LIVE PROVIDER.

export const benchmarkCases = [
  // ------------------------------------------------------------------
  // GENERAL
  // ------------------------------------------------------------------
  {
    id: 'general-001',
    category: 'general',
    prompt: 'What is the difference between a compiler and an interpreter?',
    intent: { type: 'explanation', summary: 'Explain a technical concept plainly.' },
    required: ['compiler', 'interpreter'],
    minLength: 300
  },
  {
    id: 'general-002',
    category: 'general',
    prompt: 'Give me three tips for staying focused while working from home.',
    intent: { type: 'general', summary: 'Give practical everyday guidance.' },
    required: ['tip', 'focus'],
    minLength: 200
  },
  {
    id: 'general-003',
    category: 'general',
    prompt: 'Explain how the internet works in simple terms.',
    intent: { type: 'explanation', summary: 'Explain a technical concept plainly.' },
    required: ['packet', 'server'],
    minLength: 350
  },
  {
    id: 'general-004',
    category: 'general',
    prompt: 'What should I check before deploying a website to production?',
    intent: { type: 'general', summary: 'Give a practical checklist.' },
    required: ['check', 'deploy'],
    minLength: 300
  },
  {
    id: 'general-005',
    category: 'general',
    prompt: 'Compare MySQL and PostgreSQL in a few short points.',
    intent: { type: 'explanation', summary: 'Compare two technologies.' },
    required: ['MySQL', 'PostgreSQL'],
    minLength: 250
  },
  {
    id: 'general-006',
    category: 'general',
    prompt: 'What is the difference between HTTP and HTTPS?',
    intent: { type: 'explanation', summary: 'Explain a technical concept plainly.' },
    required: ['HTTP', 'HTTPS'],
    minLength: 200
  },
  {
    id: 'general-007',
    category: 'general',
    prompt: 'How do I choose a good password manager?',
    intent: { type: 'general', summary: 'Give practical everyday guidance.' },
    required: ['password'],
    minLength: 250
  },
  {
    id: 'general-008',
    category: 'general',
    prompt: 'What are the steps to publish a React app to GitHub Pages?',
    intent: { type: 'explanation', summary: 'Explain a technical process step by step.' },
    required: ['build', 'GitHub Pages'],
    minLength: 300
  },

  // ------------------------------------------------------------------
  // WRITING
  // ------------------------------------------------------------------
  {
    id: 'writing-001',
    category: 'writing',
    prompt: 'Write a short tagline for a coffee shop that roasts beans in-house.',
    intent: { type: 'writing', summary: 'Draft public-facing product copy.' },
    required: ['roast'],
    minLength: 120
  },
  {
    id: 'writing-002',
    category: 'writing',
    prompt: 'Rewrite this sentence to sound more professional: "We will get back to you soon."',
    intent: { type: 'writing', summary: 'Rewrite copy professionally.' },
    required: ['professional'],
    minLength: 100
  },
  {
    id: 'writing-003',
    category: 'writing',
    prompt: 'Change the tone of this message to be friendly and casual: "Your order has been shipped."',
    intent: { type: 'writing', summary: 'Adapt copy tone.' },
    required: ['order'],
    minLength: 100
  },
  {
    id: 'writing-004',
    category: 'writing',
    prompt: 'Summarise the key points of a remote work policy in 5 bullets.',
    intent: { type: 'writing', summary: 'Summarise content into bullets.' },
    required: ['remote'],
    minLength: 200
  },
  {
    id: 'writing-005',
    category: 'writing',
    prompt: 'Expand this one-liner into a short product description: "A notebook that syncs to the cloud."',
    intent: { type: 'writing', summary: 'Expand short copy.' },
    required: ['notebook', 'cloud'],
    minLength: 250
  },
  {
    id: 'writing-006',
    category: 'writing',
    prompt: 'Write a friendly email asking a client for feedback on a delivered project.',
    intent: { type: 'writing', summary: 'Draft professional correspondence.' },
    required: ['feedback', 'project'],
    minLength: 200
  },
  {
    id: 'writing-007',
    category: 'writing',
    prompt: 'Write a one-paragraph mission statement for a community garden.',
    intent: { type: 'writing', summary: 'Draft a mission statement.' },
    required: ['garden', 'community'],
    minLength: 180
  },

  // ------------------------------------------------------------------
  // CODING
  // ------------------------------------------------------------------
  {
    id: 'coding-001',
    category: 'coding',
    prompt: 'Write a JavaScript function that returns the factorial of a number.',
    intent: { type: 'code-help', summary: 'Help the user write a function.' },
    required: ['function', 'factorial'],
    expectCode: true,
    minLength: 200
  },
  {
    id: 'coding-002',
    category: 'coding',
    prompt: 'My JavaScript sort does not order numbers correctly. What is wrong?',
    intent: { type: 'code-help', summary: 'Help the user debug code.' },
    required: ['sort', 'number'],
    minLength: 250
  },
  {
    id: 'coding-003',
    category: 'coding',
    prompt: 'Explain how async/await works in JavaScript with a small example.',
    intent: { type: 'explanation', summary: 'Explain a code concept with an example.' },
    required: ['async', 'await'],
    expectCode: true,
    minLength: 300
  },
  {
    id: 'coding-004',
    category: 'coding',
    prompt: 'Refactor this code to use modern array methods: const doubled = []; for (let i = 0; i < nums.length; i++) { doubled.push(nums[i] * 2); }',
    intent: { type: 'code-help', summary: 'Refactor existing code.' },
    required: ['map'],
    expectCode: true,
    minLength: 200
  },
  {
    id: 'coding-005',
    category: 'coding',
    prompt: 'Create a React component that shows a counter with increment and decrement buttons.',
    intent: { type: 'app', summary: 'Create a small interactive component.' },
    required: ['counter'],
    expectCode: true,
    expectFramework: 'react',
    minLength: 400
  },
  {
    id: 'coding-006',
    category: 'coding',
    prompt: 'Fix the bug in this event handler: <button onClick={handleClick}>Click</button> where handleClick never fires.',
    intent: { type: 'code-help', summary: 'Fix a specific bug.' },
    required: ['button'],
    expectCode: true,
    minLength: 250
  },
  {
    id: 'coding-007',
    category: 'coding',
    prompt: 'Write a small HTML page with a text input and a button that shows the input value in an alert.',
    intent: { type: 'app', summary: 'Create a small HTML page.' },
    required: ['input', 'button'],
    expectCode: true,
    expectFramework: 'html',
    minLength: 300
  },
  {
    id: 'coding-008',
    category: 'coding',
    prompt: 'How would you debounce a search input in React?',
    intent: { type: 'code-help', summary: 'Explain and implement a debounce.' },
    required: ['debounce'],
    expectCode: true,
    minLength: 300
  },
  {
    id: 'coding-009',
    category: 'coding',
    prompt: 'Write a CSS rule that centres a fixed-width box both horizontally and vertically.',
    intent: { type: 'code-help', summary: 'Write CSS.' },
    required: [],
    requiredAny: [['margin'], ['flex'], ['grid'], ['center'], ['centre'], ['translate']],
    expectCode: true,
    minLength: 150
  },

  // ------------------------------------------------------------------
  // GAMES
  // ------------------------------------------------------------------
  {
    id: 'game-001',
    category: 'game',
    prompt: 'Build me a snake game with a score counter, speed that increases as you eat, and a game over screen.',
    intent: { type: 'app', summary: 'Create a playable snake game.' },
    required: ['snake', 'score', 'game over'],
    expectCode: true,
    expectGame: true,
    minLength: 1500
  },
  {
    id: 'game-002',
    category: 'game',
    prompt: 'Create a side-scrolling platformer where the player jumps between platforms and collects coins.',
    intent: { type: 'app', summary: 'Create a platformer game.' },
    required: ['platform', 'jump'],
    expectCode: true,
    expectGame: true,
    minLength: 1500
  },
  {
    id: 'game-003',
    category: 'game',
    prompt: 'Make a two-player pong game controlled with the W/S and Up/Down keys.',
    intent: { type: 'app', summary: 'Create a pong game.' },
    required: ['pong', 'paddle'],
    expectCode: true,
    expectGame: true,
    minLength: 1200
  },
  {
    id: 'game-004',
    category: 'game',
    prompt: 'Build a memory matching game with a grid of cards that flip over.',
    intent: { type: 'app', summary: 'Create a memory game.' },
    required: ['card', 'match'],
    expectCode: true,
    expectGame: true,
    minLength: 1200
  },
  {
    id: 'game-005',
    category: 'game',
    prompt: 'Create a space shooter where the player dodges and shoots asteroids.',
    intent: { type: 'app', summary: 'Create a space shooter game.' },
    required: ['shoot', 'asteroid'],
    expectCode: true,
    expectGame: true,
    minLength: 1500
  },
  {
    id: 'game-006',
    category: 'game',
    prompt: 'Build a simple breakout game with a paddle, a ball and destructible bricks.',
    intent: { type: 'app', summary: 'Create a breakout game.' },
    required: ['brick', 'ball'],
    expectCode: true,
    expectGame: true,
    minLength: 1500
  },
  {
    id: 'game-007',
    category: 'game',
    prompt: 'Create a tic-tac-toe game against the computer that never loses.',
    intent: { type: 'app', summary: 'Create a tic-tac-toe game.' },
    required: ['tic', 'toe'],
    expectCode: true,
    expectGame: true,
    minLength: 1200
  },
  {
    id: 'game-008',
    category: 'game',
    prompt: 'Build a reaction timing game where you click a target as fast as possible when it appears.',
    intent: { type: 'app', summary: 'Create a reaction timing game.' },
    required: ['click', 'time'],
    expectCode: true,
    expectGame: true,
    minLength: 1000
  },
  {
    id: 'game-009',
    category: 'game',
    prompt: 'Create a brick-breaker style game where the ball speeds up after each level.',
    intent: { type: 'app', summary: 'Create a brick-breaker game.' },
    required: ['ball', 'level'],
    expectCode: true,
    expectGame: true,
    minLength: 1500
  },
  {
    id: 'game-010',
    category: 'game',
    prompt: 'Build a simple endless runner where the character jumps over obstacles.',
    intent: { type: 'app', summary: 'Create an endless runner game.' },
    required: ['jump', 'obstacle'],
    expectCode: true,
    expectGame: true,
    minLength: 1500
  },

  // ------------------------------------------------------------------
  // ADVERSARIAL — constraints that must be respected
  // ------------------------------------------------------------------
  {
    id: 'adversarial-001',
    category: 'adversarial',
    prompt: 'Explain how databases index data. Do not include any code.',
    intent: { type: 'explanation', summary: 'Explain a concept without code.' },
    required: ['index'],
    mustNotContain: ['```'],
    minLength: 250
  },
  {
    id: 'adversarial-002',
    category: 'adversarial',
    prompt: 'Write a haiku about the ocean. Only the haiku, nothing else.',
    intent: { type: 'writing', summary: 'Write a strict-form poem.' },
    required: [],
    minLength: 30,
    maxLength: 400
  },
  {
    id: 'adversarial-003',
    category: 'adversarial',
    prompt: 'List three healthy breakfast ideas. Keep the answer under ten lines.',
    intent: { type: 'general', summary: 'Give a short list.' },
    required: [],
    maxLength: 700
  },
  {
    id: 'adversarial-004',
    category: 'adversarial',
    prompt: 'Answer in one sentence: why is version control useful?',
    intent: { type: 'general', summary: 'Answer concisely.' },
    required: ['version control'],
    maxLength: 250
  },
  {
    id: 'adversarial-005',
    category: 'adversarial',
    prompt: 'Explain DNS. Do not mention "cache" at all.',
    intent: { type: 'explanation', summary: 'Explain a concept with a forbidden term.' },
    required: ['DNS'],
    mustNotContain: ['cache'],
    minLength: 250
  },
  {
    id: 'adversarial-006',
    category: 'adversarial',
    prompt: 'Give me a recipe for lemonade using only four ingredients. Format it as a numbered list.',
    intent: { type: 'general', summary: 'Give a structured answer.' },
    required: ['lemonade', '1.'],
    minLength: 150
  }
];

// Multi-turn continuity scenarios: turn prompts + per-turn expectations.
// The evaluator runs every turn through the same worker, feeding the
// previous assistant reply back as conversation history so the project
// analyser can derive state.
export const multiTurnScenarios = [
  {
    id: 'snake-5-turn-continuity',
    description: 'Create, then delta-edit the same snake game across five turns.',
    turns: [
      {
        prompt: 'Build me a snake game with a score counter, speed that increases as you eat, and a game over screen.',
        intent: { type: 'app', summary: 'Create a playable snake game.' },
        expectCode: true,
        required: ['snake', 'score'],
        minLength: 1500
      },
      {
        prompt: 'Now make the snake speed up gradually instead of jumping between levels.',
        intent: { type: 'app', summary: 'Modify the existing snake game.' },
        expectDelta: true,
        expectFrameworkPreserved: true,
        required: ['snake'],
        minLength: 800
      },
      {
        prompt: 'Make the snake blue. Do not change anything else.',
        intent: { type: 'app', summary: 'Modify only the snake colour.' },
        expectDelta: true,
        expectFrameworkPreserved: true,
        required: ['snake'],
        minLength: 800
      },
      {
        prompt: 'Add touch controls for mobile.',
        intent: { type: 'app', summary: 'Extend the existing snake game.' },
        expectDelta: true,
        expectFrameworkPreserved: true,
        required: ['touch'],
        minLength: 900
      },
      {
        prompt: 'Undo only the blue snake change, keep everything else.',
        intent: { type: 'app', summary: 'Revert one change while preserving the rest.' },
        expectDelta: true,
        expectFrameworkPreserved: true,
        required: ['snake'],
        minLength: 800
      }
    ]
  },
  {
    id: 'pong-4-turn-continuity',
    description: 'Pong created once, then three small delta edits.',
    turns: [
      {
        prompt: 'Make a two-player pong game with a scoreboard and keyboard controls.',
        intent: { type: 'app', summary: 'Create a pong game.' },
        expectCode: true,
        required: ['pong', 'score'],
        minLength: 1200
      },
      {
        prompt: 'Make the left paddle faster.',
        intent: { type: 'app', summary: 'Modify the left paddle speed.' },
        expectDelta: true,
        expectFrameworkPreserved: true,
        required: ['paddle'],
        minLength: 700
      },
      {
        prompt: 'Change the ball colour to green and keep the paddles as they are.',
        intent: { type: 'app', summary: 'Modify only the ball colour.' },
        expectDelta: true,
        expectFrameworkPreserved: true,
        required: ['ball'],
        minLength: 700
      },
      {
        prompt: 'Add a sound effect when the ball hits a paddle.',
        intent: { type: 'app', summary: 'Add a sound effect to the existing game.' },
        expectDelta: true,
        expectFrameworkPreserved: true,
        required: ['sound'],
        minLength: 800
      }
    ]
  },
  {
    id: 'landing-3-turn-continuity',
    description: 'A landing page created once, then two content edits.',
    turns: [
      {
        prompt: 'Make me a landing page for a small bakery with a menu section.',
        intent: { type: 'app', summary: 'Create a bakery landing page.' },
        expectCode: true,
        required: ['bakery', 'menu'],
        minLength: 1200
      },
      {
        prompt: 'Add a contact form to the page.',
        intent: { type: 'app', summary: 'Extend the existing landing page.' },
        expectDelta: true,
        expectFrameworkPreserved: true,
        required: ['contact'],
        minLength: 900
      },
      {
        prompt: 'Change the heading to "Fresh Bread Daily" and keep the rest.',
        intent: { type: 'app', summary: 'Edit the heading only.' },
        expectDelta: true,
        expectFrameworkPreserved: true,
        required: ['Fresh Bread Daily'],
        minLength: 900
      }
    ]
  },
  {
    id: 'timer-2-turn-continuity',
    description: 'A simple app created once, then one small change.',
    turns: [
      {
        prompt: 'Build me a pomodoro timer with a start and reset button.',
        intent: { type: 'app', summary: 'Create a timer app.' },
        expectCode: true,
        required: ['timer'],
        minLength: 900
      },
      {
        prompt: 'Change the default session length to 45 minutes.',
        intent: { type: 'app', summary: 'Modify the timer default.' },
        expectDelta: true,
        expectFrameworkPreserved: true,
        required: ['45'],
        minLength: 700
      }
    ]
  }
];

// Failure-case table for the evaluator self-check: synthetic outputs that
// MUST hard-fail (or be flagged) by the strict scoring rules.
export const failureCases = [
  {
    id: 'failure-001',
    label: 'truncated explanation',
    content: 'The internet works by sending data packets between computers using protocols such as',
    userPrompt: 'Explain how the internet works',
    expectHardFail: true,
    reason: 'truncated response'
  },
  {
    id: 'failure-002',
    label: 'truncated code fence',
    content: '```jsx\nfunction App() { return <div>Hi</div>; }',
    userPrompt: 'Create a React counter component',
    expectHardFail: true,
    reason: 'open code fence'
  },
  {
    id: 'failure-003',
    label: 'syntactically invalid JS',
    content: '```js\nfunction double( {\n  return x * 2;\n}\n```\nThis doubles a number.',
    userPrompt: 'Write a function that doubles a number',
    expectHardFail: true,
    reason: 'syntax failure'
  },
  {
    id: 'failure-004',
    label: 'completely wrong answer',
    content: 'The best way to stay productive at home is to water your plants three times a day and never use a computer.',
    userPrompt: 'Give me three tips for staying focused while working from home',
    required: ['focus', 'work'],
    expectHardFail: true,
    reason: 'ignored core requirement (no focus/work tips)'
  },
  {
    id: 'failure-005',
    label: 'empty response',
    content: '',
    userPrompt: 'Explain DNS',
    expectHardFail: true,
    reason: 'empty provider response'
  },
  {
    id: 'failure-006',
    label: 'working answer but wrong framework',
    content: '```html\n<html><body><canvas id="g"></canvas><script>let score = 0;</script></body></html>\n```\nHere is the snake game.',
    userPrompt: 'Now make the snake speed up gradually',
    project: { framework: 'react', features: ['score', 'controls'] },
    expectHardFail: true,
    reason: 'unrelated framework replacement during follow-up'
  },
  {
    id: 'failure-007',
    label: 'deletes existing functionality',
    content: '```jsx\nexport default function App() {\n  return <canvas />;\n}\n```\nSimplified version without the score.',
    userPrompt: 'Make the snake blue',
    project: { framework: 'react', features: ['scoring', 'controls', 'game-over'] },
    expectHardFail: true,
    reason: 'removal of required existing functionality'
  },
  {
    id: 'failure-008',
    label: 'fabricated claim about previous implementation',
    content: 'Instead of the discrete difficulty levels the previous version had, the snake now accelerates smoothly.',
    userPrompt: 'Make the snake speed up gradually',
    project: { framework: 'react', features: ['scoring'] },
    expectHardFail: true,
    reason: 'fabricated claim about existing implementation'
  },
  {
    id: 'failure-009',
    label: 'malformed response for a code request',
    content: 'Sure, I can build that for you. It will be great. Let me know if you want changes.',
    userPrompt: 'Create a React component that shows a counter with increment and decrement buttons',
    expectCode: true,
    expectHardFail: true,
    reason: 'missing requested deliverable (no code)'
  },
  {
    id: 'failure-010',
    label: 'beautiful UI with broken game logic',
    content: '```jsx\nexport default function App() {\n  return (\n    <div style={{ background: "linear-gradient(#1a1a2e,#16213e)", color: "#eee", fontFamily: "Outfit" }}>\n      <h1>Neon Snake</h1>\n      <canvas />\n    </div>\n  );\n}\n```\nA gorgeous snake game with glassmorphism panels and neon gradients.',
    userPrompt: 'Build me a snake game with a score counter and a game over screen',
    expectGame: true,
    expectHardFail: true,
    reason: 'no scoring / game-over logic despite beautiful UI'
  }
];
