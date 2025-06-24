import ALL_PATTERNS from "../newpatterns.json";

const DAY_MS = 86_400_000;
const epoch = new Date(2025, 0, 1); // Jan-01-2025 = puzzle 0

export function loadDailyPuzzle() {
  const idx = Math.floor((Date.now() - epoch) / DAY_MS) % ALL_PATTERNS.length;
  const { id, pattern } = ALL_PATTERNS[idx];
  const grid = pattern.map((r) => [...r].map((c) => c === "x"));
  const runs = (arr) => {
    const out = [];
    let run = 0;
    arr.forEach((v) => {
      v ? run++ : run && (out.push(run), (run = 0));
    });
    if (run) out.push(run);
    return out.length ? out : [0];
  };
  const rowClues = grid.map(runs);
  const colClues = Array.from({ length: grid[0].length }, (_, x) =>
    runs(grid.map((r) => r[x]))
  );
  const rowCluesRev = rowClues.map((nums) => [...nums].reverse());
  const colCluesRev = colClues.map((nums) => [...nums].reverse());
  const maxRow = Math.max(...rowClues.map((a) => a.length));
  const maxCol = Math.max(...colClues.map((a) => a.length));
  return {
    id,
    grid,
    rows: pattern.length,
    cols: pattern[0].length,
    rowClues,
    colClues,
    rowCluesRev,
    colCluesRev,
    maxRow,
    maxCol,
  };
}
