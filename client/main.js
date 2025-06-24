import "./style.css";
import { loadDailyPuzzle } from "./src/puzzle.js";
import { createBoard } from "./src/board.js";

(async () => {
  const puzzle = loadDailyPuzzle();
  await createBoard(puzzle);
})();
