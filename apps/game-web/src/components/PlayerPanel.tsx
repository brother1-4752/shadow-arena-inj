import React from 'react';

interface PlayerPanelProps {
  playerIndex: 0 | 1;
  name: string;
  address: string;
  avatarUrl: string;
  pips: number;
  borneOff: number;
  isActiveTurn: boolean;
  fastMode: boolean;
  layout?: 'left' | 'right';
}

export default function PlayerPanel({
  playerIndex, name, address, avatarUrl, pips, borneOff, isActiveTurn, fastMode, layout = 'left'
}: PlayerPanelProps) {
  const isP0 = playerIndex === 0;
  const colorClass = isP0 ? 'green' : 'purple';
  
  const bgGradient = isP0 
    ? 'bg-gradient-to-t from-black/90 to-transparent border-t border-gray-800/50'
    : 'bg-gradient-to-b from-black/80 to-transparent border-b border-gray-800/50';

  const glowClass = isP0 
    ? 'shadow-[0_0_15px_rgba(34,197,94,0.3)] border-green-500/50' 
    : 'shadow-[0_0_15px_rgba(168,85,247,0.3)] border-purple-500/50';

  const textClass = isP0 ? 'text-green-100' : 'text-purple-100';
  const subTextClass = isP0 ? 'text-green-400/80' : 'text-purple-400/80';

  const renderAvatar = () => (
    <div className={`relative w-16 h-16 rounded-full overflow-hidden border-2 bg-black shrink-0
      ${glowClass} ${isActiveTurn && !fastMode ? `ring-2 ring-offset-2 ring-offset-black ring-${colorClass}-500` : ''}
    `}>
      <img src={avatarUrl} alt={name} className="w-full h-full object-cover object-top" />
      {isActiveTurn && !fastMode && (
        <div className={`absolute inset-0 animate-pulse bg-${colorClass}-500/20 mix-blend-screen`}></div>
      )}
    </div>
  );

  const renderInfo = () => (
    <div className={`flex flex-col ${layout === 'right' ? 'text-right' : 'text-left'}`}>
      <h3 className={`text-xl font-bold tracking-wide ${textClass}`}>{name}</h3>
      <p className={`text-xs ${subTextClass} uppercase tracking-widest truncate max-w-[120px]`}>{address}</p>
    </div>
  );

  const renderStats = () => (
    <div className={`flex gap-6 ${layout === 'right' ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={layout === 'right' ? 'text-left' : 'text-right'}>
        <p className="text-sm text-gray-400 uppercase tracking-wider">Pips</p>
        <p className="text-2xl font-mono text-white">{pips}</p>
      </div>
      <div className={layout === 'right' ? 'text-left' : 'text-right'}>
        <p className="text-sm text-gray-400 uppercase tracking-wider">Off</p>
        <p className="text-2xl font-mono text-white">{borneOff}</p>
      </div>
    </div>
  );

  return (
    <div className={`flex items-center justify-between p-4 ${bgGradient} ${isActiveTurn && !fastMode ? 'bg-black/80' : ''}`}>
      <div className={`flex items-center gap-4 ${layout === 'right' ? 'flex-row-reverse' : 'flex-row'}`}>
        {renderAvatar()}
        {renderInfo()}
      </div>
      {renderStats()}
    </div>
  );
}
