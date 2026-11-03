// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import ChatMessage from '../src/components/ChatMessage.jsx';

afterEach(() => {
  cleanup();
});

const content = `## Fix details

| Change | Location | Reason |
|---|---|---|
| \`cw = mmW \\|\\| 120\` fallbacks | \`refreshMinimap()\` | Hidden canvas returns 0 |
| Escape \\| pipe | Code \`a|b\` | Preserved inside a cell |`;

describe('ChatMessage markdown tables', () => {
  it('does not split escaped or inline-code pipes into extra columns', () => {
    const { container } = render(
      <ChatMessage message={{ role: 'assistant', content }} />,
    );

    const rows = container.querySelectorAll('.markdown-table tbody tr');
    expect(rows).toHaveLength(2);
    rows.forEach((row) => {
      expect(row.querySelectorAll('td')).toHaveLength(3);
    });
    expect(container.textContent).toContain('cw = mmW || 120');
    expect(container.textContent).toContain('a|b');
  });
});
