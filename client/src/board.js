import logo from "../TitleLogo_en.png";
import nanoda from "../nanoda.png";
import { COLOR } from "./constants.js";
import { computeLayout } from "./layout.js";
import { createTimer } from "./timer.js";
import { initDiscord, postTime, scores, participants } from "./discord-lite.js";


export async function createBoard(puzzle) {
  await initDiscord();
  const {
    id,
    grid,
    rows,
    cols,
    rowClues,
    colClues,
    rowCluesRev,
    colCluesRev,
    maxRow,
    maxCol,
  } = puzzle;
  const { CELL, CLUE, LEFT, TOP } = computeLayout(rows, cols, maxRow, maxCol);

  let rect = null;
  const swirl = new Image();
  swirl.src = nanoda;
  const img = new Image();
  img.src = `${id}.png`;
  await Promise.all([img.decode(), swirl.decode()]);

  const sprite = document.createElement("canvas");
  sprite.width = cols;
  sprite.height = rows;
  sprite.getContext("2d").drawImage(img, 0, 0, cols, rows);
  const swirlPat = document
    .createElement("canvas")
    .getContext("2d")
    .createPattern(swirl, "repeat");

  const app = document.querySelector("#app");
  app.innerHTML = `<div style="text-align:center;margin-top:12px"><img src="${logo}" class="logo"></div>`;
  const wrap = document.createElement("div");
  wrap.style.cssText = "margin:12px auto 0;position:relative;width:fit-content;";
  app.appendChild(wrap);

  const hud = document.createElement("div");
  hud.style.cssText =
    "position:absolute;top:8px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:4px;pointer-events:none;";
  wrap.appendChild(hud);

  const titleEl = document.createElement("div");
  titleEl.textContent = `Puzzle: ${id}`;
  titleEl.style.cssText =
    "display:none;font:700 20px monospace;color:#fff;background:rgba(0,0,0,.65);padding:2px 8px;border-radius:4px;text-shadow:0 0 6px #000;";
  hud.appendChild(titleEl);

  const timeEl = document.createElement("div");
  timeEl.textContent = "Time: 0:00";
  timeEl.style.cssText =
    "font:600 18px monospace;color:#fff;background:rgba(0,0,0,.65);padding:2px 8px;border-radius:4px;text-shadow:0 0 6px #000;";
  hud.appendChild(timeEl);

    /* ---------- LEADERBOARD HUD ---------- */
  const lb = document.createElement("div");
  lb.style.cssText =
    "min-width:140px;font:14px monospace;color:#fff;background:rgba(0,0,0,.65);" +
    "padding:2px 8px;border-radius:4px;text-shadow:0 0 6px #000;";
  hud.appendChild(lb);

  function renderLeaderboard() {
    const rows = [...scores.entries()]
      .sort((a, b) => a[1] - b[1])                         // lowest time first
      .map(([id, ms], i) =>
        `${String(i + 1).padStart(2, "0")}. ${
          participants.get(id)?.username ?? id.slice(0, 4)
        }  ${(ms / 1000).toFixed(1)}s`
      )
      .join("<br>");
    lb.innerHTML = rows || "⏳ no times yet";
  }
  // let discord-lite call this whenever it hears a new score
  window.renderLeaderboard = renderLeaderboard;
  renderLeaderboard();

  const { startTimer, stopTimer } = createTimer((ms) => {
    const sec = Math.floor(ms / 1000);
    timeEl.textContent = `Time: ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
  });

  const can = document.createElement("canvas");
  can.width = LEFT + cols * CELL + 4;
  can.height = TOP + rows * CELL + 4;
  wrap.appendChild(can);
  const ctx = can.getContext("2d");

  let hoverX = -1,
    hoverY = -1,
    dragging = false,
    btn = 0;
  let solved = false,
    fadeStart = 0;
  const correct = Array.from({ length: rows }, () => Array(cols).fill(false));
  const wrong = Array.from({ length: rows }, () => Array(cols).fill(false));
  let remaining = grid.flat().filter(Boolean).length;
  const solvedYet = () => remaining === 0;

  const showBanner = () => {
    const d = document.createElement("div");
    d.textContent = "🎉 Congratulations!";
    d.style.cssText =
      "position:absolute;left:50%;top:100%;transform:translate(-50%,8px);padding:8px 16px;background:#57F287;color:#23272A;font-weight:bold;border-radius:8px;white-space:nowrap;text-align:center;";
    wrap.appendChild(d);
  };

  const draw = (alpha) => {
    ctx.clearRect(0, 0, can.width, can.height);

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 1 - alpha;
    ctx.drawImage(sprite, LEFT, TOP, cols * CELL, rows * CELL);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = swirlPat;
    ctx.globalAlpha *= 0.25;
    ctx.fillRect(0, 0, can.width, can.height);
    ctx.globalAlpha = alpha;

    ctx.fillStyle = COLOR.clueBg;
    ctx.fillRect(0, 0, LEFT - 2, TOP - 2);
    rowClues.forEach((_, y) => ctx.fillRect(0, TOP + y * CELL, LEFT - 2, CELL));
    colClues.forEach((_, x) => ctx.fillRect(LEFT + x * CELL, 0, CELL, TOP - 2));

    ctx.fillStyle = COLOR.empty;
    ctx.fillRect(LEFT, TOP, cols * CELL, rows * CELL);

    ctx.fillStyle = COLOR.filled;
    correct.forEach((row, y) =>
      row.forEach((v, x) => {
        if (v) ctx.fillRect(LEFT + x * CELL, TOP + y * CELL, CELL, CELL);
      })
    );

    ctx.strokeStyle = COLOR.wrong;
    ctx.lineWidth = 4;
    wrong.forEach((row, y) =>
      row.forEach((v, x) => {
        if (v) {
          const px = LEFT + x * CELL,
            py = TOP + y * CELL;
          ctx.beginPath();
          ctx.moveTo(px + 10, py + 10);
          ctx.lineTo(px + CELL - 10, py + CELL - 10);
          ctx.moveTo(px + CELL - 10, py + 10);
          ctx.lineTo(px + 10, py + CELL - 10);
          ctx.stroke();
        }
      })
    );

    if (!solved && hoverX >= 0 && hoverY >= 0) {
      ctx.fillStyle = COLOR.hover;
      ctx.fillRect(LEFT, TOP + hoverY * CELL, cols * CELL, CELL);
      ctx.fillRect(LEFT + hoverX * CELL, TOP, CELL, rows * CELL);
    }

    ctx.strokeStyle = COLOR.grid;
    ctx.lineWidth = 1;
    for (let i = 0; i <= rows; i++) {
      const y = TOP + i * CELL;
      ctx.beginPath();
      ctx.moveTo(LEFT, y);
      ctx.lineTo(LEFT + cols * CELL, y);
      ctx.stroke();
    }
    for (let i = 0; i <= cols; i++) {
      const x = LEFT + i * CELL;
      ctx.beginPath();
      ctx.moveTo(x, TOP);
      ctx.lineTo(x, TOP + rows * CELL);
      ctx.stroke();
    }

    ctx.lineWidth = 3;
    for (let i = 5; i < rows; i += 5) {
      const y = TOP + i * CELL;
      ctx.beginPath();
      ctx.moveTo(LEFT, y);
      ctx.lineTo(LEFT + cols * CELL, y);
      ctx.stroke();
    }
    for (let i = 5; i < cols; i += 5) {
      const x = LEFT + i * CELL;
      ctx.beginPath();
      ctx.moveTo(x, TOP);
      ctx.lineTo(x, TOP + rows * CELL);
      ctx.stroke();
    }

    ctx.strokeStyle = COLOR.border;
    ctx.lineWidth = 4;
    ctx.strokeRect(LEFT - 2, TOP - 2, cols * CELL + 4, rows * CELL + 4);

    ctx.font = `bold ${CLUE}px monospace`;
    ctx.fillStyle = COLOR.clueText;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    rowCluesRev.forEach((nums, y) => {
      const cy = TOP + y * CELL + CELL / 2;
      nums.forEach((n, i) => ctx.fillText(n, LEFT - i * CLUE - 8, cy));
    });

    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    colCluesRev.forEach((nums, x) => {
      const cx = LEFT + x * CELL + CELL / 2;
      nums.forEach((n, i) => ctx.fillText(n, cx, TOP - i * CLUE - 8));
    });

    ctx.restore();
  };

  const tick = () => {
    const alpha = solved ? Math.max(0, 1 - (performance.now() - fadeStart) / 1000) : 1;
    draw(alpha);
    if (solved && alpha > 0) requestAnimationFrame(tick);
  };
  draw(1);

  const flip = (x, y, b) => {
    if (b === 2) {
      if (correct[y][x]) return;
      wrong[y][x] = !wrong[y][x];
    } else {
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

  can.addEventListener("contextmenu", (e) => e.preventDefault());
  const updateHover = (e) => {
    rect = rect || can.getBoundingClientRect();
    const scaleX = can.width / rect.width;
    const scaleY = can.height / rect.height;
    const x = Math.floor(((e.clientX - rect.left) * scaleX - LEFT) / CELL);
    const y = Math.floor(((e.clientY - rect.top) * scaleY - TOP) / CELL);
    if (x >= 0 && y >= 0 && x < cols && y < rows) {
      hoverX = x;
      hoverY = y;
    } else {
      hoverX = hoverY = -1;
    }
  };

  can.addEventListener("mousemove", (e) => {
    updateHover(e);
    if (dragging && !solved && hoverX >= 0 && hoverY >= 0) {
      flip(hoverX, hoverY, btn);
      if (solvedYet()) {
        solved = true;
        const ms = stopTimer();
        postTime(ms);                  // broadcast to the lobby!
        titleEl.style.display = "block";
        fadeStart = performance.now();
        can.style.pointerEvents = "none";
        titleEl.style.display = "block";
        showBanner();
      }
    }
    tick();
  });

  can.addEventListener("mousedown", (e) => {
    if (solved) return;
    rect = can.getBoundingClientRect();
    updateHover(e);
    if (hoverX < 0 || hoverY < 0) return;

    startTimer();
    dragging = true;
    btn = e.button;
    flip(hoverX, hoverY, btn);

    if (solvedYet()) {
      solved = true;
      const ms = stopTimer();
      postTime(ms);
+      renderLeaderboard();
      fadeStart = performance.now();
      can.style.pointerEvents = "none";
      titleEl.style.display = "block";
      showBanner();
    }
    tick();
  });

  window.addEventListener("mouseup", () => {
    dragging = false;
  });
  can.addEventListener("mouseleave", () => {
    hoverX = hoverY = -1;
    dragging = false;
    tick();
  });

  return wrap;
}
