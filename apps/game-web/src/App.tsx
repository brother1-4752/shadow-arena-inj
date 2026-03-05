import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { WalletProvider } from './hooks/WalletContext';
import WalletBar from './components/WalletBar';
import Lobby from './components/Lobby';
import GameShell from './components/GameShell';

function App() {
  return (
    <WalletProvider>
      <BrowserRouter>
        <WalletBar />
        <Routes>
          <Route path="/" element={<Lobby />} />
          <Route path="/game" element={<GameShell />} />
        </Routes>
      </BrowserRouter>
    </WalletProvider>
  );
}

export default App;
