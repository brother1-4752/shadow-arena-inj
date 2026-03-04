# Requirements & Known Issues

## Requirements
- **Theme**: Must strictly adhere to the provided assets and description (dark ninja dojo, green/purple neon highlights, no cartoonish elements).
- **Core Engine**: Game logic (board state, point movements, valid moves validation, dice generation) must be completely decoupled from the React rendering components.
- **Fairness**: Dice rolls are purely random; logic must be foolproof against client-side manipulation.
- **Visuals**: The Doubling cube, dice rolls, and character avatars need clear, tense visual representation.

## Known Issues
- Currently, only the visual shell exists. The Backgammon rules engine, board interactions, and CosmWasm contract integration are pending.
- "Roll Dice", "Create Match", "Join Match", and "Connect Wallet" buttons are intentionally disabled stubs.
