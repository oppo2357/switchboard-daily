import type { DailyPuzzle, Direction, TileKind, TileSpec } from './api';

export const GRID_SIZE = 5;
export const LAUNCH_EPOCH_UTC = Date.UTC(2026, 10, 1); // 2026-11-01

const DAILY_THEMES = [
  'Copper Exchange',
  'Signal Bridge',
  'Pulse Junction',
  'Meridian Line',
  'Relay Corridor',
  'Crosstalk Loop',
  'Amber Trunk',
  'Night Patchboard',
  'Frequency Lock',
  'Harmonic Split',
  'Substation Nine',
  'Carrier Wave',
  'Duplex Array',
  'Shunt Matrix',
  'Echo Terminal',
  'Capacitor Run',
  'Backbone Shift',
  'Beacon Circuit',
  'Voltage Spine',
  'Parallel Feed',
  'Circuit Zero',
  'Direct Line',
  'Resonant Grid',
  'Twin Relay',
  'Switchyard Alpha',
  'Signal Arcade',
  'Phase Coupler',
  'Brass Terminal',
];

const BASE_PORTS: Record<TileKind, readonly Direction[]> = {
  source: [1], // East at rot=0
  target: [3], // West at rot=0
  straight: [0, 2], // N-S at rot=0
  corner: [0, 1], // N-E at rot=0
  tee: [0, 1, 2], // N-E-S at rot=0
  cross: [0, 1, 2, 3],
  block: [],
};

const DR = [-1, 0, 1, 0] as const;
const DC = [0, 1, 0, -1] as const;

export function oppositeDir(d: Direction): Direction {
  const opp = (d + 2) % 4;
  if (opp === 0) return 0;
  if (opp === 1) return 1;
  if (opp === 2) return 2;
  return 3;
}

export function rotateDir(d: Direction, rot: number): Direction {
  const r = (((d + rot) % 4) + 4) % 4;
  if (r === 0) return 0;
  if (r === 1) return 1;
  if (r === 2) return 2;
  return 3;
}

export function getTilePorts(kind: TileKind, rotation: number): Direction[] {
  const base = BASE_PORTS[kind];
  return base.map((d) => rotateDir(d, rotation));
}

export function getRotationalPeriod(kind: TileKind): number {
  if (kind === 'straight') return 2;
  if (kind === 'corner' || kind === 'tee') return 4;
  return 1;
}

export function clicksToMatch(kind: TileKind, fromRot: number, toRot: number): number {
  const period = getRotationalPeriod(kind);
  if (period === 1) return 0;
  const a = ((fromRot % period) + period) % period;
  const b = ((toRot % period) + period) % period;
  return (b - a + period) % period;
}

export type CircuitEvaluation = {
  energized: boolean[];
  targetEnergized: boolean;
  relaysTotal: number;
  relaysEnergized: number;
  solved: boolean;
};

export function evaluateCircuit(tiles: readonly TileSpec[], size = GRID_SIZE): CircuitEvaluation {
  const n = size * size;
  const energized = Array.from({ length: n }, () => false);
  const sourceIdx = tiles.findIndex((t) => t.kind === 'source');
  if (sourceIdx >= 0) {
    const queue: number[] = [sourceIdx];
    energized[sourceIdx] = true;
    let head = 0;
    while (head < queue.length) {
      const cur = queue[head++];
      if (cur === undefined) break;
      const curTile = tiles[cur];
      if (!curTile) continue;
      const r = Math.floor(cur / size);
      const c = cur % size;
      const ports = getTilePorts(curTile.kind, curTile.rotation);
      for (const dir of ports) {
        const nr = r + (DR[dir] ?? 0);
        const nc = c + (DC[dir] ?? 0);
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
        const ni = nr * size + nc;
        if (energized[ni]) continue;
        const nextTile = tiles[ni];
        if (!nextTile) continue;
        const nextPorts = getTilePorts(nextTile.kind, nextTile.rotation);
        if (nextPorts.includes(oppositeDir(dir))) {
          energized[ni] = true;
          queue.push(ni);
        }
      }
    }
  }

  let targetEnergized = false;
  let relaysTotal = 0;
  let relaysEnergized = 0;

  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    if (!t) continue;
    if (t.kind === 'target' && energized[i]) {
      targetEnergized = true;
    }
    if (t.relay) {
      relaysTotal += 1;
      if (energized[i]) relaysEnergized += 1;
    }
  }

  return {
    energized,
    targetEnergized,
    relaysTotal,
    relaysEnergized,
    solved: targetEnergized && relaysEnergized === relaysTotal,
  };
}

