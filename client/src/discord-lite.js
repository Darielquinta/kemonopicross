import { DiscordSDK } from "@discord/embedded-app-sdk";

export const sdk = new DiscordSDK(import.meta.env.VITE_DISCORD_CLIENT_ID);

export const participants = new Map();   // user_id → profile
export const scores       = new Map();   // user_id → ms

let meId = null;
let pendingScore = null;

let ready;
export function initDiscord() {
  if (ready) return ready;
  ready = (async () => {
    await sdk.ready();                // handshake

    /* ① POPUP: implicit grant (no secret needed) */
    const { access_token } = await sdk.commands.authorize({
      client_id:     import.meta.env.VITE_DISCORD_CLIENT_ID,
      response_type: "token",          // <-- this is the magic
      prompt:        "auto",
      scope:         ["identify"]
    });

    /* ② Bind the token to the SDK */
    await sdk.commands.authenticate({ access_token });

    /* ③ Listeners */
    sdk.subscribe("ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE",
      ({ participants: list }) => {
        list.forEach(p => {
          participants.set(p.user_id, p);
          if (p.is_current) {
            meId = p.user_id;
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

export async function postTime(ms) {
  await initDiscord();

  if (meId) {
    scores.set(meId, ms);            // instant local echo
  } else {
    pendingScore = ms;               // stash until participant packet arrives
    scores.set("local", ms);
  }
  window.renderLeaderboard?.();

  sdk.commands.setActivityInstanceState({ timeMs: ms }); // fire & forget
}
