import { describe, it, expect } from 'vitest';
import { evaluateCase, scoreAspects, followUpBreakdown, WEIGHTS } from '../benchmarks/evaluator-core.js';
import { failureCases } from '../benchmarks/benchmark-cases.js';

const codeCase = {
  id: 'test-code',
  prompt: 'Create a React component that shows a counter with increment and decrement buttons.',
  intent: { type: 'app', summary: 'Create a small interactive component.' },
  required: ['counter'],
  expectCode: true,
  minLength: 400
};

const gameCase = {
  id: 'test-game',
  prompt: 'Build me a snake game with a score counter and a game over screen.',
  required: ['snake', 'score'],
  expectCode: true,
  expectGame: true,
  minLength: 1000
};

describe('evaluator hard-failure detection', () => {
  it('rejects truncated explanations', () => {
    const result = evaluateCase({
      content: 'The internet works by sending data packets between computers using protocols such as',
      caseDef: { prompt: 'Explain how the internet works', required: ['internet'] }
    });
    expect(result.passed).toBe(false);
    expect(result.hardFailures.some((f) => f.includes('truncated'))).toBe(true);
  });

  it('rejects syntactically invalid React', () => {
    const result = evaluateCase({
      content: '```jsx\nexport default function App( {\n  return <div>Hi</div>;\n}\n```',
      caseDef: { ...codeCase, required: [] }
    });
    expect(result.passed).toBe(false);
    expect(result.hardFailures.some((f) => f.includes('syntax-failure'))).toBe(true);
  });

  it('rejects a completely wrong answer', () => {
    const result = evaluateCase({
      content: 'The best way to be productive is to water plants and never use computers.',
      caseDef: { prompt: 'Give me three tips for staying focused while working from home', required: ['focus'] }
    });
    expect(result.passed).toBe(false);
    expect(result.hardFailures.some((f) => f.includes('ignored-core-requirement'))).toBe(true);
  });

  it('rejects an empty response', () => {
    const result = evaluateCase({ content: '', caseDef: { prompt: 'Explain DNS' } });
    expect(result.passed).toBe(false);
    expect(result.hardFailures).toContain('empty-provider-response');
  });

  it('rejects a working answer in the wrong framework during a follow-up', () => {
    const result = evaluateCase({
      content: '```html\n<html><body><canvas id="g"></canvas><script>let score = 0;</script></body></html>\n```',
      caseDef: { prompt: 'Now make the snake speed up gradually' },
      project: { framework: 'react', features: ['scoring', 'controls'] }
    });
    expect(result.passed).toBe(false);
    expect(result.hardFailures.some((f) => f.includes('framework-replacement'))).toBe(true);
  });

  it('rejects answers that delete existing functionality', () => {
    const result = evaluateCase({
      content: '```jsx\nexport default function App() { return <canvas />; }\n```',
      caseDef: { prompt: 'Make the snake blue' },
      project: { framework: 'react', features: ['scoring', 'controls', 'game-over'] }
    });
    expect(result.passed).toBe(false);
    expect(result.hardFailures.some((f) => f.includes('removed-existing-functionality'))).toBe(true);
  });

  it('rejects a beautiful UI with broken game logic', () => {
    const result = evaluateCase({
      content: '```jsx\nexport default function App() {\n  return (\n    <div style={{ background: "linear-gradient(#1a1a2e,#16213e)", color: "#eee" }}>\n      <h1>Neon Snake</h1>\n      <canvas />\n    </div>\n  );\n}\n```',
      caseDef: gameCase
    });
    expect(result.passed).toBe(false);
    expect(result.hardFailures.some((f) => f.includes('broken-game-logic'))).toBe(true);
  });

  it('rejects missing requested deliverables (no code when code is expected)', () => {
    const result = evaluateCase({
      content: 'Sure, I can build that for you. Let me know if you want changes.',
      caseDef: codeCase
    });
    expect(result.passed).toBe(false);
    expect(result.hardFailures.some((f) => f.includes('missing-requested-deliverable'))).toBe(true);
  });

  it('rejects fabricated claims about the previous implementation', () => {
    const result = evaluateCase({
      content: 'Instead of the discrete difficulty levels the previous version had, the snake now accelerates smoothly.',
      caseDef: { prompt: 'Make the snake speed up gradually' },
      project: { framework: 'react', features: ['scoring'] }
    });
    expect(result.passed).toBe(false);
    expect(result.hardFailures.some((f) => f.includes('fabricated-claim'))).toBe(true);
  });
});

