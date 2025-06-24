// Picross daily – hover highlight + top‑HUD timer
// ---------------------------------------------------------------
//  • Hover strip on row/column.
//  • Timer always visible; puzzle name appears only after solve.
// ---------------------------------------------------------------

import logo   from "./TitleLogo_en.png";
import nanoda from "./nanoda.png";
import "./style.css";
import ALL_PATTERNS from "./newpatterns.json";
import { initializeApp } from "firebase/app";
import {
  getFirestore, doc, setDoc, getDoc, collection,
  query, where, orderBy, limit, getDocs,
  serverTimestamp
} from "firebase/firestore";

import { DiscordSDK } from "@discord/embedded-app-sdk";

const CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID;
if (!CLIENT_ID) throw new Error("Missing Discord client ID in .env file");

// Discord SDK setup
// -----------------

let me, guildId, channelId, ACCESS_TOKEN;

async function initDiscord() {
  const discordSdk = new DiscordSDK(CLIENT_ID);
  await discordSdk.ready();

  const { code } = await discordSdk.commands.authorize({
    client_id: CLIENT_ID,
    scopes: ['identify']
  });

  const authResult = await discordSdk.commands.authenticate({ code });
  if (!authResult || !authResult.access_token) throw new Error("Auth failed");

  ACCESS_TOKEN = authResult.access_token;

  const userInfo = await discordSdk.commands.getUser();
  const context = await discordSdk.commands.getChannel();

  me = userInfo;
  guildId = context.guild_id;
  channelId = context.channel_id;
}

// ⛽️ Your Firebase config (from project settings)
const firebaseConfig = {

  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,

  authDomain: "kemono-picross.firebaseapp.com",

  projectId: "kemono-picross",

  storageBucket: "kemono-picross.appspot.com",

  messagingSenderId: "733990606575",

  appId: "1:733990606575:web:18573b76da3d3ae878ed1a",

  measurementId: "G-7Q2YCVE14C"

};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function submitTime(seconds) {
  const ref = doc(db, "scores", `${guildId}_${PUZZLE_ID}_${me.id}`);
  await setDoc(ref, {
    guildId,
    channelId,
    userId: me.id,
    username: `${me.username}#${me.discriminator}`,
    puzzleId: PUZZLE_ID,
    seconds,
    createdAt: serverTimestamp(),
  });
}

/* ───────── DAILY SEED ───────── */
const DAY_MS = 86_400_000;
const epoch  = new Date(2025, 0, 1);            // Jan‑01‑2025 = puzzle 0
const idx    = Math.floor((Date.now() - epoch) / DAY_MS) % ALL_PATTERNS.length;
const { id: PUZZLE_ID, pattern: PATTERN } = ALL_PATTERNS[idx];

/* ───────── BOARD CONSTANTS ───────── */
const ROWS = PATTERN.length;
const COLS = PATTERN[0].length;
const FADE = 1000;    // ms fade‑in for sprite

/* ───────── COLOUR PALETTE ───────── */
const COLOR = {
  clueBg:   "#fff9e6",
  clueText: "#0066d6",
  empty:    "#ccd6fb",
  filled:   "#00d9aa",
  grid:     "#96a0ad",
  border:   "#de8d2f",
  hover:    "rgba(21,132,93,0.25)",
  wrong:    "#ff0000",
};

/* ───────── CLUE GENERATION ───────── */
const grid = PATTERN.map(r => [...r].map(c => c === "x"));
const runs = arr => {
  const out = [];
  let run = 0;
  arr.forEach(v => { v ? run++ : run && (out.push(run), run = 0); });
  if (run) out.push(run);
  return out.length ? out : [0];
};
const rowClues = grid.map(runs);
const colClues = Array.from({ length: COLS }, (_, x) => runs(grid.map(r => r[x])));
const rowCluesRev = rowClues.map(nums => [...nums].reverse());
const colCluesRev = colClues.map(nums => [...nums].reverse());
const MAX_ROW = Math.max(...rowClues.map(a => a.length));
const MAX_COL = Math.max(...colClues.map(a => a.length));

const CLUE_RATIO = 22 / 69;
const MIN_CELL = 30;
const CELL = Math.max(
  MIN_CELL,
  Math.floor(
    Math.min(
      (window.innerWidth - 16) / (COLS + MAX_ROW * CLUE_RATIO),
      (window.innerHeight - 16) / (ROWS + MAX_COL * CLUE_RATIO)
    )
  )
);
const CLUE = Math.round(CELL * CLUE_RATIO);

