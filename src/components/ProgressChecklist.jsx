import { useState, useEffect } from 'react';
import { CheckCircle2, Loader2, Circle, Sparkles, Wand2, Gamepad2, Code2, MessageSquare } from 'lucide-react';

const STEP_PRESETS = {
  game: [
    { id: 1, label: 'Analyzing game rules, layout & mechanics' },
    { id: 2, label: 'Routing UI & art direction to MiMo V2.5' },
    { id: 3, label: 'Loading FLUX 1 free backgrounds & dictionary verification' },
    { id: 4, label: 'Compiling JavaScript engine & canvas controls' },
    { id: 5, label: 'Launching live canvas preview' }
  ],
  app: [
    { id: 1, label: 'Understanding app architecture & user requirements' },
    { id: 2, label: 'Delegating visual design & components to MiMo V2.5' },
    { id: 3, label: 'Injecting responsive styling & interactivity' },
    { id: 4, label: 'Preparing production-ready HTML experience' }
  ],
  image: [
    { id: 1, label: 'Parsing prompt parameters & composition' },
    { id: 2, label: 'Delegating to FLUX 1 free background engine' },
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
  const [progressPercent, setProgressPercent] = useState(12);

  useEffect(() => {
    const totalSteps = steps.length;
    const intervalTime = Math.max(700, Math.min(1400, 4000 / totalSteps));

    const timer = setInterval(() => {
      setCurrentStepIndex(prev => {
        if (prev < totalSteps - 1) {
          const next = prev + 1;
          const targetPercent = Math.round(((next + 1) / totalSteps) * 90);
          setProgressPercent(targetPercent);
          return next;
        }
        setProgressPercent(96);
        return prev;
      });
    }, intervalTime);

    return () => clearInterval(timer);
  }, [steps.length]);

  const getHeaderIcon = () => {
    switch (taskType) {
      case 'game':
        return <Gamepad2 className="progress-header-icon" />;
      case 'app':
        return <Wand2 className="progress-header-icon" />;
      case 'image':
        return <Sparkles className="progress-header-icon" />;
      case 'code':
        return <Code2 className="progress-header-icon" />;
      default:
        return <MessageSquare className="progress-header-icon" />;
    }
  };

  return (
    <div className="progress-checklist-card" role="status" aria-live="polite">
      <div className="progress-card-header">
        <div className="progress-header-left">
          {getHeaderIcon()}
          <span className="progress-header-title">
            {customTitle || (taskType === 'game' ? 'Building Game Experience' : taskType === 'image' ? 'Generating FLUX 1 Image' : 'Processing Request')}
          </span>
        </div>
        <span className="progress-percent-badge">{progressPercent}%</span>
      </div>

      <div className="progress-bar-track">
        <div 
          className="progress-bar-fill"
          style={{ width: `${progressPercent}%` }}
        />
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
            </li>
          );
        })}
      </ul>
    </div>
  );
}
