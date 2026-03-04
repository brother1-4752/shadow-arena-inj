# File Structure

## Architecture Overview
The application uses a standard React component hierarchy managed by `react-router-dom`. Game logic (engine) and visual UI are separated to ensure maintainability and tournament-level fairness.

## Key Files
- `src/App.tsx`: React Router configuration (Lobby & Game routing).
- `src/assets.json`: Centralized registry for all generated images/assets (backgrounds, characters, ui elements).
- `src/components/Lobby.tsx`: Main entry screen. Cinematic title, functional "Quick Play vs AI" navigation button, and disabled placeholders for future multiplayer and wallet connectivity.
- `src/components/GameShell.tsx`: The main visual container for gameplay. Includes top/bottom player info panels, absolute-positioned doubling cube UI, dice placeholders, and the central backgammon board area placeholder.

## Assets
- Theming heavily utilizes Tailwind configuration (`bg-black`, `mix-blend-screen`, `bg-gradient-to-t`) rather than raw CSS, keeping styling aligned with components.
