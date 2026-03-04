import { GameState, Player, Step } from './types';

// Web Crypto API fallback for Node/testing environments
const getCrypto = () => {
  if (typeof window !== 'undefined' && window.crypto) return window.crypto;
  if (typeof globalThis !== 'undefined' && globalThis.crypto) return globalThis.crypto;
  try {
    return require('crypto').webcrypto;
  } catch (e) {
    throw new Error('Crypto module not available for secure dice generation.');
  }
};

/**
 * Generates two secure random dice values (1-6).
 * Completely decoupled from game state progression.
 */
export function generateDice(): [number, number] {
  const crypto = getCrypto();
  const array = new Uint32Array(2);
  crypto.getRandomValues(array);
  return [(array[0] % 6) + 1, (array[1] % 6) + 1];
}

export function createInitialState(): GameState {
  const board = new Array(24).fill(0);
  
  // Standard starting positions
  // Player 0 (moves 23 -> 0)
  board[23] = 2;
  board[12] = 5;
  board[7] = 3;
  board[5] = 5;
  
  // Player 1 (moves 0 -> 23)
  board[0] = -2;
  board[11] = -5;
  board[16] = -3;
  board[18] = -5;

  return {
    board,
    bar: { 0: 0, 1: 0 },
    off: { 0: 0, 1: 0 },
    turn: 0,
    dice: [],
    cubeValue: 1,
    cubeOwner: null,
    doubleOffered: false,
    winner: null,
    winType: null,
    multiplier: 1
  };
}

export function getPipCount(state: GameState, player: Player): number {
  let pips = state.bar[player] * 25;
  for (let i = 0; i < 24; i++) {
    if (player === 0 && state.board[i] > 0) {
      pips += state.board[i] * (i + 1); // Index 0 is 1 step away from bearing off
    } else if (player === 1 && state.board[i] < 0) {
      pips += Math.abs(state.board[i]) * (24 - i); // Index 23 is 1 step away
    }
  }
  return pips;
}

export function canBearOff(state: GameState, player: Player): boolean {
  if (state.bar[player] > 0) return false;
  for (let i = 0; i < 24; i++) {
    // Player A home board: points 1-6 (bottom-right)
    if (player === 0 && state.board[i] > 0 && i > 5) return false;
    // Player B home board: points 19-24 (top-right)
    if (player === 1 && state.board[i] < 0 && i < 18) return false;
  }
  return true;
}

function isPointOpen(state: GameState, point: number, player: Player): boolean {
  const count = state.board[point];
  if (player === 0) return count >= -1; // Can land if empty, own, or 1 opponent (hit)
  return count <= 1; // Can land if empty, own, or 1 opponent (hit)
}

export function getValidSteps(state: GameState): Step[] {
  if (state.winner !== null || state.doubleOffered || state.dice.length === 0) return [];

  const steps: Step[] = [];
  const p = state.turn;
  const sign = p === 0 ? 1 : -1;
  const uniqueDice = Array.from(new Set(state.dice));

  // 1. Mandatory Bar re-entry
  if (state.bar[p] > 0) {
    for (const die of uniqueDice) {
      const to = p === 0 ? 24 - die : die - 1; // P0 enters points 19-24, P1 enters points 1-6
      if (isPointOpen(state, to, p)) {
        steps.push({ from: 'bar', to, die });
      }
    }
    return steps;
  }

  // 2. Normal moves and Bear-off
  const bearingOff = canBearOff(state, p);

  for (let from = 0; from < 24; from++) {
    if (state.board[from] * sign <= 0) continue; // Not current player's checker

    for (const die of uniqueDice) {
      const to = p === 0 ? from - die : from + die;

      if (to < 0 || to > 23) {
        // Bear off attempt
        if (bearingOff) {
          const exactDist = p === 0 ? from + 1 : 24 - from;
          if (die === exactDist) {
            steps.push({ from, to: 'off', die });
          } else if (die > exactDist) {
            // Can use larger die only if no checkers are further away
            const noCheckersFurther = p === 0
              ? !state.board.slice(from + 1, 6).some(c => c > 0)
              : !state.board.slice(18, from).some(c => c < 0);
            if (noCheckersFurther) {
              steps.push({ from, to: 'off', die });
            }
          }
        }
      } else {
        // Normal board move
        if (isPointOpen(state, to, p)) {
          steps.push({ from, to, die });
        }
      }
    }
  }

  return steps;
}

