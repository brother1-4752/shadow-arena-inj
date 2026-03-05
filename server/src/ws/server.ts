import { WebSocket, WebSocketServer } from "ws";
import { submitResult } from "../chain/submit";
import { v4 as uuidv4 } from "uuid";
import {
  GameState,
  createInitialState,
  rollDice,
  getDiceList,
  getLegalMoves,
  applyMove,
  checkWin,
  endTurn,
  Move,
  Player,
} from "../engine/core";
import { MatchLog, TurnLog, createMatchLog, generateGameHash } from "../log";
import { ClientMessage, ServerMessage } from "./messages";
import { AIDifficulty, chooseMove } from "../ai";

interface PlayerConn {
  ws: WebSocket;
  address: string;
  player: Player;
  disconnectedAt?: number;
}

interface Match {
  id: string;
  players: Map<string, PlayerConn>; // address → conn
  state: GameState;
  log: MatchLog;
  turnLog: Partial<TurnLog>;
  stake: string;
  denom: string;
  turnTimer?: NodeJS.Timeout;
  disconnectTimer?: NodeJS.Timeout;
  aiDifficulty?: AIDifficulty;
  aiPlayer?: Player;
}

const TURN_TIMEOUT_MS = 45_000;
const RECONNECT_GRACE_MS = 60_000;

export class GameServer {
  private wss: WebSocketServer;
  private matches: Map<string, Match> = new Map();
  private waitingPlayer: { ws: WebSocket; address: string } | null = null;

  constructor(port: number) {
    this.wss = new WebSocketServer({ port });
    this.wss.on("connection", this.handleConnection.bind(this));
    console.log(`[GameServer] WebSocket server running on port ${port}`);
  }

  private handleConnection(ws: WebSocket, req: any) {
    const params = new URLSearchParams(req.url?.split("?")[1] || "");
    const address = params.get("address") || `anon_${uuidv4().slice(0, 8)}`;
    const matchId = params.get("matchId");
    const stake = params.get("stake") || "0";
    const denom = params.get("denom") || "inj";

    console.log(`[GameServer] Connection: ${address}`);

    ws.on("message", (data) => {
      try {
        const msg: ClientMessage = JSON.parse(data.toString());
        this.handleMessage(ws, address, msg);
      } catch (e) {
        this.send(ws, { type: "ERROR", message: "Invalid message format" });
      }
    });

    ws.on("close", () => this.handleDisconnect(address));

    // AI match, manual match, or auto-match
    const mode = params.get("mode");
    const difficulty = params.get("difficulty") as AIDifficulty | null;

    if (mode === "ai") {
      this.createAIMatch(ws, address, stake, denom, difficulty || "easy");
    } else if (matchId) {
      this.joinOrCreateMatch(ws, address, matchId, stake, denom);
    } else {
      this.autoMatch(ws, address, stake, denom);
    }
  }

  private autoMatch(
    ws: WebSocket,
    address: string,
    stake: string,
    denom: string,
  ) {
    if (
      this.waitingPlayer &&
      this.waitingPlayer.ws.readyState === WebSocket.OPEN
    ) {
      const opponent = this.waitingPlayer;
      this.waitingPlayer = null;

      const matchId = uuidv4();
      this.createMatch(
        matchId,
        opponent.ws,
        opponent.address,
        ws,
        address,
        stake,
        denom,
      );
    } else {
      this.waitingPlayer = { ws, address };
      this.send(ws, { type: "WAITING_FOR_OPPONENT" });
    }
  }

  private createAIMatch(
    ws: WebSocket,
    address: string,
    stake: string,
    denom: string,
    difficulty: AIDifficulty,
  ) {
    const matchId = uuidv4();
    const state = createInitialState();
    const aiAddress = `ai_${difficulty}_${uuidv4().slice(0, 8)}`;
    const log = createMatchLog(matchId, address, aiAddress, stake, denom);

    // Create a dummy WebSocket-like object for the AI player
    const aiWs = {
      readyState: WebSocket.OPEN,
      send: () => {},
    } as unknown as WebSocket;

    const match: Match = {
      id: matchId,
      players: new Map([
        [address, { ws, address, player: "A" }],
        [aiAddress, { ws: aiWs, address: aiAddress, player: "B" }],
      ]),
      state,
      log,
      turnLog: {},
      stake,
      denom,
      aiDifficulty: difficulty,
      aiPlayer: "B",
    };

    this.matches.set(matchId, match);

    // Send MATCH_JOINED to the human player
    this.send(ws, { type: "MATCH_JOINED", matchId, player: "A", state });
    this.broadcastState(match);
    this.startTurnTimer(match);

    console.log(
      `[GameServer] AI Match started: ${matchId} (${address} vs AI-${difficulty})`,
    );
  }

