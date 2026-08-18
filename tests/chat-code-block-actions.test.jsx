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

  it('still renders the Copy button for non-executable snippets', () => {
    const content = 'Example:\n\n```js\nfunction greet(name) { return `Hello ${name}`; }\n```';
    renderAssistant(content);

    expect(screen.getByRole('button', { name: /^Copy$/i })).toBeInTheDocument();
  });
});
