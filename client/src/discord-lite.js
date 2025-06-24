import { DiscordSDK } from "@discord/embedded-app-sdk";

export const sdk = new DiscordSDK(import.meta.env.VITE_DISCORD_CLIENT_ID);

export const participants = new Map();  // user_id → profile
export const scores       = new Map();  // user_id → ms

// one-time handshake
let readyPromise;
export function initDiscord() {
  if (readyPromise) return readyPromise;                 // idempotent
  readyPromise = sdk.ready().then(() => {
    /* keep track of “me” once the participant list arrives */
    let meId = null;

    sdk.subscribe("ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE",
    ({ participants: list }) => {
        list.forEach(p => {
        participants.set(p.user_id, p);
        if (p.is_current_user) meId = p.user_id;   // 👈 grab my ID
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

/* shout your time and update yourself immediately */
export async function postTime(ms) {
  await initDiscord();                       // ensure SDK ready

  if (meId) {                                // local echo
    scores.set(meId, ms);
    window.renderLeaderboard?.();
  }

  return sdk.commands.setActivityInstanceState({ timeMs: ms });
}
