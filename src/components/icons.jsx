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
      <path d="M3.63 1.5 A2.16 2.16 0 0 0 1.48 3.66 L1.48 16.5 C2.6 16.9 3.6 17.6 4.48 18 L4.48 20.81 L6.38 22.97 L7.55 21.94 L12.19 17.06" />
      <path d="M3.63 1.5 L20.32 1.5 A2.16 2.16 0 0 0 22.48 3.66 L22.48 10.88 L22.41 10.97" />
      <path d="M19.48 13.88 L19.48 20.81" />
      <path d="M15.98 17.34 L22.97 17.34" />
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
