import { reddit } from '@devvit/web/server';
import { generateDailyPuzzle, getUtcDateKey } from '../../shared/puzzle';

export const createPost = async () => {
  const todayKey = getUtcDateKey();
  const puzzle = generateDailyPuzzle(todayKey);
  return await reddit.submitCustomPost({
    title: `SWITCHBOARD #${puzzle.puzzleNumber} — ${puzzle.title} (Par ${puzzle.par})`,
  });
};
