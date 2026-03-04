import React from 'react';
import { GameState, Player } from '../engine/types';
import Assets from '../assets.json';

interface GameBoardProps {
  state: GameState;
  selectedPoint: number | 'bar' | null;
  legalDestinations: (number | 'off')[];
  movablePoints?: (number | 'bar')[];
  onPointClick: (pt: number | 'bar' | 'off') => void;
  fastMode: boolean;
  gammonPossible?: boolean;
}

const CHECKER_P0 = 'bg-neutral-800 border-neutral-500 shadow-[0_4px_8px_rgba(0,0,0,0.9),inset_0_2px_4px_rgba(255,255,255,0.1)]';
const CHECKER_P1 = 'bg-red-900 border-red-500 shadow-[0_4px_8px_rgba(0,0,0,0.9),inset_0_2px_4px_rgba(255,255,255,0.2)]';

const Checker = ({ player, countText }: { player: Player; countText?: string }) => (
  <div className={`w-[36px] h-[36px] rounded-full border-[1.5px] flex items-center justify-center text-sm font-bold text-white z-10 ${player === 0 ? CHECKER_P0 : CHECKER_P1}`}>
    {countText || ''}
  </div>
);

const CheckerStack = ({ count, isTop, isSelected, fastMode }: { count: number; isTop: boolean; isSelected?: boolean; fastMode?: boolean }) => {
  if (count === 0) return null;
  
  const player = count > 0 ? 0 : 1;
  const absCount = Math.abs(count);
  const maxRender = Math.min(absCount, 5);
  
  return (
    <div className="absolute left-0 right-0 w-full h-full pointer-events-none z-10">
      {Array.from({ length: maxRender }).map((_, i) => {
        const isLast = i === maxRender - 1;
        const showNumber = isLast && absCount > 5;
        const offset = i * 26;
        const style = isTop ? { top: `${offset}px` } : { bottom: `${offset}px` };
        
        const lift = isSelected && isLast ? (isTop ? 'translate-y-2' : '-translate-y-2') : '';
        const glow = isSelected && isLast && !fastMode ? 'drop-shadow-[0_0_12px_rgba(255,255,255,0.8)] scale-110 z-30' : '';
        
        return (
          <div key={i} className={`absolute left-1/2 -translate-x-1/2 transition-all duration-200 ${lift} ${glow}`} style={style}>
            <Checker player={player} countText={showNumber ? absCount.toString() : undefined} />
          </div>
        );
      })}
    </div>
  );
};

const Point = ({ index, count, isTop, isSelected, isLegalDest, isMovable, onClick, fastMode }: { 
  index: number; count: number; isTop: boolean; isSelected: boolean; isLegalDest: boolean; isMovable?: boolean; onClick: () => void; fastMode: boolean 
}) => {
  const isDarkTriangle = index % 2 === 0;
  const fillColor = isDarkTriangle ? 'fill-neutral-900/80' : 'fill-red-950/80';

  return (
    <div className={`relative flex-1 h-full flex flex-col items-center group ${isLegalDest ? 'cursor-pointer' : ''}`} onClick={onClick}>
      <svg className="absolute inset-0 w-full h-full drop-shadow-md" preserveAspectRatio="none" viewBox="0 0 100 100">
        <polygon 
          points={isTop ? "0,0 100,0 50,100" : "0,100 100,100 50,0"} 
          className={`${fillColor} stroke-black/50 transition-colors duration-300 ${isLegalDest ? 'fill-green-900/40' : ''}`} 
          strokeWidth="1"
        />
      </svg>
      
      {isLegalDest && (
        <div className={`absolute inset-0 z-20 pointer-events-none border-2 border-green-500/50 bg-green-500/10 ${fastMode ? '' : 'animate-pulse'}`} />
      )}
      
      {isMovable && !isLegalDest && !isSelected && (
        <div className={`absolute inset-0 z-20 pointer-events-none border-2 border-purple-500/40 bg-purple-500/10 shadow-[inset_0_0_15px_rgba(168,85,247,0.3)] ${fastMode ? '' : 'animate-pulse'}`} />
      )}
      
      <div className={`absolute ${isTop ? 'top-1' : 'bottom-1'} text-[10px] text-white/10 font-mono pointer-events-none`}>
        {index + 1}
      </div>

      <div className={`absolute w-full h-[85%] ${isTop ? 'top-2' : 'bottom-2'} pointer-events-none`}>
         <CheckerStack count={count} isTop={isTop} isSelected={isSelected} fastMode={fastMode} />
      </div>
    </div>
  );
};

