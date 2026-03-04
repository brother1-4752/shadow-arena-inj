import React, { useEffect, useRef } from 'react';

interface TurnTimerProps {
  timeLeft: number;
  onZero: () => void;
  fastMode: boolean;
}

export default function TurnTimer({ timeLeft, onZero, fastMode }: TurnTimerProps) {
  const firedCallbackRef = useRef(false);

  // Reset the ref if time increases again (e.g. next turn)
  useEffect(() => {
    if (timeLeft > 0) {
      firedCallbackRef.current = false;
    }
  }, [timeLeft]);

  useEffect(() => {
    if (timeLeft === 0 && !firedCallbackRef.current) {
      firedCallbackRef.current = true;
      onZero();
    }
  }, [timeLeft, onZero]);

  const urgency = timeLeft <= 10 && timeLeft > 0;
  
  return (
    <div className={`relative flex items-center justify-center font-mono text-2xl font-bold w-16 h-16 rounded-sm border-2 
      ${timeLeft === 0 ? 'text-gray-600 border-gray-800 bg-black/80' : 
        urgency ? 'text-red-400 border-red-500 bg-red-950/40' : 'text-gray-300 border-gray-600 bg-black/60'}
      ${urgency && !fastMode ? 'shadow-[0_0_20px_rgba(239,68,68,0.5)]' : ''}
    `}>
      <span className="relative z-10">{timeLeft}</span>
      {!fastMode && urgency && (
        <div className="absolute inset-0 rounded-sm border-2 border-red-500 animate-ping opacity-75"></div>
      )}
    </div>
  );
}
