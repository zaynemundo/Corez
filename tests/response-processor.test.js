import { describe, it, expect, vi } from 'vitest';
import {
  detectTruncation,
  countFences,
  detectLanguageMismatch,
  languageMismatchRatio,
  extractCodeBlocks,
  syntaxCheckJS,
  checkBracketBalance,
  validateHtmlDocument,
  checkGameRequirements,
  analyzeProjectState,
  isModificationRequest,
  scoreContinuity,
  stitchContinuationChunk,
  mergeResponse,
  processResponse,
  stripMetaCommentary,
  isMetaOnlyReply
} from '../worker/responseProcessor.js';

describe('detectTruncation', () => {
  it('flags an open (unterminated) code fence', () => {
    const result = detectTruncation('Here is the app:\n```jsx\nfunction App() {}');
    expect(result.truncated).toBe(true);
    expect(result.signals).toContain('open-code-fence');
  });

  it('flags a mid-sentence cutoff', () => {
    const result = detectTruncation('The snake game works by moving the head forward and the tail including');
    expect(result.truncated).toBe(true);
    expect(result.signals).toContain('mid-sentence-cutoff');
  });

  it('accepts a complete sentence that simply omits a final period', () => {
    const result = detectTruncation('The snake game works by moving the head forward and the tail with the arrow keys');
    expect(result.truncated).toBe(false);
  });

  it('flags endings on conjunctions', () => {
    const result = detectTruncation('The game uses requestAnimationFrame for the loop because');
    expect(result.truncated).toBe(true);
    expect(result.signals).toContain('ends-with-conjunction');
  });

  it('flags unmatched opening brackets', () => {
    const result = detectTruncation('const grid = new Array(rows).fill(() => {');
    expect(result.truncated).toBe(true);
    expect(result.signals).toContain('unmatched-{}');
  });

  it('flags an unclosed HTML tag in document-like content', () => {
    const result = detectTruncation('<div class="game"><section><header><h1>Snake and the content keeps going');
    expect(result.truncated).toBe(true);
    expect(result.signals).toContain('unclosed-html-div');
  });

  it('does not flag identifier-style tag mentions or URL placeholders', () => {
    const identifiers = 'Use the <form> element with a submit handler and the <button> element.';
    expect(detectTruncation(identifiers).truncated).toBe(false);
    const urls = 'Push to https://github.com/<username>/<repository>.git then enable Pages in the repo settings.';
    expect(detectTruncation(urls).truncated).toBe(false);
  });

  it('does not flag provider stop reason length at a clean boundary', () => {
    // A 'length' stop ending at a complete sentence/tag/fence is a clean cap
    // hit, not truncation — flagging it spent up to 12 repair calls per hit.
    const result = detectTruncation('A complete looking answer that ends properly.', { stopReason: 'length' });
    expect(result.truncated).toBe(false);
    const closedBlock = detectTruncation('```html\n<div>done</div>\n```', { stopReason: 'length' });
    expect(closedBlock.truncated).toBe(false);
  });

  it('flags provider stop reason length when the text ends mid-word or mid-structure', () => {
    const midWord = detectTruncation('A complete looking answer that ends proper', { stopReason: 'length' });
    expect(midWord.truncated).toBe(true);
    expect(midWord.signals).toContain('provider-stop-reason-length');
    const midStructure = detectTruncation('const grid = new Array(rows).fill(() => {', { stopReason: 'length' });
    expect(midStructure.truncated).toBe(true);
  });

  it('flags an unfinished numbered list item', () => {
    const result = detectTruncation('Steps:\n1. Open the editor\n2. Write the code\n3.');
    expect(result.truncated).toBe(true);
    expect(result.signals).toContain('unfinished-list-item');
  });

  it('accepts a complete answer', () => {
    const complete = 'Here is how it works.\n\n```jsx\nfunction App() { return <div>Hi</div>; }\n```\n\nThat covers the main points.';
    expect(detectTruncation(complete).truncated).toBe(false);
  });

  it('flags empty responses', () => {
    const result = detectTruncation('   ');
    expect(result.truncated).toBe(true);
    expect(result.signals).toContain('empty-response');
  });
});

describe('countFences', () => {
  it('counts fence markers', () => {
    expect(countFences('a ```jsx\ncode\n``` b')).toBe(2);
    expect(countFences('no fences')).toBe(0);
  });
});

