import { useState } from 'react';
import { Palette, Check, Sparkles, X, ChevronDown } from 'lucide-react';
import { DESIGN_ARCHETYPES } from '../../packages/agent-core/designSystems/archetypes.js';

export default function DesignArchetypeSelector({
  activeArchetypeId = 'linear-dark',
  onSelectArchetype,
  compact = false
}) {
  const [isOpen, setIsOpen] = useState(false);
  const activeArchetype = DESIGN_ARCHETYPES[activeArchetypeId] || DESIGN_ARCHETYPES['linear-dark'];

  const archetypesList = Object.values(DESIGN_ARCHETYPES);

  return (
    <div className="design-archetype-selector-wrapper" style={{ position: 'relative' }}>
      <button
        type="button"
        className="design-archetype-badge-btn"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-label={`Design style: ${activeArchetype.name}`}
        title={`Active Design System: ${activeArchetype.name}. Click to switch archetype.`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: compact ? '3px 8px' : '4px 10px',
          background: 'var(--bg-tertiary, #181922)',
          border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
          borderRadius: 'var(--radius-sm, 6px)',
          color: 'var(--text-primary, #f3f4f6)',
          fontSize: '0.75rem',
          fontWeight: 500,
          cursor: 'pointer',
          transition: 'all 0.15s ease'
        }}
      >
        <Palette size={13} style={{ color: activeArchetype.tokens['--accent'] || 'var(--accent, #3b82f6)' }} />
        <span>{activeArchetype.name}</span>
        <ChevronDown size={11} style={{ opacity: 0.6, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
      </button>

      {isOpen && (
        <>
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 90
            }}
            onClick={() => setIsOpen(false)}
          />
          <div
            role="dialog"
            aria-label="Select Design Archetype"
            className="design-archetype-dropdown"
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              right: 0,
              width: '320px',
              maxWidth: '90vw',
              background: 'var(--bg-primary, #090a0f)',
              border: '1px solid var(--border-highlight, rgba(255, 255, 255, 0.16))',
              borderRadius: 'var(--radius-md, 10px)',
              boxShadow: 'var(--shadow-elevated, 0 16px 40px rgba(0, 0, 0, 0.6))',
              padding: '12px',
              zIndex: 100
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary, #ffffff)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Sparkles size={13} style={{ color: 'var(--accent, #3b82f6)' }} />
                Design System Archetypes
              </span>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setIsOpen(false)}
                title="Close"
                aria-label="Close"
                style={{ padding: '2px', background: 'transparent', border: 'none', color: 'var(--text-muted)' }}
              >
                <X size={13} />
              </button>
            </div>

            <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #9ca3af)', marginBottom: '10px', lineHeight: 1.4 }}>
              Production-grade typography, HSL palettes, and micro-interactions powered by Open-Design standards.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '280px', overflowY: 'auto' }}>
              {archetypesList.map((archetype) => {
                const isSelected = archetype.id === activeArchetypeId;
                const accentColor = archetype.tokens['--accent'] || '#3b82f6';
                return (
                  <div
                    key={archetype.id}
                    onClick={() => {
                      if (onSelectArchetype) onSelectArchetype(archetype.id);
                      setIsOpen(false);
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        if (onSelectArchetype) onSelectArchetype(archetype.id);
                        setIsOpen(false);
                      }
                    }}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      padding: '8px 10px',
                      borderRadius: 'var(--radius-sm, 6px)',
                      border: isSelected ? `1px solid ${accentColor}` : '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
                      background: isSelected ? 'rgba(59, 130, 246, 0.12)' : 'var(--bg-secondary, #111218)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary, #ffffff)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span
                          style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            backgroundColor: accentColor,
                            display: 'inline-block'
                          }}
                        />
                        {archetype.name}
                      </span>
                      {isSelected && <Check size={13} style={{ color: accentColor }} />}
                    </div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary, #9ca3af)', lineHeight: 1.3 }}>
                      {archetype.description}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
