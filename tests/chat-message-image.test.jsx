// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import ChatMessage from '../src/components/ChatMessage.jsx';

afterEach(() => {
  cleanup();
});

describe('ChatMessage image rendering', () => {
  it('renders a FLUX image served from the worker R2 relative asset URL', () => {
    const content = 'Here is your generated image:\n\n![a black rose](/api/assets/flux_12345.png)';
    render(<ChatMessage message={{ role: 'assistant', content }} />);

    const img = screen.getByAltText('a black rose');
    expect(img).toHaveAttribute('src', '/api/assets/flux_12345.png');
  });

  it('renders https image URLs', () => {
    const content = '![cat](https://example.com/cat.png)';
    render(<ChatMessage message={{ role: 'assistant', content }} />);

    expect(screen.getByAltText('cat')).toHaveAttribute('src', 'https://example.com/cat.png');
  });

  it('renders base64 PNG data URLs from Workers AI FLUX output', () => {
    const content = '![castle](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==)';
    render(<ChatMessage message={{ role: 'assistant', content }} />);

    expect(screen.getByAltText('castle')).toHaveAttribute('src', expect.stringContaining('data:image/png;base64,'));
  });

  it('renders the fallback SVG badge data URL', () => {
    const content = '![fallback](data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3C%2Fsvg%3E)';
    render(<ChatMessage message={{ role: 'assistant', content }} />);

    expect(screen.getByAltText('fallback')).toHaveAttribute('src', expect.stringContaining('data:image/svg+xml'));
  });

  it('does not render javascript:, protocol-relative, or ftp: URLs', () => {
    const content = '![bad](javascript:alert(1)) ![bad2](//evil.example.com/x.png) ![bad3](ftp://x/y.png)';
    render(<ChatMessage message={{ role: 'assistant', content }} />);

    const imgs = document.querySelectorAll('img');
    expect(imgs.length).toBeGreaterThanOrEqual(1);
    imgs.forEach((img) => {
      const src = img.getAttribute('src') || '';
      expect(src).not.toContain('javascript:');
      expect(src).not.toContain('//evil');
      expect(src).not.toContain('ftp://');
    });
  });

  it('renders a rounded LinkedIn icon beside LinkedIn profile links', () => {
    const content = '**Corez was created by [Zayne Mundo](https://www.linkedin.com/in/zayne-mundo/) and [Christian Vestil](https://www.linkedin.com/in/christian-jericson-belderol/)**';
    render(<ChatMessage message={{ role: 'assistant', content }} />);

    const link = screen.getByRole('link', { name: /Zayne Mundo/i });
    expect(link).toHaveAttribute('href', 'https://www.linkedin.com/in/zayne-mundo/');
    expect(link).toHaveAttribute('target', '_blank');

    const icons = document.querySelectorAll('.linkedin-icon');
    expect(icons.length).toBe(2);
    expect(icons[0]).toHaveClass('linkedin-icon');
  });

  it('does not add a LinkedIn icon to non-LinkedIn links', () => {
    const content = 'Learn more at [corez.pro](https://corez.pro)';
    render(<ChatMessage message={{ role: 'assistant', content }} />);

    expect(document.querySelectorAll('.linkedin-icon').length).toBe(0);
  });
});
