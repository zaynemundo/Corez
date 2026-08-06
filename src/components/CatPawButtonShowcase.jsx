import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Sparkles, 
  Volume2, 
  VolumeX, 
  RefreshCw, 
  CheckCircle2, 
  Code, 
  Copy, 
  Check, 
  Sliders, 
  Cat, 
  Palette, 
  Zap, 
  RotateCcw,
  ExternalLink
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
      // Cute pitch-bent sine wave meow
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      const now = ctx.currentTime;
      osc.type = 'sine';
      
      // Pitch envelope: starts ~550Hz, rises to 750Hz, then drops to 400Hz
      osc.frequency.setValueAtTime(550, now);
      osc.frequency.exponentialRampToValueAtTime(780, now + 0.1);
      osc.frequency.exponentialRampToValueAtTime(420, now + 0.35);

      // Volume envelope
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.25, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.4);
    } else if (type === 'tap') {
      // Soft mechanical thump tap sound
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
    // Audio context may be blocked before user gesture
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
    btnGlow: 'rgba(245, 158, 11, 0.4)'
  },
  {
    id: 'tuxedo',
    name: 'Tuxedo Mitten 🖤',
    furColor: '#1e293b',
    stripeColor: '#0f172a',
    padColor: '#fb7185',
    pawBg: '#f8fafc',
    btnBg: 'linear-gradient(135deg, #6366f1, #4f46e5)',
    btnGlow: 'rgba(99, 102, 241, 0.4)'
  },
  {
    id: 'calico',
    name: 'Calico Patch 🎨',
    furColor: '#fef08a',
    stripeColor: '#ea580c',
    padColor: '#f472b6',
    pawBg: '#334155',
    btnBg: 'linear-gradient(135deg, #ec4899, #db2777)',
    btnGlow: 'rgba(236, 72, 153, 0.4)'
  },
  {
    id: 'pink-kitty',
    name: 'Pastel Dream 🌸',
    furColor: '#f472b6',
    stripeColor: '#db2777',
    padColor: '#ffffff',
    pawBg: '#fbcfe8',
    btnBg: 'linear-gradient(135deg, #10b981, #059669)',
    btnGlow: 'rgba(16, 185, 129, 0.4)'
  },
  {
    id: 'midnight',
    name: 'Midnight Panther 🌙',
    furColor: '#0f172a',
    stripeColor: '#38bdf8',
    padColor: '#38bdf8',
    pawBg: '#1e293b',
    btnBg: 'linear-gradient(135deg, #0284c7, #0369a1)',
    btnGlow: 'rgba(2, 132, 199, 0.4)'
  }
];