describe('language mismatch detection', () => {
  it('flags predominantly non-Latin answers for an English prompt', () => {
    const russian = 'Это змейка. Игрок управляет змеёй с помощью стрелок. Счёт увеличивается при поедании еды. Игра заканчивается при столкновении.';
    const result = detectLanguageMismatch(russian, 'Build me a snake game with a score counter.');
    expect(result.mismatch).toBe(true);
  });

  it('accepts English answers', () => {
    const english = 'This is a snake game. The player steers with the arrow keys. Eating food grows the snake and raises the score.';
    expect(detectLanguageMismatch(english, 'Build me a snake game.').mismatch).toBe(false);
  });

  it('exempts explicit translation tasks', () => {
    const french = 'Voici un jeu de serpent. Le joueur déplace le serpent avec les flèches du clavier.';
    expect(detectLanguageMismatch(french, 'Translate this into French').mismatch).toBe(false);
  });

  it('does not count fenced code as foreign text', () => {
    const withCode = 'The implementation follows.\n```js\nfunction start() { return "start"; }\n```\nAnd that is the full answer.';
    expect(languageMismatchRatio(withCode)).toBeLessThan(0.5);
  });
});

describe('code extraction and syntax validation', () => {
  it('extracts fenced code blocks', () => {
    const blocks = extractCodeBlocks('Intro.\n```jsx\nfunction App() {}\n```\nAnd more.\n```html\n<div></div>\n```');
    expect(blocks.length).toBe(2);
    expect(blocks[0].lang).toBe('jsx');
    expect(blocks[1].lang).toBe('html');
  });

  it('accepts valid JS', () => {
    expect(syntaxCheckJS('const x = 1; function f() { return x + 1; }').ok).toBe(true);
  });

  it('rejects invalid JS', () => {
    const result = syntaxCheckJS('function f( { return }');
    expect(result.ok).toBe(false);
    expect(result.error.length).toBeGreaterThan(0);
  });

  it('bracket-checks JSX code without a JS parser', () => {
    const good = 'export default function App() { return (<div><h1>Hi</h1></div>); }';
    expect(syntaxCheckJS(good).ok).toBe(true);
    const bad = 'export default function App() { return (<div><h1>Hi</h1></div>; }';
    expect(syntaxCheckJS(bad).ok).toBe(false);
  });

  it('bracket-check tolerates regex literals with brackets', () => {
    const withRegex = `const patterns = { a: /[{]/g, b: /[}]/g };`;
    expect(checkBracketBalance(withRegex)).toBe(true);
    const withCharClass = `const m = "abc".match(/[a-z]+/);`;
    expect(checkBracketBalance(withCharClass)).toBe(true);
  });

  it('bracket-check tolerates self-closing JSX tags', () => {
    const selfClosing = 'export default function App() { return <div {...props} style={{ margin: 0 }} />; }';
    expect(checkBracketBalance(selfClosing)).toBe(true);
    const fragments = 'export default function App() { return (<>{[1, 2].map((i) => <span key={i}>{i}</span>)}</>); }';
    expect(checkBracketBalance(fragments)).toBe(true);
  });

  it('validates HTML documents', () => {
    expect(validateHtmlDocument('<!DOCTYPE html><html><body></body></html>').ok).toBe(true);
    const result = validateHtmlDocument('<html><body><div></body></html>');
    expect(result.issues).toContain('unclosed-div-tags');
    expect(validateHtmlDocument('<html><body></html>').issues).toContain('unclosed-body-tag');
  });

  it('detects game requirements in code', () => {
    const code = `
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
let score = 0;
function update() { requestAnimationFrame(update); if (hitTest()) score++; }
window.addEventListener('keydown', () => {});
function restart() { score = 0; }
`;
    const found = checkGameRequirements([code]);
    for (const signal of ['game-loop', 'controls', 'scoring', 'collision', 'canvas']) {
      expect(found).toContain(signal);
    }
  });
});

