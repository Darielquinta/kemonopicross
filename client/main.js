// Picross daily – row/column hover highlight restored
// -----------------------------------------------------------------------------
//  • Adds translucent highlight strip (COLOR.hover) on the row and column under
//    the cursor, only while the puzzle is unsolved.
//  • Works during hover AND drag.
// -----------------------------------------------------------------------------
import { DiscordSDK } from "@discord/embedded-app-sdk";
import logo        from "/TitleLogo_en.png";
import nanoda      from "/nanoda.png";
import "./style.css";
import ALL_PATTERNS from "./newpatterns.json";

// ───────── DATE / PATTERN ─────────
const MS_DAY = 86_400_000;
const start  = new Date(2025, 0, 1);
const idx    = Math.floor((Date.now() - start) / MS_DAY) % ALL_PATTERNS.length;
const CURRENT = ALL_PATTERNS[idx];
const PATTERN = CURRENT.pattern;
const PUZZLE_ID = CURRENT.id;

// ───────── DIMENSIONS ─────────
const ROWS = PATTERN.length;
const COLS = PATTERN[0].length;
const CELL = 69;
const CLUE = 22;
const FADE = 1000;

// ───────── PALETTE ─────────
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

// helpers
const grid = PATTERN.map(r=>[...r].map(c=>c==='x'));
const runs = arr => {
  const out = [];
  let run = 0;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i]) run++; else if (run) { out.push(run); run = 0; }
  }
  if (run) out.push(run);
  if (!out.length) out.push(0);
  return out;
};
const rowClues = grid.map(runs);
const colClues = Array.from({length:COLS},(_,x)=>runs(grid.map(r=>r[x])));
const MAX_ROW = Math.max(...rowClues.map(a=>a.length));
const MAX_COL = Math.max(...colClues.map(a=>a.length));
const LEFT = MAX_ROW*CLUE + 12;
const TOP  = MAX_COL*CLUE + 12;

