import { useState, useEffect } from 'react';
import { CheckCircle2, Loader2, Circle, Sparkles, Wand2, Gamepad2, Code2, MessageSquare } from 'lucide-react';

const STEP_PRESETS = {
  game: [
    { id: 1, label: 'Analyzing game rules, layout & mechanics' },
    { id: 2, label: 'Routing UI & 8-bit art direction' },
    { id: 3, label: 'Rendering 8-bit backgrounds & dictionary verification' },
    { id: 4, label: 'Compiling JavaScript engine & canvas controls' },
    { id: 5, label: 'Launching live canvas preview' }
  ],
  app: [
    { id: 1, label: 'Understanding app architecture & user requirements' },
    { id: 2, label: 'Synthesizing visual design & components' },
    { id: 3, label: 'Injecting responsive styling & interactivity' },
    { id: 4, label: 'Preparing production-ready HTML experience' }
  ],
  image: [
    { id: 1, label: 'Parsing prompt parameters & composition' },
    { id: 2, label: 'Routing to visual artwork engine' },
    { id: 3, label: 'Rendering high-resolution visual art' },
    { id: 4, label: 'Finalizing visual output' }
  ],
  code: [
    { id: 1, label: 'Analyzing code architecture & stack trace' },
    { id: 2, label: 'Identifying root cause & edge cases' },
    { id: 3, label: 'Synthesizing verified solution & fix' }
  ],
  general: [
    { id: 1, label: 'Analyzing intent & scope' },
    { id: 2, label: 'Consulting Capability Orchestrator' },
    { id: 3, label: 'Synthesizing response & recommendations' }
  ]
};

export default function ProgressChecklist({ taskType = 'general', customTitle = null }) {
  const steps = STEP_PRESETS[taskType] || STEP_PRESETS.general;
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [progressPercent, setProgressPercent] = useState(15);

  useEffect(() => {
    const totalSteps = steps.length;
    const intervalTime = Math.max(650, Math.min(1300, 3600 / totalSteps));

    const timer = setInterval(() => {
      setCurrentStepIndex(prev => {
        if (prev < totalSteps - 1) {
          const next = prev + 1;
          const targetPercent = Math.round(((next + 1) / totalSteps) * 92);
          setProgressPercent(targetPercent);
          return next;
        }
        setProgressPercent(98);
        return prev;
      });
    }, intervalTime);

    return () => clearInterval(timer);
  }, [steps.length]);

  const getHeaderIcon = () => {
    switch (taskType) {
      case 'game':
        return <Gamepad2 className="progress-header-icon game-icon" />;
      case 'app':
        return <Wand2 className="progress-header-icon app-icon" />;
      case 'image':
        return <Sparkles className="progress-header-icon image-icon" />;
      case 'code':
        return <Code2 className="progress-header-icon code-icon" />;
      default:
        return <MessageSquare className="progress-header-icon general-icon" />;
    }
  };

  return (
    <div className={`progress-checklist-card task-${taskType}`} role="status" aria-live="polite">
      <div className="progress-card-header">
        <div className="progress-header-left">
          <div className="progress-icon-badge">
            {getHeaderIcon()}
          </div>
          <div className="progress-header-text">
            <span className="progress-header-title">
              {customTitle || (taskType === 'game' ? 'Building 8-Bit Game' : taskType === 'image' ? 'Generating Visual Artwork' : taskType === 'app' ? 'Building Application' : 'Processing Request')}
            </span>
            <span className="progress-header-subtitle">
              Step {currentStepIndex + 1} of {steps.length}
            </span>
          </div>
        </div>
        <div className="progress-badge-wrapper">
          <span className="progress-percent-badge">{progressPercent}%</span>
        </div>
      </div>

      <div className="progress-bar-track">
        <div 
          className="progress-bar-fill"
          style={{ width: `${progressPercent}%` }}
        >
          <div className="progress-shimmer-glow" />
        </div>
      </div>

      <ul className="progress-checklist-items">
        {steps.map((step, idx) => {
          const isDone = idx < currentStepIndex;
          const isCurrent = idx === currentStepIndex;

          return (
            <li 
              key={step.id} 
              className={`progress-step-item ${isDone ? 'done' : ''} ${isCurrent ? 'active' : ''}`}
            >
              <div className="step-icon-container">
                {isDone ? (
                  <CheckCircle2 className="step-icon done-icon" />
                ) : isCurrent ? (
                  <Loader2 className="step-icon spinner-icon" />
                ) : (
                  <Circle className="step-icon pending-icon" />
                )}
              </div>
              <span className="step-label">{step.label}</span>
              {isCurrent && <span className="active-pulse-dot" />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
