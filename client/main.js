// main.js - Enhanced initialization
import { applyDiscordProxy, isDiscordEnvironment } from "./src/discordProxy.js";
import { loadDailyPuzzle } from "./src/puzzle.js";
import { createBoard } from "./src/board.js";

async function initializeApp() {
  console.log('Initializing app...');
  
  try {
    // Apply Discord proxy if needed
    if (isDiscordEnvironment()) {
      console.log('Discord environment detected, applying proxy...');
      applyDiscordProxy();
    }

    // Load and create the puzzle
    console.log('Loading daily puzzle...');
    const puzzle = loadDailyPuzzle();
    console.log('Puzzle loaded:', puzzle.id);

    // Create the game board
    console.log('Creating game board...');
    const board = await createBoard(puzzle);
    console.log('Game board created successfully');

    // Handle window resize
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(async () => {
        console.log('Window resized, recreating board...');
        try {
          const newBoard = await createBoard(puzzle);
          board.replaceWith(newBoard);
        } catch (error) {
          console.error('Error recreating board after resize:', error);
        }
      }, 250);
    });

  } catch (error) {
    console.error('Failed to initialize app:', error);
    
    // Show error message to user
    const app = document.querySelector("#app");
    if (app) {
      app.innerHTML = `
        <div style="text-align: center; padding: 20px; color: #ff6b6b;">
          <h2>🚨 Initialization Error</h2>
          <p>Failed to start the app. Please refresh the page.</p>
          <details style="margin-top: 10px; text-align: left; max-width: 500px; margin-left: auto; margin-right: auto;">
            <summary>Error Details</summary>
            <pre style="background: #f8f8f8; padding: 10px; border-radius: 4px; overflow: auto; font-size: 12px;">${error.stack || error.message}</pre>
          </details>
          <button onclick="window.location.reload()" style="margin-top: 10px; padding: 8px 16px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">
            Refresh Page
          </button>
        </div>
      `;
    }
  }
}

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}

// Global error handling
window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});