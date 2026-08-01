/**
 * Custom ChatGPT-style sidebar icons.
 *
 * Stroke-based line icons with rounded caps matching the ChatGPT sidebar
 * aesthetic: a signature rounded-square chat bubble with a sparkle for
 * conversations, plus clean minimal plus/trash glyphs.
 */

function iconProps(size, strokeWidth) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true
  };
}

export function ChatSparkleIcon({ size = 20, strokeWidth = 1.5 }) {
  return (
    <svg {...iconProps(size, strokeWidth)}>
      <rect x="3" y="3.5" width="18" height="17" rx="5" />
      <path d="M12 7.2l1.1 3.7 3.7 1.1-3.7 1.1L12 16.8l-1.1-3.7L7.2 12l3.7-1.1z" />
    </svg>
  );
}

export function PlusIcon({ size = 20, strokeWidth = 1.5 }) {
  return (
    <svg {...iconProps(size, strokeWidth)}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

export function TrashIcon({ size = 12, strokeWidth = 1.5 }) {
  return (
    <svg {...iconProps(size, strokeWidth)}>
      <path d="M4 7h16" />
      <path d="M10 7V5.5A1.5 1.5 0 0 1 11.5 4h1A1.5 1.5 0 0 1 14 5.5V7" />
      <path d="M6.5 7l.7 11a2 2 0 0 0 2 1.9h5.6a2 2 0 0 0 2-1.9l.7-11" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}
