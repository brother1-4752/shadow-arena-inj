/**
 * Backgammon Rule Engine
 * Server-authoritative version (ported from apps/game-web)
 */

export type Player = 'A' | 'B';

export interface GameState {
  points: number[];        // 24 points, positive = Player A, negative = Player B
  bar: { A: number; B: number };
  borneOff: { A: number; B: number };
  currentPlayer: Player;
  dice: number[];
  usedDice: number[];
  doublingCube: number;
  cubeOwner: Player | null;
  cubeOffered: boolean;
  phase: 'pre-roll' | 'rolling' | 'moving' | 'game-over';
  winner: Player | null;
  multiplier: 1 | 2 | 3;
  turnNumber: number;
}

export interface Move {
  from: number | 'bar';
  to: number | 'off';
}

export function createInitialState(): GameState {
  const points = new Array(24).fill(0);

  // Standard backgammon setup
  // Player A moves 24→1, Player B moves 1→24
  points[23] = 2;   // point 24: Player A
  points[12] = 5;   // point 13: Player A
  points[7] = 3;    // point 8: Player A
  points[5] = 5;    // point 6: Player A

  points[0] = -2;   // point 1: Player B
  points[11] = -5;  // point 12: Player B
  points[16] = -3;  // point 17: Player B
  points[18] = -5;  // point 19: Player B

  return {
    points,
    bar: { A: 0, B: 0 },
    borneOff: { A: 0, B: 0 },
    currentPlayer: 'A',
    dice: [],
    usedDice: [],
    doublingCube: 1,
    cubeOwner: null,
    cubeOffered: false,
    phase: 'pre-roll',
    winner: null,
    multiplier: 1,
    turnNumber: 1,
  };
}

export function rollDice(): [number, number] {
  // Server-side RNG using crypto
  const { randomInt } = require('crypto');
  return [randomInt(1, 7), randomInt(1, 7)];
}

export function getDiceList(dice: [number, number]): number[] {
  if (dice[0] === dice[1]) {
    return [dice[0], dice[0], dice[0], dice[0]];
  }
  return [...dice];
}

export function getHomeRange(player: Player): [number, number] {
  // Player A home: points 1-6 (index 0-5)
  // Player B home: points 19-24 (index 18-23)
  return player === 'A' ? [0, 5] : [18, 23];
}

export function getReEntryRange(player: Player): [number, number] {
  // Player A re-enters at opponent's home (19-24, index 18-23)
  // Player B re-enters at opponent's home (1-6, index 0-5)
  return player === 'A' ? [18, 23] : [0, 5];
}

export function isAllHome(state: GameState, player: Player): boolean {
  const [homeStart, homeEnd] = getHomeRange(player);
  const sign = player === 'A' ? 1 : -1;

  if (state.bar[player] > 0) return false;

  let count = 0;
  for (let i = homeStart; i <= homeEnd; i++) {
    if (Math.sign(state.points[i]) === sign) {
      count += Math.abs(state.points[i]);
    }
  }
  count += state.borneOff[player];

  return count === 15;
}

