import React from 'react';
import { useWalletContext } from '../hooks/WalletContext';

export default function WalletBar() {
  const wallet = useWalletContext();

  const shortAddress = wallet.address
    ? `${wallet.address.slice(0, 10)}...${wallet.address.slice(-4)}`
    : null;

  return (
    <div className="fixed top-4 right-4 z-[300] flex items-center gap-3">
      {wallet.connected ? (
        <div className="flex items-center gap-3 px-4 py-2 bg-black/80 border border-gray-700/50 rounded-lg backdrop-blur-md shadow-lg">
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">{wallet.chainName}</span>
            <span className="text-xs text-green-300 font-mono">{shortAddress}</span>
          </div>
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          <button
            onClick={wallet.disconnect}
            className="text-[10px] text-gray-500 hover:text-red-400 uppercase tracking-wider font-bold transition-colors ml-1"
          >
            Disconnect
          </button>
        </div>
      ) : (
        <button
          onClick={wallet.connect}
          disabled={wallet.connecting}
          className="px-4 py-2 bg-purple-900/60 hover:bg-purple-800/80 border border-purple-600/50 rounded-lg
                     text-purple-200 text-sm font-bold tracking-wider uppercase transition-all backdrop-blur-md shadow-lg
                     hover:shadow-[0_0_15px_rgba(168,85,247,0.4)] disabled:opacity-50 disabled:cursor-wait"
        >
          {wallet.connecting ? 'Connecting...' : 'Connect Wallet'}
        </button>
      )}
      {wallet.error && (
        <div className="absolute top-full right-0 mt-2 px-3 py-1.5 bg-red-950/90 border border-red-800/50 rounded text-red-300 text-xs max-w-xs backdrop-blur-md">
          {wallet.error}
        </div>
      )}
    </div>
  );
}
