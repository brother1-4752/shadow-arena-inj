import { GameState, Move, Player } from "../engine/core";

// Client → Server
export type ClientMessage =
  | { type: "ROLL_DICE" }
  | { type: "MOVE"; move: Move }
  | { type: "OFFER_DOUBLE" }
  | { type: "ACCEPT_DOUBLE" }
  | { type: "RESIGN_DOUBLE" }
  | { type: "END_TURN" }
  | { type: "FORFEIT" }
  | { type: "CANCEL_MATCH" }
  | { type: "VISIBILITY_HIDDEN" }
  | { type: "VISIBILITY_VISIBLE" }
  | { type: "CHECK_ACTIVE_MATCH" }
  | { type: "PLAYER_FUNDED" }
  | { type: "PING" };

// Server → Client
export type ServerMessage =
  | { type: "GAME_STATE"; state: GameState; matchId: string }
  | { type: "MATCH_JOINED"; matchId: string; player: Player; state: GameState; reconnect?: boolean; stake?: string; denom?: string; funded?: boolean; bothFunded?: boolean }
  | { type: "MATCH_CREATED"; matchId: string }
  | { type: "DICE_ROLLED"; dice: number[]; player: Player }
  | { type: "MOVE_APPLIED"; state: GameState }
  | { type: "DOUBLE_OFFERED"; by: Player; cubeValue: number }
  | { type: "DOUBLE_ACCEPTED"; cubeValue: number; owner: Player }
  | { type: "DOUBLE_RESIGNED"; loser: Player }
  | { type: "TURN_ENDED"; nextPlayer: Player }
  | {
      type: "GAME_OVER";
      winner: Player;
      multiplier: 1 | 2 | 3;
      gameHash: string;
    }
  | { type: "ERROR"; message: string }
  | { type: "PONG" }
  | { type: "WAITING_FOR_OPPONENT" }
  | { type: "OPPONENT_DISCONNECTED"; gracePeriodSeconds: number }
  | { type: "OPPONENT_RECONNECTED" }
  | { type: "GAME_PAUSED" }
  | { type: "GAME_RESUMED"; remainingTurnMs: number }
  | { type: "FORFEIT"; address: string }
  | { type: "STAKE_READY"; matchId: string }
  | { type: "STAKE_ERROR"; message: string }
  | { type: "BOTH_FUNDED"; matchId: string }
  | { type: "ACTIVE_MATCH"; matchId: string; stake: string; denom: string }
  | { type: "NO_ACTIVE_MATCH" };
