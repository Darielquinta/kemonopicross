import { DiscordSDK } from "@discord/embedded-app-sdk";

export const sdk = new DiscordSDK(import.meta.env.VITE_DISCORD_CLIENT_ID);

export const participants = new Map();
export const scores       = new Map();

let meId = null;
let pendingScore = null;

/* ───────── init (idempotent) ───────── */
let ready;
export function initDiscord() {
  if (ready) return ready;
  ready = (async () => {
    await sdk.ready();                  // iframe⇄Discord handshake

    /* 1⃣  Get a code (popup) */
    const { code } = await sdk.commands.authorize({
      client_id:     import.meta.env.VITE_DISCORD_CLIENT_ID,
      response_type: "code",
      prompt:        "auto",
      scope:         ["identify"]
    });

    /* 2⃣  Swap code → token via our Worker */
    const { access_token } = await fetch("/api/token", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ code })
    }).then(r => r.json());

    /* 3⃣  Tell Discord SDK to bind that token */
    await sdk.commands.authenticate({ access_token });

    /* 4⃣  Now participants will flag is_current & include names */
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

/* ───────── post your time ───────── */
export async function postTime(ms) {
  await initDiscord();

  if (meId) {
    scores.set(meId, ms);
  } else {
    pendingScore = ms;
    scores.set("local", ms);
  }
  window.renderLeaderboard?.();

  sdk.commands.setActivityInstanceState({ timeMs: ms }); // fire & forget
}