function hashSeed(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dirsToTile(dirs: Direction[]): { kind: TileKind; rotation: number } {
  const unique = Array.from(new Set(dirs)).sort((a, b) => a - b);
  if (unique.length === 4) {
    return { kind: 'cross', rotation: 0 };
  }
  if (unique.length === 3) {
    for (let rot = 0; rot < 4; rot++) {
      const p = getTilePorts('tee', rot).sort((a, b) => a - b);
      if (p.length === 3 && p[0] === unique[0] && p[1] === unique[1] && p[2] === unique[2]) {
        return { kind: 'tee', rotation: rot };
      }
    }
  }
  if (unique.length === 2) {
    const d0 = unique[0];
    const d1 = unique[1];
    if (d0 !== undefined && d1 !== undefined && oppositeDir(d0) === d1) {
      return { kind: 'straight', rotation: d0 === 0 ? 0 : 1 };
    }
    for (let rot = 0; rot < 4; rot++) {
      const p = getTilePorts('corner', rot).sort((a, b) => a - b);
      if (p.length === 2 && p[0] === unique[0] && p[1] === unique[1]) {
        return { kind: 'corner', rotation: rot };
      }
    }
  }
  return { kind: 'straight', rotation: 0 };
}

export function getUtcDateKey(date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getPuzzleNumberForDate(dateKey: string): number {
  const parts = dateKey.split('-').map((x) => Number.parseInt(x, 10));
  const y = parts[0] ?? 2026;
  const m = (parts[1] ?? 11) - 1;
  const d = parts[2] ?? 1;
  const ts = Date.UTC(y, m, d);
  const diffDays = Math.floor((ts - LAUNCH_EPOCH_UTC) / 86_400_000);
  return Math.max(1, diffDays + 1);
}

export function getRecentDateKeys(todayKey: string, count = 7): string[] {
  const parts = todayKey.split('-').map((x) => Number.parseInt(x, 10));
  const baseMs = Date.UTC(parts[0] ?? 2026, (parts[1] ?? 11) - 1, parts[2] ?? 1);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(getUtcDateKey(new Date(baseMs - i * 86_400_000)));
  }
  return out;
}

function getNeighbor(idx: number, dir: Direction, size: number): number | null {
  const r = Math.floor(idx / size);
  const c = idx % size;
  const nr = r + (DR[dir] ?? 0);
  const nc = c + (DC[dir] ?? 0);
  if (nr < 0 || nr >= size || nc < 0 || nc >= size) return null;
  return nr * size + nc;
}

export function generateDailyPuzzle(
  dateKey: string,
  options?: { salt?: string; titleOverride?: string; author?: string; customId?: string }
): DailyPuzzle {
  const size = GRID_SIZE;
  const n = size * size;
  const puzzleNumber = getPuzzleNumberForDate(dateKey);
  const rng = mulberry32(hashSeed(`switchboard-v1:${dateKey}:${options?.salt ?? 'daily'}`));

  const dayOfWeek = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
  const difficulty: DailyPuzzle['difficulty'] =
    dayOfWeek === 0 || dayOfWeek === 6 ? 'Master' : dayOfWeek >= 3 ? 'Tactician' : 'Standard';
  const targetPathMin = difficulty === 'Master' ? 11 : difficulty === 'Tactician' ? 9 : 8;
  const targetBlocks = difficulty === 'Master' ? 3 : 4;

  // Choose source on left column and target on right column
  const sourceRow = Math.floor(rng() * size);
  const targetRow = Math.floor(rng() * size);
  const sourceIdx = sourceRow * size;
  const targetIdx = targetRow * size + (size - 1);

  // Carve a scenic non-self-intersecting path from sourceIdx to targetIdx via randomized DFS
  let bestPath: number[] = [];
  for (let attempt = 0; attempt < 80; attempt++) {
    const visited = new Set<number>([sourceIdx]);
    const path: number[] = [sourceIdx];
    const dfs = (cur: number): boolean => {
      if (cur === targetIdx) {
        return path.length >= targetPathMin;
      }
      const dirs: Direction[] = [0, 1, 2, 3];
      for (let i = dirs.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const tmp = dirs[i];
        dirs[i] = dirs[j] ?? 0;
        dirs[j] = tmp ?? 0;
      }
      for (const d of dirs) {
        const nxt = getNeighbor(cur, d, size);
        if (nxt === null || visited.has(nxt)) continue;
        // Avoid stepping straight to target too early
        if (nxt === targetIdx && path.length + 1 < targetPathMin) continue;
        visited.add(nxt);
        path.push(nxt);
        if (dfs(nxt)) return true;
        path.pop();
        visited.delete(nxt);
      }
      return false;
    };

    if (dfs(sourceIdx)) {
      bestPath = path;
      break;
    }
  }

  // Fallback guaranteed path if DFS didn't reach targetPathMin
  if (bestPath.length === 0) {
    const path: number[] = [];
    for (let c = 0; c < size; c++) path.push(sourceRow * size + c);
    let r = sourceRow;
    while (r !== targetRow) {
      r += r < targetRow ? 1 : -1;
      path.push(r * size + (size - 1));
    }
    bestPath = path;
  }

  // Record adjacency edges for solution circuit
  const adj = Array.from({ length: n }, () => new Set<Direction>());
  const inCircuit = new Set<number>(bestPath);

  for (let i = 0; i < bestPath.length - 1; i++) {
    const a = bestPath[i];
    const b = bestPath[i + 1];
    if (a === undefined || b === undefined) continue;
    for (const d of [0, 1, 2, 3] as const) {
      if (getNeighbor(a, d, size) === b) {
        adj[a]?.add(d);
        adj[b]?.add(oppositeDir(d));
      }
    }
  }

  // Carve an optional short relay spur from an interior path node to create a Tee junction
  const relayIndices = new Set<number>();
  if (bestPath.length >= 5) {
    // Pick 1 primary relay along the main path
    const mainRelayIdx = bestPath[Math.floor(bestPath.length / 2)];
    if (mainRelayIdx !== undefined && mainRelayIdx !== sourceIdx && mainRelayIdx !== targetIdx) {
      relayIndices.add(mainRelayIdx);
    }

    // Try adding a second relay via a 1-2 tile branch off the main path
    const branchCandidates = bestPath.slice(2, bestPath.length - 2);
    for (const anchor of branchCandidates) {
      if ((adj[anchor]?.size ?? 0) >= 3) continue;
      const dirs: Direction[] = [0, 1, 2, 3];
      for (const d of dirs) {
        const spur1 = getNeighbor(anchor, d, size);
        if (spur1 === null || inCircuit.has(spur1)) continue;
        // Extend one step further if possible so relay is a straight/corner rather than dead-end
        let spur2: number | null = null;
        let d2Found: Direction | null = null;
        for (const d2 of [0, 1, 2, 3] as const) {
          const cand = getNeighbor(spur1, d2, size);
          if (cand !== null && !inCircuit.has(cand) && cand !== anchor) {
            spur2 = cand;
            d2Found = d2;
            break;
          }
        }
        if (spur2 !== null && d2Found !== null) {
          adj[anchor]?.add(d);
          adj[spur1]?.add(oppositeDir(d));
          adj[spur1]?.add(d2Found);
          adj[spur2]?.add(oppositeDir(d2Found));
          // Give spur2 a 2nd port pointing to a neighboring non-circuit cell or loop back? Keep spur1 as the relay!
          inCircuit.add(spur1);
          relayIndices.add(spur1);
          // Give spur2 an extra aesthetic pipe port (not required)
          adj[spur2]?.add(d2Found);
          break;
        }
      }
      if (relayIndices.size >= 2) break;
    }
  }

  // Build solved board first
  const tiles: TileSpec[] = [];
  let blocksPlaced = 0;

  for (let i = 0; i < n; i++) {
    if (i === sourceIdx) {
      const outDir = Array.from(adj[i] ?? [])[0] ?? 1;
      const rot = (outDir - 1 + 4) % 4;
      tiles.push({
        kind: 'source',
        rotation: rot,
        locked: true,
        solutionRotation: rot,
        inSolution: true,
      });
      continue;
    }

    if (i === targetIdx) {
      const inDir = Array.from(adj[i] ?? [])[0] ?? 3;
      const rot = (inDir - 3 + 4) % 4;
      tiles.push({
        kind: 'target',
        rotation: rot,
        locked: true,
        solutionRotation: rot,
        inSolution: true,
      });
      continue;
    }

    if (inCircuit.has(i)) {
      const dirs = Array.from(adj[i] ?? []);
      const { kind, rotation } = dirsToTile(dirs);
      tiles.push({
        kind,
        rotation,
        locked: kind === 'cross',
        relay: relayIndices.has(i),
        solutionRotation: rotation,
        inSolution: true,
      });
      continue;
    }

    // Non-circuit cell: place ceramic insulator block or realistic decoy pipe
    const roll = rng();
    if (blocksPlaced < targetBlocks && roll < 0.34) {
      blocksPlaced += 1;
      tiles.push({
        kind: 'block',
        rotation: 0,
        locked: true,
        solutionRotation: 0,
        inSolution: false,
      });
    } else {
      const decoyKinds: TileKind[] = ['corner', 'straight', 'corner', 'tee'];
      const kind = decoyKinds[Math.floor(rng() * decoyKinds.length)] ?? 'corner';
      const rot = Math.floor(rng() * getRotationalPeriod(kind));
      tiles.push({
        kind,
        rotation: rot,
        locked: false,
        solutionRotation: rot,
        inSolution: false,
      });
    }
  }

  // Scramble rotatable solution tiles so puzzle starts unsolved and has crisp par
  let par = 0;
  const circuitRotatables = tiles
    .map((t, idx) => ({ t, idx }))
    .filter(({ t }) => t.inSolution && !t.locked && getRotationalPeriod(t.kind) > 1);

  for (const { t } of circuitRotatables) {
    const period = getRotationalPeriod(t.kind);
    const shouldScramble = rng() < 0.78;
    if (!shouldScramble) continue;
    const offset = period === 2 ? 1 : 1 + Math.floor(rng() * 3);
    t.rotation = (t.solutionRotation + offset) % period;
    par += clicksToMatch(t.kind, t.rotation, t.solutionRotation);
  }

  // Guarantee non-trivial start: if solved or par < 5, scramble more circuit tiles
  if (evaluateCircuit(tiles, size).solved || par < 5) {
    par = 0;
    for (const { t } of circuitRotatables) {
      const period = getRotationalPeriod(t.kind);
      const offset = period === 2 ? 1 : 1 + Math.floor(rng() * 2);
      t.rotation = (t.solutionRotation + offset) % period;
      par += clicksToMatch(t.kind, t.rotation, t.solutionRotation);
    }
  }

  const theme = DAILY_THEMES[(puzzleNumber - 1) % DAILY_THEMES.length] ?? 'Copper Exchange';

  return {
    dateKey,
    puzzleNumber,
    title: options?.titleOverride ?? theme,
    difficulty,
    size,
    par: Math.max(1, par),
    tiles,
    ...(options?.author !== undefined ? { author: options.author } : {}),
    ...(options?.customId !== undefined ? { customId: options.customId } : {}),
  };
}

export function getMedalForMoves(moves: number, par: number): 'PAR' | 'SILVER' | 'SOLVED' {
  if (moves <= par) return 'PAR';
  if (moves <= par + 2) return 'SILVER';
  return 'SOLVED';
}

export function buildSpoilerFreeShareGrid(
  tiles: readonly TileSpec[],
  energized: readonly boolean[],
  size = GRID_SIZE
): string {
  const rows: string[] = [];
  for (let r = 0; r < size; r++) {
    let rowStr = '';
    for (let c = 0; c < size; c++) {
      const idx = r * size + c;
      const t = tiles[idx];
      if (!t) continue;
      if (t.kind === 'source') rowStr += '🟠';
      else if (t.kind === 'target') rowStr += '🟢';
      else if (t.kind === 'block') rowStr += '⬛';
      else if (t.relay) rowStr += energized[idx] ? '⚡' : '🟡';
      else if (energized[idx]) rowStr += '🟧';
      else rowStr += '⬜';
    }
    rows.push(rowStr);
  }
  return rows.join('\n');
}

export function formatRedditShareComment(params: {
  puzzleNumber: number;
  boardTitle: string;
  moves: number;
  par: number;
  timeSec: number;
  streak: number;
  shareGrid: string;
}): string {
  const medal = getMedalForMoves(params.moves, params.par);
  const badge =
    medal === 'PAR'
      ? '⚡ PAR CIRCUIT'
      : medal === 'SILVER'
      ? '🟠 CLEAN ROUTE'
      : '🟢 CIRCUIT CLOSED';
  const streakPart = params.streak > 0 ? ` · 🔥 ${params.streak}-day streak` : '';
  return [
    `**SWITCHBOARD #${params.puzzleNumber}** — *${params.boardTitle}*`,
    `${badge} · **${params.moves}/${params.par} moves** · ${params.timeSec}s${streakPart}`,
    '',
    '```',
    params.shareGrid,
    '```',
  ].join('\n');
}