  private scheduleAITurn(match: Match) {
    if (!match.aiDifficulty || !match.aiPlayer) return;
    if (match.state.currentPlayer !== match.aiPlayer) return;
    if (match.state.phase === "game-over") return;

    const aiConn = [...match.players.values()].find(
      (p) => p.player === match.aiPlayer,
    );
    if (!aiConn) return;

    setTimeout(() => {
      // Verify match still exists and it's still AI's turn
      if (!this.matches.has(match.id)) return;
      if (match.state.currentPlayer !== match.aiPlayer) return;

      if (match.state.phase === "pre-roll") {
        // AI rolls dice
        this.handleRollDice(match, aiConn);

        // After rolling, schedule moves
        setTimeout(() => {
          this.aiPlayMoves(match);
        }, 600);
      }
    }, 800);
  }

  private aiPlayMoves(match: Match) {
    if (!match.aiDifficulty || !match.aiPlayer) return;
    if (!this.matches.has(match.id)) return;
    if (match.state.phase !== "moving") return;
    if (match.state.currentPlayer !== match.aiPlayer) return;

    const move = chooseMove(match.state, match.aiDifficulty);
    if (!move) return; // No legal moves; finishTurn already scheduled by handleRollDice

    const aiConn = [...match.players.values()].find(
      (p) => p.player === match.aiPlayer,
    )!;

    // Apply the move
    this.handleMove(match, aiConn, move);

    // If game didn't end and there are still dice remaining, schedule next move
    if (this.matches.has(match.id) && match.state.phase === "moving") {
      const legalAfter = getLegalMoves(match.state);
      const remaining = match.state.dice.length - match.state.usedDice.length;
      if (remaining > 0 && legalAfter.length > 0) {
        setTimeout(() => this.aiPlayMoves(match), 500);
      }
    }
  }

  private joinOrCreateMatch(
    ws: WebSocket,
    address: string,
    matchId: string,
    stake: string,
    denom: string,
  ) {
    const match = this.matches.get(matchId);

    if (match) {
      // Reconnect
      const conn = match.players.get(address);
      if (conn) {
        conn.ws = ws;
        conn.disconnectedAt = undefined;
        if (match.disconnectTimer) {
          clearTimeout(match.disconnectTimer);
          match.disconnectTimer = undefined;
        }
        this.broadcastToMatch(match, { type: "OPPONENT_RECONNECTED" }, address);
        this.send(ws, { type: "GAME_STATE", state: match.state, matchId });
        console.log(`[GameServer] Reconnected: ${address} to match ${matchId}`);
      }
    } else if (match === undefined) {
      // Waiting for second player
      const partial = this.matches.get(`pending_${matchId}`);
      if (!partial) {
        this.createPendingMatch(matchId, ws, address, stake, denom);
      }
    }
  }

  private createPendingMatch(
    matchId: string,
    ws: WebSocket,
    address: string,
    stake: string,
    denom: string,
  ) {
    const pendingKey = `pending_${matchId}`;
    this.matches.set(pendingKey, {
      id: matchId,
      players: new Map([[address, { ws, address, player: "A" }]]),
      state: createInitialState(),
      log: createMatchLog(matchId, address, "", stake, denom),
      turnLog: {},
      stake,
      denom,
    });
    this.send(ws, { type: "WAITING_FOR_OPPONENT" });
  }

  private createMatch(
    matchId: string,
    wsA: WebSocket,
    addressA: string,
    wsB: WebSocket,
    addressB: string,
    stake: string,
    denom: string,
  ) {
    const state = createInitialState();
    const log = createMatchLog(matchId, addressA, addressB, stake, denom);

    const match: Match = {
      id: matchId,
      players: new Map([
        [addressA, { ws: wsA, address: addressA, player: "A" }],
        [addressB, { ws: wsB, address: addressB, player: "B" }],
      ]),
      state,
      log,
      turnLog: {},
      stake,
      denom,
    };

    this.matches.set(matchId, match);

    // Send MATCH_JOINED to each player with their assignment
    this.send(wsA, { type: "MATCH_JOINED", matchId, player: "A", state });
    this.send(wsB, { type: "MATCH_JOINED", matchId, player: "B", state });
    this.broadcastState(match);
    this.startTurnTimer(match);

    console.log(
      `[GameServer] Match started: ${matchId} (${addressA} vs ${addressB})`,
    );
  }

