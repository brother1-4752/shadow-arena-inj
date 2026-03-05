import { useState, useEffect, useCallback, useRef } from "react";
import type {
  GameState as ClientGameState,
  Player as ClientPlayer,
} from "../engine/types";
import { createInitialState } from "../engine/core";
import {
  serverToClientState,
  type ServerGameState,
  type ServerMove,
} from "./stateMapper";

interface UseGameSocketOptions {
  enabled: boolean;
  serverUrl: string;
  address: string;
  matchId?: string;
  stake?: string;
  denom?: string;
  mode?: "pvp" | "ai";
  difficulty?: "easy" | "normal";
  guest?: boolean;
  create?: boolean;
}

interface GameOverInfo {
  winner: ClientPlayer;
  multiplier: number;
  gameHash: string;
}

export interface UseGameSocketReturn {
  gameState: ClientGameState;
  matchId: string | null;
  myPlayer: ClientPlayer | null;
  connected: boolean;
  waiting: boolean;
  opponentDisconnected: boolean;
  gamePaused: boolean;
  gameOver: GameOverInfo | null;
  error: string | null;
  /** The full dice array from the last DICE_ROLLED event (for display) */
  lastDice: number[];
  /** Epoch ms when the current turn started (reset on each GAME_STATE) */
  turnStartedAt: number;
  /** Match ID assigned by the server when creating a new match */
  createdMatchId: string | null;
  /** True when on-chain match is ready for funding */
  stakeReady: boolean;
  /** On-chain stake error message if CreateMatch failed */
  stakeOnChainError: string | null;
  /** True if this connection is a reconnect to an existing match */
  isReconnect: boolean;
  /** Stake amount from the server (authoritative) */
  matchStake: string | null;
  /** Denom from the server (authoritative) */
  matchDenom: string | null;
  /** True when both players have funded */
  bothFunded: boolean;
  /** True when this player has already funded (for reconnect) */
  selfFunded: boolean;
  rollDice: () => void;
  sendMove: (from: number | "bar", to: number | "off") => void;
  offerDouble: () => void;
  acceptDouble: () => void;
  resignDouble: () => void;
  endTurn: () => void;
  forfeit: () => void;
  cancelMatch: () => void;
  /** Notify server that this player has funded the match on-chain */
  notifyFunded: () => void;
}

const PING_INTERVAL_MS = 30_000;

/** Generate or retrieve a stable guest ID for this browser tab */
function getGuestId(): string {
  const KEY = "shadow_arena_guest_id";
  let id = sessionStorage.getItem(KEY);
  if (!id) {
    id = `guest_${crypto.randomUUID().slice(0, 12)}`;
    sessionStorage.setItem(KEY, id);
  }
  return id;
}

