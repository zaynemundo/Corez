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

describe('ChatMessage Clarification Suggestions UI', () => {
  it('renders suggestions list and triggers onSelectOption on option click', () => {
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

    expect(screen.getByRole('region', { name: 'Suggested options' })).toBeTruthy();
    expect(screen.getByText('Suggestions')).toBeTruthy();

    const storeBtn = screen.getByRole('option', { name: 'Select: E-Commerce Store - product catalog, cart and checkout' });
    expect(storeBtn).toBeTruthy();

    fireEvent.click(storeBtn);
    expect(onSelectOption).toHaveBeenCalledTimes(1);
    expect(onSelectOption).toHaveBeenCalledWith('E-Commerce Store — product catalog, cart and checkout');
  });

  it('provides a typable Other option to send custom responses', () => {
    const onSelectOption = vi.fn();
    const message = {
      role: 'assistant',
      content: `Which style of game do you want?
- **Space Shooter** — arcade shooter
- **Platformer** — jump and run`
    };

    render(
      <ChatMessage
        message={message}
        onSelectOption={onSelectOption}
      />
    );

    const otherBtn = screen.getByRole('button', { name: 'Other: Type your own custom response' });
    expect(otherBtn).toBeTruthy();

    fireEvent.click(otherBtn);

    const input = screen.getByPlaceholderText('Type your custom response...');
    expect(input).toBeTruthy();

    fireEvent.change(input, { target: { value: 'A 3D flying simulator with cockpit view' } });
    const sendBtn = screen.getByRole('button', { name: 'Send custom response' });
    fireEvent.click(sendBtn);

    expect(onSelectOption).toHaveBeenCalledTimes(1);
    expect(onSelectOption).toHaveBeenCalledWith('A 3D flying simulator with cockpit view');
  });

  it('allows cancelling the typable Other input', () => {
    const message = {
      role: 'assistant',
      content: `Which game do you want?
- **Game A** — details
- **Game B** — details`
    };

    render(<ChatMessage message={message} />);

    fireEvent.click(screen.getByRole('button', { name: 'Other: Type your own custom response' }));
    expect(screen.getByPlaceholderText('Type your custom response...')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByPlaceholderText('Type your custom response...')).toBeNull();
    expect(screen.getByRole('button', { name: 'Other: Type your own custom response' })).toBeTruthy();
  });

  it('caps suggestion options to maximum of 3 plus 1 typable Other option', () => {
    const message = {
      role: 'assistant',
      content: `What kind of dashboard would you like?
- **Analytics** — metrics and KPIs
- **Finance** — ledger and revenue
- **Operations** — server status and logs
- **Marketing** — campaign performance
- **Sales** — pipeline and deals`
    };

    render(<ChatMessage message={message} />);

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(3); // Exactly 3 suggestions
    expect(screen.getByRole('button', { name: 'Other: Type your own custom response' })).toBeTruthy(); // Plus 1 typable Other
  });

  it('does not render clarification suggestions on user messages', () => {
    const message = {
      role: 'user',
      content: `What should I build?
- Option A
- Option B`
    };

    render(<ChatMessage message={message} />);
    expect(screen.queryByRole('region', { name: 'Suggested options' })).toBeNull();
  });
});
