import { describe, it, expect, vi } from 'vitest';
import {
  validateHtmlDocument,
  scoreContinuity,
  processResponse
} from '../worker/responseProcessor.js';
import {
  deriveProjectState,
  buildProjectContextSection
} from '../worker/projectState.js';

describe('post-upgrade retest regressions', () => {
  it('does not create project memory from an explanatory HTML example', () => {
    const state = deriveProjectState([
      { role: 'user', content: 'Explain how CSS flexbox works like I am new to web development.' },
      {
        role: 'assistant',
        content: 'Example:\n```html\n<html><body><div class="row"><div>One</div><div>Two</div></div></body></html>\n```'
      }
    ]);
    expect(state).toBe(null);
  });

  it('does not create project memory from React debugging snippets', () => {
    const state = deriveProjectState([
      { role: 'user', content: 'My React button click does nothing. How should I debug it?' },
      {
        role: 'assistant',
        content: 'Try this first:\n```jsx\n<button onClick={handleClick}>Click</button>\n```\nThen log inside the handler.'
      }
    ]);
    expect(state).toBe(null);
  });

  it('still derives a project from a real creation request', () => {
    const state = deriveProjectState([
      { role: 'user', content: 'Build me a snake game with a score counter.' },
      {
        role: 'assistant',
        content: '```jsx\nexport default function App() { const [score] = useState(0); return <canvas />; }\n```'
      }
    ]);
    expect(state?.framework).toBe('react');
    expect(state?.projectType).toBe('game');
    expect(state?.latestCode).toContain('export default function App');
  });

  it('accepts standalone HTML fragments without forcing an html root', () => {
    const fragment = '<div class="container"><button type="button">Save</button></div>';
    expect(validateHtmlDocument(fragment)).toEqual({ ok: true, issues: [] });
  });

  it('still rejects malformed full HTML documents', () => {
    const result = validateHtmlDocument('<html><body><div>Broken</body></html>');
    expect(result.ok).toBe(false);
    expect(result.issues).toContain('unclosed-body-tag');
    expect(result.issues).toContain('unclosed-div-tags');
  });

  it('does not force code repair for an unrelated question just because project state exists', async () => {
    const generate = vi.fn();
    const result = await processResponse([], 'Flexbox arranges items along a main and cross axis.', {
      userPrompt: 'How does flexbox work?',
      project: { framework: 'react', projectType: 'game', features: ['scoring'] },
      generate,
      maxRepairs: 2
    });
    expect(generate).not.toHaveBeenCalled();
    expect(result.diagnostics.isModificationRequest).toBe(false);
    expect(result.diagnostics.missingCodeForModification).toBe(false);
    expect(result.diagnostics.continuity).toBe(null);
  });

  it('clears a stale length stop reason after a successful repair', async () => {
    const generate = vi.fn(async () => ({
      content: ' finishes cleanly with the missing conclusion.',
      stopReason: 'stop'
    }));
    const result = await processResponse(
      [{ role: 'user', content: 'Explain this clearly.' }],
      'This explanation is nearly complete but',
      {
        userPrompt: 'Explain this clearly.',
        stopReason: 'length',
        generate,
        maxRepairs: 2
      }
    );
    expect(result.diagnostics.repaired).toBe(true);
    expect(result.diagnostics.stopReason).toBe('stop');
    expect(result.diagnostics.truncationDetected).toBe(false);
  });

  it('detects a same-framework wholesale rewrite through line retention', () => {
    const previous = `export default function App() {
  const canvasRef = useRef(null);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  function resetGame() { setScore(0); setGameOver(false); }
  function handleKey(e) { console.log(e.key); }
  return <canvas ref={canvasRef} onKeyDown={handleKey} />;
}`;
    const rewritten = `\`\`\`jsx
export default function App() {
  const [score, setScore] = useState(0);
  useEffect(() => { requestAnimationFrame(function loop() {}); }, []);
  return <canvas />;
}
\`\`\``;
    const continuity = scoreContinuity({
      project: {
        framework: 'react',
        features: ['scoring', 'controls', 'game-over', 'restart', 'canvas'],
        latestCode: previous
      },
      response: rewritten,
      userPrompt: 'Make the snake blue'
    });
    expect(continuity.checks['preserved-framework']).toBe(true);
    expect(continuity.checks['avoided-unnecessary-rewrite']).toBe(false);
    expect(continuity.retainedLineRatio).toBeLessThan(0.45);
  });

  it('records a successful follow-up change in project memory', async () => {
    const project = {
      projectType: 'game',
      framework: 'react',
      language: 'javascript',
      rendering: 'canvas',
      features: ['scoring', 'controls', 'canvas'],
      recentChanges: []
    };
    const previous = '```jsx\nexport default function App() { const [score] = useState(0); function handleKey() {} return <canvas onKeyDown={handleKey} />; }\n```';
    const answer = '```jsx\nexport default function App() { const [score] = useState(0); function handleKey() {} const snakeColor = "blue"; return <canvas onKeyDown={handleKey} data-color={snakeColor} />; }\n```';
    const result = await processResponse(
      [
        { role: 'user', content: 'Build me a snake game.' },
        { role: 'assistant', content: previous },
        { role: 'user', content: 'Make the snake blue. Do not change anything else.' }
      ],
      answer,
      {
        userPrompt: 'Make the snake blue. Do not change anything else.',
        project,
        maxRepairs: 0
      }
    );
    expect(result.diagnostics.isModificationRequest).toBe(true);
    expect(result.diagnostics.continuity).not.toBe(null);
    expect(project.recentChanges.at(-1)).toContain('Make the snake blue');
  });

  it('makes the follow-up override explicit and delta-first', () => {
    const section = buildProjectContextSection(
      {
        projectType: 'game',
        framework: 'react',
        language: 'javascript',
        rendering: 'canvas',
        features: ['scoring', 'controls'],
        recentChanges: ['added touch controls']
      },
      'Make the snake blue'
    );
    expect(section).toContain('FOLLOW-UP OVERRIDE');
    expect(section).toContain('SMALLEST safe code change');
    expect(section).toContain('complete updated runnable code');
    expect(section).toContain('added touch controls');
  });
});