export function setDice(state: GameState, roll: [number, number]): GameState {
  if (state.winner !== null) return state;
  if (state.doubleOffered) throw new Error("Must resolve double first");
  
  const next = { ...state, dice: [...roll] };
  
  // Handle doubles giving 4 moves
  if (roll[0] === roll[1]) {
    next.dice = [roll[0], roll[0], roll[0], roll[0]];
  }

  // Auto-switch turn if absolutely no valid moves exist
  if (getValidSteps(next).length === 0) {
    next.dice = [];
    next.turn = (1 - next.turn) as Player;
  }
  
  return next;
}

export function applyStep(state: GameState, from: number | 'bar', to: number | 'off'): GameState {
  const validSteps = getValidSteps(state);
  
  // Strict legal move enforcement
  const step = validSteps.find(s => s.from === from && s.to === to);
  if (!step) throw new Error(`Invalid move from ${from} to ${to}`);

  // Pure function: Clone deep state
  const next: GameState = {
    ...state,
    board: [...state.board],
    bar: { ...state.bar },
    off: { ...state.off },
    dice: [...state.dice]
  };
  const p = next.turn;

  // 1. Remove from source
  if (from === 'bar') {
    next.bar[p]--;
  } else {
    next.board[from] -= (p === 0 ? 1 : -1);
  }

  // 2. Add to destination & Handle Hits
  if (to === 'off') {
    next.off[p]++;
  } else {
    const opponent = (1 - p) as Player;
    const oppSign = opponent === 0 ? 1 : -1;
    
    if (next.board[to] === oppSign) {
      // Hit blot!
      next.board[to] = 0;
      next.bar[opponent]++;
    }
    next.board[to] += (p === 0 ? 1 : -1);
  }

  // 3. Consume the die
  const dieIdx = next.dice.indexOf(step.die);
  next.dice.splice(dieIdx, 1);

  // 4. Check Win Conditions
  if (next.off[p] === 15) {
    next.winner = p;
    const opponent = (1 - p) as Player;
    
    if (next.off[opponent] > 0) {
      next.winType = 'normal';
      next.multiplier = next.cubeValue;
    } else {
      // Check for gammon/backgammon
      const opponentHasInWinnerHome = p === 0 
        ? next.board.slice(0, 6).some(c => c < 0) 
        : next.board.slice(18, 24).some(c => c > 0);
        
      if (next.bar[opponent] > 0 || opponentHasInWinnerHome) {
        next.winType = 'backgammon';
        next.multiplier = next.cubeValue * 3;
      } else {
        next.winType = 'gammon';
        next.multiplier = next.cubeValue * 2;
      }
    }
    next.dice = []; // End game instantly
    return next;
  }

  // 5. Turn Management
  if (next.dice.length > 0 && getValidSteps(next).length === 0) {
    // Dice left, but no valid moves available (e.g., blocked)
    next.dice = [];
  }

  if (next.dice.length === 0) {
    next.turn = (1 - next.turn) as Player;
  }

  return next;
}

export function offerDouble(state: GameState): GameState {
  if (state.winner !== null) throw new Error("Game is over");
  if (state.dice.length > 0) throw new Error("Cannot double after rolling");
  if (state.cubeOwner !== null && state.cubeOwner !== state.turn) throw new Error("Not cube owner");
  if (state.doubleOffered) throw new Error("Double already offered");

  return { ...state, doubleOffered: true };
}

export function acceptDouble(state: GameState): GameState {
  if (!state.doubleOffered) throw new Error("No double offered");
  return {
    ...state,
    doubleOffered: false,
    cubeValue: state.cubeValue * 2,
    cubeOwner: (1 - state.turn) as Player // Opponent takes ownership
  };
}

export function rejectDouble(state: GameState): GameState {
  if (!state.doubleOffered) throw new Error("No double offered");
  return {
    ...state,
    doubleOffered: false,
    winner: state.turn, // The offerer wins
    winType: 'resign',
    multiplier: state.cubeValue // Multiplier remains un-doubled
  };
}