const Cube = ({ value }: { value: number }) => (
  <div className="relative w-12 h-12 shadow-[0_0_20px_rgba(168,85,247,0.4)] rounded-lg flex items-center justify-center bg-black border border-purple-500/50 overflow-hidden z-20">
    <img src={Assets.images.ui.doubling_cube.url} alt="Cube" className="absolute w-[200%] h-[200%] max-w-none object-cover opacity-80 mix-blend-screen" />
    <span className="relative z-10 text-xl font-black text-purple-300 drop-shadow-[0_2px_4px_rgba(0,0,0,1)] font-mono">{value}</span>
  </div>
);

export default function GameBoard({ state, selectedPoint, legalDestinations, movablePoints, onPointClick, fastMode, gammonPossible }: GameBoardProps) {
  const p1BarSelected = selectedPoint === 'bar' && state.turn === 1;
  const p0BarSelected = selectedPoint === 'bar' && state.turn === 0;

  const canBearOff1 = state.turn === 1 && legalDestinations.includes('off');
  const canBearOff0 = state.turn === 0 && legalDestinations.includes('off');

  return (
    <div className={`w-full max-w-4xl aspect-[1.8/1] rounded-sm shadow-2xl relative flex overflow-hidden border-[12px] transition-colors duration-1000 ${gammonPossible && !fastMode ? 'border-red-950 shadow-[0_0_40px_rgba(220,38,38,0.4)]' : 'border-neutral-950'} bg-black`}>
       
       {gammonPossible && !fastMode && (
         <>
           <div className="absolute inset-0 pointer-events-none z-40 border-[4px] border-red-500/30 animate-pulse mix-blend-screen" />
           <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
             <div className="text-red-400 font-bold tracking-widest uppercase text-sm drop-shadow-[0_2px_4px_rgba(0,0,0,1)] bg-black/60 px-6 py-2 rounded-full border border-red-900/50 backdrop-blur-sm shadow-[0_0_15px_rgba(220,38,38,0.3)]">
               Gammon Possible
             </div>
           </div>
         </>
       )}

       {/* Background Surface */}
       <div className="absolute inset-0 bg-cover bg-center opacity-80 mix-blend-screen" style={{ backgroundImage: `url(${Assets.images.backgrounds.game_board.url})` }} />
       <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/60 pointer-events-none z-0" />
       
       {/* Left Half */}
       <div className="flex-1 flex flex-col relative z-10 pl-2">
          <div className="flex-1 flex w-full">
             {[12, 13, 14, 15, 16, 17].map(idx => 
               <Point key={idx} index={idx} count={state.board[idx]} isTop={true} 
                      isSelected={selectedPoint === idx} isLegalDest={legalDestinations.includes(idx)} 
                      isMovable={movablePoints?.includes(idx)}
                      onClick={() => onPointClick(idx)} fastMode={fastMode} />
             )}
          </div>
          <div className="w-full h-[6%] min-h-[16px]" />
          <div className="flex-1 flex w-full">
             {[11, 10, 9, 8, 7, 6].map(idx => 
               <Point key={idx} index={idx} count={state.board[idx]} isTop={false} 
                      isSelected={selectedPoint === idx} isLegalDest={legalDestinations.includes(idx)} 
                      isMovable={movablePoints?.includes(idx)}
                      onClick={() => onPointClick(idx)} fastMode={fastMode} />
             )}
          </div>
       </div>

       {/* Middle Bar */}
       <div className="w-16 h-full bg-neutral-950/90 border-x border-neutral-800 flex flex-col items-center relative shadow-2xl z-20 mx-2 shadow-[0_0_30px_rgba(0,0,0,1)]">
         <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none opacity-20 text-3xl font-serif text-red-700 gap-12 tracking-widest">
           <span>闇</span><span>道</span><span>影</span>
         </div>
         
         {/* P1 Bar (Top side) */}
         <div 
           className={`w-full flex-1 relative flex flex-col items-center pt-4 transition-colors ${state.turn === 1 && state.bar[1] > 0 ? 'cursor-pointer hover:bg-neutral-800/30' : ''}`} 
           onClick={() => state.turn === 1 && state.bar[1] > 0 && onPointClick('bar')}
         >
           {state.cubeOwner === 1 && <div className="mb-4"><Cube value={state.cubeValue} /></div>}
           <div className="flex flex-col gap-1 pointer-events-none">
             {Array.from({ length: state.bar[1] }).map((_, i) => (
                <div key={`bar1-${i}`} className={`transition-all duration-200 ${p1BarSelected && i === state.bar[1]-1 ? 'scale-110 translate-y-2 drop-shadow-[0_0_12px_rgba(255,255,255,0.8)] z-30' : ''}`}>
                  <Checker player={1} />
                </div>
             ))}
           </div>
         </div>

         {/* Unowned Centered Cube */}
         <div className="h-16 flex items-center justify-center shrink-0">
            {state.cubeOwner === null && <Cube value={state.cubeValue} />}
         </div>

         {/* P0 Bar (Bottom side) */}
         <div 
           className={`w-full flex-1 relative flex flex-col-reverse items-center pb-4 transition-colors ${state.turn === 0 && state.bar[0] > 0 ? 'cursor-pointer hover:bg-neutral-800/30' : ''} ${(movablePoints?.includes('bar') && state.turn === 0) ? `bg-purple-900/20 shadow-[inset_0_0_20px_rgba(168,85,247,0.3)] ${fastMode ? '' : 'animate-pulse'}` : ''}`} 
           onClick={() => state.turn === 0 && state.bar[0] > 0 && onPointClick('bar')}
         >
           {state.cubeOwner === 0 && <div className="mt-4"><Cube value={state.cubeValue} /></div>}
           <div className="flex flex-col gap-1 pointer-events-none">
             {Array.from({ length: state.bar[0] }).map((_, i) => (
                <div key={`bar0-${i}`} className={`transition-all duration-200 ${p0BarSelected && i === state.bar[0]-1 ? 'scale-110 -translate-y-2 drop-shadow-[0_0_12px_rgba(255,255,255,0.8)] z-30' : ''}`}>
                  <Checker player={0} />
                </div>
             ))}
           </div>
         </div>
       </div>

       {/* Right Half */}
       <div className="flex-1 flex flex-col relative z-10 pr-2">
          <div className="flex-1 flex w-full">
             {[18, 19, 20, 21, 22, 23].map(idx => 
               <Point key={idx} index={idx} count={state.board[idx]} isTop={true} 
                      isSelected={selectedPoint === idx} isLegalDest={legalDestinations.includes(idx)} 
                      isMovable={movablePoints?.includes(idx)}
                      onClick={() => onPointClick(idx)} fastMode={fastMode} />
             )}
          </div>
          <div className="w-full h-[6%] min-h-[16px]" />
          <div className="flex-1 flex w-full">
             {[5, 4, 3, 2, 1, 0].map(idx => 
               <Point key={idx} index={idx} count={state.board[idx]} isTop={false} 
                      isSelected={selectedPoint === idx} isLegalDest={legalDestinations.includes(idx)} 
                      isMovable={movablePoints?.includes(idx)}
                      onClick={() => onPointClick(idx)} fastMode={fastMode} />
             )}
          </div>
       </div>

       {/* Off-Board Trays (Right Side) */}
       <div className="w-16 bg-neutral-950 border-l-2 border-neutral-800 flex flex-col shadow-[-10px_0_20px_rgba(0,0,0,0.8)] z-10 relative">
          {/* Player B Tray (Top) */}
          <div 
            className={`flex-1 p-2 flex flex-col justify-start border-b border-neutral-800 transition-colors ${canBearOff1 ? 'bg-green-900/40 cursor-pointer animate-pulse border-y-2 border-l-2 border-green-500/50' : 'bg-black/40'}`}
            onClick={() => canBearOff1 && onPointClick('off')}
          >
             {Array.from({ length: state.off[1] }).map((_, i) => (
                <div key={`off1-${i}`} className="w-full h-2 mb-[3px] bg-red-900 border border-red-500 rounded-sm shadow-[0_2px_4px_rgba(0,0,0,0.8)] pointer-events-none" />
             ))}
          </div>

          {/* Player A Tray (Bottom) */}
          <div 
            className={`flex-1 p-2 flex flex-col justify-end transition-colors ${canBearOff0 ? 'bg-green-900/40 cursor-pointer animate-pulse border-y-2 border-l-2 border-green-500/50' : 'bg-black/40'}`}
            onClick={() => canBearOff0 && onPointClick('off')}
          >
             {Array.from({ length: state.off[0] }).map((_, i) => (
                <div key={`off0-${i}`} className="w-full h-2 mt-[3px] bg-neutral-800 border border-neutral-500 rounded-sm shadow-[0_2px_4px_rgba(0,0,0,0.8)] pointer-events-none" />
             ))}
          </div>
       </div>
    </div>
  );
}
