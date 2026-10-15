// @vitest-environment jsdom
// A dead file link inside the preview (href names an asset that was never
// bundled) is reported as `corez-download-missing`: the canvas must name the
// missing file instead of leaving a dead click, and offer a fix prompt.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, fireEvent, screen, cleanup, act } from '@testing-library/react';
import CanvasPreview from '../src/components/CanvasPreview.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderPreview(code = '<!DOCTYPE html><html><body><h1>Hi</h1></body></html>') {
  return render(
    <CanvasPreview
      code={code}
      title="Test"
      onClose={() => {}}
      isFullScreen={false}
      onToggleFullScreen={() => {}}
    />,
  );
}

function withFakeIframeWindow(container) {
  const iframe = container.querySelector('iframe');
  const fakeWindow = { name: 'fake-preview-window' };
  Object.defineProperty(iframe, 'contentWindow', { value: fakeWindow, configurable: true });
  return fakeWindow;
}

function postFromPreview(fakeWindow, data) {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { source: fakeWindow, data }));
  });
}

describe('CanvasPreview missing-download notice', () => {
  it('names the missing file and dismisses', () => {
    const { container } = renderPreview();
    const fakeWindow = withFakeIframeWindow(container);
    expect(screen.queryByText(/is not bundled with this preview/)).toBeNull();

    postFromPreview(fakeWindow, {
      type: 'corez-download-missing',
      href: 'report.pdf',
      name: 'report.pdf',
    });

    const banner = screen.getByRole('alert');
    expect(banner.textContent).toContain('Download unavailable');
    expect(banner.textContent).toContain('"report.pdf" is not bundled');

    fireEvent.click(screen.getByLabelText('Dismiss download notice'));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('ignores messages that do not come from its own iframe', () => {
    const { container } = renderPreview();
    withFakeIframeWindow(container);
    postFromPreview(
      { name: 'stranger-window' },
      { type: 'corez-download-missing', name: 'evil.pdf' },
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('copies a fix prompt for Corez', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    const { container } = renderPreview();
    const fakeWindow = withFakeIframeWindow(container);
    postFromPreview(fakeWindow, {
      type: 'corez-download-missing',
      name: 'invoice.pdf',
    });

    fireEvent.click(screen.getByText('Copy fix for Corez'));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toContain('invoice.pdf');
    expect(writeText.mock.calls[0][0]).toContain('data: URL');
  });
});
