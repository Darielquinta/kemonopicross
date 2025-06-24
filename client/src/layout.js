import { CLUE_RATIO, MIN_CELL } from "./constants.js";

export function computeLayout(rows, cols, maxRow, maxCol) {
  const CELL = Math.max(
    MIN_CELL,
    Math.floor(
      Math.min(
        (window.innerWidth - 16) / (cols + maxRow * CLUE_RATIO),
        (window.innerHeight - 16) / (rows + maxCol * CLUE_RATIO)
      )
    )
  );
  const CLUE = Math.round(CELL * CLUE_RATIO);
  const LEFT = maxRow * CLUE + 12;
  const TOP = maxCol * CLUE + 12;
  return { CELL, CLUE, LEFT, TOP };
}
