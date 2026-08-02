// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import CanvasPreview from '../src/components/CanvasPreview.jsx';

const SAMPLE_CODE = '<!DOCTYPE html><html><body><h1>Test App</h1></body></html>';

function iframeFor(mode) {
  return screen.getByTitle(`Live Application Preview (${mode})`);
}

function deviceButton(title) {
  return screen.getAllByTitle(title)[0];
}

function renderPreview() {
  return render(
    <CanvasPreview code={SAMPLE_CODE} title="Test" onClose={() => {}} isFullScreen={false} onToggleFullScreen={() => {}} />
  );
}

describe('CanvasPreview device viewports', () => {
  it('renders the desktop viewport with a fluid iframe by default', () => {
    renderPreview();
    const iframe = iframeFor('Desktop');
    expect(iframe).toBeTruthy();
    expect(iframe.style.width).toBe('');
    expect(iframe.style.aspectRatio).toBe('');
  });

  it('applies a real device width and aspect ratio for mobile', () => {
    renderPreview();
    fireEvent.click(deviceButton('Mobile View (375 × 812)'));
    const iframe = iframeFor('Mobile');
    expect(iframe.style.width).toBe('375px');
    expect(iframe.style.aspectRatio).toBe('375 / 812');
    expect(iframe.style.height).toBe('auto');
    expect(iframe.style.maxHeight).toBe('');
  });

  it('applies tablet dimensions when selected', () => {
    renderPreview();
    fireEvent.click(deviceButton('Tablet View (768 × 1024)'));
    const iframe = iframeFor('Tablet');
    expect(iframe.style.width).toBe('768px');
    expect(iframe.style.aspectRatio).toBe('3 / 4');
  });

  it('applies laptop dimensions when selected', () => {
    renderPreview();
    fireEvent.click(deviceButton('Laptop View (1366 × 768)'));
    const iframe = iframeFor('Laptop');
    expect(iframe.style.width).toBe('1100px');
    expect(iframe.style.aspectRatio).toBe('16 / 9');
  });

  it('switches back to a fluid desktop frame', () => {
    const { container } = renderPreview();
    fireEvent.click(deviceButton('Mobile View (375 × 812)'));
    fireEvent.click(deviceButton('Desktop Screen View'));
    const iframe = container.querySelector('iframe');
    expect(iframe.style.width).toBe('');
    expect(iframe.style.aspectRatio).toBe('');
  });
});
