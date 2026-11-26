import './index.css';

import { showToast } from '@devvit/web/client';
import { StrictMode, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import type {
  CommunityBoardSummary,
  DailyPuzzle,
  ForgeBoardResponse,
  InitGameResponse,
  LeaderboardEntry,
  PlayerDailyRecord,
  ShareScoreResponse,
  SubmitSolveResponse,
  SubredditDayStats,
  TileSpec,
} from '../shared/api';
import {
  buildSpoilerFreeShareGrid,
  clicksToMatch,
  evaluateCircuit,
  formatRedditShareComment,
  generateDailyPuzzle,
  getMedalForMoves,
  getRecentDateKeys,
  getRotationalPeriod,
  getUtcDateKey,
} from '../shared/puzzle';
import { TileSvg } from './components/TileSvg';
import { playCircuitSolved, playRelayChime, playRelayClick } from './sound';

type ViewTab = 'play' | 'leaderboard' | 'archive' | 'forge';

function safeToast(msg: string, setBanner: (text: string) => void): void {
  setBanner(msg);
  try {
    showToast(msg);
  } catch {
    // Standalone browser preview without Devvit host
  }
}

function createStandaloneInit(dateKey: string): InitGameResponse {
  const todayKey = getUtcDateKey();
  const puzzle = generateDailyPuzzle(dateKey);
  return {
    username: 'u/demo_operator',
    subredditName: 'r/SwitchboardDaily',
    postId: 'preview-post',
    todayKey,
    puzzle,
    stats: {
      dateKey,
      puzzleNumber: puzzle.puzzleNumber,
      totalSolves: 42,
      parSolves: 19,
      avgMoves: puzzle.par + 1.4,
      hottestTileIndex: 12,
    },
    leaderboard: [
      {
        username: 'circuit_fox',
        moves: puzzle.par,
        timeSec: 18,
        par: puzzle.par,
        medal: 'PAR',
        solvedAt: new Date().toISOString(),
      },
      {
        username: 'relay_runner',
        moves: puzzle.par,
        timeSec: 27,
        par: puzzle.par,
        medal: 'PAR',
        solvedAt: new Date().toISOString(),
      },
      {
        username: 'copper_cat',
        moves: puzzle.par + 1,
        timeSec: 34,
        par: puzzle.par,
        medal: 'SILVER',
        solvedAt: new Date().toISOString(),
      },
    ],
    playerRecord: null,
    streak: 3,
    bestStreak: 5,
    totalSolved: 11,
    recentArchiveKeys: getRecentDateKeys(todayKey, 7),
    communityBoards: [
      {
        id: 'cb_sample_1',
        title: 'Midnight Shunt',
        author: 'circuit_fox',
        par: generateDailyPuzzle(todayKey, { salt: 'sample-midnight-shunt' }).par,
        plays: 14,
        createdAt: new Date().toISOString(),
        puzzle: generateDailyPuzzle(todayKey, {
          salt: 'sample-midnight-shunt',
          titleOverride: 'Midnight Shunt',
          author: 'circuit_fox',
          customId: 'cb_sample_1',
        }),
      },
    ],
  };
}

export const App = () => {
  const [tab, setTab] = useState<ViewTab>('play');
  const [isLiveReddit, setIsLiveReddit] = useState(true);
  const [loading, setLoading] = useState(true);

  const [username, setUsername] = useState('operator');
  const [todayKey, setTodayKey] = useState(() => getUtcDateKey());
  const [puzzle, setPuzzle] = useState<DailyPuzzle>(() => generateDailyPuzzle(getUtcDateKey()));
  const [tiles, setTiles] = useState<TileSpec[]>(() => puzzle.tiles.map((t) => ({ ...t })));
  const [visualAngles, setVisualAngles] = useState<number[]>(() =>
    puzzle.tiles.map((t) => t.rotation * 90)
  );
  const [history, setHistory] = useState<Array<{ idx: number; prevRot: number; prevAngle: number }>>(
    []
  );
  const [tileClicks, setTileClicks] = useState<number[]>(() => Array.from({ length: 25 }, () => 0));

  const [moves, setMoves] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [hintIdx, setHintIdx] = useState<number | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [muted, setMuted] = useState(false);

  const [stats, setStats] = useState<SubredditDayStats | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [playerRecord, setPlayerRecord] = useState<PlayerDailyRecord | null>(null);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [totalSolved, setTotalSolved] = useState(0);
  const [recentArchiveKeys, setRecentArchiveKeys] = useState<string[]>(() =>
    getRecentDateKeys(getUtcDateKey(), 7)
  );
  const [communityBoards, setCommunityBoards] = useState<CommunityBoardSummary[]>([]);

  const [solvedBannerOpen, setSolvedBannerOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [sharedNow, setSharedNow] = useState(false);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  // Forge state
  const [forgeTitle, setForgeTitle] = useState('');
  const [forgeSeed, setForgeSeed] = useState(101);
  const [forging, setForging] = useState(false);

  const submittedBoardKeyRef = useRef<string | null>(null);
  const prevRelaysRef = useRef<number>(0);

  const evaluation = useMemo(() => evaluateCircuit(tiles, puzzle.size), [tiles, puzzle.size]);

  const applyPuzzle = (nextPuzzle: DailyPuzzle) => {
    setPuzzle(nextPuzzle);
    setTiles(nextPuzzle.tiles.map((t) => ({ ...t })));
    setVisualAngles(nextPuzzle.tiles.map((t) => t.rotation * 90));
    setHistory([]);
    setTileClicks(Array.from({ length: nextPuzzle.size * nextPuzzle.size }, () => 0));
    setMoves(0);
    setHintsUsed(0);
    setHintIdx(null);
    setElapsedSec(0);
    setSolvedBannerOpen(false);
    setSharedNow(false);
    submittedBoardKeyRef.current = null;
    prevRelaysRef.current = evaluateCircuit(nextPuzzle.tiles, nextPuzzle.size).relaysEnergized;
  };

  const [requestedDate, setRequestedDate] = useState<string | undefined>(undefined);
  const [reloadNonce, setReloadNonce] = useState(0);

  const loadDailyBoard = (dateKey?: string) => {
    setLoading(true);
    setStatusBanner(null);
    setRequestedDate(dateKey);
    setReloadNonce((n) => n + 1);
  };

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        const qs = requestedDate ? `?date=${encodeURIComponent(requestedDate)}` : '';
        const res = await fetch(`/api/init${qs}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: InitGameResponse = await res.json();
        if (!active) return;
        setIsLiveReddit(true);
        setUsername(data.username);
        setTodayKey(data.todayKey);
        setStats(data.stats);
        setLeaderboard(data.leaderboard);
        setPlayerRecord(data.playerRecord);
        setStreak(data.streak);
        setBestStreak(data.bestStreak);
        setTotalSolved(data.totalSolved);
        setRecentArchiveKeys(data.recentArchiveKeys);
        setCommunityBoards(data.communityBoards);
        applyPuzzle(data.puzzle);
      } catch {
        if (!active) return;
        const fallback = createStandaloneInit(requestedDate ?? getUtcDateKey());
        setIsLiveReddit(false);
        setUsername(fallback.username);
        setTodayKey(fallback.todayKey);
        setStats(fallback.stats);
        setLeaderboard(fallback.leaderboard);
        setPlayerRecord(null);
        setStreak(fallback.streak);
        setBestStreak(fallback.bestStreak);
        setTotalSolved(fallback.totalSolved);
        setRecentArchiveKeys(fallback.recentArchiveKeys);
        setCommunityBoards((prev) => (prev.length > 0 ? prev : fallback.communityBoards));
        applyPuzzle(fallback.puzzle);
      } finally {
        if (active) setLoading(false);
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [requestedDate, reloadNonce]);

  // Elapsed timer while unsolved on play tab
  useEffect(() => {
    if (loading || evaluation.solved || tab !== 'play') return;
    const id = window.setInterval(() => {
      setElapsedSec((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [loading, evaluation.solved, tab]);

  // Trigger audio chime on relay energize & persist solve on completion
  useEffect(() => {
    if (loading) return;
    if (evaluation.relaysEnergized > prevRelaysRef.current && !evaluation.solved) {
      playRelayChime(muted);
    }
    prevRelaysRef.current = evaluation.relaysEnergized;

    const boardUid = puzzle.customId ?? puzzle.dateKey;
    if (evaluation.solved && moves > 0 && submittedBoardKeyRef.current !== boardUid) {
      submittedBoardKeyRef.current = boardUid;
      playCircuitSolved(muted);
      setSolvedBannerOpen(true);

      const submitSolve = async () => {
        if (!isLiveReddit) {
          const medal = getMedalForMoves(moves, puzzle.par);
          const localRec: PlayerDailyRecord = {
            dateKey: puzzle.dateKey,
            solved: true,
            moves,
            timeSec: Math.max(1, elapsedSec),
            hintsUsed,
            medal,
            sharedToComments: false,
          };
          setPlayerRecord(localRec);
          setStreak((s) => (puzzle.customId ? s : Math.max(1, s + 1)));
          setTotalSolved((t) => t + 1);
          setLeaderboard((prev) => {
            const next: LeaderboardEntry[] = [
              ...prev.filter((x) => x.username !== username),
              {
                username,
                moves,
                timeSec: Math.max(1, elapsedSec),
                par: puzzle.par,
                medal,
                solvedAt: new Date().toISOString(),
              },
            ];
            return next
              .sort((a, b) => a.moves - b.moves || a.timeSec - b.timeSec)
              .slice(0, 10);
          });
          return;
        }
        try {
          const res = await fetch('/api/solve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              dateKey: puzzle.dateKey,
              puzzleNumber: puzzle.puzzleNumber,
              moves,
              timeSec: Math.max(1, elapsedSec),
              hintsUsed,
              par: puzzle.par,
              rotatedTileCounts: tileClicks,
              customId: puzzle.customId,
            }),
          });
          if (!res.ok) return;
          const data: SubmitSolveResponse = await res.json();
          setPlayerRecord(data.record);
          setStreak(data.streak);
          setBestStreak(data.bestStreak);
          setTotalSolved(data.totalSolved);
          setStats(data.stats);
          setLeaderboard(data.leaderboard);
        } catch {
          // Offline tolerance
        }
      };
      void submitSolve();
    }
  }, [
    evaluation.relaysEnergized,
    evaluation.solved,
    loading,
    moves,
    muted,
    elapsedSec,
    hintsUsed,
    isLiveReddit,
    puzzle,
    tileClicks,
    username,
  ]);

  const handleRotateTile = (idx: number) => {
    if (evaluation.solved) return;
    const tile = tiles[idx];
    if (!tile || tile.locked) return;
    const period = getRotationalPeriod(tile.kind);
    if (period <= 1) return;

    playRelayClick(muted);
    const prevRot = tile.rotation;
    const prevAngle = visualAngles[idx] ?? prevRot * 90;
    const nextRot = (prevRot + 1) % period;

    setTiles((prev) => prev.map((t, i) => (i === idx ? { ...t, rotation: nextRot } : t)));
    setVisualAngles((prev) => prev.map((a, i) => (i === idx ? a + 90 : a)));
    setHistory((prev) => [...prev, { idx, prevRot, prevAngle }]);
    setTileClicks((prev) => prev.map((c, i) => (i === idx ? c + 1 : c)));
    setMoves((m) => m + 1);
    if (hintIdx === idx) setHintIdx(null);
  };

  const handleUndo = () => {
    if (evaluation.solved || history.length === 0) return;
    const last = history[history.length - 1];
    if (!last) return;
    playRelayClick(muted);
    setTiles((prev) => prev.map((t, i) => (i === last.idx ? { ...t, rotation: last.prevRot } : t)));
    setVisualAngles((prev) => prev.map((a, i) => (i === last.idx ? last.prevAngle : a)));
    setHistory((prev) => prev.slice(0, -1));
    setMoves((m) => Math.max(0, m - 1));
  };

  const handleReset = () => {
    applyPuzzle(puzzle);
    setStatusBanner('Board reset to starting positions.');
  };

  const handleHint = () => {
    if (evaluation.solved) return;
    const misalignedIdx = tiles.findIndex(
      (t) => t.inSolution && !t.locked && clicksToMatch(t.kind, t.rotation, t.solutionRotation) > 0
    );
    if (misalignedIdx >= 0) {
      setHintIdx(misalignedIdx);
      setHintsUsed((h) => h + 1);
      const r = Math.floor(misalignedIdx / puzzle.size) + 1;
      const c = (misalignedIdx % puzzle.size) + 1;
      setStatusBanner(`Relay hint: check Row ${r}, Col ${c}.`);
    }
  };

  const shareGrid = useMemo(
    () => buildSpoilerFreeShareGrid(tiles, evaluation.energized, puzzle.size),
    [tiles, evaluation.energized, puzzle.size]
  );

  const shareTextPreview = useMemo(
    () =>
      formatRedditShareComment({
        puzzleNumber: puzzle.puzzleNumber,
        boardTitle: puzzle.title,
        moves: Math.max(1, moves),
        par: puzzle.par,
        timeSec: Math.max(1, elapsedSec),
        streak,
        shareGrid,
      }),
    [puzzle.puzzleNumber, puzzle.title, moves, puzzle.par, elapsedSec, streak, shareGrid]
  );

  const handleShareToComments = async () => {
    if (sharing || sharedNow) return;
    setSharing(true);
    try {
      if (!isLiveReddit) {
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(shareTextPreview);
        }
        setSharedNow(true);
        safeToast('Copied spoiler-free circuit scorecard!', setStatusBanner);
        return;
      }
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dateKey: puzzle.dateKey,
          puzzleNumber: puzzle.puzzleNumber,
          moves: Math.max(1, moves),
          par: puzzle.par,
          timeSec: Math.max(1, elapsedSec),
          streak,
          shareGrid,
          boardTitle: puzzle.title,
        }),
      });
      if (!res.ok) throw new Error('Comment post failed');
      const data: ShareScoreResponse = await res.json();
      setSharedNow(true);
      safeToast(data.message, setStatusBanner);
    } catch {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareTextPreview).catch(() => {});
      }
      safeToast('Copied scorecard to clipboard! Paste into comments.', setStatusBanner);
    } finally {
      setSharing(false);
    }
  };

  const handleCopyCard = async () => {
    try {
      await navigator.clipboard.writeText(shareTextPreview);
      safeToast('Spoiler-free circuit grid copied!', setStatusBanner);
    } catch {
      safeToast('Copy unavailable in this browser context.', setStatusBanner);
    }
  };

  const forgePreviewPuzzle = useMemo(
    () =>
      generateDailyPuzzle(todayKey, {
        salt: `community:${username}:${forgeSeed}:${forgeTitle.trim() || 'Preview'}`,
        titleOverride: forgeTitle.trim() || `Custom Board #${forgeSeed}`,
        author: username,
      }),
    [todayKey, username, forgeSeed, forgeTitle]
  );

  const handleForgeSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const clean = forgeTitle.trim();
    if (clean.length < 3 || forging) return;
    setForging(true);
    try {
      if (!isLiveReddit) {
        const localBoard: CommunityBoardSummary = {
          id: `cb_local_${Date.now()}`,
          title: clean,
          author: username,
          par: forgePreviewPuzzle.par,
          plays: 0,
          createdAt: new Date().toISOString(),
          puzzle: { ...forgePreviewPuzzle, customId: `cb_local_${Date.now()}` },
        };
        setCommunityBoards((prev) => [localBoard, ...prev].slice(0, 12));
        setForgeTitle('');
        setForgeSeed((s) => s + 17);
        safeToast(`Forged "${clean}" (Par ${localBoard.par})!`, setStatusBanner);
        return;
      }
      const res = await fetch('/api/forge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: clean, seedOffset: forgeSeed }),
      });
      if (!res.ok) throw new Error('Forge failed');
      const data: ForgeBoardResponse = await res.json();
      setCommunityBoards((prev) => [data.board, ...prev].slice(0, 12));
      setForgeTitle('');
      setForgeSeed((s) => s + 17);
      safeToast(`Published "${data.board.title}" to community boards!`, setStatusBanner);
    } catch {
      safeToast('Could not publish board right now.', setStatusBanner);
    } finally {
      setForging(false);
    }
  };

  const medal = getMedalForMoves(Math.max(1, moves), puzzle.par);
  const formattedTime = `${Math.floor(elapsedSec / 60)}:${String(elapsedSec % 60).padStart(2, '0')}`;
  const parRatePct =
    stats && stats.totalSolves > 0 ? Math.round((stats.parSolves / stats.totalSolves) * 100) : 0;

  return (
    <div className="min-h-screen w-full bg-[#f6f1e7] text-[#1d2128] flex flex-col items-center px-3 py-3 sm:py-5">
      <div className="w-full max-w-[540px] flex flex-col gap-3">
        {/* Top Masthead */}
        <header className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src="/switchboard-emblem.jpg"
              alt="Switchboard emblem"
              className="w-9 h-9 rounded-lg border border-[#c9ba9e] object-cover shrink-0"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="text-base sm:text-lg font-extrabold tracking-tight leading-none">
                  SWITCHBOARD
                </h1>
                <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-[#e8decb] text-[#7a5a1c] tabular-nums">
                  {puzzle.customId ? 'COMMUNITY' : `#${puzzle.puzzleNumber}`}
                </span>
              </div>
              <p className="text-xs text-[#6d6658] truncate">
                {puzzle.title}
                {puzzle.author ? ` · by ${puzzle.author}` : ` · ${puzzle.difficulty}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className="px-2 py-1 rounded-lg bg-[#fbf8f1] border border-[#d6cab3] text-xs font-bold tabular-nums text-[#d9441e]"
              title={`Current streak: ${streak} (Best: ${bestStreak})`}
            >
              🔥 {streak}
            </span>
            <button
              type="button"
              onClick={() => setMuted((m) => !m)}
              className="px-2.5 py-1 rounded-lg bg-[#fbf8f1] border border-[#d6cab3] hover:border-[#b89040] text-xs font-semibold text-[#5d5950] cursor-pointer"
              aria-label={muted ? 'Unmute relay audio' : 'Mute relay audio'}
            >
              {muted ? '🔇' : '🔊'}
            </button>
          </div>
        </header>

        {/* Navigation Tabs */}
        <nav
          className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-[#e7decb] border border-[#cfc1a5]"
          aria-label="Game views"
        >
          {(
            [
              { id: 'play', label: 'Board' },
              { id: 'leaderboard', label: 'Ranks' },
              { id: 'archive', label: '7-Day' },
              { id: 'forge', label: 'Forge' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                tab === item.id
                  ? 'bg-[#fbf8f1] text-[#1d2128] shadow-sm border border-[#d4c7ae]'
                  : 'text-[#615a4d] hover:text-[#1d2128]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {statusBanner && (
          <div className="px-3 py-2 rounded-xl bg-[#fbf8f1] border border-[#c9ba9e] text-xs font-medium text-[#4a4438] flex items-center justify-between gap-2">
            <span>{statusBanner}</span>
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
              className="text-[#8c6924] font-bold cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* TAB 1: PLAY BOARD */}
        {tab === 'play' && (
          <>
            {/* Live Telemetry HUD */}
            <div className="grid grid-cols-4 gap-2">
              <div className="rounded-xl bg-[#fbf8f1] border border-[#d6cab3] px-2.5 py-2 text-center">
                <div className="text-sm font-extrabold tabular-nums">
                  {moves}
                  <span className="text-xs font-semibold text-[#7d7567]">/{puzzle.par}</span>
                </div>
                <div className="text-[10px] uppercase tracking-wider text-[#6e675b]">Moves / Par</div>
              </div>
              <div className="rounded-xl bg-[#fbf8f1] border border-[#d6cab3] px-2.5 py-2 text-center">
                <div
                  className={`text-sm font-extrabold tabular-nums ${
                    evaluation.relaysEnergized === evaluation.relaysTotal
                      ? 'text-[#0d7a5f]'
                      : 'text-[#9a6309]'
                  }`}
                >
                  ⚡ {evaluation.relaysEnergized}/{evaluation.relaysTotal}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-[#6e675b]">Relays</div>
              </div>
              <div className="rounded-xl bg-[#fbf8f1] border border-[#d6cab3] px-2.5 py-2 text-center">
                <div
                  className={`text-sm font-extrabold ${
                    evaluation.targetEnergized ? 'text-[#0d7a5f]' : 'text-[#7d7567]'
                  }`}
                >
                  {evaluation.targetEnergized ? 'LIVE' : 'OPEN'}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-[#6e675b]">Output</div>
              </div>
              <div className="rounded-xl bg-[#fbf8f1] border border-[#d6cab3] px-2.5 py-2 text-center">
                <div className="text-sm font-extrabold tabular-nums text-[#1d2128]">
                  {formattedTime}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-[#6e675b]">Clock</div>
              </div>
            </div>

            {/* 5x5 Tactile Ceramic Switchboard Chassis */}
            <section
              className="chassis-frame rounded-2xl p-3 sm:p-4"
              aria-label="5 by 5 Switchboard Puzzle Grid"
            >
              <div
                className="grid grid-cols-5 gap-1.5 sm:gap-2 aspect-square w-full"
                data-testid="switchboard-grid"
              >
                {tiles.map((tile, idx) => {
                  const isLive = evaluation.energized[idx] ?? false;
                  const isHint = hintIdx === idx;
                  const isBlock = tile.kind === 'block';
                  const row = Math.floor(idx / puzzle.size) + 1;
                  const col = (idx % puzzle.size) + 1;
                  return (
                    <button
                      key={`${puzzle.dateKey}-${puzzle.customId ?? 'daily'}-${idx}`}
                      type="button"
                      disabled={tile.locked || evaluation.solved}
                      onClick={() => handleRotateTile(idx)}
                      data-testid={`tile-${idx}`}
                      aria-label={`Row ${row} Col ${col} ${tile.kind}${tile.relay ? ' relay' : ''}${
                        tile.locked ? ' locked' : ' rotatable'
                      }`}
                      className={`relative rounded-xl overflow-hidden p-0.5 select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d9441e] ${
                        isBlock
                          ? 'ceramic-tile-block cursor-default'
                          : tile.locked
                          ? 'ceramic-tile cursor-default'
                          : 'ceramic-tile cursor-pointer'
                      } ${
                        isLive && evaluation.solved
                          ? 'ceramic-tile-solved'
                          : isLive
                          ? 'ceramic-tile-live'
                          : ''
                      } ${isHint ? 'ceramic-tile-hint' : ''}`}
                    >
                      <TileSvg
                        tile={tile}
                        visualAngle={visualAngles[idx] ?? tile.rotation * 90}
                        energized={isLive}
                        solved={evaluation.solved}
                      />
                    </button>
                  );
                })}
              </div>

              {/* Action Controls Bar */}
              <div className="mt-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={history.length === 0 || evaluation.solved}
                    onClick={handleUndo}
                    className="px-3 py-1.5 rounded-lg bg-[#fbf8f1] border border-[#cfc2aa] hover:border-[#b89040] disabled:opacity-45 text-xs font-bold cursor-pointer"
                  >
                    ↶ Undo
                  </button>
                  <button
                    type="button"
                    onClick={handleReset}
                    className="px-3 py-1.5 rounded-lg bg-[#fbf8f1] border border-[#cfc2aa] hover:border-[#b89040] text-xs font-bold cursor-pointer"
                  >
                    ↺ Reset
                  </button>
                </div>

                <button
                  type="button"
                  disabled={evaluation.solved}
                  onClick={handleHint}
                  className="px-3 py-1.5 rounded-lg bg-[#f4e5c3] border border-[#c8a252] hover:bg-[#edd7a5] disabled:opacity-45 text-xs font-bold text-[#6b4d12] cursor-pointer"
                >
                  💡 Hint {hintsUsed > 0 ? `(${hintsUsed})` : ''}
                </button>
              </div>
            </section>

            {/* Victory & Spoiler-Free Reddit Share Panel */}
            {solvedBannerOpen && (
              <section
                className="rounded-2xl bg-[#fbf8f1] border-2 border-[#0d7a5f] p-4 shadow-lg flex flex-col gap-3"
                data-testid="victory-panel"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="inline-block text-[11px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#e2f5ef] text-[#0d7a5f]">
                      {medal === 'PAR'
                        ? '⚡ PAR CIRCUIT MASTER'
                        : medal === 'SILVER'
                        ? '🟠 CLEAN ROUTE'
                        : '🟢 CIRCUIT CLOSED'}
                    </span>
                    <h2 className="text-lg font-extrabold mt-1">
                      Solved in {moves} moves ({formattedTime})
                    </h2>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-extrabold text-[#d9441e] tabular-nums">
                      🔥 {streak}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-[#6e675b]">Streak</div>
                  </div>
                </div>

                <pre className="rounded-xl bg-[#f3ede0] border border-[#d6cab3] p-3 text-center text-sm leading-snug font-mono overflow-x-auto">
                  {shareGrid}
                </pre>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={sharing || sharedNow}
                    onClick={handleShareToComments}
                    className="py-2.5 px-4 rounded-xl bg-[#d9441e] hover:bg-[#c03917] disabled:bg-[#0d7a5f] text-white text-xs font-bold cursor-pointer transition-colors"
                  >
                    {sharedNow
                      ? '✓ Shared to Comments'
                      : sharing
                      ? 'Posting Comment...'
                      : 'Post Result to Reddit Comments'}
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyCard}
                    className="py-2.5 px-4 rounded-xl bg-[#e8decb] hover:bg-[#ddd0b7] text-[#1d2128] text-xs font-bold cursor-pointer transition-colors"
                  >
                    Copy Spoiler-Free Grid
                  </button>
                </div>
              </section>
            )}

            {/* Compact Rules Hint */}
            <p className="text-[11px] text-center text-[#6e675b]">
              Tap any ceramic switch to rotate 90°. Energize every <strong>⚡ Relay</strong> and{' '}
              <strong>OUT</strong> in <strong>Par {puzzle.par}</strong> moves or fewer.
            </p>
          </>
        )}

        {/* TAB 2: SUBREDDIT LEADERBOARD & STATS */}
        {tab === 'leaderboard' && (
          <section className="rounded-2xl bg-[#fbf8f1] border border-[#d6cab3] p-4 flex flex-col gap-4">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#8c6924]">
                Subreddit Telemetry · Board #{puzzle.puzzleNumber}
              </div>
              <h2 className="text-lg font-extrabold">Today&apos;s Fastest Operators</h2>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-[#f3ede0] border border-[#ddd1bc] p-2.5 text-center">
                <div className="text-base font-extrabold tabular-nums">
                  {stats?.totalSolves ?? 0}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-[#6e675b]">Total Solves</div>
              </div>
              <div className="rounded-xl bg-[#f3ede0] border border-[#ddd1bc] p-2.5 text-center">
                <div className="text-base font-extrabold tabular-nums text-[#0d7a5f]">
                  {parRatePct}%
                </div>
                <div className="text-[10px] uppercase tracking-wider text-[#6e675b]">Hit Par</div>
              </div>
              <div className="rounded-xl bg-[#f3ede0] border border-[#ddd1bc] p-2.5 text-center">
                <div className="text-base font-extrabold tabular-nums text-[#d9441e]">
                  {stats?.avgMoves ? stats.avgMoves.toFixed(1) : '—'}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-[#6e675b]">Avg Moves</div>
              </div>
            </div>

            {stats && stats.hottestTileIndex !== null && (
              <div className="text-xs px-3 py-2 rounded-xl bg-[#f3ede0] border border-[#ddd1bc] text-[#554e42]">
                🔥 <strong>Subreddit Hotspot:</strong> Most-toggled tile today is{' '}
                <strong>
                  Row {Math.floor(stats.hottestTileIndex / 5) + 1}, Col{' '}
                  {(stats.hottestTileIndex % 5) + 1}
                </strong>
                .
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              {leaderboard.length === 0 ? (
                <div className="text-xs text-[#6e675b] py-6 text-center">
                  No solves logged yet today — be the first operator on the board!
                </div>
              ) : (
                leaderboard.map((row, idx) => (
                  <div
                    key={`${row.username}-${idx}`}
                    className={`flex items-center justify-between px-3 py-2 rounded-xl border text-xs ${
                      row.username === username
                        ? 'bg-[#e6f5ef] border-[#0d7a5f] font-bold'
                        : 'bg-[#f6f1e7] border-[#dfd4be]'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-5 text-center font-extrabold text-[#8c6924] tabular-nums">
                        #{idx + 1}
                      </span>
                      <span className="truncate">{row.username}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 tabular-nums">
                      <span>
                        {row.moves}/{row.par} moves
                      </span>
                      <span className="text-[#6e675b]">{row.timeSec}s</span>
                      <span>
                        {row.medal === 'PAR' ? '⚡' : row.medal === 'SILVER' ? '🟠' : '🟢'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="text-[11px] text-[#6e675b] flex justify-between border-t border-[#e5dac6] pt-2.5">
              <span>Your Total Solves: {totalSolved}</span>
              <span>Best Streak: 🔥 {bestStreak}</span>
            </div>
          </section>
        )}

        {/* TAB 3: 7-DAY DAILY ARCHIVE */}
        {tab === 'archive' && (
          <section className="rounded-2xl bg-[#fbf8f1] border border-[#d6cab3] p-4 flex flex-col gap-3">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#8c6924]">
                Daily Broadcast Archive
              </div>
              <h2 className="text-lg font-extrabold">Play the Last 7 Switchboards</h2>
            </div>

            <div className="flex flex-col gap-2">
              {recentArchiveKeys.map((dk) => {
                const p = generateDailyPuzzle(dk);
                const isToday = dk === todayKey;
                const isActive = !puzzle.customId && puzzle.dateKey === dk;
                return (
                  <button
                    key={dk}
                    type="button"
                    onClick={() => {
                      void loadDailyBoard(dk);
                      setTab('play');
                    }}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      isActive
                        ? 'bg-[#efe6d4] border-[#b89040]'
                        : 'bg-[#f6f1e7] border-[#dfd4be] hover:border-[#b89040]'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-extrabold flex items-center gap-1.5">
                        <span>#{p.puzzleNumber}</span>
                        <span>{p.title}</span>
                        {isToday && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#d9441e] text-white">
                            TODAY
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#6e675b]">
                        {dk} · {p.difficulty}
                      </div>
                    </div>
                    <span className="text-xs font-bold text-[#8c6924] tabular-nums">
                      Par {p.par} →
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* TAB 4: COMMUNITY PUZZLE FORGE */}
        {tab === 'forge' && (
          <section className="rounded-2xl bg-[#fbf8f1] border border-[#d6cab3] p-4 flex flex-col gap-4">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#8c6924]">
                Community Workshop · Redis Shared Queue
              </div>
              <h2 className="text-lg font-extrabold">Forge a Subreddit Switchboard</h2>
              <p className="text-xs text-[#6e675b] mt-0.5">
                Roll a guaranteed-solvable circuit topology, name it, and publish it straight into
                this subreddit&apos;s playable community rack.
              </p>
            </div>

            <form onSubmit={handleForgeSubmit} className="flex flex-col gap-2.5">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={forgeTitle}
                  onChange={(e) => setForgeTitle(e.target.value)}
                  placeholder="Name your board (e.g., Tokyo Night Line)"
                  maxLength={36}
                  className="flex-1 px-3 py-2 rounded-xl bg-[#f6f1e7] border border-[#cfc1a5] text-xs font-medium focus:outline-none focus:border-[#d9441e]"
                />
                <button
                  type="button"
                  onClick={() => setForgeSeed((s) => s + 1)}
                  className="px-3 py-2 rounded-xl bg-[#e8decb] hover:bg-[#ddd0b7] text-xs font-bold cursor-pointer shrink-0"
                >
                  🎲 Roll
                </button>
              </div>

              <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#f3ede0] border border-[#ddd1bc] text-xs">
                <span>
                  Preview Seed <strong>#{forgeSeed}</strong> · Verified Solvable
                </span>
                <span className="font-bold text-[#0d7a5f] tabular-nums">
                  Par {forgePreviewPuzzle.par}
                </span>
              </div>

              <button
                type="submit"
                disabled={forgeTitle.trim().length < 3 || forging}
                className="w-full py-2.5 rounded-xl bg-[#d9441e] hover:bg-[#c03917] disabled:opacity-45 text-white text-xs font-bold cursor-pointer"
              >
                {forging ? 'Publishing to Subreddit...' : 'Publish Board to Community Rack'}
              </button>
            </form>

            <div className="flex flex-col gap-2 border-t border-[#e5dac6] pt-3">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#6e675b]">
                Community Rack ({communityBoards.length})
              </div>
              {communityBoards.length === 0 ? (
                <div className="text-xs text-[#6e675b] py-4 text-center">
                  No community boards forged yet. Publish the first one above!
                </div>
              ) : (
                communityBoards.map((board) => (
                  <button
                    key={board.id}
                    type="button"
                    onClick={() => {
                      applyPuzzle(board.puzzle);
                      setTab('play');
                      setStatusBanner(`Loaded community board "${board.title}" by ${board.author}.`);
                    }}
                    className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-[#f6f1e7] border border-[#dfd4be] hover:border-[#b89040] text-left cursor-pointer"
                  >
                    <div>
                      <div className="text-xs font-extrabold">{board.title}</div>
                      <div className="text-[11px] text-[#6e675b]">
                        by {board.author} · {board.plays} plays
                      </div>
                    </div>
                    <span className="text-xs font-bold text-[#8c6924] tabular-nums">
                      Par {board.par} →
                    </span>
                  </button>
                ))
              )}
            </div>
          </section>
        )}

        {playerRecord && !solvedBannerOpen && tab === 'play' && (
          <div className="text-[11px] text-center text-[#0d7a5f] font-semibold">
            ✓ Best recorded on this board: {playerRecord.moves}/{puzzle.par} moves (
            {playerRecord.timeSec}s)
          </div>
        )}
      </div>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