export function getLegalMoves(state: GameState): Move[] {
  const player = state.currentPlayer;
  const remainingDice = getRemainingDice(state);

  if (remainingDice.length === 0) return [];

  const moves: Move[] = [];
  const sign = player === 'A' ? 1 : -1;
  const direction = player === 'A' ? -1 : 1;

  // If on bar, must re-enter first
  if (state.bar[player] > 0) {
    const [reStart, reEnd] = getReEntryRange(player);
    for (const die of new Set(remainingDice)) {
      const targetIdx = player === 'A'
        ? reEnd - die + 1
        : reStart + die - 1;

      if (targetIdx >= reStart && targetIdx <= reEnd) {
        const point = state.points[targetIdx];
        if (Math.sign(point) !== -sign || Math.abs(point) <= 1) {
          moves.push({ from: 'bar', to: targetIdx });
        }
      }
    }
    return moves;
  }

  const allHome = isAllHome(state, player);

  for (let i = 0; i < 24; i++) {
    if (Math.sign(state.points[i]) !== sign) continue;

    for (const die of new Set(remainingDice)) {
      const targetIdx = i + direction * die;

      // Bear-off
      if (allHome) {
        const [homeStart, homeEnd] = getHomeRange(player);
        if (player === 'A' && targetIdx < 0) {
          // Check exact or overshoot bear-off
          const exactIdx = i - die;
          if (exactIdx < 0) {
            // Overshoot: only allowed if no pieces on higher points
            let hasHigher = false;
            for (let j = i + 1; j <= homeEnd; j++) {
              if (state.points[j] > 0) { hasHigher = true; break; }
            }
            if (!hasHigher) moves.push({ from: i, to: 'off' });
          } else {
            moves.push({ from: i, to: 'off' });
          }
          continue;
        }
        if (player === 'B' && targetIdx >= 24) {
          const [, bHomeEnd] = getHomeRange('B');
          let hasHigher = false;
          for (let j = i - 1; j >= 18; j--) {
            if (state.points[j] < 0) { hasHigher = true; break; }
          }
          if (!hasHigher) moves.push({ from: i, to: 'off' });
          continue;
        }
      }

      if (targetIdx < 0 || targetIdx >= 24) continue;

      const point = state.points[targetIdx];
      if (Math.sign(point) !== -sign || Math.abs(point) <= 1) {
        moves.push({ from: i, to: targetIdx });
      }
    }
  }

  return moves;
}

export function getRemainingDice(state: GameState): number[] {
  const remaining = [...state.dice];
  for (const used of state.usedDice) {
    const idx = remaining.indexOf(used);
    if (idx !== -1) remaining.splice(idx, 1);
  }
  return remaining;
}

export function applyMove(state: GameState, move: Move): GameState {
  const next = deepClone(state);
  const player = next.currentPlayer;
  const sign = player === 'A' ? 1 : -1;
  const direction = player === 'A' ? -1 : 1;

  let dieUsed: number;

  if (move.from === 'bar') {
    next.bar[player]--;
    const [reStart, reEnd] = getReEntryRange(player);
    const toIdx = move.to as number;
    dieUsed = player === 'A' ? reEnd - toIdx + 1 : toIdx - reStart + 1;
  } else {
    const fromIdx = move.from as number;
    next.points[fromIdx] -= sign;
    dieUsed = Math.abs((move.to === 'off' ? (player === 'A' ? -1 : 24) : move.to as number) - fromIdx);
  }

  if (move.to === 'off') {
    next.borneOff[player]++;
  } else {
    const toIdx = move.to as number;
    const existing = next.points[toIdx];

    if (Math.sign(existing) === -sign && Math.abs(existing) === 1) {
      // Hit
      next.points[toIdx] = sign;
      const opponent: Player = player === 'A' ? 'B' : 'A';
      next.bar[opponent]++;
    } else {
      next.points[toIdx] += sign;
    }
  }

  next.usedDice = [...next.usedDice, dieUsed];
  return next;
}

export function checkWin(state: GameState): { winner: Player | null; multiplier: 1 | 2 | 3 } {
  if (state.borneOff.A === 15) {
    let multiplier: 1 | 2 | 3 = 1;
    if (state.borneOff.B === 0) {
      multiplier = state.bar.B > 0 || hasCheckersInWinnerHome(state, 'A') ? 3 : 2;
    }
    return { winner: 'A', multiplier };
  }
  if (state.borneOff.B === 15) {
    let multiplier: 1 | 2 | 3 = 1;
    if (state.borneOff.A === 0) {
      multiplier = state.bar.A > 0 || hasCheckersInWinnerHome(state, 'B') ? 3 : 2;
    }
    return { winner: 'B', multiplier };
  }
  return { winner: null, multiplier: 1 };
}

function hasCheckersInWinnerHome(state: GameState, winner: Player): boolean {
  const [homeStart, homeEnd] = getHomeRange(winner);
  const loserSign = winner === 'A' ? -1 : 1;
  for (let i = homeStart; i <= homeEnd; i++) {
    if (Math.sign(state.points[i]) === loserSign) return true;
  }
  return false;
}

export function endTurn(state: GameState): GameState {
  const next = deepClone(state);
  next.currentPlayer = next.currentPlayer === 'A' ? 'B' : 'A';
  next.dice = [];
  next.usedDice = [];
  next.cubeOffered = false;
  next.phase = 'pre-roll';
  next.turnNumber++;
  return next;
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}
