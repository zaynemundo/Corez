// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import SafeEmbed from '../src/components/SafeEmbed.jsx';
import { resolveEmbed, isAllowedEmbedSrc, EMBED_SANDBOX } from '../src/utils/embedHosts.js';
import { saveConsent } from '../src/services/consentService.js';

beforeEach(() => {
  try {
    window.localStorage.clear();
  } catch {
    /* ignore */
  }
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('safe third-party embeds', () => {
  it('blocks the third party until the visitor chooses to load it', () => {
    const { container } = render(
      <SafeEmbed url="https://www.youtube.com/watch?v=dQw4w9WgXcQ" title="Demo video" />,
    );

    expect(container.querySelector('iframe')).toBeNull();
    expect(screen.getByRole('button', { name: /load embed/i })).toBeTruthy();
    expect(screen.getByText(/stays blocked until you choose to load it/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /load embed/i }));

    const iframe = container.querySelector('iframe');
    expect(iframe).toBeTruthy();
    expect(iframe.getAttribute('src')).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0',
    );
    expect(iframe.getAttribute('sandbox')).toBe(EMBED_SANDBOX);
    expect(iframe.getAttribute('sandbox')).not.toMatch(/allow-top-navigation/);
    expect(iframe.getAttribute('referrerpolicy')).toBe('strict-origin-when-cross-origin');
    expect(iframe.getAttribute('title')).toBe('Demo video');
    expect(iframe.getAttribute('loading')).toBe('lazy');
  });

  it('loads immediately when the embeds category was already allowed', () => {
    saveConsent({ embeds: true }, { source: 'banner' });
    const { container } = render(
      <SafeEmbed url="https://vimeo.com/123456789" title="Vimeo clip" />,
    );
    const iframe = container.querySelector('iframe');
    expect(iframe.getAttribute('src')).toBe('https://player.vimeo.com/video/123456789?dnt=1');
  });

  it('never renders an embed from an unlisted host or a dangerous scheme', () => {
    const cases = [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'http://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://evil.example.com/embed/dQw4w9WgXcQ',
      'https://www.youtube.com.evil.example/watch?v=dQw4w9WgXcQ',
      'https://www.youtube.com/watch?v=short',
    ];
    for (const url of cases) {
      expect(resolveEmbed(url), url).toBeNull();
      expect(isAllowedEmbedSrc(url), url).toBe(false);
    }

    const { container } = render(
      <SafeEmbed url="https://evil.example.com/embed/abc" title="Nope" />,
    );
    expect(container.querySelector('iframe')).toBeNull();
    expect(screen.getByText(/not from an allowed provider/i)).toBeTruthy();
  });

  it('drops tracking parameters instead of forwarding the original URL', () => {
    const resolved = resolveEmbed(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&si=tracker&feature=share&utm_source=news',
    );
    expect(resolved.src).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0');
    expect(resolved.src).not.toMatch(/si=|utm_|feature=/);

    const withStart = resolveEmbed('https://youtu.be/dQw4w9WgXcQ?t=42s&si=tracker');
    expect(withStart.src).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&start=42');
  });

  it('accepts only embed-shaped Maps URLs', () => {
    expect(
      resolveEmbed('https://www.google.com/maps/embed?pb=!1m18!2m3!1d1!2d2!3d3')?.src,
    ).toContain('https://www.google.com/maps/embed?pb=');
    expect(resolveEmbed('https://www.google.com/maps/place/Dubai')).toBeNull();
  });

  it('can remember the choice for every future embed', () => {
    const { container } = render(
      <SafeEmbed url="https://www.youtube.com/watch?v=dQw4w9WgXcQ" title="Demo" />,
    );
    fireEvent.click(screen.getByRole('button', { name: /always allow embeds/i }));
    expect(container.querySelector('iframe')).toBeTruthy();

    cleanup();
    const second = render(
      <SafeEmbed url="https://www.youtube.com/watch?v=dQw4w9WgXcQ" title="Second" />,
    );
    expect(second.container.querySelector('iframe')).toBeTruthy();
  });

  it('unloads the frame when consent is withdrawn', () => {
    saveConsent({ embeds: true }, { source: 'banner' });
    const { container } = render(
      <SafeEmbed url="https://www.youtube.com/watch?v=dQw4w9WgXcQ" title="Demo" />,
    );
    expect(container.querySelector('iframe')).toBeTruthy();

    act(() => {
      saveConsent({ embeds: false }, { source: 'preferences' });
    });
    expect(container.querySelector('iframe')).toBeNull();
    expect(screen.getByRole('button', { name: /load embed/i })).toBeTruthy();
  });
});
