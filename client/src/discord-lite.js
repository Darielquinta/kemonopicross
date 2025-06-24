import { DiscordSDK } from "@discord/embedded-app-sdk";

export const sdk = new DiscordSDK(import.meta.env.VITE_DISCORD_CLIENT_ID);

export const participants = new Map();   // user_id → profile
export const scores       = new Map();   // user_id → ms

let meId          = null;   // real id once we know it
let pendingScore  = null;   // stored until we know meId

/* ───────── one-time handshake ───────── */
let ready;
export function initDiscord() {
  if (ready) return ready;
  ready = sdk.ready().then(() => {

    /* who’s in the room? */
    sdk.subscribe("ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE",
      ({ participants: list }) => {
        list.forEach(p => {
          participants.set(p.user_id, p);
          if (p.is_current) {
            meId = p.user_id;

            /* replace the “local” placeholder with our real id */
            if (pendingScore !== null) {
              scores.delete("local");
              scores.set(meId, pendingScore);
              pendingScore = null;
            }
          }
        });
        window.renderLeaderboard?.();
      });

    /* someone else posted a time */
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

/* ───────── shout your solve-time ───────── */
export async function postTime(ms) {
  await initDiscord();                 // make sure handshake done

  if (meId) {
    scores.set(meId, ms);              // instant local echo
  } else {
    pendingScore = ms;                 // stash until participant packet arrives
    scores.set("local", ms);
  }
  window.renderLeaderboard?.();        // repaint now

  // fire-and-forget to Discord (no await -> keeps UI snappy)
  sdk.commands.setActivityInstanceState({ timeMs: ms });
}