  private handleMessage(ws: WebSocket, address: string, msg: ClientMessage) {
    if (msg.type === "PING") {
      this.send(ws, { type: "PONG" });
      return;
    }

    const match = this.findMatchByAddress(address);
    if (!match) {
      this.send(ws, { type: "ERROR", message: "No active match found" });
      return;
    }

    const conn = match.players.get(address);
    if (!conn) return;

    if (match.state.currentPlayer !== conn.player) {
      this.send(ws, { type: "ERROR", message: "Not your turn" });
      return;
    }

    switch (msg.type) {
      case "ROLL_DICE":
        this.handleRollDice(match, conn);
        break;
      case "MOVE":
        this.handleMove(match, conn, msg.move);
        break;
      case "OFFER_DOUBLE":
        this.handleOfferDouble(match, conn);
        break;
      case "ACCEPT_DOUBLE":
        this.handleAcceptDouble(match, conn);
        break;
      case "RESIGN_DOUBLE":
        this.handleResignDouble(match, conn);
        break;
      case "END_TURN":
        this.handleEndTurn(match, conn);
        break;
    }
  }

  private handleRollDice(match: Match, conn: PlayerConn) {
    if (match.state.phase !== "pre-roll") return;

    const [d1, d2] = rollDice();
    const diceList = getDiceList([d1, d2]);

    match.state = {
      ...match.state,
      dice: diceList,
      usedDice: [],
      phase: "moving",
    };

    match.turnLog = {
      turn: match.state.turnNumber,
      player: conn.player,
      dice: diceList,
      moves: [],
      cube_action: null,
      timestamp: Math.floor(Date.now() / 1000),
    };

    this.broadcastToMatch(match, {
      type: "DICE_ROLLED",
      dice: diceList,
      player: conn.player,
    });
    this.broadcastState(match);

    // Auto-end if no legal moves
    const legal = getLegalMoves(match.state);
    if (legal.length === 0) {
      setTimeout(() => this.finishTurn(match), 1000);
    }
  }

  private handleMove(match: Match, conn: PlayerConn, move: Move) {
    const legal = getLegalMoves(match.state);
    const isLegal = legal.some((m) => m.from === move.from && m.to === move.to);

    if (!isLegal) {
      this.send(conn.ws, { type: "ERROR", message: "Illegal move" });
      return;
    }

    match.state = applyMove(match.state, move);
    (match.turnLog.moves as any[]).push(move);

    // Check win
    const { winner, multiplier } = checkWin(match.state);
    if (winner) {
      this.finishGame(match, winner, multiplier);
      return;
    }

    this.broadcastToMatch(match, { type: "MOVE_APPLIED", state: match.state });

    // Auto-end turn if all dice used
    const remaining = match.state.dice.length - match.state.usedDice.length;
    const legalAfter = getLegalMoves(match.state);
    if (remaining === 0 || legalAfter.length === 0) {
      setTimeout(() => this.finishTurn(match), 500);
    }
  }

  private handleOfferDouble(match: Match, conn: PlayerConn) {
    if (match.state.phase !== "pre-roll") return;
    if (match.state.cubeOwner && match.state.cubeOwner !== conn.player) return;

    match.state = { ...match.state, cubeOffered: true };
    this.broadcastToMatch(match, {
      type: "DOUBLE_OFFERED",
      by: conn.player,
      cubeValue: match.state.doublingCube * 2,
    });
  }

  private handleAcceptDouble(match: Match, conn: PlayerConn) {
    if (!match.state.cubeOffered) return;

    match.state = {
      ...match.state,
      doublingCube: match.state.doublingCube * 2,
      cubeOwner: conn.player,
      cubeOffered: false,
    };

    this.broadcastToMatch(match, {
      type: "DOUBLE_ACCEPTED",
      cubeValue: match.state.doublingCube,
      owner: conn.player,
    });
    this.broadcastState(match);
  }

