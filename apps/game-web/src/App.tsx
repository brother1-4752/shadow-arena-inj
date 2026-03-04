import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Lobby from './components/Lobby';
import GameShell from './components/GameShell';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Lobby />} />
        <Route path="/game" element={<GameShell />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
