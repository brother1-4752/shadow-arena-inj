import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Settings } from 'lucide-react';
import Assets from '../assets.json';
import { createInitialState, getPipCount, getValidSteps, generateDice, setDice, applyStep, offerDouble, acceptDouble, rejectDouble } from '../engine/core';
import { Player } from '../engine/types';
import GameBoard from './GameBoard';
import PlayerPanel from './PlayerPanel';
import DiceDisplay from './DiceDisplay';
import TurnTimer from './TurnTimer';
import DoublingCubeIndicator from './DoublingCubeIndicator';

export default function GameShell() {
  const [gameState, setGameState] = useState(() => createInitialState());
  const [fastMode, setFastMode] = useState(false);
  const [timeLeft, setTimeLeft] = useState(45);
  
  const [originalRoll, setOriginalRoll] = useState<number[]>([]);
  const [selectedPoint, setSelectedPoint] = useState<number | 'bar' | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [hitEvent, setHitEvent] = useState<number | null>(null);
  const [hasShownLastStand, setHasShownLastStand] = useState(false);
  const [showLastStandOverlay, setShowLastStandOverlay] = useState(false);

  const isDev = useMemo(() => new URLSearchParams(window.location.search).get('dev') === 'true', []);
  const aiDifficulty = useMemo(() => new URLSearchParams(window.location.search).get('diff') === 'normal' ? 'normal' : 'easy', []);

  const handleSkipToEnd = useCallback(() => {
    setGameState(prev => {
      const newBoard = [...prev.board];
      // Remove all player 0 checkers from the board
      for (let i = 0; i < 24; i++) {
        if (newBoard[i] > 0) newBoard[i] = 0;
      }
      // Place 1 checker on point 1 (index 0)
      newBoard[0] = 1;
      
      return {
        ...prev,
        board: newBoard,
        bar: { ...prev.bar, 0: 0 },
        off: { ...prev.off, 0: 14 },
        turn: 0,
        dice: [],
        winner: null,
        winType: null,
        doubleOffered: false
      };
    });
    setOriginalRoll([]);
    setSelectedPoint(null);
    setTimeLeft(45);
    setHasShownLastStand(false);
    setShowLastStandOverlay(false);
  }, []);

  const p0Pips = getPipCount(gameState, 0); // Bottom Player (Swift Assassin)
  const p1Pips = getPipCount(gameState, 1); // Top Player (Shadow AI)

  const gammonPossible = (gameState.off[0] >= 10 && gameState.off[1] === 0) || (gameState.off[1] >= 10 && gameState.off[0] === 0);

  const validSteps = useMemo(() => getValidSteps(gameState), [gameState]);
  const legalDestinations = useMemo(() => {
    if (selectedPoint === null) return [];
    return validSteps.filter(s => s.from === selectedPoint).map(s => s.to);
  }, [validSteps, selectedPoint]);

  const movablePoints = useMemo(() => {
    if (gameState.turn !== 0 || gameState.dice.length === 0 || selectedPoint !== null) return [];
    return Array.from(new Set(validSteps.map(s => s.from)));
  }, [gameState.turn, gameState.dice.length, selectedPoint, validSteps]);

  // Effect 2: Last Stand trigger
  useEffect(() => {
    if (fastMode || hasShownLastStand || gameState.winner) return;
    const canBearOff = validSteps.some(s => s.to === 'off');
    if (canBearOff) {
      setHasShownLastStand(true);
      setShowLastStandOverlay(true);
      setTimeout(() => setShowLastStandOverlay(false), 3000);
    }
  }, [validSteps, fastMode, hasShownLastStand, gameState.winner]);

  // Handle timer ticks & expiration
  useEffect(() => {
    if (gameState.winner) return;
    if (timeLeft <= 0) {
       if (gameState.doubleOffered) {
          setGameState(rejectDouble(gameState)); // Auto-resign if didn't answer double
       } else {
          setGameState(prev => ({
             ...prev,
             dice: [],
             turn: (1 - prev.turn) as Player
          }));
          setOriginalRoll([]);
          setTimeLeft(45);
          setToastMsg("Time's up! Turn passed.");
          setTimeout(() => setToastMsg(null), 3000);
       }
       return;
    }
    const timerId = setInterval(() => setTimeLeft(t => t - 1), 1000);
    return () => clearInterval(timerId);
  }, [timeLeft, gameState]);

  // Shadow AI (Player 1) Logic
  useEffect(() => {
    if (gameState.winner !== null || gameState.doubleOffered || gameState.turn !== 1) return;

    let timeoutId: ReturnType<typeof setTimeout>;

    if (gameState.dice.length === 0) {
      // AI needs to roll
      timeoutId = setTimeout(() => {
        const roll = generateDice();
        setOriginalRoll(roll);
        const nextState = setDice(gameState, roll);
        setGameState(nextState);
        setTimeLeft(45);
        if (nextState.dice.length === 0 && nextState.turn !== 1) {
          setToastMsg("AI has no legal moves. Turn passed.");
          setTimeout(() => setToastMsg(null), 3000);
          setOriginalRoll([]);
        }
      }, 800);
    } else {
      // AI has dice, make a move
      timeoutId = setTimeout(() => {
        const steps = getValidSteps(gameState);
        if (steps.length > 0) {
          let chosenStep = steps[Math.floor(Math.random() * steps.length)];
          
          if (aiDifficulty === 'normal') {
            let maxScore = -Infinity;
            const pipsBefore = getPipCount(gameState, 1);
            
            for (const step of steps) {
              try {
                const nextState = applyStep(gameState, step.from, step.to);
                let score = 0;
                
                if (step.to !== 'off') {
                  // +2 points: hitting an opponent blot
                  if (gameState.board[step.to] === 1) {
                    score += 2;
                  }
                  // +2 points: landing on a point with 2+ own checkers
                  if (nextState.board[step.to] <= -2) {
                    score += 2;
                  }
                }
                
                // -2 points: leaving own checker exposed
                for (let i = 0; i < 24; i++) {
                  if (nextState.board[i] === -1) {
                    score -= 2;
                  }
                }
                
                // +1 point: move reduces own pip count
                const pipsAfter = getPipCount(nextState, 1);
                if (pipsAfter < pipsBefore) {
                  score += 1;
                }
                
                // Slight randomization for tie-breaking equal scores
                score += Math.random() * 0.1;
                
                if (score > maxScore) {
                  maxScore = score;
                  chosenStep = step;
                }
              } catch (e) {
                // Ignore invalid simulation
              }
            }
          }

          try {
             const nextState = applyStep(gameState, chosenStep.from, chosenStep.to);
             setGameState(nextState);

             // Trigger visual hit effect if opponent bar increased
             if (nextState.bar[0] > gameState.bar[0]) {
                setHitEvent(Date.now());
             }

             if (nextState.dice.length === 0 && !nextState.winner) {
                setTimeLeft(45);
                setOriginalRoll([]);
             }
          } catch (e) {
             console.error("AI Move Error:", e);
          }
        }
      }, 800);
    }

    return () => clearTimeout(timeoutId);
  }, [gameState, aiDifficulty]);

  const handlePointClick = useCallback((pt: number | 'bar' | 'off') => {
    if (gameState.winner || gameState.doubleOffered) return;
    if (gameState.turn !== 0) return; // Prevent human clicks during AI turn

    const canSelect = (p: number | 'bar') => validSteps.some(s => s.from === p);

    if (selectedPoint !== null) {
       // Attempt to execute move
       if (legalDestinations.includes(pt)) {
          try {
             const nextState = applyStep(gameState, selectedPoint, pt);
             
             // 1. Immediately update game state with the pristine, un-mutated nextState
             setGameState(nextState);

             // 2. Trigger visual hit effect if opponent bar increased
             const opponent = (1 - gameState.turn) as Player;
             if (nextState.bar[opponent] > gameState.bar[opponent]) {
                setHitEvent(Date.now());
             }

             // 3. Clear selection and handle turn passing
             setSelectedPoint(null);
             
             // Handle automatic pass if no moves left
             if (nextState.dice.length === 0 && !nextState.winner) {
                setTimeLeft(45);
                setOriginalRoll([]);
             }
          } catch (e) {
             console.error(e);
             setSelectedPoint(null);
          }
       } else if (pt !== 'off' && canSelect(pt)) {
          setSelectedPoint(pt);
       } else {
          setSelectedPoint(null);
       }
    } else {
       if (pt !== 'off' && canSelect(pt)) {
          setSelectedPoint(pt);
       }
    }
  }, [gameState, selectedPoint, legalDestinations, validSteps]);

  const renderActionArea = (playerIndex: Player) => {
    const isActor = gameState.doubleOffered ? (1 - gameState.turn) === playerIndex : gameState.turn === playerIndex;
    if (!isActor || gameState.winner !== null) return null;

    // Responding to a double offer
    if (gameState.doubleOffered) {
       return (
         <div className="flex items-center gap-6 z-30">
            <div className={`text-purple-300 font-bold animate-pulse text-xl drop-shadow-[0_0_10px_rgba(168,85,247,0.8)] ${!fastMode ? 'hidden' : ''}`}>
               Double Offered!
            </div>
            <button 
               onClick={() => { setGameState(acceptDouble(gameState)); setTimeLeft(45); }} 
               className={`px-6 py-2 bg-green-700 hover:bg-green-600 rounded text-white font-bold transition-colors shadow-[0_0_15px_rgba(21,128,61,0.5)] ${!fastMode ? 'hidden' : ''}`}
            >
               Accept
            </button>
            <button 
               onClick={() => setGameState(rejectDouble(gameState))} 
               className={`px-6 py-2 bg-red-900 hover:bg-red-800 rounded text-white font-bold transition-colors ${!fastMode ? 'hidden' : ''}`}
            >
               Resign
            </button>
         </div>
       );
    }

    // Before rolling
    if (gameState.dice.length === 0) {
       const canDouble = !gameState.doubleOffered && (gameState.cubeOwner === null || gameState.cubeOwner === gameState.turn);
       return (
         <div className="flex items-center gap-6 z-30">
            {canDouble && (
              <button 
                onClick={() => { setGameState(offerDouble(gameState)); setTimeLeft(15); }} 
                className="px-6 py-2 bg-purple-900/60 hover:bg-purple-800/80 border border-purple-500/50 rounded text-purple-200 font-bold transition-colors shadow-[0_0_10px_rgba(168,85,247,0.3)]"
              >
                 Offer Double
              </button>
            )}
            <button 
              onClick={() => {
                 const roll = generateDice();
                 setOriginalRoll(roll);
                 const nextState = setDice(gameState, roll);
                 setGameState(nextState);
                 setTimeLeft(45);
                 if (nextState.dice.length === 0 && nextState.turn !== gameState.turn) {
                    setToastMsg("No legal moves available. Turn passed.");
                    setTimeout(() => setToastMsg(null), 3000);
                    setOriginalRoll([]);
                 }
              }} 
              className="px-8 py-3 bg-green-900/60 hover:bg-green-800/80 border border-green-500/50 rounded text-green-200 font-bold uppercase tracking-wider text-lg transition-colors shadow-[0_0_15px_rgba(21,128,61,0.3)]"
            >
              Roll Dice
            </button>
         </div>
       );
    }

    // Mid-turn displaying dice
    return (
       <div className="flex items-center gap-6 z-30">
         <DiceDisplay originalRoll={originalRoll} remainingDice={gameState.dice} fastMode={fastMode} />
       </div>
    );
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col bg-neutral-950 text-white font-sans overflow-hidden">
      
      {/* Background Layers */}
      <div 
        className="absolute inset-0 z-0 bg-cover bg-center opacity-40 mix-blend-lighten pointer-events-none"
        style={{ backgroundImage: `url(${Assets.images.backgrounds.game_board.url})` }}
      />
      <div className="absolute inset-0 z-0 bg-black/60 pointer-events-none" />

      {/* Main UI Shell (Z-10) */}
      <div className="relative z-10 flex flex-col h-screen w-full max-w-6xl mx-auto border-x border-gray-900/50 shadow-2xl bg-black/40 backdrop-blur-sm">
        
        {/* Dev Tools */}
        {isDev && (
          <button
            onClick={handleSkipToEnd}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-6 py-2 bg-red-900 hover:bg-red-800 border-2 border-red-500 text-white font-black rounded text-sm transition-all shadow-[0_0_20px_rgba(220,38,38,1)]"
          >
            Dev: Skip to End
          </button>
        )}

        {/* Top Right Controls */}
        <div className="absolute top-4 right-4 z-50 flex items-center gap-4">
          <button 
            onClick={() => setFastMode(prev => !prev)}
            className={`p-2 rounded-full border shadow-lg ${fastMode ? 'bg-gray-800 border-gray-600 text-gray-400' : 'bg-black/50 border-gray-700 text-gray-300 hover:text-white'} transition-colors`}
            title="Toggle Fast Mode"
          >
            <Settings size={20} className={fastMode ? '' : 'animate-[spin_4s_linear_infinite]'} />
          </button>
        </div>

        {/* Top Info Panel: Player 1 */}
        <div className="relative">
          <PlayerPanel
            playerIndex={1}
            name="Shadow AI"
            address="0x8fB...3A9c"
            avatarUrl={Assets.images.characters.shadow_strategist.url}
            pips={p1Pips}
            borneOff={gameState.off[1]}
            isActiveTurn={gameState.turn === 1}
            fastMode={fastMode}
            layout="left"
          />
          {/* Action Area for Top Player */}
          <div className="absolute -bottom-20 left-1/2 -translate-x-1/2 flex items-center gap-6 z-20">
             {renderActionArea(1)}
          </div>
        </div>

        {/* Center Arena */}
        <div className="flex-1 relative flex items-center justify-center p-8">
          
          <div className="absolute left-8 flex flex-col items-center gap-8 z-20">
            <DoublingCubeIndicator 
              value={gameState.cubeValue} 
              owner={gameState.cubeOwner} 
              offered={gameState.doubleOffered} 
              fastMode={fastMode} 
            />
          </div>

          <div className="absolute right-8 flex flex-col items-center gap-8 z-20">
             <TurnTimer 
               timeLeft={timeLeft} 
               onZero={() => {}} 
               fastMode={fastMode} 
             />
          </div>

          {/* Central decorative ring */}
          {!fastMode && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
               <div className="w-[80vmin] h-[80vmin] border border-red-900/20 rounded-full shadow-[inset_0_0_100px_rgba(220,38,38,0.05)]"></div>
            </div>
          )}

          {/* Hit Effect Overlay */}
          {hitEvent && !fastMode && (
            <div 
              key={hitEvent} 
              className="absolute inset-0 bg-red-600/30 mix-blend-color-dodge animate-[ping_0.5s_ease-out_forwards] pointer-events-none z-50"
            />
          )}

          {/* Auto-pass Toast Overlay */}
          {toastMsg && (
             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-black/90 border border-red-500/50 text-red-300 px-8 py-4 rounded shadow-[0_0_30px_rgba(220,38,38,0.5)] font-bold text-lg tracking-wider animate-pulse pointer-events-none">
                {toastMsg}
             </div>
          )}

          {/* Last Stand Overlay */}
          {showLastStandOverlay && !fastMode && (
             <div 
                className="absolute inset-0 z-[100] flex items-center justify-center pointer-events-none"
                style={{ animation: 'fadeInOut 3s ease-in-out forwards' }}
             >
                <style>{`
                  @keyframes fadeInOut {
                    0% { opacity: 0; }
                    33% { opacity: 1; }
                    100% { opacity: 0; }
                  }
                `}</style>
                <img src={Assets.images.backgrounds.last_stand.url} alt="Last Stand" className="absolute inset-0 w-full h-full object-cover opacity-90" />
                <div className="absolute inset-0 bg-red-950/40 mix-blend-color-burn" />
                <div className="relative z-10 text-7xl md:text-8xl font-black text-red-600 tracking-[0.3em] uppercase drop-shadow-[0_0_30px_rgba(220,38,38,1)]">
                  Last Stand
                </div>
             </div>
          )}

          {/* Enhanced Doubling Overlay */}
          {gameState.doubleOffered && !fastMode && (
             <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm animate-[fadeIn_0.3s_ease-out_forwards]">
                <style>{`
                  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                `}</style>
                <div className="relative w-72 h-72 flex items-center justify-center mb-8">
                  <div className="absolute inset-0 rounded-full border-[6px] border-purple-500/20 animate-[ping_2.5s_ease-out_infinite]" />
                  <div className="absolute inset-4 rounded-full border-[6px] border-purple-500/40 animate-[ping_2.5s_ease-out_infinite_0.8s]" />
                  <div className="absolute inset-8 rounded-full border-[6px] border-purple-500/60 animate-[ping_2.5s_ease-out_infinite_1.6s]" />
                  <div className="relative w-48 h-48 rounded-2xl shadow-[0_0_60px_rgba(168,85,247,0.7)] flex items-center justify-center overflow-hidden bg-black/90">
                     <img src={Assets.images.ui.doubling_dice.url} alt="Double" className="absolute w-[180%] h-[180%] object-cover mix-blend-screen opacity-90" />
                     <span className="relative z-10 text-7xl font-black text-white drop-shadow-[0_4px_10px_rgba(0,0,0,1)]">
                       {gameState.cubeValue * 2}
                     </span>
                  </div>
                </div>
                <div className="text-2xl font-bold text-purple-200 tracking-widest uppercase mb-8 drop-shadow-[0_0_10px_rgba(168,85,247,0.8)]">
                   High Stakes Double
                </div>
                <div className="flex gap-8 pointer-events-auto">
                  <button 
                     onClick={() => { setGameState(acceptDouble(gameState)); setTimeLeft(45); }} 
                     className="px-10 py-4 bg-green-700 hover:bg-green-600 rounded text-white font-bold text-2xl uppercase tracking-wider transition-colors shadow-[0_0_30px_rgba(21,128,61,0.5)] border border-green-400/50"
                  >
                     Accept
                  </button>
                  <button 
                     onClick={() => setGameState(rejectDouble(gameState))} 
                     className="px-10 py-4 bg-red-900 hover:bg-red-800 rounded text-white font-bold text-2xl uppercase tracking-wider transition-colors shadow-[0_0_30px_rgba(185,28,28,0.5)] border border-red-500/50"
                  >
                     Resign
                  </button>
                </div>
             </div>
          )}

          {/* Winner Overlay */}
          {gameState.winner !== null && (
             <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
                <div className="flex flex-col items-center gap-6 p-12 border border-yellow-500/50 bg-neutral-900/90 rounded-lg shadow-[0_0_50px_rgba(234,179,8,0.3)]">
                   <h2 className="text-4xl font-black text-yellow-500 tracking-widest uppercase text-center">
                     {gameState.winner === 0 ? "Swift Assassin" : "Shadow AI"} Wins!
                   </h2>
                   <p className="text-xl text-yellow-200/80">
                     {gameState.winType === 'gammon' ? 'Gammon! (x2)' : gameState.winType === 'backgammon' ? 'Backgammon! (x3)' : gameState.winType === 'resign' ? 'By Resignation' : 'Normal Win'} 
                     {' '} - Total Points: {gameState.multiplier}
                   </p>
                   <button 
                     onClick={() => {
                        setGameState(createInitialState());
                        setOriginalRoll([]);
                        setSelectedPoint(null);
                        setTimeLeft(45);
                        setHasShownLastStand(false);
                        setShowLastStandOverlay(false);
                     }}
                     className="mt-4 px-8 py-3 bg-yellow-600/20 border border-yellow-500/50 hover:bg-yellow-600/40 text-yellow-100 font-bold rounded uppercase tracking-wider transition-colors"
                   >
                     Play Again
                   </button>
                </div>
             </div>
          )}

          {/* Actual Board */}
          <GameBoard 
             state={gameState} 
             selectedPoint={selectedPoint}
             legalDestinations={legalDestinations}
             movablePoints={movablePoints}
             onPointClick={handlePointClick}
             fastMode={fastMode}
             gammonPossible={gammonPossible}
          />
        </div>

        {/* Bottom Info Panel: Player 0 */}
        <div className="relative">
          {/* Action Area for Bottom Player */}
          <div className="absolute -top-20 left-1/2 -translate-x-1/2 flex items-center gap-6 z-20">
             {renderActionArea(0)}
          </div>
          <PlayerPanel
            playerIndex={0}
            name="Swift Assassin"
            address="0x42A...9F1b"
            avatarUrl={Assets.images.characters.swift_assassin.url}
            pips={p0Pips}
            borneOff={gameState.off[0]}
            isActiveTurn={gameState.turn === 0}
            fastMode={fastMode}
            layout="right"
          />
        </div>

      </div>
    </div>
  );
}
