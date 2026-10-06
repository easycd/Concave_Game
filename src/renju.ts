export type ForbiddenReason = '장목' | '사사' | '삼삼';
export interface ForbiddenMove { x: number; y: number; reason: ForbiddenReason }
const directions = [[1, 0], [0, 1], [1, 1], [1, -1]] as const;
type Point = [number, number];
interface Four { stones: Point[]; ends: Point[] }

/** RIF forbidden moves. Three extensions must themselves be legal black moves. */
export function renjuForbidden(board: number[][], x: number, y: number): ForbiddenReason | null {
  const size = board.length;
  const at = (x: number, y: number) => board[y]?.[x] ?? -1;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < size && y < size;
  const key = (points: Point[]) => points.map(([x, y]) => y * size + x).sort((a, b) => a - b).join(',');
  function length(x: number, y: number, dx: number, dy: number) {
    let n = 1;
    for (const sign of [-1, 1]) {
      let step = 1;
      while (at(x + dx * step * sign, y + dy * step * sign) === 1) { n++; step++; }
    }
    return n;
  }
  function fours(x: number, y: number, dx: number, dy: number): Four[] {
    const groups = new Map<string, Four>();
    for (let start = -4; start <= 0; start++) {
      const stones: Point[] = [], empty: Point[] = [];
      for (let i = start; i < start + 5; i++) {
        const px = x + i * dx, py = y + i * dy;
        if (at(px, py) === 1) stones.push([px, py]);
        else if (at(px, py) === 0) empty.push([px, py]);
      }
      if (stones.length !== 4 || empty.length !== 1) continue;
      if (at(x + (start - 1) * dx, y + (start - 1) * dy) === 1 || at(x + (start + 5) * dx, y + (start + 5) * dy) === 1) continue;
      const id = key(stones);
      const group = groups.get(id) ?? { stones, ends: [] };
      group.ends.push(empty[0]); groups.set(id, group);
    }
    return [...groups.values()];
  }
  function check(x: number, y: number): ForbiddenReason | null {
    if (!inside(x, y) || at(x, y) !== 0) return null;
    board[y][x] = 1;
    try {
      const runs = directions.map(([dx, dy]) => length(x, y, dx, dy));
      // An exact five wins immediately, including a simultaneous forbidden pattern (RIF 9.2).
      if (runs.includes(5)) return null;
      if (runs.some(n => n > 5)) return '장목';
      if (directions.reduce((n, [dx, dy]) => n + fours(x, y, dx, dy).length, 0) >= 2) return '사사';
      const threes = new Map<string, Point[]>();
      for (const [dx, dy] of directions) {
        for (let step = -4; step <= 4; step++) {
          const ex = x + step * dx, ey = y + step * dy;
          if (!inside(ex, ey) || at(ex, ey) !== 0) continue;
          board[ey][ex] = 1;
          try {
            for (const four of fours(x, y, dx, dy)) {
              if (four.ends.length < 2 || !four.stones.some(([fx, fy]) => fx === ex && fy === ey)) continue;
              const id = key(four.stones.filter(([fx, fy]) => fx !== ex || fy !== ey));
              const extensions = threes.get(id) ?? [];
              extensions.push([ex, ey]); threes.set(id, extensions);
            }
          } finally { board[ey][ex] = 0; }
        }
      }
      if (threes.size < 2) return null;
      let legalThrees = 0;
      for (const extensions of threes.values()) {
        if (extensions.some(([ex, ey]) => check(ex, ey) === null) && ++legalThrees >= 2) return '삼삼';
      }
      return null;
    } finally { board[y][x] = 0; }
  }
  return check(x, y);
}

export function renjuForbiddenMoves(board: number[][]): ForbiddenMove[] {
  const result: ForbiddenMove[] = [];
  board.forEach((row, y) => row.forEach((cell, x) => {
    if (cell) return;
    const reason = renjuForbidden(board, x, y);
    if (reason) result.push({ x, y, reason });
  }));
  return result;
}
