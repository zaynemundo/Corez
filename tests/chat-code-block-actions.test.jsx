// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import ChatMessage from '../src/components/ChatMessage.jsx';

afterEach(() => {
  cleanup();
});

function renderAssistant(content) {
  return render(
    <ChatMessage
      message={{ role: 'assistant', content }}
      onRunInCanvas={() => {}}
      onReviseCode={() => {}}
    />
  );
}

describe('ChatMessage code block actions', () => {
  it('shows Open Canvas Preview and Revise for a full HTML app', () => {
    const content = 'Here is your app:\n\n```html\n<!DOCTYPE html>\n<html>\n<head><style>body { color: red; }</style></head>\n<body><h1>App</h1></body>\n</html>\n```';
    renderAssistant(content);

    expect(screen.getByRole('button', { name: /Open Canvas Preview/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Revise/i })).toBeInTheDocument();
  });

  it('shows Open Canvas Preview and Revise for a React/JSX component', () => {
    const content = 'Here is your component:\n\n```jsx\nexport default function App() {\n  return <div>Hello</div>;\n}\n```';
    renderAssistant(content);

    expect(screen.getByRole('button', { name: /Open Canvas Preview/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Revise/i })).toBeInTheDocument();
  });

  it('does not show preview actions for a generic JS snippet in an informational answer', () => {
    const content = 'Here is a quick example:\n\n```js\nfunction greet(name) {\n  return `Hello ${name}`;\n}\n```\n\nHope this helps!';
    renderAssistant(content);

    expect(screen.queryByRole('button', { name: /Open Canvas Preview/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Revise/i })).not.toBeInTheDocument();
  });

  it('does not show preview actions for an import statement example', () => {
    const content = 'You can import it like this:\n\n```js\nimport { readFileSync } from "node:fs";\n```';
    renderAssistant(content);

    expect(screen.queryByRole('button', { name: /Open Canvas Preview/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Revise/i })).not.toBeInTheDocument();
  });

  it('does not show preview actions for a small HTML fragment example', () => {
    const content = 'A link looks like this:\n\n```html\n<a href="https://example.com">Example</a>\n```';
    renderAssistant(content);

    expect(screen.queryByRole('button', { name: /Open Canvas Preview/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Revise/i })).not.toBeInTheDocument();
  });

  it('does not show preview actions for an embed snippet echoed in an informational answer', () => {
    const content = 'You can embed it like this:\n\n```html\n<div id="player"></div>\n<script src="https://www.youtube.com/iframe_api"></script>\n<script>\n  new YT.Player("player");\n</script>\n```\n\nHope that helps!';
    renderAssistant(content);

    expect(screen.queryByRole('button', { name: /Open Canvas Preview/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Revise/i })).not.toBeInTheDocument();
  });

  it('shows preview actions for an HTML app whose block has no language tag', () => {
    const content = 'Here you go:\n\n```\n<!DOCTYPE html>\n<html>\n<body><h1>App</h1></body>\n</html>\n```';
    renderAssistant(content);

    expect(screen.getByRole('button', { name: /Open Canvas Preview/i })).toBeInTheDocument();
  });

  it('shows Open Canvas Preview and Revise for a multi-page website with PAGE markers', () => {
    const content = 'Here is your multi-page website:\n\n```html\n<!-- PAGE: index.html -->\n<!DOCTYPE html>\n<html><body><h1>Home</h1></body></html>\n<!-- PAGE: about.html -->\n<!DOCTYPE html>\n<html><body><h1>About</h1></body></html>\n```';
    renderAssistant(content);

    expect(screen.getByRole('button', { name: /Open Canvas Preview/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Revise/i })).toBeInTheDocument();
    // Does NOT render the raw code pre block
    expect(screen.queryByText(/Home/i)?.tagName).not.toBe('CODE');
  });

  it('shows Open Canvas Preview and Revise for an HTML app with leading comments', () => {
    const content = 'Here is your app:\n\n```html\n<!-- Single page concept -->\n<!DOCTYPE html>\n<html><body><h1>App</h1></body></html>\n```';
    renderAssistant(content);

    expect(screen.getByRole('button', { name: /Open Canvas Preview/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Revise/i })).toBeInTheDocument();
  });

  it('merges marker-separated page fences into ONE multi-page block for preview', () => {
    // The model often emits one fence per page with the PAGE markers
    // BETWEEN the fences. The chat must merge them into a single block so
    // Open Canvas Preview runs the whole site (a lone page would render
    // with dead nav links -> blank pages).
    const content = `Here is your portfolio:

<!-- PAGE: index.html -->
\`\`\`html
<!DOCTYPE html>
<html><body><nav><a href="about.html">About</a></nav><h1>Home</h1></body></html>
\`\`\`

<!-- PAGE: about.html -->
\`\`\`html
<!DOCTYPE html>
<html><body><h1>About Us</h1></body></html>
\`\`\`
`;
    let ranCode = null;
    render(
      <ChatMessage
        message={{ role: 'assistant', content }}
        onRunInCanvas={(code) => { ranCode = code; }}
        onReviseCode={() => {}}
      />
    );

    // Exactly ONE preview action bar for the merged site.
    expect(screen.getAllByRole('button', { name: /Open Canvas Preview/i })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /Revise/i })).toHaveLength(1);

    screen.getByRole('button', { name: /Open Canvas Preview/i }).click();
    expect(ranCode).toContain('<!-- PAGE: index.html -->');
    expect(ranCode).toContain('<!-- PAGE: about.html -->');
    expect(ranCode).toContain('<h1>Home</h1>');
    expect(ranCode).toContain('<h1>About Us</h1>');
  });

  it('still renders the Copy button for non-executable snippets', () => {
    const content = 'Example:\n\n```js\nfunction greet(name) { return `Hello ${name}`; }\n```';
    renderAssistant(content);

    expect(screen.getByRole('button', { name: /^Copy$/i })).toBeInTheDocument();
  });

  it('triggers onRunInCanvas when Open Canvas Preview button is clicked', () => {
    let ranCode = null;
    const content = '```html\n<!DOCTYPE html>\n<html><body><h1>App</h1></body></html>\n```';
    render(
      <ChatMessage
        message={{ role: 'assistant', content }}
        onRunInCanvas={(code) => { ranCode = code; }}
        onReviseCode={() => {}}
      />
    );

    const previewBtn = screen.getByRole('button', { name: /Open Canvas Preview/i });
    previewBtn.click();
    expect(ranCode).toContain('<!DOCTYPE html>');
  });

  it('triggers onReviseCode when Revise button is clicked', () => {
    let revisedCode = null;
    const content = '```html\n<!DOCTYPE html>\n<html><body><h1>App</h1></body></html>\n```';
    render(
      <ChatMessage
        message={{ role: 'assistant', content }}
        onRunInCanvas={() => {}}
        onReviseCode={(code) => { revisedCode = code; }}
      />
    );

    const reviseBtn = screen.getByRole('button', { name: /Revise/i });
    reviseBtn.click();
    expect(revisedCode).toContain('<!DOCTYPE html>');
  });

  it('shows Open Canvas Preview and Revise for canvas games with getContext', () => {
    const content = 'Here is your game:\n\n```html\n<canvas id="game" width="800" height="600"></canvas>\n<script>\nconst ctx = document.getElementById("game").getContext("2d");\nfunction loop() { requestAnimationFrame(loop); }\nloop();\n</script>\n```';
    renderAssistant(content);

    expect(screen.getByRole('button', { name: /Open Canvas Preview/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Revise/i })).toBeInTheDocument();
  });

  it('shows Open Canvas Preview and Revise for an unfenced multi-page portfolio site', () => {
    let ranCode = null;
    const content = `I'll extract Christian's information from the resume and build an Awwwards-inspired dark glassmorphism portfolio. Let me create this.

Fullscreen
<!-- PAGE: index.html -->
<!DOCTYPE html>
<html lang="en">
<head><title>Portfolio</title></head>
<body><h1>Christian Vestil</h1></body>
</html>
<!-- PAGE: about.html -->
<!DOCTYPE html>
<html><body><h1>About</h1></body></html>`;

    render(
      <ChatMessage
        message={{ role: 'assistant', content }}
        onRunInCanvas={(code) => { ranCode = code; }}
        onReviseCode={() => {}}
      />
    );

    expect(screen.getByText(/I'll extract Christian's information/i)).toBeInTheDocument();
    const previewBtn = screen.getByRole('button', { name: /Open Canvas Preview/i });
    expect(previewBtn).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Revise/i })).toBeInTheDocument();

    previewBtn.click();
    expect(ranCode).toContain('<!-- PAGE: index.html -->');
    expect(ranCode).toContain('<!-- PAGE: about.html -->');
  });

  it('shows Open Canvas Preview and Revise for an unfenced full HTML document', () => {
    let ranCode = null;
    const content = `Here is your website:\n\n<!DOCTYPE html>\n<html lang="en"><head><title>Site</title></head><body><h1>Hello World</h1></body></html>`;

    render(
      <ChatMessage
        message={{ role: 'assistant', content }}
        onRunInCanvas={(code) => { ranCode = code; }}
        onReviseCode={() => {}}
      />
    );

    const previewBtn = screen.getByRole('button', { name: /Open Canvas Preview/i });
    expect(previewBtn).toBeInTheDocument();
    previewBtn.click();
    expect(ranCode).toContain('<!DOCTYPE html>');
  });
});
