// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Landing from '../src/pages/Landing.jsx';

afterEach(cleanup);

function renderLanding() {
  return render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>,
  );
}

describe('public landing page', () => {
  it('renders the value proposition and the primary calls to action', () => {
    renderLanding();
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.textContent).toMatch(/Describe it/);
    expect(heading.textContent).toMatch(/Watch it build/);
    expect(heading.textContent).toMatch(/Share it/);
    expect(screen.getByRole('button', { name: /Build something free/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /See pricing/i })).toBeTruthy();
  });

  it('describes real capabilities and states the free plan honestly', () => {
    renderLanding();
    expect(screen.getAllByText('@game').length).toBeGreaterThan(0);
    expect(screen.getAllByText('@research').length).toBeGreaterThan(0);
    expect(screen.getByText(/Publish a link in one click/i)).toBeTruthy();
    expect(screen.getByText(/Free plan: 20 generations a month/i)).toBeTruthy();
  });

  it('answers common questions without inventing claims', () => {
    renderLanding();
    expect(
      screen.getByText(/Free plan includes 20 generations a month, one project and publishing/i),
    ).toBeTruthy();
    expect(screen.getByText(/paid plans remove the badge/i)).toBeTruthy();
    expect(screen.getByText(/download as a ZIP/i)).toBeTruthy();
  });

  it('links to pricing and sign-in from the navigation', () => {
    renderLanding();
    expect(screen.getAllByRole('button', { name: /Pricing/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /Sign in/i }).length).toBeGreaterThan(0);
  });
});
