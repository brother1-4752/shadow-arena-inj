import { useState, useEffect, useCallback, useRef } from 'react';
import type { GameState as ClientGameState, Player as ClientPlayer } from '../engine/types';
import { createInitialState } from '../engine/core';
import { serverToClientState, type ServerGameState, type ServerMove } from './stateMapper';

interface UseGameSocketOptions {
  enabled: boolean;
  serverUrl: string;
  address: string;
  matchId?: string;
  stake?: string;
  denom?: string;
  mode?: 'pvp' | 'ai';
  difficulty?: 'easy' | 'normal';
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
  gameOver: GameOverInfo | null;
  error: string | null;
  rollDice: () => void;
  sendMove: (from: number | 'bar', to: number | 'off') => void;
  offerDouble: () => void;
  acceptDouble: () => void;
  resignDouble: () => void;
  endTurn: () => void;
}

const PING_INTERVAL_MS = 30_000;

export function useGameSocket(options: UseGameSocketOptions): UseGameSocketReturn {
  const { enabled, serverUrl, address, matchId: requestedMatchId, stake, denom, mode, difficulty } = options;

  const [gameState, setGameState] = useState<ClientGameState>(() => createInitialState());
  const [matchId, setMatchId] = useState<string | null>(null);
  const [myPlayer, setMyPlayer] = useState<ClientPlayer | null>(null);
  const [connected, setConnected] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [opponentDisconnected, setOpponentDisconnected] = useState(false);
  const [gameOver, setGameOver] = useState<GameOverInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const send = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  // Game actions
  const rollDice = useCallback(() => send({ type: 'ROLL_DICE' }), [send]);
  const sendMove = useCallback((from: number | 'bar', to: number | 'off') => {
    send({ type: 'MOVE', move: { from, to } as ServerMove });
  }, [send]);
  const offerDouble = useCallback(() => send({ type: 'OFFER_DOUBLE' }), [send]);
  const acceptDouble = useCallback(() => send({ type: 'ACCEPT_DOUBLE' }), [send]);
  const resignDouble = useCallback(() => send({ type: 'RESIGN_DOUBLE' }), [send]);
  const endTurn = useCallback(() => send({ type: 'END_TURN' }), [send]);

  useEffect(() => {
    if (!enabled) return;

    const params = new URLSearchParams();
    params.set('address', address);
    if (requestedMatchId) params.set('matchId', requestedMatchId);
    if (stake) params.set('stake', stake);
    if (denom) params.set('denom', denom);
    if (mode === 'ai') {
      params.set('mode', 'ai');
      params.set('difficulty', difficulty || 'easy');
    }
    const url = `${serverUrl}?${params.toString()}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setError(null);
      pingRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'PING' }));
        }
      }, PING_INTERVAL_MS);
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data as string);

      switch (msg.type) {
        case 'MATCH_JOINED':
          setMatchId(msg.matchId);
          setMyPlayer(msg.player === 'A' ? 0 : 1);
          setWaiting(false);
          setGameState(serverToClientState(msg.state as ServerGameState));
          break;

        case 'GAME_STATE':
          setMatchId(msg.matchId);
          setWaiting(false);
          setGameState(serverToClientState(msg.state as ServerGameState));
          break;

        case 'DICE_ROLLED':
          break;

        case 'MOVE_APPLIED':
          setGameState(serverToClientState(msg.state as ServerGameState));
          break;

        case 'DOUBLE_OFFERED':
          setGameState(prev => ({ ...prev, doubleOffered: true }));
          break;

        case 'DOUBLE_ACCEPTED':
          setGameState(prev => ({
            ...prev,
            cubeValue: msg.cubeValue,
            cubeOwner: msg.owner === 'A' ? 0 : 1,
            doubleOffered: false,
          }));
          break;

        case 'DOUBLE_RESIGNED':
          break;

        case 'GAME_OVER':
          setGameOver({
            winner: msg.winner === 'A' ? 0 : 1,
            multiplier: msg.multiplier,
            gameHash: msg.gameHash,
          });
          break;

        case 'WAITING_FOR_OPPONENT':
          setWaiting(true);
          break;

        case 'OPPONENT_DISCONNECTED':
          setOpponentDisconnected(true);
          break;

        case 'OPPONENT_RECONNECTED':
          setOpponentDisconnected(false);
          break;

        case 'ERROR':
          setError(msg.message);
          break;

        case 'PONG':
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
      setError('Connection failed. Is the game server running?');
    };

    return () => {
      if (pingRef.current) {
        clearInterval(pingRef.current);
        pingRef.current = null;
      }
      ws.close();
    };
  }, [enabled, serverUrl, address, requestedMatchId, stake, denom, mode, difficulty]);

  return {
    gameState,
    matchId,
    myPlayer,
    connected,
    waiting,
    opponentDisconnected,
    gameOver,
    error,
    rollDice,
    sendMove,
    offerDouble,
    acceptDouble,
    resignDouble,
    endTurn,
  };
}
