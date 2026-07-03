const COLS = 7;
const ROWS = 6;
const RED = "R";
const YELLOW = "Y";
const CENTER_ORDER = [3, 2, 4, 1, 5, 0, 6];

function idx(r, c) {
  return r * COLS + c;
}

function opponent(p) {
  return p === RED ? YELLOW : RED;
}

function emptyBoard() {
  return Array(ROWS * COLS).fill(null);
}

function validCols(board) {
  const cols = [];
  for (let c = 0; c < COLS; c++) {
    if (board[idx(0, c)] === null) cols.push(c);
  }
  return cols;
}

function orderedCols(cols) {
  return CENTER_ORDER.filter((c) => cols.includes(c));
}

// Drops a disc, returning a new board plus the landed row (columns are
// dropped from the bottom up, so we scan from the last row upward).
function dropDisc(board, col, player) {
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[idx(r, col)] === null) {
      const next = board.slice();
      next[idx(r, col)] = player;
      return { board: next, row: r };
    }
  }
  return null;
}

const DIRECTIONS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

// Checks whether the disc just placed at (r, c) completes a 4-in-a-row,
// and if so returns the four winning cell indices; otherwise null.
function winningLineAt(board, r, c, player) {
  for (const [dr, dc] of DIRECTIONS) {
    const line = [idx(r, c)];
    let rr = r + dr;
    let cc = c + dc;
    while (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && board[idx(rr, cc)] === player) {
      line.push(idx(rr, cc));
      rr += dr;
      cc += dc;
    }
    rr = r - dr;
    cc = c - dc;
    while (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && board[idx(rr, cc)] === player) {
      line.push(idx(rr, cc));
      rr -= dr;
      cc -= dc;
    }
    if (line.length >= 4) return line;
  }
  return null;
}

// All 69 four-cell windows on the board (horizontal, vertical, both
// diagonals) — precomputed once since the board size never changes.
const WINDOWS = (() => {
  const windows = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c <= COLS - 4; c++) {
      windows.push([idx(r, c), idx(r, c + 1), idx(r, c + 2), idx(r, c + 3)]);
    }
  }
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r <= ROWS - 4; r++) {
      windows.push([idx(r, c), idx(r + 1, c), idx(r + 2, c), idx(r + 3, c)]);
    }
  }
  for (let r = 0; r <= ROWS - 4; r++) {
    for (let c = 0; c <= COLS - 4; c++) {
      windows.push([idx(r, c), idx(r + 1, c + 1), idx(r + 2, c + 2), idx(r + 3, c + 3)]);
    }
  }
  for (let r = 0; r <= ROWS - 4; r++) {
    for (let c = COLS - 1; c >= 3; c--) {
      windows.push([idx(r, c), idx(r + 1, c - 1), idx(r + 2, c - 2), idx(r + 3, c - 3)]);
    }
  }
  return windows;
})();

// Heuristic for non-terminal positions: score every open window by how
// close each side is to completing it, weighted so blocking a 3-in-a-row
// threat outweighs building your own, plus a small centre-column bonus
// (the centre column participates in the most winning lines).
function evaluate(board, ai, human) {
  let score = 0;
  for (const w of WINDOWS) {
    let aiCount = 0;
    let humanCount = 0;
    for (const i of w) {
      if (board[i] === ai) aiCount++;
      else if (board[i] === human) humanCount++;
    }
    if (aiCount && humanCount) continue;
    const empty = 4 - aiCount - humanCount;
    if (aiCount === 3 && empty === 1) score += 50;
    else if (aiCount === 2 && empty === 2) score += 10;
    else if (aiCount === 1 && empty === 3) score += 1;
    if (humanCount === 3 && empty === 1) score -= 80;
    else if (humanCount === 2 && empty === 2) score -= 12;
  }
  for (let r = 0; r < ROWS; r++) {
    const v = board[idx(r, 3)];
    if (v === ai) score += 3;
    else if (v === human) score -= 3;
  }
  return score;
}

function countEmpty(board) {
  let n = 0;
  for (const v of board) if (v === null) n++;
  return n;
}

// Deeper search as the board empties out; solve to the end once few
// columns remain so the AI never misses a forced win or loss.
function searchDepth(board) {
  const empties = countEmpty(board);
  if (empties <= 8) return empties;
  if (empties <= 16) return 8;
  return 6;
}