  private handleResignDouble(match: Match, conn: PlayerConn) {
    if (!match.state.cubeOffered) return;
    const offerer: Player = conn.player === "A" ? "B" : "A";
    this.broadcastToMatch(match, {
      type: "DOUBLE_RESIGNED",
      loser: conn.player,
    });
    this.finishGame(match, offerer, 1);
  }

  private handleEndTurn(match: Match, conn: PlayerConn) {
    this.finishTurn(match);
  }

  private finishTurn(match: Match) {
    // Save turn log
    if (match.turnLog.turn !== undefined) {
      match.log.turns.push(match.turnLog as TurnLog);
    }

    match.state = endTurn(match.state);
    this.clearTurnTimer(match);
    this.startTurnTimer(match);
    this.broadcastState(match);

    // If it's now the AI's turn, schedule AI play
    if (match.aiDifficulty) {
      this.scheduleAITurn(match);
    }
  }

  private async finishGame(
    match: Match,
    winner: Player,
    multiplier: 1 | 2 | 3,
  ) {
    this.clearTurnTimer(match);

    const winnerConn = [...match.players.values()].find(
      (p) => p.player === winner,
    );
    const winnerAddress = winnerConn?.address || "";

    const winType =
      multiplier === 3 ? "backgammon" : multiplier === 2 ? "gammon" : "normal";

    match.log.final_board = [...match.state.points];
    match.log.winner = winnerAddress;
    match.log.win_type = winType;
    match.log.multiplier = multiplier;
    match.log.ended_at = Math.floor(Date.now() / 1000);

    const gameHash = generateGameHash(match.log);

    this.broadcastToMatch(match, {
      type: "GAME_OVER",
      winner,
      multiplier,
      gameHash,
    });

    console.log(
      `[GameServer] Match ${match.id} ended. Winner: ${winner}, multiplier: ${multiplier}, hash: ${gameHash}`,
    );

    // Submit result on-chain
    if (process.env.CONTRACT_ADDRESS && winnerAddress) {
      submitResult({
        matchId: match.id,
        winner: winnerAddress,
        multiplier,
        gameHash,
      }).catch((err) => {
        console.error(
          `[Chain] SubmitResult failed for match ${match.id}:`,
          err.message,
        );
      });
    } else {
      console.warn(
        "[Chain] Skipping SubmitResult — CONTRACT_ADDRESS or winner address not set",
      );
    }

    this.matches.delete(match.id);
  }

  private startTurnTimer(match: Match) {
    match.turnTimer = setTimeout(() => {
      console.log(`[GameServer] Turn timeout for match ${match.id}`);
      this.finishTurn(match);
    }, TURN_TIMEOUT_MS);
  }

  private clearTurnTimer(match: Match) {
    if (match.turnTimer) {
      clearTimeout(match.turnTimer);
      match.turnTimer = undefined;
    }
  }

  private handleDisconnect(address: string) {
    const match = this.findMatchByAddress(address);
    if (!match) return;

    const conn = match.players.get(address);
    if (!conn) return;

    conn.disconnectedAt = Date.now();
    this.broadcastToMatch(
      match,
      {
        type: "OPPONENT_DISCONNECTED",
        gracePeriodSeconds: RECONNECT_GRACE_MS / 1000,
      },
      address,
    );

    match.disconnectTimer = setTimeout(() => {
      const opponent = [...match.players.values()].find(
        (p) => p.address !== address,
      );
      if (opponent) {
        this.finishGame(match, opponent.player, 1);
      }
      this.matches.delete(match.id);
    }, RECONNECT_GRACE_MS);

    console.log(`[GameServer] Disconnected: ${address}, grace period started`);
  }

  private findMatchByAddress(address: string): Match | null {
    for (const match of this.matches.values()) {
      if (match.players.has(address)) return match;
    }
    return null;
  }

  private broadcastState(match: Match) {
    this.broadcastToMatch(match, {
      type: "GAME_STATE",
      state: match.state,
      matchId: match.id,
    });
  }

  private broadcastToMatch(
    match: Match,
    msg: ServerMessage,
    excludeAddress?: string,
  ) {
    for (const conn of match.players.values()) {
      if (excludeAddress && conn.address === excludeAddress) continue;
      if (conn.ws.readyState === WebSocket.OPEN) {
        this.send(conn.ws, msg);
      }
    }
  }

  private send(ws: WebSocket, msg: ServerMessage) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }
}
