// discord-lite.js - Fixed version
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
  onSnapshot,
  connectFirestoreEmulator
} from 'firebase/firestore';

// Initialize Firebase with error handling
let app, db;
try {
  const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
  };

  // Validate required config
  if (!firebaseConfig.projectId || !firebaseConfig.apiKey) {
    throw new Error('Missing required Firebase configuration');
  }

  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  
  console.log('Firebase initialized successfully');
} catch (error) {
  console.error('Firebase initialization failed:', error);
  // Set up mock database for testing
  db = null;
}

// Initialize Discord SDK with better error handling
export let sdk;
try {
  const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;
  if (!clientId) {
    throw new Error('Missing Discord Client ID');
  }
  sdk = new DiscordSDK(clientId);
} catch (error) {
  console.error('Discord SDK initialization failed:', error);
  sdk = null;
}

export const participants = new Map();
export const scores = new Map();

export function getDisplayName(id) {
  if (id === "local") return "You";
  const p = participants.get(id);
  return p?.global_name || p?.username || `User${id.slice(-4)}`;
}

export let meId = null;
let guildId = null;
let channelId = null;
let pendingScore = null;
let unsubscribeLeaderboard = null;
let isDiscordReady = false;

function getTodayKey() {
  return new Date().toISOString().split('T')[0];
}

function getPuzzleId() {
  const epoch = new Date(2025, 0, 1);
  const daysSinceEpoch = Math.floor((Date.now() - epoch) / (86_400_000));
  return daysSinceEpoch;
}

/* ───────── Discord initialization with better error handling ───────── */
let initPromise;
export function initDiscord() {
  if (initPromise) return initPromise;
  
  initPromise = (async () => {
    console.log('Starting Discord initialization...');
    
    // If no SDK, work in local mode
    if (!sdk) {
      console.log('No Discord SDK available, working in local mode');
      await setupLocalMode();
      return;
    }

    try {
      // Wait for Discord to be ready
      console.log('Waiting for Discord ready...');
      await sdk.ready();
      console.log('Discord SDK ready');
      
      // Get basic info without requiring authorization initially  
      try {
        const channelInfo = await sdk.commands.getChannel();
        console.log('Channel info:', channelInfo);
        
        if (channelInfo) {
          guildId = channelInfo.guild_id;
          channelId = channelInfo.id;
          console.log('Guild/Channel set:', { guildId, channelId });
        }
      } catch (error) {
        console.log('Could not get channel info:', error);
      }

      // Try to get user info with authorization
      try {
        console.log('Attempting authorization...');
        const authResult = await sdk.commands.authorize({
          client_id: import.meta.env.VITE_DISCORD_CLIENT_ID,
          response_type: "code",
          prompt: "none", // Changed from "auto" to "none"
          scope: ["identify"]
        });
        console.log('Authorization result:', authResult);

        const { user } = await sdk.commands.getCurrentUser();
        console.log('Current user:', user);
        
        meId = user.id;
        participants.set(user.id, user);
        isDiscordReady = true;
        
        console.log('Discord fully initialized:', { meId, guildId, channelId });
      } catch (authError) {
        console.log('Authorization failed, continuing in limited mode:', authError);
        // Don't throw - continue with limited functionality
      }

      // Load leaderboard regardless of auth status
      await setupRealtimeLeaderboard();

      // Handle any pending score
      if (pendingScore !== null) {
        scores.delete("local");
        await submitScore(pendingScore);
        pendingScore = null;
      }

    } catch (error) {
      console.error('Discord initialization error:', error);
      await setupLocalMode();
    }

    // Trigger UI update
    window.renderLeaderboard?.();
  })();
  
  return initPromise;
}

/* ───────── Setup local mode fallback ───────── */
async function setupLocalMode() {
  console.log('Setting up local mode...');
  guildId = 'local';
  channelId = 'local';
  meId = 'local';
  
  // Add local user to participants
  participants.set('local', {
    id: 'local',
    username: 'LocalPlayer',
    global_name: 'You'
  });
  
  await setupRealtimeLeaderboard();
}

