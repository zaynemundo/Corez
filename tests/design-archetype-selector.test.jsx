// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/react';
import DesignArchetypeSelector from '../src/components/DesignArchetypeSelector.jsx';

afterEach(cleanup);

describe('DesignArchetypeSelector Component', () => {
  it('renders with active archetype name and badge', () => {
    render(<DesignArchetypeSelector activeArchetypeId="linear-dark" />);
    expect(screen.getByText('Linear Dark Minimal')).toBeDefined();
    expect(screen.getByRole('button', { name: /Design style: Linear Dark Minimal/i })).toBeDefined();
  });

  it('opens archetype dropdown list on click and selects a new archetype', () => {
    const handleSelect = vi.fn();
    render(<DesignArchetypeSelector activeArchetypeId="linear-dark" onSelectArchetype={handleSelect} />);

    const badgeBtn = screen.getByRole('button', { name: /Design style: Linear Dark Minimal/i });
    fireEvent.click(badgeBtn);

    expect(screen.getByText('Design System Archetypes')).toBeDefined();
    expect(screen.getByText('Apple Spatial Glass')).toBeDefined();
    expect(screen.getByText('Cyberpunk Neon Arcade')).toBeDefined();

    const appleOption = screen.getByText('Apple Spatial Glass');
    fireEvent.click(appleOption);

    expect(handleSelect).toHaveBeenCalledWith('apple-glass');
  });
});
