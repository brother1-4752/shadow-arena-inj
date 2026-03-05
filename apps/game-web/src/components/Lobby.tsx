import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Assets from "../assets.json";
import { useWalletContext } from "../hooks/WalletContext";

interface ActiveMatchInfo {
  matchId: string;
  stake: string;
  denom: string;
}

export default function Lobby() {
  const navigate = useNavigate();
  const wallet = useWalletContext();
  const [showDifficultyModal, setShowDifficultyModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinMatchId, setJoinMatchId] = useState("");
  const [activeMatch, setActiveMatch] = useState<ActiveMatchInfo | null>(null);
  const [checkingMatch, setCheckingMatch] = useState(false);

  // Probe the server for an active match when wallet is connected
  useEffect(() => {
    if (!wallet.connected || !wallet.address) {
      setActiveMatch(null);
      return;
    }

    setCheckingMatch(true);
    const serverUrl = import.meta.env.VITE_WS_URL || "ws://localhost:8080";
    const params = new URLSearchParams({ address: wallet.address });
    const ws = new WebSocket(`${serverUrl}?${params.toString()}`);
    let closed = false;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "CHECK_ACTIVE_MATCH" }));
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "ACTIVE_MATCH") {
        setActiveMatch({
          matchId: msg.matchId,
          stake: msg.stake,
          denom: msg.denom,
        });
      } else if (msg.type === "NO_ACTIVE_MATCH") {
        setActiveMatch(null);
      }
      // Also handle if server auto-reconnects us (MATCH_JOINED/MATCH_CREATED)
      if (msg.type === "MATCH_JOINED" || msg.type === "MATCH_CREATED") {
        setActiveMatch({
          matchId: msg.matchId,
          stake: "0",
          denom: "inj",
        });
      }
      setCheckingMatch(false);
      // Close the probe connection
      if (!closed) {
        closed = true;
        ws.close();
      }
    };

    ws.onerror = () => {
      setCheckingMatch(false);
    };

    ws.onclose = () => {
      setCheckingMatch(false);
    };

    // Timeout fallback
    const timeout = setTimeout(() => {
      if (!closed) {
        closed = true;
        ws.close();
        setCheckingMatch(false);
      }
    }, 3000);

    return () => {
      clearTimeout(timeout);
      if (!closed) {
        closed = true;
        ws.close();
      }
    };
  }, [wallet.connected, wallet.address]);

  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-center overflow-hidden bg-black">
      {/* Background Image Layer */}
      <div
        className="absolute inset-0 z-0 bg-cover bg-center opacity-60 mix-blend-screen"
        style={{
          backgroundImage: `url(${Assets.images.backgrounds.dark_lobby.url})`,
        }}
      />

      {/* Shadow overlay */}
      <div className="absolute inset-0 z-10 bg-gradient-to-t from-black via-transparent to-black opacity-80" />

      {/* Main Content */}
      <div className="relative z-20 flex flex-col items-center p-8 space-y-10 max-w-2xl w-full">
        {/* Title Group */}
        <div className="text-center space-y-2">
          <h1 className="text-6xl md:text-8xl font-black text-red-600 tracking-widest drop-shadow-[0_0_20px_rgba(220,38,38,0.8)] uppercase font-serif">
            Shadow Arena
          </h1>
          <h2 className="text-xl md:text-2xl text-gray-300 tracking-[0.4em] uppercase font-light drop-shadow-md">
            Ninja Backgammon
          </h2>
        </div>

        {/* Wallet connect prompt (shown when not connected) */}
        {!wallet.connected && (
          <div className="text-center space-y-3">
            <p className="text-gray-500 text-sm uppercase tracking-wider">
              Connect wallet for online and stake modes
            </p>
            <button
              onClick={wallet.connect}
              disabled={wallet.connecting}
              className="px-8 py-3 bg-purple-900/40 hover:bg-purple-800/60 border border-purple-700/50 rounded
                         text-purple-100 font-bold tracking-wider uppercase transition-all duration-300
                         hover:shadow-[0_0_20px_rgba(168,85,247,0.5)] hover:border-purple-500 backdrop-blur-sm
                         disabled:opacity-50 disabled:cursor-wait"
            >
              {wallet.connecting ? "Connecting..." : "Connect Keplr Wallet"}
            </button>
            {wallet.error && (
              <p className="text-red-400 text-sm">{wallet.error}</p>
            )}
          </div>
        )}

        <div className="flex flex-col w-full max-w-md gap-6">
          {/* ── ACTIVE MATCH REJOIN BANNER ── */}
          {activeMatch && (
            <div className="space-y-2">
              <button
                onClick={() => {
                  const stakeParam = activeMatch.stake !== "0"
                    ? `&stake=${activeMatch.stake}&denom=${activeMatch.denom}`
                    : "";
                  navigate(`/game?mode=online${stakeParam}`);
                }}
                className="w-full py-4 px-6 bg-orange-900/50 hover:bg-orange-800/70 border-2 border-orange-500/70 rounded
                           text-orange-100 font-bold tracking-wider uppercase transition-all duration-300
                           hover:shadow-[0_0_25px_rgba(249,115,22,0.5)] hover:border-orange-400 backdrop-blur-sm
                           animate-pulse"
              >
                Rejoin Match ({activeMatch.matchId.slice(0, 8)})
                {activeMatch.stake !== "0" && " [STAKE]"}
              </button>
              <p className="text-orange-400/70 text-xs pl-1">
                You have an active match in progress
              </p>
            </div>
          )}
          {checkingMatch && (
            <p className="text-gray-600 text-xs text-center">Checking for active matches...</p>
          )}
          {/* ── SECTION 1: LOCAL PLAY ── */}
          <div className="space-y-2">
            <h3 className="text-xs text-gray-600 uppercase tracking-[0.3em] font-bold pl-1">
              Local Play
            </h3>
            <button
              onClick={() => setShowDifficultyModal(true)}
              className="w-full py-4 px-6 bg-red-900/40 hover:bg-red-800/60 border border-red-700/50 rounded
                         text-red-100 font-bold tracking-wider uppercase transition-all duration-300
                         hover:shadow-[0_0_20px_rgba(220,38,38,0.5)] hover:border-red-500 backdrop-blur-sm"
            >
              Quick Play vs AI
            </button>
          </div>

          {/* ── SECTION 2: ONLINE PVP ── */}
          <div className="space-y-2">
            <h3 className="text-xs text-gray-600 uppercase tracking-[0.3em] font-bold pl-1">
              Online PvP
            </h3>
            <button
              onClick={() => {
                const guestParam = !wallet.connected ? "&guest=true" : "";
                navigate(`/game?mode=online${guestParam}`);
              }}
              className="w-full py-4 px-6 bg-blue-900/40 hover:bg-blue-800/60 border border-blue-700/50 rounded
                         text-blue-100 font-bold tracking-wider uppercase transition-all duration-300
                         hover:shadow-[0_0_20px_rgba(59,130,246,0.5)] hover:border-blue-500 backdrop-blur-sm"
            >
              Quick Match
            </button>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  if (!wallet.connected) {
                    navigate("/game?mode=online&guest=true&create=true");
                  } else {
                    navigate("/game?mode=online&create=true");
                  }
                }}
                className={`flex-1 py-3 px-4 rounded font-bold tracking-wider uppercase transition-all duration-300 backdrop-blur-sm text-sm
                  ${
                    wallet.connected
                      ? "bg-green-900/40 hover:bg-green-800/60 border border-green-700/50 text-green-100 hover:shadow-[0_0_20px_rgba(34,197,94,0.5)] hover:border-green-500"
                      : "bg-teal-900/40 hover:bg-teal-800/60 border border-teal-700/50 text-teal-100 hover:shadow-[0_0_20px_rgba(20,184,166,0.5)] hover:border-teal-500"
                  }`}
              >
                Create Match
              </button>
              <button
                onClick={() => setShowJoinModal(true)}
                className={`flex-1 py-3 px-4 rounded font-bold tracking-wider uppercase transition-all duration-300 backdrop-blur-sm text-sm
                  ${
                    wallet.connected
                      ? "bg-green-900/40 hover:bg-green-800/60 border border-green-700/50 text-green-100 hover:shadow-[0_0_20px_rgba(34,197,94,0.5)] hover:border-green-500"
                      : "bg-teal-900/40 hover:bg-teal-800/60 border border-teal-700/50 text-teal-100 hover:shadow-[0_0_20px_rgba(20,184,166,0.5)] hover:border-teal-500"
                  }`}
              >
                Join Match
              </button>
            </div>
            {!wallet.connected && (
              <p className="text-gray-600 text-xs pl-1">
                Playing as guest (no wallet)
              </p>
            )}
          </div>

          {/* ── SECTION 3: STAKE MATCH ── */}
          <div className="space-y-2">
            <h3 className="text-xs text-gray-600 uppercase tracking-[0.3em] font-bold pl-1">
              Stake Match
            </h3>
            <button
              onClick={() =>
                navigate("/game?mode=online&stake=1000000000000000&denom=inj&create=true")
              }
              disabled={!wallet.connected}
              className={`w-full py-4 px-6 rounded font-bold tracking-wider uppercase transition-all duration-300 backdrop-blur-sm
                ${
                  wallet.connected
                    ? "bg-yellow-900/40 hover:bg-yellow-800/60 border border-yellow-700/50 text-yellow-100 hover:shadow-[0_0_20px_rgba(234,179,8,0.5)] hover:border-yellow-500"
                    : "bg-gray-900/40 border border-gray-800 text-gray-600 cursor-not-allowed"
                }`}
            >
              Stake Match (0.001 INJ)
            </button>
            {!wallet.connected && (
              <p className="text-gray-600 text-xs pl-1">
                Requires wallet connection
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Difficulty Selection Modal */}
      {showDifficultyModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
          <div className="flex flex-col items-center gap-6 p-8 border border-red-900/50 bg-neutral-950 rounded-lg shadow-[0_0_40px_rgba(220,38,38,0.4)] max-w-sm w-full mx-4 animate-[fadeIn_0.2s_ease-out]">
            <h3 className="text-2xl font-black text-red-500 uppercase tracking-widest drop-shadow-[0_0_10px_rgba(220,38,38,0.8)]">
              Select Difficulty
            </h3>

            <div className="w-full flex flex-col gap-4">
              <button
                onClick={() => navigate("/game?diff=easy")}
                className="w-full p-4 bg-gray-900/60 hover:bg-gray-800 border border-gray-700 hover:border-gray-500 rounded transition-colors group text-left"
              >
                <div className="text-xl font-bold text-gray-200 group-hover:text-white mb-1 uppercase tracking-wider">
                  Easy
                </div>
                <div className="text-sm text-gray-500 group-hover:text-gray-400">
                  Random moves, perfect for beginners.
                </div>
              </button>

              <button
                onClick={() => navigate("/game?diff=normal")}
                className="w-full p-4 bg-red-950/40 hover:bg-red-900/60 border border-red-900/50 hover:border-red-500/50 rounded transition-colors group text-left"
              >
                <div className="text-xl font-bold text-red-400 group-hover:text-red-300 mb-1 uppercase tracking-wider">
                  Normal
                </div>
                <div className="text-sm text-red-900/80 group-hover:text-red-400">
                  Strategic play prioritizing points and hits.
                </div>
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

      {/* Join Match Modal */}
      {showJoinModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
          <div className="flex flex-col items-center gap-6 p-8 border border-green-900/50 bg-neutral-950 rounded-lg shadow-[0_0_40px_rgba(34,197,94,0.3)] max-w-sm w-full mx-4 animate-[fadeIn_0.2s_ease-out]">
            <h3 className="text-2xl font-black text-green-500 uppercase tracking-widest drop-shadow-[0_0_10px_rgba(34,197,94,0.8)]">
              Join Match
            </h3>

            <div className="w-full space-y-4">
              <input
                type="text"
                value={joinMatchId}
                onChange={(e) => setJoinMatchId(e.target.value)}
                placeholder="Enter Match ID"
                className="w-full px-4 py-3 bg-black/60 border border-gray-700 rounded text-white placeholder-gray-600
                           focus:outline-none focus:border-green-500/50 focus:shadow-[0_0_10px_rgba(34,197,94,0.2)]
                           font-mono text-sm tracking-wider"
              />
              <button
                onClick={() => {
                  if (!joinMatchId.trim()) return;
                  const guestParam = !wallet.connected ? "&guest=true" : "";
                  navigate(
                    `/game?mode=online&matchId=${joinMatchId.trim()}${guestParam}`,
                  );
                }}
                disabled={!joinMatchId.trim()}
                className="w-full py-3 bg-green-900/60 hover:bg-green-800/80 border border-green-500/50 rounded
                           text-green-100 font-bold uppercase tracking-wider transition-all
                           disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Join
              </button>
            </div>

            <button
              onClick={() => {
                setShowJoinModal(false);
                setJoinMatchId("");
              }}
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