function search(board, depth, alpha, beta, isMax, ai, human, lastRow, lastCol, lastPlayer) {
  if (lastPlayer !== null && winningLineAt(board, lastRow, lastCol, lastPlayer)) {
    return lastPlayer === ai ? 1e6 + depth : -1e6 - depth;
  }

  const cols = validCols(board);
  if (depth === 0 || !cols.length) {
    return cols.length ? evaluate(board, ai, human) : 0;
  }

  const player = isMax ? ai : human;
  let best = isMax ? -Infinity : Infinity;
  for (const c of orderedCols(cols)) {
    const { board: next, row } = dropDisc(board, c, player);
    const val = search(next, depth - 1, alpha, beta, !isMax, ai, human, row, c, player);
    if (isMax) {
      best = Math.max(best, val);
      alpha = Math.max(alpha, best);
    } else {
      best = Math.min(best, val);
      beta = Math.min(beta, best);
    }
    if (beta <= alpha) break;
  }
  return best;
}

function chooseMove(board, ai, human, level) {
  const cols = validCols(board);
  if (!cols.length) return null;

  if (level === "easy") {
    return cols[Math.floor(Math.random() * cols.length)];
  }

  const depth = level === "hard" ? searchDepth(board) : 4;
  let bestCol = cols[0];
  let bestScore = -Infinity;
  for (const c of orderedCols(cols)) {
    const { board: next, row } = dropDisc(board, c, ai);
    const score = search(next, depth - 1, -Infinity, Infinity, false, ai, human, row, c, ai);
    if (score > bestScore) {
      bestScore = score;
      bestCol = c;
    }
  }
  return bestCol;
}

