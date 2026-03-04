import React from 'react';
import Assets from '../assets.json';

interface DoublingCubeIndicatorProps {
  value: number;
  owner: 0 | 1 | null;
  offered: boolean;
  fastMode: boolean;
}

export default function DoublingCubeIndicator({ value, owner, offered, fastMode }: DoublingCubeIndicatorProps) {
  // owner === 0 (bottom), owner === 1 (top), owner === null (centered)
  const borderColor = owner === 0 ? 'border-green-500/50' : owner === 1 ? 'border-purple-500/50' : 'border-gray-500/50';
  const shadowGlow = owner === 0 ? 'rgba(34,197,94,0.3)' : owner === 1 ? 'rgba(168,85,247,0.3)' : 'rgba(156,163,175,0.3)';

  return (
    <div className={`relative flex items-center justify-center w-20 h-20
      ${offered && !fastMode ? 'scale-110 transition-transform duration-500' : ''}
    `}>
      {offered && !fastMode && (
         <div className="absolute inset-0 rounded border-2 border-purple-500 animate-ping opacity-60"></div>
      )}
      <div 
        className={`relative w-16 h-16 rounded bg-black border-2 ${borderColor} overflow-hidden flex items-center justify-center`}
        style={{ boxShadow: `0 0 15px ${shadowGlow}` }}
      >
         <img 
           src={Assets.images.ui.doubling_cube.url} 
           alt="Doubling Cube"
           className="absolute w-[200%] h-[200%] object-cover opacity-80 mix-blend-screen"
         />
         <span className="relative z-10 font-mono font-bold text-3xl text-purple-200 drop-shadow-[0_0_10px_rgba(168,85,247,1)]">
           {value}
         </span>
      </div>
    </div>
  );
}