describe('analyzeProjectState', () => {
  it('recognises a React + canvas game from the last assistant reply', () => {
    const { project } = analyzeProjectState([
      { role: 'user', content: 'Build me a snake game.' },
      {
        role: 'assistant',
        content: 'Here it is.\n```jsx\nexport default function App() {\n  const [score, setScore] = useState(0);\n  const canvasRef = useRef(null);\n  return <canvas ref={canvasRef} />;\n}\n```'
      }
    ]);
    expect(project.framework).toBe('react');
    expect(project.rendering).toBe('canvas');
    expect(project.projectType).toBe('game');
    expect(project.features).toContain('scoring');
  });

  it('recognises a standalone HTML game', () => {
    const { project } = analyzeProjectState([
      { role: 'assistant', content: '```html\n<html><body><canvas id="g"></canvas><script>const c=document.getElementById("g");c.getContext("2d");let score=0;</script></body></html>\n```' }
    ]);
    expect(project.framework).toBe('html');
    expect(project.rendering).toBe('canvas');
    expect(project.projectType).toBe('game');
  });
});

describe('isModificationRequest', () => {
  it('detects follow-up language', () => {
    const project = { framework: 'react', features: ['score'], latestCode: 'x' };
    expect(isModificationRequest('Now make the snake speed up gradually', project)).toBe(true);
    expect(isModificationRequest('Make the snake blue. Dont change anything else', project)).toBe(true);
    expect(isModificationRequest('Build me a pong game', null)).toBe(false);
  });
});

describe('scoreContinuity', () => {
  it('scores a delta-first React follow-up high', () => {
    const project = {
      framework: 'react',
      features: ['scoring', 'controls', 'game-over', 'restart', 'canvas'],
      latestCode: 'export default function App() { return <canvas />; }'
    };
    const response = '```jsx\nexport default function App() {\n  const [score, setScore] = useState(0);\n  const [gameOver, setGameOver] = useState(false);\n  function resetGame() { setScore(0); setGameOver(false); }\n  function handleKey(e) { console.log(e.key); }\n  return <canvas onKeyDown={handleKey} />;\n}\n```';
    const result = scoreContinuity({ project, response, userPrompt: 'make the snake speed up gradually' });
    expect(result.checks['preserved-framework']).toBe(true);
    expect(result.checks['preserved-unrelated-features']).toBe(true);
  });

  it('scores a framework replacement low', () => {
    const project = { framework: 'react', features: ['scoring', 'controls'], latestCode: 'export default function App() {}' };
    const response = '```html\n<html><body><canvas></canvas><script>let score = 0;</script></body></html>\n```';
    const result = scoreContinuity({ project, response, userPrompt: 'make the snake speed up gradually' });
    expect(result.checks['preserved-framework']).toBe(false);
    expect(result.checks['used-previous-implementation']).toBe(false);
  });
});

describe('mergeResponse', () => {
  it('appends a continuation fragment to the original', () => {
    const merged = mergeResponse('The game uses requestAnimationFrame for the loop because', ' of its smooth timing.', 'truncation');
    expect(merged).toContain('because of its smooth timing');
  });

  it('completes an open fence with raw code', () => {
    const merged = mergeResponse('```jsx\nfunction App() { return (', '  <div>Hi</div> );\n}', 'truncation');
    expect(merged).toContain('<div>Hi</div>');
  });

  it('keeps the original when the repair repeats it', () => {
    const original = 'The complete answer with enough length to matter.';
    const merged = mergeResponse(original, original + ' extra', 'truncation');
    expect(merged).toContain('extra');
  });
});

