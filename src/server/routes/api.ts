import { Hono } from 'hono';
import { context, redis, reddit } from '@devvit/web/server';
import type {
  CommunityBoardSummary,
  ForgeBoardRequest,
  ForgeBoardResponse,
  InitGameResponse,
  LeaderboardEntry,
  PlayerDailyRecord,
  ShareScoreRequest,
  ShareScoreResponse,
  SubmitSolveRequest,
  SubmitSolveResponse,
  SubredditDayStats,
} from '../../shared/api';
import {
  formatRedditShareComment,
  generateDailyPuzzle,
  getMedalForMoves,
  getPuzzleNumberForDate,
  getRecentDateKeys,
  getUtcDateKey,
} from '../../shared/puzzle';

type ErrorResponse = {
  status: 'error';
  message: string;
};

export const api = new Hono();

function isPreviousUtcDay(prevDateKey: string, currentDateKey: string): boolean {
  const prevMs = Date.parse(`${prevDateKey}T00:00:00Z`);
  const curMs = Date.parse(`${currentDateKey}T00:00:00Z`);
  if (Number.isNaN(prevMs) || Number.isNaN(curMs)) return false;
  return Math.round((curMs - prevMs) / 86_400_000) === 1;
}

async function loadDayStats(dateKey: string): Promise<SubredditDayStats> {
  const key = `sb:stats:${dateKey}`;
  const raw = await redis.hGetAll(key);
  const totalSolves = Number.parseInt(raw.totalSolves ?? '0', 10) || 0;
  const parSolves = Number.parseInt(raw.parSolves ?? '0', 10) || 0;
  const totalMoves = Number.parseInt(raw.totalMoves ?? '0', 10) || 0;

  let hottestTileIndex: number | null = null;
  let hottestCount = 0;
  for (let i = 0; i < 25; i++) {
    const cnt = Number.parseInt(raw[`tile_${i}`] ?? '0', 10) || 0;
    if (cnt > hottestCount) {
      hottestCount = cnt;
      hottestTileIndex = i;
    }
  }

  return {
    dateKey,
    puzzleNumber: getPuzzleNumberForDate(dateKey),
    totalSolves,
    parSolves,
    avgMoves: totalSolves > 0 ? Math.round((totalMoves / totalSolves) * 10) / 10 : 0,
    hottestTileIndex,
  };
}

async function loadLeaderboard(dateKey: string): Promise<LeaderboardEntry[]> {
  const zKey = `sb:lb:${dateKey}`;
  const metaKey = `sb:lbmeta:${dateKey}`;
  const top = await redis.zRange(zKey, 0, 9, { by: 'rank' });
  if (top.length === 0) return [];
  const allMeta = await redis.hGetAll(metaKey);

  const out: LeaderboardEntry[] = [];
  for (const row of top) {
    const rawJson = allMeta[row.member];
    if (!rawJson) continue;
    try {
      const parsed: unknown = JSON.parse(rawJson);
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'username' in parsed &&
        'moves' in parsed &&
        'timeSec' in parsed &&
        'par' in parsed &&
        'medal' in parsed &&
        'solvedAt' in parsed
      ) {
        const entry = parsed as LeaderboardEntry;
        out.push(entry);
      }
    } catch {
      // Ignore malformed legacy entry
    }
  }
  return out;
}

async function loadCommunityBoards(): Promise<CommunityBoardSummary[]> {
  const raw = await redis.get('sb:community:boards');
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.slice(0, 12);
    }
  } catch {
    return [];
  }
  return [];
}

async function loadPlayerProfile(username: string): Promise<{
  streak: number;
  bestStreak: number;
  totalSolved: number;
  lastSolvedDate: string;
}> {
  const raw = await redis.hGetAll(`sb:user:${username}`);
  return {
    streak: Number.parseInt(raw.streak ?? '0', 10) || 0,
    bestStreak: Number.parseInt(raw.bestStreak ?? '0', 10) || 0,
    totalSolved: Number.parseInt(raw.totalSolved ?? '0', 10) || 0,
    lastSolvedDate: raw.lastSolvedDate ?? '',
  };
}

