// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, fireEvent, screen, cleanup, act, waitFor } from '@testing-library/react';
import CanvasPreview from '../src/components/CanvasPreview.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function withFakeIframeWindow(container) {
  const iframe = container.querySelector('iframe');
  const fakeWindow = { name: 'fake-preview-window' };
  Object.defineProperty(iframe, 'contentWindow', { value: fakeWindow, configurable: true });
  return fakeWindow;
}

function renderPreview(code = '<!DOCTYPE html><html><body><h1>Hi</h1></body></html>') {
  return render(
    <CanvasPreview
      code={code}
      title="Test"
      onClose={() => {}}
      isFullScreen={false}
      onToggleFullScreen={() => {}}
    />
  );
}

function postPreviewError(fakeWindow, data) {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { source: fakeWindow, data }));
  });
}

describe('CanvasPreview runtime error surfacing', () => {
  it('shows a reported runtime error with its location and dismisses it', () => {
    const { container } = renderPreview();
    const fakeWindow = withFakeIframeWindow(container);

    postPreviewError(fakeWindow, {
      type: 'corez-preview-error',
      kind: 'error',
      message: 'columns is not defined',
      source: 'app.js',
      line: 12
    });

    const banner = screen.getByRole('alert');
    expect(banner.textContent).toContain('Preview runtime error');
    expect(banner.textContent).toContain('columns is not defined');
    expect(banner.textContent).toContain('app.js:12');

    fireEvent.click(screen.getByLabelText('Dismiss preview error'));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('labels resource and CSP failures distinctly', () => {
    const first = renderPreview();
    const firstWindow = withFakeIframeWindow(first.container);
    postPreviewError(firstWindow, {
      type: 'corez-preview-error',
      kind: 'resource',
      message: 'Failed to load https://unpkg.com/missing.js',
      source: 'https://unpkg.com/missing.js',
      line: 0
    });
    expect(screen.getByRole('alert').textContent).toContain('Preview asset failed to load');
    cleanup();

    const second = renderPreview();
    const secondWindow = withFakeIframeWindow(second.container);
    postPreviewError(secondWindow, {
      type: 'corez-preview-error',
      kind: 'csp',
      message: 'Blocked by script-src: https://cdn.example/a.js'
    });
    expect(screen.getByRole('alert').textContent).toContain('Blocked by security policy');
  });

  it('ignores error messages from other windows', () => {
    renderPreview();

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          source: { name: 'some-other-window' },
          data: { type: 'corez-preview-error', kind: 'error', message: 'not ours' }
        })
      );
    });

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('clears the error when the code changes', () => {
    const { container, rerender } = renderPreview('<!DOCTYPE html><html><body>A</body></html>');
    const fakeWindow = withFakeIframeWindow(container);
    postPreviewError(fakeWindow, {
      type: 'corez-preview-error',
      kind: 'error',
      message: 'old failure'
    });
    expect(screen.getByRole('alert')).toBeTruthy();

    rerender(
      <CanvasPreview
        code="<!DOCTYPE html><html><body>B</body></html>"
        title="Test"
        onClose={() => {}}
        isFullScreen={false}
        onToggleFullScreen={() => {}}
      />
    );

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('copies the error text for a repair follow-up', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true
    });
    const { container } = renderPreview();
    const fakeWindow = withFakeIframeWindow(container);
    postPreviewError(fakeWindow, {
      type: 'corez-preview-error',
      kind: 'error',
      message: 'boom',
      source: 'app.js',
      line: 3
    });

    fireEvent.click(screen.getByText('Copy'));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toContain('Preview runtime error: boom');
    expect(writeText.mock.calls[0][0]).toContain('app.js:3');
    await waitFor(() => expect(screen.getByText('Copied ✓')).toBeTruthy());
  });
});