export default function CatPawButtonShowcase({ onOpenCanvasCode }) {
  const [selectedBreed, setSelectedBreed] = useState(CAT_BREEDS[0]);
  const [buttonText, setButtonText] = useState('Get Started');
  const [submittedText, setSubmittedText] = useState('Paws-itively Done! 🐾');
  const [isMuted, setIsMuted] = useState(false);
  const [speed, setSpeed] = useState(0.3); // animation speed transition sec
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Mouse tracking state for paw
  const [pawState, setPawState] = useState({
    visible: false,
    x: 0,
    y: -80,
    rotate: 0,
    side: 'top', // 'left' | 'right' | 'top' | 'bottom'
    isPatting: false
  });

  // Particle paw prints
  const [particles, setParticles] = useState([]);
  const containerRef = useRef(null);
  const buttonRef = useRef(null);

  // Handle mouse move around button container
  const handleMouseMove = useCallback((e) => {
    if (!buttonRef.current || isSubmitted) return;

    const btnRect = buttonRef.current.getBoundingClientRect();
    const btnCenterX = btnRect.left + btnRect.width / 2;
    const btnCenterY = btnRect.top + btnRect.height / 2;

    const relX = e.clientX - btnCenterX;
    const relY = e.clientY - btnCenterY;
    const dist = Math.hypot(relX, relY);

    // Trigger zone threshold around button (180px radius)
    if (dist > 180) {
      if (pawState.visible && !pawState.isPatting) {
        setPawState(prev => ({ ...prev, visible: false, y: -80 }));
      }
      return;
    }

    // Determine approaching direction & calculate paw pose
    const normX = relX / (btnRect.width / 2);
    const normY = relY / (btnRect.height / 2);

    let side = 'top';
    let targetX = 0;
    let targetY = -45;
    let targetRotate = 0;

    if (normX < -0.35) {
      // Left reach
      side = 'left';
      targetX = Math.max(-65, relX * 0.4);
      targetY = Math.min(10, Math.max(-30, relY * 0.3));
      targetRotate = Math.min(45, Math.max(15, 30 + relY * 0.2));
    } else if (normX > 0.35) {
      // Right reach
      side = 'right';
      targetX = Math.min(65, relX * 0.4);
      targetY = Math.min(10, Math.max(-30, relY * 0.3));
      targetRotate = Math.max(-45, Math.min(-15, -30 + relY * 0.2));
    } else if (normY > 0.35) {
      // Bottom reach
      side = 'bottom';
      targetX = relX * 0.3;
      targetY = Math.min(50, relY * 0.5);
      targetRotate = -relX * 0.15;
    } else {
      // Top peek
      side = 'top';
      targetX = relX * 0.45;
      targetY = Math.min(-10, -45 + relY * 0.25);
      targetRotate = relX * 0.2;
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

  // Handle Button Click / Pat action
  const handleButtonClick = (e) => {
    e.preventDefault();
    if (isLoading) return;

    // Trigger tap audio
    playCatSound('tap', isMuted);
    playCatSound('meow', isMuted);

    // Animate fast pat swipe down
    setPawState(prev => ({
      ...prev,
      visible: true,
      y: prev.y + 25,
      isPatting: true
    }));

    // Spawn floating paw print particles
    const rect = buttonRef.current ? buttonRef.current.getBoundingClientRect() : { left: 0, top: 0, width: 200, height: 60 };
    const clickX = e.clientX ? (e.clientX - rect.left) : (rect.width / 2);
    const clickY = e.clientY ? (e.clientY - rect.top) : (rect.height / 2);

    const newParticles = Array.from({ length: 8 }).map((_, idx) => ({
      id: Date.now() + idx,
      x: clickX + (Math.random() * 60 - 30),
      y: clickY + (Math.random() * 40 - 20),
      size: Math.random() * 12 + 14,
      rotation: Math.random() * 60 - 30,
      opacity: 1,
      color: selectedBreed.padColor
    }));

    setParticles(prev => [...prev, ...newParticles]);

    // Set loading state then success
    setIsLoading(true);

    setTimeout(() => {
      setIsLoading(false);
      setIsSubmitted(true);
      setPawState(prev => ({ ...prev, visible: false, isPatting: false }));
    }, 600);
  };

  // Reset button state
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

  // Clean up particles
  useEffect(() => {
    if (particles.length > 0) {
      const timer = setTimeout(() => {
        setParticles(prev => prev.filter(p => Date.now() - p.id < 1200));
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [particles]);

  // Generate complete HTML code export snippet
  const generatedHtmlCode = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Interactive Cat Paw Button</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      background: #090d16;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      color: #f8fafc;
    }
    .paw-btn-wrapper {
      position: relative;
      padding: 60px 80px;
      display: flex;
      justify-content: center;
      align-items: center;
    }
    .paw-container {
      position: absolute;
      top: 50%;
      left: 50%;
      pointer-events: none;
      z-index: 2;
      transition: transform ${speed}s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease;
      opacity: 0;
    }
    .paw-container.visible { opacity: 1; }
    .cat-paw-svg {
      width: 65px;
      height: 90px;
      filter: drop-shadow(0 8px 16px rgba(0, 0, 0, 0.4));
    }
    .cta-button {
      position: relative;
      z-index: 10;
      width: 220px;
      height: 64px;
      border: none;
      border-radius: 9999px;
      background: ${selectedBreed.btnBg};
      color: #ffffff;
      font-size: 1.125rem;
      font-weight: 700;
      letter-spacing: 0.02em;
      cursor: pointer;
      box-shadow: 0 10px 25px -5px ${selectedBreed.btnGlow}, 0 4px 6px -2px rgba(0, 0, 0, 0.3);
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      overflow: hidden;
    }
    .cta-button:hover {
      transform: translateY(-2px) scale(1.02);
      box-shadow: 0 15px 30px -5px ${selectedBreed.btnGlow}, 0 8px 12px -2px rgba(0, 0, 0, 0.4);
    }
    .cta-button:active {
      transform: translateY(1px) scale(0.98);
    }
  </style>
</head>
<body>
  <div class="paw-btn-wrapper" id="wrapper">
    <div class="paw-container" id="catPaw">
      <svg class="cat-paw-svg" viewBox="0 0 100 140" fill="none" xmlns="http://www.w3.org/2000/svg">
        <!-- Cat Arm -->
        <path d="M20 140 C20 70, 30 40, 50 30 C70 40, 80 70, 80 140 Z" fill="${selectedBreed.furColor}" />
        <!-- Fur Stripes -->
        <path d="M35 50 Q50 60 65 50 M30 75 Q50 85 70 75 M25 100 Q50 110 75 100" stroke="${selectedBreed.stripeColor}" stroke-width="4" stroke-linecap="round" fill="none" opacity="0.6"/>
        <!-- Main Palm Pad -->
        <path d="M35 65 C35 50, 65 50, 65 65 C65 78, 35 78, 35 65 Z" fill="${selectedBreed.padColor}" />
        <!-- Toe Beans -->
        <circle cx="28" cy="42" r="7" fill="${selectedBreed.padColor}" />
        <circle cx="42" cy="33" r="8" fill="${selectedBreed.padColor}" />
        <circle cx="58" cy="33" r="8" fill="${selectedBreed.padColor}" />
        <circle cx="72" cy="42" r="7" fill="${selectedBreed.padColor}" />
      </svg>
    </div>

    <button class="cta-button" id="btn">
      <span>${buttonText}</span>
      <span>🐾</span>
    </button>
  </div>

  <script>
    const wrapper = document.getElementById('wrapper');
    const paw = document.getElementById('catPaw');
    const btn = document.getElementById('btn');

    wrapper.addEventListener('mousemove', (e) => {
      const rect = btn.getBoundingClientRect();
      const relX = e.clientX - (rect.left + rect.width / 2);
      const relY = e.clientY - (rect.top + rect.height / 2);
      
      paw.classList.add('visible');
      const rot = relX * 0.25;
      paw.style.transform = \`translate(calc(-50% + \${relX * 0.5}px), calc(-50% + \${relY * 0.4 - 30}px)) rotate(\${rot}deg)\`;
    });

    wrapper.addEventListener('mouseleave', () => {
      paw.classList.remove('visible');
    });

    btn.addEventListener('click', () => {
      btn.innerHTML = '<span>${submittedText}</span>';
      paw.style.transform += ' scale(1.2) translateY(20px)';
      setTimeout(() => paw.classList.remove('visible'), 500);
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
    <div className="cat-paw-showcase-root bg-slate-950 text-slate-100 rounded-2xl border border-slate-800/80 shadow-2xl p-6 max-w-4xl mx-auto my-6 overflow-hidden">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-800 pb-4 mb-6 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white shadow-lg shadow-orange-500/25">
            <Cat className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              Interactive Cat Paw Button
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 font-medium">
                Live Local Demo
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Recreated from Hannah Goodridge’s CodePen & Rive SVG button animation
            </p>
          </div>
        </div>

        {/* Top Control Bar */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            type="button"
            onClick={() => setIsMuted(prev => !prev)}
            className={`p-2 rounded-lg border transition-all text-xs flex items-center gap-1.5 font-medium ${
              isMuted 
                ? 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300' 
                : 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20'
            }`}
            title={isMuted ? 'Unmute Meow Sound' : 'Mute Sound'}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            <span>{isMuted ? 'Muted' : 'Meow Sound ON'}</span>
          </button>

          {onOpenCanvasCode && (
            <button
              type="button"
              onClick={() => onOpenCanvasCode(generatedHtmlCode)}
              className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md shadow-indigo-600/30"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Open in Canvas</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Interactive Stage */}
      <div 
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="relative min-h-[320px] rounded-xl bg-gradient-to-b from-slate-900/90 to-slate-950/90 border border-slate-800/60 flex flex-col items-center justify-center overflow-hidden p-8 select-none shadow-inner"
        style={{
          backgroundImage: 'radial-gradient(circle at 50% 50%, rgba(245, 158, 11, 0.04) 0%, transparent 70%)'
        }}
      >
        {/* Helper Instructions Badge */}
        <div className="absolute top-4 left-4 z-20 flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/80 border border-slate-800 text-xs text-slate-400 backdrop-blur-sm shadow-sm">
          <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
          <span>Move mouse near button to summon kitty!</span>
        </div>

        {/* Reset Button */}
        {isSubmitted && (
          <button
            type="button"
            onClick={handleReset}
            className="absolute top-4 right-4 z-20 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 flex items-center gap-1.5 transition-all border border-slate-700"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Button</span>
          </button>
        )}

        {/* CAT PAW SVG ELEMENT */}
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
            className="w-20 h-28 drop-shadow-[0_12px_24px_rgba(0,0,0,0.6)]"
            viewBox="0 0 100 140"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Fur Body / Arm */}
            <path
              d="M20 140 C20 65, 30 35, 50 25 C70 35, 80 65, 80 140 Z"
              fill={selectedBreed.furColor}
            />

            {/* Mitten Tip for Tuxedo or Patch for Calico */}
            {selectedBreed.id === 'tuxedo' && (
              <path
                d="M22 65 C25 40, 35 30, 50 25 C65 30, 75 40, 78 65 C78 75, 22 75, 22 65 Z"
                fill={selectedBreed.pawBg}
              />
            )}

            {/* Fur Pattern Stripes */}
            {selectedBreed.id === 'orange-tabby' && (
              <g stroke={selectedBreed.stripeColor} strokeWidth="4" strokeLinecap="round" opacity="0.65">
                <path d="M35 52 Q50 62 65 52" />
                <path d="M30 78 Q50 88 70 78" />
                <path d="M26 104 Q50 114 74 104" />
              </g>
            )}

            {/* Main Central Paw Pad (Heart-shaped bean) */}
            <path
              d="M36 68 C36 54, 64 54, 64 68 C64 80, 36 80, 36 68 Z"
              fill={selectedBreed.padColor}
            />

            {/* 4 Toe Beans */}
            <circle cx="28" cy="44" r="7" fill={selectedBreed.padColor} />
            <circle cx="42" cy="34" r="8" fill={selectedBreed.padColor} />
            <circle cx="58" cy="34" r="8" fill={selectedBreed.padColor} />
            <circle cx="72" cy="44" r="7" fill={selectedBreed.padColor} />

            {/* Cute Claw tips when patting */}
            {pawState.isPatting && (
              <g fill="#ffffff" opacity="0.9">
                <path d="M26 36 L28 29 L30 36 Z" />
                <path d="M40 25 L42 18 L44 25 Z" />
                <path d="M56 25 L58 18 L60 25 Z" />
                <path d="M70 36 L72 29 L74 36 Z" />
              </g>
            )}
          </svg>
        </div>

        {/* THE MAIN INTERACTIVE BUTTON */}
        <div className="relative z-10 flex items-center justify-center">
          <button
            ref={buttonRef}
            type="button"
            onClick={handleButtonClick}
            disabled={isLoading}
            className="relative overflow-hidden group px-8 py-4 rounded-full font-bold text-lg text-white shadow-xl transition-all duration-300 transform active:scale-95 hover:scale-105 flex items-center justify-center gap-3 min-w-[220px]"
            style={{
              background: isSubmitted 
                ? 'linear-gradient(135deg, #10b981, #059669)'
                : selectedBreed.btnBg,
              boxShadow: `0 12px 28px -6px ${isSubmitted ? 'rgba(16, 185, 129, 0.4)' : selectedBreed.btnGlow}`
            }}
          >
            {/* Shimmer sweep effect */}
            <span className="absolute inset-0 w-full h-full bg-white/20 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out" />

            {isLoading ? (
              <div className="flex items-center gap-2">
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span>Pawsing...</span>
              </div>
            ) : isSubmitted ? (
              <div className="flex items-center gap-2 animate-bounce">
                <CheckCircle2 className="w-5 h-5 text-emerald-200" />
                <span>{submittedText}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span>{buttonText}</span>
                <span className="text-xl group-hover:rotate-12 transition-transform duration-200">🐾</span>
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

      {/* CUSTOMIZATION DASHBOARD CONTROL PANEL */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-slate-800">
        {/* Left Column: Cat Breed Selector */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Palette className="w-4 h-4 text-amber-400" />
            <span>Select Cat Breed & Fur Style</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {CAT_BREEDS.map(breed => (
              <button
                key={breed.id}
                type="button"
                onClick={() => setSelectedBreed(breed)}
                className={`p-2.5 rounded-xl border text-xs font-medium text-left transition-all flex flex-col gap-1.5 ${
                  selectedBreed.id === breed.id
                    ? 'bg-amber-500/15 border-amber-500/60 text-amber-300 ring-2 ring-amber-500/20'
                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-200">{breed.name}</span>
                  <div
                    className="w-3.5 h-3.5 rounded-full border border-white/20"
                    style={{ backgroundColor: breed.furColor }}
                  />
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: breed.padColor }} title="Paw Pad Color" />
                  <span className="text-[10px] text-slate-500">Pad color</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right Column: Text & Speed Controls */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Sliders className="w-4 h-4 text-indigo-400" />
            <span>Button & Paw Settings</span>
          </div>

          <div className="space-y-3 bg-slate-900/50 rounded-xl p-3 border border-slate-800/60">
            {/* Input Button Text */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Button Label
              </label>
              <input
                type="text"
                value={buttonText}
                onChange={(e) => setButtonText(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                placeholder="Get Started"
              />
            </div>

            {/* Paw Speed Slider */}
            <div>
              <div className="flex items-center justify-between text-xs font-medium text-slate-400 mb-1">
                <span>Paw Speed</span>
                <span className="text-indigo-400 font-mono">{speed}s</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="0.8"
                step="0.05"
                value={speed}
                onChange={(e) => setSpeed(parseFloat(e.target.value))}
                className="w-full accent-indigo-500 bg-slate-950 rounded-lg cursor-pointer"
              />
            </div>
          </div>

          {/* Copy Code Action Button */}
          <button
            type="button"
            onClick={handleCopyCode}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 transition-all border border-slate-700"
          >
            {copiedCode ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-400">Code Snippet Copied to Clipboard!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-slate-400" />
                <span>Copy Standalone HTML/CSS/JS Code</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
