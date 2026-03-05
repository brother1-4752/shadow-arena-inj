/**
 * Maps between server GameState (Player 'A'|'B') and client GameState (Player 0|1).
 * Board arrays use identical indexing and sign conventions.
 */

import type { GameState as ClientGameState, Player as ClientPlayer } from '../engine/types';

// Server-side types (mirrored from server/src/engine/core.ts)
export interface ServerGameState {
  points: number[];
  bar: { A: number; B: number };
  borneOff: { A: number; B: number };
  currentPlayer: 'A' | 'B';
  dice: number[];
  usedDice: number[];
  doublingCube: number;
  cubeOwner: 'A' | 'B' | null;
  cubeOffered: boolean;
  phase: 'pre-roll' | 'rolling' | 'moving' | 'game-over';
  winner: 'A' | 'B' | null;
  multiplier: 1 | 2 | 3;
  turnNumber: number;
}

export interface ServerMove {
  from: number | 'bar';
  to: number | 'off';
}

/** Convert server player to client player */
function toClientPlayer(p: 'A' | 'B'): ClientPlayer {
  return p === 'A' ? 0 : 1;
}

/** Compute remaining dice (server sends full dice + usedDice) */
function getRemainingDice(dice: number[], usedDice: number[]): number[] {
  const remaining = [...dice];
  for (const used of usedDice) {
    const idx = remaining.indexOf(used);
    if (idx !== -1) remaining.splice(idx, 1);
  }
  return remaining;
}

/** Convert server GameState to client GameState */
export function serverToClientState(server: ServerGameState): ClientGameState {
  return {
    board: [...server.points],
    bar: { 0: server.bar.A, 1: server.bar.B },
    off: { 0: server.borneOff.A, 1: server.borneOff.B },
    turn: toClientPlayer(server.currentPlayer),
    dice: getRemainingDice(server.dice, server.usedDice),
    cubeValue: server.doublingCube,
    cubeOwner: server.cubeOwner === null ? null : toClientPlayer(server.cubeOwner),
    doubleOffered: server.cubeOffered,
    winner: server.winner === null ? null : toClientPlayer(server.winner),
    winType: server.winner
      ? (server.multiplier === 3 ? 'backgammon' : server.multiplier === 2 ? 'gammon' : 'normal')
      : null,
    multiplier: server.multiplier,
  };
}
