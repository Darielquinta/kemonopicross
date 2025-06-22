import { DiscordSDK } from "@discord/embedded-app-sdk";
import logo from "/TitleLogo_en.png";
import nanoda from "/nanoda.png";
import "./style.css";

let auth;

const PATTERN = [
  "oooxxoxxoo",
  "ooxxxxxxoo",
  "oxooxooxoo",
  "oxoooooxox",
  "xoxoxoooxx",
  "xoooooooxo",
  "xxxxxxxxxx",
  "xoxxooooxo",
  "oxoooooxxx",
  "xoxxxxxxoo",
];
const ROWS = PATTERN.length;
const COLS = PATTERN[0].length;
const CELL_PX = 69;
const patternGrid = PATTERN.map(r => [...r].map(c => c === "x"));

const streaks = arr => {
  const out = [];
  let run = 0;
  arr.forEach(v => {
    if (v) run++;
    else if (run) { out.push(run); run = 0; }
  });
  if (run) out.push(run);
  return out.length ? out : [0];
};

const rowClues = patternGrid.map(streaks);
const colClues = Array.from({ length: COLS }, (_, x) => streaks(patternGrid.map(r => r[x])));
const MAX_ROW_HINTS = Math.max(...rowClues.map(c => c.length));
const MAX_COL_HINTS = Math.max(...colClues.map(c => c.length));

const CLUE_PX = 22;
const LEFT_PAD = MAX_ROW_HINTS * CLUE_PX + 12;
const TOP_PAD = MAX_COL_HINTS * CLUE_PX + 12;

const COLORS = {
  clueBg: "#fff9e6",
  clueText: "#0066d6",
  empty: "#ccd6fb",
  filled: "#00d9aa",
  grid: "#96a0ad",
  border: "#de8d2f",
  hover: "rgba(21,132,93,0.25)",
  wrong: "#ff0000",
};

