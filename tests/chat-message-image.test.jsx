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
    const content = '**Corez was created by [Zayne Mundo](https://www.linkedin.com/in/zayne-mundo/), [Christian Vestil](https://www.linkedin.com/in/christian-jericson-belderol/), and [Renz Cardona](https://www.linkedin.com/in/renz-cardona-5941051b9/)**';
    render(<ChatMessage message={{ role: 'assistant', content }} />);

    const link = screen.getByRole('link', { name: /Zayne Mundo/i });
    expect(link).toHaveAttribute('href', 'https://www.linkedin.com/in/zayne-mundo/');
    expect(link).toHaveAttribute('target', '_blank');

    const icons = document.querySelectorAll('.linkedin-icon');
    expect(icons.length).toBe(3);
    expect(icons[0]).toHaveClass('linkedin-icon');

    const firstLink = screen.getByRole('link', { name: /Zayne Mundo/i });
    expect(firstLink.firstChild).toHaveClass('linkedin-icon');
    expect(firstLink).toHaveTextContent('Zayne Mundo');
  });

  it('does not add a LinkedIn icon to non-LinkedIn links', () => {
    const content = 'Learn more at [corez.pro](https://corez.pro)';
    render(<ChatMessage message={{ role: 'assistant', content }} />);

    expect(document.querySelectorAll('.linkedin-icon').length).toBe(0);
  });

  it('opens a fullscreen image modal when clicking an image or fullscreen button', () => {
    const content = '![a futuristic city](https://example.com/city.png)';
    render(<ChatMessage message={{ role: 'assistant', content }} />);

    const fullscreenBtn = screen.getByRole('button', { name: 'View fullscreen' });
    expect(fullscreenBtn).toBeTruthy();

    const { fireEvent } = require('@testing-library/react');
    fireEvent.click(fullscreenBtn);

    const dialog = screen.getByRole('dialog', { name: 'a futuristic city' });
    expect(dialog).toBeTruthy();
    expect(screen.getAllByText('a futuristic city').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('button', { name: 'Download image' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Exit fullscreen' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();

    // Exit Fullscreen button dismisses modal
    const exitBtn = screen.getByRole('button', { name: 'Exit fullscreen' });
    fireEvent.click(exitBtn);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('triggers download when clicking the download button', () => {
    const content = '![neon car](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==)';
    render(<ChatMessage message={{ role: 'assistant', content }} />);

    const { fireEvent } = require('@testing-library/react');
    fireEvent.click(screen.getByRole('button', { name: 'View fullscreen' }));
    expect(screen.getByRole('dialog')).toBeTruthy();

    const downloadBtn = screen.getByRole('button', { name: 'Download image' });
    expect(downloadBtn).toBeTruthy();
    fireEvent.click(downloadBtn);
  });

  it('closes fullscreen image modal on Escape key', () => {
    const content = '![cyberpunk](https://example.com/cyber.png)';
    render(<ChatMessage message={{ role: 'assistant', content }} />);

    const { fireEvent } = require('@testing-library/react');
    fireEvent.click(screen.getByRole('button', { name: 'View fullscreen' }));
    expect(screen.getByRole('dialog')).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
