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

export function ChatBubbleIcon({ size = 20, strokeWidth = 1.5 }) {
  return (
    <svg {...iconProps(size, strokeWidth)}>
      <path d="M4.15 2.02 A2.16 2.16 0 0 0 1.99 4.17 L1.99 15.42 C2.3 16.5 3.1 17.6 4.99 18 L4.99 20.91 L6.42 22.97 L8.16 20.91 L12 16.13" />
      <path d="M4.15 2.02 L19.85 2.02 A2.16 2.16 0 0 0 22.01 4.17 L22.01 10.97" />
      <path d="M19.01 13.03 L19.01 20.91" />
      <path d="M15 16.97 L23.02 16.97" />
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
