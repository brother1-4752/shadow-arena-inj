import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Assets from '../assets.json';
import { useWalletContext } from '../hooks/WalletContext';

export default function Lobby() {
  const navigate = useNavigate();
  const wallet = useWalletContext();
  const [showDifficultyModal, setShowDifficultyModal] = useState(false);

  return (
    <div
      className="relative min-h-screen w-full flex flex-col items-center justify-center overflow-hidden bg-black"
    >
      {/* Background Image Layer */}
      <div
        className="absolute inset-0 z-0 bg-cover bg-center opacity-60 mix-blend-screen"
        style={{ backgroundImage: `url(${Assets.images.backgrounds.dark_lobby.url})` }}
      />

      {/* Shadow overlay */}
      <div className="absolute inset-0 z-10 bg-gradient-to-t from-black via-transparent to-black opacity-80" />

      {/* Main Content */}
      <div className="relative z-20 flex flex-col items-center p-8 space-y-12 max-w-2xl w-full">

        {/* Title Group */}
        <div className="text-center space-y-2">
          <h1 className="text-6xl md:text-8xl font-black text-red-600 tracking-widest drop-shadow-[0_0_20px_rgba(220,38,38,0.8)] uppercase font-serif">
            Shadow Arena
          </h1>
          <h2 className="text-xl md:text-2xl text-gray-300 tracking-[0.4em] uppercase font-light drop-shadow-md">
            Ninja Backgammon
          </h2>
        </div>

        {/* Buttons Group */}
        <div className="flex flex-col w-full max-w-md gap-4">

          {/* If wallet not connected, show connect prompt first */}
          {!wallet.connected && (
            <div className="text-center space-y-4 mb-4">
              <p className="text-gray-400 text-sm uppercase tracking-wider">Connect your wallet to start playing</p>
              <button
                onClick={wallet.connect}
                disabled={wallet.connecting}
                className="w-full py-4 px-6 bg-purple-900/40 hover:bg-purple-800/60 border border-purple-700/50 rounded
                           text-purple-100 font-bold tracking-wider uppercase transition-all duration-300
                           hover:shadow-[0_0_20px_rgba(168,85,247,0.5)] hover:border-purple-500 backdrop-blur-sm
                           disabled:opacity-50 disabled:cursor-wait"
              >
                {wallet.connecting ? 'Connecting...' : 'Connect Keplr Wallet'}
              </button>
              {wallet.error && <p className="text-red-400 text-sm">{wallet.error}</p>}
            </div>
          )}

          {/* Game mode buttons — only enabled when wallet is connected */}
          <button
            onClick={() => setShowDifficultyModal(true)}
            disabled={!wallet.connected}
            className={`w-full py-4 px-6 rounded font-bold tracking-wider uppercase transition-all duration-300 backdrop-blur-sm
              ${wallet.connected
                ? 'bg-red-900/40 hover:bg-red-800/60 border border-red-700/50 text-red-100 hover:shadow-[0_0_20px_rgba(220,38,38,0.5)] hover:border-red-500'
                : 'bg-gray-900/40 border border-gray-800 text-gray-600 cursor-not-allowed'}`}
          >
            Quick Play vs AI
          </button>

          <button
            onClick={() => navigate('/game?mode=ai-server&difficulty=normal')}
            disabled={!wallet.connected}
            className={`w-full py-4 px-6 rounded font-bold tracking-wider uppercase transition-all duration-300 backdrop-blur-sm
              ${wallet.connected
                ? 'bg-blue-900/40 hover:bg-blue-800/60 border border-blue-700/50 text-blue-100 hover:shadow-[0_0_20px_rgba(59,130,246,0.5)] hover:border-blue-500'
                : 'bg-gray-900/40 border border-gray-800 text-gray-600 cursor-not-allowed'}`}
          >
            Play vs Server AI
          </button>

          <button
            onClick={() => navigate('/game?mode=online')}
            disabled={!wallet.connected}
            className={`w-full py-4 px-6 rounded font-bold tracking-wider uppercase transition-all duration-300 backdrop-blur-sm
              ${wallet.connected
                ? 'bg-green-900/40 hover:bg-green-800/60 border border-green-700/50 text-green-100 hover:shadow-[0_0_20px_rgba(34,197,94,0.5)] hover:border-green-500'
                : 'bg-gray-900/40 border border-gray-800 text-gray-600 cursor-not-allowed'}`}
          >
            Online PvP Match
          </button>

          {wallet.connected && (
            <button
              onClick={() => navigate('/game?mode=online&stake=1000000&denom=inj')}
              className="w-full py-4 px-6 bg-yellow-900/40 hover:bg-yellow-800/60 border border-yellow-700/50 rounded
                         text-yellow-100 font-bold tracking-wider uppercase transition-all duration-300
                         hover:shadow-[0_0_20px_rgba(234,179,8,0.5)] hover:border-yellow-500 backdrop-blur-sm"
            >
              Stake Match (1 INJ)
            </button>
          )}
        </div>

      </div>

      {/* Difficulty Selection Modal */}
      {showDifficultyModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
          <div className="flex flex-col items-center gap-6 p-8 border border-red-900/50 bg-neutral-950 rounded-lg shadow-[0_0_40px_rgba(220,38,38,0.4)] max-w-sm w-full mx-4 animate-[fadeIn_0.2s_ease-out]">
            <h3 className="text-2xl font-black text-red-500 uppercase tracking-widest drop-shadow-[0_0_10px_rgba(220,38,38,0.8)]">Select Difficulty</h3>

            <div className="w-full flex flex-col gap-4">
              <button
                onClick={() => navigate('/game?diff=easy')}
                className="w-full p-4 bg-gray-900/60 hover:bg-gray-800 border border-gray-700 hover:border-gray-500 rounded transition-colors group text-left"
              >
                <div className="text-xl font-bold text-gray-200 group-hover:text-white mb-1 uppercase tracking-wider">Easy</div>
                <div className="text-sm text-gray-500 group-hover:text-gray-400">Random moves, perfect for beginners.</div>
              </button>

              <button
                onClick={() => navigate('/game?diff=normal')}
                className="w-full p-4 bg-red-950/40 hover:bg-red-900/60 border border-red-900/50 hover:border-red-500/50 rounded transition-colors group text-left"
              >
                <div className="text-xl font-bold text-red-400 group-hover:text-red-300 mb-1 uppercase tracking-wider">Normal</div>
                <div className="text-sm text-red-900/80 group-hover:text-red-400">Strategic play prioritizing points and hits.</div>
              </button>
            </div>

            <button
              onClick={() => setShowDifficultyModal(false)}
              className="mt-2 text-gray-600 hover:text-gray-300 uppercase tracking-widest text-sm font-bold transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
