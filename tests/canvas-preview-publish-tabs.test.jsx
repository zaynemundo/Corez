// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup, act } from '@testing-library/react';
import React from 'react';
import CanvasPreview from '../src/components/CanvasPreview.jsx';

vi.mock('../src/services/appStorageService', () => ({
  publishAppInR2: vi.fn(() => Promise.resolve({ success: true, slug: 'test-slug-123', url: '/test-slug-123', customized: false }))
}));

afterEach(cleanup);

describe('CanvasPreview Publish Tabs (Link, QR Code, Embed)', () => {
  it('switches between Link, QR Code, and Embed tabs in the publish modal', async () => {
    render(
      <CanvasPreview
        code="<h1>My App</h1>"
        title="My App"
        onClose={() => {}}
        isFullScreen={false}
        onToggleFullScreen={() => {}}
      />
    );

    const publishBtn = screen.getByRole('button', { name: 'Publish' });
    await act(async () => {
      fireEvent.click(publishBtn);
    });

    // Share modal is open
    expect(screen.getByText('Your creation is live')).toBeDefined();
    expect(screen.getByRole('button', { name: /Share Link/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /QR Code/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Embed Code/i })).toBeDefined();

    // Default is link view
    expect(screen.getByLabelText('Published share link')).toBeDefined();

    // Switch to QR Code tab
    const qrTabBtn = screen.getByRole('button', { name: /QR Code/i });
    fireEvent.click(qrTabBtn);
    expect(screen.getByText(/Scan with your phone's camera/i)).toBeDefined();

    // Switch to Embed Code tab
    const embedTabBtn = screen.getByRole('button', { name: /Embed Code/i });
    fireEvent.click(embedTabBtn);
    expect(screen.getByLabelText('Embed iframe HTML')).toBeDefined();
    expect(screen.getByRole('button', { name: /Copy Embed Code/i })).toBeDefined();
  });
});
