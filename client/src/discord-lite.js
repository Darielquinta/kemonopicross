// src/discord-lite.js
import { DiscordSDK } from "@discord/embedded-app-sdk";

export const sdk = new DiscordSDK(import.meta.env.VITE_DISCORD_CLIENT_ID);
await sdk.ready();

/* who’s here? -------------------------------------------------------------- */
export const participants = new Map();       // user_id → {username, …}
sdk.subscribe("ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE",
  ({ participants: list }) => {
    list.forEach(p => participants.set(p.user_id, p));
    window.renderLeaderboard?.();            // repaint if names changed
  });

/* live scores -------------------------------------------------------------- */
export const scores = new Map();             // user_id → ms
sdk.subscribe("ACTIVITY_INSTANCE_STATE_UPDATE",
  ({ user_id, state }) => {
    if (typeof state.timeMs === "number") {
      scores.set(user_id, state.timeMs);
      window.renderLeaderboard?.();          // 🚀 keep board in sync
    }
  });

/* shout your time ---------------------------------------------------------- */
export async function postTime(ms) {
  // Discord will echo the update right back to us, so no manual local-echo.
  await sdk.commands.setActivityInstanceState({ timeMs: ms });
}
