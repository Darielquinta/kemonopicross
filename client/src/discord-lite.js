import { DiscordSDK } from "@discord/embedded-app-sdk";

export const sdk = new DiscordSDK(import.meta.env.VITE_DISCORD_CLIENT_ID);

/* live data stores */
export const participants = new Map();  // user_id → profile
export const scores       = new Map();  // user_id → ms

let meId = null;                       // set once

/* handshake (idempotent) */
let ready;
export function initDiscord() {
  if (ready) return ready;
  ready = sdk.ready().then(() => {

    /* who’s here? --------------------------------------------------------- */
    sdk.subscribe("ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE",
      ({ participants: list }) => {
        list.forEach(p => {
          participants.set(p.user_id, p);
          if (p.is_current) meId = p.user_id;   // ← correct flag name
        });
        window.renderLeaderboard?.();
      });

    /* someone else shouted a score --------------------------------------- */
    sdk.subscribe("ACTIVITY_INSTANCE_STATE_UPDATE",
      ({ user_id, state }) => {
        if (typeof state.timeMs === "number") {
          scores.set(user_id, state.timeMs);
          window.renderLeaderboard?.();
        }
      });
  });
  return ready;
}

/* broadcast + instant local echo ----------------------------------------- */
export async function postTime(ms) {
  await initDiscord();

  /* local echo – works now that meId is set */
  if (meId) {
    scores.set(meId, ms);
    window.renderLeaderboard?.();
  }

  /* tell everyone else */
  return sdk.commands.setActivityInstanceState({ timeMs: ms });
}
