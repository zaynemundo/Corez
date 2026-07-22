import { useState, useEffect } from 'react';

export default function ProgressChecklist() {
  const [progressPercent, setProgressPercent] = useState(6);

  useEffect(() => {
    const timer = setInterval(() => {
      setProgressPercent(prev => {
        if (prev < 65) {
          return prev + Math.random() * 1.5 + 0.6;
        } else if (prev < 88) {
          return prev + Math.random() * 0.6 + 0.25;
        } else if (prev < 98.5) {
          return prev + Math.random() * 0.15 + 0.05;
        }
        return prev;
      });
    }, 220);

    return () => clearInterval(timer);
  }, []);

  const displayPercent = Math.min(Math.round(progressPercent), 99);

  return (
    <div className="square-worm-progress-container" role="status" aria-live="polite">
      {/* Percentage-only header */}
      <div className="square-worm-header">
        <span className="square-worm-percentage">{displayPercent}%</span>
      </div>

      {/* 100% Message Body Width Progress Track with 8-Bit Square Worm getting longer */}
      <div className="square-worm-track-wrapper">
        <div className="square-worm-track-bg" />

        {/* Crawling 8-Bit Square Worm Head Wrapper getting longer */}
        <div 
          className="square-worm-head-wrapper" 
          style={{ width: `${Math.min(progressPercent, 100)}%` }}
        >
          <div className="square-worm-body">
            <span className="worm-pixel seg-tail" />
            <span className="worm-pixel seg-mid" />
            <span className="worm-pixel seg-head">
              <span className="worm-eye" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