export function useGameSocket(
  options: UseGameSocketOptions,
): UseGameSocketReturn {
  const {
    enabled,
    serverUrl,
    address,
    matchId: requestedMatchId,
    stake,
    denom,
    mode,
    difficulty,
    guest,
    create,
  } = options;

  const [gameState, setGameState] = useState<ClientGameState>(() =>
    createInitialState(),
  );
  const [matchId, setMatchId] = useState<string | null>(null);
  const [myPlayer, setMyPlayer] = useState<ClientPlayer | null>(null);
  const [connected, setConnected] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [opponentDisconnected, setOpponentDisconnected] = useState(false);
  const [gamePaused, setGamePaused] = useState(false);
  const [gameOver, setGameOver] = useState<GameOverInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastDice, setLastDice] = useState<number[]>([]);
  const [turnStartedAt, setTurnStartedAt] = useState<number>(Date.now());
  const [createdMatchId, setCreatedMatchId] = useState<string | null>(null);
  const [stakeReady, setStakeReady] = useState(false);
  const [stakeOnChainError, setStakeOnChainError] = useState<string | null>(null);
  const [isReconnect, setIsReconnect] = useState(false);
  const [matchStake, setMatchStake] = useState<string | null>(null);
  const [matchDenom, setMatchDenom] = useState<string | null>(null);
  const [bothFunded, setBothFunded] = useState(false);
  const [selfFunded, setSelfFunded] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const closingRef = useRef(false); // guards against StrictMode double-mount

  const send = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  // Game actions
  const rollDice = useCallback(() => send({ type: "ROLL_DICE" }), [send]);
  const sendMove = useCallback(
    (from: number | "bar", to: number | "off") => {
      send({ type: "MOVE", move: { from, to } as ServerMove });
    },
    [send],
  );
  const offerDouble = useCallback(() => send({ type: "OFFER_DOUBLE" }), [send]);
  const acceptDouble = useCallback(
    () => send({ type: "ACCEPT_DOUBLE" }),
    [send],
  );
  const resignDouble = useCallback(
    () => send({ type: "RESIGN_DOUBLE" }),
    [send],
  );
  const endTurn = useCallback(() => send({ type: "END_TURN" }), [send]);
  const forfeit = useCallback(() => send({ type: "FORFEIT" }), [send]);
  const cancelMatch = useCallback(() => send({ type: "CANCEL_MATCH" }), [send]);
  const notifyFunded = useCallback(() => {
    send({ type: "PLAYER_FUNDED" });
    setSelfFunded(true);
  }, [send]);

  useEffect(() => {
    if (!enabled) return;

    // If StrictMode re-mounted and the previous WS is still alive or connecting, reuse it
    if (
      closingRef.current &&
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      closingRef.current = false;
      if (wsRef.current.readyState === WebSocket.OPEN) {
        setConnected(true);
      }
      return;
    }
    closingRef.current = false;

    const params = new URLSearchParams();
    if (guest) {
      params.set("address", getGuestId());
      params.set("guest", "true");
    } else {
      params.set("address", address);
    }
    if (requestedMatchId) params.set("matchId", requestedMatchId);
    if (stake) params.set("stake", stake);
    if (denom) params.set("denom", denom);
    if (mode === "ai") {
      params.set("mode", "ai");
      params.set("difficulty", difficulty || "easy");
    }
    if (create) params.set("create", "true");
    const url = `${serverUrl}?${params.toString()}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setError(null);
      pingRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "PING" }));
        }
      }, PING_INTERVAL_MS);
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data as string);

      switch (msg.type) {
        case "MATCH_JOINED":
          setMatchId(msg.matchId);
          setMyPlayer(msg.player === "A" ? 0 : 1);
          setWaiting(false);
          setGameState(serverToClientState(msg.state as ServerGameState));
          setTurnStartedAt(Date.now());
          setLastDice([]);
          // Store server-authoritative stake/denom
          if (msg.stake) setMatchStake(msg.stake);
          if (msg.denom) setMatchDenom(msg.denom);
          if (msg.reconnect) {
            setIsReconnect(true);
            setStakeReady(true);
            // Respect actual funded status from server
            if (msg.funded) {
              setSelfFunded(true);
            }
            if (msg.bothFunded) {
              setBothFunded(true);
            }
          }
          break;

        case "GAME_STATE":
          setMatchId(msg.matchId);
          setWaiting(false);
          {
            const newState = serverToClientState(msg.state as ServerGameState);
            setGameState((prev) => {
              // Reset turn timer when the turn actually changed
              if (prev.turn !== newState.turn) {
                setTurnStartedAt(Date.now());
                setLastDice([]);
              }
              return newState;
            });
          }
          break;

        case "DICE_ROLLED":
          setLastDice(msg.dice);
          break;

        case "MOVE_APPLIED":
          setGameState(serverToClientState(msg.state as ServerGameState));
          break;

        case "DOUBLE_OFFERED":
          setGameState((prev) => ({ ...prev, doubleOffered: true }));
          break;

        case "DOUBLE_ACCEPTED":
          setGameState((prev) => ({
            ...prev,
            cubeValue: msg.cubeValue,
            cubeOwner: msg.owner === "A" ? 0 : 1,
            doubleOffered: false,
          }));
          break;

        case "DOUBLE_RESIGNED":
          break;

        case "GAME_OVER":
          setGameOver({
            winner: msg.winner === "A" ? 0 : 1,
            multiplier: msg.multiplier,
            gameHash: msg.gameHash,
          });
          break;

        case "WAITING_FOR_OPPONENT":
          setWaiting(true);
          break;

        case "MATCH_CREATED":
          setCreatedMatchId(msg.matchId);
          setWaiting(true);
          break;

        case "OPPONENT_DISCONNECTED":
          setOpponentDisconnected(true);
          break;

        case "OPPONENT_RECONNECTED":
          setOpponentDisconnected(false);
          break;

        case "GAME_PAUSED":
          setGamePaused(true);
          break;

        case "GAME_RESUMED":
          setGamePaused(false);
          setOpponentDisconnected(false);
          setTurnStartedAt(Date.now() - (45000 - (msg.remainingTurnMs || 45000)));
          break;

        case "FORFEIT":
          break;

        case "STAKE_READY":
          setStakeReady(true);
          break;

        case "STAKE_ERROR":
          setStakeOnChainError(msg.message);
          break;

        case "BOTH_FUNDED":
          setBothFunded(true);
          setTurnStartedAt(Date.now()); // Reset timer — game actually starts now
          break;

        case "ERROR":
          setError(msg.message);
          break;

        case "PONG":
          break;
      }
    };

    ws.onclose = () => {
      setConnected(false);
      if (pingRef.current) {
        clearInterval(pingRef.current);
        pingRef.current = null;
      }
    };

    ws.onerror = () => {
      setError("Connection failed. Is the game server running?");
    };

    // Visibility change detection — pause game when tab is hidden
    const handleVisibility = () => {
      if (ws.readyState !== WebSocket.OPEN) return;
      if (document.hidden) {
        ws.send(JSON.stringify({ type: "VISIBILITY_HIDDEN" }));
      } else {
        ws.send(JSON.stringify({ type: "VISIBILITY_VISIBLE" }));
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      // Delay close slightly so StrictMode re-mount can reclaim the socket
      closingRef.current = true;
      const wsToClose = ws;
      const pingToClose = pingRef.current;
      setTimeout(() => {
        if (closingRef.current) {
          // Not reclaimed — actually close
          if (pingToClose) clearInterval(pingToClose);
          pingRef.current = null;
          wsToClose.close();
          closingRef.current = false;
        }
      }, 100);
    };
  }, [
    enabled,
    serverUrl,
    address,
    requestedMatchId,
    stake,
    denom,
    mode,
    difficulty,
    guest,
    create,
  ]);

  return {
    gameState,
    matchId,
    myPlayer,
    connected,
    waiting,
    opponentDisconnected,
    gamePaused,
    gameOver,
    error,
    lastDice,
    turnStartedAt,
    createdMatchId,
    stakeReady,
    stakeOnChainError,
    isReconnect,
    matchStake,
    matchDenom,
    bothFunded,
    selfFunded,
    rollDice,
    sendMove,
    offerDouble,
    acceptDouble,
    resignDouble,
    endTurn,
    forfeit,
    cancelMatch,
    notifyFunded,
  };
}
