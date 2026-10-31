// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LocationPermission from '../src/components/LocationPermission.jsx';
import {
  clearLocationAccess,
  formatLocationContext,
  locationFromPosition,
  locationPromptContext,
  readLocationAccess,
  saveLocationAccess,
} from '../src/services/locationAccess.js';

describe('location consent storage', () => {
  beforeEach(() => localStorage.clear());

  it('stores and clears the browser-only decision', () => {
    saveLocationAccess({
      status: 'granted',
      decidedAt: 1,
      location: { latitude: 25.2048, longitude: 55.2708, accuracy: 40 },
    });
    expect(readLocationAccess()).toMatchObject({ status: 'granted' });
    clearLocationAccess();
    expect(readLocationAccess()).toBeNull();
  });

  it('rounds coordinates and includes the timezone', () => {
    const context = formatLocationContext({
      latitude: 25.2048,
      longitude: 55.2708,
      accuracy: 40,
    });
    expect(context).toContain('25.20');
    expect(context).toContain('55.27');
    expect(context).toContain('timezone');
    expect(locationPromptContext({ latitude: 25.2, longitude: 55.27 })).toContain(
      'Use it only when',
    );
  });

  it('normalizes a browser position', () => {
    expect(
      locationFromPosition({
        coords: { latitude: 25.2048, longitude: 55.2708, accuracy: 32.6 },
      }),
    ).toMatchObject({
      latitude: 25.2048,
      longitude: 55.2708,
      accuracy: 33,
    });
  });
});

describe('location permission prompt', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (success) =>
          success({
            coords: { latitude: 25.2048, longitude: 55.2708, accuracy: 50 },
          }),
      },
    });
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: { query: vi.fn(async () => ({ state: 'prompt' })) },
    });
  });

  afterEach(() => {
    clearLocationAccess();
  });

  it('asks once, then resolves a usable location context', async () => {
    const user = userEvent.setup();
    const onResolved = vi.fn();
    render(<LocationPermission onResolved={onResolved} />);

    expect(await screen.findByText('Use your location?')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Allow' }));

    await waitFor(() => expect(onResolved).toHaveBeenCalledTimes(1));
    expect(onResolved.mock.calls[0][0]).toContain('25.20');
    expect(readLocationAccess()?.status).toBe('granted');
    await waitFor(() =>
      expect(screen.queryByText('Use your location?')).toBeNull(),
    );
  });

  it('remembers Not now without asking again', async () => {
    const user = userEvent.setup();
    const onResolved = vi.fn();
    const { unmount } = render(<LocationPermission onResolved={onResolved} />);
    expect(await screen.findByText('Use your location?')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Not now' }));
    expect(readLocationAccess()?.status).toBe('denied');
    unmount();

    render(<LocationPermission onResolved={onResolved} />);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(screen.queryByText('Use your location?')).toBeNull();
  });
});