describe('processResponse', () => {
  it('repairs a truncated answer through the injected generator', async () => {
    const generate = vi.fn(async () => ({ content: ' handles input and renders the score.' }));
    const messages = [{ role: 'user', content: 'build a game' }];
    const original = 'Here is the game code:\n\n```jsx\nfunction App() { return null; }\n```\n\nThe game loop updates every frame and';
    const result = await processResponse(messages, original, {
      userPrompt: 'build a game',
      generate,
      maxRepairs: 2
    });
    expect(result.diagnostics.repaired).toBe(true);
    expect(result.diagnostics.repairAttempts).toBe(1);
    expect(result.diagnostics.truncationDetected).toBe(false);
    expect(result.content).toContain('handles input and renders the score');
  });

  it('does not repair a complete answer', async () => {
    const generate = vi.fn();
    const complete = 'Here is the full answer, ending properly.';
    const result = await processResponse([{ role: 'user', content: 'hi' }], complete, {
      userPrompt: 'hi',
      generate,
      maxRepairs: 2
    });
    expect(generate).not.toHaveBeenCalled();
    expect(result.diagnostics.repaired).toBe(false);
    expect(result.content).toBe(complete);
  });

  it('discards a meta-only repair instead of stitching self-referential commentary', async () => {
    // The model answered the continuation request with "My previous reply was
    // already complete..." — the guard must keep the original and stop
    // repairing rather than pollute the reply with the meta text.
    const generate = vi.fn(async () => ({ content: 'My previous reply was already complete — it was a single greeting sentence with nothing to continue.' }));
    const original = 'This is a reasonably long sentence that starts fine but ends with';
    const result = await processResponse([{ role: 'user', content: 'x' }], original, {
      userPrompt: 'x',
      generate,
      maxRepairs: 2
    });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(result.diagnostics.repaired).toBe(false);
    expect(result.content).toBe(original.trim());
    expect(result.content).not.toContain('already complete');
  });

  it('never delivers trailing continuation meta-commentary in the final answer', async () => {
    const cleaned = stripMetaCommentary('Hello there.My previous response was already complete and no continuation is needed.');
    expect(cleaned).toBe('Hello there.');
    expect(stripMetaCommentary('The previous reply was already complete — nothing to continue.')).toBe('');
    const code = '```html\n<div>done</div>\n```\nThat covers it.';
    expect(stripMetaCommentary(code)).toBe(code);
  });

  it('strips the "continuation check" boilerplate spam to nothing past the real answer', () => {
    // Regression: asking "what is the ai engine of corez?" once produced the
    // identity line followed by pages of "No partial file..." boilerplate.
    const spam =
      "No partial file or open document exists in this session to continue, so nothing further can be appended.\n" +
      "## Status\n- **Session content** — Only a short greeting exchange exists.\n" +
      "## Next Steps\nShare the partial file or paste the last lines you received and I will continue directly from that exact point.\n" +
      "</script>\n</body>\n</html>";
    expect(stripMetaCommentary(`I'm Corez 1.0 built by Corez. How can I help you today?${spam}`)).toBe(
      "I'm Corez 1.0 built by Corez. How can I help you today?",
    );
    expect(stripMetaCommentary(`## Continuation Status\n\nNo stopping point to resume from, so there is no point to resume from.`)).toBe('');
    expect(stripMetaCommentary('Nothing further to append and all structures are already closed.')).toBe('');
    // Legit content mentioning engines must survive untouched.
    const legit = 'The chess ai engine evaluates positions with minimax.';
    expect(stripMetaCommentary(legit)).toBe(legit);
  });

  it('classifies short meta-commentary replies as meta-only', () => {
    expect(isMetaOnlyReply('My previous reply was already complete — nothing to continue.')).toBe(true);
    expect(isMetaOnlyReply('The response is already complete, no continuation needed.')).toBe(true);
    expect(isMetaOnlyReply('<html><body>real content</body></html>')).toBe(false);
    // A longer reply with substantive content is not meta-only.
    const longReply = 'Here is the full updated implementation. '.repeat(30);
    expect(isMetaOnlyReply(`${longReply}My previous reply was already complete.`)).toBe(false);
  });

  it('strips trailing meta-commentary during continuation stitching', () => {
    const stitched = stitchContinuationChunk('The game ends here.', 'The game ends here.My previous reply was already complete — nothing left to continue.');
    expect(stitched.stitched).toBe('The game ends here.');
  });

  it('respects the repair attempt ceiling', async () => {
    // Each repair keeps the answer truncated (ends on a conjunction), so the
    // loop must hit the ceiling instead of spinning.
    const generate = vi.fn(async () => ({ content: ' and' }));
    const result = await processResponse([{ role: 'user', content: 'x' }], 'This is a reasonably long sentence that starts fine but ends with', {
      userPrompt: 'x',
      generate,
      maxRepairs: 2
    });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(result.diagnostics.repairAttempts).toBe(2);
  });

  it('reports syntax validation diagnostics', async () => {
    const result = await processResponse([{ role: 'user', content: 'x' }], '```js\nfunction broken( {\n```', {
      userPrompt: 'x',
      generate: null,
      maxRepairs: 0
    });
    expect(result.diagnostics.validation.syntax.length).toBe(1);
    expect(result.diagnostics.validation.syntax[0].ok).toBe(false);
  });

  it('repairs a wrong-language answer', async () => {
    const generate = vi.fn(async () => ({ content: 'This is the complete answer in English.' }));
    const russian = 'Это змейка. Игрок управляет змеёй с помощью стрелок. Счёт увеличивается при поедании еды.';
    const result = await processResponse([{ role: 'user', content: 'build a game' }], russian, {
      userPrompt: 'build me a snake game',
      generate,
      maxRepairs: 2
    });
    expect(result.diagnostics.languageMismatch).toBe(false);
    expect(result.content).toContain('complete answer in English');
  });

  it('repairs a modification reply that omitted the code', async () => {
    const generate = vi.fn(async () => ({
      content: '```jsx\nexport default function App() {\n  const [score, setScore] = useState(0);\n  return <canvas onKeyDown={onKey} />;\n}\n```'
    }));
    const project = { framework: 'react', features: ['scoring', 'controls'] };
    const result = await processResponse([{ role: 'user', content: 'Add touch controls' }], 'I added touch controls to the game. Swipe anywhere to steer.', {
      userPrompt: 'Add touch controls for mobile',
      project,
      generate,
      maxRepairs: 2
    });
    expect(result.diagnostics.missingCodeForModification).toBe(false);
    expect(result.diagnostics.repaired).toBe(true);
    expect(result.diagnostics.repairReasons).toContain('missing-code-for-modification');
    expect(result.content).toContain('jsx');
  });

  it('stitches a truncated game response across continuation passes until fully closed', async () => {
    // Simulates the user's Neon Labyrinth raycaster game that was cut off at `const srd = (my *`
    const part1 = "Here's **NEON LABYRINTH**:\n```html\n<!DOCTYPE html><html><body><canvas id=\"g\"></canvas><script>let x = 0;\nconst srd = (my *";
    const part2 = "Math.sin(angle));\nfunction update() { requestAnimationFrame(update); }\nupdate();\n</script></body></html>\n```";

    const generate = vi.fn(async () => ({
      content: part2,
      stopReason: 'stop'
    }));

    const result = await processResponse([{ role: 'user', content: 'build a 3d raycaster maze game' }], part1, {
      userPrompt: 'build a 3d raycaster maze game',
      generate,
      maxRepairs: 4
    });

    expect(result.diagnostics.repaired).toBe(true);
    expect(result.diagnostics.truncationDetected).toBe(false);
    expect(result.content).toContain('const srd = (my *Math.sin(angle));');
    expect(result.content).toContain('</html>');
  });
});

