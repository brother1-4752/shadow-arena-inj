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
import { useGameSocket } from '../hooks/useGameSocket';
import { useWalletContext } from '../hooks/WalletContext';

export default function GameShell() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const wallet = useWalletContext();

  const isOnline = params.get('mode') === 'online' || params.get('mode') === 'ai-server';
  const serverUrl = params.get('server') || 'ws://localhost:8080';
  const onlineMode = params.get('mode') === 'ai-server' ? 'ai' as const : 'pvp' as const;
  const onlineDifficulty = (params.get('difficulty') || 'normal') as 'easy' | 'normal';
  const playerAddress = wallet.address || 'not-connected';

  // Online mode hook — only connects when isOnline AND wallet is connected
  const online = useGameSocket({
    enabled: isOnline && wallet.connected,
    serverUrl,
    address: playerAddress,
    mode: onlineMode,
    difficulty: onlineDifficulty,
  });

  const [localGameState, setLocalGameState] = useState(() => createInitialState());
  const gameState = isOnline ? online.gameState : localGameState;
  const setGameState = isOnline ? (() => {}) as any : setLocalGameState;

  const [fastMode, setFastMode] = useState(false);
  const [timeLeft, setTimeLeft] = useState(45);

  const [originalRoll, setOriginalRoll] = useState<number[]>([]);
  const [selectedPoint, setSelectedPoint] = useState<number | 'bar' | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [hitEvent, setHitEvent] = useState<number | null>(null);
  const [hasShownLastStand, setHasShownLastStand] = useState(false);
  const [showLastStandOverlay, setShowLastStandOverlay] = useState(false);

  const isDev = useMemo(() => params.get('dev') === 'true', [params]);
  const aiDifficulty = useMemo(() => params.get('diff') === 'normal' ? 'normal' : 'easy', [params]);

  // My player in online mode (which side am I?)
  const myPlayer: Player = isOnline ? (online.myPlayer ?? 0) : 0;
  const isMyTurn = gameState.turn === myPlayer;

  // Player display info
  const myAddress = wallet.address
    ? `${wallet.address.slice(0, 10)}...${wallet.address.slice(-4)}`
    : 'Not Connected';
  const opponentLabel = isOnline
    ? (onlineMode === 'ai' ? 'Server AI' : 'Opponent')
    : 'Shadow AI';

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
    if (!isMyTurn || gameState.dice.length === 0 || selectedPoint !== null) return [];
    return Array.from(new Set(validSteps.map(s => s.from)));
  }, [isMyTurn, gameState.dice.length, selectedPoint, validSteps]);

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

  // Handle timer ticks & expiration (local mode only)
  useEffect(() => {
    if (isOnline) return; // Server handles timers in online mode
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

  // Shadow AI (Player 1) Logic — local mode only
  useEffect(() => {
    if (isOnline) return; // AI runs on server in online mode
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
    if (!isMyTurn) return; // Prevent clicks when not my turn

    const canSelect = (p: number | 'bar') => validSteps.some(s => s.from === p);

    if (selectedPoint !== null) {
       // Attempt to execute move
       if (pt !== 'bar' && legalDestinations.includes(pt)) {
          const dest = pt; // pt is now narrowed to number | 'off'
          if (isOnline) {
             // Online mode: send move to server
             online.sendMove(selectedPoint, dest);
             setSelectedPoint(null);
          } else {
             try {
                const nextState = applyStep(gameState, selectedPoint, dest);
                setGameState(nextState);

                const opponent = (1 - gameState.turn) as Player;
                if (nextState.bar[opponent] > gameState.bar[opponent]) {
                   setHitEvent(Date.now());
                }

                setSelectedPoint(null);

                if (nextState.dice.length === 0 && !nextState.winner) {
                   setTimeLeft(45);
                   setOriginalRoll([]);
                }
             } catch (e) {
                console.error(e);
                setSelectedPoint(null);
             }
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
  }, [gameState, selectedPoint, legalDestinations, validSteps, isOnline, isMyTurn, online]);

  const renderActionArea = (playerIndex: Player) => {
    const isActor = gameState.doubleOffered ? (1 - gameState.turn) === playerIndex : gameState.turn === playerIndex;
    if (!isActor || gameState.winner !== null) return null;

    // In online mode, only show controls for our player
    if (isOnline && playerIndex !== myPlayer) return null;

    // Responding to a double offer
    if (gameState.doubleOffered) {
       const handleAccept = () => {
         if (isOnline) { online.acceptDouble(); } else { setGameState(acceptDouble(gameState)); setTimeLeft(45); }
       };
       const handleResign = () => {
         if (isOnline) { online.resignDouble(); } else { setGameState(rejectDouble(gameState)); }
       };
       return (
         <div className="flex items-center gap-6 z-30">
            <div className={`text-purple-300 font-bold animate-pulse text-xl drop-shadow-[0_0_10px_rgba(168,85,247,0.8)] ${!fastMode ? 'hidden' : ''}`}>
               Double Offered!
            </div>
            <button
               onClick={handleAccept}
               className={`px-6 py-2 bg-green-700 hover:bg-green-600 rounded text-white font-bold transition-colors shadow-[0_0_15px_rgba(21,128,61,0.5)] ${!fastMode ? 'hidden' : ''}`}
            >
               Accept
            </button>
            <button
               onClick={handleResign}
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
       const handleRoll = () => {
         if (isOnline) {
           online.rollDice();
         } else {
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
         }
       };
       const handleDouble = () => {
         if (isOnline) { online.offerDouble(); } else { setGameState(offerDouble(gameState)); setTimeLeft(15); }
       };
       return (
         <div className="flex items-center gap-6 z-30">
            {canDouble && (
              <button
                onClick={handleDouble}
                className="px-6 py-2 bg-purple-900/60 hover:bg-purple-800/80 border border-purple-500/50 rounded text-purple-200 font-bold transition-colors shadow-[0_0_10px_rgba(168,85,247,0.3)]"
              >
                 Offer Double
              </button>
            )}
            <button
              onClick={handleRoll}
              className="px-8 py-3 bg-green-900/60 hover:bg-green-800/80 border border-green-500/50 rounded text-green-200 font-bold uppercase tracking-wider text-lg transition-colors shadow-[0_0_15px_rgba(21,128,61,0.3)]"
            >
              Roll Dice
            </button>
         </div>
       );
    }

    // Mid-turn displaying dice — also show End Turn button in online mode
    return (
       <div className="flex items-center gap-6 z-30">
         <DiceDisplay originalRoll={originalRoll} remainingDice={gameState.dice} fastMode={fastMode} />
         {isOnline && validSteps.length === 0 && (
           <button
             onClick={() => online.endTurn()}
             className="px-6 py-2 bg-yellow-900/60 hover:bg-yellow-800/80 border border-yellow-500/50 rounded text-yellow-200 font-bold transition-colors"
           >
             End Turn
           </button>
         )}
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

      {/* Wallet Required Gate */}
      {!wallet.connected && (
        <div className="absolute inset-0 z-[200] flex items-center justify-center bg-black/95">
          <div className="text-center space-y-6">
            <div className="text-2xl text-gray-300 font-bold tracking-widest uppercase">Wallet Required</div>
            <div className="text-gray-500">Connect your Keplr wallet to play</div>
            <button
              onClick={wallet.connect}
              disabled={wallet.connecting}
              className="px-8 py-3 bg-purple-900/60 hover:bg-purple-800/80 border border-purple-600/50 rounded-lg
                         text-purple-200 font-bold tracking-wider uppercase transition-all
                         hover:shadow-[0_0_15px_rgba(168,85,247,0.4)] disabled:opacity-50"
            >
              {wallet.connecting ? 'Connecting...' : 'Connect Wallet'}
            </button>
            {wallet.error && <p className="text-red-400 text-sm">{wallet.error}</p>}
          </div>
        </div>
      )}

      {/* Online Mode: Waiting / Disconnected / Error Overlay */}
      {isOnline && wallet.connected && online.waiting && (
        <div className="absolute inset-0 z-[200] flex items-center justify-center bg-black/90">
          <div className="text-center space-y-4">
            <div className="text-2xl text-red-400 font-bold tracking-widest uppercase animate-pulse">Waiting for Opponent...</div>
            <div className="text-gray-500">Open another browser tab with a different wallet to test PvP</div>
          </div>
        </div>
      )}
      {isOnline && wallet.connected && online.opponentDisconnected && (
        <div className="absolute inset-0 z-[200] flex items-center justify-center bg-black/70 pointer-events-none">
          <div className="text-xl text-yellow-400 font-bold tracking-widest uppercase animate-pulse">
            Opponent Disconnected — Waiting for reconnection...
          </div>
        </div>
      )}
      {isOnline && wallet.connected && online.error && (
        <div className="absolute inset-0 z-[200] flex items-center justify-center bg-black/90">
          <div className="text-center space-y-4">
            <div className="text-xl text-red-500 font-bold">{online.error}</div>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-red-900/60 hover:bg-red-800/80 border border-red-600/50 rounded text-red-200 font-bold transition-all"
            >
              Retry
            </button>
          </div>
        </div>
      )}

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

        {/* Top Left Controls (moved from right to avoid WalletBar overlap) */}
        <div className="absolute top-4 left-4 z-50 flex items-center gap-4">
          <button 
            onClick={() => setFastMode(prev => !prev)}
            className={`p-2 rounded-full border shadow-lg ${fastMode ? 'bg-gray-800 border-gray-600 text-gray-400' : 'bg-black/50 border-gray-700 text-gray-300 hover:text-white'} transition-colors`}
            title="Toggle Fast Mode"
          >
            <Settings size={20} className={fastMode ? '' : 'animate-[spin_4s_linear_infinite]'} />
          </button>
        </div>

        {/* Top Info Panel: Player 1 (opponent) */}
        <div className="relative">
          <PlayerPanel
            playerIndex={1}
            name={myPlayer === 1 ? 'You' : opponentLabel}
            address={myPlayer === 1 ? myAddress : ''}
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
          {(gameState.winner !== null || online.gameOver) && (
             <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
                <div className="flex flex-col items-center gap-6 p-12 border border-yellow-500/50 bg-neutral-900/90 rounded-lg shadow-[0_0_50px_rgba(234,179,8,0.3)]">
                   <h2 className="text-4xl font-black text-yellow-500 tracking-widest uppercase text-center">
                     {(isOnline ? (online.gameOver?.winner === myPlayer) : gameState.winner === 0) ? "Victory!" : "Defeat"}
                   </h2>
                   <p className="text-xl text-yellow-200/80">
                     {gameState.winType === 'gammon' ? 'Gammon! (x2)' : gameState.winType === 'backgammon' ? 'Backgammon! (x3)' : gameState.winType === 'resign' ? 'By Resignation' : 'Normal Win'}
                     {' '} - Total Points: {gameState.multiplier}
                   </p>
                   {online.gameOver?.gameHash && (
                     <p className="text-xs text-gray-500 font-mono break-all max-w-md text-center">
                       Game Hash: {online.gameOver.gameHash}
                     </p>
                   )}
                   <button
                     onClick={() => {
                        if (isOnline) {
                          window.location.href = '/';
                        } else {
                          setGameState(createInitialState());
                          setOriginalRoll([]);
                          setSelectedPoint(null);
                          setTimeLeft(45);
                          setHasShownLastStand(false);
                          setShowLastStandOverlay(false);
                        }
                     }}
                     className="mt-4 px-8 py-3 bg-yellow-600/20 border border-yellow-500/50 hover:bg-yellow-600/40 text-yellow-100 font-bold rounded uppercase tracking-wider transition-colors"
                   >
                     {isOnline ? 'Back to Lobby' : 'Play Again'}
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
            name={myPlayer === 0 ? 'You' : opponentLabel}
            address={myPlayer === 0 ? myAddress : ''}
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
