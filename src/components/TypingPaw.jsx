const PAW_ROWS = [
  '....X...X....',
  '...X.X.X.X...',
  '...XXX.XXX...',
  '...P.P.P.P...',
  '...XXX.XXX...',
  '.....XXX.....',
  '....PPPPP....',
  '...PPPPPPP...',
  '..XXXXXXXXX..',
  '.XXXXXXXXXXX.',
  '..XXXXXXXXX..'
];

const CELL = 4;

const PIXELS = PAW_ROWS.flatMap((row, y) => (
  [...row].map((cell, x) => {
    if (cell === '.') return null;
    return (
      <rect
        key={`${x}-${y}`}
        x={x * CELL}
        y={y * CELL}
        width={CELL}
        height={CELL}
        fill={cell === 'P' ? '#e99298' : '#ffffff'}
      />
    );
  }).filter(Boolean)
));

export default function TypingPaw() {
  return (
    <div className="typing-paw" role="status" aria-label="Corez is typing">
      <svg className="typing-paw__svg" viewBox="0 0 120 80" aria-hidden="true">
        <g transform="translate(24 16)">
          <g className="typing-paw__paw">{PIXELS}</g>
        </g>
        <rect className="typing-paw__pill" x="52" y="46" width="66" height="26" rx="13" />
        <g transform="translate(24 16)">
          <g className="typing-paw__paw typing-paw__paw--front">{PIXELS}</g>
        </g>
      </svg>
      <span className="typing-paw__label">Corez is typing...</span>
    </div>
  );
}