async function view(){
  const swirl = new Image(); swirl.src = nanoda;
  const img = new Image(); 
  img.src = `/${PUZZLE_ID}.png`;
  await Promise.all([swirl.decode(),img.decode()]);
  const sprite = document.createElement('canvas'); sprite.width=COLS; sprite.height=ROWS;
  const sctx = sprite.getContext('2d'); sctx.imageSmoothingEnabled=true; sctx.drawImage(img,0,0,COLS,ROWS);
  const swirlPat = document.createElement('canvas').getContext('2d').createPattern(swirl,'repeat');

  const app=document.querySelector('#app');
  app.innerHTML = `<div style="text-align:center;margin-top:12px"><img src="${logo}" style="max-width:90%"></div>`;
  const wrap=document.createElement('div'); wrap.style.cssText='margin-top:12px;position:relative;display:inline-block;'; app.appendChild(wrap);
  const can=document.createElement('canvas'); can.width=LEFT+COLS*CELL+4; can.height=TOP+ROWS*CELL+4; wrap.appendChild(can);
  const ctx=can.getContext('2d');

  const title = document.createElement('div');
  title.textContent = `Puzzle: ${PUZZLE_ID}`;
  title.style.cssText = `
  font-weight: bold;
  font-family: monospace;
  font-size: 18px;
  margin-top: 4px;
  margin-bottom: 8px;
  color: #333;
  text-align: center;
  `;
  app.appendChild(title);


  const correct=Array.from({length:ROWS},()=>Array(COLS).fill(false));
  const wrong  =Array.from({length:ROWS},()=>Array(COLS).fill(false));
  let dragging=false, btn=0, solved=false, t0=0;
  let hoverX=-1, hoverY=-1;

  const solvedYet=()=>grid.every((r,y)=>r.every((v,x)=>v?correct[y][x]:true));
  const banner=()=>{const d=document.createElement('div');d.textContent='🎉 Congratulations!';d.style.cssText='position:absolute;left:50%;top:100%;transform:translate(-50%,8px);padding:8px 16px;background:#57F287;color:#23272A;font-weight:bold;border-radius:8px;white-space:nowrap;text-align:center;';wrap.appendChild(d);};

  const draw=(a)=>{
    ctx.clearRect(0,0,can.width,can.height);
    // coloured sprite
    ctx.save(); ctx.imageSmoothingEnabled=false; ctx.globalAlpha=1-a; ctx.drawImage(sprite,LEFT,TOP,COLS*CELL,ROWS*CELL); ctx.restore();
    // board
    ctx.save(); ctx.globalAlpha=a;
    ctx.fillStyle=swirlPat; ctx.globalAlpha*=.25; ctx.fillRect(0,0,can.width,can.height); ctx.globalAlpha=a;
    ctx.fillStyle=COLOR.clueBg; ctx.fillRect(0,0,LEFT-2,TOP-2);
    rowClues.forEach((_,y)=>ctx.fillRect(0,TOP+y*CELL,LEFT-2,CELL));
    colClues.forEach((_,x)=>ctx.fillRect(LEFT+x*CELL,0,CELL,TOP-2));
    ctx.fillStyle=COLOR.empty; ctx.fillRect(LEFT,TOP,COLS*CELL,ROWS*CELL);
    ctx.fillStyle=COLOR.filled; correct.forEach((row,y)=>row.forEach((v,x)=>{if(v)ctx.fillRect(LEFT+x*CELL,TOP+y*CELL,CELL,CELL);}));
    ctx.strokeStyle=COLOR.wrong; ctx.lineWidth=4; wrong.forEach((row,y)=>row.forEach((v,x)=>{if(v){const px=LEFT+x*CELL,py=TOP+y*CELL;ctx.beginPath();ctx.moveTo(px+10,py+10);ctx.lineTo(px+CELL-10,py+CELL-10);ctx.moveTo(px+CELL-10,py+10);ctx.lineTo(px+10,py+CELL-10);ctx.stroke();}}));

    // hover highlight
    if(!solved && hoverX>=0 && hoverY>=0){
      ctx.fillStyle=COLOR.hover;
      ctx.fillRect(LEFT, TOP+hoverY*CELL, COLS*CELL, CELL);
      ctx.fillRect(LEFT+hoverX*CELL, TOP, CELL, ROWS*CELL);
    }

    // grid lines
    ctx.strokeStyle=COLOR.grid; ctx.lineWidth=1; for(let i=0;i<=ROWS;i++){const y=TOP+i*CELL;ctx.beginPath();ctx.moveTo(LEFT,y);ctx.lineTo(LEFT+COLS*CELL,y);ctx.stroke();} for(let i=0;i<=COLS;i++){const x=LEFT+i*CELL;ctx.beginPath();ctx.moveTo(x,TOP);ctx.lineTo(x,TOP+ROWS*CELL);ctx.stroke();}
    ctx.lineWidth=3; for(let i=5;i<ROWS;i+=5){const y=TOP+i*CELL;ctx.beginPath();ctx.moveTo(LEFT,y);ctx.lineTo(LEFT+COLS*CELL,y);ctx.stroke();} for(let i=5;i<COLS;i+=5){const x=LEFT+i*CELL;ctx.beginPath();ctx.moveTo(x,TOP);ctx.lineTo(x,TOP+ROWS*CELL);ctx.stroke();}
    ctx.strokeStyle=COLOR.border; ctx.lineWidth=4; ctx.strokeRect(LEFT-2,TOP-2,COLS*CELL+4,ROWS*CELL+4);
    ctx.font=`bold ${CLUE}px monospace`; ctx.fillStyle=COLOR.clueText;
    ctx.textAlign='right'; ctx.textBaseline='middle'; rowClues.forEach((nums,y)=>{const cy=TOP+y*CELL+CELL/2;nums.slice().reverse().forEach((n,i)=>ctx.fillText(n,LEFT-i*CLUE-8,cy));});
    ctx.textAlign='center'; ctx.textBaseline='bottom'; colClues.forEach((nums,x)=>{const cx=LEFT+x*CELL+CELL/2;nums.slice().reverse().forEach((n,i)=>ctx.fillText(n,cx,TOP-i*CLUE-8));});
    ctx.restore();
  };

  const tick=()=>{const a=solved?Math.max(0,1-((performance.now()-t0)/FADE)):1;draw(a);if(solved&&a>0)requestAnimationFrame(tick);} ;
  draw(1);

  const flip=(x,y,b)=>{ if(b===2){ if(correct[y][x])return; wrong[y][x]=!wrong[y][x]; } else { if(grid[y][x]){correct[y][x]=true;wrong[y][x]=false;} else wrong[y][x]=true; } };
  can.addEventListener('contextmenu',e=>e.preventDefault());
  const updateHover=(e)=>{const rect=can.getBoundingClientRect(); const x=Math.floor((e.clientX-rect.left-LEFT)/CELL); const y=Math.floor((e.clientY-rect.top-TOP)/CELL); if(x>=0&&y>=0&&x<COLS&&y<ROWS){hoverX=x;hoverY=y;}else{hoverX=hoverY=-1;}};

  can.addEventListener('mousemove',e=>{
    updateHover(e);
    if(dragging&&!solved){const x=hoverX,y=hoverY;if(x>=0&&y>=0){flip(x,y,btn);if(solvedYet()){solved=true;t0=performance.now();can.style.pointerEvents='none';banner();} }}
    tick();
  });

  can.addEventListener('mousedown',e=>{if(solved)return; updateHover(e); const x=hoverX,y=hoverY; if(x<0||y<0)return; dragging=true;btn=e.button; flip(x,y,btn); if(solvedYet()){solved=true;t0=performance.now();can.style.pointerEvents='none';banner();} tick();});
  window.addEventListener('mouseup',()=>{dragging=false;});
  can.addEventListener('mouseleave',()=>{hoverX=hoverY=-1; tick(); dragging=false;});
}

view();