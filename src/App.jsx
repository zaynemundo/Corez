import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Cat, 
  Sparkles, 
  Volume2, 
  VolumeX, 
  RotateCcw, 
  Palette, 
  Sliders, 
  Code, 
  Copy, 
  Check, 
  Zap, 
  Github, 
  Heart,
  CheckCircle2,
  RefreshCw,
  Eye
} from 'lucide-react';

// Web Audio API Synthesizer for cute meow and tap sound effects
const playCatSound = (type = 'meow', isMuted = false) => {
  if (isMuted) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    if (type === 'meow') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(550, now);
      osc.frequency.exponentialRampToValueAtTime(780, now + 0.1);
      osc.frequency.exponentialRampToValueAtTime(420, now + 0.35);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.25, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.4);
    } else if (type === 'tap') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.08);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.1);
    }
  } catch (e) {
    // Audio context may require user interaction first
  }
};

// Cat breed themes definition
const CAT_BREEDS = [
  {
    id: 'orange-tabby',
    name: 'Orange Tabby 🍊',
    furColor: '#f97316',
    stripeColor: '#c2410c',
    padColor: '#f472b6',
    pawBg: '#fb923c',
    btnBg: 'linear-gradient(135deg, #f59e0b, #d97706)',
    btnGlow: 'rgba(245, 158, 11, 0.45)'
  },
  {
    id: 'tuxedo',
    name: 'Tuxedo Mitten 🖤',
    furColor: '#1e293b',
    stripeColor: '#0f172a',
    padColor: '#fb7185',
    pawBg: '#f8fafc',
    btnBg: 'linear-gradient(135deg, #6366f1, #4f46e5)',
    btnGlow: 'rgba(99, 102, 241, 0.45)'
  },
  {
    id: 'calico',
    name: 'Calico Patch 🎨',
    furColor: '#fef08a',
    stripeColor: '#ea580c',
    padColor: '#f472b6',
    pawBg: '#334155',
    btnBg: 'linear-gradient(135deg, #ec4899, #db2777)',
    btnGlow: 'rgba(236, 72, 153, 0.45)'
  },
  {
    id: 'pink-kitty',
    name: 'Pastel Dream 🌸',
    furColor: '#f472b6',
    stripeColor: '#db2777',
    padColor: '#ffffff',
    pawBg: '#fbcfe8',
    btnBg: 'linear-gradient(135deg, #10b981, #059669)',
    btnGlow: 'rgba(16, 185, 129, 0.45)'
  },
  {
    id: 'midnight',
    name: 'Midnight Panther 🌙',
    furColor: '#0f172a',
    stripeColor: '#38bdf8',
    padColor: '#38bdf8',
    pawBg: '#1e293b',
    btnBg: 'linear-gradient(135deg, #0284c7, #0369a1)',
    btnGlow: 'rgba(2, 132, 199, 0.45)'
  }
];

