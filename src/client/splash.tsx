import './index.css';

import { requestExpandedMode } from '@devvit/web/client';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { InitGameResponse } from '../shared/api';
import { generateDailyPuzzle, getUtcDateKey } from '../shared/puzzle';

type SplashSummary = {
  puzzleNumber: number;
  title: string;
  difficulty: string;
  par: number;
  totalSolves: number;
  parSolves: number;
  streak: number;
  alreadySolved: boolean;
  playerMoves: number | null;
};

function buildFallbackSummary(): SplashSummary {
  const today = getUtcDateKey();
  const p = generateDailyPuzzle(today);
  return {
    puzzleNumber: p.puzzleNumber,
    title: p.title,
    difficulty: p.difficulty,
    par: p.par,
    totalSolves: 0,
    parSolves: 0,
    streak: 0,
    alreadySolved: false,
    playerMoves: null,
  };
}

export const Splash = () => {
  const [summary, setSummary] = useState<SplashSummary>(() => buildFallbackSummary());

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await fetch('/api/init');
        if (!res.ok) return;
        const data: InitGameResponse = await res.json();
        if (!mounted) return;
        setSummary({
          puzzleNumber: data.puzzle.puzzleNumber,
          title: data.puzzle.title,
          difficulty: data.puzzle.difficulty,
          par: data.puzzle.par,
          totalSolves: data.stats.totalSolves,
          parSolves: data.stats.parSolves,
          streak: data.streak,
          alreadySolved: Boolean(data.playerRecord?.solved),
          playerMoves: data.playerRecord?.moves ?? null,
        });
      } catch {
        // Standalone preview mode uses deterministic daily fallback
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const parPct =
    summary.totalSolves > 0 ? Math.round((summary.parSolves / summary.totalSolves) * 100) : null;

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-[#f6f1e7] text-[#1d2128]">
      <div className="w-full max-w-[440px] chassis-frame rounded-2xl p-5 flex flex-col items-center gap-4 text-center">
        {/* Top brass nameplate */}
        <div className="w-full flex items-center justify-between text-[11px] font-semibold tracking-[0.14em] uppercase text-[#5d5950]">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#d9441e] led-pulse" />
            Daily Relay #{summary.puzzleNumber}
          </span>
          <span className="px-2 py-0.5 rounded-full bg-[#f6f1e7] border border-[#cfc2aa] text-[#6d5320]">
            {summary.difficulty} · Par {summary.par}
          </span>
        </div>

        {/* Hero tactile emblem */}
        <div className="w-28 h-28 rounded-2xl overflow-hidden border-2 border-[#c9ba9e] shadow-md bg-[#f6f1e7]">
          <img
            src="/switchboard-emblem.jpg"
            alt="Switchboard relay board emblem"
            className="w-full h-full object-cover"
          />
        </div>

        {/* Title & Hook */}
        <div className="space-y-1">
          <h1 className="text-2xl font-extrabold tracking-tight text-[#1d2128]">SWITCHBOARD</h1>
          <p className="text-sm font-semibold text-[#8c6924]">{summary.title}</p>
          <p className="text-xs text-[#5d5950] max-w-[320px] leading-relaxed">
            Rotate ceramic switches to route live signal from <strong className="text-[#d9441e]">IN</strong>{' '}
            through every <strong className="text-[#9a6309]">⚡ Relay</strong> to{' '}
            <strong className="text-[#0d7a5f]">OUT</strong> in Par moves.
          </p>
        </div>

        {/* Live Subreddit & Streak Telemetry */}
        <div className="w-full grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-[#fbf8f1] border border-[#d6cab3] py-2 px-2">
            <div className="text-sm font-bold tabular-nums text-[#1d2128]">
              {summary.totalSolves}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-[#6e675b]">Solvers</div>
          </div>
          <div className="rounded-xl bg-[#fbf8f1] border border-[#d6cab3] py-2 px-2">
            <div className="text-sm font-bold tabular-nums text-[#0d7a5f]">
              {parPct !== null ? `${parPct}%` : `Par ${summary.par}`}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-[#6e675b]">
              {parPct !== null ? 'Hit Par' : 'Target'}
            </div>
          </div>
          <div className="rounded-xl bg-[#fbf8f1] border border-[#d6cab3] py-2 px-2">
            <div className="text-sm font-bold tabular-nums text-[#d9441e]">
              {summary.streak > 0 ? `🔥 ${summary.streak}` : '0'}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-[#6e675b]">Streak</div>
          </div>
        </div>

        {/* Primary Launch CTA */}
        <button
          type="button"
          className="w-full py-3 px-5 rounded-xl bg-[#d9441e] hover:bg-[#c03917] active:scale-[0.99] text-white font-bold text-sm tracking-wide shadow-md cursor-pointer transition-all flex items-center justify-center gap-2"
          onClick={(e) => {
            try {
              void requestExpandedMode(e.nativeEvent, 'game');
            } catch {
              window.location.href = './game.html';
            }
          }}
        >
          {summary.alreadySolved
            ? `Solved (${summary.playerMoves}/${summary.par}) · View Board & Leaderboard`
            : `Play Today's Switchboard`}
        </button>
      </div>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);
