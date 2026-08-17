// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ChatMessage, { extractClarificationOptions } from '../src/components/ChatMessage.jsx';

afterEach(() => {
  cleanup();
});

describe('extractClarificationOptions', () => {
  it('extracts bullet options following a clarifying question', () => {
    const text = `I can build this for you! Which style of game would you prefer?
- **Space Shooter** — classic 2D retro arcade action
- **Platformer** — jump and run with coins
- **Puzzle Game** — grid-based matching mechanics`;

    const options = extractClarificationOptions(text);
    expect(options).toHaveLength(3);
    expect(options[0].label).toBe('Space Shooter');
    expect(options[0].detail).toBe('classic 2D retro arcade action');
    expect(options[1].label).toBe('Platformer');
    expect(options[2].label).toBe('Puzzle Game');
  });

  it('extracts numbered options following a question', () => {
    const text = `What kind of layout would you like for your portfolio?
1. **Minimalist** — clean typography and lots of whitespace
2. **Modern Grid** — dynamic cards with hover effects
3. **Interactive 3D** — WebGL effects and smooth scrolling`;

    const options = extractClarificationOptions(text);
    expect(options).toHaveLength(3);
    expect(options[0].label).toBe('Minimalist');
    expect(options[1].label).toBe('Modern Grid');
    expect(options[2].label).toBe('Interactive 3D');
  });

  it('extracts explicit [option: ...] or [choice: ...] tags', () => {
    const text = `Please choose one of the following directions:
[option: Dark Mode Dashboard: dark glassmorphism with real-time charts]
[option: Light Mode Minimal: clean white editorial aesthetic]`;

    const options = extractClarificationOptions(text);
    expect(options).toHaveLength(2);
    expect(options[0].label).toBe('Dark Mode Dashboard');
    expect(options[0].detail).toBe('dark glassmorphism with real-time charts');
    expect(options[1].label).toBe('Light Mode Minimal');
  });

  it('returns empty array when content contains a full code build or has no question', () => {
    const codeResponse = `Here is your code:
\`\`\`jsx
export default function App() {
  return <div>App</div>;
}
\`\`\`
- bullet 1
- bullet 2`;
    expect(extractClarificationOptions(codeResponse)).toHaveLength(0);

    const normalList = `Here is a summary:
- Item 1
- Item 2`;
    expect(extractClarificationOptions(normalList)).toHaveLength(0);
  });
});

describe('ChatMessage Clarification Chips UI', () => {
  it('renders clickable clarification option chips and triggers onSelectOption', () => {
    const onSelectOption = vi.fn();
    const message = {
      role: 'assistant',
      content: `What type of website do you want to create?
- **E-Commerce Store** — product catalog, cart and checkout
- **Portfolio Showcase** — project gallery with dark mode
- **SaaS Landing Page** — features, pricing table and testimonials`
    };

    render(
      <ChatMessage
        message={message}
        onSelectOption={onSelectOption}
      />
    );

    expect(screen.getByRole('group', { name: 'Clarification options' })).toBeTruthy();
    expect(screen.getByText('Suggested options:')).toBeTruthy();

    const storeBtn = screen.getByRole('button', { name: 'Select option: E-Commerce Store' });
    expect(storeBtn).toBeTruthy();

    fireEvent.click(storeBtn);
    expect(onSelectOption).toHaveBeenCalledTimes(1);
    expect(onSelectOption).toHaveBeenCalledWith('E-Commerce Store — product catalog, cart and checkout');
  });

  it('does not render clarification options on user messages', () => {
    const message = {
      role: 'user',
      content: `What should I build?
- Option A
- Option B`
    };

    render(<ChatMessage message={message} />);
    expect(screen.queryByRole('group', { name: 'Clarification options' })).toBeNull();
  });
});
