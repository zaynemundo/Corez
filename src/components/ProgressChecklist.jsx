import { useState, useEffect } from 'react';

const PIPELINE_STEPS = [
  { min: 0, max: 12, label: '1. Intent & Spec Synthesis (DeepSeek Lead)' },
  { min: 12, max: 25, label: '2. Full-Width 8-Bit Progress Loading Track' },
  { min: 25, max: 40, label: '3. Asset Pipeline (FLUX 1 Art + WebAudio Synth)' },
  { min: 40, max: 58, label: '4. High-Performance Engine & Physics Assembly' },
  { min: 58, max: 74, label: '5. MiMo V2.5 Visual Inspection & Layering Audit' },
  { min: 74, max: 88, label: '6. Multi-Input Controls (WASD / Touch / D-Pad)' },
  { min: 88, max: 96, label: '7. Empirical Runtime & Fallback Verification' },
  { min: 96, max: 100, label: '8. Launching Live Canvas Sandbox' }
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
        return Math.min(prev, 100);
      });
    }, 220);

    return () => clearInterval(timer);
  }, []);

  const displayPercent = Math.min(Math.round(progressPercent), 100);
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
