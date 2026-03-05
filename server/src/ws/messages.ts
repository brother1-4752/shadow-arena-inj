import { GameState, Move, Player } from "../engine/core";

// Client → Server
export type ClientMessage =
  | { type: "ROLL_DICE" }
  | { type: "MOVE"; move: Move }
  | { type: "OFFER_DOUBLE" }
  | { type: "ACCEPT_DOUBLE" }
  | { type: "RESIGN_DOUBLE" }
  | { type: "END_TURN" }
  | { type: "PING" };

// Server → Client
export type ServerMessage =
  | { type: "GAME_STATE"; state: GameState; matchId: string }
  | { type: "MATCH_JOINED"; matchId: string; player: Player; state: GameState }
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
  | { type: "OPPONENT_RECONNECTED" };
