# Shadow Arena: Ninja Backgammon

> Tournament-grade Backgammon with on-chain settlement on Injective (Cosmos/CosmWasm)

**Play backgammon with full tournament rules. Settle stakes trustlessly on-chain.**

[![Basic](https://github.com/brother1-4752/shadow-arena-inj/actions/workflows/Basic.yml/badge.svg)](https://github.com/brother1-4752/shadow-arena-inj/actions/workflows/Basic.yml)

**Live Demo**: [shadow-arena.vercel.app](https://shadow-arena.vercel.app)

---

## Overview

Shadow Arena is a Web3 strategy game that combines traditional Backgammon's tournament ruleset with Injective blockchain's on-chain settlement.

- **Gameplay** runs off-chain (WebSocket, server-authoritative) for real-time responsiveness
- **Settlement** runs on-chain (CosmWasm escrow) for verifiable, trustless payouts
- **No rule distortion** — standard 24-point board, 15 checkers, hit/bar/bear-off, doubles = 4 moves, gammon/backgammon multipliers

## Architecture

```
┌─────────────┐    WebSocket     ┌─────────────────┐    Broadcast    ┌──────────────────┐
│  Game Web    │ ◄──────────────► │  Game Server     │ ──────────────► │  CosmWasm        │
│  (React/Vite)│                  │  (Node/TS)       │                 │  Escrow Contract │
│              │                  │                   │                 │  (Injective)     │
│  Keplr Wallet│ ─── sign tx ──► │  Engine + AI      │                 │                  │
└─────────────┘                  └─────────────────┘                 └──────────────────┘
```

### Monorepo Structure

```
shadow-arena-inj/
├── contracts/shadow_arena/   # CosmWasm smart contract (Rust)
│   └── src/
│       ├── contract.rs       # Execute/Query handlers
│       ├── state.rs          # Match state machine
│       ├── msg.rs            # Message types
│       └── error.rs          # Contract errors
├── server/                   # Game server (Node.js/TypeScript)
│   └── src/
│       ├── engine/           # Backgammon rules engine
│       ├── ai/               # AI opponent (easy/normal difficulty)
│       ├── ws/               # WebSocket server & matchmaking
│       ├── chain/            # Injective SDK integration
│       └── log/              # Game log & hash generation
├── apps/game-web/            # Frontend (React + Vite)
│   └── src/
│       ├── components/       # GameBoard, Lobby, PlayerPanel, etc.
│       └── hooks/            # useGameSocket, useContract, WalletContext
├── schema/                   # Auto-generated contract JSON schemas
└── .github/workflows/        # CI (test, lint, schema check, wasm build)
```

## On-Chain Settlement Flow

The smart contract is a **state machine for settlement**, not a game engine.

```
CreateMatch (server)
  → FundMatch (player A) + FundMatch (player B)
  → [off-chain game plays out]
  → SubmitResult (server, with game_hash)
  → ConfirmResult (player A) + ConfirmResult (player B)
  → [dispute window]
  → Claim (winner receives payout)

Dispute path:
  → RaiseDispute (either player)
  → ResolveDispute (dispute resolver)
  → Claim
```

**game_hash**: SHA-256 of the full match log. Anyone can replay the log and verify the hash matches what's on-chain.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Blockchain | Injective Testnet (`injective-888`) |
| Smart Contract | CosmWasm (Rust), `cw-storage-plus` |
| Game Server | Node.js, TypeScript, WebSocket (`ws`) |
| Frontend | React 18, Vite, TailwindCSS |
| Wallet | Keplr (via `@injectivelabs/sdk-ts`) |
| Deployment | Vercel (frontend), Render (server) |

## Getting Started

### Prerequisites

- Rust + `wasm32-unknown-unknown` target
- Node.js 18+
- [Keplr wallet extension](https://www.keplr.app/) (for on-chain features)

### Smart Contract

```bash
# Run tests
cargo unit-test --locked

# Build wasm
RUSTFLAGS="-C link-arg=-s" cargo wasm --locked

# Generate schema
cargo schema --locked
```

### Game Server

```bash
cd server
npm install
cp .env.example .env  # configure CONTRACT_ADDRESS, SERVER_AUTHORITY_MNEMONIC
npm run dev            # starts WebSocket server on :8080
```

### Frontend

```bash
cd apps/game-web
npm install
npm run dev            # starts Vite dev server on :5173
```

### Environment Variables

**Server** (`server/.env`):
| Variable | Description |
|----------|-------------|
| `CONTRACT_ADDRESS` | Deployed CosmWasm contract address |
| `SERVER_AUTHORITY_MNEMONIC` | Server wallet mnemonic for SubmitResult |
| `PORT` | WebSocket server port (default: 8080) |

**Frontend** (`apps/game-web/.env`):
| Variable | Description |
|----------|-------------|
| `VITE_CONTRACT_ADDRESS` | CosmWasm contract address |
| `VITE_WS_URL` | Game server WebSocket URL |

## Game Modes

- **Local AI** — Play against AI (easy/normal difficulty) with no wallet required
- **Online PvP** — Real-time matches via WebSocket with optional on-chain staking
- **Stake Mode** — PvP with INJ staking through the escrow contract

## Contract Deployment

Currently deployed on Injective Testnet:

```
Contract: inj1fkmq4sm8u2c8483sex889e3cyjw80r79qx7dy4
Chain:    injective-888
Code ID:  39271
```

## License

MIT
