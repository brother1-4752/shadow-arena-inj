export type Player = 0 | 1;

export interface GameState {
  /**
   * 24 points. Positive numbers are Player 0 checkers, negative are Player 1.
   * Player 0 moves from index 23 towards 0.
   * Player 1 moves from index 0 towards 23.
   */
  board: number[];
  
  /** Checkers currently on the bar for each player */
  bar: { 0: number; 1: number };
  
  /** Checkers successfully borne off for each player */
  off: { 0: number; 1: number };
  
  /** Whose turn it is currently */
  turn: Player;
  
  /** Remaining dice values to be played this turn (e.g., [3, 5] or [4, 4, 4, 4]) */
  dice: number[];
  
  /** Current value of the doubling cube */
  cubeValue: number;
  
  /** Who owns the cube. Null means centered (anyone can double) */
  cubeOwner: Player | null;
  
  /** If true, the current turn player has offered a double */
  doubleOffered: boolean;
  
  /** The winner of the game, or null if ongoing */
  winner: Player | null;
  
  /** The type of win, affecting the final multiplier */
  winType: 'normal' | 'gammon' | 'backgammon' | 'resign' | null;
  
  /** The final score multiplier (cubeValue * winType multiplier) */
  multiplier: number;
}

export type Step = {
  from: number | 'bar';
  to: number | 'off';
  die: number;
};
