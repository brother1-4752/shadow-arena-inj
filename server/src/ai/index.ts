/**
 * Shadow Arena AI Opponent
 * Server-side AI logic (ported from apps/game-web GameShell.tsx)
 */

import {
  GameState,
  Move,
  Player,
  getLegalMoves,
  applyMove,
} from "../engine/core";

export type AIDifficulty = "easy" | "normal";

/**
 * Choose the best move for the current player given difficulty level.
 * - easy: random legal move
 * - normal: score-based evaluation (hit, make point, blot penalty, pip reduction)
 */
export function chooseMove(
  state: GameState,
  difficulty: AIDifficulty,
): Move | null {
  const legalMoves = getLegalMoves(state);
  if (legalMoves.length === 0) return null;

  if (difficulty === "easy") {
    return legalMoves[Math.floor(Math.random() * legalMoves.length)];
  }

  // Normal difficulty: score-based evaluation
  const player = state.currentPlayer;
  const sign = player === "A" ? 1 : -1;
  const pipsBefore = getPipCount(state, player);

  let bestMove = legalMoves[0];
  let bestScore = -Infinity;

  for (const move of legalMoves) {
    const nextState = applyMove(state, move);
    let score = 0;

    if (move.to !== "off" && typeof move.to === "number") {
      // +2 for hitting an opponent blot
      if (
        Math.sign(state.points[move.to]) === -sign &&
        Math.abs(state.points[move.to]) === 1
      ) {
        score += 2;
      }
      // +2 for making a point (2+ own checkers)
      if (
        Math.sign(nextState.points[move.to]) === sign &&
        Math.abs(nextState.points[move.to]) >= 2
      ) {
        score += 2;
      }
    }

    // -2 for each exposed blot
    for (let i = 0; i < 24; i++) {
      if (
        Math.sign(nextState.points[i]) === sign &&
        Math.abs(nextState.points[i]) === 1
      ) {
        score -= 2;
      }
    }

    // +1 for reducing pip count
    const pipsAfter = getPipCount(nextState, player);
    if (pipsAfter < pipsBefore) {
      score += 1;
    }

    // Random tiebreaker
    score += Math.random() * 0.1;

    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  return bestMove;
}

/** Calculate pip count for a player */
function getPipCount(state: GameState, player: Player): number {
  const sign = player === "A" ? 1 : -1;
  let pips = state.bar[player] * 25;
  for (let i = 0; i < 24; i++) {
    if (Math.sign(state.points[i]) === sign) {
      const dist = player === "A" ? i + 1 : 24 - i;
      pips += Math.abs(state.points[i]) * dist;
    }
  }
  return pips;
}