export default function App() {
  const [selectedBreed, setSelectedBreed] = useState(CAT_BREEDS[0]);
  const [buttonText, setButtonText] = useState('Get Started');
  const [submittedText, setSubmittedText] = useState('Paws-itively Done! 🐾');
  const [isMuted, setIsMuted] = useState(false);
  const [speed, setSpeed] = useState(0.25);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [showCodeModal, setShowCodeModal] = useState(false);

  // Mouse tracking state for paw
  const [pawState, setPawState] = useState({
    visible: false,
    x: 0,
    y: -80,
    rotate: 0,
    side: 'top',
    isPatting: false
  });

  const [particles, setParticles] = useState([]);
  const stageRef = useRef(null);
  const buttonRef = useRef(null);

  // Mouse proximity and tracking logic
  const handleMouseMove = useCallback((e) => {
    if (!buttonRef.current || isSubmitted) return;

    const btnRect = buttonRef.current.getBoundingClientRect();
    const btnCenterX = btnRect.left + btnRect.width / 2;
    const btnCenterY = btnRect.top + btnRect.height / 2;

    const relX = e.clientX - btnCenterX;
    const relY = e.clientY - btnCenterY;
    const dist = Math.hypot(relX, relY);

    if (dist > 220) {
      if (pawState.visible && !pawState.isPatting) {
        setPawState(prev => ({ ...prev, visible: false, y: -80 }));
      }
      return;
    }

    const normX = relX / (btnRect.width / 2);
    const normY = relY / (btnRect.height / 2);

    let side = 'top';
    let targetX = 0;
    let targetY = -45;
    let targetRotate = 0;

    if (normX < -0.35) {
      side = 'left';
      targetX = Math.max(-70, relX * 0.45);
      targetY = Math.min(15, Math.max(-35, relY * 0.35));
      targetRotate = Math.min(45, Math.max(15, 30 + relY * 0.2));
    } else if (normX > 0.35) {
      side = 'right';
      targetX = Math.min(70, relX * 0.45);
      targetY = Math.min(15, Math.max(-35, relY * 0.35));
      targetRotate = Math.max(-45, Math.min(-15, -30 + relY * 0.2));
    } else if (normY > 0.35) {
      side = 'bottom';
      targetX = relX * 0.35;
      targetY = Math.min(55, relY * 0.5);
      targetRotate = -relX * 0.15;
    } else {
      side = 'top';
      targetX = relX * 0.45;
      targetY = Math.min(-10, -45 + relY * 0.25);
      targetRotate = relX * 0.25;
    }

    setPawState({
      visible: true,
      x: targetX,
      y: targetY,
      rotate: targetRotate,
      side,
      isPatting: false
    });
  }, [isSubmitted, pawState.visible, pawState.isPatting]);

  const handleMouseLeave = () => {
    if (!pawState.isPatting) {
      setPawState(prev => ({ ...prev, visible: false, y: -80 }));
    }
  };

  const handleButtonClick = (e) => {
    e.preventDefault();
    if (isLoading) return;

    playCatSound('tap', isMuted);
    playCatSound('meow', isMuted);

    setPawState(prev => ({
      ...prev,
      visible: true,
      y: prev.y + 30,
      isPatting: true
    }));

    const rect = buttonRef.current ? buttonRef.current.getBoundingClientRect() : { left: 0, top: 0, width: 220, height: 64 };
    const stageRect = stageRef.current ? stageRef.current.getBoundingClientRect() : { left: 0, top: 0 };
    
    const clickX = e.clientX ? (e.clientX - stageRect.left) : (rect.width / 2);
    const clickY = e.clientY ? (e.clientY - stageRect.top) : (rect.height / 2);

    const newParticles = Array.from({ length: 10 }).map((_, idx) => ({
      id: Date.now() + idx,
      x: clickX + (Math.random() * 80 - 40),
      y: clickY + (Math.random() * 60 - 30),
      size: Math.random() * 14 + 16,
      rotation: Math.random() * 60 - 30,
      opacity: 1,
      color: selectedBreed.padColor
    }));

    setParticles(prev => [...prev, ...newParticles]);
    setIsLoading(true);

    setTimeout(() => {
      setIsLoading(false);
      setIsSubmitted(true);
      setPawState(prev => ({ ...prev, visible: false, isPatting: false }));
    }, 600);
  };

  const handleReset = () => {
    setIsSubmitted(false);
    setIsLoading(false);
    setPawState({
      visible: false,
      x: 0,
      y: -80,
      rotate: 0,
      side: 'top',
      isPatting: false
    });
    setParticles([]);
  };

  useEffect(() => {
    if (particles.length > 0) {
      const timer = setTimeout(() => {
        setParticles(prev => prev.filter(p => Date.now() - p.id < 1200));
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [particles]);

  const generatedHtmlCode = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cat Paw Button</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      background: #090d16;
      font-family: system-ui, -apple-system, sans-serif;
      color: #f8fafc;
    }
    .paw-wrapper {
      position: relative;
      padding: 80px;
    }
    .cat-paw {
      position: absolute;
      top: 50%;
      left: 50%;
      pointer-events: none;
      z-index: 20;
      opacity: 0;
      transition: transform ${speed}s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease;
      transform-origin: bottom center;
    }
    .cat-paw.visible { opacity: 1; }
    .cat-paw svg {
      width: 80px;
      height: 110px;
      filter: drop-shadow(0 12px 24px rgba(0, 0, 0, 0.6));
    }
    .cta-btn {
      position: relative;
      z-index: 10;
      width: 230px;
      height: 64px;
      border: none;
      border-radius: 9999px;
      background: ${selectedBreed.btnBg};
      color: #ffffff;
      font-size: 1.15rem;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 12px 28px -6px ${selectedBreed.btnGlow};
      transition: all 0.25s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
    }
    .cta-btn:hover { transform: translateY(-2px) scale(1.03); }
  </style>
</head>
<body>
  <div class="paw-wrapper" id="wrapper">
    <div class="cat-paw" id="paw">
      <svg viewBox="0 0 100 140" fill="none">
        <path d="M20 140 C20 65, 30 35, 50 25 C70 35, 80 65, 80 140 Z" fill="${selectedBreed.furColor}" />
        <path d="M36 68 C36 54, 64 54, 64 68 C64 80, 36 80, 36 68 Z" fill="${selectedBreed.padColor}" />
        <circle cx="28" cy="44" r="7" fill="${selectedBreed.padColor}" />
        <circle cx="42" cy="34" r="8" fill="${selectedBreed.padColor}" />
        <circle cx="58" cy="34" r="8" fill="${selectedBreed.padColor}" />
        <circle cx="72" cy="44" r="7" fill="${selectedBreed.padColor}" />
      </svg>
    </div>
    <button class="cta-btn" id="btn">
      <span>${buttonText}</span>
      <span>🐾</span>
    </button>
  </div>
  <script>
    const wrapper = document.getElementById('wrapper');
    const paw = document.getElementById('paw');
    const btn = document.getElementById('btn');
    wrapper.addEventListener('mousemove', (e) => {
      const rect = btn.getBoundingClientRect();
      const relX = e.clientX - (rect.left + rect.width / 2);
      const relY = e.clientY - (rect.top + rect.height / 2);
      paw.classList.add('visible');
      paw.style.transform = \`translate(calc(-50% + \${relX * 0.45}px), calc(-50% + \${relY * 0.3 - 40}px)) rotate(\${relX * 0.25}deg)\`;
    });
    wrapper.addEventListener('mouseleave', () => paw.classList.remove('visible'));
    btn.addEventListener('click', () => {
      btn.innerHTML = '<span>${submittedText}</span>';
      paw.style.transform += ' scale(1.2) translateY(20px)';
    });
  </script>
</body>
</html>`;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(generatedHtmlCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-between p-4 sm:p-8 font-sans selection:bg-amber-500/30 selection:text-amber-200">
      {/* Background Radial Glow */}
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(245,158,11,0.15),rgba(255,255,255,0))]" />

      {/* TOP HEADER NAV */}
      <header className="w-full max-w-5xl flex items-center justify-between z-10 py-4 px-2">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-amber-500 via-orange-500 to-pink-500 p-0.5 shadow-lg shadow-orange-500/25">
            <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
              <Cat className="w-6 h-6 text-amber-400" />
            </div>
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-white flex items-center gap-2">
              Cat Paw Button
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                Interactive SVG
              </span>
            </h1>
            <p className="text-xs text-slate-400">Recreated from Hannah Goodridge’s CodePen & Rive animation</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsMuted(prev => !prev)}
            className={`p-2.5 rounded-xl border transition-all text-xs font-semibold flex items-center gap-2 ${
              isMuted 
                ? 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300' 
                : 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20'
            }`}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            <span className="hidden sm:inline">{isMuted ? 'Muted' : 'Meow Sound ON'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowCodeModal(true)}
            className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-semibold flex items-center gap-2 transition-all shadow-sm"
          >
            <Code className="w-4 h-4 text-indigo-400" />
            <span>Export Code</span>
          </button>
        </div>
      </header>

      {/* HERO INTERACTIVE STAGE CONTAINER */}
      <main className="w-full max-w-4xl z-10 my-auto py-8">
        <div 
          ref={stageRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="relative min-h-[380px] rounded-3xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-xl flex flex-col items-center justify-center p-8 select-none shadow-2xl overflow-hidden"
          style={{
            boxShadow: `0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 80px -20px ${selectedBreed.btnGlow}`
          }}
        >
          {/* Subtle Stage Background Grid */}
          <div 
            className="absolute inset-0 opacity-15 pointer-events-none"
            style={{
              backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255, 255, 255, 0.2) 1px, transparent 0)',
              backgroundSize: '24px 24px'
            }}
          />

          {/* Top Instruction Badge */}
          <div className="absolute top-6 left-6 z-20 flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-950/70 border border-slate-800 text-xs text-slate-300 backdrop-blur-md">
            <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
            <span>Move cursor near button to awaken kitty!</span>
          </div>

          {/* Reset Action */}
          {isSubmitted && (
            <button
              type="button"
              onClick={handleReset}
              className="absolute top-6 right-6 z-20 px-3.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-xs text-slate-200 flex items-center gap-1.5 transition-all border border-slate-700 shadow-md"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset State</span>
            </button>
          )}

          {/* ANIMATED CAT PAW SVG */}
          <div
            className="cat-paw-animated-container absolute pointer-events-none z-20"
            style={{
              transform: `translate(calc(-50% + ${pawState.x}px), calc(-50% + ${pawState.y}px)) rotate(${pawState.rotate}deg) scale(${pawState.isPatting ? 1.15 : 1})`,
              opacity: pawState.visible ? 1 : 0,
              transition: pawState.isPatting 
                ? 'transform 0.08s cubic-bezier(0.175, 0.885, 0.32, 1.27)' 
                : `transform ${speed}s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease`,
              top: '50%',
              left: '50%',
              transformOrigin: 'bottom center'
            }}
          >
            <svg
              className="w-24 h-32 drop-shadow-[0_16px_32px_rgba(0,0,0,0.75)]"
              viewBox="0 0 100 140"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Fur Body / Arm */}
              <path
                d="M20 140 C20 65, 30 35, 50 25 C70 35, 80 65, 80 140 Z"
                fill={selectedBreed.furColor}
              />

              {/* Mitten Tip for Tuxedo */}
              {selectedBreed.id === 'tuxedo' && (
                <path
                  d="M22 65 C25 40, 35 30, 50 25 C65 30, 75 40, 78 65 C78 75, 22 75, 22 65 Z"
                  fill={selectedBreed.pawBg}
                />
              )}

              {/* Fur Pattern Stripes for Tabby */}
              {selectedBreed.id === 'orange-tabby' && (
                <g stroke={selectedBreed.stripeColor} strokeWidth="4" strokeLinecap="round" opacity="0.65">
                  <path d="M35 52 Q50 62 65 52" />
                  <path d="M30 78 Q50 88 70 78" />
                  <path d="M26 104 Q50 114 74 104" />
                </g>
              )}

              {/* Main Central Paw Pad */}
              <path
                d="M36 68 C36 54, 64 54, 64 68 C64 80, 36 80, 36 68 Z"
                fill={selectedBreed.padColor}
              />

              {/* 4 Toe Beans */}
              <circle cx="28" cy="44" r="7" fill={selectedBreed.padColor} />
              <circle cx="42" cy="34" r="8" fill={selectedBreed.padColor} />
              <circle cx="58" cy="34" r="8" fill={selectedBreed.padColor} />
              <circle cx="72" cy="44" r="7" fill={selectedBreed.padColor} />

              {/* Claw tips when patting */}
              {pawState.isPatting && (
                <g fill="#ffffff" opacity="0.95">
                  <path d="M26 36 L28 28 L30 36 Z" />
                  <path d="M40 25 L42 17 L44 25 Z" />
                  <path d="M56 25 L58 17 L60 25 Z" />
                  <path d="M70 36 L72 28 L74 36 Z" />
                </g>
              )}
            </svg>
          </div>

          {/* THE BUTTON */}
          <div className="relative z-10 flex items-center justify-center">
            <button
              ref={buttonRef}
              type="button"
              onClick={handleButtonClick}
              disabled={isLoading}
              className="relative overflow-hidden group px-10 py-5 rounded-full font-bold text-xl text-white shadow-2xl transition-all duration-300 transform active:scale-95 hover:scale-105 flex items-center justify-center gap-3 min-w-[240px] cursor-pointer"
              style={{
                background: isSubmitted 
                  ? 'linear-gradient(135deg, #10b981, #059669)'
                  : selectedBreed.btnBg,
                boxShadow: `0 14px 32px -6px ${isSubmitted ? 'rgba(16, 185, 129, 0.5)' : selectedBreed.btnGlow}`
              }}
            >
              {/* Shimmer sweep effect */}
              <span className="absolute inset-0 w-full h-full bg-white/20 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out" />

              {isLoading ? (
                <div className="flex items-center gap-2.5">
                  <RefreshCw className="w-6 h-6 animate-spin" />
                  <span>Pawsing...</span>
                </div>
              ) : isSubmitted ? (
                <div className="flex items-center gap-2.5 animate-bounce">
                  <CheckCircle2 className="w-6 h-6 text-emerald-200" />
                  <span>{submittedText}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2.5">
                  <span>{buttonText}</span>
                  <span className="text-2xl group-hover:rotate-12 transition-transform duration-200">🐾</span>
                </div>
              )}
            </button>
          </div>

          {/* Floating Paw Print Particles */}
          {particles.map(p => (
            <div
              key={p.id}
              className="absolute pointer-events-none z-30 transition-all duration-1000 ease-out"
              style={{
                left: `${p.x}px`,
                top: `${p.y}px`,
                transform: `translate(-50%, -50%) rotate(${p.rotation}deg) scale(${p.opacity})`,
                opacity: p.opacity,
                fontSize: `${p.size}px`,
                color: p.color
              }}
            >
              🐾
            </div>
          ))}
        </div>

        {/* CONTROLS DASHBOARD PANEL */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-900/40 p-6 rounded-3xl border border-slate-800/60 backdrop-blur-md">
          {/* Fur Breed Selector */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-200">
              <Palette className="w-4 h-4 text-amber-400" />
              <span>Select Cat Breed & Color Theme</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {CAT_BREEDS.map(breed => (
                <button
                  key={breed.id}
                  type="button"
                  onClick={() => setSelectedBreed(breed)}
                  className={`p-3 rounded-2xl border text-xs font-semibold text-left transition-all flex flex-col gap-2 ${
                    selectedBreed.id === breed.id
                      ? 'bg-amber-500/15 border-amber-500/60 text-amber-300 ring-2 ring-amber-500/20'
                      : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:bg-slate-800/80 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-slate-200">{breed.name}</span>
                    <div
                      className="w-4 h-4 rounded-full border border-white/20 shadow-inner"
                      style={{ backgroundColor: breed.furColor }}
                    />
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Button Text & Speed Controls */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-200">
              <Sliders className="w-4 h-4 text-indigo-400" />
              <span>Customizer Settings</span>
            </div>

            <div className="space-y-3 bg-slate-950/60 rounded-2xl p-4 border border-slate-800/60">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Button Text Label
                </label>
                <input
                  type="text"
                  value={buttonText}
                  onChange={(e) => setButtonText(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-amber-500 font-medium"
                  placeholder="Get Started"
                />
              </div>

              <div>
                <div className="flex items-center justify-between text-xs font-medium text-slate-400 mb-1">
                  <span>Paw Reaction Speed</span>
                  <span className="text-indigo-400 font-mono font-bold">{speed}s</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="0.6"
                  step="0.05"
                  value={speed}
                  onChange={(e) => setSpeed(parseFloat(e.target.value))}
                  className="w-full accent-indigo-500 bg-slate-900 rounded-lg cursor-pointer h-2"
                />
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* CODE EXPORT MODAL */}
      {showCodeModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-6 shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <Code className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-white">Standalone Code Snippet</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCodeModal(false)}
                className="px-3 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-medium"
              >
                Close
              </button>
            </div>

            <pre className="flex-1 overflow-y-auto bg-slate-950 p-4 rounded-2xl border border-slate-800 text-xs font-mono text-amber-200/90 leading-relaxed select-all">
              {generatedHtmlCode}
            </pre>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={handleCopyCode}
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg shadow-amber-500/25 transition-all"
              >
                {copiedCode ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copiedCode ? 'Copied to Clipboard!' : 'Copy Single-File HTML'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FOOTER */}
      <footer className="w-full max-w-5xl z-10 py-4 border-t border-slate-800/60 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
        <p>Interactive SVG Cat Paw Button • Recreated for Local Preview</p>
        <p className="flex items-center gap-1">
          <span>Crafted with</span>
          <Heart className="w-3.5 h-3.5 text-pink-500 fill-pink-500" />
          <span>and CSS/SVG animations</span>
        </p>
      </footer>
    </div>
  );
}
