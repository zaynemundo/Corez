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
  const [progressPercent, setProgressPercent] = useState(18);

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

  const currentStep = steps[currentStepIndex] || steps[0];

  const getHeaderIcon = () => {
    switch (taskType) {
      case 'game':
        return <Gamepad2 size={15} className="progress-mini-icon game" />;
      case 'app':
        return <Wand2 size={15} className="progress-mini-icon app" />;
      case 'image':
        return <Sparkles size={15} className="progress-mini-icon image" />;
      case 'code':
        return <Code2 size={15} className="progress-mini-icon code" />;
      default:
        return <MessageSquare size={15} className="progress-mini-icon general" />;
    }
  };

  return (
    <div className={`simple-progress-card task-${taskType}`} role="status" aria-live="polite">
      {/* Top Header Row */}
      <div className="simple-progress-header">
        <div className="simple-header-title-group">
          {getHeaderIcon()}
          <span className="simple-progress-title">
            {customTitle || (taskType === 'game' ? 'Building 8-Bit Game' : taskType === 'image' ? 'Generating Visual Artwork' : taskType === 'app' ? 'Building Application' : 'Processing Request')}
          </span>
        </div>
        <span className="simple-progress-percentage">{progressPercent}%</span>
      </div>

      {/* Sleek Minimal Progress Track */}
      <div className="simple-progress-track">
        <div 
          className="simple-progress-fill" 
          style={{ width: `${progressPercent}%` }} 
        />
      </div>

      {/* Bottom Status & Step Dots Bar */}
      <div className="simple-progress-footer">
        <span className="simple-step-status-text">
          {currentStep?.label}
        </span>
        <div className="simple-step-dots">
          {steps.map((_, idx) => (
            <span
              key={idx}
              className={`simple-dot ${idx < currentStepIndex ? 'done' : idx === currentStepIndex ? 'active' : ''}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
