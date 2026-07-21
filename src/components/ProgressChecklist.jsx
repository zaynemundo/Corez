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

  const currentStep = steps[currentStepIndex] || steps[0];

  const getHeaderIcon = () => {
    switch (taskType) {
      case 'game':
        return <Gamepad2 size={14} className="progress-mini-icon game" />;
      case 'app':
        return <Wand2 size={14} className="progress-mini-icon app" />;
      case 'image':
        return <Sparkles size={14} className="progress-mini-icon image" />;
      case 'code':
        return <Code2 size={14} className="progress-mini-icon code" />;
      default:
        return <MessageSquare size={14} className="progress-mini-icon general" />;
    }
  };

  const totalDots = 10;

  return (
    <div className={`pacman-progress-container task-${taskType}`} role="status" aria-live="polite">
      {/* Top Status Header */}
      <div className="pacman-progress-header">
        <div className="pacman-header-left">
          {getHeaderIcon()}
          <span className="pacman-status-title">
            {customTitle || (taskType === 'game' ? 'Building 8-Bit Game' : taskType === 'image' ? 'Generating Visual Artwork' : taskType === 'app' ? 'Building Application' : 'Processing Request')}
          </span>
          <span className="pacman-status-step">— {currentStep?.label}</span>
        </div>
        <span className="pacman-percentage-badge">{progressPercent}%</span>
      </div>

      {/* Long Line Progress Track with Pac-Man */}
      <div className="pacman-track-wrapper">
        {/* Background Line Track */}
        <div className="pacman-track-bg" />

        {/* Pac-Dots along the line */}
        <div className="pacman-dots-row">
          {Array.from({ length: totalDots }).map((_, i) => {
            const dotPercent = (i / (totalDots - 1)) * 96 + 2;
            const isEaten = progressPercent >= dotPercent;
            return (
              <span
                key={i}
                className={`pacman-dot ${isEaten ? 'eaten' : ''}`}
                style={{ left: `${dotPercent}%` }}
              />
            );
          })}
        </div>

        {/* Progress Line Fill */}
        <div 
          className="pacman-line-fill" 
          style={{ width: `${Math.min(progressPercent, 100)}%` }} 
        />

        {/* Chomping Pac-Man Icon */}
        <div 
          className="pacman-head-wrapper" 
          style={{ left: `calc(${Math.min(progressPercent, 96)}% - 10px)` }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" className="pacman-svg">
            <g className="pacman-jaw-top">
              <path d="M 10 10 L 18 10 A 8 8 0 0 0 2 10 Z" fill="currentColor" />
              <circle cx="9" cy="5" r="1.3" className="pacman-eye" />
            </g>
            <g className="pacman-jaw-bottom">
              <path d="M 10 10 L 18 10 A 8 8 0 0 1 2 10 Z" fill="currentColor" />
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}
