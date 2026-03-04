## Active Work
- Game logic integration and playability (Phase 5).

## Recent Activity
- Implemented "Normal" difficulty AI with move-scoring logic (+2 making points, +2 hitting, -2 exposing blots, +1 pip reduction).
- Added an Easy/Normal difficulty selector to the game screen UI.
- Connected `GameShell` completely to the rules engine (`generateDice`, `setDice`, `applyStep`, `offerDouble`).
- Implemented timer constraints dictating auto-resignation during doubles.
- Designed dynamic action-bars appearing contextually near the player controlling the active turn.
- Implemented full game loop resolution (win screens, resets, fastMode compliance).
- Updated board rendering in `GameBoard.tsx` to explicitly match standard layout: Player B home is Top-Left (bearing off left) and Player A home is Bottom-Right (bearing off right).
- Commented engine `core.ts` to document explicit home board zones.

## Next Steps
- [ ] Connect AI engine API for "Shadow AI" so that Player 1's moves can be auto-executed locally.
- [ ] Refactor game state hook to interface with external authoritative server (Injective / CosmWasm preparations).
- [ ] Add sound effects for dice rolling and hitting.
