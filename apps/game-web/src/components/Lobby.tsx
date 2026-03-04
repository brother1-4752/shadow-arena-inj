import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Assets from '../assets.json';

export default function Lobby() {
  const navigate = useNavigate();
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
      
      {/* Shadow overlay to improve text contrast */}
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
          <button 
            onClick={() => setShowDifficultyModal(true)}
            className="w-full py-4 px-6 bg-red-900/40 hover:bg-red-800/60 border border-red-700/50 rounded 
                       text-red-100 font-bold tracking-wider uppercase transition-all duration-300
                       hover:shadow-[0_0_20px_rgba(220,38,38,0.5)] hover:border-red-500 backdrop-blur-sm"
          >
            Quick Play vs AI
          </button>
          
          <button 
            disabled
            className="w-full py-4 px-6 bg-gray-900/40 border border-gray-800 rounded 
                       text-gray-500 font-bold tracking-wider uppercase cursor-not-allowed backdrop-blur-sm"
          >
            Create Match
          </button>
          
          <button 
            disabled
            className="w-full py-4 px-6 bg-gray-900/40 border border-gray-800 rounded 
                       text-gray-500 font-bold tracking-wider uppercase cursor-not-allowed backdrop-blur-sm"
          >
            Join Match
          </button>
          
          <button 
            disabled
            className="w-full py-4 px-6 bg-gray-900/40 border border-gray-800 rounded 
                       text-gray-500 font-bold tracking-wider uppercase cursor-not-allowed backdrop-blur-sm"
          >
            Connect Wallet
          </button>
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
