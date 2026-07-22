import { useState, useEffect } from 'react';

const PIPELINE_STEPS = [
  { min: 0, max: 15, label: '1. Intent Detection' },
  { min: 15, max: 30, label: '2. Full-Width Game Dev Loading UI' },
  { min: 30, max: 48, label: '3. Generating Assets via FLUX 1 (Cloudflare AI)' },
  { min: 48, max: 68, label: '4. Game Synthesizer Engine (Canvas & Physics)' },
  { min: 68, max: 84, label: '5. MiMo V2.5 Visual Inspection & Layering Audit' },
  { min: 84, max: 96, label: '6. Final Touches & Fallback Verification' },
  { min: 96, max: 100, label: '7. Launching Live Canvas' }
];

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
  const currentStep = PIPELINE_STEPS.find(s => displayPercent >= s.min && displayPercent <= s.max) || PIPELINE_STEPS[0];

  return (
    <div className="square-worm-progress-container" role="status" aria-live="polite">
      {/* Pipeline Step Header */}
      <div className="square-worm-header" style={{ justifyContent: 'space-between' }}>
        <span className="square-worm-step-label" style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
          {currentStep.label}
        </span>
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
