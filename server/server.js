import express from "express";
import dotenv from "dotenv";
import fetch from "node-fetch";
import fs from "fs";
dotenv.config({ path: "../.env" });

const app = express();
const port = 3001;

const SCORES_FILE = new URL("scores.json", import.meta.url).pathname;
let scores = {};
try {
  scores = JSON.parse(fs.readFileSync(SCORES_FILE, "utf8"));
} catch (e) {
  scores = {};
}

const saveScores = () => fs.writeFileSync(SCORES_FILE, JSON.stringify(scores, null, 2));

// Allow express to parse JSON bodies
app.use(express.json());

app.post("/api/token", async (req, res) => {
  
  // Exchange the code for an access_token
  const response = await fetch(`https://discord.com/api/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: process.env.VITE_DISCORD_CLIENT_ID,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code: req.body.code,
    }),
  });

  // Retrieve the access_token from the response
  const { access_token } = await response.json();

  // Return the access_token to our client as { access_token: "..."}
  res.send({access_token});
});

app.post("/api/time", async (req, res) => {
  const { access_token, puzzle_id, time } = req.body;
  if (!access_token || !puzzle_id || typeof time !== "number") {
    return res.status(400).send({ error: "invalid body" });
  }
  try {
    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (!userRes.ok) throw new Error("auth failed");
    const user = await userRes.json();
    const uid = user.id;
    if (!scores[puzzle_id]) scores[puzzle_id] = {};
    const prev = scores[puzzle_id][uid];
    if (!prev || time < prev.time) {
      scores[puzzle_id][uid] = { username: user.username, time };
      saveScores();
    }
    const entries = Object.entries(scores[puzzle_id]).map(([id, v]) => ({
      id,
      ...v,
    }));
    entries.sort((a, b) => a.time - b.time);
    const leaderboard = entries.slice(0, 10).map(({ username, time }) => ({
      username,
      time,
    }));
    const rank = entries.findIndex((e) => e.id === uid) + 1;
    res.send({ leaderboard, rank });
  } catch (err) {
    res.status(500).send({ error: "auth failed" });
  }
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
