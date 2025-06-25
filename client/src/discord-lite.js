import { DiscordSDK } from "@discord/embedded-app-sdk";

export const sdk = new DiscordSDK(import.meta.env.VITE_DISCORD_CLIENT_ID);

export const participants = new Map();      // user_id → profile
export const scores       = new Map();      // user_id → ms

export function getDisplayName(id) {
  if (id === "local") return "You";
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

    /* 1. Subscribe to events BEFORE authorization to catch early data */
    sdk.subscribe("ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE", ({ participants: list }) => {
      console.log("Participants update:", list);
      list.forEach(p => {
        participants.set(p.user_id, p);
        if (p.is_current) {
          meId = p.user_id;
          console.log("Found current user:", meId);

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

    sdk.subscribe("ACTIVITY_INSTANCE_STATE_UPDATE", ({ user_id, state }) => {
      console.log("State update:", user_id, state);
      if (typeof state.timeMs === "number") {
        scores.set(user_id, state.timeMs);
        window.renderLeaderboard?.();
      }
    });

    /* 2. Ask the user for basic identity permission (popup) */
    try {
      await sdk.commands.authorize({
        client_id: import.meta.env.VITE_DISCORD_CLIENT_ID,
        response_type: "code",
        prompt: "auto",
        scope: ["identify"]           // no backend token exchange needed for names
      });
      
      const { user } = await sdk.commands.getCurrentUser();
      meId = user.id;
      participants.set(user.id, user);
      console.log("Authorized user:", user);

      // Swap out the placeholder score if we posted before identity was known
      if (pendingScore !== null) {
        scores.delete("local");
        scores.set(user.id, pendingScore);
        pendingScore = null;
      }
    } catch (error) {
      console.log("Authorization failed or cancelled:", error);
      // Fine to ignore—worst case we stay on the placeholder
    }

    /* 3. Get current activity instance data */
    try {
      // Get current participants
      const instanceData = await sdk.commands.getInstanceConnectedParticipants();
      console.log("Initial participants:", instanceData);
      if (instanceData.participants) {
        instanceData.participants.forEach(p => {
          participants.set(p.user_id, p);
          if (p.is_current) {
            meId = p.user_id;
          }
        });
      }
    } catch (error) {
      console.log("Failed to get participants:", error);
    }

    /* 4. Request current activity state from all participants */
    try {
      // This will trigger ACTIVITY_INSTANCE_STATE_UPDATE events for existing states
      await sdk.commands.getActivityInstanceState();
    } catch (error) {
      console.log("Failed to get activity state:", error);
    }

    window.renderLeaderboard?.();
  })();
  return ready;
}

/* ───────── post your solve-time ───────── */
export async function postTime(ms) {
  await initDiscord();                  // make sure listeners are up

  console.log("Posting time:", ms, "for user:", meId);

  /* instant local echo */
  if (meId) {
    scores.set(meId, ms);
  } else {
    pendingScore = ms;                  // stash until we learn my real id
    scores.set("local", ms);
  }
  window.renderLeaderboard?.();

  /* fire-and-forget to the room */
  try {
    await sdk.commands.setActivityInstanceState({ timeMs: ms });
    console.log("Successfully posted time to Discord");
  } catch (error) {
    console.error("Failed to post time to Discord:", error);
  }
}