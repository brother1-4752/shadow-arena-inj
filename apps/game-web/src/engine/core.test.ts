import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  getPipCount,
  setDice,
  getValidSteps,
  applyStep,
  offerDouble,
  acceptDouble,
  rejectDouble
} from './core';

describe('Backgammon Core Engine', () => {
  it('has correct standard starting pip count (167 each)', () => {
    const state = createInitialState();
    expect(getPipCount(state, 0)).toBe(167);
    expect(getPipCount(state, 1)).toBe(167);
  });

  it('generates 4 dice when rolling doubles', () => {
    const state = createInitialState();
    const next = setDice(state, [4, 4]);
    expect(next.dice).toEqual([4, 4, 4, 4]);
  });

  it('prevents illegal moves entirely', () => {
    let state = createInitialState();
    state = setDice(state, [6, 1]);
    
    // Player 0 tries moving from an empty point
    expect(() => applyStep(state, 15, 9)).toThrow('Invalid move');
    
    // Try moving to a blocked point (Player 1 has 5 checkers on index 11)
    // Player 0 is on 12. Wants to move 1 space to 11.
    expect(() => applyStep(state, 12, 11)).toThrow('Invalid move');
  });

  it('enforces that a piece on the bar blocks all other moves', () => {
    let state = createInitialState();
    state.bar[0] = 1; // P0 has 1 on bar
    state = setDice(state, [3, 4]); // Enters on 21 or 20

    const steps = getValidSteps(state);
    
    // Every valid step MUST originate from 'bar'
    expect(steps.length).toBeGreaterThan(0);
    steps.forEach(step => {
      expect(step.from).toBe('bar');
    });

    // Attempting a normal board move should fail
    expect(() => applyStep(state, 23, 19)).toThrow('Invalid move');
  });

  it('hits a blot and sends it to the bar', () => {
    let state = createInitialState();
    // Setup a blot for P1 at index 10
    state.board[10] = -1;
    // P0 is at 12. Roll a 2 to hit it.
    state = setDice(state, [2, 5]);
    
    state = applyStep(state, 12, 10);
    
    // Point 10 should now belong to P0
    expect(state.board[10]).toBe(1);
    // P1 should have 1 on bar
    expect(state.bar[1]).toBe(1);
  });

  it('blocks bear-off until all checkers are home', () => {
    let state = createInitialState();
    // Move one P0 checker to 0 (home), leave others outside home
    state.board[23] = 0;
    state.board[0] = 2; // In home, but not ALL in home
    state = setDice(state, [1, 2]);

    const steps = getValidSteps(state);
    const bearOffSteps = steps.filter(s => s.to === 'off');
    expect(bearOffSteps.length).toBe(0);

    expect(() => applyStep(state, 0, 'off')).toThrow('Invalid move');
  });

  it('allows bear-off when all checkers are home', () => {
    let state = createInitialState();
    // Clear board for P0, put all 15 in home (points 0-5)
    state.board = new Array(24).fill(0);
    state.board[0] = 5;
    state.board[1] = 5;
    state.board[2] = 5;
    
    state = setDice(state, [1, 3]); // Can bear off from 0 (using 1) and 2 (using 3)

    let next = applyStep(state, 0, 'off');
    expect(next.off[0]).toBe(1);
    
    next = applyStep(next, 2, 'off');
    expect(next.off[0]).toBe(2);
  });

  it('detects Normal, Gammon, and Backgammon wins', () => {
    // Normal Win (Opponent bore off > 0)
    let state = createInitialState();
    state.board = new Array(24).fill(0);
    state.board[0] = 1; // P0 1 left to win
    state.off[0] = 14;
    state.off[1] = 1;   // P1 has borne off 1
    state = setDice(state, [1, 2]);
    let winState = applyStep(state, 0, 'off');
    
    expect(winState.winner).toBe(0);
    expect(winState.winType).toBe('normal');
    expect(winState.multiplier).toBe(1);

    // Gammon Win (Opponent bore off 0, none in winner home/bar)
    state = createInitialState();
    state.board = new Array(24).fill(0);
    state.board[0] = 1; 
    state.off[0] = 14;
    state.off[1] = 0; 
    state.board[10] = -15; // P1 checkers safely out of P0 home
    state = setDice(state, [1, 2]);
    winState = applyStep(state, 0, 'off');
    
    expect(winState.winner).toBe(0);
    expect(winState.winType).toBe('gammon');
    expect(winState.multiplier).toBe(2);

    // Backgammon Win (Opponent bore off 0 AND has checker on bar)
    state = createInitialState();
    state.board = new Array(24).fill(0);
    state.board[0] = 1; 
    state.off[0] = 14;
    state.off[1] = 0;
    state.bar[1] = 1; // P1 on bar
    state = setDice(state, [1, 2]);
    winState = applyStep(state, 0, 'off');
    
    expect(winState.winner).toBe(0);
    expect(winState.winType).toBe('backgammon');
    expect(winState.multiplier).toBe(3);
  });

  it('switches turns when dice are exhausted or blocked', () => {
    let state = createInitialState();
    state = setDice(state, [1, 2]);
    
    // Play 1
    state = applyStep(state, 23, 22);
    expect(state.turn).toBe(0); // Still P0's turn
    
    // Play 2
    state = applyStep(state, 22, 20);
    expect(state.turn).toBe(1); // Turn switched automatically
    expect(state.dice).toEqual([]);
  });

  it('handles doubling cube offer, accept, and reject', () => {
    let state = createInitialState();
    
    // P0 offers double
    state = offerDouble(state);
    expect(state.doubleOffered).toBe(true);
    
    // P1 rejects (resigns)
    const rejectState = rejectDouble(state);
    expect(rejectState.winner).toBe(0);
    expect(rejectState.winType).toBe('resign');
    expect(rejectState.multiplier).toBe(1);

    // P1 accepts
    const acceptState = acceptDouble(state);
    expect(acceptState.doubleOffered).toBe(false);
    expect(acceptState.cubeValue).toBe(2);
    expect(acceptState.cubeOwner).toBe(1); // P1 now owns the cube

    // P0 attempts to double again (should fail because P1 owns it)
    expect(() => offerDouble(acceptState)).toThrow('Not cube owner');
  });
});
