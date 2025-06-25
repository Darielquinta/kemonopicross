import "./style.css";
import { loadDailyPuzzle } from "./src/puzzle.js";
import { createBoard } from "./src/board.js";
import { applyDiscordProxy } from "./src/discordProxy.js";
applyDiscordProxy();                 // <-- MUST run first

// now import Firebase & the rest of your app
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
// ...


(async () => {
  const puzzle = loadDailyPuzzle();
  await createBoard(puzzle);
})();
