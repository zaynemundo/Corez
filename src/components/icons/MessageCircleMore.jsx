import { useState } from 'react';

export default function MessageCircleMore({ 
  size = 20, 
  color = 'currentColor', 
  strokeWidth = 2,
  className = '',
  animated = true,
  ...props 
}) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`animate-ui-icon message-circle-more-icon ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      {...props}
    >
      <style>{`
        @keyframes msgDotPulse {
          0%, 100% { transform: translateY(0); opacity: 0.5; }
          50% { transform: translateY(-2.5px); opacity: 1; }
        }
        .msg-dot-1 { animation: msgDotPulse 1.2s ease-in-out infinite 0s; transform-origin: center; }
        .msg-dot-2 { animation: msgDotPulse 1.2s ease-in-out infinite 0.2s; transform-origin: center; }
        .msg-dot-3 { animation: msgDotPulse 1.2s ease-in-out infinite 0.4s; transform-origin: center; }
      `}</style>
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
      <circle cx="8" cy="12" r="1" fill={color} className={isHovered ? "msg-dot-1" : ""} />
      <circle cx="12" cy="12" r="1" fill={color} className={isHovered ? "msg-dot-2" : ""} />
      <circle cx="16" cy="12" r="1" fill={color} className={isHovered ? "msg-dot-3" : ""} />
    </svg>
  );
}
