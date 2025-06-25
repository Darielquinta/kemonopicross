import { DiscordSDK } from "@discord/embedded-app-sdk";

export const sdk = new DiscordSDK(import.meta.env.VITE_DISCORD_CLIENT_ID);

export const participants = new Map();      // user_id → profile
export const scores       = new Map();      // user_id → ms

export function getDisplayName(id) {
  const p = participants.get(id);
  return p?.global_name || p?.username || id.slice(0, 4);
}

let meId          = null;   // real id once we know it
let pendingScore  = null;   // score saved before we know my id

/* ───────── one-time init (idempotent) ───────── */
let ready;
export function initDiscord() {
  if (ready) return ready;
  ready = (async () => {
    await sdk.ready();                               // iframe ⇄ Discord handshake

    /* 1. Ask the user for basic identity permission (popup) */
    await sdk.commands.authorize({
      client_id: import.meta.env.VITE_DISCORD_CLIENT_ID,
      response_type: "code",
      prompt: "auto",
      scope: ["identify"]           // no backend token exchange needed for names
    }).catch(() => { /* user hit “Cancel” – fine, we just won’t get names */ });

    /* 2. Start listening for lobby data */
    sdk.subscribe("ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE",
      ({ participants: list }) => {
        list.forEach(p => {
          participants.set(p.user_id, p);
          if (p.is_current) {
            meId = p.user_id;

            /* replace placeholder if we solved before auth completed */
            if (pendingScore !== null) {
              scores.delete("local");
              scores.set(meId, pendingScore);
              pendingScore = null;
            }
          }
        });
        window.renderLeaderboard?.();
      });

    sdk.subscribe("ACTIVITY_INSTANCE_STATE_UPDATE",
      ({ user_id, state }) => {
        if (typeof state.timeMs === "number") {
          scores.set(user_id, state.timeMs);
          window.renderLeaderboard?.();
        }
      });
  })();
  return ready;
}

/* ───────── post your solve-time ───────── */
export async function postTime(ms) {
  await initDiscord();                  // make sure listeners are up

  /* instant local echo */
  if (meId) {
    scores.set(meId, ms);
  } else {
    pendingScore = ms;                  // stash until we learn my real id
    scores.set("local", ms);
  }
  window.renderLeaderboard?.();

  /* fire-and-forget to the room */
  sdk.commands.setActivityInstanceState({ timeMs: ms });
}