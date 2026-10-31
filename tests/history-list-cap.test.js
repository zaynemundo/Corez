import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve('src/index.css'), 'utf8');

function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  return match?.[1] || '';
}

describe('sidebar history list caps', () => {
  it('shows five Recents rows and scrolls the rest', () => {
    const block = rule('.sidebar-chats-list');
    expect(block).toContain('max-height: calc(5 * var(--sidebar-item-min-height)');
    expect(block).toContain('overflow-y: auto');
    expect(block).toContain('scrollbar-width: none');
  });

  it('shows five Messages conversations and scrolls the rest', () => {
    const block = rule('.sidebar-messages-list');
    expect(block).toContain(
      'max-height: calc(5 * var(--sidebar-item-min-height)',
    );
    expect(block).toContain('overflow-y: auto');
    expect(block).toContain('scrollbar-width: none');
  });
});
