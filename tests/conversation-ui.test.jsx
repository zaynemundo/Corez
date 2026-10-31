// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Sidebar from '../src/components/Sidebar.jsx';
import ChatMessage from '../src/components/ChatMessage.jsx';
import ChatInput from '../src/components/ChatInput.jsx';
import ConversationSetupModal from '../src/components/ConversationSetupModal.jsx';
import { I18nProvider } from '../src/i18n/index.jsx';
import { conversationSpeakersForPrompt } from '../src/hooks/useConversationTurnExecution.js';

const personas = [
  { id: 'p1', name: 'John', handle: 'john', instructions: 'Warm.' },
  { id: 'p2', name: 'Scarlett', handle: 'scarlett', instructions: 'Bright.' },
];

const sessions = [
  {
    id: 'normal-1',
    title: 'Normal chat',
    chatMode: 'single',
    messages: [{ role: 'user', content: 'hi' }],
    updatedAt: 2,
  },
  {
    id: 'conversation-1',
    title: 'Studio lighting',
    chatMode: 'conversation',
    personas,
    active: true,
    lastUserAt: Date.now(),
    messages: [{ role: 'user', content: 'hello' }],
    updatedAt: 1,
  },
];

function renderSidebar(overrides = {}) {
  const handlers = {
    onSelectSession: vi.fn(),
    onNewChat: vi.fn(),
    onNewConversation: vi.fn(),
    onOpenSites: vi.fn(),
    onOpenSettings: vi.fn(),
    onDeleteSession: vi.fn(),
    onShareSession: vi.fn(),
    onTogglePinSession: vi.fn(),
    onReorderSession: vi.fn(),
  };
  const view = render(
    <I18nProvider>
      <Sidebar
        isOpen
        sessions={sessions}
        activeSessionId={null}
        activeView="chat"
        {...handlers}
        {...overrides}
      />
    </I18nProvider>,
  );
  return { ...handlers, container: view.container };
}

describe('conversation UI', () => {
  it('offers Conversation next to New Chat and lists one Messages row per conversation', async () => {
    const user = userEvent.setup();
    const handlers = renderSidebar();

    await user.click(screen.getByRole("button", { name: "Conversation" }));
    expect(handlers.onNewConversation).toHaveBeenCalledTimes(1);

    const messages = handlers.container.querySelector('#sidebar-messages-list');
    expect(within(messages).getByText('Studio lighting')).toBeTruthy();
    expect(within(messages).getByText('Active')).toBeTruthy();
    expect(within(messages).queryByText('Normal chat')).toBeNull();

    const recents = handlers.container.querySelector('#sidebar-chats-list');
    expect(within(recents).getByText('Normal chat')).toBeTruthy();
    expect(within(recents).queryByText('Studio lighting')).toBeNull();
  });

  it('keeps an empty Messages list silent', () => {
    const { container } = renderSidebar({ sessions: [sessions[0]] });
    const messages = container.querySelector('#sidebar-messages-list');
    expect(messages).toBeTruthy();
    expect(messages.textContent.trim()).toBe('');
    expect(within(container).queryByText('No conversations yet')).toBeNull();
  });

  it('renders named AI bubbles for a conversation message', () => {
    render(
      <I18nProvider>
        <ChatMessage
          message={{
            role: 'assistant',
            content: 'Hey, how are you?',
            speakerId: 'p1',
            speakerName: 'John',
          }}
        />
      </I18nProvider>,
    );
    expect(screen.getByText('John')).toBeTruthy();
    expect(document.querySelector('.message-wrapper.conversation')).toBeTruthy();
  });

  it('renames a persona and regenerates its mention handle', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <ConversationSetupModal
        personas={personas}
        onSave={onSave}
        onClose={() => {}}
      />,
    );

    const first = screen.getAllByPlaceholderText('John')[0];
    await user.clear(first);
    await user.type(first, 'Ryan');
    await user.click(screen.getByRole('button', { name: 'Save personas' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0][0]).toMatchObject({
      name: 'Ryan',
      handle: 'ryan',
    });
  });

  it('routes @mentions to one persona and defaults to both', () => {
    expect(
      conversationSpeakersForPrompt(personas, 'hey @john').map((p) => p.name),
    ).toEqual(['John']);
    expect(
      conversationSpeakersForPrompt(personas, 'hello').map((p) => p.name),
    ).toEqual(['John', 'Scarlett']);
    expect(
      conversationSpeakersForPrompt(personas, 'hello @stranger').map(
        (p) => p.name,
      ),
    ).toEqual(['John', 'Scarlett']);
  });

  it('accepts an empty conversation placeholder and skips command suggestions', async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider>
        <ChatInput
          input=""
          setInput={() => {}}
          onSendMessage={() => {}}
          placeholder=""
          commandSuggestions={false}
        />
      </I18nProvider>,
    );
    const input = screen.getByRole('textbox', { name: /message/i });
    expect(input.getAttribute('placeholder')).toBe('');

    await user.type(input, '@ryan');
    expect(screen.queryByRole('listbox', { name: /commands/i })).toBeNull();
  });
});
