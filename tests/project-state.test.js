import { describe, it, expect } from 'vitest';
import {
  parseProjectState,
  deriveProjectState,
  isFollowUpRequest,
  buildProjectContextSection,
  serializeProjectState
} from '../worker/projectState.js';

describe('parseProjectState', () => {
  it('normalises a valid project state', () => {
    const parsed = parseProjectState({
      projectType: 'Game',
      framework: 'React',
      language: 'javascript',
      rendering: 'canvas',
      features: ['score', 'controls', 'game-over'],
      importantFiles: ['App.jsx'],
      constraints: ['keep React'],
      recentChanges: ['added touch controls']
    });
    expect(parsed.framework).toBe('react');
    expect(parsed.projectType).toBe('game');
    expect(parsed.features).toEqual(['score', 'controls', 'game-over']);
  });

  it('rejects malformed state', () => {
    expect(parseProjectState(null)).toBe(null);
    expect(parseProjectState([])).toBe(null);
    expect(parseProjectState({ framework: '../../evil' })).toBe(null);
    expect(parseProjectState('react')).toBe(null);
  });

  it('accepts a minimal state', () => {
    const parsed = parseProjectState({ framework: 'html' });
    expect(parsed.framework).toBe('html');
    expect(parsed.features).toEqual([]);
  });
});

describe('deriveProjectState', () => {
  it('returns null with no assistant code', () => {
    expect(deriveProjectState([{ role: 'user', content: 'hello' }])).toBe(null);
    expect(deriveProjectState([])).toBe(null);
  });

  it('derives a React canvas game', () => {
    const project = deriveProjectState([
      {
        role: 'assistant',
        content: '```jsx\nexport default function App() {\n  const [score, setScore] = useState(0);\n  return <canvas ref={canvasRef} />;\n}\n```'
      }
    ]);
    expect(project.framework).toBe('react');
    expect(project.rendering).toBe('canvas');
    expect(project.projectType).toBe('game');
    expect(project.features).toContain('scoring');
  });

  it('derives an HTML game', () => {
    const project = deriveProjectState([
      { role: 'assistant', content: '```html\n<html><body><canvas id="g"></canvas><script>let score=0;</script></body></html>\n```' }
    ]);
    expect(project.framework).toBe('html');
    expect(project.projectType).toBe('game');
  });
});

describe('isFollowUpRequest', () => {
  it('detects modification turns only when a project exists', () => {
    const project = { framework: 'react' };
    expect(isFollowUpRequest('Now make the speed gradual', project)).toBe(true);
    expect(isFollowUpRequest('Make the snake blue', project)).toBe(true);
    expect(isFollowUpRequest('Add touch controls', project)).toBe(true);
    // A fresh build is not a follow-up modification.
    expect(isFollowUpRequest('Build me a pong game', project)).toBe(false);
    expect(isFollowUpRequest('Now make the speed gradual', null)).toBe(false);
    expect(isFollowUpRequest('How does flexbox work?', project)).toBe(false);
  });
});

describe('buildProjectContextSection', () => {
  it('renders the state-aware follow-up guidance', () => {
    const section = buildProjectContextSection(
      { projectType: 'game', framework: 'react', language: 'javascript', rendering: 'canvas', features: ['score', 'controls'] },
      'Make the snake blue'
    );
    expect(section).toContain('EXISTING PROJECT STATE');
    expect(section).toContain('Framework: react');
    expect(section).toContain('FOLLOW-UP REQUEST');
    expect(section).toContain('PRESERVE');
    expect(section).toContain('Do NOT regenerate the entire project from scratch');
    expect(section).toContain('- score');
  });

  it('returns empty for missing state', () => {
    expect(buildProjectContextSection(null, 'x')).toBe('');
  });
});

describe('serializeProjectState', () => {
  it('round-trips through parseProjectState', () => {
    const input = { projectType: 'game', framework: 'react', language: 'javascript', rendering: 'canvas', features: ['score'] };
    const serialized = serializeProjectState(input);
    expect(serialized).toMatchObject(input);
    expect(serializeProjectState(null)).toBe(null);
  });
});