async function picrossView() {
  const app = document.querySelector("#app");
  app.innerHTML = `<div id="splash" style="text-align:center;margin-top:12px;"><img src="${logo}" alt="Picross" style="max-width:90%;height:auto"/></div>`;
  const holder = document.createElement("div");
  holder.id = "board-holder";
  holder.style.marginTop = "12px";
  app.appendChild(holder);

  const swirlImg = new Image(); swirlImg.src = nanoda; await swirlImg.decode();
  const swirlPattern = document.createElement("canvas").getContext("2d").createPattern(swirlImg, "repeat");

  const canvas = document.createElement("canvas");
  canvas.id = "picrossCanvas";
  canvas.width = LEFT_PAD + COLS * CELL_PX + 4;
  canvas.height = TOP_PAD + ROWS * CELL_PX + 4;
  holder.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  const correct = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  const wrong = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  let dragging = false;
  let mode = null; // 'correct' or 'wrong'

  canvas.addEventListener('contextmenu', e => e.preventDefault());

  function draw(hover = null) {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.save(); ctx.fillStyle = swirlPattern; ctx.globalAlpha = .25; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.restore();
    ctx.fillStyle = COLORS.clueBg;
    ctx.fillRect(0,0,LEFT_PAD-2,TOP_PAD-2);
    rowClues.forEach((_, y) => ctx.fillRect(0, TOP_PAD+y*CELL_PX, LEFT_PAD-2, CELL_PX));
    colClues.forEach((_, x) => ctx.fillRect(LEFT_PAD+x*CELL_PX, 0, CELL_PX, TOP_PAD-2));
    ctx.fillStyle = COLORS.empty;
    ctx.fillRect(LEFT_PAD, TOP_PAD, COLS*CELL_PX, ROWS*CELL_PX);
    ctx.fillStyle = COLORS.filled;
    correct.forEach((row,y) => row.forEach((v,x) => { if(v) ctx.fillRect(LEFT_PAD+x*CELL_PX, TOP_PAD+y*CELL_PX, CELL_PX, CELL_PX); }));
    ctx.strokeStyle = COLORS.wrong;
    ctx.lineWidth = 4;
    wrong.forEach((row,y) => row.forEach((v,x) => {
      if(v) {
        const px = LEFT_PAD+x*CELL_PX, py = TOP_PAD+y*CELL_PX;
        ctx.beginPath(); ctx.moveTo(px+10,py+10); ctx.lineTo(px+CELL_PX-10,py+CELL_PX-10);
        ctx.moveTo(px+CELL_PX-10,py+10); ctx.lineTo(px+10,py+CELL_PX-10);
        ctx.stroke();
      }
    }));
    if(hover) {
      const {x,y} = hover;
      ctx.fillStyle = COLORS.hover;
      ctx.fillRect(LEFT_PAD+x*CELL_PX, TOP_PAD, CELL_PX, ROWS*CELL_PX);
      ctx.fillRect(LEFT_PAD, TOP_PAD+y*CELL_PX, COLS*CELL_PX, CELL_PX);
    }
    ctx.strokeStyle = COLORS.grid; ctx.lineWidth = 1;
    for(let i=0;i<=ROWS;i++){ const y=TOP_PAD+i*CELL_PX; ctx.beginPath(); ctx.moveTo(LEFT_PAD,y); ctx.lineTo(LEFT_PAD+COLS*CELL_PX,y); ctx.stroke(); }
    for(let i=0;i<=COLS;i++){ const x=LEFT_PAD+i*CELL_PX; ctx.beginPath(); ctx.moveTo(x,TOP_PAD); ctx.lineTo(x,TOP_PAD+ROWS*CELL_PX); ctx.stroke(); }
    ctx.lineWidth = 3;
    for(let i=5;i<ROWS-1;i+=5){ const y=TOP_PAD+i*CELL_PX; ctx.beginPath(); ctx.moveTo(LEFT_PAD,y); ctx.lineTo(LEFT_PAD+COLS*CELL_PX,y); ctx.stroke(); }
    for(let i=5;i<COLS-1;i+=5){ const x=LEFT_PAD+i*CELL_PX; ctx.beginPath(); ctx.moveTo(x,TOP_PAD); ctx.lineTo(x,TOP_PAD+ROWS*CELL_PX); ctx.stroke(); }
    ctx.strokeStyle = COLORS.border; ctx.lineWidth = 4;
    ctx.strokeRect(LEFT_PAD-2, TOP_PAD-2, COLS*CELL_PX+4, ROWS*CELL_PX+4);
    ctx.font = `bold ${CLUE_PX}px monospace`;
    ctx.fillStyle = COLORS.clueText;
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    rowClues.forEach((nums,y) => { const cy=TOP_PAD+y*CELL_PX+CELL_PX/2; nums.slice().reverse().forEach((n,i) => ctx.fillText(n, LEFT_PAD-i*CLUE_PX-8, cy)); });
    ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    colClues.forEach((nums,x) => { const cx=LEFT_PAD+x*CELL_PX+CELL_PX/2; nums.slice().reverse().forEach((n,i) => ctx.fillText(n, cx, TOP_PAD-i*CLUE_PX-8)); });
  }

  const isSolved = () => patternGrid.every((r,y) => r.every((v,x) => v ? correct[y][x] : true));
  const showCongrats = () => { const d=document.createElement('div'); d.textContent='🎉 Congratulations!'; d.style='margin-top:12px;padding:8px 16px;background:#57F287;color:#23272A;font-weight:bold;border-radius:8px;text-align:center;'; holder.appendChild(d); };

  function applyCell(x,y) {
    if (patternGrid[y][x]) correct[y][x] = true;
    else wrong[y][x] = true;
  }

  canvas.addEventListener('mousedown', e => {
    e.preventDefault(); const r=canvas.getBoundingClientRect(); const x=Math.floor((e.clientX-r.left-LEFT_PAD)/CELL_PX); const y=Math.floor((e.clientY-r.top-TOP_PAD)/CELL_PX);
    if(x<0||y<0||x>=COLS||y>=ROWS) return;
    dragging = true;
    mode = e.button === 2 ? 'wrong' : 'correct';
    applyCell(x,y);
    draw({x,y}); if(isSolved()){canvas.style.pointerEvents='none'; showCongrats();}
  });

  canvas.addEventListener('mousemove', e => {
    const r=canvas.getBoundingClientRect(); const x=Math.floor((e.clientX-r.left-LEFT_PAD)/CELL_PX); const y=Math.floor((e.clientY-r.top-TOP_PAD)/CELL_PX);
    if (dragging && x>=0 && y>=0 && x<COLS && y<ROWS) { applyCell(x,y); draw({x,y}); }
    else if (!dragging) { if(x>=0&&y>=0&&x<COLS&&y<ROWS) draw({x,y}); else draw(); }
  });

  canvas.addEventListener('mouseup', () => { dragging=false; mode=null; });

  draw();
}

// const discordSdk = new DiscordSDK(import.meta.env.VITE_DISCORD_CLIENT_ID);
// (async() => {
//   await discordSdk.ready();
//   const { code } = await discordSdk.commands.authorize({ client_id:import.meta.env.VITE_DISCORD_CLIENT_ID, response_type:'code', prompt:'none', scope:['identify','guilds','applications.commands'] });
//   const { access_token } = await (await fetch('/.proxy/api/token',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({code}) })).json();
//   auth = await discordSdk.commands.authenticate({ access_token });
//   if (!auth) throw new Error('Auth failed');
//   await picrossView();
// })();

picrossView();
