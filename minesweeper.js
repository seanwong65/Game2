export const DIFFICULTIES = {
  "8x8": { size: 8, mines: 10, label: "8×8 · 10 mines" },
  "15x15": { size: 15, mines: 40, label: "15×15 · 40 mines" },
};

export function createMinesweeper(ctx) {
  const {
    boardEl,
    turnIndicator,
    modeBadge,
    playersBar,
    scoreBar,
    resultEl,
    resultText,
    resultStats,
    escapeHtml,
    persistMinesweeper,
    formatWinRate,
    appRoot,
  } = ctx;

  let size = 8;
  let mineCount = 10;
  let difficultyKey = "8x8";
  let playerName = "";
  let mines = new Set();
  let revealed = new Set();
  let flagged = new Set();
  let counts = [];
  let gameOver = false;
  let won = false;
  let firstClick = true;
  let flagsPlaced = 0;

  function idx(r, c) {
    return r * size + c;
  }

  function neighbors(r, c) {
    const list = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < size && nc >= 0 && nc < size) list.push([nr, nc]);
      }
    }
    return list;
  }

  function placeMines(safeR, safeC) {
    const forbidden = new Set([idx(safeR, safeC)]);
    for (const [nr, nc] of neighbors(safeR, safeC)) {
      forbidden.add(idx(nr, nc));
    }

    const candidates = [];
    for (let i = 0; i < size * size; i++) {
      if (!forbidden.has(i)) candidates.push(i);
    }

    mines = new Set();
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    for (let i = 0; i < mineCount && i < candidates.length; i++) {
      mines.add(candidates[i]);
    }

    counts = Array(size * size).fill(0);
    for (const m of mines) {
      const r = Math.floor(m / size);
      const c = m % size;
      for (const [nr, nc] of neighbors(r, c)) {
        const ni = idx(nr, nc);
        if (!mines.has(ni)) counts[ni]++;
      }
    }
  }

  function updateHud() {
    const remaining = mineCount - flagsPlaced;
    scoreBar.innerHTML = `🚩 <span>${remaining}</span> mines left`;
    turnIndicator.textContent = gameOver
      ? won
        ? "Cleared!"
        : "BOOM!"
      : "Left-click reveal · Right-click flag";
  }

  function initBoard() {
    boardEl.className = `board board-minesweeper board-mines-${size}`;
    boardEl.innerHTML = "";
    appRoot?.classList.toggle("app-wide", size > 8);

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = document.createElement("button");
        cell.className = "cell cell-mine";
        cell.dataset.index = idx(r, c);
        cell.setAttribute("aria-label", `Cell ${r + 1}, ${c + 1}`);
        cell.addEventListener("click", (e) => {
          e.preventDefault();
          handleReveal(r, c);
        });
        cell.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          handleFlag(r, c);
        });
        boardEl.appendChild(cell);
      }
    }
  }

  function renderCells() {
    const cells = boardEl.querySelectorAll(".cell-mine");
    cells.forEach((cell, i) => {
      cell.className = "cell cell-mine";
      cell.textContent = "";
      cell.disabled = gameOver;

      if (revealed.has(i)) {
        cell.classList.add("revealed");
        if (mines.has(i)) {
          cell.classList.add("mine-hit");
          cell.textContent = "💣";
        } else if (counts[i] > 0) {
          cell.classList.add(`n${counts[i]}`);
          cell.textContent = String(counts[i]);
        }
      } else if (flagged.has(i)) {
        cell.classList.add("flagged");
        cell.textContent = "🚩";
      } else if (gameOver && mines.has(i)) {
        cell.classList.add("mine-show");
        cell.textContent = "💣";
      }
    });
    updateHud();
  }

  function checkWin() {
    if (revealed.size === size * size - mines.size) {
      won = true;
      gameOver = true;
      endGame(true);
    }
  }

  function revealCell(r, c) {
    const i = idx(r, c);
    if (revealed.has(i) || flagged.has(i) || gameOver) return;

    if (firstClick) {
      firstClick = false;
      placeMines(r, c);
    }

    if (mines.has(i)) {
      revealed.add(i);
      gameOver = true;
      won = false;
      renderCells();
      endGame(false);
      return;
    }

    const stack = [[r, c]];
    while (stack.length) {
      const [cr, cc] = stack.pop();
      const ci = idx(cr, cc);
      if (revealed.has(ci) || flagged.has(ci)) continue;
      revealed.add(ci);
      if (counts[ci] === 0) {
        for (const [nr, nc] of neighbors(cr, cc)) {
          if (!revealed.has(idx(nr, nc))) stack.push([nr, nc]);
        }
      }
    }
    renderCells();
    checkWin();
  }

  function handleReveal(r, c) {
    if (gameOver) return;
    revealCell(r, c);
  }

  function handleFlag(r, c) {
    if (gameOver || revealed.has(idx(r, c))) return;

    const i = idx(r, c);
    if (flagged.has(i)) {
      flagged.delete(i);
      flagsPlaced--;
    } else {
      flagged.add(i);
      flagsPlaced++;
    }
    renderCells();
  }

  async function endGame(didWin) {
    resultText.textContent = didWin
      ? `You cleared the ${DIFFICULTIES[difficultyKey].label} board!`
      : "Mine exploded — try again!";
    resultEl.classList.remove("hidden");

    const saved = await persistMinesweeper({
      playerName,
      difficulty: difficultyKey,
      won: didWin,
    });

    if (saved?.player) {
      resultStats.classList.remove("hidden");
      resultStats.textContent = `${saved.player.name}: ${formatWinRate(saved.player)} win rate`;
    }
  }

  function resetState() {
    mines = new Set();
    revealed = new Set();
    flagged = new Set();
    counts = [];
    gameOver = false;
    won = false;
    firstClick = true;
    flagsPlaced = 0;
  }

  return {
    start({ difficulty, playerX }) {
      const config = DIFFICULTIES[difficulty];
      difficultyKey = difficulty;
      size = config.size;
      mineCount = config.mines;
      playerName = playerX;

      resetState();
      scoreBar.classList.remove("hidden");
      modeBadge.textContent = `Minesweeper · ${config.label}`;
      playersBar.innerHTML = `<span>${escapeHtml(playerName)}</span>`;
      resultEl.classList.add("hidden");
      resultStats.classList.add("hidden");

      initBoard();
      updateHud();
      renderCells();
    },

    restart() {
      resetState();
      resultEl.classList.add("hidden");
      resultStats.classList.add("hidden");
      initBoard();
      updateHud();
      renderCells();
    },

    destroy() {
      appRoot?.classList.remove("app-wide");
    },
  };
}