const LEFT = MAX_ROW * CLUE + 12;   // board origin X
const TOP  = MAX_COL * CLUE + 12;   // board origin Y

/* ───────── MAIN ───────── */
async function view() {
  const swirl = new Image(); swirl.src = nanoda;
  const img = new Image();
  img.src = `/${PUZZLE_ID}.png`;            // simplest
  // or: `${import.meta.env.BASE_URL}../${PUZZLE_ID}.png`
  await Promise.all([img.decode(), swirl.decode()]);

  /* answer sprite (1× per cell) */
  const sprite = document.createElement("canvas");
  sprite.width = COLS; sprite.height = ROWS;
  sprite.getContext("2d").drawImage(img, 0, 0, COLS, ROWS);
  const swirlPat = document
    .createElement("canvas")
    .getContext("2d")
    .createPattern(swirl, "repeat");

  /* DOM skeleton */
  const app = document.querySelector("#app");
  app.innerHTML = `<div style="text-align:center;margin-top:12px"><img src="${logo}" class="logo"></div>`;

  const wrap = document.createElement("div");
  wrap.style.cssText = "margin:12px auto 0;position:relative;width:fit-content;";
  app.appendChild(wrap);

  /* HUD */
  const hud = document.createElement("div");
  hud.style.cssText = "position:absolute;top:8px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:4px;pointer-events:none;";
  wrap.appendChild(hud);

  const titleEl = document.createElement("div");
  titleEl.textContent = `Puzzle: ${PUZZLE_ID}`;
  titleEl.style.cssText = "display:none;font:700 20px monospace;color:#fff;background:rgba(0,0,0,.65);padding:2px 8px;border-radius:4px;text-shadow:0 0 6px #000;";
  hud.appendChild(titleEl);

  const timeEl = document.createElement("div");
  timeEl.textContent = "Time: 0:00";
  timeEl.style.cssText = "font:600 18px monospace;color:#fff;background:rgba(0,0,0,.65);padding:2px 8px;border-radius:4px;text-shadow:0 0 6px #000;";
  hud.appendChild(timeEl);

  const scoreEl = document.createElement("div");
  scoreEl.style.cssText = "font:600 14px monospace;color:#fff;background:rgba(0,0,0,.65);padding:2px 8px;border-radius:4px;text-shadow:0 0 6px #000;white-space:pre;";
  hud.appendChild(scoreEl);

  /* canvas */
  const can = document.createElement("canvas");
  can.width  = LEFT + COLS * CELL + 4;
  can.height = TOP  + ROWS * CELL + 4;
  wrap.appendChild(can);
  const ctx = can.getContext("2d");

  /* responsive scaling */
  let scale = 1;
  const fitScale = () => {
    const boardW = can.width;
    const boardH = can.height;
    const margin = 20;
    const scaleX = (window.innerWidth - margin) / boardW;
    const scaleY = (window.innerHeight - margin) / (boardH + 200);
    scale = Math.min(scaleX, scaleY);
    wrap.style.transformOrigin = "top center";
    wrap.style.transform = `scale(${scale})`;
    rect = null;
  };
  window.addEventListener("resize", fitScale);
  fitScale();

  const scaleCanvas = () => {
    const scale = Math.min(
      window.innerWidth * 0.95 / can.width,
      window.innerHeight * 0.75 / can.height,
      1
    );
    can.style.width = `${can.width * scale}px`;
    can.style.height = `${can.height * scale}px`;
    rect = null;
  };
  window.addEventListener("resize", scaleCanvas);
  scaleCanvas();

  /* TIMER */
  let tStart = 0, tHandle = 0, ticking = false;
  const startTimer = () => {
    if (ticking) return;
    ticking = true; tStart = Date.now();
    tHandle = setInterval(() => {
      const sec = Math.floor((Date.now() - tStart) / 1000);
      timeEl.textContent = `Time: ${Math.floor(sec/60)}:${String(sec%60).padStart(2,"0")}`;
    }, 1000);
  };
  let elapsed = 0;
  const stopTimer = () => { clearInterval(tHandle); ticking = false; elapsed = Math.floor((Date.now() - tStart) / 1000); };

  /* STATE */
  const correct = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  const wrong   = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  let hoverX=-1, hoverY=-1, dragging=false, btn=0;
  let solved=false, fadeStart=0;
  let remaining = grid.flat().filter(Boolean).length;
  let rect;
  const solvedYet = () => remaining === 0;

  const showBanner = () => {
    const d = document.createElement("div");
    d.textContent = "🎉 Congratulations!";
    d.style.cssText = "position:absolute;left:50%;top:100%;transform:translate(-50%,8px);padding:8px 16px;background:#57F287;color:#23272A;font-weight:bold;border-radius:8px;white-space:nowrap;text-align:center;";
    wrap.appendChild(d);
  };

  /* DRAWER */
  const draw = alpha => {
    ctx.clearRect(0,0,can.width,can.height);

    // sprite fade‑in
    ctx.save(); ctx.imageSmoothingEnabled=false; ctx.globalAlpha=1-alpha;
    ctx.drawImage(sprite, LEFT, TOP, COLS*CELL, ROWS*CELL); ctx.restore();

    ctx.save(); ctx.globalAlpha=alpha;
    ctx.fillStyle=swirlPat; ctx.globalAlpha*=.25; ctx.fillRect(0,0,can.width,can.height); ctx.globalAlpha=alpha;

    ctx.fillStyle=COLOR.clueBg;
    ctx.fillRect(0,0,LEFT-2,TOP-2);
    rowClues.forEach((_,y)=>ctx.fillRect(0,TOP+y*CELL,LEFT-2,CELL));
    colClues.forEach((_,x)=>ctx.fillRect(LEFT+x*CELL,0,CELL,TOP-2));

    ctx.fillStyle=COLOR.empty;
    ctx.fillRect(LEFT,TOP,COLS*CELL,ROWS*CELL);

    ctx.fillStyle=COLOR.filled;
    correct.forEach((row,y)=>row.forEach((v,x)=>{ if(v) ctx.fillRect(LEFT+x*CELL,TOP+y*CELL,CELL,CELL); }));

    ctx.strokeStyle=COLOR.wrong; ctx.lineWidth=4;
    wrong.forEach((row,y)=>row.forEach((v,x)=>{ if(v){ const px=LEFT+x*CELL, py=TOP+y*CELL; ctx.beginPath(); ctx.moveTo(px+10,py+10); ctx.lineTo(px+CELL-10,py+CELL-10); ctx.moveTo(px+CELL-10,py+10); ctx.lineTo(px+10,py+CELL-10); ctx.stroke(); } }));

    if(!solved && hoverX>=0&&hoverY>=0){
      ctx.fillStyle=COLOR.hover;
      ctx.fillRect(LEFT,TOP+hoverY*CELL,COLS*CELL,CELL);
      ctx.fillRect(LEFT+hoverX*CELL,TOP,CELL,ROWS*CELL);
    }

    ctx.strokeStyle=COLOR.grid; ctx.lineWidth=1;
    for(let i=0;i<=ROWS;i++){ const y=TOP+i*CELL; ctx.beginPath(); ctx.moveTo(LEFT,y); ctx.lineTo(LEFT+COLS*CELL,y); ctx.stroke(); }
    for(let i=0;i<=COLS;i++){ const x=LEFT+i*CELL; ctx.beginPath(); ctx.moveTo(x,TOP); ctx.lineTo(x,TOP+ROWS*CELL); ctx.stroke(); }

    ctx.lineWidth=3;
    for(let i=5;i<ROWS;i+=5){ const y=TOP+i*CELL; ctx.beginPath(); ctx.moveTo(LEFT,y); ctx.lineTo(LEFT+COLS*CELL,y); ctx.stroke(); }
    for(let i=5;i<COLS;i+=5){ const x=LEFT+i*CELL; ctx.beginPath(); ctx.moveTo(x,TOP); ctx.lineTo(x,TOP+ROWS*CELL); ctx.stroke(); }

    ctx.strokeStyle=COLOR.border; ctx.lineWidth=4;
    ctx.strokeRect(LEFT-2,TOP-2,COLS*CELL+4,ROWS*CELL+4);

    ctx.font=`bold ${CLUE}px monospace`; ctx.fillStyle=COLOR.clueText;
    ctx.textAlign="right"; ctx.textBaseline="middle";
    rowCluesRev.forEach((nums,y)=>{ const cy=TOP+y*CELL+CELL/2; nums.forEach((n,i)=> ctx.fillText(n,LEFT-i*CLUE-8,cy)); });

    ctx.textAlign="center"; ctx.textBaseline="bottom";
    colCluesRev.forEach((nums,x)=>{ const cx=LEFT+x*CELL+CELL/2; nums.forEach((n,i)=> ctx.fillText(n,cx,TOP-i*CLUE-8)); });

    ctx.restore();
  };

  const tick = () => {
    const alpha = solved ? Math.max(0,1-((performance.now()-fadeStart)/FADE)) : 1;
    draw(alpha);
    if(solved && alpha>0) requestAnimationFrame(tick);
  };
  draw(1);

  /* INPUT */
  const flip = (x, y, b) => {
    if (b === 2) {           // right‑click toggles X (unless already correct)
      if (correct[y][x]) return;
      wrong[y][x] = !wrong[y][x];
    } else {                 // left‑click attempts to fill
      if (grid[y][x]) {
        if (!correct[y][x]) {
          correct[y][x] = true;
          remaining--;
        }
        wrong[y][x] = false;
      } else {
        wrong[y][x] = true;
      }
    }
  };

  can.addEventListener("contextmenu", e => e.preventDefault());
  const updateHover = e => {
    rect = rect || can.getBoundingClientRect();
    const scaleX = can.width / rect.width;
    const scaleY = can.height / rect.height;
    const x = Math.floor(((e.clientX - rect.left) * scaleX - LEFT) / CELL);
    const y = Math.floor(((e.clientY - rect.top)  * scaleY - TOP)  / CELL);
    if (x >= 0 && y >= 0 && x < COLS && y < ROWS) { hoverX = x; hoverY = y; }
    else { hoverX = hoverY = -1; }
  };

  /* mouse move */
  can.addEventListener("mousemove", e => {
    updateHover(e);
    if (dragging && !solved && hoverX >= 0 && hoverY >= 0) {
      flip(hoverX, hoverY, btn);
      if (solvedYet()) {
        solved = true;
        stopTimer();
        fadeStart = performance.now();
        can.style.pointerEvents = "none";
        titleEl.style.display = "block";   // reveal name
        showBanner();
      }
    }
    tick();
  });

  /* mouse down */
  can.addEventListener("mousedown", e => {
    if (solved) return;
    rect = can.getBoundingClientRect();
    updateHover(e);
    if (hoverX < 0 || hoverY < 0) return;

    startTimer();
    dragging = true; btn = e.button;
    flip(hoverX, hoverY, btn);

    if (solvedYet()) {
      solved = true;
      stopTimer();
      fadeStart = performance.now();
      can.style.pointerEvents = "none";
      const totalSec = Math.floor((Date.now() - tStart) / 1000);
      submitTime(totalSec).catch(console.error);
      titleEl.style.display = "block";
    }
    tick();
  });

  async function loadBoard() {
  const q = query(
    collection(db, "scores"),
    where("guildId", "==", guildId),
    where("puzzleId", "==", PUZZLE_ID),
    orderBy("seconds"),
    limit(10)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data());
}

  const board = await loadBoard();
hud.appendChild(renderBoard(board));

if (!board.some(e => e.userId === me.id)) {
  const ref = doc(db, "scores", `${guildId}_${PUZZLE_ID}_${me.id}`);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const e = snap.data();
    const soloScore = document.createElement("div");
    soloScore.textContent = `Your time: ${Math.floor(e.seconds/60)}:${String(e.seconds%60).padStart(2, '0')}`;
    soloScore.style.cssText = "margin-top:6px;font:14px monospace;color:white;background:#333;padding:4px 10px;border-radius:6px;";
    hud.appendChild(soloScore);
  }
}


  function renderBoard(arr) {
    const box = document.createElement("div");
    box.style.cssText = `
      margin-top:6px; background:rgba(0,0,0,0.6); padding:6px 12px;
      font:14px monospace; border-radius:8px; color:white;
    `;
    box.innerHTML = arr.length
      ? arr.map((r,i) => `${i+1}. ${r.username} – ${Math.floor(r.seconds/60)}:${String(r.seconds%60).padStart(2,'0')}`).join("<br>")
      : "No scores yet";
    return box;
  }


  window.addEventListener("mouseup",   () => { dragging = false; });
  can   .addEventListener("mouseleave", () => { hoverX = hoverY = -1; dragging = false; tick(); });
}

initDiscord().then(view).catch(console.error);

