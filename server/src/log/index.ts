import { createHash } from 'crypto';
import { Player } from '../engine/core';

export interface TurnLog {
  turn: number;
  player: Player;
  dice: number[];
  moves: { from: number | 'bar'; to: number | 'off' }[];
  cube_action: 'offer' | 'accept' | 'resign' | null;
  timestamp: number;
}

export interface MatchLog {
  match_id: string;
  player_a: string;
  player_b: string;
  stake: string;
  denom: string;
  turns: TurnLog[];
  final_board: number[];
  winner: string;
  win_type: 'normal' | 'gammon' | 'backgammon';
  multiplier: 1 | 2 | 3;
  started_at: number;
  ended_at: number;
}

export function generateGameHash(log: MatchLog): string {
  // Deterministic: sort keys alphabetically before stringifying
  const sorted = sortObjectKeys(log);
  const json = JSON.stringify(sorted);
  return createHash('sha256').update(json).digest('hex');
}

function sortObjectKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys);
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj as object)
      .sort()
      .reduce((acc, key) => {
        (acc as Record<string, unknown>)[key] = sortObjectKeys((obj as Record<string, unknown>)[key]);
        return acc;
      }, {} as Record<string, unknown>);
  }
  return obj;
}

export function createMatchLog(
  matchId: string,
  playerA: string,
  playerB: string,
  stake: string,
  denom: string,
): MatchLog {
  return {
    match_id: matchId,
    player_a: playerA,
    player_b: playerB,
    stake,
    denom,
    turns: [],
    final_board: [],
    winner: '',
    win_type: 'normal',
    multiplier: 1,
    started_at: Math.floor(Date.now() / 1000),
    ended_at: 0,
  };
}