async function loadPlayerDayRecord(
  username: string,
  dateKey: string
): Promise<PlayerDailyRecord | null> {
  const raw = await redis.get(`sb:rec:${dateKey}:${username}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

api.get('/init', async (c) => {
  const { postId, subredditName } = context;
  const todayKey = getUtcDateKey();
  const recentArchiveKeys = getRecentDateKeys(todayKey, 7);
  const requestedDate = c.req.query('date');
  const activeDateKey =
    requestedDate && recentArchiveKeys.includes(requestedDate) ? requestedDate : todayKey;

  try {
    const username = (await reddit.getCurrentUsername()) ?? 'operator';
    const puzzle = generateDailyPuzzle(activeDateKey);

    const [stats, leaderboard, playerRecord, profile, communityBoards] = await Promise.all([
      loadDayStats(activeDateKey),
      loadLeaderboard(activeDateKey),
      loadPlayerDayRecord(username, activeDateKey),
      loadPlayerProfile(username),
      loadCommunityBoards(),
    ]);

    return c.json<InitGameResponse>({
      username,
      subredditName: subredditName ?? 'switchboard',
      postId: postId ?? 'local-post',
      todayKey,
      puzzle,
      stats,
      leaderboard,
      playerRecord,
      streak: profile.streak,
      bestStreak: profile.bestStreak,
      totalSolved: profile.totalSolved,
      recentArchiveKeys,
      communityBoards,
    });
  } catch (error) {
    console.error('Switchboard /api/init error:', error);
    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to initialize Switchboard',
      },
      500
    );
  }
});

api.post('/solve', async (c) => {
  try {
    const body = await c.req.json<SubmitSolveRequest>();
    const username = (await reddit.getCurrentUsername()) ?? 'operator';
    const todayKey = getUtcDateKey();
    const dateKey = body.dateKey || todayKey;
    const moves = Math.max(1, Math.floor(body.moves));
    const timeSec = Math.max(1, Math.floor(body.timeSec));
    const hintsUsed = Math.max(0, Math.floor(body.hintsUsed));
    const par = Math.max(1, Math.floor(body.par));
    const medal = getMedalForMoves(moves, par);

    const profile = await loadPlayerProfile(username);

    // Community custom board play tracking
    if (body.customId) {
      const boards = await loadCommunityBoards();
      const updated = boards.map((b) =>
        b.id === body.customId ? { ...b, plays: b.plays + 1 } : b
      );
      await redis.set('sb:community:boards', JSON.stringify(updated));
      const [stats, leaderboard] = await Promise.all([
        loadDayStats(todayKey),
        loadLeaderboard(todayKey),
      ]);
      return c.json<SubmitSolveResponse>({
        ok: true,
        record: {
          dateKey,
          solved: true,
          moves,
          timeSec,
          hintsUsed,
          medal,
          sharedToComments: false,
        },
        streak: profile.streak,
        bestStreak: profile.bestStreak,
        totalSolved: profile.totalSolved,
        stats,
        leaderboard,
      });
    }

    const existing = await loadPlayerDayRecord(username, dateKey);
    const recKey = `sb:rec:${dateKey}:${username}`;
    const record: PlayerDailyRecord = existing
      ? {
          ...existing,
          moves: Math.min(existing.moves, moves),
          timeSec: moves < existing.moves ? timeSec : Math.min(existing.timeSec, timeSec),
          medal: getMedalForMoves(Math.min(existing.moves, moves), par),
        }
      : {
          dateKey,
          solved: true,
          moves,
          timeSec,
          hintsUsed,
          medal,
          sharedToComments: false,
        };

    await redis.set(recKey, JSON.stringify(record));

    let nextStreak = profile.streak;
    let nextBest = profile.bestStreak;
    let nextTotal = profile.totalSolved;

    if (!existing) {
      const statsKey = `sb:stats:${dateKey}`;
      await redis.hIncrBy(statsKey, 'totalSolves', 1);
      await redis.hIncrBy(statsKey, 'totalMoves', moves);
      if (medal === 'PAR') {
        await redis.hIncrBy(statsKey, 'parSolves', 1);
      }
      if (Array.isArray(body.rotatedTileCounts)) {
        for (let i = 0; i < Math.min(25, body.rotatedTileCounts.length); i++) {
          const clicks = body.rotatedTileCounts[i] ?? 0;
          if (clicks > 0) {
            await redis.hIncrBy(statsKey, `tile_${i}`, clicks);
          }
        }
      }

      nextTotal += 1;
      if (dateKey === todayKey) {
        if (profile.lastSolvedDate === todayKey) {
          nextStreak = Math.max(1, profile.streak);
        } else if (isPreviousUtcDay(profile.lastSolvedDate, todayKey)) {
          nextStreak = profile.streak + 1;
        } else {
          nextStreak = 1;
        }
        nextBest = Math.max(profile.bestStreak, nextStreak);
        await redis.hSet(`sb:user:${username}`, {
          streak: String(nextStreak),
          bestStreak: String(nextBest),
          totalSolved: String(nextTotal),
          lastSolvedDate: todayKey,
        });
      } else {
        await redis.hSet(`sb:user:${username}`, {
          totalSolved: String(nextTotal),
        });
      }
    }

    // Leaderboard score: fewer moves first, then faster seconds
    const compositeScore = record.moves * 10000 + Math.min(9999, record.timeSec);
    await redis.zAdd(`sb:lb:${dateKey}`, { member: username, score: compositeScore });
    const lbEntry: LeaderboardEntry = {
      username,
      moves: record.moves,
      timeSec: record.timeSec,
      par,
      medal: record.medal,
      solvedAt: new Date().toISOString(),
    };
    await redis.hSet(`sb:lbmeta:${dateKey}`, {
      [username]: JSON.stringify(lbEntry),
    });

    const [stats, leaderboard] = await Promise.all([
      loadDayStats(dateKey),
      loadLeaderboard(dateKey),
    ]);

    return c.json<SubmitSolveResponse>({
      ok: true,
      record,
      streak: nextStreak,
      bestStreak: nextBest,
      totalSolved: nextTotal,
      stats,
      leaderboard,
    });
  } catch (error) {
    console.error('Switchboard /api/solve error:', error);
    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to save solve',
      },
      400
    );
  }
});

api.post('/share', async (c) => {
  const { postId } = context;
  if (!postId) {
    return c.json<ErrorResponse>(
      { status: 'error', message: 'Cannot comment outside a Reddit post context' },
      400
    );
  }
  try {
    const body = await c.req.json<ShareScoreRequest>();
    const username = (await reddit.getCurrentUsername()) ?? 'operator';
    const text = formatRedditShareComment({
      puzzleNumber: body.puzzleNumber,
      boardTitle: body.boardTitle,
      moves: body.moves,
      par: body.par,
      timeSec: body.timeSec,
      streak: body.streak,
      shareGrid: body.shareGrid,
    });

    const comment = await reddit.submitComment({
      id: postId,
      text,
      runAs: 'USER',
    });

    const existing = await loadPlayerDayRecord(username, body.dateKey);
    if (existing) {
      await redis.set(
        `sb:rec:${body.dateKey}:${username}`,
        JSON.stringify({ ...existing, sharedToComments: true })
      );
    }

    return c.json<ShareScoreResponse>({
      ok: true,
      commentId: comment.id,
      message: 'Posted spoiler-free circuit card to comments!',
    });
  } catch (error) {
    console.error('Switchboard /api/share error:', error);
    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to post comment',
      },
      400
    );
  }
});

api.post('/forge', async (c) => {
  try {
    const body = await c.req.json<ForgeBoardRequest>();
    const username = (await reddit.getCurrentUsername()) ?? 'operator';
    const cleanTitle = (body.title ?? '').trim().slice(0, 36);
    if (cleanTitle.length < 3) {
      return c.json<ErrorResponse>(
        { status: 'error', message: 'Board title must be at least 3 characters' },
        400
      );
    }
    const todayKey = getUtcDateKey();
    const id = `cb_${Date.now().toString(36)}_${Math.abs(Math.floor(body.seedOffset)) % 9999}`;
    const puzzle = generateDailyPuzzle(todayKey, {
      salt: `community:${username}:${body.seedOffset}:${cleanTitle}`,
      titleOverride: cleanTitle,
      author: username,
      customId: id,
    });
    const board: CommunityBoardSummary = {
      id,
      title: cleanTitle,
      author: username,
      par: puzzle.par,
      plays: 0,
      createdAt: new Date().toISOString(),
      puzzle,
    };

    const existing = await loadCommunityBoards();
    const nextList = [board, ...existing].slice(0, 12);
    await redis.set('sb:community:boards', JSON.stringify(nextList));

    return c.json<ForgeBoardResponse>({
      ok: true,
      board,
    });
  } catch (error) {
    console.error('Switchboard /api/forge error:', error);
    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to forge community board',
      },
      400
    );
  }
});
