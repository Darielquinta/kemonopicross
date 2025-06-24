import { DiscordSDK } from "@discord/embedded-app-sdk";

export const sdk = new DiscordSDK(import.meta.env.VITE_DISCORD_CLIENT_ID);

export const participants = new Map();   // user_id → profile
export const scores       = new Map();   // user_id → ms

/* current user ID gets set once Discord tells us who we are */
let meId = null;

/* one-time handshake ------------------------------------------------------ */
let readyPromise;
export function initDiscord() {
  if (readyPromise) return readyPromise;        // idempotent
  readyPromise = sdk.ready().then(() => {

    // who’s in the room?
    sdk.subscribe("ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE",
      ({ participants: list }) => {
        list.forEach(p => {
          participants.set(p.user_id, p);
          if (p.is_current_user) meId = p.user_id;
        });
        window.renderLeaderboard?.();
      });

    // who just posted a score?
    sdk.subscribe("ACTIVITY_INSTANCE_STATE_UPDATE",
      ({ user_id, state }) => {
        if (typeof state.timeMs === "number") {
          scores.set(user_id, state.timeMs);
          window.renderLeaderboard?.();
        }
      });
  });
  return readyPromise;
}

/* post your solve-time and update yourself instantly ---------------------- */
export async function postTime(ms) {
  await initDiscord();                 // ensure SDK is ready first

  if (meId) {                          // local echo so HUD updates right away
    scores.set(meId, ms);
    window.renderLeaderboard?.();
  }

  return sdk.commands.setActivityInstanceState({ timeMs: ms });
}