export function createConnectFour(ctx) {
  const { boardEl, turnIndicator, modeBadge, playersBar, resultEl, resultText, resultStats, escapeHtml, persistGame, formatWinRate } = ctx;

  let mode = null;
  let board = emptyBoard();
  let current = RED;
  let gameOver = false;
  let humanColor = RED;
  let computerColor = YELLOW;
  let aiLevel = "normal";
  let humanName = "";
  let playerRedName = "";
  let playerYellowName = "";

  const DISC = { [RED]: "🔴", [YELLOW]: "🟡" };
  const LEVEL_LABELS = { easy: "簡單", normal: "普通", hard: "困難" };

  function renderCells(winLine) {
    const cells = boardEl.querySelectorAll(".cell-c4");
    const winSet = new Set(winLine || []);
    cells.forEach((cell, i) => {
      cell.classList.remove("disc-red", "disc-yellow", "winning");
      if (board[i] === RED) cell.classList.add("disc-red");
      else if (board[i] === YELLOW) cell.classList.add("disc-yellow");
      if (winSet.has(i)) cell.classList.add("winning");
    });

    const cols = new Set(validCols(board));
    const disableAll = gameOver || (mode === "pvc" && current !== humanColor);
    boardEl.querySelectorAll(".c4-col").forEach((col, c) => {
      col.disabled = disableAll || !cols.has(c);
    });
  }

  function initBoard() {
    boardEl.className = "board board-c4";
    boardEl.innerHTML = "";
    for (let c = 0; c < COLS; c++) {
      const col = document.createElement("button");
      col.className = "c4-col";
      col.dataset.col = c;
      col.setAttribute("aria-label", `Drop in column ${c + 1}`);
      col.addEventListener("click", () => handleColumnClick(c));
      boardEl.appendChild(col);
    }
    for (let i = 0; i < ROWS * COLS; i++) {
      const cell = document.createElement("div");
      cell.className = "cell-c4";
      boardEl.appendChild(cell);
    }
    renderCells();
  }

  function updateUI() {
    renderCells();
    if (gameOver) return;

    const name = current === RED ? playerRedName : playerYellowName;
    if (mode === "pvp") {
      turnIndicator.innerHTML = `${escapeHtml(name)}'s turn (${DISC[current]})`;
      boardEl.classList.remove("thinking");
    } else {
      const isHuman = current === humanColor;
      turnIndicator.textContent = isHuman ? "Your turn" : "Computer thinking…";
      boardEl.classList.toggle("thinking", !isHuman);
    }
  }

  async function endGame(winner, line) {
    gameOver = true;

    let winnerMark;
    if (mode === "pvp") {
      winnerMark = winner === null ? null : winner === RED ? "X" : "O";
      if (winnerMark === null) {
        resultText.textContent = "It's a draw!";
      } else {
        resultText.textContent = `${winner === RED ? playerRedName : playerYellowName} wins!`;
      }
    } else {
      winnerMark = winner === null ? null : winner === humanColor ? "X" : "O";
      if (winnerMark === null) {
        resultText.textContent = "It's a draw!";
      } else if (winnerMark === "X") {
        resultText.textContent = "You win!";
      } else {
        resultText.textContent = "Computer wins!";
      }
    }

    renderCells(line);
    resultEl.classList.remove("hidden");
    updateUI();

    const saved = await persistGame({
      mode,
      playerXName: mode === "pvp" ? playerRedName : humanName,
      playerOName: playerYellowName,
      winner: winnerMark,
    });

    if (saved) {
      resultStats.classList.remove("hidden");
      if (mode === "pvp") {
        resultStats.textContent = `${playerRedName}: ${formatWinRate(saved.playerX)} · ${playerYellowName}: ${formatWinRate(saved.playerO)}`;
      } else if (saved.player) {
        resultStats.textContent = `${saved.player.name}: ${formatWinRate(saved.player)} win rate`;
      }
    }
  }

  function playColumn(col, player) {
    const result = dropDisc(board, col, player);
    if (!result) return;
    board = result.board;

    const line = winningLineAt(board, result.row, col, player);
    if (line) {
      endGame(player, line);
      return;
    }
    if (!validCols(board).length) {
      endGame(null, null);
      return;
    }

    current = opponent(player);
    updateUI();

    if (mode === "pvc" && current === computerColor) {
      setTimeout(computerMove, 400);
    }
  }

  function handleColumnClick(col) {
    if (gameOver) return;
    if (mode === "pvc" && current !== humanColor) return;
    if (!validCols(board).includes(col)) return;
    playColumn(col, current);
  }

  function computerMove() {
    if (gameOver) return;
    const col = chooseMove(board, computerColor, humanColor, aiLevel);
    if (col !== null) playColumn(col, computerColor);
  }

  function renderDifficultyScreen() {
    boardEl.className = "board board-bs-outer";
    boardEl.innerHTML = `
      <div class="bs-cover">
        <div class="bs-cover-eyebrow">選擇電腦難度</div>
        <button class="btn btn-secondary bs-diff-btn" data-level="easy">
          😊 簡單<span class="bs-diff-desc">隨機落子</span>
        </button>
        <button class="btn btn-secondary bs-diff-btn" data-level="normal">
          🤔 普通<span class="bs-diff-desc">標準 AI · 預測 4 步</span>
        </button>
        <button class="btn btn-primary bs-diff-btn" data-level="hard">
          🧠 困難<span class="bs-diff-desc">威脅評估＋殘局精算 · 6 步以上</span>
        </button>
      </div>
    `;
    turnIndicator.textContent = "";
    boardEl.querySelectorAll(".bs-diff-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        aiLevel = btn.dataset.level;
        beginGame();
      });
    });
  }

  function beginGame() {
    board = emptyBoard();
    current = RED;
    gameOver = false;

    if (mode === "pvc") {
      humanColor = RED;
      computerColor = YELLOW;
      playerRedName = humanName;
      playerYellowName = "Computer";
    }

    modeBadge.textContent = mode === "pvp" ? "四子棋 · PvP" : "四子棋 · vs CPU";
    resultEl.classList.add("hidden");
    resultStats.classList.add("hidden");
    boardEl.classList.remove("thinking");

    if (mode === "pvp") {
      playersBar.innerHTML = `<span class="mark-x">${escapeHtml(playerRedName)}</span> (🔴) vs <span class="mark-o">${escapeHtml(playerYellowName)}</span> (🟡)`;
    } else {
      playersBar.innerHTML = `<span class="mark-x">${escapeHtml(humanName)}</span> (you, ${DISC[humanColor]}) vs <span class="mark-o">Computer</span> (${DISC[computerColor]}) · ${LEVEL_LABELS[aiLevel]}`;
    }

    initBoard();
    updateUI();
  }

  return {
    start({ mode: m, playerX, playerO }) {
      mode = m;
      humanName = playerX;

      modeBadge.textContent = mode === "pvp" ? "四子棋 · PvP" : "四子棋 · vs CPU";
      resultEl.classList.add("hidden");
      resultStats.classList.add("hidden");
      boardEl.classList.remove("thinking");

      if (mode === "pvp") {
        playerRedName = playerX;
        playerYellowName = playerO;
        beginGame();
      } else {
        playersBar.innerHTML = "";
        renderDifficultyScreen();
      }
    },

    restart() {
      // Keep the chosen difficulty (if any) and jump straight back in.
      beginGame();
    },
  };
}
