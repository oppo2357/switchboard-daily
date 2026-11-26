export type Direction = 0 | 1 | 2 | 3; // 0=N, 1=E, 2=S, 3=W

export type TileKind =
  | 'source'
  | 'target'
  | 'straight'
  | 'corner'
  | 'tee'
  | 'cross'
  | 'block';

export type TileSpec = {
  kind: TileKind;
  /** Current rotation 0..3 (x90 deg clockwise) */
  rotation: number;
  /** Locked tiles cannot be rotated (source, target, block, cross) */
  locked: boolean;
  /** Mandatory relay node that must be energized to solve */
  relay?: boolean;
  /** Solution rotation for hint / par verification */
  solutionRotation: number;
  /** Whether this tile is part of the carved solution circuit */
  inSolution: boolean;
};

export type DailyPuzzle = {
  dateKey: string;
  puzzleNumber: number;
  title: string;
  difficulty: 'Standard' | 'Tactician' | 'Master';
  size: number;
  par: number;
  tiles: TileSpec[];
  author?: string;
  customId?: string;
};

export type LeaderboardEntry = {
  username: string;
  moves: number;
  timeSec: number;
  par: number;
  medal: 'PAR' | 'SILVER' | 'SOLVED';
  solvedAt: string;
};

export type PlayerDailyRecord = {
  dateKey: string;
  solved: boolean;
  moves: number;
  timeSec: number;
  hintsUsed: number;
  medal: 'PAR' | 'SILVER' | 'SOLVED';
  sharedToComments: boolean;
};

export type SubredditDayStats = {
  dateKey: string;
  puzzleNumber: number;
  totalSolves: number;
  parSolves: number;
  avgMoves: number;
  hottestTileIndex: number | null;
};

export type CommunityBoardSummary = {
  id: string;
  title: string;
  author: string;
  par: number;
  plays: number;
  createdAt: string;
  puzzle: DailyPuzzle;
};

export type InitGameResponse = {
  username: string;
  subredditName: string;
  postId: string;
  todayKey: string;
  puzzle: DailyPuzzle;
  stats: SubredditDayStats;
  leaderboard: LeaderboardEntry[];
  playerRecord: PlayerDailyRecord | null;
  streak: number;
  bestStreak: number;
  totalSolved: number;
  recentArchiveKeys: string[];
  communityBoards: CommunityBoardSummary[];
};

export type SubmitSolveRequest = {
  dateKey: string;
  puzzleNumber: number;
  moves: number;
  timeSec: number;
  hintsUsed: number;
  par: number;
  rotatedTileCounts: number[];
  customId?: string;
};

export type SubmitSolveResponse = {
  ok: true;
  record: PlayerDailyRecord;
  streak: number;
  bestStreak: number;
  totalSolved: number;
  stats: SubredditDayStats;
  leaderboard: LeaderboardEntry[];
};

export type ShareScoreRequest = {
  dateKey: string;
  puzzleNumber: number;
  moves: number;
  par: number;
  timeSec: number;
  streak: number;
  shareGrid: string;
  boardTitle: string;
};

export type ShareScoreResponse = {
  ok: true;
  commentId: string;
  message: string;
};

export type ForgeBoardRequest = {
  title: string;
  seedOffset: number;
};

export type ForgeBoardResponse = {
  ok: true;
  board: CommunityBoardSummary;
};
