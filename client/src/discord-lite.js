import { DiscordSDK } from "@discord/embedded-app-sdk";
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  query, 
  where, 
  orderBy,
  serverTimestamp,
  onSnapshot 
} from 'firebase/firestore';

// Initialize Firebase
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export const sdk = new DiscordSDK(import.meta.env.VITE_DISCORD_CLIENT_ID);

export const participants = new Map();      // user_id → profile
export const scores       = new Map();      // user_id → {username, displayName, time}

export function getDisplayName(id) {
  if (id === "local") return "You";
  const p = participants.get(id);
  return p?.global_name || p?.username || id.slice(0, 4);
}

let meId = null;
let guildId = null;
let channelId = null;
let pendingScore = null;
let unsubscribeLeaderboard = null;

function getTodayKey() {
  return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}

function getPuzzleId() {
  // Get puzzle ID from your existing puzzle system
  const epoch = new Date(2025, 0, 1);
  const daysSinceEpoch = Math.floor((Date.now() - epoch) / (86_400_000));
  return daysSinceEpoch;
}

/* ───────── one-time init (idempotent) ───────── */
let ready;
export function initDiscord() {
  if (ready) return ready;
  ready = (async () => {
    await sdk.ready();

    try {
      // Get guild and channel info
      const channelInfo = await sdk.commands.getChannel();
      guildId = channelInfo.guild_id;
      channelId = channelInfo.id;
      
      // Get user info
      await sdk.commands.authorize({
        client_id: import.meta.env.VITE_DISCORD_CLIENT_ID,
        response_type: "code",
        prompt: "auto",
        scope: ["identify"]
      });
      
      const { user } = await sdk.commands.getCurrentUser();
      meId = user.id;
      participants.set(user.id, user);

      console.log("Discord initialized:", { meId, guildId, channelId });

      // Load today's leaderboard and set up real-time updates
      await setupRealtimeLeaderboard();

      // Handle pending score
      if (pendingScore !== null) {
        scores.delete("local");
        await submitScore(pendingScore);
        pendingScore = null;
      }
    } catch (error) {
      console.log("Discord initialization failed:", error);
      // Still try to load leaderboard even if Discord fails
      await setupRealtimeLeaderboard();
    }

    window.renderLeaderboard?.();
  })();
  return ready;
}

/* ───────── Setup real-time leaderboard updates ───────── */
async function setupRealtimeLeaderboard() {
  const today = getTodayKey();
  const puzzleId = getPuzzleId();
  
  // Clean up existing listener
  if (unsubscribeLeaderboard) {
    unsubscribeLeaderboard();
  }

  try {
    // Create real-time listener for today's scores
    const scoresRef = collection(db, 'daily-scores');
    const todayQuery = query(
      scoresRef,
      where('date', '==', today),
      where('puzzleId', '==', puzzleId),
      where('guildId', '==', guildId || 'local'), // fallback for testing
      orderBy('time', 'asc')
    );

    unsubscribeLeaderboard = onSnapshot(todayQuery, (snapshot) => {
      console.log("Leaderboard updated from Firebase");
      scores.clear();
      
      snapshot.forEach((doc) => {
        const data = doc.data();
        scores.set(data.userId, {
          username: data.username,
          displayName: data.displayName,
          time: data.time,
          completedAt: data.completedAt
        });
      });
      
      window.renderLeaderboard?.();
    });

  } catch (error) {
    console.error('Failed to setup real-time leaderboard:', error);
    // Fallback to one-time load
    await loadDailyLeaderboard();
  }
}

/* ───────── Load daily leaderboard (fallback) ───────── */
async function loadDailyLeaderboard() {
  const today = getTodayKey();
  const puzzleId = getPuzzleId();
  
  try {
    const scoresRef = collection(db, 'daily-scores');
    const todayQuery = query(
      scoresRef,
      where('date', '==', today),
      where('puzzleId', '==', puzzleId),
      where('guildId', '==', guildId || 'local'),
      orderBy('time', 'asc')
    );
    
    const querySnapshot = await getDocs(todayQuery);
    scores.clear();
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      scores.set(data.userId, {
        username: data.username,
        displayName: data.displayName,
        time: data.time,
        completedAt: data.completedAt
      });
    });
    
    console.log(`Loaded ${scores.size} scores for ${today}`);
    window.renderLeaderboard?.();
  } catch (error) {
    console.error('Failed to load leaderboard:', error);
  }
}

/* ───────── Submit score to Firebase ───────── */
async function submitScore(ms) {
  const user = participants.get(meId) || { username: 'Anonymous', global_name: 'Anonymous' };
  const today = getTodayKey();
  const puzzleId = getPuzzleId();
  const userId = meId || 'local';
  
  try {
    // Create unique document ID: guildId_userId_date_puzzleId
    const docId = `${guildId || 'local'}_${userId}_${today}_${puzzleId}`;
    
    const scoreData = {
      userId: userId,
      username: user.username,
      displayName: user.global_name || user.username,
      time: ms,
      date: today,
      puzzleId: puzzleId,
      guildId: guildId || 'local',
      channelId: channelId || 'local',
      completedAt: serverTimestamp()
    };

    // Check if user already has a score today
    const existingScore = scores.get(userId);
    if (existingScore && existingScore.time <= ms) {
      console.log('User already has a better or equal score today');
      return; // Don't overwrite better scores
    }

    await setDoc(doc(db, 'daily-scores', docId), scoreData);
    console.log('Score submitted to Firebase:', scoreData);

    // Update local scores immediately for instant feedback
    scores.set(userId, {
      username: user.username,
      displayName: user.global_name || user.username,
      time: ms,
      completedAt: new Date()
    });
    
    window.renderLeaderboard?.();

    // Send Discord message if in a guild
    if (guildId && channelId) {
      try {
        await postDiscordMessage(user.global_name || user.username, ms);
      } catch (error) {
        console.log('Failed to post Discord message:', error);
      }
    }

  } catch (error) {
    console.error('Failed to submit score:', error);
  }
}

/* ───────── Post completion message to Discord ───────── */
async function postDiscordMessage(displayName, ms) {
  const timeText = (ms / 1000).toFixed(1);
  const puzzleId = getPuzzleId();
  
  try {
    await sdk.commands.sendMessage({
      channel_id: channelId,
      content: `🧩 **${displayName}** completed Daily Picross #${puzzleId} in **${timeText}s**! 🎉`
    });
  } catch (error) {
    console.log('Discord message failed, user may not have permission:', error);
  }
}

/* ───────── post your solve-time ───────── */
export async function postTime(ms) {
  await initDiscord();

  if (meId || guildId) {
    await submitScore(ms);
  } else {
    pendingScore = ms;
    scores.set("local", { 
      displayName: "You", 
      username: "local",
      time: ms, 
      completedAt: new Date() 
    });
    window.renderLeaderboard?.();
  }
}

/* ───────── Cleanup ───────── */
export function cleanup() {
  if (unsubscribeLeaderboard) {
    unsubscribeLeaderboard();
  }
}