import React from 'react';
import Assets from '../assets.json';

interface DiceDisplayProps {
  originalRoll: number[];
  remainingDice: number[];
  fastMode: boolean;
}

export default function DiceDisplay({ originalRoll, remainingDice, fastMode }: DiceDisplayProps) {
  if (!originalRoll || originalRoll.length === 0) return null;

  let tempRemaining = [...remainingDice];
  const usedDice = originalRoll.map(val => {
    const idx = tempRemaining.indexOf(val);
    if (idx !== -1) {
      tempRemaining.splice(idx, 1);
      return false;
    }
    return true;
  });

  return (
    <div className="flex gap-3">
      {originalRoll.map((val, idx) => {
        const isUsed = usedDice[idx];
        return (
          <div 
            key={idx} 
            className={`w-14 h-14 bg-black/80 backdrop-blur-sm rounded-sm border-2 overflow-hidden relative flex items-center justify-center transition-all duration-300
              ${isUsed 
                ? 'border-gray-800 opacity-40 grayscale' 
                : 'border-green-500/50 shadow-[0_0_15px_rgba(34,197,94,0.3)]'
              }
              ${!isUsed && !fastMode ? 'hover:shadow-[0_0_25px_rgba(34,197,94,0.5)] scale-105' : 'scale-100'}
            `}
          >
            <img 
              src={Assets.images.ui.dice.url} 
              alt={`Dice ${val}`} 
              className={`absolute w-[150%] h-[150%] max-w-none object-cover opacity-80 mix-blend-screen ${fastMode || isUsed ? '' : 'animate-pulse'}`}
            />
            {/* Overlay the actual number value with neon glow */}
            <span className={`relative z-10 font-bold font-mono text-3xl 
              ${isUsed ? 'text-gray-500' : 'text-green-300 drop-shadow-[0_0_8px_rgba(34,197,94,1)]'}
            `}>
              {val}
            </span>
          </div>
        );
      })}
    </div>
  );
}
