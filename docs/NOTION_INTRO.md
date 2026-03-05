# Shadow Arena: Ninja Backgammon

### — Injective(Cosmos) 기반 온체인 정산형 토너먼트 전략 게임

| | |
|---|---|
| **Live Demo** | [shadow-arena.vercel.app](https://shadow-arena.vercel.app) |
| **GitHub** | [brother1-4752/shadow-arena-inj](https://github.com/brother1-4752/shadow-arena-inj) |
| **Game Server (WS)** | `wss://shadow-arena-server.onrender.com` |
| **Contract** | `inj1fkmq4sm8u2c8483sex889e3cyjw80r79qx7dy4` (Injective Testnet) |

---

## 0. 한 줄로

**토너먼트 규격 백개먼을 그대로 플레이하고, 판돈(정산)만 온체인에서 검증 가능하게 처리한다.**

---

## 1. 프로젝트 개요

**Shadow Arena: Ninja Backgammon**은
전통 백개먼(Backgammon)의 **토너먼트 룰을 완전 준수**하면서,
Injective(Cosmos) 위에서 **stake 예치·분쟁·정산**을 처리하는 Web3 전략 게임입니다.

Web3 게임이 흔히 실패하는 방식은 딱 두 가지입니다.

1. 모든 걸 온체인에 올려 **UX가 게임이 아닌 것**
2. 온체인이라고 말하지만 실제로는 서버가 결과를 정해 **검증이 불가능한 것**

Shadow Arena는 아래 원칙으로 이 함정을 피합니다.

> **게임 플레이는 오프체인에서 실시간으로,**
> **정산은 온체인에서 검증 가능하게.**

---

## 2. 왜 백개먼인가

백개먼은 단순한 주사위 게임이 아니라,
**확률(주사위) + 심리전(더블링 큐브) + 장기 실력 우위**가 결합된 전략 게임입니다.

또한 토너먼트/머니게임 문화가 오래 검증돼 있어, **"공정한 베팅 정산"**과 결합이 자연스럽습니다.

우리는 룰을 바꾸지 않습니다.
긴장감은 확률 조작이 아니라 **연출과 UX 설계**로 만듭니다.

---

## 3. 핵심 컨셉

### Tournament Grade 룰 완전 준수

- 24포인트 / 15개 말
- Hit / Bar / Re-entry / Bear-off
- Doubles = 4 moves
- **불법 이동 완전 차단** (엔진/서버 레벨에서 강제)
- Gammon(2x) / Backgammon(3x) 판정 로직
- 더블링 큐브 (도박 요소가 아니라 **심리전의 핵심 장치**)

**핵심 원칙:**
어떤 시스템도 **주사위 확률분포를 바꾸거나**, 결과를 특정 플레이어에게 유리하게 만들지 않습니다.

### 닌자 세계관 + 정보형 캐릭터 (Non-P2W)

플레이어는 3가지 닌자 중 선택합니다.

| 캐릭터 | 능력 (정보 제공만) |
|---------|-------------------|
| **Shadow Strategist** | 안전한 수 후보 / 블롯 위험 히트맵 |
| **Swift Assassin** | 더블 제안 시 판단 보조 인사이트 |
| **Iron Ronin** | 베어오프 구간 1회 최적 수 추천 |

> 캐릭터 능력은 **정보·시각화·추천**만 제공합니다.
> **주사위·확률·게임 결과에 직접 개입하지 않습니다.**

---

## 4. 기술 아키텍처

### 4.1 구조 철학: Speed x Verifiability

```
┌─────────────┐    WebSocket     ┌─────────────────┐    Broadcast    ┌──────────────────┐
│  Game Web    │ <──────────────> │  Game Server     │ ──────────────> │  CosmWasm        │
│  (React/Vite)│                  │  (Node/TS)       │                 │  Escrow Contract │
│              │                  │                   │                 │  (Injective)     │
│  Keplr Wallet│ ─── sign tx ──> │  Engine + AI      │                 │                  │
└─────────────┘                  └─────────────────┘                 └──────────────────┘
```

**오프체인 (게임 플레이): Server Authoritative**
- 서버가 주사위를 생성 (클라이언트 RNG 금지)
- 모든 움직임을 검증 (불법 수 차단)
- 게임 상태를 단일 권위로 유지
- 매치 로그 기록 → SHA-256 해시 생성

**온체인 (정산/분쟁): CosmWasm Escrow Contract**
- stake 예치 / 결과 제출 / 분쟁 / 최종 정산을 담당하는 상태 머신
- 게임을 실행하지 않음 — 정산만 처리

### 4.2 기술 스택

| 레이어 | 기술 |
|--------|------|
| 블록체인 | Injective Testnet (`injective-888`) |
| 스마트 컨트랙트 | CosmWasm (Rust), `cw-storage-plus` |
| 게임 서버 | Node.js, TypeScript, WebSocket (`ws`) |
| 프론트엔드 | React 18, Vite, TailwindCSS |
| 지갑 | Keplr (`@injectivelabs/sdk-ts`) |
| 배포 | Vercel (프론트), Render (서버) |

### 4.3 모노레포 구조

```
shadow-arena-inj/
├── contracts/shadow_arena/   # CosmWasm 스마트 컨트랙트 (Rust)
│   └── src/
│       ├── contract.rs       # Execute/Query 핸들러
│       ├── state.rs          # 매치 상태 머신
│       ├── msg.rs            # 메시지 타입 정의
│       └── error.rs          # 컨트랙트 에러
├── server/                   # 게임 서버 (Node.js/TypeScript)
│   └── src/
│       ├── engine/           # 백개먼 룰 엔진
│       ├── ai/               # AI 상대 (easy/normal)
│       ├── ws/               # WebSocket 서버 & 매치메이킹
│       ├── chain/            # Injective SDK 연동
│       └── log/              # 게임 로그 & 해시 생성
├── apps/game-web/            # 프론트엔드 (React + Vite)
│   └── src/
│       ├── components/       # GameBoard, Lobby, PlayerPanel 등
│       └── hooks/            # useGameSocket, useContract, WalletContext
└── schema/                   # 자동 생성 컨트랙트 JSON 스키마
```

---

## 5. 온체인 정산 플로우 (Escrow)

온체인은 "게임을 실행"하지 않고, **정산을 위한 상태 머신**만 갖습니다.

```
CreateMatch (서버)
  → FundMatch(A) + FundMatch(B)      ← 양측 스테이크 예치
  → (오프체인 게임 진행)
  → SubmitResult (server_authority)   ← 서버가 결과 + game_hash 제출
  → ConfirmResult(A) + ConfirmResult(B)
  → dispute window (예: 10분)
  → Claim (정산)

분쟁 시:
  RaiseDispute → ResolveDispute → Claim

미예치 시:
  CancelUnfunded → 예치금 환불
```

### 매치 상태 머신

```
Created → Funded → Active → ResultPending → Finished → Settled
                                    ↓
                              Disputed → Resolved → Settled
                    ↓
              Cancelled (CancelUnfunded)
```

### game_hash (검증 가능한 결과)

서버는 매치 로그를 생성하고, 그 로그로 **game_hash(SHA-256)**를 만듭니다.

분쟁 발생 시, 누구나 **로그 재생(Replay) + 해시 대조**로 결과의 무결성을 검증할 수 있습니다.

- 서버는 매 턴(주사위 결과, 이동, 더블링)을 순서대로 기록
- 매치 종료 시 전체 로그를 SHA-256으로 해싱
- 해시는 `SubmitResult` 트랜잭션에 포함되어 온체인에 영구 기록
- 분쟁 시 로그 원본을 제출하면 누구나 해시를 재계산하여 대조 가능

---

## 6. 긴장감 설계 (룰이 아니라 연출로)

백개먼의 긴장감은 "조작된 룰"이 아니라 **심리전**에서 옵니다.
우리는 이를 연출로 강화하되, 반복 플레이 피로를 엄격히 관리합니다.

| 연출 | 설명 | 특성 |
|------|------|------|
| **Enhanced Doubling Moment** | 더블 제안 순간의 긴장감 연출 | 옵션/스킵 가능 |
| **Last Stand** | 베어오프 진입 시 1회 연출 | 단발성 |
| **High Stakes Indicator** | Gammon/Backgammon 가능성 등 위험도 신호 | 정보 제공 |
| **Fast Mode** | 숙련자용 연출 전체 비활성 프리셋 | 토글 |

> 모든 연출은 **개별 토글 가능**해야 하며, 경쟁 플레이에서 피로를 만들지 않도록 설계합니다.

---

## 7. 게임 모드

| 모드 | 설명 | 지갑 필요 |
|------|------|-----------|
| **Local AI** | AI 상대 (easy/normal 난이도), 오프라인 가능 | 불필요 |
| **Online PvP** | 실시간 WebSocket 매치메이킹 | 불필요 |
| **Stake Mode** | PvP + INJ 스테이킹 (온체인 에스크로) | Keplr 필요 |

---

## 8. 현재 개발 현황

### 완료

- **CosmWasm Escrow 컨트랙트** — 개발 완료, 테스트넷 배포
  - 매치 생성 / 예치 / 결과 제출 / 확인 / 분쟁 / 정산 / 취소
  - 8개 테스트 통과, 스키마 생성, wasm 빌드
  - CI/CD: GitHub Actions (test, lint, schema check, wasm build)
- **백개먼 룰 엔진** — 서버 사이드 완전 구현
  - 합법 이동 생성, 불법 수 차단, gammon/backgammon 판정
- **AI 상대** — easy(랜덤)/normal(휴리스틱) 2단계
- **게임 서버** — WebSocket 기반, Server Authoritative
  - 매치메이킹, 턴 관리, 타이머, 게임 로그
  - Injective SDK 연동 (CreateMatch, SubmitResult)
- **프론트엔드** — React + Vite + TailwindCSS
  - 게임 보드, 주사위, 로비, 플레이어 패널
  - Keplr 지갑 연동 (FundMatch, ConfirmResult, Claim)
  - WebSocket 실시간 동기화
- **배포** — Vercel (프론트) + Render (서버)

### 배포 정보

| 항목 | 값 |
|------|-----|
| 프론트엔드 | [shadow-arena.vercel.app](https://shadow-arena.vercel.app) |
| 게임 서버 | shadow-arena-server.onrender.com |
| 컨트랙트 | `inj1fkmq4sm8u2c8483sex889e3cyjw80r79qx7dy4` |
| 체인 | Injective Testnet (`injective-888`) |
| Code ID | 39271 |

---

## 9. MVP 범위

### 포함 (MVP)

- 토너먼트 규격 백개먼 룰 엔진
- AI 모드 (난이도 2단계, 휴리스틱 기반)
- 실시간 PvP (Server Authoritative + WebSocket)
- 닌자 테마 UI + Fast Mode
- Keplr 지갑 연결
- 테스트넷 기준 **온체인 Escrow 정산 end-to-end**

### 제외 (Phase 2 이후)

- 토너먼트 브라켓 / ELO 랭킹
- NFT 스킨/배지 (게임 영향 없는 cosmetic)
- 멀티 denom 지원
- 닌자 캐릭터 능력 시스템
- 더블링 큐브 UI
- "배율이 stake 구조에 즉시 내재되는" 완전 담보 모델

---

## 10. 결론

Shadow Arena는 "Web3 게임이 진짜로 공정할 수 있는가?"에 대한 답입니다.

- 룰을 왜곡하지 않고
- 확률을 조작하지 않고
- 온체인을 과하게 사용하지 않으면서도
- 정산은 검증 가능하게

우리는 **전략 + 심리전 + 검증 가능한 정산**에 집중합니다.

**이 프로젝트는 아이디어가 아니라, 동작하는 아키텍처입니다.**
