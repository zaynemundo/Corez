// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import PluginStoreModal from '../src/components/PluginStoreModal';
import { resetPluginsToDefault } from '../src/services/pluginService';

describe('PluginStoreModal Component', () => {
  beforeEach(() => {
    localStorage.clear();
    resetPluginsToDefault();
  });

  afterEach(() => {
    cleanup();
  });

  it('should render modal when isOpen is true', () => {
    render(
      <PluginStoreModal
        isOpen={true}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText(/Corez Plugin Ecosystem/i)).toBeTruthy();
    expect(screen.getByText(/Installed/i)).toBeTruthy();
    expect(screen.getByText(/Marketplace/i)).toBeTruthy();
    expect(screen.getByText(/Developer Studio/i)).toBeTruthy();
  });

  it('should switch between tabs', () => {
    render(
      <PluginStoreModal
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    // Click Marketplace tab
    const marketplaceTab = screen.getByRole('button', { name: /Marketplace/i });
    fireEvent.click(marketplaceTab);
    expect(screen.getByPlaceholderText(/Search plugins/i)).toBeTruthy();

    // Click Developer Studio tab
    const devTab = screen.getByRole('button', { name: /Developer Studio/i });
    fireEvent.click(devTab);
    expect(screen.getByText(/Create Custom Plugin/i)).toBeTruthy();
  });

  it('should allow toggling plugin state', () => {
    render(
      <PluginStoreModal
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    const toggleButtons = screen.getAllByRole('button', { name: /Disable|Enable|Enabled|Disabled/i });
    expect(toggleButtons.length).toBeGreaterThan(0);
    fireEvent.click(toggleButtons[0]);
  });

  it('should call onClose when close button is clicked', () => {
    const handleClose = vi.fn();
    render(
      <PluginStoreModal
        isOpen={true}
        onClose={handleClose}
      />
    );

    const closeBtn = screen.getByTitle(/Close Plugin Store/i);
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalled();
  });
});