/* ───────── Firebase leaderboard with better error handling ───────── */
async function setupRealtimeLeaderboard() {
  console.log('Setting up leaderboard...');
  
  if (!db) {
    console.log('No database available, using local scores only');
    return;
  }

  const today = getTodayKey();
  const puzzleId = getPuzzleId();
  
  // Clean up existing listener
  if (unsubscribeLeaderboard) {
    unsubscribeLeaderboard();
  }

  try {
    const scoresRef = collection(db, 'daily-scores');
    const todayQuery = query(
      scoresRef,
      where('date', '==', today),
      where('puzzleId', '==', puzzleId),
      where('guildId', '==', guildId || 'local'),
      orderBy('time', 'asc')
    );

    console.log('Setting up Firestore listener...');
    unsubscribeLeaderboard = onSnapshot(
      todayQuery, 
      (snapshot) => {
        console.log(`Leaderboard updated: ${snapshot.size} scores`);
        
        // Clear existing scores except local ones
        const localScore = scores.get('local');
        scores.clear();
        if (localScore) {
          scores.set('local', localScore);
        }
        
        snapshot.forEach((doc) => {
          const data = doc.data();
          scores.set(data.userId, {
            username: data.username,
            displayName: data.displayName,
            time: data.time,
            completedAt: data.completedAt?.toDate?.() || data.completedAt
          });
        });
        
        window.renderLeaderboard?.();
      },
      (error) => {
        console.error('Firestore listener error:', error);
        // Fallback to one-time load
        loadDailyLeaderboard();
      }
    );

  } catch (error) {
    console.error('Failed to setup real-time leaderboard:', error);
    await loadDailyLeaderboard();
  }
}

/* ───────── Fallback leaderboard loading ───────── */
async function loadDailyLeaderboard() {
  if (!db) return;
  
  const today = getTodayKey();
  const puzzleId = getPuzzleId();
  
  try {
    console.log('Loading daily leaderboard...');
    const scoresRef = collection(db, 'daily-scores');
    const todayQuery = query(
      scoresRef,
      where('date', '==', today),
      where('puzzleId', '==', puzzleId),
      where('guildId', '==', guildId || 'local'),
      orderBy('time', 'asc')
    );
    
    const querySnapshot = await getDocs(todayQuery);
    
    // Preserve local scores
    const localScore = scores.get('local');
    scores.clear();
    if (localScore) {
      scores.set('local', localScore);
    }
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      scores.set(data.userId, {
        username: data.username,
        displayName: data.displayName,
        time: data.time,
        completedAt: data.completedAt?.toDate?.() || data.completedAt
      });
    });
    
    console.log(`Loaded ${querySnapshot.size} scores for ${today}`);
    window.renderLeaderboard?.();
  } catch (error) {
    console.error('Failed to load leaderboard:', error);
  }
}

/* ───────── Score submission with better error handling ───────── */
async function submitScore(ms) {
  console.log('Submitting score:', ms);
  
  const userId = meId || 'local';
  const user = participants.get(userId) || { 
    username: 'Anonymous', 
    global_name: 'Anonymous' 
  };
  
  // Always update local scores immediately
  scores.set(userId, {
    username: user.username,
    displayName: user.global_name || user.username,
    time: ms,
    completedAt: new Date()
  });
  window.renderLeaderboard?.();
  
  // Try to save to Firebase if available
  if (!db) {
    console.log('No database available, score saved locally only');
    return;
  }

  const today = getTodayKey();
  const puzzleId = getPuzzleId();
  
  try {
    // Check if user already has a better score
    const existingScore = scores.get(userId);
    if (existingScore && existingScore.time < ms) {
      console.log('User already has a better score, not overwriting');
      return;
    }

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

    await setDoc(doc(db, 'daily-scores', docId), scoreData);
    console.log('Score submitted to Firebase successfully');

    // Try to post Discord message if in guild and authorized
    if (isDiscordReady && guildId && guildId !== 'local' && channelId) {
      try {
        await postDiscordMessage(user.global_name || user.username, ms);
      } catch (error) {
        console.log('Discord message failed:', error);
      }
    }

  } catch (error) {
    console.error('Failed to submit score to Firebase:', error);
    // Score is still saved locally, so don't throw
  }
}

/* ───────── Discord message posting ───────── */
async function postDiscordMessage(displayName, ms) {
  if (!sdk || !isDiscordReady) return;
  
  const timeText = (ms / 1000).toFixed(1);
  const puzzleId = getPuzzleId();
  
  try {
    await sdk.commands.sendMessage({
      channel_id: channelId,
      content: `🧩 **${displayName}** completed Daily Picross #${puzzleId} in **${timeText}s**! 🎉`
    });
    console.log('Discord message sent successfully');
  } catch (error) {
    console.log('Failed to send Discord message:', error);
  }
}

/* ───────── Public API ───────── */
export async function postTime(ms) {
  console.log('postTime called with:', ms);
  
  try {
    await initDiscord();
    await submitScore(ms);
  } catch (error) {
    console.error('Error posting time:', error);
    // Still save locally as fallback
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
    unsubscribeLeaderboard = null;
  }
}

// Expose for debugging
window.discordDebug = {
  sdk,
  db,
  participants,
  scores,
  meId,
  guildId,
  channelId,
  isDiscordReady
};