describe('stitchContinuationChunk', () => {
  it('stitches text when continuation continues inline mid-expression', () => {
    const orig = 'const srd = (my *';
    const cont = ' Math.sin(angle));';
    const { stitched, deltaText } = stitchContinuationChunk(orig, cont);
    expect(stitched).toBe('const srd = (my * Math.sin(angle));');
    expect(deltaText).toBe(' Math.sin(angle));');
  });

  it('deduplicates prefix overlap when model repeats the last token slice', () => {
    const orig = 'function loop() { const srd = (my *';
    const cont = 'const srd = (my * Math.sin(angle)); }';
    const { stitched, deltaText, overlapLength } = stitchContinuationChunk(orig, cont);
    expect(overlapLength).toBeGreaterThan(0);
    expect(stitched).toBe('function loop() { const srd = (my * Math.sin(angle)); }');
    expect(deltaText).toBe(' Math.sin(angle)); }');
  });

  it('strips redundant code fences if model restarts with ```html inside an open fence', () => {
    const orig = '```html\n<!DOCTYPE html><html><body><script>const a = 1;';
    const cont = '```html\nconst b = 2;\n</script></body></html>\n```';
    const { stitched, deltaText } = stitchContinuationChunk(orig, cont);
    expect(stitched).toBe('```html\n<!DOCTYPE html><html><body><script>const a = 1;const b = 2;\n</script></body></html>\n```');
    expect(deltaText).toBe('const b = 2;\n</script></body></html>\n```');
  });

  it('strips continuation chatter preamble', () => {
    const orig = 'const speed = 5;';
    const cont = 'Continuing the code:\nconst score = 10;';
    const { stitched } = stitchContinuationChunk(orig, cont);
    expect(stitched).toContain('const score = 10;');
    expect(stitched).not.toContain('Continuing the code:');
  });
});
