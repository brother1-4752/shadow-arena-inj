import { WebSocket, WebSocketServer } from "ws";
import { submitResult } from "../chain/submit";
import { createMatch as createOnChainMatch } from "../chain/match";
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
  away?: boolean; // true when tab is hidden
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
  turnTimerStartedAt?: number; // epoch ms when the turn timer last started
  turnTimerRemainingMs?: number; // remaining ms when paused
  disconnectTimer?: NodeJS.Timeout;
  aiDifficulty?: AIDifficulty;
  aiPlayer?: Player;
  fundedPlayers: Set<string>; // addresses of players who have funded
}

const TURN_TIMEOUT_MS = 45_000;
const RECONNECT_GRACE_MS = 30_000;

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
    const rawAddress = (params.get("address") || "").trim();
    const matchId = params.get("matchId");
    const stake = params.get("stake") || "0";
    const denom = params.get("denom") || "inj";

    // If guest mode requested or no address, use client-provided address or generate fallback
    const isGuest = params.get("guest") === "true";
    const address = rawAddress || `guest_${uuidv4().slice(0, 12)}`;

    console.log(
      `[GameServer] Connection: ${address}${isGuest ? " (guest)" : ""}`,
    );

    // Set up message and disconnect handlers (always, regardless of match type)
    ws.on("message", (data) => {
      try {
        const msg: ClientMessage = JSON.parse(data.toString());
        this.handleMessage(ws, address, msg);
      } catch (e) {
        this.send(ws, { type: "ERROR", message: "Invalid message format" });
      }
    });
    ws.on("close", () => this.handleDisconnect(address, ws));

    // Check if this address is in a pending match (waiting for opponent)
    const pending = this.findPendingByAddress(address);
    if (pending && !matchId) {
      // Update WS reference and re-send waiting state
      const conn = pending.match.players.get(address);
      if (conn) conn.ws = ws;
      this.send(ws, { type: "MATCH_CREATED", matchId: pending.match.id });
      this.send(ws, { type: "WAITING_FOR_OPPONENT" });
      console.log(
        `[GameServer] Re-attached ${address} to pending match ${pending.match.id}`,
      );
      return;
    }

    // Check if this address is in an active match (reconnect)
    const existingMatch = this.findMatchByAddress(address);
    if (existingMatch && !matchId) {
      const conn = existingMatch.players.get(address);
      if (conn) {
        conn.ws = ws;
        conn.disconnectedAt = undefined;
        if (existingMatch.disconnectTimer) {
          clearTimeout(existingMatch.disconnectTimer);
          existingMatch.disconnectTimer = undefined;
        }
        this.broadcastToMatch(
          existingMatch,
          { type: "OPPONENT_RECONNECTED" },
          address,
        );

        // Determine actual funded status for this reconnecting player
        const isStake = existingMatch.stake !== "0";
        const selfFunded = existingMatch.fundedPlayers.has(address);
        const allFunded = existingMatch.fundedPlayers.size >= existingMatch.players.size;

        // Only resume turn timer if both players have funded (or non-stake match)
        if (!isStake || allFunded) {
          const remainingMs = existingMatch.turnTimerRemainingMs || TURN_TIMEOUT_MS;
          this.resumeTurnTimer(existingMatch);
          this.broadcastToMatch(existingMatch, {
            type: "GAME_RESUMED",
            remainingTurnMs: remainingMs,
          });
        }

        this.send(ws, {
          type: "MATCH_JOINED",
          matchId: existingMatch.id,
          player: conn.player,
          state: existingMatch.state,
          reconnect: true,
          stake: existingMatch.stake,
          denom: existingMatch.denom,
          funded: selfFunded,
          bothFunded: allFunded,
        });
        console.log(
          `[GameServer] Reconnected ${address} to match ${existingMatch.id} (funded: ${selfFunded}, bothFunded: ${allFunded})`,
        );
        return;
      }
    }

    // AI match, manual match with specific ID, create new match, or auto-match
    const mode = params.get("mode");
    const difficulty = params.get("difficulty") as AIDifficulty | null;
    const createMatch = params.get("create") === "true";

    if (mode === "ai") {
      this.createAIMatch(ws, address, stake, denom, difficulty || "easy");
    } else if (matchId) {
      this.joinOrCreateMatch(ws, address, matchId, stake, denom);
    } else if (createMatch) {
      // Create a new match and send the ID back so the user can share it
      const newMatchId = uuidv4().slice(0, 8);
      this.createPendingMatch(newMatchId, ws, address, stake, denom);
      this.send(ws, { type: "MATCH_CREATED", matchId: newMatchId });
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
    // If there's a waiting player with a dead WS, clean it up first
    if (
      this.waitingPlayer &&
      this.waitingPlayer.ws.readyState !== WebSocket.OPEN
    ) {
      this.waitingPlayer = null;
    }

    if (
      this.waitingPlayer &&
      this.waitingPlayer.address !== address // Prevent self-matching
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
      // If same address was already waiting, just replace WS (StrictMode scenario)
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
      fundedPlayers: new Set(),
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
    // Check for an active match first (reconnect scenario)
    const match = this.matches.get(matchId);
    if (match) {
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
        return;
      }
    }

    // Check for a pending match awaiting second player
    const pendingKey = `pending_${matchId}`;
    const pending = this.matches.get(pendingKey);
    if (pending) {
      // Second player joining — promote pending to active match
      const creatorConn = [...pending.players.values()][0];
      if (!creatorConn || creatorConn.address === address) {
        // Same player trying to join their own match
        this.send(ws, { type: "WAITING_FOR_OPPONENT" });
        return;
      }
      this.matches.delete(pendingKey);
      this.createMatch(
        matchId,
        creatorConn.ws,
        creatorConn.address,
        ws,
        address,
        pending.stake,
        pending.denom,
      );
      console.log(
        `[GameServer] Player ${address} joined pending match ${matchId}`,
      );
    } else {
      // No match exists with this ID — create a new pending one
      this.createPendingMatch(matchId, ws, address, stake, denom);
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
      fundedPlayers: new Set(),
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
      fundedPlayers: new Set(),
    };

    this.matches.set(matchId, match);

    // Send MATCH_JOINED to each player with their assignment (always include stake/denom)
    this.send(wsA, { type: "MATCH_JOINED", matchId, player: "A", state, stake, denom });
    this.send(wsB, { type: "MATCH_JOINED", matchId, player: "B", state, stake, denom });
    this.broadcastState(match);

    // For stake matches, register the match on-chain so players can fund it
    const isStake =
      stake !== "0" &&
      !addressA.startsWith("guest_") &&
      !addressB.startsWith("guest_");
    if (isStake) {
      if (!process.env.CONTRACT_ADDRESS) {
        console.warn(
          `[Chain] CONTRACT_ADDRESS not set — skipping CreateMatch for ${matchId}. Players won't be able to fund.`,
        );
        this.broadcastToMatch(match, {
          type: "STAKE_ERROR",
          message: "Server not configured for on-chain matches (CONTRACT_ADDRESS not set)",
        });
        // Still start the game (non-stake fallback)
        this.startTurnTimer(match);
      } else {
        // Await on-chain match creation before allowing funding
        createOnChainMatch({
          matchId,
          playerA: addressA,
          playerB: addressB,
          stake,
          denom,
        })
          .then(() => {
            console.log(`[Chain] CreateMatch success for ${matchId}`);
            this.broadcastToMatch(match, { type: "STAKE_READY", matchId });
            // Do NOT start turn timer yet — wait for both PLAYER_FUNDED messages
          })
          .catch((err) => {
            console.error(
              `[Chain] CreateMatch failed for ${matchId}:`,
              err.message,
            );
            this.broadcastToMatch(match, {
              type: "STAKE_ERROR",
              message: `On-chain match creation failed: ${err.message}`,
            });
            // Start the game anyway as non-stake fallback
            this.startTurnTimer(match);
          });
      }
    } else {
      this.startTurnTimer(match);
    }

    console.log(
      `[GameServer] Match started: ${matchId} (${addressA} vs ${addressB})${isStake ? " [STAKE]" : ""}`,
    );
  }

  private handleMessage(ws: WebSocket, address: string, msg: ClientMessage) {
    if (msg.type === "PING") {
      this.send(ws, { type: "PONG" });
      return;
    }

    // CHECK_ACTIVE_MATCH — lightweight probe from the lobby
    if (msg.type === "CHECK_ACTIVE_MATCH") {
      const active = this.findMatchByAddress(address);
      if (active) {
        this.send(ws, {
          type: "ACTIVE_MATCH",
          matchId: active.id,
          stake: active.stake,
          denom: active.denom,
        });
      } else {
        const pending = this.findPendingByAddress(address);
        if (pending) {
          this.send(ws, {
            type: "ACTIVE_MATCH",
            matchId: pending.match.id,
            stake: pending.match.stake,
            denom: pending.match.denom,
          });
        } else {
          this.send(ws, { type: "NO_ACTIVE_MATCH" });
        }
      }
      return;
    }

    // CANCEL_MATCH can be sent while waiting (not turn-dependent)
    if (msg.type === "CANCEL_MATCH") {
      // Remove from waiting queue
      if (
        this.waitingPlayer &&
        this.waitingPlayer.address === address &&
        this.waitingPlayer.ws === ws
      ) {
        this.waitingPlayer = null;
        console.log(`[GameServer] Waiting cancelled by: ${address}`);
      }
      // Remove pending match
      const pending = this.findPendingByAddress(address);
      if (pending) {
        this.matches.delete(pending.key);
        console.log(
          `[GameServer] Pending match ${pending.match.id} cancelled by: ${address}`,
        );
      }
      return;
    }

    // VISIBILITY changes — pause/resume when a player switches tabs
    if (msg.type === "VISIBILITY_HIDDEN") {
      const match = this.findMatchByAddress(address);
      if (!match) return;
      const conn = match.players.get(address);
      if (!conn || conn.away) return;
      conn.away = true;
      this.pauseTurnTimer(match);
      this.broadcastToMatch(match, { type: "GAME_PAUSED" });
      this.broadcastToMatch(
        match,
        { type: "OPPONENT_DISCONNECTED", gracePeriodSeconds: RECONNECT_GRACE_MS / 1000 },
        address,
      );
      console.log(`[GameServer] Player ${address} tab hidden → game paused`);
      return;
    }

    if (msg.type === "VISIBILITY_VISIBLE") {
      const match = this.findMatchByAddress(address);
      if (!match) return;
      const conn = match.players.get(address);
      if (!conn || !conn.away) return;
      conn.away = false;
      const remainingMs = match.turnTimerRemainingMs || TURN_TIMEOUT_MS;
      this.resumeTurnTimer(match);
      this.broadcastToMatch(match, {
        type: "GAME_RESUMED",
        remainingTurnMs: remainingMs,
      });
      this.broadcastToMatch(match, { type: "OPPONENT_RECONNECTED" }, address);
      console.log(`[GameServer] Player ${address} tab visible → game resumed (${remainingMs}ms remaining)`);
      return;
    }

    // PLAYER_FUNDED — a player has completed their fund_match tx on-chain
    if (msg.type === "PLAYER_FUNDED") {
      const match = this.findMatchByAddress(address);
      if (!match) return;
      match.fundedPlayers.add(address);
      console.log(`[GameServer] Player ${address} funded match ${match.id} (${match.fundedPlayers.size}/${match.players.size})`);

      // When both players have funded, start the game
      if (match.fundedPlayers.size >= match.players.size) {
        console.log(`[GameServer] Both players funded for match ${match.id} — starting game`);
        this.broadcastToMatch(match, { type: "BOTH_FUNDED", matchId: match.id });
        this.startTurnTimer(match);
      }
      return;
    }

    // FORFEIT can be sent at any time (not turn-dependent)
    if (msg.type === "FORFEIT") {
      const match = this.findMatchByAddress(address);
      if (!match) return;
      const conn = match.players.get(address);
      if (!conn) return;
      const opponentPlayer: Player = conn.player === "A" ? "B" : "A";
      this.broadcastToMatch(match, { type: "FORFEIT", address });
      this.finishGame(match, opponentPlayer, 1);
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

    // Submit result on-chain (only for stake matches with real wallets)
    const isStakeMatch =
      match.stake !== "0" &&
      winnerAddress &&
      !winnerAddress.startsWith("guest_") &&
      ![...match.players.values()].some((p) => p.address.startsWith("guest_"));
    if (process.env.CONTRACT_ADDRESS && isStakeMatch) {
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
    } else if (!isStakeMatch) {
      console.log(
        `[Chain] Skipping SubmitResult — not a stake match (stake: ${match.stake})`,
      );
    } else {
      console.warn(
        "[Chain] Skipping SubmitResult — CONTRACT_ADDRESS not set",
      );
    }

    this.matches.delete(match.id);
  }

  private startTurnTimer(match: Match, timeoutMs: number = TURN_TIMEOUT_MS) {
    match.turnTimerStartedAt = Date.now();
    match.turnTimerRemainingMs = timeoutMs;
    match.turnTimer = setTimeout(() => {
      console.log(`[GameServer] Turn timeout for match ${match.id}`);
      this.finishTurn(match);
    }, timeoutMs);
  }

  private clearTurnTimer(match: Match) {
    if (match.turnTimer) {
      clearTimeout(match.turnTimer);
      match.turnTimer = undefined;
    }
    match.turnTimerRemainingMs = undefined;
    match.turnTimerStartedAt = undefined;
  }

  /** Pause turn timer, saving the remaining time */
  private pauseTurnTimer(match: Match) {
    if (match.turnTimer && match.turnTimerStartedAt) {
      clearTimeout(match.turnTimer);
      match.turnTimer = undefined;
      const elapsed = Date.now() - match.turnTimerStartedAt;
      match.turnTimerRemainingMs = Math.max(0, (match.turnTimerRemainingMs || TURN_TIMEOUT_MS) - elapsed);
      match.turnTimerStartedAt = undefined;
    }
  }

  /** Resume turn timer from where it was paused */
  private resumeTurnTimer(match: Match) {
    const remaining = match.turnTimerRemainingMs;
    if (remaining !== undefined && remaining > 0) {
      this.startTurnTimer(match, remaining);
    } else {
      this.startTurnTimer(match);
    }
  }

  private handleDisconnect(address: string, closedWs: WebSocket) {
    // Clean up waiting player if it was this one AND the WS matches
    if (
      this.waitingPlayer &&
      this.waitingPlayer.address === address &&
      this.waitingPlayer.ws === closedWs
    ) {
      this.waitingPlayer = null;
      console.log(`[GameServer] Waiting player disconnected: ${address}`);
    }

    // Clean up pending matches — only if the stored WS is the one that closed
    const pending = this.findPendingByAddress(address);
    if (pending) {
      const pConn = pending.match.players.get(address);
      if (pConn && pConn.ws === closedWs) {
        this.matches.delete(pending.key);
        console.log(
          `[GameServer] Pending match ${pending.match.id} removed (creator disconnected: ${address})`,
        );
      }
    }

    const match = this.findMatchByAddress(address);
    if (!match) return;

    const conn = match.players.get(address);
    if (!conn) return;

    // If the closed WS is NOT the stored WS, this is a stale close — ignore it
    if (conn.ws !== closedWs) return;

    conn.disconnectedAt = Date.now();

    // Check if ALL human players are disconnected (skip AI players)
    const humanPlayers = [...match.players.values()].filter(
      (p) => !match.aiPlayer || p.player !== match.aiPlayer,
    );
    const allDisconnected = humanPlayers.every((p) => p.disconnectedAt);
    if (allDisconnected) {
      // No humans left — clean up immediately
      this.clearTurnTimer(match);
      if (match.disconnectTimer) {
        clearTimeout(match.disconnectTimer);
      }
      this.matches.delete(match.id);
      console.log(
        `[GameServer] All players disconnected from match ${match.id} — removed`,
      );
      return;
    }

    this.broadcastToMatch(
      match,
      {
        type: "OPPONENT_DISCONNECTED",
        gracePeriodSeconds: RECONNECT_GRACE_MS / 1000,
      },
      address,
    );

    // Pause the turn timer so the disconnected player's turn doesn't time out
    this.pauseTurnTimer(match);
    this.broadcastToMatch(match, { type: "GAME_PAUSED" }, address);

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
    for (const [key, match] of this.matches.entries()) {
      // Skip pending matches — they are not active games
      if (key.startsWith("pending_")) continue;
      if (match.players.has(address)) return match;
    }
    return null;
  }

  /** Find a pending match that this address created (key = pending_*) */
  private findPendingByAddress(address: string): {
    key: string;
    match: Match;
  } | null {
    for (const [key, match] of this.matches.entries()) {
      if (!key.startsWith("pending_")) continue;
      if (match.players.has(address)) return { key, match };
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
