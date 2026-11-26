import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSpoilerFreeShareGrid,
  clicksToMatch,
  evaluateCircuit,
  generateDailyPuzzle,
  getMedalForMoves,
} from '../src/shared/puzzle.ts';

test('generateDailyPuzzle produces deterministic, unsolved, strictly solvable daily boards across 30 days', () => {
  for (let day = 1; day <= 30; day++) {
    const dateKey = `2026-11-${String(day).padStart(2, '0')}`;
    const p1 = generateDailyPuzzle(dateKey);
    const p2 = generateDailyPuzzle(dateKey);

    assert.deepEqual(p1, p2);
    assert.equal(p1.tiles.length, 25);
    assert.ok(p1.par >= 1);

    const startEval = evaluateCircuit(p1.tiles, p1.size);
    assert.equal(startEval.solved, false, `Puzzle ${dateKey} should start unsolved`);

    let usedClicks = 0;
    const solvedTiles = p1.tiles.map((t) => {
      if (t.inSolution && !t.locked) {
        usedClicks += clicksToMatch(t.kind, t.rotation, t.solutionRotation);
        return { ...t, rotation: t.solutionRotation };
      }
      return t;
    });

    assert.equal(usedClicks, p1.par, `Clicks should equal par for ${dateKey}`);
    const endEval = evaluateCircuit(solvedTiles, p1.size);
    assert.equal(endEval.solved, true, `Puzzle ${dateKey} must be solvable`);
    assert.equal(endEval.targetEnergized, true);
    assert.equal(endEval.relaysEnergized, endEval.relaysTotal);
  }
});

test('spoiler-free share grid has 5x5 layout and medals classify par correctly', () => {
  const p = generateDailyPuzzle('2026-11-27');
  const solvedTiles = p.tiles.map((t) =>
    t.inSolution && !t.locked ? { ...t, rotation: t.solutionRotation } : t
  );
  const evalRes = evaluateCircuit(solvedTiles, p.size);
  const grid = buildSpoilerFreeShareGrid(solvedTiles, evalRes.energized, p.size);
  assert.equal(grid.split('\n').length, 5);
  assert.ok(grid.includes('🟠'));
  assert.ok(grid.includes('🟢'));
  assert.equal(getMedalForMoves(p.par, p.par), 'PAR');
  assert.equal(getMedalForMoves(p.par + 2, p.par), 'SILVER');
  assert.equal(getMedalForMoves(p.par + 3, p.par), 'SOLVED');
});