describe('evaluator accepts strong outputs', () => {
  it('passes a complete, syntactically valid game', () => {
    const content = `Here's Neon Snake — steer with the arrow keys.

\`\`\`jsx
export default function App() {
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let speed = 100;
    function gameLoop() {
      requestAnimationFrame(gameLoop);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    gameLoop();
    const onKey = () => {};
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  function restart() { setScore(0); setGameOver(false); }
  return <canvas ref={canvasRef} width="480" height="480" />;
}
\`\`\`

Controls: arrow keys move the snake; eat food to grow and score.`;
    const result = evaluateCase({ content, caseDef: gameCase });
    expect(result.hardFailures).toEqual([]);
    expect(result.score).toBeGreaterThanOrEqual(4);
    expect(result.passed).toBe(true);
  });

  it('passes a correct explanation with required terms', () => {
    const content = 'A compiler translates the entire source program into machine code in one pass, while an interpreter executes the source line by line. Compilers produce faster programs because translation happens once. Interpreters are easier to debug because errors appear immediately. Both are used heavily in modern tooling.';
    const result = evaluateCase({
      content,
      caseDef: { prompt: 'What is the difference between a compiler and an interpreter?', required: ['compiler', 'interpreter'], minLength: 200 }
    });
    expect(result.passed).toBe(true);
  });
});

describe('evaluator self-check over the failure-case table', () => {
  it('rejects every synthetic bad output in the benchmark table', () => {
    for (const failure of failureCases) {
      const verdict = evaluateCase({
        content: failure.content,
        caseDef: { prompt: failure.userPrompt, required: failure.required || [], expectCode: failure.expectCode === true, expectGame: failure.expectGame === true },
        project: failure.project || null
      });
      expect(verdict.passed, `${failure.id} (${failure.label}) must be rejected`).toBe(false);
      expect(verdict.hardFailures.length, `${failure.id} must report hard failures`).toBeGreaterThan(0);
    }
  });
});

describe('weighted scoring', () => {
  it('gives partial credit for partial instruction adherence', () => {
    const aspects = scoreAspects({
      content: 'Here is a counter built with state.',
      caseDef: { prompt: 'x', required: ['counter', 'button', 'increment'] },
      project: null,
      context: {}
    });
    expect(aspects.instructionAdherence).toBeCloseTo(1 / 3, 1);
  });

  it('weights aspects by the documented table', () => {
    expect(WEIGHTS.instructionAdherence).toBe(0.2);
    expect(WEIGHTS.functionalCorrectness).toBe(0.25);
    expect(WEIGHTS.conversationContinuity).toBe(0.15);
    expect(WEIGHTS.executionValidation).toBe(0.15);
    expect(WEIGHTS.completeness).toBe(0.1);
    expect(WEIGHTS.uxQuality).toBe(0.1);
    expect(WEIGHTS.efficiency).toBe(0.05);
    const total = Object.values(WEIGHTS).reduce((s, v) => s + v, 0);
    expect(total).toBeCloseTo(1, 5);
  });
});

describe('follow-up breakdown', () => {
  it('reports continuity, change precision and regression safety separately', () => {
    const content = '```jsx\nexport default function App() {\n  const [score, setScore] = useState(0);\n  return <canvas onKeyDown={onKey} />;\n}\n```';
    const breakdown = followUpBreakdown({
      content,
      caseDef: { prompt: 'Make the snake blue' },
      project: { framework: 'react', features: ['scoring', 'controls'] }
    });
    expect(typeof breakdown.continuity).toBe('number');
    expect(typeof breakdown.changePrecision).toBe('number');
    expect(typeof breakdown.regressionSafety).toBe('number');
  });
});

