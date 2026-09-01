import { useState, useEffect } from "react";

const PIPELINE_STEPS = [
  { min: 0, max: 12, label: "1. Intent & Spec Synthesis (DeepSeek Lead)" },
  { min: 12, max: 25, label: "2. Full-Width 8-Bit Progress Loading Track" },
  {
    min: 25,
    max: 40,
    label: "3. Asset Pipeline (Generated Art + WebAudio Synth)",
  },
  { min: 40, max: 58, label: "4. High-Performance Engine & Physics Assembly" },
  { min: 58, max: 74, label: "5. Visual Inspection & Layering Audit" },
  { min: 74, max: 88, label: "6. Multi-Input Controls (WASD / Touch / D-Pad)" },
  { min: 88, max: 96, label: "7. Empirical Runtime & Fallback Verification" },
  { min: 96, max: 100, label: "8. Launching Live Canvas Sandbox" },
];

export default function ProgressChecklist() {
  const [progressPercent, setProgressPercent] = useState(6);

  useEffect(() => {
    const timer = setInterval(() => {
      setProgressPercent((prev) => {
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
  const currentStep =
    PIPELINE_STEPS.find(
      (s) => displayPercent >= s.min && displayPercent <= s.max,
    ) || PIPELINE_STEPS[0];

  return (
    <div
      className="progress-checklist-container"
      role="status"
      aria-live="polite"
    >
      {/* Pipeline Step Header */}
      <div
        className="progress-checklist-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span
          className="progress-checklist-step-label"
          style={{
            fontSize: "0.75rem",
            fontFamily: "var(--font-mono)",
            color: "var(--text-secondary)",
          }}
        >
          {currentStep.label}
        </span>
        <span className="progress-checklist-percentage">{displayPercent}%</span>
      </div>

      {/* Clean Linear Progress Track */}
      <div className="progress-checklist-track-wrapper">
        <div className="progress-checklist-track-bg" />
        <div
          className="progress-checklist-fill"
          style={{ width: `${Math.min(progressPercent, 100)}%` }}
        />
      </div>
    </div>
  );
}
