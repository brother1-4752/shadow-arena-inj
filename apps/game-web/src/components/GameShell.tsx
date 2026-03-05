import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Settings, Home } from "lucide-react";
import Assets from "../assets.json";
import {
  createInitialState,
  getPipCount,
  getValidSteps,
  generateDice,
  setDice,
  applyStep,
  offerDouble,
  acceptDouble,
  rejectDouble,
} from "../engine/core";
import { Player } from "../engine/types";
import GameBoard from "./GameBoard";
import PlayerPanel from "./PlayerPanel";
import DiceDisplay from "./DiceDisplay";
import TurnTimer from "./TurnTimer";
import DoublingCubeIndicator from "./DoublingCubeIndicator";
import { useGameSocket } from "../hooks/useGameSocket";
import { useWalletContext } from "../hooks/WalletContext";
import { useContract } from "../hooks/useContract";

type StakePhase = "funding" | "playing" | "confirming" | "waiting" | "claiming" | "done";

export default function GameShell() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const wallet = useWalletContext();

  const isOnline =
    params.get("mode") === "online" || params.get("mode") === "ai-server";
  const isGuest = params.get("guest") === "true";
  const serverUrl = params.get("server") || import.meta.env.VITE_WS_URL || "ws://localhost:8080";
  const onlineMode =
    params.get("mode") === "ai-server" ? ("ai" as const) : ("pvp" as const);
  const onlineDifficulty = (params.get("difficulty") || "normal") as
    | "easy"
    | "normal";
  const onlineStake = params.get("stake") || undefined;
  const onlineDenom = params.get("denom") || undefined;
  const onlineMatchId = params.get("matchId") || undefined;
  const onlineCreate = params.get("create") === "true";
  const playerAddress = wallet.address || "not-connected";

  // Online mode hook — connects when online AND (wallet connected OR guest mode)
  const online = useGameSocket({
    enabled: isOnline && (wallet.connected || isGuest),
    serverUrl,
    address: isGuest ? "" : playerAddress,
    matchId: onlineMatchId,
    stake: onlineStake,
    denom: onlineDenom,
    mode: onlineMode,
    difficulty: onlineDifficulty,
    guest: isGuest,
    create: onlineCreate,
  });

  // Stake Match state machine
  // Use server-provided stake (from MATCH_JOINED) as authoritative, fallback to URL params
  const effectiveStake = online.matchStake || onlineStake;
  const effectiveDenom = online.matchDenom || onlineDenom;
  const isStakeMatch = !!effectiveStake && effectiveStake !== "0";
  const contract = useContract(wallet.address || null);
  const [stakePhase, setStakePhase] = useState<StakePhase>(
    isStakeMatch ? "funding" : "playing",
  );
  const [stakeTxHash, setStakeTxHash] = useState<string | null>(null);
  const [stakeError, setStakeError] = useState<string | null>(null);
  const [stakeBusy, setStakeBusy] = useState(false);
  const [disputeCountdown, setDisputeCountdown] = useState<number>(0);

  // When server tells us this is a stake match (joiner case), enter funding phase
  useEffect(() => {
    if (isStakeMatch && stakePhase === "playing" && !stakeTxHash && !online.isReconnect && !online.bothFunded) {
      setStakePhase("funding");
    }
  }, [isStakeMatch, stakePhase, stakeTxHash, online.isReconnect, online.bothFunded]);

  // Once both players have funded (BOTH_FUNDED from server), transition to playing
  useEffect(() => {
    if (isStakeMatch && online.bothFunded && stakePhase === "funding") {
      setStakePhase("playing");
    }
  }, [isStakeMatch, online.bothFunded, stakePhase]);

  // On reconnect, skip funding phase only if both players have funded
  useEffect(() => {
    if (isStakeMatch && online.isReconnect && online.bothFunded && stakePhase === "funding") {
      setStakePhase("playing");
    }
  }, [isStakeMatch, online.isReconnect, online.bothFunded, stakePhase]);

  // Once game is over in stake match, transition to confirming
  useEffect(() => {
    if (isStakeMatch && online.gameOver && stakePhase === "playing") {
      setStakePhase("confirming");
    }
  }, [isStakeMatch, online.gameOver, stakePhase]);

  // Dispute window countdown: after confirm, count down 30s then transition to claiming
  useEffect(() => {
    if (stakePhase !== "waiting" || disputeCountdown <= 0) return;
    const timer = setInterval(() => {
      setDisputeCountdown((prev) => {
        if (prev <= 1) {
          setStakePhase("claiming");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [stakePhase, disputeCountdown]);

  const handleFundMatch = useCallback(async () => {
    const matchIdToFund = online.createdMatchId || online.matchId;
    if (!matchIdToFund || !effectiveStake || !effectiveDenom) return;
    setStakeBusy(true);
    setStakeError(null);
    try {
      console.log(`[Stake] Funding match ${matchIdToFund} with ${effectiveStake} ${effectiveDenom}`);
      const txHash = await contract.fundMatch(matchIdToFund, effectiveStake, effectiveDenom);
      console.log(`[Stake] Fund tx: ${txHash}`);
      setStakeTxHash(txHash);
      // Notify server that this player has funded
      online.notifyFunded();
    } catch (err: any) {
      console.error("[Stake] Fund error:", err);
      const msg = err.message || "Transaction failed";
      if (msg.includes("not found") || msg.includes("does not exist")) {
        setStakeError("Match not registered on-chain yet. Please wait a moment and retry.");
      } else {
        setStakeError(msg);
      }
    } finally {
      setStakeBusy(false);
    }
  }, [contract, online.createdMatchId, online.matchId, effectiveStake, effectiveDenom, online.notifyFunded]);

  const handleConfirmResult = useCallback(async () => {
    const id = online.matchId;
    if (!id) return;
    setStakeBusy(true);
    setStakeError(null);
    try {
      await contract.confirmResult(id);
      setStakePhase("waiting");
      setDisputeCountdown(30); // dispute_window_secs = 30
    } catch (err: any) {
      setStakeError(err.message || "Confirm failed");
    } finally {
      setStakeBusy(false);
    }
  }, [contract, online.matchId]);

  const handleClaim = useCallback(async () => {
    const id = online.matchId;
    if (!id) return;
    setStakeBusy(true);
    setStakeError(null);
    try {
      const txHash = await contract.claim(id);
      setStakeTxHash(txHash);
      setStakePhase("done");
    } catch (err: any) {
      setStakeError(err.message || "Claim failed");
    } finally {
      setStakeBusy(false);
    }
  }, [contract, online.matchId]);

  const handleCancelUnfunded = useCallback(async () => {
    const id = online.createdMatchId || online.matchId;
    if (!id) return;
    setStakeBusy(true);
    setStakeError(null);
    try {
      await contract.cancelUnfunded(id);
      online.cancelMatch();
      window.location.href = "/";
    } catch (err: any) {
      setStakeError(err.message || "Cancel failed");
    } finally {
      setStakeBusy(false);
    }
  }, [contract, online.createdMatchId, online.matchId, online.cancelMatch]);

  const [localGameState, setLocalGameState] = useState(() =>
    createInitialState(),
  );
  const gameState = isOnline ? online.gameState : localGameState;
  const setGameState = isOnline ? ((() => {}) as any) : setLocalGameState;

  const [fastMode, setFastMode] = useState(false);
  const [timeLeft, setTimeLeft] = useState(45);

  const [originalRoll, setOriginalRoll] = useState<number[]>([]);
  const [selectedPoint, setSelectedPoint] = useState<number | "bar" | null>(
    null,
  );

  // In online mode, derive originalRoll from the hook's lastDice
  useEffect(() => {
    if (isOnline && online.lastDice.length > 0) {
      setOriginalRoll(online.lastDice);
    }
  }, [isOnline, online.lastDice]);

  // In online mode, derive timer from turnStartedAt (pause when game is paused)
  useEffect(() => {
    if (!isOnline) return;
    if (gameState.winner) return;
    if (online.gamePaused || online.opponentDisconnected) return; // Don't tick when paused or opponent disconnected

    const updateTimer = () => {
      const elapsed = Math.floor((Date.now() - online.turnStartedAt) / 1000);
      setTimeLeft(Math.max(0, 45 - elapsed));
    };
    updateTimer();
    const id = setInterval(updateTimer, 1000);
    return () => clearInterval(id);
  }, [isOnline, online.turnStartedAt, gameState.winner, online.gamePaused, online.opponentDisconnected]);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [hitEvent, setHitEvent] = useState<number | null>(null);
  const [hasShownLastStand, setHasShownLastStand] = useState(false);
  const [showLastStandOverlay, setShowLastStandOverlay] = useState(false);
  const prevBarRef = React.useRef({ 0: 0, 1: 0 });

  // Detect hits in online mode by watching bar count changes
  useEffect(() => {
    const prevBar = prevBarRef.current;
    if (
      gameState.bar[0] > prevBar[0] ||
      gameState.bar[1] > prevBar[1]
    ) {
      setHitEvent(Date.now());
    }
    prevBarRef.current = { ...gameState.bar };
  }, [gameState.bar[0], gameState.bar[1]]);

  const isDev = useMemo(() => params.get("dev") === "true", [params]);
  const aiDifficulty = useMemo(
    () => (params.get("diff") === "normal" ? "normal" : "easy"),
    [params],
  );

  // My player in online mode (which side am I?)
  const myPlayer: Player = isOnline ? (online.myPlayer ?? 0) : 0;
  const isMyTurn = gameState.turn === myPlayer;

  // Player display info
  const myAddress = isGuest
    ? "Guest Player"
    : wallet.address
      ? `${wallet.address.slice(0, 10)}...${wallet.address.slice(-4)}`
      : "Not Connected";
  const opponentLabel = isOnline
    ? onlineMode === "ai"
      ? "Server AI"
      : "Opponent"
    : "Shadow AI";

  const handleSkipToEnd = useCallback(() => {
    setGameState((prev) => {
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
        doubleOffered: false,
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

  const gammonPossible =
    (gameState.off[0] >= 10 && gameState.off[1] === 0) ||
    (gameState.off[1] >= 10 && gameState.off[0] === 0);

  const validSteps = useMemo(() => getValidSteps(gameState), [gameState]);
  const legalDestinations = useMemo(() => {
    if (selectedPoint === null) return [];
    return validSteps.filter((s) => s.from === selectedPoint).map((s) => s.to);
  }, [validSteps, selectedPoint]);

  const movablePoints = useMemo(() => {
    if (!isMyTurn || gameState.dice.length === 0 || selectedPoint !== null)
      return [];
    return Array.from(new Set(validSteps.map((s) => s.from)));
  }, [isMyTurn, gameState.dice.length, selectedPoint, validSteps]);

  // Effect 2: Last Stand trigger
  useEffect(() => {
    if (fastMode || hasShownLastStand || gameState.winner) return;
    const canBearOff = validSteps.some((s) => s.to === "off");
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
        setGameState((prev) => ({
          ...prev,
          dice: [],
          turn: (1 - prev.turn) as Player,
        }));
        setOriginalRoll([]);
        setTimeLeft(45);
        setToastMsg("Time's up! Turn passed.");
        setTimeout(() => setToastMsg(null), 3000);
      }
      return;
    }
    const timerId = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(timerId);
  }, [timeLeft, gameState]);

  // Shadow AI (Player 1) Logic — local mode only
  useEffect(() => {
    if (isOnline) return; // AI runs on server in online mode
    if (
      gameState.winner !== null ||
      gameState.doubleOffered ||
      gameState.turn !== 1
    )
      return;

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

          if (aiDifficulty === "normal") {
            let maxScore = -Infinity;
            const pipsBefore = getPipCount(gameState, 1);

            for (const step of steps) {
              try {
                const nextState = applyStep(gameState, step.from, step.to);
                let score = 0;

                if (step.to !== "off") {
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
            const nextState = applyStep(
              gameState,
              chosenStep.from,
              chosenStep.to,
            );
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

  const handlePointClick = useCallback(
    (pt: number | "bar" | "off") => {
      if (gameState.winner || gameState.doubleOffered) return;
      if (!isMyTurn) return; // Prevent clicks when not my turn

      const canSelect = (p: number | "bar") =>
        validSteps.some((s) => s.from === p);

      if (selectedPoint !== null) {
        // Attempt to execute move
        if (pt !== "bar" && legalDestinations.includes(pt)) {
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
        } else if (pt !== "off" && canSelect(pt)) {
          setSelectedPoint(pt);
        } else {
          setSelectedPoint(null);
        }
      } else {
        if (pt !== "off" && canSelect(pt)) {
          setSelectedPoint(pt);
        }
      }
    },
    [
      gameState,
      selectedPoint,
      legalDestinations,
      validSteps,
      isOnline,
      isMyTurn,
      online,
    ],
  );

  const renderActionArea = (playerIndex: Player) => {
    const isActor = gameState.doubleOffered
      ? 1 - gameState.turn === playerIndex
      : gameState.turn === playerIndex;
    if (!isActor || gameState.winner !== null) return null;

    // In online mode, only show controls for our player
    if (isOnline && playerIndex !== myPlayer) return null;

    // Responding to a double offer
    if (gameState.doubleOffered) {
      const handleAccept = () => {
        if (isOnline) {
          online.acceptDouble();
        } else {
          setGameState(acceptDouble(gameState));
          setTimeLeft(45);
        }
      };
      const handleResign = () => {
        if (isOnline) {
          online.resignDouble();
        } else {
          setGameState(rejectDouble(gameState));
        }
      };
      return (
        <div className="z-30 flex items-center gap-6">
          <div
            className={`text-purple-300 font-bold animate-pulse text-xl drop-shadow-[0_0_10px_rgba(168,85,247,0.8)] ${!fastMode ? "hidden" : ""}`}
          >
            Double Offered!
          </div>
          <button
            onClick={handleAccept}
            className={`px-6 py-2 bg-green-700 hover:bg-green-600 rounded text-white font-bold transition-colors shadow-[0_0_15px_rgba(21,128,61,0.5)] ${!fastMode ? "hidden" : ""}`}
          >
            Accept
          </button>
          <button
            onClick={handleResign}
            className={`px-6 py-2 bg-red-900 hover:bg-red-800 rounded text-white font-bold transition-colors ${!fastMode ? "hidden" : ""}`}
          >
            Resign
          </button>
        </div>
      );
    }

    // Before rolling
    if (gameState.dice.length === 0) {
      const canDouble =
        !gameState.doubleOffered &&
        (gameState.cubeOwner === null ||
          gameState.cubeOwner === gameState.turn);
      const handleRoll = () => {
        if (isOnline) {
          online.rollDice();
        } else {
          const roll = generateDice();
          setOriginalRoll(roll);
          const nextState = setDice(gameState, roll);
          setGameState(nextState);
          setTimeLeft(45);
          if (
            nextState.dice.length === 0 &&
            nextState.turn !== gameState.turn
          ) {
            setToastMsg("No legal moves available. Turn passed.");
            setTimeout(() => setToastMsg(null), 3000);
            setOriginalRoll([]);
          }
        }
      };
      const handleDouble = () => {
        if (isOnline) {
          online.offerDouble();
        } else {
          setGameState(offerDouble(gameState));
          setTimeLeft(15);
        }
      };
      return (
        <div className="z-30 flex items-center gap-6">
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
      <div className="z-30 flex items-center gap-6">
        <DiceDisplay
          originalRoll={originalRoll}
          remainingDice={gameState.dice}
          fastMode={fastMode}
        />
        {isOnline && validSteps.length === 0 && (
          <button
            onClick={() => online.endTurn()}
            className="px-6 py-2 font-bold text-yellow-200 transition-colors border rounded bg-yellow-900/60 hover:bg-yellow-800/80 border-yellow-500/50"
          >
            End Turn
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="relative flex flex-col w-full min-h-screen overflow-hidden font-sans text-white bg-neutral-950">
      {/* Background Layers */}
      <div
        className="absolute inset-0 z-0 bg-center bg-cover pointer-events-none opacity-40 mix-blend-lighten"
        style={{
          backgroundImage: `url(${Assets.images.backgrounds.game_board.url})`,
        }}
      />
      <div className="absolute inset-0 z-0 pointer-events-none bg-black/60" />

      {/* Wallet Required Gate — skip in guest mode */}
      {!wallet.connected && !isGuest && (
        <div className="absolute inset-0 z-[200] flex items-center justify-center bg-black/95">
          <div className="space-y-6 text-center">
            <div className="text-2xl font-bold tracking-widest text-gray-300 uppercase">
              Wallet Required
            </div>
            <div className="text-gray-500">
              Connect your Keplr wallet to play
            </div>
            <button
              onClick={wallet.connect}
              disabled={wallet.connecting}
              className="px-8 py-3 bg-purple-900/60 hover:bg-purple-800/80 border border-purple-600/50 rounded-lg
                         text-purple-200 font-bold tracking-wider uppercase transition-all
                         hover:shadow-[0_0_15px_rgba(168,85,247,0.4)] disabled:opacity-50"
            >
              {wallet.connecting ? "Connecting..." : "Connect Wallet"}
            </button>
            {wallet.error && (
              <p className="text-sm text-red-400">{wallet.error}</p>
            )}
          </div>
        </div>
      )}

      {/* Online Mode: Waiting / Disconnected / Error Overlay */}
      {isOnline && (wallet.connected || isGuest) && online.waiting && (
        <div className="absolute inset-0 z-[200] flex items-center justify-center bg-black/90">
          <div className="space-y-4 text-center">
            <div className="text-2xl font-bold tracking-widest text-red-400 uppercase animate-pulse">
              Waiting for Opponent...
            </div>
            {online.createdMatchId && (
              <div className="space-y-2">
                <div className="text-gray-400 text-sm uppercase tracking-wider">
                  Share this Match ID
                </div>
                <div
                  className="bg-black/60 border border-gray-700 rounded px-6 py-3 font-mono text-xl text-white tracking-widest cursor-pointer hover:border-green-500/50 transition-colors"
                  onClick={() => {
                    navigator.clipboard.writeText(online.createdMatchId!);
                  }}
                  title="Click to copy"
                >
                  {online.createdMatchId}
                </div>
                <div className="text-gray-600 text-xs">Click to copy</div>
              </div>
            )}
            {/* Stake Match: Fund Match button while waiting */}
            {isStakeMatch && stakePhase === "funding" && !stakeTxHash && !online.selfFunded && (
              <div className="space-y-3 pt-4">
                <div className="text-yellow-400 text-sm uppercase tracking-wider">
                  Stake: {effectiveStake ? parseFloat((Number(effectiveStake) / 1e18).toPrecision(4)) : effectiveStake} {effectiveDenom?.toUpperCase()}
                </div>
                {online.stakeOnChainError ? (
                  <p className="text-red-400 text-sm">{online.stakeOnChainError}</p>
                ) : !online.stakeReady ? (
                  <div className="text-gray-400 text-sm animate-pulse">Registering match on-chain...</div>
                ) : (
                  <button
                    onClick={handleFundMatch}
                    disabled={stakeBusy}
                    className="px-8 py-3 bg-yellow-900/60 hover:bg-yellow-800/80 border border-yellow-500/50 rounded
                               text-yellow-100 font-bold uppercase tracking-wider transition-all
                               disabled:opacity-50 disabled:cursor-wait"
                  >
                    {stakeBusy ? "Signing..." : "Fund Match"}
                  </button>
                )}
                {stakeError && (
                  <p className="text-red-400 text-sm">{stakeError}</p>
                )}
              </div>
            )}
            {isStakeMatch && (stakeTxHash || online.selfFunded) && stakePhase === "funding" && (
              <div className="space-y-2 pt-4">
                <div className="text-green-400 text-sm uppercase tracking-wider">
                  Funded! Waiting for opponent to fund...
                </div>
                <p className="font-mono text-xs text-gray-600 break-all max-w-md">
                  Tx: {stakeTxHash}
                </p>
              </div>
            )}
            {!online.createdMatchId && !isStakeMatch && (
              <div className="text-gray-500">
                {isGuest
                  ? 'Open another browser tab and click "Create Match" or "Join Match" to test'
                  : "Waiting for another player to join"}
              </div>
            )}
            <button
              onClick={() => {
                online.cancelMatch();
                window.location.href = "/";
              }}
              className="mt-4 px-6 py-2 bg-gray-800/60 hover:bg-gray-700/60 border border-gray-600/50 rounded
                         text-gray-300 font-bold uppercase tracking-wider text-sm transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {/* Stake Match: Fund overlay (shown after match started, before funding) */}
      {isOnline &&
        (wallet.connected || isGuest) &&
        !online.waiting &&
        isStakeMatch &&
        stakePhase === "funding" && (
          <div className="absolute inset-0 z-[200] flex items-center justify-center bg-black/85">
            <div className="flex flex-col items-center gap-4 p-8 border border-yellow-900/50 bg-neutral-950/90 rounded-lg max-w-sm w-full mx-4">
              <div className="text-2xl font-bold tracking-widest text-yellow-400 uppercase">
                Fund Match
              </div>
              <div className="text-gray-400 text-sm text-center">
                Deposit your stake to start playing. Both players must fund.
              </div>
              <div className="text-yellow-300 text-lg font-mono">
                {effectiveStake ? parseFloat((Number(effectiveStake) / 1e18).toPrecision(4)) : effectiveStake} {effectiveDenom?.toUpperCase()}
              </div>
              {!stakeTxHash && !online.selfFunded ? (
                <>
                  {online.stakeOnChainError ? (
                    <p className="text-red-400 text-sm text-center">{online.stakeOnChainError}</p>
                  ) : !online.stakeReady ? (
                    <div className="text-gray-400 text-sm animate-pulse text-center">Registering match on-chain...</div>
                  ) : (
                    <button
                      onClick={handleFundMatch}
                      disabled={stakeBusy}
                      className="px-8 py-3 bg-yellow-900/60 hover:bg-yellow-800/80 border border-yellow-500/50 rounded
                                 text-yellow-100 font-bold uppercase tracking-wider transition-all w-full
                                 disabled:opacity-50 disabled:cursor-wait"
                    >
                      {stakeBusy ? "Signing Transaction..." : "Fund Match"}
                    </button>
                  )}
                </>
              ) : (
                <div className="space-y-3 text-center">
                  <div className="text-green-400 text-sm uppercase tracking-wider">
                    Funded! Waiting for opponent to fund...
                  </div>
                  {stakeTxHash && (
                    <p className="font-mono text-xs text-gray-600 break-all max-w-md">
                      Tx: {stakeTxHash}
                    </p>
                  )}
                  <button
                    onClick={handleCancelUnfunded}
                    disabled={stakeBusy}
                    className="px-6 py-2 bg-red-900/40 hover:bg-red-800/60 border border-red-500/40 rounded
                               text-red-200 font-bold uppercase tracking-wider text-sm transition-all
                               disabled:opacity-50 disabled:cursor-wait"
                  >
                    {stakeBusy ? "Cancelling..." : "Cancel & Refund"}
                  </button>
                </div>
              )}
              {stakeError && (
                <p className="text-red-400 text-sm text-center">{stakeError}</p>
              )}
            </div>
          </div>
        )}
      {isOnline &&
        (wallet.connected || isGuest) &&
        online.opponentDisconnected && (
          <div className="absolute inset-0 z-[200] flex items-center justify-center bg-black/70">
            <div className="flex flex-col items-center gap-4 p-8 border border-yellow-900/50 bg-neutral-950/90 rounded-lg">
              <div className="text-xl font-bold tracking-widest text-yellow-400 uppercase animate-pulse">
                Game Paused
              </div>
              <div className="text-gray-400 text-sm">
                Opponent disconnected — waiting for reconnection (30s)
              </div>
              <div className="text-gray-600 text-xs">
                Game will auto-forfeit if opponent doesn't return
              </div>
            </div>
          </div>
        )}
      {isOnline && (wallet.connected || isGuest) && online.error && (
        <div className="absolute inset-0 z-[200] flex items-center justify-center bg-black/90">
          <div className="space-y-4 text-center">
            <div className="text-xl font-bold text-red-500">{online.error}</div>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2 font-bold text-red-200 transition-all border rounded bg-red-900/60 hover:bg-red-800/80 border-red-600/50"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Main UI Shell (Z-10) */}
      <div className="relative z-10 flex flex-col w-full h-screen max-w-6xl mx-auto shadow-2xl border-x border-gray-900/50 bg-black/40 backdrop-blur-sm">
        {/* Dev Tools */}
        {isDev && (
          <button
            onClick={handleSkipToEnd}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-6 py-2 bg-red-900 hover:bg-red-800 border-2 border-red-500 text-white font-black rounded text-sm transition-all shadow-[0_0_20px_rgba(220,38,38,1)]"
          >
            Dev: Skip to End
          </button>
        )}

        {/* Top Left Controls */}
        <div className="absolute z-50 flex items-center gap-4 top-4 left-4">
          <button
            onClick={() => {
              const isActive = isOnline && !online.gameOver && !gameState.winner;
              if (isActive) {
                const confirmed = window.confirm(
                  "Leaving the game will count as a forfeit. Are you sure?",
                );
                if (!confirmed) return;
                online.forfeit();
              }
              window.location.href = "/";
            }}
            className="p-2 rounded-full border shadow-lg bg-black/50 border-gray-700 text-gray-300 hover:text-white transition-colors"
            title="Back to Lobby"
          >
            <Home size={20} />
          </button>
          <button
            onClick={() => setFastMode((prev) => !prev)}
            className={`p-2 rounded-full border shadow-lg ${fastMode ? "bg-gray-800 border-gray-600 text-gray-400" : "bg-black/50 border-gray-700 text-gray-300 hover:text-white"} transition-colors`}
            title="Toggle Fast Mode"
          >
            <Settings
              size={20}
              className={fastMode ? "" : "animate-[spin_4s_linear_infinite]"}
            />
          </button>
        </div>

        {/* Top Info Panel: Player 1 (opponent) */}
        <div className="relative">
          <PlayerPanel
            playerIndex={1}
            name={myPlayer === 1 ? "You" : opponentLabel}
            address={myPlayer === 1 ? myAddress : ""}
            avatarUrl={Assets.images.characters.shadow_strategist.url}
            pips={p1Pips}
            borneOff={gameState.off[1]}
            isActiveTurn={gameState.turn === 1}
            fastMode={fastMode}
            layout="left"
          />
          {/* Action Area for Top Player */}
          <div className="absolute z-20 flex items-center gap-6 -translate-x-1/2 -bottom-20 left-1/2">
            {renderActionArea(1)}
          </div>
        </div>

        {/* Center Arena */}
        <div className="relative flex items-center justify-center flex-1 p-8">
          <div className="absolute z-20 flex flex-col items-center gap-8 left-8">
            <DoublingCubeIndicator
              value={gameState.cubeValue}
              owner={gameState.cubeOwner}
              offered={gameState.doubleOffered}
              fastMode={fastMode}
            />
          </div>

          <div className="absolute z-20 flex flex-col items-center gap-8 right-8">
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
              style={{ animation: "fadeInOut 3s ease-in-out forwards" }}
            >
              <style>{`
                  @keyframes fadeInOut {
                    0% { opacity: 0; }
                    33% { opacity: 1; }
                    100% { opacity: 0; }
                  }
                `}</style>
              <img
                src={Assets.images.backgrounds.last_stand.url}
                alt="Last Stand"
                className="absolute inset-0 object-cover w-full h-full opacity-90"
              />
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
              <div className="relative flex items-center justify-center mb-8 w-72 h-72">
                <div className="absolute inset-0 rounded-full border-[6px] border-purple-500/20 animate-[ping_2.5s_ease-out_infinite]" />
                <div className="absolute inset-4 rounded-full border-[6px] border-purple-500/40 animate-[ping_2.5s_ease-out_infinite_0.8s]" />
                <div className="absolute inset-8 rounded-full border-[6px] border-purple-500/60 animate-[ping_2.5s_ease-out_infinite_1.6s]" />
                <div className="relative w-48 h-48 rounded-2xl shadow-[0_0_60px_rgba(168,85,247,0.7)] flex items-center justify-center overflow-hidden bg-black/90">
                  <img
                    src={Assets.images.ui.doubling_dice.url}
                    alt="Double"
                    className="absolute w-[180%] h-[180%] object-cover mix-blend-screen opacity-90"
                  />
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
                  onClick={() => {
                    if (isOnline) {
                      online.acceptDouble();
                    } else {
                      setGameState(acceptDouble(gameState));
                      setTimeLeft(45);
                    }
                  }}
                  className="px-10 py-4 bg-green-700 hover:bg-green-600 rounded text-white font-bold text-2xl uppercase tracking-wider transition-colors shadow-[0_0_30px_rgba(21,128,61,0.5)] border border-green-400/50"
                >
                  Accept
                </button>
                <button
                  onClick={() => {
                    if (isOnline) {
                      online.resignDouble();
                    } else {
                      setGameState(rejectDouble(gameState));
                    }
                  }}
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
                <h2 className="text-4xl font-black tracking-widest text-center text-yellow-500 uppercase">
                  {(
                    isOnline
                      ? online.gameOver?.winner === myPlayer
                      : gameState.winner === 0
                  )
                    ? "Victory!"
                    : "Defeat"}
                </h2>
                <p className="text-xl text-yellow-200/80">
                  {gameState.winType === "gammon"
                    ? "Gammon! (x2)"
                    : gameState.winType === "backgammon"
                      ? "Backgammon! (x3)"
                      : gameState.winType === "resign"
                        ? "By Resignation"
                        : "Normal Win"}{" "}
                  - Total Points: {gameState.multiplier}
                </p>
                {online.gameOver?.gameHash && (
                  <p className="max-w-md font-mono text-xs text-center text-gray-500 break-all">
                    Game Hash: {online.gameOver.gameHash}
                  </p>
                )}

                {/* Stake Match: Confirm / Claim buttons */}
                {isStakeMatch && stakePhase === "confirming" && (
                  <div className="space-y-3 text-center">
                    <p className="text-sm text-yellow-400 uppercase tracking-wider">
                      Both players must confirm the result on-chain
                    </p>
                    <button
                      onClick={handleConfirmResult}
                      disabled={stakeBusy}
                      className="px-8 py-3 bg-yellow-900/60 hover:bg-yellow-800/80 border border-yellow-500/50 rounded
                                 text-yellow-100 font-bold uppercase tracking-wider transition-all
                                 disabled:opacity-50 disabled:cursor-wait"
                    >
                      {stakeBusy ? "Signing..." : "Confirm Result"}
                    </button>
                    {stakeError && (
                      <p className="text-red-400 text-sm">{stakeError}</p>
                    )}
                  </div>
                )}
                {isStakeMatch && stakePhase === "waiting" && (
                  <div className="space-y-3 text-center">
                    <p className="text-sm text-yellow-400 uppercase tracking-wider">
                      Result confirmed. Dispute window active.
                    </p>
                    <div className="text-3xl font-mono text-yellow-300 font-bold">
                      {disputeCountdown}s
                    </div>
                    <p className="text-gray-500 text-xs">
                      Claim will be available after the dispute window expires
                    </p>
                  </div>
                )}
                {isStakeMatch && stakePhase === "claiming" && (
                  <div className="space-y-3 text-center">
                    <p className="text-sm text-green-400 uppercase tracking-wider">
                      Result confirmed! Claim your payout.
                    </p>
                    <button
                      onClick={handleClaim}
                      disabled={stakeBusy}
                      className="px-8 py-3 bg-green-900/60 hover:bg-green-800/80 border border-green-500/50 rounded
                                 text-green-100 font-bold uppercase tracking-wider transition-all
                                 disabled:opacity-50 disabled:cursor-wait"
                    >
                      {stakeBusy ? "Signing..." : "Claim Payout"}
                    </button>
                    {stakeError && (
                      <p className="text-red-400 text-sm">{stakeError}</p>
                    )}
                  </div>
                )}
                {isStakeMatch && stakePhase === "done" && stakeTxHash && (
                  <p className="font-mono text-xs text-green-500 break-all max-w-md text-center">
                    Payout Tx: {stakeTxHash}
                  </p>
                )}

                <button
                  onClick={() => {
                    if (isOnline) {
                      window.location.href = "/";
                    } else {
                      setGameState(createInitialState());
                      setOriginalRoll([]);
                      setSelectedPoint(null);
                      setTimeLeft(45);
                      setHasShownLastStand(false);
                      setShowLastStandOverlay(false);
                    }
                  }}
                  className="px-8 py-3 mt-4 font-bold tracking-wider text-yellow-100 uppercase transition-colors border rounded bg-yellow-600/20 border-yellow-500/50 hover:bg-yellow-600/40"
                >
                  {isOnline ? "Back to Lobby" : "Play Again"}
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
          <div className="absolute z-20 flex items-center gap-6 -translate-x-1/2 -top-20 left-1/2">
            {renderActionArea(0)}
          </div>
          <PlayerPanel
            playerIndex={0}
            name={myPlayer === 0 ? "You" : opponentLabel}
            address={myPlayer === 0 ? myAddress : ""}
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
