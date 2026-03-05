import React from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { WalletProvider } from './hooks/WalletContext';
import WalletBar from './components/WalletBar';
import Lobby from './components/Lobby';
import GameShell from './components/GameShell';

function AppRoutes() {
  const location = useLocation();
  const isGame = location.pathname === '/game';

  return (
    <>
      {!isGame && <WalletBar />}
      <Routes>
        <Route path="/" element={<Lobby />} />
        <Route path="/game" element={<GameShell />} />
      </Routes>
    </>
  );
}

function App() {
  return (
    <WalletProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </WalletProvider>
  );
}

export default App;
